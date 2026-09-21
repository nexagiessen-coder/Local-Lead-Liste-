#!/usr/bin/env bash
#
# Pull the latest code and redeploy. The database lives in Supabase, outside
# this VPS entirely, so a redeploy here never touches it.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/nexa-leads}"
BRANCH="${BRANCH:-claude/local-lead-list-app-drb359}"
ENV_FILE="$APP_DIR/deploy/hostinger/.env"
COMPOSE="docker compose --env-file $ENV_FILE -f deploy/hostinger/docker-compose.yml"

cd "$APP_DIR"
[ -f "$ENV_FILE" ] || { echo "No $ENV_FILE — run setup.sh first." >&2; exit 1; }

echo "==> Backing up the database first"
bash deploy/hostinger/backup.sh

echo "==> Fetching $BRANCH"
git fetch --quiet origin "$BRANCH"
git checkout --quiet "$BRANCH"
git reset --hard --quiet "origin/$BRANCH"

echo "==> Rebuilding and restarting"
# shellcheck disable=SC2086
$COMPOSE up -d --build

echo "==> Done. Logs: $COMPOSE logs -f app"
