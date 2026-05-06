# syntax=docker/dockerfile:1.7

# ── Build stage ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build


# ── Runtime stage ─────────────────────────────────────────────────────────
# nginx-unprivileged runs as uid 101 — lets us drop the cap_net_bind hack
# and stay non-root from the start.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# `gettext` is small (~100KB) and the source of `envsubst`.
USER root
RUN apk add --no-cache gettext

# Static assets from the build. --chown=101 so the runtime user can write
# config.js back into this directory at container start (envsubst step).
COPY --from=builder --chown=101:0 /app/dist /usr/share/nginx/html

# Runtime env-injection scaffolding.
COPY --chown=101:0 config.js.template /usr/share/nginx/html/config.js.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Site config (SPA try_files, /assets/ caching, /config.js no-store).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Drop back to the unprivileged user before running.
USER 101
EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=3s --retries=3 \
    CMD wget -qO- http://localhost:8080/healthz || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
