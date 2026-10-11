#!/usr/bin/env bash
# Deploy the SAME code to a separate staging stack on the server, under
# /srv/arena/staging-app, as its own Compose project ("arena-staging").
# This never touches the production containers, volumes, or
# /srv/arena/data -- staging gets its own /srv/arena/staging-data.
#
# Usage (from the dev machine, in Git Bash / any POSIX shell):
#   SERVER=root@188.121.125.246 KEY=~/.ssh/tapsell_qeysar ./deploy/deploy-staging.sh
#
# Requires /srv/arena/staging-app/.env.staging to exist on the server
# already (copy .env.example there, give it its own SESSION_SECRET/
# ADMIN_PASSWORD, and leave SITE_ADDRESS unset -- staging has no Caddy).
#
# Staging listens on 127.0.0.1:8080 of the server only (not public). Reach it
# through an SSH tunnel:
#   ssh -i ~/.ssh/tapsell_qeysar -N -L 8080:127.0.0.1:8080 root@188.121.125.246
#   then open http://localhost:8080
#
# IMAGE_TAG=<full git sha> stages a specific build (default: latest).
set -euo pipefail

SERVER="${SERVER:?Set SERVER=user@host, e.g. SERVER=root@188.121.125.246}"
KEY="${KEY:-$HOME/.ssh/tapsell_qeysar}"
REMOTE_DIR="${REMOTE_DIR:-/srv/arena/staging-app}"
PROJECT="${PROJECT:-arena-staging}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
# compose reads IMAGE_TAG from the remote shell's environment (never from a file)
DC="export IMAGE_TAG='$IMAGE_TAG' && docker compose -p '$PROJECT' -f docker-compose.staging.yml"

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
  --exclude='dev.db-*'   --exclude='.claude'   --exclude='.serena' \
  --exclude='*.tsbuildinfo' \
  --exclude='coverage' \
  -czf - . | "${SSH[@]}" "tar --no-same-owner -xzf - -C '$REMOTE_DIR'"

echo "==> Checking remote .env.staging"
if ! "${SSH[@]}" "test -f '$REMOTE_DIR/.env.staging'"; then
  echo "    No .env.staging on server yet -- copying .env.example as a starting point."
  echo "    !! Edit $REMOTE_DIR/.env.staging on the server (new SESSION_SECRET, etc) before relying on this !!"
  "${SSH[@]}" "cp '$REMOTE_DIR/.env.example' '$REMOTE_DIR/.env.staging'"
else
  echo "    .env.staging already present on server, leaving it untouched."
fi

echo "==> Pulling images $IMAGE_TAG (staging project, does not touch production)"
"${SSH[@]}" "cd '$REMOTE_DIR' && for i in 1 2 3 4 5 6 7 8; do $DC pull -q migrate web && exit 0; echo \"    pull failed (try \$i), retrying...\"; sleep 5; done; exit 1"

echo "==> Starting staging containers"
"${SSH[@]}" "cd '$REMOTE_DIR' && $DC up -d"

echo "==> Recent staging container status"
"${SSH[@]}" "cd '$REMOTE_DIR' && $DC ps"

# 8080 is bound to the server's loopback only, so check from the server itself.
echo "==> Health check (on the server): http://127.0.0.1:8080/api/health"
"${SSH[@]}" "for i in \$(seq 1 30); do curl -fsS -m 5 http://127.0.0.1:8080/api/health && exit 0; sleep 3; done; exit 1" || {
  echo "!! Health check failed. Check logs with:"
  echo "   ssh -i $KEY $SERVER 'cd $REMOTE_DIR && docker compose -p $PROJECT -f docker-compose.staging.yml logs --tail=100 web'"
  exit 1
}
echo
echo "==> Staging deploy complete. Open it through a tunnel:"
echo "    ssh -i $KEY -N -L 8080:127.0.0.1:8080 $SERVER   # then http://localhost:8080"
