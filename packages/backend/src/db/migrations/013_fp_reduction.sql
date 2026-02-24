-- ── 013_fp_reduction.sql ─────────────────────────────────────────────────────
-- False Positive Reduction System
-- Adds three additive columns to support:
--   1. Dismiss reason capture on ae_findings
--   2. Pre-screener audit on events
--   3. Confidence threshold per detection rule
--
-- All changes are additive (IF NOT EXISTS / default NULL) — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── ae_findings: dismiss reason capture ─────────────────────────────────────

ALTER TABLE ae_findings
  ADD COLUMN IF NOT EXISTS dismiss_reason TEXT,
  ADD COLUMN IF NOT EXISTS dismissed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dismissed_at   TIMESTAMPTZ;

-- Partial index: only rows that actually have a dismiss reason (keeps index small)
CREATE INDEX IF NOT EXISTS idx_findings_dismiss_reason
  ON ae_findings(dismiss_reason) WHERE dismiss_reason IS NOT NULL;

-- ── events: pre-screener audit ───────────────────────────────────────────────

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS prescreener_passed  BOOLEAN,
  ADD COLUMN IF NOT EXISTS prescreener_reason  TEXT;

-- ── detection_rules: per-rule confidence floor ───────────────────────────────

ALTER TABLE detection_rules
  ADD COLUMN IF NOT EXISTS min_confidence REAL;
