#!/usr/bin/env bash
#
# Write a SQL dump of the Supabase database to /opt/nexa-leads-backups.
#
# The database itself lives in Supabase, not on this VPS — Supabase keeps its
# own backups depending on your project's plan (check the Supabase dashboard
# under Database -> Backups). This script is an extra, independent copy you
# control, taken with `pg_dump` (safe to run while the app is serving).
# Keeps the 14 most recent copies.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/nexa-leads}"
BACKUP_DIR="${BACKUP_DIR:-/opt/nexa-leads-backups}"
KEEP="${KEEP:-14}"
ENV_FILE="$APP_DIR/deploy/hostinger/.env"

cd "$APP_DIR"
mkdir -p "$BACKUP_DIR"

DATABASE_URL="$(grep '^DATABASE_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
[ -n "$DATABASE_URL" ] || { echo "No DATABASE_URL found in $ENV_FILE" >&2; exit 1; }

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_DIR/nexa-leads-$STAMP.sql"

# pg_dump isn't in the app image (it's a plain Node runtime), so this pulls
# the small, official postgres image just for its client tools.
docker run --rm -e PGCONNECT_TIMEOUT=15 postgres:17-alpine \
  pg_dump "$DATABASE_URL" --no-owner --no-privileges > "$TARGET"

gzip -f "$TARGET"
TARGET="$TARGET.gz"

echo "Backup written: $TARGET ($(du -h "$TARGET" | cut -f1))"

ls -1t "$BACKUP_DIR"/nexa-leads-*.sql.gz 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
  rm -f "$old"
  echo "Removed old backup: $old"
done
