#!/usr/bin/env bash
# Put the previous build back in one command (no code upload, no migrate).
#
# Usage (from the dev machine, in Git Bash / any POSIX shell):
#   SERVER=root@188.121.125.246 KEY=~/.ssh/tapsell_qeysar ./deploy/rollback.sh
#   SERVER=... KEY=... ./deploy/rollback.sh <tag>     # a specific older build (full git sha)
#
# Default target is /srv/arena/.previous-tag, written by deploy/deploy.sh.
# After a successful rollback the two tags are swapped, so running it again
# goes forward to the build you just left.
#
# What it does NOT do:
#   - re-run migrate: database migrations applied by the newer build stay
#     (they are additive in this project; an older build simply ignores new
#     columns/indexes). An older build never needs a migration the db lacks.
#   - touch the uploaded compose file / Caddyfile on the server (they stay at
#     whatever the last deploy.sh uploaded), or the server's .env.
# To go FORWARD to a newer build, use deploy.sh (IMAGE_TAG=<sha>) so migrations run.
set -euo pipefail

SERVER="${SERVER:?Set SERVER=user@host, e.g. SERVER=root@188.121.125.246}"
KEY="${KEY:-$HOME/.ssh/tapsell_qeysar}"
REMOTE_DIR="${REMOTE_DIR:-/srv/arena/app}"

SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$SERVER")

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=deploy/lib-release.sh
. "$REPO_ROOT/deploy/lib-release.sh"

CURRENT="$(remote_state deployed)"
TARGET="${1:-$(remote_state previous)}"

if [ -z "$TARGET" ]; then
  echo "!! No previous tag recorded in $STATE_DIR/.previous-tag on $SERVER." >&2
  echo "   Pass one explicitly: ./deploy/rollback.sh <full git sha>" >&2
  exit 1
fi
if [ "$TARGET" = "$CURRENT" ]; then
  echo "!! $TARGET is already the deployed tag; nothing to do." >&2
  exit 1
fi

echo "==> Rolling back $SERVER: ${CURRENT:-<unknown>} -> $TARGET"
ensure_tag "$TARGET"

echo "==> Starting web + backup + caddy on $TARGET (migrate is not run)"
start_without_migrate "$TARGET"

echo "==> Waiting for web /api/health (inside the container)"
if ! wait_web_healthy "$TARGET"; then
  echo "!! $TARGET did not become healthy." >&2
  rc "$TARGET" "docker compose logs --tail=60 web" >&2 || true
  if [ -n "$CURRENT" ]; then
    echo "   Back to the previous state with: ./deploy/rollback.sh $CURRENT" >&2
  fi
  exit 1
fi

record_deployed "$TARGET" "$CURRENT"
rc "$TARGET" "docker compose ps"
echo "==> Rolled back. deployed=$TARGET previous=$(remote_state previous)"
