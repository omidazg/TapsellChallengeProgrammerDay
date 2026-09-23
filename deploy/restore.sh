#!/usr/bin/env bash
# Restore a gzipped SQLite backup produced by scripts/backup.mjs, on the server.
#
# Usage (run ON THE SERVER, as root or a user that can run docker compose
# in /srv/arena/app):
#   deploy/restore.sh /srv/arena/backups/dev-20260923-163559.db.gz
#
# What it does:
#   1. Stops the `web` service (so nothing writes to the db during restore).
#   2. Copies the current live db to a timestamped safety copy next to it,
#      so a bad restore can be undone.
#   3. Gunzips the chosen backup into the live db path.
#   4. Runs `PRAGMA integrity_check` against the restored file.
#   5. Starts `web` again.
#
# If the integrity check fails, the safety copy is put back automatically
# and the script exits non-zero without starting `web` on bad data.
set -euo pipefail

BACKUP_GZ="${1:?Usage: deploy/restore.sh <backup.gz>}"
COMPOSE_DIR="${COMPOSE_DIR:-/srv/arena/app}"
DB_PATH="${DB_PATH:-/srv/arena/data/dev.db}"

if [ ! -f "$BACKUP_GZ" ]; then
  echo "!! Backup file not found: $BACKUP_GZ" >&2
  exit 1
fi

cd "$COMPOSE_DIR"

STAMP="$(date -u +%Y%m%d-%H%M%S)"
SAFETY_COPY="${DB_PATH}.before-restore-${STAMP}"

echo "==> Stopping web"
docker compose stop web

echo "==> Safety copy of current db -> $SAFETY_COPY"
if [ -f "$DB_PATH" ]; then
  cp -a "$DB_PATH" "$SAFETY_COPY"
else
  echo "    (no existing db at $DB_PATH, skipping safety copy)"
fi

echo "==> Restoring $BACKUP_GZ -> $DB_PATH"
TMP_RESTORE="${DB_PATH}.restoring-${STAMP}"
gunzip -c "$BACKUP_GZ" > "$TMP_RESTORE"

echo "==> Integrity check on restored copy"
# No sqlite3 CLI on the host is assumed. The "migrate" service's image (the
# `tools` build target) already has better-sqlite3 and already mounts
# /srv/arena/data as /app/data, which is where $TMP_RESTORE lives, so reuse
# it as a one-off container instead of requiring anything extra on the host.
RESTORE_BASENAME="$(basename "$TMP_RESTORE")"
INTEGRITY_OUT="$(docker compose run --rm --no-deps --entrypoint node migrate -e "
const Database = require('better-sqlite3');
const db = new Database('/app/data/${RESTORE_BASENAME}', { readonly: true, fileMustExist: true });
console.log(db.prepare('PRAGMA integrity_check').get().integrity_check);
" 2>&1 || true)"
if [ "$INTEGRITY_OUT" != "ok" ]; then
  echo "!! integrity_check FAILED: $INTEGRITY_OUT" >&2
  echo "!! Leaving live db untouched and restoring safety copy state." >&2
  rm -f "$TMP_RESTORE"
  if [ -f "$SAFETY_COPY" ]; then
    cp -a "$SAFETY_COPY" "$DB_PATH"
  fi
  echo "==> Starting web again (restore aborted)"
  docker compose up -d web
  exit 1
fi

echo "==> Swapping in restored db"
# Drop any stale WAL/SHM siblings so web starts clean against the new file.
rm -f "${DB_PATH}-wal" "${DB_PATH}-shm"
mv "$TMP_RESTORE" "$DB_PATH"

echo "==> Starting web"
docker compose up -d web

echo "==> Restore complete. Safety copy kept at: $SAFETY_COPY"
echo "    Delete it manually once you've confirmed the app is healthy:"
echo "      rm '$SAFETY_COPY'"
