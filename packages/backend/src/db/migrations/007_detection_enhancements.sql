-- Detection Service Enhancements
-- model_version: track which Claude model produced each finding
-- highlight_spans: character offsets into email body for UI highlighting
-- calibrated_confidence: policy-adjusted confidence vs Claude's raw confidence

ALTER TABLE ae_findings
  ADD COLUMN IF NOT EXISTS model_version         TEXT,
  ADD COLUMN IF NOT EXISTS highlight_spans       JSONB,
  -- [{start: int, end: int, text: string}]
  ADD COLUMN IF NOT EXISTS raw_confidence        REAL,
  -- Claude's original confidence (0.0–1.0)
  ADD COLUMN IF NOT EXISTS calibrated_confidence REAL;
  -- Policy-adjusted confidence; null if no rule applied

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS model_version TEXT;
  -- e.g. 'claude-opus-4-6'
