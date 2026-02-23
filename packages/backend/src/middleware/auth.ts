import { Request, Response, NextFunction } from 'express';
import { verifyToken, JWTPayload } from '../auth/jwt';

// ─── Extend Express Request ────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: JWTPayload;
    }
  }
}

// ─── Dev/demo bypass identity ─────────────────────────────────────────────

const MOCK_ADMIN: JWTPayload = {
  sub: '00000000-0000-0000-0000-000000000001',
  email: 'dev@narc.local',
  role: 'admin',
  iat: 0,
  exp: 9_999_999_999,
};

// ─── Middleware ───────────────────────────────────────────────────────────

/**
 * Authenticate request via Bearer JWT token.
 * When NARC_AUTH env is unset/empty, injects a mock admin — no token needed.
 * This allows zero-config local development without auth setup.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Dev bypass
  if (!process.env.NARC_AUTH) {
    req.actor = MOCK_ADMIN;
    return next();
  }

  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Unauthorized — missing Bearer token' });
    return;
  }

  try {
    req.actor = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized — invalid or expired token' });
  }
}

/**
 * Require one of the listed roles. Must be used AFTER requireAuth.
 */
export function requireRole(
  ...roles: Array<'agent' | 'supervisor' | 'admin'>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.actor || !roles.includes(req.actor.role)) {
      res.status(403).json({ error: 'Forbidden — insufficient role' });
      return;
    }
    next();
  };
}
