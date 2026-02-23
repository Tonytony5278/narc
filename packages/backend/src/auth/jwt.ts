import jwt from 'jsonwebtoken';

export interface JWTPayload {
  sub: string;        // user UUID
  email: string;
  role: 'agent' | 'supervisor' | 'admin';
  iat: number;
  exp: number;
}

function getSecret(): string {
  // Fall back to a dev-only constant when NARC_AUTH is disabled.
  // In production (NARC_AUTH=true), JWT_SECRET must be set explicitly.
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NARC_AUTH) {
    throw new Error('JWT_SECRET environment variable is required when NARC_AUTH is enabled');
  }
  return secret ?? 'narc-dev-secret-change-in-production';
}

export function signToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, getSecret(), { expiresIn: '8h' });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, getSecret()) as JWTPayload;
}
