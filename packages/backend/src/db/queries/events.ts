import { Pool, PoolClient } from 'pg';
import { getPool } from '../pool';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EventRow {
  id: string;
  email_id: string;
  subject: string;
  sender: string;
  received_at: Date;
  body_excerpt: string;
  ae_count: number;
  max_severity: string;
  status: string;
  notes: string;
  created_at: Date;
  updated_at: Date;
  raw_request: object;   // JSONB — pg returns parsed object, not string
  raw_response: object;
  // SLA (migration 002)
  detected_at: Date | null;
  deadline_at: Date | null;
  sla_status: string;
  escalation_level: number;
  // Policy (migration 003)
  policy_version_id: string | null;
  // RBAC (migration 006)
  agent_id: string | null;
  // Detection (migration 007)
  model_version: string | null;
}

export interface InsertEventParams {
  email_id: string;
  subject: string;
  sender: string;
  received_at: string;
  body_excerpt: string;
  ae_count: number;
  max_severity: string;
  status: string;
  notes: string;
  raw_request: object;
  raw_response: object;
  detected_at: string;
  deadline_at: string;
  sla_status: string;
  escalation_level: number;
  policy_version_id: string | null;
  agent_id: string | null;
  model_version: string | null;
}

export interface EventsFilter {
  status?: string;
  severity?: string;
  category?: string;
  from?: string;
  to?: string;
  search?: string;
  agentId?: string;   // for row-level security
  limit?: number;
  offset?: number;
}

export interface FindingRow {
  id: string;
  event_id: string;
  excerpt: string;
  category: string;
  severity: string;
  explanation: string;
  urgency: string;
  confidence: number;
  status: string;
  created_at: Date;
  updated_at: Date;
  model_version: string | null;
  highlight_spans: object | null;
  raw_confidence: number | null;
  calibrated_confidence: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function db(client?: PoolClient | Pool): Pool | PoolClient {
  return client ?? getPool();
}

// ─── Event queries ────────────────────────────────────────────────────────────

export async function insertEvent(
  params: InsertEventParams,
  client?: PoolClient
): Promise<string> {
  const { rows } = await db(client).query<{ id: string }>(
    `INSERT INTO events (
       email_id, subject, sender, received_at, body_excerpt,
       ae_count, max_severity, status, notes,
       raw_request, raw_response,
       detected_at, deadline_at, sla_status, escalation_level,
       policy_version_id, agent_id, model_version
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
     ) RETURNING id`,
    [
      params.email_id, params.subject, params.sender, params.received_at, params.body_excerpt,
      params.ae_count, params.max_severity, params.status, params.notes,
      params.raw_request, params.raw_response,
      params.detected_at, params.deadline_at, params.sla_status, params.escalation_level,
      params.policy_version_id, params.agent_id, params.model_version,
    ]
  );
  return rows[0].id;
}

export async function getEventById(
  id: string,
  client?: PoolClient
): Promise<{ event: EventRow; findings: FindingRow[] } | null> {
  const { rows: eventRows } = await db(client).query<EventRow>(
    'SELECT * FROM events WHERE id = $1', [id]
  );
  if (!eventRows[0]) return null;

  const { rows: findings } = await db(client).query<FindingRow>(
    'SELECT * FROM ae_findings WHERE event_id = $1 ORDER BY created_at ASC', [id]
  );

  return { event: eventRows[0], findings };
}

export async function getEvents(
  filter: EventsFilter,
  client?: PoolClient
): Promise<{ events: Array<EventRow & { findings: FindingRow[] }>; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filter.agentId) {
    conditions.push(`e.agent_id = $${idx++}`);
    params.push(filter.agentId);
  }
  if (filter.status) {
    conditions.push(`e.status = $${idx++}`);
    params.push(filter.status);
  }
  if (filter.severity) {
    conditions.push(`e.max_severity = $${idx++}`);
    params.push(filter.severity);
  }
  if (filter.from) {
    conditions.push(`e.received_at >= $${idx++}`);
    params.push(filter.from);
  }
  if (filter.to) {
    conditions.push(`e.received_at <= $${idx++}`);
    params.push(filter.to);
  }
  if (filter.search) {
    conditions.push(`(e.subject ILIKE $${idx} OR e.sender ILIKE $${idx} OR e.body_excerpt ILIKE $${idx})`);
    params.push(`%${filter.search}%`);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;

  const { rows: countRows } = await db(client).query<{ count: string }>(
    `SELECT COUNT(*) as count FROM events e ${where}`, params
  );
  const total = parseInt(countRows[0].count, 10);

  const { rows: eventRows } = await db(client).query<EventRow>(
    `SELECT * FROM events e ${where} ORDER BY e.received_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );

  const events: Array<EventRow & { findings: FindingRow[] }> = [];
  for (const event of eventRows) {
    const { rows: findings } = await db(client).query<FindingRow>(
      'SELECT * FROM ae_findings WHERE event_id = $1 ORDER BY created_at ASC', [event.id]
    );

    // Category filter (post-join)
    if (filter.category && !findings.some((f) => f.category === filter.category)) {
      continue;
    }

    events.push({ ...event, findings });
  }

  return { events, total };
}

export async function updateEventStatus(
  id: string,
  status: string,
  notes?: string,
  client?: PoolClient
): Promise<boolean> {
  const { rowCount } = await db(client).query(
    `UPDATE events
     SET status = $1,
         notes = COALESCE($2, notes),
         updated_at = NOW()
     WHERE id = $3`,
    [status, notes ?? null, id]
  );
  return (rowCount ?? 0) > 0;
}

export async function updateEventSla(
  id: string,
  slaStatus: string,
  escalationLevel: number,
  client?: PoolClient
): Promise<boolean> {
  const { rowCount } = await db(client).query(
    `UPDATE events
     SET sla_status = $1, escalation_level = $2, updated_at = NOW()
     WHERE id = $3`,
    [slaStatus, escalationLevel, id]
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Find an existing event by email_id (most recent). Used for deduplication in /analyze.
 * Returns the event + its findings, or null if no event exists for this email.
 */
export async function getEventByEmailId(
  emailId: string,
  client?: PoolClient
): Promise<{ event: EventRow; findings: FindingRow[] } | null> {
  const { rows: eventRows } = await db(client).query<EventRow>(
    'SELECT * FROM events WHERE email_id = $1 ORDER BY created_at DESC LIMIT 1',
    [emailId]
  );
  if (!eventRows[0]) return null;

  const { rows: findings } = await db(client).query<FindingRow>(
    'SELECT * FROM ae_findings WHERE event_id = $1 ORDER BY created_at ASC',
    [eventRows[0].id]
  );

  return { event: eventRows[0], findings };
}

/**
 * Hard-delete a single event and all its findings.
 * Returns true if an event was deleted.
 */
export async function deleteEvent(
  id: string,
  client?: PoolClient
): Promise<boolean> {
  // Delete findings first (guard against missing CASCADE)
  await db(client).query('DELETE FROM ae_findings WHERE event_id = $1', [id]);
  const { rowCount } = await db(client).query(
    'DELETE FROM events WHERE id = $1', [id]
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Hard-delete ALL events and findings. Admin-only bulk clear for test data cleanup.
 * Returns the number of events deleted.
 */
export async function deleteAllEvents(
  client?: PoolClient
): Promise<number> {
  await db(client).query('DELETE FROM ae_findings');
  const { rowCount } = await db(client).query('DELETE FROM events');
  return rowCount ?? 0;
}

/** Fetch all open events needing SLA evaluation (used by SLA worker) */
export async function getOpenEventsForSla(
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
     FROM events
     WHERE sla_status NOT IN ('met', 'breached')
       AND deadline_at IS NOT NULL`
  );
  return rows;
}
