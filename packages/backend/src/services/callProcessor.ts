import https from 'https';
import http from 'http';
import type { IncomingMessage } from 'http';
import { transcribeAudio } from './whisper';
import { analyzeEmail } from './claude';
import { getActivePolicy, calibrateConfidence } from './policy';
import { computeDeadline, computeSlaStatus } from './sla';
import { auditLog } from './audit';
import { sendAEAlert } from './alertService';
import { withTransaction } from '../db/pool';
import { insertCall, insertCallFinding, getCallById } from '../db/queries/calls';
import { lookupMonograph, buildMonographContext } from './monograph';
import { AuditActions } from '@narc/shared';
import type { AnalyzeRequest } from '@narc/shared';

const MODEL_VERSION = 'claude-opus-4-6';

const SEVERITY_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export interface CallIngestPayload {
  // Audio source — exactly one must be provided
  audioBuffer?: Buffer;
  audioUrl?: string;

  // File metadata (required when using audioBuffer)
  filename?: string;
  mimeType?: string;

  // Call metadata (all optional — gracefully handle missing data)
  platform: string;
  externalCallId?: string;
  agentEmail?: string;
  agentId?: string;
  patientRef?: string;
  drugName?: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  direction?: 'inbound' | 'outbound';
  recordingUrl?: string;
}

/**
 * Download an audio file from an HTTP/HTTPS URL into a Buffer.
 * Supports pre-signed S3 URLs and any other HTTP/HTTPS URL.
 */
function downloadUrl(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https://') ? https : http;
    const req = protocol.get(url, (res: IncomingMessage) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        reject(new Error(`Failed to download recording: HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(60_000, () => {
      req.destroy();
      reject(new Error('Download timed out after 60s'));
    });
  });
}

/**
 * Guess MIME type from a URL's file extension.
 */
function guessMimeType(url: string): string {
  const path = url.split('?')[0].toLowerCase();
  if (path.endsWith('.mp3'))  return 'audio/mpeg';
  if (path.endsWith('.mp4'))  return 'audio/mp4';
  if (path.endsWith('.m4a'))  return 'audio/mp4';
  if (path.endsWith('.wav'))  return 'audio/wav';
  if (path.endsWith('.webm')) return 'audio/webm';
  if (path.endsWith('.ogg'))  return 'audio/ogg';
  if (path.endsWith('.mpeg')) return 'audio/mpeg';
  return 'audio/mpeg'; // safe fallback
}

/**
 * Guess filename from a URL.
 */
function guessFilename(url: string): string {
  const path = url.split('?')[0];
  const parts = path.split('/');
  const name = parts[parts.length - 1];
  return name || 'recording.mp3';
}

/**
 * Process a call recording through the full NARC pipeline:
 * download → transcribe → analyze → persist → alert
 */
export async function processCall(
  payload: CallIngestPayload,
  actorId?: string
): Promise<{ callId: string }> {
  let audioBuffer: Buffer;
  let filename: string;
  let mimeType: string;

  // ── Step 1: Resolve audio source ────────────────────────────────────────────
  if (payload.audioBuffer) {
    audioBuffer = payload.audioBuffer;
    filename = payload.filename ?? 'recording.mp3';
    mimeType = payload.mimeType ?? 'audio/mpeg';
  } else if (payload.audioUrl) {
    try {
      audioBuffer = await downloadUrl(payload.audioUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Recording download failed: ${msg}`);
    }
    filename = payload.filename ?? guessFilename(payload.audioUrl);
    mimeType = payload.mimeType ?? guessMimeType(payload.audioUrl);
  } else {
    throw new Error('CallIngestPayload must include either audioBuffer or audioUrl');
  }

  // ── Step 2: Transcribe with Whisper ─────────────────────────────────────────
  let transcript: string;
  let transcriptLanguage: string | undefined;
  let callStatus = 'pending_review';

  try {
    const result = await transcribeAudio(audioBuffer, filename, mimeType);
    transcript = result.transcript;
    transcriptLanguage = result.language;
  } catch (err) {
    // Persist call record with failed status so it's visible in the dashboard
    const failedId = await withTransaction(async (client) => {
      const id = await insertCall({
        external_call_id: payload.externalCallId ?? null,
        platform: payload.platform,
        agent_id: payload.agentId ?? null,
        agent_email: payload.agentEmail ?? null,
        patient_ref: payload.patientRef ?? null,
        drug_name: payload.drugName ?? null,
        direction: payload.direction ?? 'inbound',
        started_at: payload.startedAt ?? null,
        ended_at: payload.endedAt ?? null,
        duration_seconds: payload.durationSeconds ?? null,
        recording_url: payload.recordingUrl ?? payload.audioUrl ?? null,
        transcript: null,
        ae_count: 0,
        max_severity: 'low',
        status: 'transcription_failed',
        notes: `Transcription failed: ${err instanceof Error ? err.message : String(err)}`,
        sla_status: 'on_track',
        escalation_level: 0,
      }, client);
      return id;
    });
    console.error(`[callProcessor] ❌ Transcription failed for call ${failedId}:`, err);
    return { callId: failedId };
  }

  // ── Step 3: Look up drug monograph ──────────────────────────────────────────
  const searchText = [payload.drugName, transcript.slice(0, 500)].filter(Boolean).join(' ');
  const monograph = await lookupMonograph(searchText, payload.drugName);
  const monographContext = monograph ? buildMonographContext(monograph) : null;

  // ── Step 4: Build AnalyzeRequest (treating transcript as email body) ─────────
  const durationLabel = payload.durationSeconds
    ? `${Math.round(payload.durationSeconds / 60)}min`
    : 'unknown duration';

  const analyzeReq: AnalyzeRequest = {
    emailBody: transcript,
    subject: `[Call Recording] ${payload.platform} — ${durationLabel} — ${payload.patientRef ?? 'Unknown Patient'}`,
    sender: payload.agentEmail ?? 'unknown@agent',
    receivedAt: payload.startedAt ?? new Date().toISOString(),
    drugName: payload.drugName,
  };

  // ── Step 5: Run Claude AE detection ─────────────────────────────────────────
  const policy = await getActivePolicy();
  console.log(`[callProcessor] Analyzing call from ${analyzeReq.sender} — platform: ${payload.platform}${monograph ? ` — drug: ${monograph.brand_name}` : ''}`);
  const aiResponse = await analyzeEmail(analyzeReq, policy, monographContext);

  // ── Step 6: Compute severity, SLA ───────────────────────────────────────────
  const maxSeverity = aiResponse.findings.reduce<string>((max, f) => {
    return (SEVERITY_ORDER[f.severity] ?? 0) > (SEVERITY_ORDER[max] ?? 0) ? f.severity : max;
  }, 'low');

  const detectedAt = new Date();
  const deadlineAt = computeDeadline(maxSeverity, detectedAt);
  const slaResult = computeSlaStatus(detectedAt, deadlineAt, false);

  // Apply policy calibration
  const calibrated = aiResponse.findings.map((finding) => {
    const rule = policy?.rules.find(
      (r) => r.is_enabled && r.category === finding.category &&
      r.keywords.some((kw) => finding.excerpt.toLowerCase().includes(kw.toLowerCase()))
    );
    const rawConfidence = finding.confidence;
    const calibratedConfidence = rule ? calibrateConfidence(rawConfidence, rule) : rawConfidence;
    const severity = (rule?.severity_override as string | undefined) ?? finding.severity;
    return { finding, rawConfidence, calibratedConfidence, severity };
  });

  if (aiResponse.findings.length > 0) {
    callStatus = 'pending_review';
  }

  // ── Step 7: Persist in one transaction ──────────────────────────────────────
  const callId = await withTransaction(async (client) => {
    const id = await insertCall({
      external_call_id: payload.externalCallId ?? null,
      platform: payload.platform,
      agent_id: payload.agentId ?? null,
      agent_email: payload.agentEmail ?? null,
      patient_ref: payload.patientRef ?? null,
      drug_name: payload.drugName ?? null,
      direction: payload.direction ?? 'inbound',
      started_at: payload.startedAt ?? null,
      ended_at: payload.endedAt ?? null,
      duration_seconds: payload.durationSeconds ?? null,
      recording_url: payload.recordingUrl ?? payload.audioUrl ?? null,
      transcript,
      transcript_language: transcriptLanguage ?? null,
      ae_count: calibrated.length,
      max_severity: maxSeverity,
      status: callStatus,
      detected_at: detectedAt.toISOString(),
      deadline_at: deadlineAt.toISOString(),
      sla_status: slaResult.sla_status,
      escalation_level: slaResult.escalation_level,
      policy_version_id: policy?.id ?? null,
      model_version: MODEL_VERSION,
    }, client);

    for (const { finding, calibratedConfidence, severity } of calibrated) {
      const highlight = finding.highlight_spans?.[0];
      await insertCallFinding({
        call_id: id,
        category: finding.category,
        severity,
        urgency: finding.urgency,
        excerpt: finding.excerpt,
        explanation: finding.explanation,
        confidence: calibratedConfidence,
        status: 'pending',
        highlight_start: highlight?.start ?? null,
        highlight_end: highlight?.end ?? null,
      }, client);
    }

    await auditLog({
      actor: { id: actorId ?? '00000000-0000-0000-0000-000000000001', role: actorId ? 'agent' : 'system' },
      action: AuditActions.ANALYZE_EMAIL,
      entityType: 'call',
      entityId: id,
      before: null,
      after: {
        ae_count: calibrated.length,
        max_severity: maxSeverity,
        sla_status: slaResult.sla_status,
        platform: payload.platform,
        drug: monograph?.brand_name ?? null,
      },
    }, client);

    return id;
  });

  console.log(`[callProcessor] ✅ Call ${callId}: ${calibrated.length} AE(s), max severity: ${maxSeverity}`);

  // ── Step 8: Alert if AEs found ───────────────────────────────────────────────
  if (calibrated.length > 0) {
    sendAEAlert({
      eventId: callId,
      subject: analyzeReq.subject,
      sender: analyzeReq.sender,
      maxSeverity,
      aeCount: calibrated.length,
      detectedAt: detectedAt.toISOString(),
      deadlineAt: deadlineAt.toISOString(),
      summary: aiResponse.summary,
      source: 'inbox_monitor',
      findings: calibrated.map(({ finding, severity }) => ({
        category: finding.category,
        severity,
        excerpt: finding.excerpt,
        explanation: finding.explanation,
        urgency: finding.urgency,
      })),
    }).catch((err) => console.error('[callProcessor] Alert error:', err));
  }

  return { callId };
}

/**
 * Fetch the fully processed call record (call + findings) after processing.
 */
export async function getProcessedCall(callId: string) {
  return getCallById(callId);
}
