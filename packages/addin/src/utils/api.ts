import type { AnalyzeApiResponse } from '@narc/shared';
import { getToken, setToken, setUser, clearToken } from './auth';

// In production, this would be your deployed backend URL.
// For dev: backend runs on http://localhost:3001
export const BACKEND_URL = 'http://localhost:3001';

// ─── Authenticated fetch ──────────────────────────────────────────────────────

export async function authedFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const token = getToken();
  return fetch(BACKEND_URL + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginResult {
  token: string;
  user: { id: string; email: string; role: string };
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Login failed: ${res.statusText}`);
  }
  const data = (await res.json()) as LoginResult;
  setToken(data.token);
  setUser(data.user);
  return data;
}

export function logout(): void {
  clearToken();
}

// ─── AE Analysis ─────────────────────────────────────────────────────────────

export async function analyzeEmail(params: {
  emailBody: string;
  subject: string;
  sender: string;
  receivedAt: string;
  emailId: string;
  drugName?: string;
}): Promise<AnalyzeApiResponse> {
  const res = await authedFetch('/api/analyze', {
    method: 'POST',
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Backend error: ${res.status} ${res.statusText}`
    );
  }

  return res.json() as Promise<AnalyzeApiResponse>;
}

// ─── Finding status ───────────────────────────────────────────────────────────

export async function updateFindingStatus(
  eventId: string,
  findingId: string,
  status: 'reported' | 'dismissed'
): Promise<void> {
  const res = await authedFetch(`/api/events/${eventId}/findings/${findingId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    throw new Error(`Failed to update finding status: ${res.statusText}`);
  }
}

// ─── Document upload ──────────────────────────────────────────────────────────

export async function uploadAttachment(
  eventId: string,
  filename: string,
  contentBytes: string,  // base64
  contentType: string
): Promise<{ id: string }> {
  // Decode base64 → Blob → FormData
  const binary = atob(contentBytes);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: contentType });

  const form = new FormData();
  form.append('document', blob, filename);

  const token = getToken();
  const res = await fetch(`${BACKEND_URL}/api/events/${eventId}/documents`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Upload failed: ${res.statusText}`);
  }

  return res.json() as Promise<{ id: string }>;
}

// ─── Monographs ───────────────────────────────────────────────────────────────

export interface MonographSummary {
  id: string;
  brand_name: string;
  generic_name: string;
  din: string | null;
  approved_dosing: Record<string, string>;
  approved_indications: string[];
  max_daily_dose: string | null;
  off_label_signals: { pattern: string; flag: string }[];
}

export async function fetchMonographs(): Promise<MonographSummary[]> {
  const res = await fetch(`${BACKEND_URL}/api/monographs`);
  if (!res.ok) return [];
  const data = (await res.json()) as { monographs: MonographSummary[] };
  return data.monographs ?? [];
}

// ─── Document attachment AE analysis ─────────────────────────────────────────

export interface AttachmentFinding {
  id: string;
  eventId: string;
  excerpt: string;
  category: string;
  severity: string;
  explanation: string;
  urgency: string;
  confidence: number;
  status: string;
}

export interface DocumentAnalysisResult {
  eventId: string;
  filename: string;
  extractionMethod: string;
  extractedChars: number;
  ocrConfidence: number | null;
  hasAEs: boolean;
  findings: AttachmentFinding[];
  summary: string;
  analysisNotes: string | null;
  monograph: { brandName: string; genericName: string } | null;
}

/**
 * Analyze a file attachment for adverse events.
 * Sends base64-encoded file content to the backend which:
 *   1. Extracts text (PDF, DOCX, RTF, TXT) or uses Claude Vision OCR (images/faxes/handwriting)
 *   2. Runs full AE detection with policy + monograph context
 *   3. Creates a NARC event and returns findings immediately
 */
export async function analyzeDocumentAttachment(params: {
  filename: string;
  contentBytes: string;  // base64
  contentType: string;
  subject?: string;
  sender?: string;
  receivedAt?: string;
  emailId?: string;
}): Promise<DocumentAnalysisResult> {
  // Decode base64 → Blob → FormData
  const binary = atob(params.contentBytes);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: params.contentType });

  const form = new FormData();
  form.append('document', blob, params.filename);
  if (params.subject)    form.append('subject', params.subject);
  if (params.sender)     form.append('sender', params.sender);
  if (params.receivedAt) form.append('receivedAt', params.receivedAt);
  if (params.emailId)    form.append('emailId', `attachment-${params.emailId}-${params.filename}`);

  const token = getToken();
  const res = await fetch(`${BACKEND_URL}/api/analyze/document`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Document analysis failed: ${res.status} ${res.statusText}`
    );
  }

  return res.json() as Promise<DocumentAnalysisResult>;
}
