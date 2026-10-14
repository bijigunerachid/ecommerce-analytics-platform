# Backend image: the Express API, the outbox relay worker, and the maintenance scripts
# (migrations, create-admin, sample data). The command chooses which one runs.
#
# Build context is the repository root (the sample data generator needs data/samples):
#   docker build -f backend/Dockerfile .
# backend/Dockerfile.dockerignore limits what is sent to the build.
#
# Debian slim rather than Alpine: the Kafka client (librdkafka) ships glibc binaries.

# ---- Dependencies (production only) ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
# npm 10 in this image runs install scripts, which fetch the prebuilt librdkafka binary.
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# ---- Runtime ----
FROM node:22-bookworm-slim
# Apply pending OS security updates on every build.
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    SAMPLE_CATALOG_PATH=/app/data/samples/catalog.json
WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node backend/package.json ./
COPY --chown=node:node backend/src ./src
COPY --chown=node:node backend/scripts ./scripts
COPY --chown=node:node backend/migrations ./migrations
COPY --chown=node:node data/samples ./data/samples

USER node
EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.API_PORT || 4000) + '/api/health/live').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
