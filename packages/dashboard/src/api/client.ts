import type { EventRecord, EventsApiResponse } from '@narc/shared';

const BASE = '/api';

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export function getToken(): string | null {
  return localStorage.getItem('narc_token');
}

function setToken(token: string | null): void {
  if (token) localStorage.setItem('narc_token', token);
  else localStorage.removeItem('narc_token');
}

function clearToken(): void {
  localStorage.removeItem('narc_token');
  localStorage.removeItem('narc_user');
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(opts.headers ?? {}),
    },
  });
  if (res.status === 401) {
    clearToken();
    window.location.reload();
  }
  return res;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginResult {
  token: string;
  user: { id: string; email: string; role: string };
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Login failed: ${res.statusText}`);
  }
  const data = (await res.json()) as LoginResult;
  setToken(data.token);
  localStorage.setItem('narc_user', JSON.stringify(data.user));
  return data;
}

export function logout(): void {
  clearToken();
  window.location.reload();
}

export function getCurrentUser(): { id: string; email: string; role: string } | null {
  try {
    const raw = localStorage.getItem('narc_user');
    return raw ? (JSON.parse(raw) as { id: string; email: string; role: string }) : null;
  } catch {
    return null;
  }
}

// ─── Events ──────────────────────────────────────────────────────────────────

export interface EventsFilter {
  status?: string;
  severity?: string;
  category?: string;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function fetchEvents(filter: EventsFilter = {}): Promise<EventsApiResponse> {
  const params = new URLSearchParams();
  if (filter.status) params.set('status', filter.status);
  if (filter.severity) params.set('severity', filter.severity);
  if (filter.category) params.set('category', filter.category);
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (filter.search) params.set('search', filter.search);
  if (filter.limit) params.set('limit', String(filter.limit));
  if (filter.offset) params.set('offset', String(filter.offset));

  const res = await apiFetch(`/events?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch events: ${res.statusText}`);
  return res.json() as Promise<EventsApiResponse>;
}

export async function fetchEvent(id: string): Promise<EventRecord> {
  const res = await apiFetch(`/events/${id}`);
  if (!res.ok) throw new Error(`Event not found: ${res.statusText}`);
  return res.json() as Promise<EventRecord>;
}

export async function updateEventStatus(
  id: string,
  status: string,
  notes?: string
): Promise<void> {
  const res = await apiFetch(`/events/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, notes }),
  });
  if (!res.ok) throw new Error(`Failed to update event: ${res.statusText}`);
}

export async function deleteEvent(id: string): Promise<void> {
  const res = await apiFetch(`/events/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete event: ${res.statusText}`);
}

export async function clearAllEvents(): Promise<number> {
  const res = await apiFetch('/events', { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to clear events: ${res.statusText}`);
  const data = (await res.json()) as { deleted: number };
  return data.deleted;
}

export async function updateFindingStatus(
  eventId: string,
  findingId: string,
  status: string
): Promise<void> {
  const res = await apiFetch(`/events/${eventId}/findings/${findingId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Failed to update finding: ${res.statusText}`);
}

// ─── Documents ────────────────────────────────────────────────────────────────

export interface DocumentRecord {
  id: string;
  event_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  extraction_method: string;
  extracted_text: string | null;
  ocr_confidence: number | null;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string;
}

export async function fetchDocuments(eventId: string): Promise<DocumentRecord[]> {
  const res = await apiFetch(`/events/${eventId}/documents`);
  if (!res.ok) throw new Error(`Failed to fetch documents: ${res.statusText}`);
  const data = (await res.json()) as { documents: DocumentRecord[] };
  return data.documents;
}

export async function uploadDocument(eventId: string, file: File): Promise<{ id: string }> {
  const form = new FormData();
  form.append('document', file);
  const token = getToken();
  const res = await fetch(`${BASE}/events/${eventId}/documents`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Upload failed: ${res.statusText}`);
  }
  return res.json() as Promise<{ id: string }>;
}

// ─── Cases ────────────────────────────────────────────────────────────────────

export async function generateCasePacket(eventId: string): Promise<unknown> {
  const res = await apiFetch(`/cases/${eventId}/packet`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to generate packet: ${res.statusText}`);
  return res.json();
}

export async function submitCase(eventId: string): Promise<unknown> {
  const res = await apiFetch(`/cases/${eventId}/submit`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to submit case: ${res.statusText}`);
  return res.json();
}

export async function fetchSubmissions(eventId: string): Promise<unknown[]> {
  const res = await apiFetch(`/cases/${eventId}/submissions`);
  if (!res.ok) throw new Error(`Failed to fetch submissions: ${res.statusText}`);
  const data = (await res.json()) as { submissions: unknown[] };
  return data.submissions;
}

// ─── E2B(R3) regulatory export ────────────────────────────────────────────────

export interface MeddraSuggestion {
  ptCode: string;
  ptTerm: string;
  hltCode: string;
  hltTerm: string;
  hlgtCode: string;
  hlgtTerm: string;
  socCode: string;
  socTerm: string;
  confidence: 'high' | 'medium' | 'low';
  aiGenerated: true;
  warning: string;
}

export interface E2BFinding {
  findingId: string;
  excerpt: string;
  category: string;
  severity: string;
  urgency: string;
  explanation: string;
  meddra: MeddraSuggestion;
}

export interface E2BData {
  eventId: string;
  event: {
    subject: string;
    sender: string;
    receivedAt: string;
    bodyExcerpt: string;
    maxSeverity: string;
  };
  generatedAt: string;
  meddraVersion: string;
  findings: E2BFinding[];
  disclaimer: string;
}

export async function fetchE2BData(eventId: string): Promise<E2BData> {
  const res = await apiFetch(`/cases/${eventId}/e2b`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Failed to prepare E2B report: ${res.statusText}`);
  }
  return res.json() as Promise<E2BData>;
}

// ─── Audit log ────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: number;
  sequence: number;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before_state: unknown;
  after_state: unknown;
  ip_address: string | null;
  hash: string;
  created_at: string;
}

export async function fetchAuditLog(params: {
  from?: string; to?: string; actor?: string; action?: string;
  entity_type?: string; entity_id?: string; limit?: number; offset?: number;
} = {}): Promise<{ entries: AuditEntry[]; total: number }> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined) qs.set(k, String(v)); });
  const res = await apiFetch(`/admin/audit?${qs}`);
  if (!res.ok) throw new Error(`Failed to fetch audit log: ${res.statusText}`);
  return res.json() as Promise<{ entries: AuditEntry[]; total: number }>;
}

// ─── Policy ───────────────────────────────────────────────────────────────────

export interface PolicyVersion {
  id: string;
  version: string;
  name: string;
  is_active: boolean;
  effective_date: string;
  created_at: string;
}

export async function fetchPolicies(): Promise<PolicyVersion[]> {
  const res = await apiFetch('/admin/policy');
  if (!res.ok) throw new Error(`Failed to fetch policies: ${res.statusText}`);
  const data = (await res.json()) as { versions: PolicyVersion[] };
  return data.versions;
}

export async function activatePolicy(id: string): Promise<void> {
  const res = await apiFetch(`/admin/policy/${id}/activate`, { method: 'PATCH' });
  if (!res.ok) throw new Error(`Failed to activate policy: ${res.statusText}`);
}

// ─── Monographs ───────────────────────────────────────────────────────────────

export interface MonographRecord {
  id: string;
  brand_name: string;
  generic_name: string;
  din: string | null;
  approved_indications: string[];
  approved_dosing: Record<string, string>;
  max_daily_dose: string | null;
  off_label_signals: { pattern: string; flag: string }[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchMonographs(): Promise<MonographRecord[]> {
  const res = await fetch(`${BASE}/monographs`);
  if (!res.ok) throw new Error(`Failed to fetch monographs: ${res.statusText}`);
  const data = (await res.json()) as { monographs: MonographRecord[] };
  return data.monographs;
}

export async function updateMonograph(id: string, data: Partial<MonographRecord>): Promise<void> {
  const res = await apiFetch(`/monographs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update monograph: ${res.statusText}`);
}

// ─── Users ─────────────────────────────────────────────────────────────────

export interface UserRecord {
  id: string;
  email: string;
  role: 'agent' | 'supervisor' | 'admin';
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export async function fetchUsers(): Promise<UserRecord[]> {
  const res = await apiFetch('/admin/users');
  if (!res.ok) throw new Error(`Failed to fetch users: ${res.statusText}`);
  const data = (await res.json()) as { users: UserRecord[] };
  return data.users;
}

export async function createUser(params: {
  email: string;
  role: 'agent' | 'supervisor' | 'admin';
  password: string;
}): Promise<{ id: string; email: string; role: string }> {
  const res = await apiFetch('/admin/users', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Failed to create user: ${res.statusText}`);
  return data as { id: string; email: string; role: string };
}

export async function patchUser(
  id: string,
  patch: { role?: 'agent' | 'supervisor' | 'admin'; is_active?: boolean }
): Promise<void> {
  const res = await apiFetch(`/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Failed to update user: ${res.statusText}`);
}

export async function deactivateUser(id: string): Promise<void> {
  const res = await apiFetch(`/admin/users/${id}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Failed to deactivate user: ${res.statusText}`);
}
