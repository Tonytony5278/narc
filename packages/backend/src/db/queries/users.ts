import { PoolClient } from 'pg';
import { getPool } from '../pool';

function db(client?: PoolClient) {
  return client ?? getPool();
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  is_active: boolean;
  created_at: Date;
  last_login_at: Date | null;
}

export async function getUserByEmail(
  email: string,
  client?: PoolClient
): Promise<UserRow | null> {
  const { rows } = await db(client).query<UserRow>(
    'SELECT * FROM users WHERE email = $1 AND is_active = TRUE',
    [email]
  );
  return rows[0] ?? null;
}

export async function getUserById(
  id: string,
  client?: PoolClient
): Promise<UserRow | null> {
  const { rows } = await db(client).query<UserRow>(
    'SELECT * FROM users WHERE id = $1 AND is_active = TRUE',
    [id]
  );
  return rows[0] ?? null;
}

export async function updateLastLogin(
  id: string,
  client?: PoolClient
): Promise<void> {
  await db(client).query(
    'UPDATE users SET last_login_at = NOW() WHERE id = $1',
    [id]
  );
}

export async function createUser(params: {
  email: string;
  passwordHash: string;
  role: string;
}, client?: PoolClient): Promise<string> {
  const { rows } = await db(client).query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id`,
    [params.email, params.passwordHash, params.role]
  );
  return rows[0].id;
}

export async function listUsers(client?: PoolClient): Promise<UserRow[]> {
  const { rows } = await db(client).query<UserRow>(
    `SELECT id, email, password_hash, role, is_active, created_at, last_login_at
     FROM users ORDER BY created_at ASC`
  );
  return rows;
}

export async function setUserActive(
  id: string,
  isActive: boolean,
  client?: PoolClient
): Promise<UserRow | null> {
  const { rows } = await db(client).query<UserRow>(
    `UPDATE users SET is_active = $2 WHERE id = $1
     RETURNING id, email, password_hash, role, is_active, created_at, last_login_at`,
    [id, isActive]
  );
  return rows[0] ?? null;
}

export async function updateUserRole(
  id: string,
  role: string,
  client?: PoolClient
): Promise<UserRow | null> {
  const { rows } = await db(client).query<UserRow>(
    `UPDATE users SET role = $2 WHERE id = $1
     RETURNING id, email, password_hash, role, is_active, created_at, last_login_at`,
    [id, role]
  );
  return rows[0] ?? null;
}
