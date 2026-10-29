# syntax=docker/dockerfile:1
#
# Build from the repo root (pnpm workspace):
#   docker build -f control-plane/Dockerfile -t samata-control-plane .
#
# On boot the server applies pending migrations (see src/instrumentation.ts),
# so this one image is all a deployment needs.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate
WORKDIR /repo

# ---- deps: cached until the lockfile changes ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY control-plane/package.json control-plane/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter control-plane...

# ---- builder ----
FROM deps AS builder
COPY control-plane control-plane
ENV BUILD_STANDALONE=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    # src/db/index.ts creates the client at import time; nothing connects
    # during the build, it just needs a syntactically valid URL.
    DATABASE_URL=postgres://build:build@localhost:5432/build
RUN pnpm --filter control-plane exec next build

# ---- runner ----
FROM node:22-slim AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /repo
COPY --from=builder --chown=node:node /repo/control-plane/.next/standalone ./
COPY --from=builder --chown=node:node /repo/control-plane/.next/static ./control-plane/.next/static
COPY --from=builder --chown=node:node /repo/control-plane/drizzle ./control-plane/drizzle
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "control-plane/server.js"]
