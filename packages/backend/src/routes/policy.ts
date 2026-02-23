import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  listPolicyVersions,
  createPolicyVersion,
  activatePolicyVersion,
  insertDetectionRule,
} from '../db/queries/policy';
import { invalidatePolicyCache } from '../services/policy';
import { auditLog } from '../services/audit';
import { withTransaction } from '../db/pool';
import { AuditActions } from '@narc/shared';

const router = Router();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const CreatePolicySchema = z.object({
  version: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().optional().default(''),
  rules: z.array(z.object({
    category: z.string().min(1),
    ruleName: z.string().min(1),
    severityOverride: z.enum(['low','medium','high','critical']).nullable().optional().default(null),
    conditions: z.record(z.unknown()).optional().default({}),
    keywords: z.array(z.string()).optional().default([]),
  })).optional().default([]),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

/** GET /api/admin/policy — list all policy versions */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const versions = await listPolicyVersions();
    res.json({ versions, total: versions.length });
  } catch (err) { next(err); }
});

/** POST /api/admin/policy — create a new policy version with rules */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreatePolicySchema.parse(req.body);
    const actor = req.actor!;

    const policyId = await withTransaction(async (client) => {
      const id = await createPolicyVersion({
        version: body.version,
        name: body.name,
        description: body.description,
        createdBy: actor.sub,
      }, client);

      for (const rule of body.rules) {
        await insertDetectionRule({
          policyVersionId: id,
          category: rule.category,
          ruleName: rule.ruleName,
          severityOverride: rule.severityOverride ?? null,
          conditions: rule.conditions,
          keywords: rule.keywords,
        }, client);
      }

      await auditLog({
        actor: { id: actor.sub, role: actor.role },
        action: AuditActions.POLICY_CREATED,
        entityType: 'policy',
        entityId: id,
        before: null,
        after: { version: body.version, name: body.name, ruleCount: body.rules.length },
        req,
      }, client);

      return id;
    });

    res.status(201).json({ id: policyId });
  } catch (err) { next(err); }
});

/** PATCH /api/admin/policy/:id/activate — make this version the active one */
router.patch('/:id/activate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!;
    const { id } = req.params;

    await withTransaction(async (client) => {
      await activatePolicyVersion(id, client);
      await auditLog({
        actor: { id: actor.sub, role: actor.role },
        action: AuditActions.POLICY_ACTIVATED,
        entityType: 'policy',
        entityId: id,
        before: null,
        after: { activated: true },
        req,
      }, client);
    });

    invalidatePolicyCache();
    res.json({ success: true, id });
  } catch (err) { next(err); }
});

export default router;
