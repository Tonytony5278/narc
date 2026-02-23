-- NARC database schema
-- Two tables: events (one per email) and ae_findings (one per AE within an email)

CREATE TABLE IF NOT EXISTS events (
  id            TEXT PRIMARY KEY,                          -- UUID v4
  email_id      TEXT NOT NULL,                             -- Office item ID or hash
  subject       TEXT NOT NULL DEFAULT '',
  sender        TEXT NOT NULL DEFAULT '',
  received_at   TEXT NOT NULL,                             -- ISO8601 timestamp
  body_excerpt  TEXT NOT NULL DEFAULT '',                  -- first 500 chars of email body
  ae_count      INTEGER NOT NULL DEFAULT 0,
  max_severity  TEXT NOT NULL DEFAULT 'low',               -- low | medium | high | critical
  status        TEXT NOT NULL DEFAULT 'pending',
  -- status values: pending | reviewed | reported | dismissed | escalated | false_positive
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  raw_request   TEXT NOT NULL DEFAULT '{}',                -- JSON of AnalyzeRequest
  raw_response  TEXT NOT NULL DEFAULT '{}'                 -- JSON of AnalyzeResponse from Claude
);

CREATE TABLE IF NOT EXISTS ae_findings (
  id          TEXT PRIMARY KEY,                            -- UUID v4
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  excerpt     TEXT NOT NULL,                               -- verbatim quote from email
  category    TEXT NOT NULL,                               -- AECategory enum value
  severity    TEXT NOT NULL,                               -- AESeverity enum value
  explanation TEXT NOT NULL,                               -- Claude's regulatory reasoning
  urgency     TEXT NOT NULL,                               -- AEUrgency enum value
  confidence  REAL NOT NULL DEFAULT 0.0,                   -- 0.0 to 1.0
  status      TEXT NOT NULL DEFAULT 'pending',             -- pending | reported | dismissed
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common dashboard query patterns
CREATE INDEX IF NOT EXISTS idx_events_status     ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_received   ON events(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_severity   ON events(max_severity);
CREATE INDEX IF NOT EXISTS idx_events_sender     ON events(sender);
CREATE INDEX IF NOT EXISTS idx_findings_event    ON ae_findings(event_id);
CREATE INDEX IF NOT EXISTS idx_findings_category ON ae_findings(category);
CREATE INDEX IF NOT EXISTS idx_findings_status   ON ae_findings(status);
