import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/errorHandler';
import { requireAuth, requireRole } from './middleware/auth';
import { initPool } from './db/pool';
import { runMigrations } from './db/migrate';
import { startSlaWorker } from './workers/sla-worker';
import { startMailMonitor } from './services/mailMonitor';

import analyzeRouter from './routes/analyze';
import eventsRouter from './routes/events';
import demoRouter from './routes/demo';
import authRouter from './routes/auth';
import policyRouter from './routes/policy';
import casesRouter from './routes/cases';
import auditRouter from './routes/admin/audit';
import usersRouter from './routes/admin/users';
import monitorRouter from './routes/admin/monitor';
import documentsRouter from './routes/documents';
import monographsRouter from './routes/monographs';

// ─── Validate required env vars ───────────────────────────────────────────

const requiredEnvVars = ['ANTHROPIC_API_KEY', 'DATABASE_URL'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    console.error(`   Copy .env.example to .env and fill in your values.`);
    process.exit(1);
  }
}

// ─── Async startup ────────────────────────────────────────────────────────

async function main() {
  // 1. Initialise PostgreSQL pool
  initPool();
  console.log('[startup] PostgreSQL pool initialised');

  // 2. Run numbered SQL migrations
  const applied = await runMigrations();
  console.log(`[startup] Migrations applied: ${applied}`);

  // 3. Create Express app
  const app = express();

  app.use(corsMiddleware);
  app.use(express.json({ limit: '2mb' }));

  // ─── Health check ──────────────────────────────────────────────────────

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      db: 'postgresql',
      migrations: applied,
      timestamp: new Date().toISOString(),
      version: '2.0.0',
    });
  });

  // ─── Public routes ────────────────────────────────────────────────────

  app.use('/api/auth', authRouter);
  app.use('/api/demo', demoRouter);

  // ─── Protected routes ─────────────────────────────────────────────────

  app.use('/api/analyze', analyzeRouter);
  app.use('/api/events', eventsRouter);

  // Documents are nested under events: /api/events/:id/documents
  app.use('/api/events/:id/documents', requireAuth, documentsRouter);

  // Cases: supervisor/admin only
  app.use('/api/cases', requireAuth, requireRole('supervisor', 'admin'), casesRouter);

  // Monographs: public read, admin write (middleware inside router)
  app.use('/api/monographs', monographsRouter);

  // Admin routes
  app.use('/api/admin/policy', requireAuth, requireRole('admin'), policyRouter);
  app.use('/api/admin/audit', requireAuth, requireRole('admin'), auditRouter);
  app.use('/api/admin/users', requireAuth, requireRole('admin'), usersRouter);
  app.use('/api/admin/monitor', requireAuth, requireRole('admin'), monitorRouter);

  // ─── 404 handler ──────────────────────────────────────────────────────

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // ─── Error handler (must be last) ─────────────────────────────────────

  app.use(errorHandler);

  // ─── Start SLA worker ─────────────────────────────────────────────────

  startSlaWorker();
  console.log('[startup] SLA worker started (1-minute tick)');

  // ─── Start mail monitor (if MONITOR_EMAIL_* env vars are set) ─────────────
  startMailMonitor();

  // ─── Start server ──────────────────────────────────────────────────────

  const PORT = parseInt(process.env.PORT ?? '3001', 10);

  app.listen(PORT, () => {
    console.log(`\n🚀 NARC Backend v2 running on http://localhost:${PORT}`);
    console.log(`   Health:      GET  http://localhost:${PORT}/health`);
    console.log(`   Auth:        POST http://localhost:${PORT}/api/auth/login`);
    console.log(`   Analyze:     POST http://localhost:${PORT}/api/analyze`);
    console.log(`   Events:      GET  http://localhost:${PORT}/api/events`);
    console.log(`   Cases:       POST http://localhost:${PORT}/api/cases/:id/submit`);
    console.log(`   Monographs:  GET  http://localhost:${PORT}/api/monographs`);
    console.log(`   Admin Audit: GET  http://localhost:${PORT}/api/admin/audit`);
    console.log(`   Demo STT:    POST http://localhost:${PORT}/api/demo/transcribe\n`);
  });

  return app;
}

main().catch((err) => {
  console.error('❌ Fatal startup error:', err);
  process.exit(1);
});

export default main;
