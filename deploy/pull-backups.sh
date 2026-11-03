#!/usr/bin/env bash
# Copy the newest off-server backups down to a laptop/dev machine.
#
# Usage (from the dev machine, in Git Bash / any POSIX shell):
#   SERVER=root@188.121.125.246 KEY=~/.ssh/tapsell_qeysar ./deploy/pull-backups.sh
#
# Optional:
#   COUNT=10                 how many of the newest *.gz backups to pull (default 5)
# Also pulls a tarball of /srv/arena/data/uploads as uploads-<date>.tgz.
#   REMOTE_BACKUP_DIR=/srv/arena/backups
#   LOCAL_DIR=./backups
set -euo pipefail

SERVER="${SERVER:?Set SERVER=user@host, e.g. SERVER=root@188.121.125.246}"
KEY="${KEY:-$HOME/.ssh/tapsell_qeysar}"
REMOTE_BACKUP_DIR="${REMOTE_BACKUP_DIR:-/srv/arena/backups}"
LOCAL_DIR="${LOCAL_DIR:-./backups}"
COUNT="${COUNT:-5}"

SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$SERVER")
SCP=(scp -i "$KEY" -o StrictHostKeyChecking=accept-new)

mkdir -p "$LOCAL_DIR"

echo "==> Listing newest $COUNT backups on $SERVER:$REMOTE_BACKUP_DIR"
FILES="$("${SSH[@]}" "cd '$REMOTE_BACKUP_DIR' && ls -t *.gz 2>/dev/null | head -n $COUNT")"

if [ -z "$FILES" ]; then
  echo "!! No backups found in $REMOTE_BACKUP_DIR on $SERVER" >&2
  exit 1
fi

echo "$FILES" | while IFS= read -r f; do
  [ -z "$f" ] && continue
  if [ -f "$LOCAL_DIR/$f" ]; then
    echo "    already have $f, skipping"
    continue
  fi
  echo "    pulling $f"
  "${SCP[@]}" "$SERVER:$REMOTE_BACKUP_DIR/$f" "$LOCAL_DIR/$f"
done

# Uploaded images/files are not in the db backups; take them off the server too.
UPLOADS_TGZ="$LOCAL_DIR/uploads-$(date +%Y%m%d-%H%M).tgz"
echo "==> Pulling /srv/arena/data/uploads -> $UPLOADS_TGZ"
"${SSH[@]}" "tar -czf - -C /srv/arena/data uploads" > "$UPLOADS_TGZ.part" ||
  { rm -f "$UPLOADS_TGZ.part"; echo "!! uploads tarball failed" >&2; exit 1; }
mv "$UPLOADS_TGZ.part" "$UPLOADS_TGZ"

echo "==> Done. Local backups in $LOCAL_DIR:"
ls -la "$LOCAL_DIR"
