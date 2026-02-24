import { Pool, PoolClient } from 'pg';
import { getPool } from '../pool';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CallRow {
  id: string;
  external_call_id: string | null;
  platform: string;
  agent_id: string | null;
  agent_email: string | null;
  patient_ref: string | null;
  drug_name: string | null;
  direction: string;
  started_at: Date | null;
  ended_at: Date | null;
  duration_seconds: number | null;
  recording_url: string | null;
  transcript: string | null;
  transcript_language: string | null;
  ae_count: number;
  max_severity: string;
  status: string;
  notes: string | null;
  detected_at: Date | null;
  deadline_at: Date | null;
  sla_status: string;
  escalation_level: number;
  policy_version_id: string | null;
  model_version: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CallFindingRow {
  id: string;
  call_id: string;
  category: string;
  severity: string;
  urgency: string;
  excerpt: string;
  explanation: string;
  confidence: number | null;
  status: string;
  highlight_start: number | null;
  highlight_end: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface InsertCallParams {
  external_call_id?: string | null;
  platform: string;
  agent_id?: string | null;
  agent_email?: string | null;
  patient_ref?: string | null;
  drug_name?: string | null;
  direction?: string;
  started_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  recording_url?: string | null;
  transcript?: string | null;
  transcript_language?: string | null;
  ae_count: number;
  max_severity: string;
  status: string;
  notes?: string | null;
  detected_at?: string | null;
  deadline_at?: string | null;
  sla_status: string;
  escalation_level: number;
  policy_version_id?: string | null;
  model_version?: string | null;
}

export interface InsertCallFindingParams {
  call_id: string;
  category: string;
  severity: string;
  urgency: string;
  excerpt: string;
  explanation: string;
  confidence?: number | null;
  status?: string;
  highlight_start?: number | null;
  highlight_end?: number | null;
}

export interface CallsFilter {
  status?: string;
  severity?: string;
  platform?: string;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function db(client?: PoolClient | Pool): Pool | PoolClient {
  return client ?? getPool();
}

// ─── Call queries ─────────────────────────────────────────────────────────────

export async function insertCall(
  params: InsertCallParams,
  client?: PoolClient
): Promise<string> {
  const { rows } = await db(client).query<{ id: string }>(
    `INSERT INTO calls (
       external_call_id, platform, agent_id, agent_email, patient_ref, drug_name,
       direction, started_at, ended_at, duration_seconds, recording_url,
       transcript, transcript_language,
       ae_count, max_severity, status, notes,
       detected_at, deadline_at, sla_status, escalation_level,
       policy_version_id, model_version
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
     ) RETURNING id`,
    [
      params.external_call_id ?? null,
      params.platform,
      params.agent_id ?? null,
      params.agent_email ?? null,
      params.patient_ref ?? null,
      params.drug_name ?? null,
      params.direction ?? 'inbound',
      params.started_at ?? null,
      params.ended_at ?? null,
      params.duration_seconds ?? null,
      params.recording_url ?? null,
      params.transcript ?? null,
      params.transcript_language ?? null,
      params.ae_count,
      params.max_severity,
      params.status,
      params.notes ?? null,
      params.detected_at ?? null,
      params.deadline_at ?? null,
      params.sla_status,
      params.escalation_level,
      params.policy_version_id ?? null,
      params.model_version ?? null,
    ]
  );
  return rows[0].id;
}

export async function insertCallFinding(
  params: InsertCallFindingParams,
  client?: PoolClient
): Promise<string> {
  const { rows } = await db(client).query<{ id: string }>(
    `INSERT INTO call_ae_findings (
       call_id, category, severity, urgency, excerpt, explanation,
       confidence, status, highlight_start, highlight_end
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [
      params.call_id,
      params.category,
      params.severity,
      params.urgency,
      params.excerpt,
      params.explanation,
      params.confidence ?? null,
      params.status ?? 'pending',
      params.highlight_start ?? null,
      params.highlight_end ?? null,
    ]
  );
  return rows[0].id;
}

export async function getCallById(
  id: string,
  client?: PoolClient
): Promise<{ call: CallRow; findings: CallFindingRow[] } | null> {
  const { rows: callRows } = await db(client).query<CallRow>(
    'SELECT * FROM calls WHERE id = $1', [id]
  );
  if (!callRows[0]) return null;

  const { rows: findings } = await db(client).query<CallFindingRow>(
    'SELECT * FROM call_ae_findings WHERE call_id = $1 ORDER BY created_at ASC', [id]
  );

  return { call: callRows[0], findings };
}

export async function getCalls(
  filter: CallsFilter,
  client?: PoolClient
): Promise<{ calls: Array<CallRow & { findings: CallFindingRow[] }>; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filter.status) {
    conditions.push(`c.status = $${idx++}`);
    params.push(filter.status);
  }
  if (filter.severity) {
    conditions.push(`c.max_severity = $${idx++}`);
    params.push(filter.severity);
  }
  if (filter.platform) {
    conditions.push(`c.platform = $${idx++}`);
    params.push(filter.platform);
  }
  if (filter.from) {
    conditions.push(`c.created_at >= $${idx++}`);
    params.push(filter.from);
  }
  if (filter.to) {
    conditions.push(`c.created_at <= $${idx++}`);
    params.push(filter.to);
  }
  if (filter.search) {
    conditions.push(
      `(c.transcript ILIKE $${idx} OR c.patient_ref ILIKE $${idx} OR c.agent_email ILIKE $${idx})`
    );
    params.push(`%${filter.search}%`);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;

  const { rows: countRows } = await db(client).query<{ count: string }>(
    `SELECT COUNT(*) as count FROM calls c ${where}`, params
  );
  const total = parseInt(countRows[0].count, 10);

  const { rows: callRows } = await db(client).query<CallRow>(
    `SELECT * FROM calls c ${where} ORDER BY c.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );

  const calls: Array<CallRow & { findings: CallFindingRow[] }> = [];
  for (const call of callRows) {
    const { rows: findings } = await db(client).query<CallFindingRow>(
      'SELECT * FROM call_ae_findings WHERE call_id = $1 ORDER BY created_at ASC', [call.id]
    );
    calls.push({ ...call, findings });
  }

  return { calls, total };
}

export async function updateCallStatus(
  id: string,
  status: string,
  notes?: string,
  client?: PoolClient
): Promise<boolean> {
  const { rowCount } = await db(client).query(
    `UPDATE calls
     SET status = $1,
         notes = COALESCE($2, notes),
         updated_at = NOW()
     WHERE id = $3`,
    [status, notes ?? null, id]
  );
  return (rowCount ?? 0) > 0;
}

export async function updateCallSla(
  id: string,
  slaStatus: string,
  escalationLevel: number,
  client?: PoolClient
): Promise<void> {
  await db(client).query(
    `UPDATE calls SET sla_status = $1, escalation_level = $2, updated_at = NOW() WHERE id = $3`,
    [slaStatus, escalationLevel, id]
  );
}

/** Fetch all open calls needing SLA evaluation (used by SLA worker) */
export async function getOpenCallsForSla(
  client?: PoolClient
): Promise<Array<{
  id: string;
  max_severity: string;
  detected_at: Date;
  deadline_at: Date;
  sla_status: string;
  escalation_level: number;
  status: string;
}>> {
  const { rows } = await db(client).query(
    `SELECT id, max_severity, detected_at, deadline_at, sla_status, escalation_level, status
     FROM calls
     WHERE sla_status NOT IN ('met', 'breached')
       AND deadline_at IS NOT NULL
       AND detected_at IS NOT NULL`
  );
  return rows;
}

export async function updateCallFindingStatus(
  callId: string,
  findingId: string,
  status: string,
  client?: PoolClient
): Promise<boolean> {
  const { rowCount } = await db(client).query(
    `UPDATE call_ae_findings
     SET status = $1, updated_at = NOW()
     WHERE id = $2 AND call_id = $3`,
    [status, findingId, callId]
  );
  return (rowCount ?? 0) > 0;
}
