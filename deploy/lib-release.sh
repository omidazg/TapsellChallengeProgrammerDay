# shellcheck shell=bash
# Shared helpers for deploy/deploy.sh and deploy/rollback.sh (sourced, not run).
# Expects SSH (array), REMOTE_DIR to be set by the caller.
#
# Release model:
#   - Images are tagged with the full git sha by .github/workflows/build-images.yml
#     (only after CI passed) plus :latest.
#   - The remote `docker compose` always runs with IMAGE_TAG exported in that
#     shell (never written into the server's .env, which belongs to the
#     operator), so compose's ${IMAGE_TAG:-latest} resolves to an exact build.
#   - $STATE_DIR/.deployed-tag   tag currently running (written after a healthy deploy)
#     $STATE_DIR/.previous-tag   tag that ran before it (what rollback.sh goes back to)
#   - After a healthy deploy the server's LOCAL :latest tags are pointed at the
#     deployed build too, so a stray manual `docker compose up` (no IMAGE_TAG)
#     keeps running the same code instead of whatever :latest was pulled last.

IMAGE_BASE="${IMAGE_BASE:-ghcr.io/omidazg/founders-arena}"
STATE_DIR="${STATE_DIR:-/srv/arena}"

# Run a shell snippet in $REMOTE_DIR with IMAGE_BASE/IMAGE_TAG exported.
#   rc <tag> '<remote shell snippet>'
rc() {
  local tag="$1"; shift
  "${SSH[@]}" "cd '$REMOTE_DIR' && export IMAGE_BASE='$IMAGE_BASE' IMAGE_TAG='$tag' && $*"
}

remote_state() { # remote_state <deployed|previous>
  "${SSH[@]}" "cat '$STATE_DIR/.$1-tag' 2>/dev/null" | tr -d '\r\n ' || true
}

# Pull web+migrate (backup uses the migrate image) and caddy for <tag>.
# The link to ghcr.io's blob CDN from Iranian VPSes drops mid-download
# ("short read: unexpected EOF"); finished layers are kept, so just retry.
pull_tag() {
  rc "$1" "for i in 1 2 3 4 5 6 7 8; do docker compose pull -q migrate web caddy && exit 0; echo \"    pull failed (try \$i), retrying...\"; sleep 5; done; exit 1"
}

# Pull <tag> only if the server doesn't already have both images locally
# (rollback targets usually are still there; "pre-pinning" exists only locally).
ensure_tag() {
  if "${SSH[@]}" "docker image inspect '$IMAGE_BASE-web:$1' '$IMAGE_BASE-migrate:$1' >/dev/null 2>&1"; then
    echo "    images for $1 already on the server"
  else
    pull_tag "$1"
  fi
}

# Wait (up to ~2 min) until the running web container answers /api/health
# with 2xx from inside the container. Faster than waiting for Docker's own
# healthcheck interval, and independent of Caddy/DNS.
wait_web_healthy() {
  rc "$1" "for i in \$(seq 1 40); do
      if docker compose exec -T web node -e \"fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\" >/dev/null 2>&1; then exit 0; fi
      sleep 3
    done
    exit 1"
}

# Start web+backup (and caddy) on <tag> WITHOUT running migrate. Used for
# rollbacks: an older build never needs a migration the db doesn't already
# have, and after a failed migration `prisma migrate deploy` refuses to run
# at all (P3009), which would keep web down via depends_on.
start_without_migrate() {
  rc "$1" "docker compose up -d --no-deps web backup && docker compose up -d --no-deps caddy"
}

# Record a healthy deploy: previous <- old deployed (if different), deployed <- new,
# and point the local :latest tags at it.
record_deployed() { # record_deployed <new> <old-or-empty>
  local new="$1" old="$2"
  rc "$new" "set -e
    mkdir -p '$STATE_DIR'
    if [ -n '$old' ] && [ '$old' != '$new' ]; then printf '%s\n' '$old' > '$STATE_DIR/.previous-tag'; fi
    printf '%s\n' '$new' > '$STATE_DIR/.deployed-tag'
    if [ '$new' != latest ]; then
      docker tag '$IMAGE_BASE-web:$new' '$IMAGE_BASE-web:latest'
      docker tag '$IMAGE_BASE-migrate:$new' '$IMAGE_BASE-migrate:latest'
    fi"
}

print_logs_hint() {
  echo "   Logs: ssh -i $KEY $SERVER 'cd $REMOTE_DIR && docker compose logs --tail=100 migrate web'" >&2
}
