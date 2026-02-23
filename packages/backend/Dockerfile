# ── Stage 1: Build ──────────────────────────────────────────────────────────
# Install all deps, compile TypeScript, copy SQL migrations into dist/
FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json   ./packages/shared/
COPY packages/backend/package.json  ./packages/backend/

RUN npm ci

# Build shared types (backend imports from @narc/shared)
COPY packages/shared ./packages/shared
RUN npm run build -w packages/shared

# Build backend (tsc → dist/)
COPY packages/backend ./packages/backend
RUN npm run build -w packages/backend

# SQL migrations are read from __dirname at runtime (dist/db/migrations/)
RUN cp -r packages/backend/src/db/migrations packages/backend/dist/db/migrations


# ── Stage 2: Runtime ────────────────────────────────────────────────────────
# Lean production image — no dev dependencies, no source files
FROM node:20-alpine AS runtime
WORKDIR /app

# Re-install production deps only (workspace symlinks are set up here)
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json   ./packages/shared/
COPY packages/backend/package.json  ./packages/backend/
RUN npm ci --omit=dev

# Copy compiled artifacts from builder
COPY --from=builder /app/packages/shared/dist  ./packages/shared/dist
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist

EXPOSE 3001
ENV NODE_ENV=production

# Healthcheck — used by docker-compose depends_on: condition: service_healthy
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "packages/backend/dist/index.js"]
