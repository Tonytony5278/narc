-- SLA Engine fields
-- Tracks 24-hour SLA status with escalation levels
-- Deadlines: critical=1h, high=4h, medium=24h, low=7d from detected_at

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS detected_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deadline_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_status       TEXT NOT NULL DEFAULT 'on_track',
  -- sla_status: on_track | at_risk | breached | met
  ADD COLUMN IF NOT EXISTS escalation_level INTEGER NOT NULL DEFAULT 0;
  -- escalation_level: 0=none, 1=50% elapsed, 2=75% elapsed, 3=breached

CREATE INDEX IF NOT EXISTS idx_events_sla_status ON events(sla_status);
CREATE INDEX IF NOT EXISTS idx_events_deadline   ON events(deadline_at);
