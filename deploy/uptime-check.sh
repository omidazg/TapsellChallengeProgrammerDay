#!/usr/bin/env bash
# Simple uptime check: curl a health URL, and on failure POST a JSON alert
# to ALERT_WEBHOOK_URL (if set). Meant to be run from cron on a machine
# OTHER than the arena server itself (see docs/ops.md).
#
# Usage:
#   deploy/uptime-check.sh [URL]
#
# Defaults:
#   URL defaults to http://188.121.125.246/api/health. Only if that endpoint
#   does not exist (HTTP 404 -- a very old build) does it fall back to
#   http://188.121.125.246/api/phase. A 503 from /api/health (db down or
#   scheduler stalled) is a real failure and is alerted on, never masked by
#   the fallback. Redirects are followed (after deploy/enable-domain.sh the
#   IP address redirects to https://festival.pegah.tech).
#
# Env:
#   ALERT_WEBHOOK_URL   optional; if set, a JSON POST is sent to it on failure
#   TIMEOUT_SECS        default 10
set -euo pipefail

PRIMARY_URL="${1:-http://188.121.125.246/api/health}"
FALLBACK_URL="${FALLBACK_URL:-http://188.121.125.246/api/phase}"
TIMEOUT_SECS="${TIMEOUT_SECS:-10}"

# Prints the final HTTP status code (000 = no response at all).
check() {
  local url="$1"
  curl -sS -L --max-redirs 3 -m "$TIMEOUT_SECS" -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || true
}

USED_URL="$PRIMARY_URL"
STATUS="$(check "$PRIMARY_URL")"
if [ "$STATUS" = "200" ]; then
  echo "OK  $PRIMARY_URL -> $STATUS"
  exit 0
fi

if [ "$STATUS" = "404" ]; then
  USED_URL="$FALLBACK_URL"
  STATUS="$(check "$FALLBACK_URL")"
  if [ "$STATUS" = "200" ]; then
    echo "OK  $FALLBACK_URL -> $STATUS (primary $PRIMARY_URL is 404: old build without /api/health)"
    exit 0
  fi
fi

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "FAIL  $USED_URL -> HTTP ${STATUS:-000} at $TS" >&2

if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
  PAYLOAD=$(cat <<JSON
{"text":"arena uptime check FAILED at $TS: $USED_URL -> HTTP ${STATUS:-000}","url":"$USED_URL","status":"${STATUS:-000}","ts":"$TS"}
JSON
)
  curl -fsS -m "$TIMEOUT_SECS" -X POST -H 'Content-Type: application/json' \
    -d "$PAYLOAD" "$ALERT_WEBHOOK_URL" >/dev/null 2>&1 || echo "!! webhook POST also failed" >&2
fi

exit 1
