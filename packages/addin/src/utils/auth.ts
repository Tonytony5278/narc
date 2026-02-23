/**
 * JWT token storage for the Outlook add-in.
 * Uses Office.context.roamingSettings so the token follows the user
 * across devices where Outlook is signed in.
 *
 * Falls back to a plain in-memory store when roamingSettings is unavailable
 * (e.g. in tests or when Office isn't loaded yet).
 */

const TOKEN_KEY = 'narc_jwt';
const USER_KEY  = 'narc_user';

// In-memory fallback (used when Office roamingSettings is unavailable)
let _memToken: string | null = null;
let _memUser: string | null = null;

function isOfficeReady(): boolean {
  return typeof Office !== 'undefined' && !!Office.context?.roamingSettings;
}

export interface AddinUser {
  id: string;
  email: string;
  role: string;
}

// ─── Token ────────────────────────────────────────────────────────────────────

export function getToken(): string | null {
  if (isOfficeReady()) {
    return (Office.context.roamingSettings.get(TOKEN_KEY) as string | undefined) ?? null;
  }
  return _memToken;
}

export function setToken(token: string): void {
  if (isOfficeReady()) {
    Office.context.roamingSettings.set(TOKEN_KEY, token);
    Office.context.roamingSettings.saveAsync();
  } else {
    _memToken = token;
  }
}

export function clearToken(): void {
  if (isOfficeReady()) {
    Office.context.roamingSettings.remove(TOKEN_KEY);
    Office.context.roamingSettings.remove(USER_KEY);
    Office.context.roamingSettings.saveAsync();
  } else {
    _memToken = null;
    _memUser = null;
  }
}

// ─── User ─────────────────────────────────────────────────────────────────────

export function getUser(): AddinUser | null {
  try {
    const raw: string | undefined = isOfficeReady()
      ? Office.context.roamingSettings.get(USER_KEY) as string | undefined
      : _memUser ?? undefined;
    return raw ? (JSON.parse(raw) as AddinUser) : null;
  } catch {
    return null;
  }
}

export function setUser(user: AddinUser): void {
  const serialized = JSON.stringify(user);
  if (isOfficeReady()) {
    Office.context.roamingSettings.set(USER_KEY, serialized);
    Office.context.roamingSettings.saveAsync();
  } else {
    _memUser = serialized;
  }
}

// ─── Auth header helper ───────────────────────────────────────────────────────

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
