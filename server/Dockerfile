# syntax=docker/dockerfile:1

# ---- build stage: install deps, generate prisma client, compile TS ----
FROM node:20-slim AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci

COPY server ./server
WORKDIR /repo/server
RUN npx prisma generate
RUN npm run build

# ---- production stage: minimal runtime ----
FROM node:20-slim AS production
ENV NODE_ENV=production

# Prisma's query engine needs openssl on Debian-based images
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --uid 1001 --create-home appuser

WORKDIR /app
COPY --from=build /repo/server/package.json ./package.json
COPY --from=build /repo/server/node_modules ./node_modules
COPY --from=build /repo/server/dist ./dist
COPY --from=build /repo/server/prisma ./prisma

RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 4000
ENV PORT=4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 4000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# DATABASE_URL must be supplied at runtime (points at Postgres)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
