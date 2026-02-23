# ── Stage 1: Build ──────────────────────────────────────────────────────────
# Node to compile TypeScript + Vite bundle
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json    ./packages/shared/
COPY packages/dashboard/package.json ./packages/dashboard/

RUN npm ci

# Build shared types (TypeScript imports during dashboard tsc check)
COPY packages/shared ./packages/shared
RUN npm run build -w packages/shared

# Build dashboard (tsc + vite build → packages/dashboard/dist/)
COPY packages/dashboard ./packages/dashboard
RUN npm run build -w packages/dashboard


# ── Stage 2: nginx runtime ──────────────────────────────────────────────────
# Serve the static bundle and proxy /api to the backend
FROM nginx:1.25-alpine AS runtime

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

COPY --from=builder /app/packages/dashboard/dist /usr/share/nginx/html
COPY packages/dashboard/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Validate nginx config at build time
RUN nginx -t

CMD ["nginx", "-g", "daemon off;"]
