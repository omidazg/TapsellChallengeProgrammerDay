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
#   3. Runs `docker compose up -d --build` on the server.
#   4. Curls http://SERVER/api/phase as a smoke test.
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

echo "==> Building and starting containers on the server"
"${SSH[@]}" "cd '$REMOTE_DIR' && docker compose up -d --build"

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
