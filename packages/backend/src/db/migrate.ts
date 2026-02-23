import fs from 'fs';
import path from 'path';
import { getPool } from './pool';

/**
 * Apply all pending SQL migrations from the migrations/ directory.
 * Migrations are numbered (001_, 002_, etc.) and applied in lexicographic order.
 * Applied migrations are tracked in the `migrations` table — never re-applied.
 */
export async function runMigrations(): Promise<void> {
  const pool = getPool();

  // Bootstrap: create migrations tracking table if it doesn't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id          SERIAL PRIMARY KEY,
      filename    TEXT NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // lexicographic: 001_ < 002_ < ...

  let applied = 0;
  for (const file of files) {
    const { rows } = await pool.query(
      'SELECT 1 FROM migrations WHERE filename = $1',
      [file]
    );
    if (rows.length > 0) continue; // already applied

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`  ✓ Applied migration: ${file}`);
      applied++;
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }

  if (applied === 0) {
    console.log('✅ Database schema up to date (no pending migrations)');
  } else {
    console.log(`✅ Applied ${applied} migration(s)`);
  }
}
