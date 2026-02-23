import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  listMonographs,
  getMonographById,
  insertMonograph,
  updateMonograph,
} from '../db/queries/monographs';
import { auditLog } from '../services/audit';
import { AuditActions } from '@narc/shared';

const router = Router();

/**
 * GET /api/monographs
 * List all drug monographs (public — needed by add-in and dashboard without auth).
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const monographs = await listMonographs();
    res.json({ monographs, total: monographs.length });
  } catch (err) { next(err); }
});

/**
 * GET /api/monographs/:id
 * Get a single monograph by ID (public).
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const monograph = await getMonographById(req.params.id);
    if (!monograph) {
      res.status(404).json({ error: 'Monograph not found' });
      return;
    }
    res.json({ monograph });
  } catch (err) { next(err); }
});

/**
 * POST /api/monographs
 * Create a new drug monograph (admin only).
 */
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.actor!;
      const { brand_name, generic_name, din, approved_indications, approved_dosing, max_daily_dose, off_label_signals, notes } = req.body;

      if (!brand_name || !generic_name) {
        res.status(400).json({ error: 'brand_name and generic_name are required' });
        return;
      }

      const id = await insertMonograph({
        brand_name,
        generic_name,
        din,
        approved_indications,
        approved_dosing,
        max_daily_dose,
        off_label_signals,
        notes,
      });

      await auditLog({
        actor: { id: actor.sub, role: actor.role },
        action: AuditActions.POLICY_CREATED,  // reuse policy audit action for monograph creation
        entityType: 'drug_monograph',
        entityId: id,
        before: null,
        after: { brand_name, generic_name },
        req,
      });

      res.status(201).json({ id });
    } catch (err) { next(err); }
  }
);

/**
 * PUT /api/monographs/:id
 * Update a drug monograph (admin only).
 */
router.put(
  '/:id',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.actor!;
      const id = req.params.id;

      const before = await getMonographById(id);
      if (!before) {
        res.status(404).json({ error: 'Monograph not found' });
        return;
      }

      const updated = await updateMonograph(id, req.body);
      if (!updated) {
        res.status(400).json({ error: 'No fields to update' });
        return;
      }

      const after = await getMonographById(id);

      await auditLog({
        actor: { id: actor.sub, role: actor.role },
        action: AuditActions.POLICY_ACTIVATED,  // reuse for monograph update
        entityType: 'drug_monograph',
        entityId: id,
        before,
        after,
        req,
      });

      res.json({ monograph: after });
    } catch (err) { next(err); }
  }
);

export default router;
