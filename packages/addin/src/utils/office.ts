export interface EmailContext {
  itemId: string;
  subject: string;
  sender: string;
  receivedAt: string;
  body: string;
}

export interface InboxMessage {
  id: string;
  subject: string;
  from: string;
  receivedAt: string;
  bodyPreview: string;
  body: string;          // plain-text body (for AE analysis)
  isRead: boolean;
  hasAttachments: boolean;
}

/**
 * Read the current email's context from the Outlook mailbox.
 * Uses Office.js async API — wraps it in a Promise for easier consumption.
 *
 * NOTE: In reading pane mode (FormType="Read"), we have ReadWriteMailbox permission.
 * - body.getAsync() works ✅
 * - We use Outlook REST API for inbox enumeration (requires ReadWriteMailbox).
 * All AE highlights are rendered in our task pane UI (no injection into email body).
 */
export function getEmailContext(): Promise<EmailContext> {
  return new Promise((resolve, reject) => {
    const item = Office.context.mailbox.item;

    if (!item) {
      reject(new Error('No email item is currently selected.'));
      return;
    }

    // Read the body as plain text (CoercionType.Text strips HTML tags)
    item.body.getAsync(Office.CoercionType.Text, {}, (result) => {
      if (result.status === Office.AsyncResultStatus.Failed) {
        reject(new Error(`Failed to read email body: ${result.error?.message ?? 'unknown error'}`));
        return;
      }

      resolve({
        itemId: (item as Office.MessageRead).itemId ?? `generated-${Date.now()}`,
        subject: (item as Office.MessageRead).subject ?? '',
        sender: (item as Office.MessageRead).from?.emailAddress ?? '',
        receivedAt:
          (item as Office.MessageRead).dateTimeCreated?.toISOString() ?? new Date().toISOString(),
        body: result.value,
      });
    });
  });
}

/**
 * Get a REST API callback token for the current user.
 * Requires ReadWriteMailbox permission in the manifest.
 */
/**
 * REST token cache — tokens last ~1 hour; we cache for 50 min.
 * Eliminates the cold-start failure that hits on first call in the new Outlook.
 */
let _tokenCache: { token: string; expiry: number } | null = null;

/**
 * Get a REST token, with caching + retry (up to maxAttempts, linear back-off 1s/2s/3s…).
 */
function getRestToken(maxAttempts = 4): Promise<string> {
  // Serve from cache if still valid
  if (_tokenCache && Date.now() < _tokenCache.expiry) {
    return Promise.resolve(_tokenCache.token);
  }

  const attempt = (n: number): Promise<string> =>
    new Promise((resolve, reject) => {
      Office.context.mailbox.getCallbackTokenAsync({ isRest: true }, (result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
          // Cache for 50 minutes
          _tokenCache = { token: result.value, expiry: Date.now() + 50 * 60 * 1000 };
          resolve(result.value);
        } else if (n < maxAttempts) {
          // Linear back-off: 1 s, 2 s, 3 s …
          setTimeout(() => attempt(n + 1).then(resolve).catch(reject), 1000 * n);
        } else {
          reject(new Error(`Could not get REST token: ${result.error?.message ?? 'unknown'}`));
        }
      });
    });
  return attempt(1);
}

/**
 * Pre-warm the REST token cache on add-in startup.
 * Outlook's first token call frequently fails; doing it early in the background
 * ensures the token is ready before the user triggers inbox scan.
 * Fails silently.
 */
export function warmUpRestToken(): void {
  getRestToken().catch(() => { /* silent — retried on demand */ });
}

/**
 * Fetch recent inbox messages (last N) using the Outlook REST API.
 * Returns lightweight message objects including plain-text body for AE analysis.
 *
 * Requires ReadWriteMailbox manifest permission + Mailbox 1.5 requirement set.
 */
export async function fetchInboxMessages(count = 30): Promise<InboxMessage[]> {
  const token = await getRestToken();
  const baseUrl = Office.context.mailbox.restUrl;

  // Fetch messages: select fields we need, order by most recent, include plain-text body
  const url =
    `${baseUrl}/v2.0/me/mailfolders/inbox/messages` +
    `?$top=${count}` +
    `&$select=Id,Subject,From,ReceivedDateTime,BodyPreview,IsRead,Body,HasAttachments` +
    `&$orderby=ReceivedDateTime desc`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      // Request plain-text body (not HTML) so it's clean for Claude
      Prefer: 'outlook.body-content-type="text"',
    },
  });

  if (!response.ok) {
    throw new Error(`REST API error ${response.status}: ${response.statusText}`);
  }

  const data = await response.json() as {
    value: Array<{
      Id: string;
      Subject: string;
      From: { EmailAddress: { Address: string; Name: string } };
      ReceivedDateTime: string;
      BodyPreview: string;
      IsRead: boolean;
      HasAttachments: boolean;
      Body: { ContentType: string; Content: string };
    }>;
  };

  return data.value.map((msg) => ({
    id: msg.Id,
    subject: msg.Subject ?? '(no subject)',
    from: msg.From?.EmailAddress?.Address ?? '',
    receivedAt: msg.ReceivedDateTime,
    bodyPreview: msg.BodyPreview ?? '',
    body: msg.Body?.Content ?? msg.BodyPreview ?? '',
    isRead: msg.IsRead,
    hasAttachments: msg.HasAttachments ?? false,
  }));
}

/**
 * Fetch the list of attachment names for a given message ID.
 * Used to populate the AttachmentBadge tooltip on inbox rows.
 */
export async function listAttachmentNames(messageId: string): Promise<string[]> {
  try {
    const token = await getRestToken();
    const baseUrl = Office.context.mailbox.restUrl;
    const url = `${baseUrl}/v2.0/me/messages/${messageId}/attachments?$select=Name,ContentType`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) return [];

    const data = await response.json() as { value: Array<{ Name: string; ContentType: string }> };
    return (data.value ?? []).map((a) => a.Name);
  } catch {
    return [];
  }
}

/**
 * Fetch a single attachment's content (base64) from a message.
 * Uses the Outlook REST API v2.0 endpoint.
 * Returns base64-encoded content bytes, content type, and file name.
 */
export async function fetchAttachmentContent(
  messageId: string,
  attachmentId: string
): Promise<{ name: string; contentBytes: string; contentType: string }> {
  const token = await getRestToken();
  const baseUrl = Office.context.mailbox.restUrl;
  const url = `${baseUrl}/v2.0/me/messages/${messageId}/attachments/${attachmentId}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch attachment: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    Name: string;
    ContentBytes: string;   // base64
    ContentType: string;
  };

  return {
    name: data.Name,
    contentBytes: data.ContentBytes,
    contentType: data.ContentType,
  };
}

// ─── Outlook Category Flagging ────────────────────────────────────────────────

/**
 * NARC severity → Outlook category name and colour preset.
 * Colours appear as coloured dots/bars on emails in the inbox list.
 */
export const NARC_CATEGORIES = {
  critical: { name: 'NARC: Critical AE',        color: 'preset0' }, // Red
  high:     { name: 'NARC: High Severity AE',    color: 'preset0' }, // Red
  medium:   { name: 'NARC: Medium Severity AE',  color: 'preset1' }, // Orange
  low:      { name: 'NARC: Low Severity AE',     color: 'preset3' }, // Yellow
} as const;

/**
 * Ensure NARC master categories exist in the user's Outlook mailbox.
 * Call once after auth. Fails silently — this is a cosmetic feature.
 */
export async function ensureNarcCategories(): Promise<void> {
  try {
    const token = await getRestToken();
    const baseUrl = Office.context.mailbox.restUrl;

    const res = await fetch(`${baseUrl}/v2.0/me/outlook/masterCategories`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;

    const data = await res.json() as { value: Array<{ DisplayName: string }> };
    const existing = new Set(data.value.map((c) => c.DisplayName));

    await Promise.all(
      Object.values(NARC_CATEGORIES).map(({ name, color }) => {
        if (existing.has(name)) return Promise.resolve();
        return fetch(`${baseUrl}/v2.0/me/outlook/masterCategories`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ DisplayName: name, Color: color }),
        });
      })
    );
  } catch {
    // Category setup is cosmetic — never crash the add-in
  }
}

/**
 * Apply a NARC AE severity category to a message (REST API ID).
 * Adds a coloured label visible in the Outlook inbox list.
 * Fails silently.
 */
export async function applyAECategoryToMessage(
  restMessageId: string,
  severity: keyof typeof NARC_CATEGORIES
): Promise<void> {
  try {
    const token = await getRestToken();
    const baseUrl = Office.context.mailbox.restUrl;
    const categoryName = NARC_CATEGORIES[severity].name;

    await fetch(`${baseUrl}/v2.0/me/messages/${restMessageId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ Categories: [categoryName] }),
    });
  } catch {
    // Cosmetic — never fail the analysis
  }
}

/**
 * Convert an EWS item ID (from Office.js) to an Outlook REST API v2.0 ID.
 * Required when applying categories to the currently open email.
 */
export function convertToRestId(ewsId: string): string {
  return Office.context.mailbox.convertToRestId(
    ewsId,
    Office.MailboxEnums.RestVersion.v2_0
  );
}
