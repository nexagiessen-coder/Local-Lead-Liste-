# syntax=docker/dockerfile:1

# NEXA Leads — production image.
#
# Three stages so the shipped image carries no build tools and no source:
# install → build → run. The runtime stage holds only the standalone server
# bundle, the static assets and the SQL migrations. Data lives in a Postgres
# database (Supabase), reached over the network via DATABASE_URL — the image
# itself carries no database and needs no build toolchain for one, since `pg`
# is a pure-JS driver with no native addon to compile.

# --- Stage 1: dependencies ---------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# --- Stage 2: build ----------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- Stage 3: runtime --------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nexa

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Migrations are read at runtime from a path resolved against the working
# directory, so they are copied explicitly rather than left to file tracing.
COPY --from=builder /app/src/lib/db/migrations ./src/lib/db/migrations

RUN chown -R nexa:nodejs /app
USER nexa

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
