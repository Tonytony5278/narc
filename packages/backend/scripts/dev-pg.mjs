/**
 * dev-pg.mjs — Development startup helper (no system PostgreSQL required)
 *
 * Starts an embedded PostgreSQL instance, ensures the "narc" database exists,
 * then launches the backend with the correct DATABASE_URL injected.
 *
 * Usage:  node scripts/dev-pg.mjs
 */

import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PG_DIR = path.join(ROOT, '.pg-data');
const PG_PORT = 5432;
const PG_USER = 'postgres';
const PG_PASSWORD = 'postgres';
const PG_DB = 'narc';
const DATABASE_URL = `postgresql://${PG_USER}:${PG_PASSWORD}@localhost:${PG_PORT}/${PG_DB}`;

const pg = new EmbeddedPostgres({
  databaseDir: PG_DIR,
  user: PG_USER,
  password: PG_PASSWORD,
  port: PG_PORT,
  persistent: true,
});

async function main() {
  // Force-load .env (override shell env vars that may be empty)
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(ROOT, '.env'), override: true });

  console.log('[dev-pg] Starting embedded PostgreSQL...');

  if (!fs.existsSync(PG_DIR)) {
    console.log('[dev-pg] Initialising new database cluster...');
    await pg.initialise();
  } else {
    // Clean up stale lock/pid files from a previous crash so pg.start() succeeds
    const staleFiles = ['postmaster.pid', 'postmaster.opts'];
    for (const f of staleFiles) {
      const p = path.join(PG_DIR, f);
      if (fs.existsSync(p)) {
        fs.rmSync(p);
        console.log(`[dev-pg] Removed stale file: ${f}`);
      }
    }
  }

  await pg.start();
  console.log(`[dev-pg] PostgreSQL running on port ${PG_PORT}`);

  // Create the "narc" database if it doesn't exist
  const client = pg.getPgClient();
  await client.connect();
  const { rows } = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = $1", [PG_DB]
  );
  if (rows.length === 0) {
    await client.query(`CREATE DATABASE ${PG_DB}`);
    console.log(`[dev-pg] Created database "${PG_DB}"`);
  } else {
    console.log(`[dev-pg] Database "${PG_DB}" already exists`);
  }
  await client.end();

  // Resolve tsx
  const tsxBin = path.join(ROOT, '..', '..', 'node_modules', '.bin', 'tsx.cmd');

  console.log('[dev-pg] Starting NARC backend...\n');

  // Build the env for the server process — dotenv.config({override:true}) already
  // updated process.env, so process.env has the correct API keys now.
  const serverEnv = {
    ...process.env,
    DATABASE_URL,           // always point to our embedded instance
    DOTENV_CONFIG_OVERRIDE: 'true',  // tell dotenv in index.ts to override too
  };

  const server = spawn(tsxBin, ['watch', path.join(ROOT, 'src', 'index.ts')], {
    cwd: ROOT,
    env: serverEnv,
    stdio: 'inherit',
    shell: true,
  });

  const shutdown = async () => {
    console.log('\n[dev-pg] Shutting down...');
    server.kill();
    await pg.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.on('exit', async (code) => {
    console.log(`[dev-pg] Backend exited with code ${code}`);
    await pg.stop();
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('[dev-pg] Fatal error:', err);
  process.exit(1);
});
