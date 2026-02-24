-- Call sessions table
CREATE TABLE IF NOT EXISTS calls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_call_id VARCHAR(255),          -- platform's own call/recording ID
  platform        VARCHAR(50) NOT NULL,   -- 'amazon_connect' | 'genesys' | 'ringcentral' | 'manual' | 'webhook' | etc.
  agent_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  agent_email     VARCHAR(255),
  patient_ref     VARCHAR(255),           -- anonymized patient reference (not PHI)
  drug_name       VARCHAR(255),           -- optional: drug associated with this call
  direction       VARCHAR(10) DEFAULT 'inbound',  -- 'inbound' | 'outbound'
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  duration_seconds INTEGER,
  recording_url   TEXT,                   -- original recording URL (S3, GCS, etc.) — may be null if uploaded directly
  transcript      TEXT,                   -- full Whisper transcript
  transcript_language VARCHAR(10),
  ae_count        INTEGER NOT NULL DEFAULT 0,
  max_severity    VARCHAR(20) DEFAULT 'low',
  status          VARCHAR(30) NOT NULL DEFAULT 'pending_review',  -- pending_review | reviewed | reported | dismissed | false_positive
  notes           TEXT,
  detected_at     TIMESTAMPTZ,
  deadline_at     TIMESTAMPTZ,
  sla_status      VARCHAR(20) DEFAULT 'on_track',
  escalation_level INTEGER DEFAULT 0,
  policy_version_id UUID REFERENCES policy_versions(id) ON DELETE SET NULL,
  model_version   VARCHAR(50),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AE findings linked to calls
CREATE TABLE IF NOT EXISTS call_ae_findings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id         UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  category        VARCHAR(50) NOT NULL,
  severity        VARCHAR(20) NOT NULL,
  urgency         VARCHAR(20) NOT NULL,
  excerpt         TEXT NOT NULL,          -- the transcript sentence(s) that triggered the finding
  explanation     TEXT NOT NULL,
  confidence      NUMERIC(3,2),
  status          VARCHAR(30) NOT NULL DEFAULT 'pending',  -- pending | confirmed | dismissed | false_positive
  highlight_start INTEGER,               -- character offset in transcript
  highlight_end   INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_platform ON calls(platform);
CREATE INDEX IF NOT EXISTS idx_calls_detected_at ON calls(detected_at);
CREATE INDEX IF NOT EXISTS idx_calls_sla_status ON calls(sla_status);
CREATE INDEX IF NOT EXISTS idx_call_ae_findings_call_id ON call_ae_findings(call_id);
CREATE INDEX IF NOT EXISTS idx_calls_external_call_id ON calls(external_call_id);
