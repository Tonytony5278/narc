-- Policy Engine: versioned detection rule governance
-- Each analysis run records which policy version was active

CREATE TABLE IF NOT EXISTS policy_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version        TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  is_active      BOOLEAN NOT NULL DEFAULT FALSE,
  effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     UUID,  -- FK to users added in 006
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS detection_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version_id UUID NOT NULL REFERENCES policy_versions(id) ON DELETE CASCADE,
  category          TEXT NOT NULL,
  rule_name         TEXT NOT NULL,
  severity_override TEXT,  -- null = no override; else overrides Claude's severity
  is_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  conditions        JSONB NOT NULL DEFAULT '{}',
  keywords          TEXT[] NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one policy version can be active at a time
-- Enforced at application layer via invalidatePolicyCache + explicit deactivation
CREATE INDEX IF NOT EXISTS idx_policy_versions_active ON policy_versions(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_detection_rules_policy ON detection_rules(policy_version_id);
CREATE INDEX IF NOT EXISTS idx_detection_rules_cat    ON detection_rules(category);

-- Link each analyzed event to the policy version used
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS policy_version_id UUID REFERENCES policy_versions(id);
