#!/usr/bin/env bash
# Deploy the app to the server over SSH and (re)start it via Docker Compose.
#
# Usage (from the dev machine, in Git Bash / any POSIX shell):
#   SERVER=root@188.121.125.246 KEY=~/.ssh/tapsell_qeysar ./deploy/deploy.sh
#   IMAGE_TAG=<full git sha> SERVER=... KEY=... ./deploy/deploy.sh   # a specific build
#
# Undo the last deploy:  SERVER=... KEY=... ./deploy/rollback.sh
#
# What it does:
#   1. Picks the image tag. IMAGE_TAG if given; otherwise the full sha of the
#      local `git rev-parse HEAD`, if CI has already built images for it
#      (.github/workflows/build-images.yml only builds commits that passed
#      CI); otherwise falls back to :latest with a loud warning (pinned to the
#      sha recorded in that image's labels when it has one).
#   2. Packs the repo (excluding node_modules, .next, data, .git) into a
#      tarball and streams it over ssh into /srv/arena/app on the server
#      (works even where rsync isn't available, e.g. Windows Git Bash).
#   3. If the server has no .env yet, copies .env.example there and warns
#      you to edit it before the app will work correctly.
#   4. Pulls the prebuilt web/migrate images for that tag from ghcr.io (this
#      server's network can't reliably reach registry.npmjs.org, so building
#      the Dockerfile here is unreliable), briefly stops the services holding
#      the sqlite file so migrations can run, then starts everything with
#      IMAGE_TAG exported in the remote shell (the server's .env is never
#      modified for this).
#   5. Waits for web to answer /api/health from inside its container. If
#      migrate or that check fails, it AUTOMATICALLY redeploys the previously
#      deployed tag (without re-running migrate) and exits non-zero.
#   6. Records the tag in /srv/arena/.deployed-tag (the one before it in
#      .previous-tag, used by rollback.sh), recreates caddy, and curls
#      /api/health through Caddy as a smoke test.
#
# Only deploy between event phases (see docs/runbook-event-day.md) --
# a mid-phase deploy still has a brief restart window.
set -euo pipefail

SERVER="${SERVER:?Set SERVER=user@host, e.g. SERVER=root@188.121.125.246}"
KEY="${KEY:-$HOME/.ssh/tapsell_qeysar}"
REMOTE_DIR="${REMOTE_DIR:-/srv/arena/app}"

SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$SERVER")

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
# shellcheck source=deploy/lib-release.sh
. "$REPO_ROOT/deploy/lib-release.sh"

echo "==> Ensuring remote directories exist"
"${SSH[@]}" "mkdir -p '$REMOTE_DIR' /srv/arena/data '$STATE_DIR'"

# ---------------------------------------------------------------------------
# 1. Which build?
# ---------------------------------------------------------------------------
image_exists() { # both images for <tag> exist in the registry (3 tries: flaky link)
  "${SSH[@]}" "for i in 1 2 3; do
      docker manifest inspect '$IMAGE_BASE-web:$1' >/dev/null 2>&1 &&
      docker manifest inspect '$IMAGE_BASE-migrate:$1' >/dev/null 2>&1 && exit 0
      sleep 2
    done; exit 1"
}

RESOLVE_LATEST=0
if [ -n "${IMAGE_TAG:-}" ]; then
  echo "==> Using IMAGE_TAG=$IMAGE_TAG (given)"
else
  HEAD_SHA="$(git rev-parse HEAD)"
  if [ -n "$(git status --porcelain --untracked-files=no 2>/dev/null)" ]; then
    echo "    !! Uncommitted changes: compose/Caddyfile/scripts are uploaded as they are"
    echo "       locally, but the images are built from commits only."
  fi
  echo "==> Looking for images of HEAD ($HEAD_SHA) on ghcr.io"
  if image_exists "$HEAD_SHA"; then
    IMAGE_TAG="$HEAD_SHA"
    echo "    found -> IMAGE_TAG=$IMAGE_TAG"
  else
    IMAGE_TAG="latest"
    RESOLVE_LATEST=1
    echo "    !! ============================================================="
    echo "    !! No image for HEAD $HEAD_SHA yet -- falling back to :latest."
    echo "    !! Is HEAD pushed to GitHub, and has CI + 'Build and push images'"
    echo "    !! finished for it? :latest may be OLDER than your checkout."
    echo "    !! Ctrl-C now and re-run later (or pass IMAGE_TAG=<sha>) to avoid it."
    echo "    !! ============================================================="
    sleep 10
  fi
fi

PREV_TAG="$(remote_state deployed)"
if [ -z "$PREV_TAG" ]; then
  # First deploy with pinned tags: whatever runs now came from the server's
  # local :latest. Keep it under a fixed local tag so there is something to
  # roll back to.
  if "${SSH[@]}" "docker image inspect '$IMAGE_BASE-web:latest' '$IMAGE_BASE-migrate:latest' >/dev/null 2>&1"; then
    "${SSH[@]}" "docker tag '$IMAGE_BASE-web:latest' '$IMAGE_BASE-web:pre-pinning' && docker tag '$IMAGE_BASE-migrate:latest' '$IMAGE_BASE-migrate:pre-pinning'"
    PREV_TAG="pre-pinning"
  fi
fi
echo "    currently deployed: ${PREV_TAG:-<none>}"

# ---------------------------------------------------------------------------
# 2-3. Upload repo, check .env
# ---------------------------------------------------------------------------
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
  --exclude='dev.db-*' \
  --exclude='.claude' \
  --exclude='.serena' \
  --exclude='*.tsbuildinfo' \
  --exclude='coverage' \
  -czf - . | "${SSH[@]}" "tar --no-same-owner -xzf - -C '$REMOTE_DIR'"

echo "==> Checking remote .env"
if ! "${SSH[@]}" "test -f '$REMOTE_DIR/.env'"; then
  echo "    No .env on server yet -- copying .env.example as a starting point."
  echo "    !! Edit $REMOTE_DIR/.env on the server before relying on this deploy !!"
  "${SSH[@]}" "cp '$REMOTE_DIR/.env.example' '$REMOTE_DIR/.env'"
else
  echo "    .env already present on server, leaving it untouched."
fi

# ---------------------------------------------------------------------------
# 4. Pull and start
# ---------------------------------------------------------------------------
echo "==> Pulling prebuilt images ($IMAGE_TAG) on the server"
pull_tag "$IMAGE_TAG"

if [ "$RESOLVE_LATEST" = "1" ]; then
  # Pin :latest to the commit it was built from (label set by build-images.yml)
  # so .deployed-tag / rollback.sh refer to an immutable build.
  LABEL_FMT='{{index .Config.Labels "org.opencontainers.image.revision"}}'
  REV_WEB="$("${SSH[@]}" "docker image inspect -f '$LABEL_FMT' '$IMAGE_BASE-web:latest' 2>/dev/null" | tr -d '\r\n ' || true)"
  REV_MIG="$("${SSH[@]}" "docker image inspect -f '$LABEL_FMT' '$IMAGE_BASE-migrate:latest' 2>/dev/null" | tr -d '\r\n ' || true)"
  if printf '%s' "$REV_WEB" | grep -Eq '^[0-9a-f]{40}$' && [ "$REV_WEB" = "$REV_MIG" ]; then
    "${SSH[@]}" "docker tag '$IMAGE_BASE-web:latest' '$IMAGE_BASE-web:$REV_WEB' && docker tag '$IMAGE_BASE-migrate:latest' '$IMAGE_BASE-migrate:$REV_WEB'"
    IMAGE_TAG="$REV_WEB"
    echo "    :latest is commit $IMAGE_TAG -> deploying that tag"
  else
    echo "    !! :latest has no (matching) revision label; deploying the moving tag 'latest'"
  fi
fi

rollback_now() {
  echo "!! $1" >&2
  if [ -z "$PREV_TAG" ] || [ "$PREV_TAG" = "$IMAGE_TAG" ]; then
    echo "!! No previous tag to roll back to -- the site may be DOWN. Investigate now." >&2
    print_logs_hint
    exit 1
  fi
  echo "==> AUTO-ROLLBACK to $PREV_TAG (migrate is NOT re-run)" >&2
  rc "$IMAGE_TAG" "docker compose logs --tail=40 migrate web" >&2 || true
  ensure_tag "$PREV_TAG" || true
  if start_without_migrate "$PREV_TAG" && wait_web_healthy "$PREV_TAG"; then
    echo "==> Rolled back: $PREV_TAG is running and healthy. The failed tag was $IMAGE_TAG." >&2
    echo "   (Database migrations applied by $IMAGE_TAG, if any, were NOT reverted.)" >&2
  else
    echo "!! Rollback to $PREV_TAG did not become healthy either -- the site may be DOWN." >&2
  fi
  print_logs_hint
  exit 1
}

# Stop the two services that hold /srv/arena/data/dev.db before migrating.
#
# On a COLD start `depends_on: service_completed_successfully` guarantees the
# one-shot `migrate` container runs alone. On a REDEPLOY the stack is already
# up, so `up -d` starts `migrate` while `web` and `backup` still have the
# sqlite file open -- prisma's schema engine can't take the lock it needs for
# `_prisma_migrations`, and the deploy dies with "database is locked".
# Stopping them first makes every deploy behave like a cold start. `up -d`
# below starts them again the moment the migration finishes.
rc "$IMAGE_TAG" "docker compose stop web backup"

echo "==> Starting $IMAGE_TAG (migrate runs first)"
rc "$IMAGE_TAG" "docker compose up -d" || rollback_now "docker compose up failed (migrate failed?)"

# ---------------------------------------------------------------------------
# 5. Is web healthy?
# ---------------------------------------------------------------------------
echo "==> Waiting for web /api/health (inside the container)"
wait_web_healthy "$IMAGE_TAG" || rollback_now "web did not become healthy within ~2 minutes"
echo "    web healthy"

# ---------------------------------------------------------------------------
# 6. Record, recreate caddy, smoke test through Caddy
# ---------------------------------------------------------------------------
record_deployed "$IMAGE_TAG" "$PREV_TAG"
echo "==> Recorded deployed=$IMAGE_TAG (rollback.sh would go back to: $(remote_state previous))"

# Caddy's config is bind-mounted, so a changed Caddyfile does not make compose
# recreate the container -- force it. --no-deps matters here: caddy depends_on
# web depends_on migrate, so without it this line re-runs the one-shot migrate
# container against the now-running stack, hits the lock described above, and
# aborts -- leaving caddy DOWN and the site unreachable.
rc "$IMAGE_TAG" "docker compose up -d --no-deps --force-recreate caddy"

echo "==> Recent container status"
rc "$IMAGE_TAG" "docker compose ps"

HOST_ONLY="${SERVER#*@}"
# Once a domain is enabled (deploy/enable-domain.sh sets SITE_URL=https://...),
# Caddy only serves that hostname (plain-IP requests are redirected), so follow
# the server's own SITE_URL unless HEALTH_URL overrides it.
if [ -z "${HEALTH_URL:-}" ]; then
  REMOTE_SITE_URL="$("${SSH[@]}" "sed -n 's/^SITE_URL=//p' '$REMOTE_DIR/.env'" 2>/dev/null | tr -d '\r' || true)"
  case "$REMOTE_SITE_URL" in
    https://*) HEALTH_URL="${REMOTE_SITE_URL%/}/api/health" ;;
    *) HEALTH_URL="http://$HOST_ONLY/api/health" ;;
  esac
fi
echo "==> Health check through Caddy: $HEALTH_URL"
sleep 2
HEALTH_BODY="$(curl -fsS -m 10 "$HEALTH_URL")" || {
  echo "!! Health check through Caddy failed (web itself is healthy -- check caddy/DNS/firewall):"
  echo "   ${SSH[*]} 'cd $REMOTE_DIR && docker compose logs --tail=100 caddy web'"
  echo "   Undo the deploy with: SERVER=$SERVER KEY=$KEY ./deploy/rollback.sh"
  exit 1
}
echo "$HEALTH_BODY"
case "$HEALTH_BODY" in
  *"\"version\":\"$IMAGE_TAG\""*) ;;
  *) [ "$IMAGE_TAG" = "latest" ] || echo "    (note: /api/health version differs from $IMAGE_TAG -- image built before GIT_SHA was baked in?)" ;;
esac
echo
echo "==> Deploy complete: $IMAGE_TAG"
