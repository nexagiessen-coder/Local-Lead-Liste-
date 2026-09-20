#!/usr/bin/env bash
#
# Write a consistent copy of the database to /opt/nexa-leads-backups.
#
# Uses SQLite's own online backup, so it is safe to run while the app is
# serving. Keeps the 14 most recent copies.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/nexa-leads}"
BACKUP_DIR="${BACKUP_DIR:-/opt/nexa-leads-backups}"
KEEP="${KEEP:-14}"
ENV_FILE="$APP_DIR/deploy/hostinger/.env"
COMPOSE="docker compose --env-file $ENV_FILE -f deploy/hostinger/docker-compose.yml"

cd "$APP_DIR"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_DIR/nexa-leads-$STAMP.sqlite"

# better-sqlite3 is already in the image, so no extra tooling is needed.
# shellcheck disable=SC2086
$COMPOSE exec -T app node -e "
  const Database = require('better-sqlite3');
  const db = new Database(process.env.DATABASE_PATH, { readonly: true });
  db.exec(\"VACUUM INTO '/app/data/.backup.tmp'\");
  db.close();
" >/dev/null

# shellcheck disable=SC2086
$COMPOSE cp app:/app/data/.backup.tmp "$TARGET"
# shellcheck disable=SC2086
$COMPOSE exec -T app rm -f /app/data/.backup.tmp

echo "Backup written: $TARGET ($(du -h "$TARGET" | cut -f1))"

ls -1t "$BACKUP_DIR"/nexa-leads-*.sqlite 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
  rm -f "$old"
  echo "Removed old backup: $old"
done
