-- Integration Layer: Case Packet Submissions
-- Tracks safety mailbox submissions per case

CREATE TABLE IF NOT EXISTS submissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  submitted_by UUID REFERENCES users(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  destination  TEXT NOT NULL,
  -- e.g. 'safety-mailbox@amgen.com' or 'FDA-MedWatch'
  packet_json  JSONB NOT NULL DEFAULT '{}',
  -- Full case packet snapshot at time of submission
  status       TEXT NOT NULL DEFAULT 'pending'
  -- pending | sent | acknowledged | failed
);

CREATE INDEX IF NOT EXISTS idx_submissions_event  ON submissions(event_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_by     ON submissions(submitted_by);
