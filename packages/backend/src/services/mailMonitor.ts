/**
 * Mail Monitor Service
 *
 * Automatically scans a dedicated safety mailbox via IMAP, runs all new emails
 * through Claude AE detection, and persists events to the database — zero human
 * involvement required for initial triage.
 *
 * Uses IMAP IDLE (RFC 2177) for real-time push notification of new emails.
 * Falls back to polling every 5 minutes if IDLE is not supported by the server.
 * Auto-reconnects on connection drop with exponential back-off.
 *
 * ─── Configuration (environment variables) ────────────────────────────────
 *   MONITOR_EMAIL_HOST      IMAP hostname
 *                           Outlook/Office365: outlook.office365.com
 *                           Gmail:             imap.gmail.com
 *   MONITOR_EMAIL_PORT      IMAP port (default: 993)
 *   MONITOR_EMAIL_USER      Mailbox email address
 *   MONITOR_EMAIL_PASS      Password or app-password
 *                           Outlook 2FA: Microsoft account → Security → App passwords
 *                           Gmail 2FA:   Google account → Security → App passwords
 *   MONITOR_EMAIL_MAILBOX   Folder to monitor (default: INBOX)
 *   MONITOR_EMAIL_TLS       Use TLS (default: true — always use for port 993)
 * ──────────────────────────────────────────────────────────────────────────
 */

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { AnalyzeRequest } from '@narc/shared';
import { analyzeEmail, prescreenEmail } from './claude';
import { getActivePolicy, calibrateConfidence } from './policy';
import { computeDeadline, computeSlaStatus } from './sla';
import { withTransaction } from '../db/pool';
import { insertEvent, getEventByEmailId } from '../db/queries/events';
import { insertFinding } from '../db/queries/findings';
import { lookupMonograph, buildMonographContext } from './monograph';
import { sendAEAlert } from './alertService';

const MODEL_VERSION = 'claude-opus-4-6';
const SEVERITY_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

// ─── Monitor state (singleton) ─────────────────────────────────────────────

export interface MonitorStatus {
  enabled: boolean;
  connected: boolean;
  host: string | null;
  user: string | null;
  mailbox: string;
  lastChecked: string | null;
  processedTotal: number;      // emails analyzed (AE or not)
  aeDetectedTotal: number;     // emails that had ≥1 AE
  errorCount: number;
  lastError: string | null;
  startedAt: string | null;
  reconnectCount: number;
}

const _state: MonitorStatus = {
  enabled: false,
  connected: false,
  host: process.env.MONITOR_EMAIL_HOST ?? null,
  user: process.env.MONITOR_EMAIL_USER ?? null,
  mailbox: process.env.MONITOR_EMAIL_MAILBOX ?? 'INBOX',
  lastChecked: null,
  processedTotal: 0,
  aeDetectedTotal: 0,
  errorCount: 0,
  lastError: null,
  startedAt: null,
  reconnectCount: 0,
};

export function getMonitorStatus(): MonitorStatus {
  return { ..._state };
}

// ─── Core email processor ──────────────────────────────────────────────────

/**
 * Parse a raw email buffer, run it through Claude, persist any AEs, send alerts.
 */
async function processRawEmail(rawBuffer: Buffer, uid: number): Promise<void> {
  const parsed = await simpleParser(rawBuffer);

  const subject = parsed.subject?.trim() ?? '(no subject)';
  const fromAddr = Array.isArray(parsed.from?.value) ? parsed.from!.value[0] : null;
  const sender = fromAddr
    ? `${fromAddr.name ? fromAddr.name + ' ' : ''}<${fromAddr.address ?? ''}>`.trim()
    : '(unknown sender)';
  const receivedAt = (parsed.date ?? new Date()).toISOString();

  // Prefer plain text; strip HTML tags as fallback
  // parsed.html is typed as string | false by mailparser — guard before calling .replace()
  const htmlText = typeof parsed.html === 'string'
    ? parsed.html.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
    : '';
  const body = parsed.text?.trim() || htmlText || '';

  // Use Message-ID as stable dedup key, fall back to UID-based hash
  const messageId = parsed.messageId?.trim() ||
    `imap-uid-${uid}-${Buffer.from(body.slice(0, 100)).toString('base64').slice(0, 12)}`;

  if (!body) {
    console.log(`[monitor] Skipping UID ${uid} — empty body`);
    _state.processedTotal++;
    return;
  }

  // Deduplication — if this Message-ID has already been processed, skip
  const existing = await getEventByEmailId(messageId);
  if (existing) {
    console.log(`[monitor] Skipping UID ${uid} — already processed (event ${existing.event.id})`);
    return;
  }

  // ── Pre-screener gate ──────────────────────────────────────────────────────
  const ps = await prescreenEmail(subject, body, sender);
  if (!ps.isAERelated) {
    console.log(`[monitor] Pre-screener filtered UID ${uid} — "${ps.reason}"`);
    _state.processedTotal++;
    _state.lastChecked = new Date().toISOString();
    return; // mark as seen below, skip full Opus analysis
  }

  console.log(`[monitor] 🔍 Analyzing UID ${uid}: "${subject}" from ${sender}`);

  const analyzeReq: AnalyzeRequest = {
    subject,
    sender,
    emailBody: body,
    receivedAt,
    emailId: messageId,
  };

  // Load policy + monograph context (same pipeline as the HTTP /analyze route)
  const policy = await getActivePolicy();
  const monograph = await lookupMonograph([subject, body].join(' '), undefined);
  const monographContext = monograph ? buildMonographContext(monograph) : null;

  const aiResponse = await analyzeEmail(analyzeReq, policy, monographContext);

  _state.processedTotal++;
  _state.lastChecked = new Date().toISOString();

  if (!aiResponse.hasAEs || aiResponse.findings.length === 0) {
    console.log(`[monitor] UID ${uid} — no AEs found`);
    return;
  }

  // Compute max severity + SLA
  const maxSeverity = aiResponse.findings.reduce<string>((max, f) => {
    return (SEVERITY_ORDER[f.severity] ?? 0) > (SEVERITY_ORDER[max] ?? 0) ? f.severity : max;
  }, 'low');

  const detectedAt = new Date();
  const deadlineAt = computeDeadline(maxSeverity, detectedAt);
  const slaResult = computeSlaStatus(detectedAt, deadlineAt, false);

  // Calibrate each finding against active policy rules
  const calibrated = aiResponse.findings.map((finding) => {
    const rule = policy?.rules.find(
      (r) =>
        r.is_enabled &&
        r.category === finding.category &&
        r.keywords.some((kw) => finding.excerpt.toLowerCase().includes(kw.toLowerCase()))
    );
    const rawConfidence = finding.confidence;
    const calibratedConfidence = rule ? calibrateConfidence(rawConfidence, rule) : rawConfidence;
    const severity = (rule?.severity_override as string | undefined) ?? finding.severity;
    return { finding, rawConfidence, calibratedConfidence, severity, rule };
  });

  // ── Confidence threshold gating (post-calibration) ────────────────────────
  const thresholdFiltered = calibrated.filter(({ calibratedConfidence, rule }) => {
    const minConf = (rule as { min_confidence?: number | null } | undefined)?.min_confidence ?? null;
    return minConf == null || calibratedConfidence >= minConf;
  });

  if (thresholdFiltered.length === 0 && calibrated.length > 0) {
    console.log(`[monitor] UID ${uid} — all ${calibrated.length} finding(s) below min_confidence floor, skipping`);
    _state.processedTotal++;
    _state.lastChecked = new Date().toISOString();
    return;
  }

  // Persist event + findings in one transaction
  const eventId = await withTransaction(async (client) => {
    const id = await insertEvent(
      {
        email_id: messageId,
        subject,
        sender,
        received_at: receivedAt,
        body_excerpt: body.slice(0, 500),
        ae_count: thresholdFiltered.length,
        max_severity: maxSeverity,
        status: 'pending',
        notes: '',
        raw_request: analyzeReq as object,
        raw_response: aiResponse as object,
        detected_at: detectedAt.toISOString(),
        deadline_at: deadlineAt.toISOString(),
        sla_status: slaResult.sla_status,
        escalation_level: slaResult.escalation_level,
        policy_version_id: policy?.id ?? null,
        agent_id: null,       // auto-detected, not agent-submitted
        model_version: MODEL_VERSION,
      },
      client
    );

    for (const { finding, rawConfidence, calibratedConfidence, severity } of thresholdFiltered) {
      await insertFinding(
        {
          event_id: id,
          excerpt: finding.excerpt,
          category: finding.category,
          severity,
          explanation: finding.explanation,
          urgency: finding.urgency,
          confidence: calibratedConfidence,
          status: 'pending',
          model_version: MODEL_VERSION,
          highlight_spans: finding.highlight_spans ?? null,
          raw_confidence: rawConfidence,
          calibrated_confidence: calibratedConfidence,
        },
        client
      );
    }

    return id;
  });

  _state.aeDetectedTotal++;

  console.log(
    `[monitor] ✅ Event ${eventId} created — ${thresholdFiltered.length} AE(s), severity: ${maxSeverity}, deadline: ${deadlineAt.toISOString()}`
  );

  // Send immediate email alert for critical / high severity
  if (maxSeverity === 'critical' || maxSeverity === 'high') {
    await sendAEAlert({
      eventId,
      subject,
      sender,
      maxSeverity,
      aeCount: thresholdFiltered.length,
      detectedAt: detectedAt.toISOString(),
      deadlineAt: deadlineAt.toISOString(),
      summary: aiResponse.summary,
      source: 'inbox_monitor',
      findings: thresholdFiltered.map(({ finding, severity }) => ({
        category: finding.category,
        severity,
        excerpt: finding.excerpt,
        explanation: finding.explanation,
        urgency: finding.urgency,
      })),
    });
  }
}

// ─── Unseen message sweep ──────────────────────────────────────────────────

async function processUnseenMessages(client: ImapFlow): Promise<void> {
  const uids: number[] = [];

  // Search for both unseen messages AND any seen messages received in the last 24h
  // that haven't been processed yet (handles the case where Outlook marks them read first).
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const unseenUids: number[] = [];
  const recentUids: number[] = [];

  for await (const msg of client.fetch({ seen: false }, { uid: true })) {
    unseenUids.push(msg.uid);
  }
  for await (const msg of client.fetch({ since }, { uid: true, envelope: true })) {
    // Only include recently-seen messages not already in unseen list
    if (!unseenUids.includes(msg.uid)) recentUids.push(msg.uid);
  }

  // Merge, deduplicate, filter out already-processed message IDs
  uids.push(...unseenUids, ...recentUids);

  if (uids.length === 0) return;

  console.log(`[monitor] Found ${unseenUids.length} unseen + ${recentUids.length} recent-seen message(s) — processing…`);

  for (const uid of uids) {
    try {
      // Fetch full message source
      const msgs: Buffer[] = [];
      for await (const msg of client.fetch({ uid }, { source: true })) {
        if (msg.source) msgs.push(msg.source);
      }
      if (msgs[0]) {
        await processRawEmail(msgs[0], uid);
      }
      // Mark as seen regardless of whether AEs were found — prevents re-processing
      await client.messageFlagsAdd({ uid }, ['\\Seen']);
    } catch (err) {
      _state.errorCount++;
      _state.lastError = err instanceof Error ? err.message : String(err);
      console.error(`[monitor] Error processing UID ${uid}:`, _state.lastError);
      // Don't rethrow — continue with remaining messages
    }
  }
}

// ─── IMAP session ─────────────────────────────────────────────────────────

async function runImapSession(): Promise<void> {
  const client = new ImapFlow({
    host: process.env.MONITOR_EMAIL_HOST!,
    port: parseInt(process.env.MONITOR_EMAIL_PORT ?? '993', 10),
    auth: {
      user: process.env.MONITOR_EMAIL_USER!,
      pass: process.env.MONITOR_EMAIL_PASS!,
    },
    secure: (process.env.MONITOR_EMAIL_TLS ?? 'true') !== 'false',
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  client.on('error', (err: Error) => {
    _state.connected = false;
    _state.lastError = err.message;
    console.error('[monitor] IMAP error:', err.message);
  });

  await client.connect();
  _state.connected = true;
  _state.lastError = null;
  console.log(`[monitor] Connected to ${process.env.MONITOR_EMAIL_HOST} as ${process.env.MONITOR_EMAIL_USER}`);

  await client.mailboxOpen(_state.mailbox);
  console.log(`[monitor] Opened mailbox: ${_state.mailbox}`);

  // Process any unseen emails that arrived before we connected
  await processUnseenMessages(client);
  _state.lastChecked = new Date().toISOString();

  // Enter IMAP IDLE — the server will push a wakeup when new mail arrives.
  // imapflow's idle() resolves when the server sends EXISTS (new mail) or on timeout (~29 min).
  console.log('[monitor] Entering IDLE — waiting for new mail (real-time)…');
  while (_state.enabled) {
    await client.idle();
    _state.lastChecked = new Date().toISOString();
    if (!_state.enabled) break;
    console.log('[monitor] IDLE woken — checking for new messages…');
    await processUnseenMessages(client);
  }

  await client.logout();
  _state.connected = false;
  console.log('[monitor] Disconnected from IMAP server');
}

// ─── Auto-reconnect loop ───────────────────────────────────────────────────

async function reconnectLoop(): Promise<void> {
  // Exponential back-off: 5s → 10s → 20s → ... → max 5 minutes
  let delay = 5_000;
  const MAX_DELAY = 5 * 60_000;

  while (_state.enabled) {
    try {
      await runImapSession();
      // If we reach here cleanly (enabled turned false), stop
    } catch (err) {
      _state.connected = false;
      _state.errorCount++;
      _state.reconnectCount++;
      _state.lastError = err instanceof Error ? err.message : String(err);
      const fullErr = err instanceof Error ? (err.stack ?? err.message) : String(err);
      console.error(`[monitor] Session error — reconnecting in ${delay / 1000}s:`, fullErr);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, MAX_DELAY);
    }
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Start the mail monitor in the background.
 * Exits immediately if MONITOR_EMAIL_HOST/USER/PASS are not set.
 * Call once from the main server startup.
 */
export function startMailMonitor(): void {
  const host = process.env.MONITOR_EMAIL_HOST;
  const user = process.env.MONITOR_EMAIL_USER;
  const pass = process.env.MONITOR_EMAIL_PASS;

  if (!host || !user || !pass) {
    console.log(
      '[monitor] Auto-scan DISABLED — add MONITOR_EMAIL_HOST + MONITOR_EMAIL_USER + MONITOR_EMAIL_PASS to .env to enable'
    );
    return;
  }

  _state.enabled = true;
  _state.startedAt = new Date().toISOString();
  _state.host = host;
  _state.user = user;

  console.log(`[monitor] Starting auto-scan for ${user}@${host} (mailbox: ${_state.mailbox})`);

  // Fire-and-forget — runs in background alongside the HTTP server
  reconnectLoop().catch((err) => {
    console.error('[monitor] Fatal error in reconnect loop:', err);
    _state.enabled = false;
  });
}

/**
 * Stop the monitor gracefully.
 */
export function stopMailMonitor(): void {
  _state.enabled = false;
  console.log('[monitor] Auto-scan stopping…');
}
