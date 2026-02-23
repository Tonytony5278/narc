import { getPool } from '../db/pool';
import { JWTPayload } from '../auth/jwt';
import { EventRow, FindingRow } from '../db/queries/events';
import { DocumentRow } from '../db/queries/documents';

export interface CasePacket {
  schemaVersion: '1.0';
  exportedAt: string;
  exportedBy: string;
  event: EventRow;
  findings: FindingRow[];
  documents: Array<Omit<DocumentRow, 'extracted_text'> & { hasExtractedText: boolean }>;
  auditTrail: AuditLogRow[];
  submissionCount: number;
}

interface AuditLogRow {
  sequence: number;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before_state: object | null;
  after_state: object | null;
  ip_address: string | null;
  prev_hash: string | null;
  hash: string;
  created_at: Date;
}

/**
 * Build a complete case packet for a given event.
 * Includes all findings, document metadata (not full text), and audit trail.
 * Used for safety mailbox submission and regulatory reporting.
 */
export async function buildCasePacket(
  eventId: string,
  actor: JWTPayload
): Promise<CasePacket> {
  const pool = getPool();

  const [eventResult, findingsResult, docsResult, auditResult, submissionResult] =
    await Promise.all([
      pool.query<EventRow>('SELECT * FROM events WHERE id = $1', [eventId]),
      pool.query<FindingRow>(
        'SELECT * FROM ae_findings WHERE event_id = $1 ORDER BY created_at',
        [eventId]
      ),
      pool.query<DocumentRow>(
        'SELECT * FROM documents WHERE event_id = $1 ORDER BY created_at',
        [eventId]
      ),
      pool.query<AuditLogRow>(
        `SELECT sequence, actor_id, actor_role, action, entity_type, entity_id,
                before_state, after_state, ip_address, prev_hash, hash, created_at
         FROM audit_log
         WHERE entity_id = $1
         ORDER BY sequence ASC`,
        [eventId]
      ),
      pool.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM submissions WHERE event_id = $1',
        [eventId]
      ),
    ]);

  const event = eventResult.rows[0];
  if (!event) throw Object.assign(new Error('Event not found'), { statusCode: 404 });

  // Omit extracted_text from document records in the packet (can be large)
  const documents = docsResult.rows.map(({ extracted_text, ...doc }) => ({
    ...doc,
    hasExtractedText: Boolean(extracted_text && extracted_text.length > 0),
  }));

  return {
    schemaVersion: '1.0',
    exportedAt: new Date().toISOString(),
    exportedBy: actor.email,
    event,
    findings: findingsResult.rows,
    documents,
    auditTrail: auditResult.rows,
    submissionCount: parseInt(submissionResult.rows[0].count, 10),
  };
}
