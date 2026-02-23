-- RBAC: Users and role-based access control
-- Roles: agent (own events only), supervisor (all events), admin (full access)

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'agent',
  -- role: agent | supervisor | admin
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

-- Agent ownership on events (row-level security)
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent_id);

-- Insert a default admin user for bootstrapping
-- Password: 'changeme' (bcrypt hash) — MUST be changed in production
INSERT INTO users (email, password_hash, role)
VALUES (
  'admin@narc.local',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6o4Kl5bJGi',
  'admin'
) ON CONFLICT (email) DO NOTHING;
