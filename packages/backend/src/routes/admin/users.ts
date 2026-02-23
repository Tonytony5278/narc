import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  listUsers,
  createUser,
  setUserActive,
  updateUserRole,
  getUserById,
} from '../../db/queries/users';
import { hashPassword } from '../../auth/password';
import { auditLog } from '../../services/audit';
import { AuditActions } from '@narc/shared';

const router = Router();

const VALID_ROLES = ['agent', 'supervisor', 'admin'] as const;
type Role = (typeof VALID_ROLES)[number];

// ─── GET /api/admin/users ──────────────────────────────────────────────────
// List all users (any status). Admin only (enforced in index.ts).

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await listUsers();
    res.json({
      users: users.map((u) => ({
        id:            u.id,
        email:         u.email,
        role:          u.role,
        is_active:     u.is_active,
        created_at:    u.created_at,
        last_login_at: u.last_login_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/users ────────────────────────────────────────────────
// Create a new user. Generates a temporary password returned once.

const CreateUserSchema = z.object({
  email:    z.string().email(),
  role:     z.enum(VALID_ROLES),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, role, password } = CreateUserSchema.parse(req.body);

    const passwordHash = await hashPassword(password);
    const id = await createUser({ email, passwordHash, role });

    await auditLog({
      actor: { id: req.actor!.sub, role: req.actor!.role },
      action: AuditActions.USER_CREATED,
      entityType: 'user',
      entityId: id,
      before: null,
      after: { email, role },
      req,
    });

    res.status(201).json({ id, email, role, message: 'User created successfully' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message ?? 'Validation error' });
      return;
    }
    // Unique constraint violation (duplicate email)
    if ((err as NodeJS.ErrnoException).code === '23505') {
      res.status(409).json({ error: 'A user with this email already exists' });
      return;
    }
    next(err);
  }
});

// ─── PATCH /api/admin/users/:id ───────────────────────────────────────────
// Update role and/or active status. Cannot demote the last admin.

const PatchUserSchema = z.object({
  role:      z.enum(VALID_ROLES).optional(),
  is_active: z.boolean().optional(),
}).refine((d) => d.role !== undefined || d.is_active !== undefined, {
  message: 'Provide at least one of: role, is_active',
});

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const patch = PatchUserSchema.parse(req.body);

    // Prevent self-deactivation
    if (patch.is_active === false && req.actor?.sub === id) {
      res.status(400).json({ error: 'You cannot deactivate your own account' });
      return;
    }

    const existing = await getUserById(id);
    if (!existing) {
      // Also try inactive users
      const allUsers = await listUsers();
      const target = allUsers.find((u) => u.id === id);
      if (!target) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
    }

    let updated = existing;

    // Update role
    if (patch.role !== undefined) {
      updated = await updateUserRole(id, patch.role);
      await auditLog({
        actor: { id: req.actor!.sub, role: req.actor!.role },
        action: AuditActions.USER_ROLE_CHANGED,
        entityType: 'user',
        entityId: id,
        before: { role: existing?.role },
        after: { role: patch.role },
        req,
      });
    }

    // Update active status
    if (patch.is_active !== undefined) {
      updated = await setUserActive(id, patch.is_active);
      await auditLog({
        actor: { id: req.actor!.sub, role: req.actor!.role },
        action: patch.is_active ? AuditActions.USER_ACTIVATED : AuditActions.USER_DEACTIVATED,
        entityType: 'user',
        entityId: id,
        before: { is_active: existing?.is_active },
        after: { is_active: patch.is_active },
        req,
      });
    }

    res.json({
      id:        updated?.id ?? id,
      email:     updated?.email,
      role:      updated?.role,
      is_active: updated?.is_active,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message ?? 'Validation error' });
      return;
    }
    next(err);
  }
});

// ─── DELETE /api/admin/users/:id ──────────────────────────────────────────
// Soft-delete: sets is_active = false. Hard deletes are prohibited.

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    if (req.actor?.sub === id) {
      res.status(400).json({ error: 'You cannot deactivate your own account' });
      return;
    }

    const updated = await setUserActive(id, false);
    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await auditLog({
      actor: { id: req.actor!.sub, role: req.actor!.role },
      action: AuditActions.USER_DEACTIVATED,
      entityType: 'user',
      entityId: id,
      before: { email: updated.email, is_active: true },
      after: { is_active: false },
      req,
    });

    res.json({ message: 'User deactivated', id });
  } catch (err) {
    next(err);
  }
});

export default router;
