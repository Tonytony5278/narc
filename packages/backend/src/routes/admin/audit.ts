import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getPool } from '../../db/pool';

const router = Router();

const AuditQuerySchema = z.object({
  from:        z.string().optional(),
  to:          z.string().optional(),
  actor:       z.string().uuid().optional(),
  action:      z.string().optional(),
  entity_type: z.string().optional(),
  entity_id:   z.string().optional(),
  limit:       z.coerce.number().int().min(1).max(1000).optional().default(100),
  offset:      z.coerce.number().int().min(0).optional().default(0),
});

/**
 * GET /api/admin/audit
 * Export a paginated slice of the audit log.
 * Admin-only. Supports filtering by date range, actor, action, entity type/id.
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = AuditQuerySchema.parse(req.query);
    const pool = getPool();

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (query.from)        { conditions.push(`created_at >= $${idx++}`); params.push(query.from); }
    if (query.to)          { conditions.push(`created_at <= $${idx++}`); params.push(query.to); }
    if (query.actor)       { conditions.push(`actor_id = $${idx++}`);    params.push(query.actor); }
    if (query.action)      { conditions.push(`action = $${idx++}`);      params.push(query.action); }
    if (query.entity_type) { conditions.push(`entity_type = $${idx++}`); params.push(query.entity_type); }
    if (query.entity_id)   { conditions.push(`entity_id = $${idx++}`);   params.push(query.entity_id); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: countRows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM audit_log ${where}`, params
    );
    const total = parseInt(countRows[0].count, 10);

    const { rows } = await pool.query(
      `SELECT sequence, actor_id, actor_role, action, entity_type, entity_id,
              before_state, after_state, ip_address, prev_hash, hash, created_at
       FROM audit_log
       ${where}
       ORDER BY sequence DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, query.limit, query.offset]
    );

    res.json({
      entries: rows,
      total,
      exportedAt: new Date().toISOString(),
      chainTip: rows[0]?.hash ?? null,
    });
  } catch (err) { next(err); }
});

export default router;
