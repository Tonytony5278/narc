import crypto from 'crypto';
import { Request } from 'express';
import { Pool, PoolClient } from 'pg';
import { getPool } from '../db/pool';

export interface AuditActor {
  id: string;
  role: string;
}

export interface AuditEntry {
  actor: AuditActor;
  action: string;
  entityType: string;
  entityId: string;
  before: object | null;
  after: object | null;
  req?: Request;
}

/**
 * Append a tamper-evident entry to the audit_log table.
 *
 * Hash formula (SHA-256):
 *   SHA256(sequence | actor_id | action | entity_id | JSON(before) | JSON(after) | prev_hash)
 *
 * Pass `client` to include this write inside an existing transaction,
 * so the business change and audit entry are atomically committed together.
 *
 * NOTE: This function is intentionally append-only.
 * No UPDATE or DELETE should ever be performed on audit_log.
 */
export async function auditLog(
  entry: AuditEntry,
  client?: PoolClient
): Promise<void> {
  const db: Pool | PoolClient = client ?? getPool();

  // Fetch the previous row's hash for chain continuity
  // Use advisory lock or SERIALIZABLE isolation in high-throughput scenarios;
  // for current scale, sequence BIGSERIAL provides ordering guarantee.
  const { rows } = await db.query<{ hash: string; sequence: string }>(
    'SELECT hash, sequence FROM audit_log ORDER BY sequence DESC LIMIT 1'
  );
  const prevHash = rows[0]?.hash ?? '';
  const prevSequence = rows[0] ? BigInt(rows[0].sequence) : 0n;
  const nextSequence = prevSequence + 1n;

  const payload = [
    String(nextSequence),
    entry.actor.id,
    entry.action,
    entry.entityId,
    JSON.stringify(entry.before ?? {}),
    JSON.stringify(entry.after ?? {}),
    prevHash,
  ].join('|');

  const hash = crypto.createHash('sha256').update(payload).digest('hex');

  await db.query(
    `INSERT INTO audit_log
       (actor_id, actor_role, action, entity_type, entity_id,
        before_state, after_state, ip_address, user_agent, prev_hash, hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      entry.actor.id || null,
      entry.actor.role || null,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.before ? JSON.stringify(entry.before) : null,
      entry.after  ? JSON.stringify(entry.after)  : null,
      entry.req?.ip ?? null,
      entry.req?.headers['user-agent'] ?? null,
      prevHash || null,
      hash,
    ]
  );
}
