-- Audit Log: append-only, SHA-256 hash-chained
-- Every state mutation must produce an audit entry
-- No UPDATE or DELETE is ever permitted on this table

CREATE TABLE IF NOT EXISTS audit_log (
  id           SERIAL PRIMARY KEY,
  sequence     BIGSERIAL UNIQUE NOT NULL,
  actor_id     UUID,         -- null for system/worker events
  actor_role   TEXT,         -- agent | supervisor | admin | system
  action       TEXT NOT NULL,
  -- See AuditActions constants in @narc/shared
  entity_type  TEXT NOT NULL,  -- event | finding | document | policy | submission | user
  entity_id    TEXT NOT NULL,
  before_state JSONB,
  after_state  JSONB,
  ip_address   TEXT,
  user_agent   TEXT,
  prev_hash    TEXT,          -- hash of the previous row (chain anchor)
  hash         TEXT NOT NULL,  -- SHA-256(sequence|actor_id|action|entity_id|before|after|prev_hash)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor   ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_seq     ON audit_log(sequence);
