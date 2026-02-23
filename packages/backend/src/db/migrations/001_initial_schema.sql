-- NARC initial PostgreSQL schema
-- Replaces SQLite schema.sql
-- Uses native UUID, JSONB, TIMESTAMPTZ

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id     TEXT NOT NULL,
  subject      TEXT NOT NULL DEFAULT '',
  sender       TEXT NOT NULL DEFAULT '',
  received_at  TIMESTAMPTZ NOT NULL,
  body_excerpt TEXT NOT NULL DEFAULT '',
  ae_count     INTEGER NOT NULL DEFAULT 0,
  max_severity TEXT NOT NULL DEFAULT 'low',
  -- max_severity: low | medium | high | critical
  status       TEXT NOT NULL DEFAULT 'pending',
  -- status: pending | reviewed | reported | dismissed | escalated | false_positive
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_request  JSONB NOT NULL DEFAULT '{}',
  raw_response JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS ae_findings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  excerpt     TEXT NOT NULL,
  category    TEXT NOT NULL,
  severity    TEXT NOT NULL,
  explanation TEXT NOT NULL,
  urgency     TEXT NOT NULL,
  confidence  REAL NOT NULL DEFAULT 0.0,
  status      TEXT NOT NULL DEFAULT 'pending',
  -- status: pending | reported | dismissed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Common query indexes
CREATE INDEX IF NOT EXISTS idx_events_status     ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_received   ON events(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_severity   ON events(max_severity);
CREATE INDEX IF NOT EXISTS idx_events_sender     ON events(sender);
CREATE INDEX IF NOT EXISTS idx_findings_event    ON ae_findings(event_id);
CREATE INDEX IF NOT EXISTS idx_findings_category ON ae_findings(category);
CREATE INDEX IF NOT EXISTS idx_findings_status   ON ae_findings(status);
