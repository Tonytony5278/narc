import { Pool, PoolClient } from 'pg';

let pool: Pool;

export function initPool(): void {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL environment variable is required');

  pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err);
  });

  console.log('✅ PostgreSQL pool initialized');
}

export function getPool(): Pool {
  if (!pool) throw new Error('Database pool not initialized. Call initPool() first.');
  return pool;
}

/**
 * Run a set of operations inside a single ACID transaction.
 * On success: COMMIT. On any error: ROLLBACK + rethrow.
 * Pass the PoolClient to query helpers so they share the same connection.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
