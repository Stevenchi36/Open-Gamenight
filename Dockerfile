# syntax=docker/dockerfile:1
# Production image: the server runs its TypeScript directly, so the only build is the client.
# The repo layout is kept as is (the server finds its root by pnpm-workspace.yaml and serves
# apps/client/dist from there).
ARG NODE_VERSION=26
ARG PNPM_VERSION=12.14.0

# The client bundle is the same on every architecture, so it builds once on the builder's own
# platform instead of under emulation for each target.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-slim AS client
ARG PNPM_VERSION
ENV CI=true
# Node 25+ no longer ships Corepack.
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# From the folder, like scripts/deploy.sh.
RUN cd apps/client && pnpm exec vite build

# Production dependencies only, installed for the target platform.
FROM node:${NODE_VERSION}-slim AS deps
ARG PNPM_VERSION
ENV CI=true
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --prod

FROM node:${NODE_VERSION}-slim
ENV NODE_ENV=production \
    AUTH_DB_PATH=/data/auth.db \
    GAMES_DB_PATH=/data/games.db
WORKDIR /app
COPY --from=deps /app /app
COPY --from=client /app/apps/client/dist /app/apps/client/dist
# Owned by the unprivileged user so a new named volume starts out writable.
RUN mkdir /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/config').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# Exec form, not `pnpm start`: node must receive SIGTERM itself to send players the restart notice.
CMD ["node", "apps/server/src/index.ts"]
