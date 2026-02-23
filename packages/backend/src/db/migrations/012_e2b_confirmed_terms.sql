-- Migration 012: E2B confirmed MedDRA terms
-- Stores QP-confirmed MedDRA codes per finding so they persist across sessions.
-- When a QP confirms (or edits) an AI suggestion, it is written here.
-- The E2B export service loads confirmed terms on next load, bypassing the AI re-call.

CREATE TABLE IF NOT EXISTS e2b_meddra_terms (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id      UUID        NOT NULL REFERENCES ae_findings(id) ON DELETE CASCADE,
  event_id        UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,

  -- LLT (Lowest Level Term) — most specific
  llt_code        TEXT        NOT NULL DEFAULT '00000',
  llt_term        TEXT        NOT NULL DEFAULT '',

  -- PT (Preferred Term)
  pt_code         TEXT        NOT NULL DEFAULT '00000',
  pt_term         TEXT        NOT NULL DEFAULT '',

  -- HLT (High Level Term)
  hlt_code        TEXT        NOT NULL DEFAULT '00000',
  hlt_term        TEXT        NOT NULL DEFAULT '',

  -- HLGT (High Level Group Term)
  hlgt_code       TEXT        NOT NULL DEFAULT '00000',
  hlgt_term       TEXT        NOT NULL DEFAULT '',

  -- SOC (System Organ Class)
  soc_code        TEXT        NOT NULL DEFAULT '00000',
  soc_term        TEXT        NOT NULL DEFAULT '',

  -- Metadata
  confidence      TEXT        NOT NULL DEFAULT 'low',   -- 'high' | 'medium' | 'low'
  ai_generated    BOOLEAN     NOT NULL DEFAULT true,
  confirmed_by    UUID        REFERENCES users(id),     -- NULL until confirmed by QP
  confirmed_at    TIMESTAMPTZ,
  meddra_version  TEXT        NOT NULL DEFAULT '27.0',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_e2b_finding UNIQUE (finding_id)
);

CREATE INDEX IF NOT EXISTS idx_e2b_event ON e2b_meddra_terms(event_id);
CREATE INDEX IF NOT EXISTS idx_e2b_confirmed ON e2b_meddra_terms(confirmed_by) WHERE confirmed_by IS NOT NULL;
