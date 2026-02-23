-- Ensure the dev-bypass mock admin user exists with the exact UUID used in
-- middleware/auth.ts MOCK_ADMIN. Without this, the events.agent_id FK fails
-- in development mode where all requests are attributed to this user.
INSERT INTO users (id, email, password_hash, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'dev-admin@narc.local',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6o4Kl5bJGi',
  'admin'
) ON CONFLICT (id) DO NOTHING;
