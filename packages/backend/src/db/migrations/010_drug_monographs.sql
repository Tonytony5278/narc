-- Health Canada drug monograph registry.
-- Stores approved dosing, approved indications, and off-label signal patterns
-- used to detect regulatory deviations in patient communications.

CREATE TABLE IF NOT EXISTS drug_monographs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name           TEXT NOT NULL UNIQUE,          -- e.g. "Avsola"
  generic_name         TEXT NOT NULL,                 -- e.g. "infliximab-axxq"
  din                  TEXT,                          -- Health Canada Drug Identification Number
  approved_indications TEXT[] NOT NULL DEFAULT '{}',  -- array of approved indication strings
  approved_dosing      JSONB NOT NULL DEFAULT '{}',   -- {induction: "...", maintenance: "..."}
  max_daily_dose       TEXT,                          -- e.g. "5mg/kg"
  off_label_signals    JSONB NOT NULL DEFAULT '[]',   -- [{pattern: "q4w", flag: "Interval halved — approved q8W"}]
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monographs_brand   ON drug_monographs(LOWER(brand_name));
CREATE INDEX IF NOT EXISTS idx_monographs_generic ON drug_monographs(LOWER(generic_name));
