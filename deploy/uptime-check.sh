#!/usr/bin/env bash
# Simple uptime check: curl a health URL, and on failure POST a JSON alert
# to ALERT_WEBHOOK_URL (if set). Meant to be run from cron on a machine
# OTHER than the arena server itself (see docs/ops.md).
#
# Usage:
#   deploy/uptime-check.sh [URL]
#
# Defaults:
#   URL defaults to http://89.42.199.174/api/health, and if that endpoint
#   doesn't exist (404/connection issue with that specific path) it falls
#   back to http://89.42.199.174/api/phase, which every deployment has.
#
# Env:
#   ALERT_WEBHOOK_URL   optional; if set, a JSON POST is sent to it on failure
#   TIMEOUT_SECS        default 10
set -euo pipefail

PRIMARY_URL="${1:-http://89.42.199.174/api/health}"
FALLBACK_URL="${FALLBACK_URL:-http://89.42.199.174/api/phase}"
TIMEOUT_SECS="${TIMEOUT_SECS:-10}"

check() {
  local url="$1"
  curl -fsS -m "$TIMEOUT_SECS" -o /dev/null -w '%{http_code}' "$url" 2>/dev/null
}

STATUS=""
USED_URL="$PRIMARY_URL"
if STATUS="$(check "$PRIMARY_URL")" && [ "$STATUS" = "200" ]; then
  echo "OK  $PRIMARY_URL -> $STATUS"
  exit 0
fi

USED_URL="$FALLBACK_URL"
if STATUS="$(check "$FALLBACK_URL")" && [ "$STATUS" = "200" ]; then
  echo "OK  $FALLBACK_URL -> $STATUS (primary $PRIMARY_URL failed)"
  exit 0
fi

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "FAIL  $PRIMARY_URL and $FALLBACK_URL both unreachable/unhealthy at $TS" >&2

if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
  PAYLOAD=$(cat <<JSON
{"text":"arena uptime check FAILED at $TS: $PRIMARY_URL and $FALLBACK_URL both unhealthy","url":"$USED_URL","ts":"$TS"}
JSON
)
  curl -fsS -m "$TIMEOUT_SECS" -X POST -H 'Content-Type: application/json' \
    -d "$PAYLOAD" "$ALERT_WEBHOOK_URL" >/dev/null 2>&1 || echo "!! webhook POST also failed" >&2
fi

exit 1
