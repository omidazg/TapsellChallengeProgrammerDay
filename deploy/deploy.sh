#!/usr/bin/env bash
# Deploy the app to the server over SSH and (re)start it via Docker Compose.
#
# Usage (from the dev machine, in Git Bash / any POSIX shell):
#   SERVER=root@89.42.199.174 KEY=~/.ssh/founders_arena ./deploy/deploy.sh
#
# What it does:
#   1. Packs the repo (excluding node_modules, .next, data, .git) into a
#      tarball and streams it over ssh into /srv/arena/app on the server
#      (works even where rsync isn't available, e.g. Windows Git Bash).
#   2. If the server has no .env yet, copies .env.example there and warns
#      you to edit it before the app will work correctly.
#   3. Pulls the prebuilt web/migrate images from ghcr.io (built by
#      .github/workflows/build-images.yml on GitHub's own x86_64 runners --
#      this server's network can't reliably reach registry.npmjs.org, so
#      building the Dockerfile locally here is unreliable) and starts
#      everything via `docker compose up -d`.
#   4. Curls http://SERVER/api/phase as a smoke test.
#
# Only deploy between event phases (see docs/runbook-event-day.md) --
# a mid-phase deploy still has a brief restart window.
set -euo pipefail

SERVER="${SERVER:?Set SERVER=user@host, e.g. SERVER=root@89.42.199.174}"
KEY="${KEY:-$HOME/.ssh/founders_arena}"
REMOTE_DIR="${REMOTE_DIR:-/srv/arena/app}"

SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$SERVER")
SCP=(scp -i "$KEY" -o StrictHostKeyChecking=accept-new)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Ensuring remote directories exist"
"${SSH[@]}" "mkdir -p '$REMOTE_DIR' /srv/arena/data"

echo "==> Packing repo and streaming to $SERVER:$REMOTE_DIR"
tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='data' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='.env.production' \
  --exclude='dev.db' \
  --exclude='dev.db-journal' \
  --exclude='*.tsbuildinfo' \
  --exclude='coverage' \
  -czf - . | "${SSH[@]}" "tar -xzf - -C '$REMOTE_DIR'"

echo "==> Checking remote .env"
if ! "${SSH[@]}" "test -f '$REMOTE_DIR/.env'"; then
  echo "    No .env on server yet -- copying .env.example as a starting point."
  echo "    !! Edit $REMOTE_DIR/.env on the server before relying on this deploy !!"
  "${SSH[@]}" "cp '$REMOTE_DIR/.env.example' '$REMOTE_DIR/.env'"
else
  echo "    .env already present on server, leaving it untouched."
fi

echo "==> Pulling prebuilt images and starting containers on the server"
# The backup service holds the sqlite file while it copies. If it happens to be
# mid-backup when `migrate` runs, `prisma migrate deploy` fails with "database
# is locked". Stopping it first makes each deploy deterministic; the `up -d`
# below starts it again straight after the migration.
"${SSH[@]}" "cd '$REMOTE_DIR' && docker compose stop backup 2>/dev/null || true"

# --no-deps on the caddy step is important: caddy depends_on web depends_on
# migrate, so without it `up -d --force-recreate caddy` re-runs the one-shot
# migrate container -- which fails against the now-running stack and aborts the
# whole command, leaving caddy DOWN. The migrations already ran in the previous
# step; caddy only needs its own config reloaded.
"${SSH[@]}" "cd '$REMOTE_DIR' && docker compose pull migrate web && docker compose up -d && docker compose up -d --no-deps --force-recreate caddy"

echo "==> Recent container status"
"${SSH[@]}" "cd '$REMOTE_DIR' && docker compose ps"

HOST_ONLY="${SERVER#*@}"
echo "==> Health check: http://$HOST_ONLY/api/phase"
sleep 2
curl -fsS -m 10 "http://$HOST_ONLY/api/phase" || {
  echo "!! Health check failed. Check logs with:"
  echo "   $SSH ${SSH[*]:1} 'cd $REMOTE_DIR && docker compose logs --tail=100 web'"
  exit 1
}
echo
echo "==> Deploy complete."
