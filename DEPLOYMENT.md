# NARC — Deployment Guide

NARC runs as three Docker containers orchestrated by docker-compose:

| Container   | Role                                        |
|-------------|---------------------------------------------|
| `postgres`  | PostgreSQL 16 — persistent AE/event storage |
| `backend`   | Express API + Claude AE detection engine    |
| `dashboard` | nginx serving the React SPA + `/api` proxy  |

---

## Prerequisites

- Docker ≥ 24 with Docker Compose V2
- An **Anthropic API key** (from [console.anthropic.com](https://console.anthropic.com))
- Ports 80 (or your chosen `DASHBOARD_PORT`) available on the host

---

## Quick Start

```bash
# 1. Clone and enter the repo
git clone <repo-url> && cd narc

# 2. Create your environment file
cp .env.example .env

# 3. Fill in the three required values in .env:
#    ANTHROPIC_API_KEY=sk-ant-...
#    DB_PASSWORD=<strong-random-password>
#    JWT_SECRET=<strong-random-secret>

# 4. Build and start all services
docker compose up --build -d

# 5. Tail logs to confirm startup
docker compose logs -f backend

# 6. Open the dashboard
open http://localhost
```

The backend automatically runs all database migrations on first start.
The default dev admin account is seeded by migration `009_dev_admin_seed.sql`.

---

## First-Time Admin Setup

After startup, log in with the seeded admin credentials, then:

1. **Create real user accounts** — Admin → Users tab → Create User
2. **Activate a policy** — Admin → Policy tab → Activate (or create a new one)
3. **Configure mail monitor** — Set `IMAP_*` vars in `.env` and restart, or use Admin → Monitor

---

## Environment Variables

See [`.env.example`](.env.example) for full documentation.
Only three variables are strictly required:

| Variable            | Description                          |
|---------------------|--------------------------------------|
| `ANTHROPIC_API_KEY` | Claude API key                       |
| `DB_PASSWORD`       | PostgreSQL password (any strong value)|
| `JWT_SECRET`        | JWT signing secret (any strong value) |

---

## Useful Commands

```bash
# View all container logs
docker compose logs -f

# Restart only the backend (e.g. after .env change)
docker compose restart backend

# Stop everything (data is preserved in the pgdata volume)
docker compose down

# Stop and wipe all data (DESTRUCTIVE)
docker compose down -v

# Rebuild after a code change
docker compose up --build -d

# Open a psql shell
docker compose exec postgres psql -U narc -d narc

# Check backend health
curl http://localhost/health
```

---

## HTTPS / Production

For production deployments with TLS, place a reverse proxy (Caddy, nginx, Traefik) in front of the `dashboard` container:

**Example with Caddy** (`Caddyfile`):
```
narc.yourorg.com {
    reverse_proxy localhost:80
}
```
Caddy handles Let's Encrypt certificate renewal automatically.

Alternatively, set `DASHBOARD_PORT=8080` in `.env` and terminate TLS at your load balancer.

---

## Architecture Notes

- The dashboard container serves static files and proxies `/api/*` to `backend:3001` via nginx.
- Backend migrations run automatically at startup — safe to re-run (idempotent).
- The `pgdata` Docker volume persists the database across container restarts.
- The mail monitor (IMAP) and SLA worker run as background processes inside the backend container.
- Audit entries are SHA-256 hash-chained — tampering is detectable without a separate audit service.
