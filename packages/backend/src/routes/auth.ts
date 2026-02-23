import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getUserByEmail, updateLastLogin } from '../db/queries/users';
import { verifyPassword } from '../auth/password';
import { signToken } from '../auth/jwt';
import { auditLog } from '../services/audit';
import { AuditActions } from '@narc/shared';

const router = Router();

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * POST /api/auth/login
 * Returns a signed JWT + user object on success.
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = LoginSchema.parse(req.body);

    const user = await getUserByEmail(email);

    if (!user) {
      // Audit failed attempt (no actor — unknown user)
      await auditLog({
        actor: { id: '00000000-0000-0000-0000-000000000000', role: 'system' },
        action: AuditActions.LOGIN_FAILED,
        entityType: 'user',
        entityId: email,
        before: null,
        after: { reason: 'user_not_found' },
        req,
      });
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      await auditLog({
        actor: { id: user.id, role: user.role },
        action: AuditActions.LOGIN_FAILED,
        entityType: 'user',
        entityId: user.id,
        before: null,
        after: { reason: 'bad_password' },
        req,
      });
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Update last_login_at
    await updateLastLogin(user.id);

    const token = signToken({
      sub: user.id,
      email: user.email,
      role: user.role as 'agent' | 'supervisor' | 'admin',
    });

    await auditLog({
      actor: { id: user.id, role: user.role },
      action: AuditActions.LOGIN,
      entityType: 'user',
      entityId: user.id,
      before: null,
      after: { email: user.email, role: user.role },
      req,
    });

    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
