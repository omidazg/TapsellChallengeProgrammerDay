#!/usr/bin/env bash
# Deploy the SAME code to a separate staging stack on the server, under
# /srv/arena/staging-app, as its own Compose project ("arena-staging").
# This never touches the production containers, volumes, or
# /srv/arena/data -- staging gets its own /srv/arena/staging-data.
#
# Usage (from the dev machine, in Git Bash / any POSIX shell):
#   SERVER=root@89.42.199.174 KEY=~/.ssh/founders_arena ./deploy/deploy-staging.sh
#
# Requires /srv/arena/staging-app/.env.staging to exist on the server
# already (copy .env.example there, give it its own SESSION_SECRET/
# ADMIN_PASSWORD, and leave SITE_ADDRESS unset -- staging has no Caddy).
# Staging is reachable at http://SERVER:8080.
set -euo pipefail

SERVER="${SERVER:?Set SERVER=user@host, e.g. SERVER=root@89.42.199.174}"
KEY="${KEY:-$HOME/.ssh/founders_arena}"
REMOTE_DIR="${REMOTE_DIR:-/srv/arena/staging-app}"
PROJECT="${PROJECT:-arena-staging}"

SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$SERVER")

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Ensuring remote staging directories exist"
"${SSH[@]}" "mkdir -p '$REMOTE_DIR' /srv/arena/staging-data"

echo "==> Packing repo and streaming to $SERVER:$REMOTE_DIR"
tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='data' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='.env.production' \
  --exclude='.env.staging' \
  --exclude='dev.db' \
  --exclude='dev.db-journal' \
  --exclude='*.tsbuildinfo' \
  --exclude='coverage' \
  -czf - . | "${SSH[@]}" "tar -xzf - -C '$REMOTE_DIR'"

echo "==> Checking remote .env.staging"
if ! "${SSH[@]}" "test -f '$REMOTE_DIR/.env.staging'"; then
  echo "    No .env.staging on server yet -- copying .env.example as a starting point."
  echo "    !! Edit $REMOTE_DIR/.env.staging on the server (new SESSION_SECRET, etc) before relying on this !!"
  "${SSH[@]}" "cp '$REMOTE_DIR/.env.example' '$REMOTE_DIR/.env.staging'"
else
  echo "    .env.staging already present on server, leaving it untouched."
fi

echo "==> Building images (staging project, does not touch production)"
"${SSH[@]}" "cd '$REMOTE_DIR' && docker compose -p '$PROJECT' -f docker-compose.staging.yml pull migrate web"

echo "==> Starting staging containers"
"${SSH[@]}" "cd '$REMOTE_DIR' && docker compose -p '$PROJECT' -f docker-compose.staging.yml up -d"

echo "==> Recent staging container status"
"${SSH[@]}" "cd '$REMOTE_DIR' && docker compose -p '$PROJECT' -f docker-compose.staging.yml ps"

HOST_ONLY="${SERVER#*@}"
echo "==> Health check: http://$HOST_ONLY:8080/api/phase"
sleep 2
curl -fsS -m 10 "http://$HOST_ONLY:8080/api/phase" || {
  echo "!! Health check failed. Check logs with:"
  echo "   ssh -i $KEY $SERVER 'cd $REMOTE_DIR && docker compose -p $PROJECT -f docker-compose.staging.yml logs --tail=100 web'"
  exit 1
}
echo
echo "==> Staging deploy complete (http://$HOST_ONLY:8080)."
