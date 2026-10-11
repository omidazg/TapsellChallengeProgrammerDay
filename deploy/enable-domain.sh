#!/usr/bin/env bash
# Switch the live site from plain HTTP-on-IP to HTTPS on a real domain, or
# roll that switch back. Run from the dev machine (Git Bash / any POSIX shell).
#
# Usage:
#   ./deploy/enable-domain.sh              # check DNS, then enable festival.pegah.tech
#   ./deploy/enable-domain.sh --check      # only check DNS, change nothing
#   ./deploy/enable-domain.sh --rollback   # restore the previous .env (HTTP on IP)
#
# Env (all optional):
#   DOMAIN       default festival.pegah.tech
#   SERVER       default root@188.121.125.246   (the eth1 IP, reachable from abroad)
#   KEY          default ~/.ssh/tapsell_qeysar
#   EXPECTED_IP  default = host part of SERVER; the A record MUST equal this
#   REMOTE_DIR   default /srv/arena/app
#
# What it does:
#   1. DNS gate. From the server (it has dig) asks 1.1.1.1, 8.8.8.8 and the
#      zone's own nameservers for the A record of DOMAIN. Every answer must be
#      exactly EXPECTED_IP, there must be no AAAA record (the VPS has no IPv6),
#      and the record must exist. Otherwise it REFUSES to touch the server:
#      with SITE_ADDRESS set to a hostname Caddy serves only that hostname and
#      would fail to get a certificate, so a premature switch takes the site
#      down for everyone. The first IP (185.231.181.106) is rejected with its
#      own message -- it is not reachable from outside Iran (VPN users) and
#      Let's Encrypt could not validate against it.
#   2. Backs up /srv/arena/app/.env to .env.bak-<timestamp>, then sets
#        SITE_ADDRESS=DOMAIN         (Caddy site address -> auto HTTPS + redirect)
#        SITE_URL=https://DOMAIN     (metadataBase, payment callback base)
#        COOKIE_SECURE=true          (session cookie gets the Secure flag)
#        LEGACY_HTTP_ADDRESS=http://<EXPECTED_IP>   + LEGACY_REDIRECT_TO=https://DOMAIN
#                                    (Caddyfile's second site block: old
#                                     http://<IP>/... links 302 to the domain
#                                     instead of getting no answer at all)
#   3. Recreates ONLY web and caddy (--no-deps: never re-runs the one-shot
#      migrate container against the live sqlite file, see deploy.sh), on the
#      build recorded in /srv/arena/.deployed-tag (IMAGE_TAG exported in the
#      remote shell, like deploy.sh -- never :latest by accident).
#   4. Waits up to ~3 minutes for https://DOMAIN/api/phase to answer 200 from
#      the server itself and from this machine, and checks that
#      http://DOMAIN redirects to https. On failure prints caddy's log and the
#      rollback command. Nothing else (data, images, backup service) is touched.
set -euo pipefail

DOMAIN="${DOMAIN:-festival.pegah.tech}"
SERVER="${SERVER:-root@188.121.125.246}"
KEY="${KEY:-$HOME/.ssh/tapsell_qeysar}"
REMOTE_DIR="${REMOTE_DIR:-/srv/arena/app}"
HOST_ONLY="${SERVER#*@}"
EXPECTED_IP="${EXPECTED_IP:-$HOST_ONLY}"
BLOCKED_IP="185.231.181.106"

MODE="enable"
case "${1:-}" in
  "") ;;
  --check) MODE="check" ;;
  --rollback) MODE="rollback" ;;
  -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
  *) echo "unknown argument: $1 (use --check or --rollback)" >&2; exit 2 ;;
esac

SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o BatchMode=yes "$SERVER")

remote() { "${SSH[@]}" "$@"; }

# ---------------------------------------------------------------------------
# Compose must keep running the deployed build (see deploy/lib-release.sh).
STATE_DIR="${STATE_DIR:-/srv/arena}"
PIN="export IMAGE_TAG=\$(cat '$STATE_DIR/.deployed-tag' 2>/dev/null || echo latest)"

# Rollback: restore newest .env.bak-* and recreate web + caddy.
# ---------------------------------------------------------------------------
if [ "$MODE" = "rollback" ]; then
  echo "==> Rolling back to the newest .env backup on $SERVER"
  remote "cd '$REMOTE_DIR' && set -e
    BAK=\$(ls -1t .env.bak-* 2>/dev/null | head -n1)
    if [ -z \"\$BAK\" ]; then echo '!! no .env.bak-* found, nothing to roll back' >&2; exit 1; fi
    echo \"    restoring \$BAK\"
    cp .env .env.rolledback-\$(date +%Y%m%d-%H%M%S)
    cp \"\$BAK\" .env
    grep -E '^(SITE_ADDRESS|SITE_URL|COOKIE_SECURE|LEGACY_HTTP_ADDRESS|LEGACY_REDIRECT_TO)=' .env || true
    $PIN
    echo \"    IMAGE_TAG=\$IMAGE_TAG\"
    docker compose up -d --no-deps --force-recreate web caddy"
  echo "==> Health check: http://$HOST_ONLY/api/phase"
  sleep 3
  curl -fsS -m 15 "http://$HOST_ONLY/api/phase" && echo && echo "==> rollback OK"
  exit 0
fi

# ---------------------------------------------------------------------------
# DNS gate (runs on the server: it has dig and sits on the same network the
# ACME validators will reach).
# ---------------------------------------------------------------------------
ZONE="${DOMAIN#*.}"
echo "==> DNS check for $DOMAIN (expecting A = $EXPECTED_IP)"
DNS_OUT="$(remote "set -e
  for r in 1.1.1.1 8.8.8.8; do
    printf 'A %s %s\n' \"\$r\" \"\$(dig +short +time=5 +tries=2 A '$DOMAIN' @\$r | tr '\n' ',' )\"
  done
  NSLIST=\$(dig +short +time=5 +tries=2 NS '$DOMAIN' @1.1.1.1)
  [ -n \"\$NSLIST\" ] || NSLIST=\$(dig +short +time=5 +tries=2 NS '$ZONE' @1.1.1.1)
  for ns in \$NSLIST; do
    printf 'A %s %s\n' \"\$ns\" \"\$(dig +short +time=5 +tries=2 A '$DOMAIN' @\$ns | tr '\n' ',' )\"
  done
  printf 'AAAA 1.1.1.1 %s\n' \"\$(dig +short +time=5 +tries=2 AAAA '$DOMAIN' @1.1.1.1 | tr '\n' ',' )\"
")"
echo "$DNS_OUT" | sed 's/^/    /'

OK=1
RESOLVERS=0
while IFS=' ' read -r type resolver answer; do
  [ -z "$type" ] && continue
  answer="${answer%,}"
  if [ "$type" = "AAAA" ]; then
    if [ -n "$answer" ]; then
      echo "!! $DOMAIN has an AAAA (IPv6) record ($answer). This VPS has no IPv6;" >&2
      echo "   clients and Let's Encrypt that prefer IPv6 would fail. Remove the AAAA record." >&2
      OK=0
    fi
    continue
  fi
  RESOLVERS=$((RESOLVERS + 1))
  # The answer may contain a CNAME target line before the IP; keep only IPv4s.
  ips="$(printf '%s' "$answer" | tr ',' '\n' | { grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' || true; } | sort -u | tr '\n' ',' )"
  ips="${ips%,}"
  if [ -z "$ips" ]; then
    echo "!! $resolver: no A record for $DOMAIN (NXDOMAIN / empty)." >&2
    OK=0
  elif [ "$ips" = "$BLOCKED_IP" ]; then
    echo "!! $resolver: $DOMAIN points to $BLOCKED_IP, the FIRST IP (eth0)." >&2
    echo "   That IP is not reachable from outside Iran, so VPN users and the ACME" >&2
    echo "   validators would fail. The A record must be $EXPECTED_IP (eth1)." >&2
    OK=0
  elif [ "$ips" != "$EXPECTED_IP" ]; then
    echo "!! $resolver: $DOMAIN -> $ips, expected $EXPECTED_IP." >&2
    OK=0
  fi
done <<< "$DNS_OUT"

if [ "$RESOLVERS" -lt 2 ]; then
  echo "!! could not query enough resolvers (got $RESOLVERS answers)" >&2
  OK=0
fi

if [ "$OK" != "1" ]; then
  echo >&2
  echo "DNS is NOT ready. Ask the pegah.tech DNS admin for exactly this record:" >&2
  echo "    $DOMAIN.   A   $EXPECTED_IP      (DNS only -- no CDN/proxy, no AAAA)" >&2
  echo "then re-run: ./deploy/enable-domain.sh --check" >&2
  exit 1
fi
echo "    DNS OK: every resolver returns $EXPECTED_IP, no AAAA."

if [ "$MODE" = "check" ]; then
  echo "==> --check only; server not modified. Run without flags to enable HTTPS."
  exit 0
fi

# ---------------------------------------------------------------------------
# Apply on the server.
# ---------------------------------------------------------------------------
echo "==> Current site settings on $SERVER"
remote "cd '$REMOTE_DIR' && grep -E '^(SITE_ADDRESS|SITE_URL|COOKIE_SECURE|LEGACY_HTTP_ADDRESS|LEGACY_REDIRECT_TO)=' .env | sed 's/^/    /'"

echo "==> Updating .env (backup kept as .env.bak-<timestamp>)"
remote "cd '$REMOTE_DIR' && set -e
  cp .env .env.bak-\$(date +%Y%m%d-%H%M%S)
  set_kv() {
    if grep -qE \"^\$1=\" .env; then
      sed -i -E \"s|^\$1=.*|\$1=\$2|\" .env
    else
      printf '%s=%s\n' \"\$1\" \"\$2\" >> .env
    fi
  }
  set_kv SITE_ADDRESS '$DOMAIN'
  set_kv SITE_URL 'https://$DOMAIN'
  set_kv COOKIE_SECURE 'true'
  set_kv LEGACY_HTTP_ADDRESS 'http://$EXPECTED_IP'
  set_kv LEGACY_REDIRECT_TO 'https://$DOMAIN'
  grep -E '^(SITE_ADDRESS|SITE_URL|COOKIE_SECURE|LEGACY_HTTP_ADDRESS|LEGACY_REDIRECT_TO)=' .env | sed 's/^/    /'"

echo "==> Recreating web + caddy (no migrate re-run)"
remote "cd '$REMOTE_DIR' && $PIN && echo \"    IMAGE_TAG=\$IMAGE_TAG\" && docker compose up -d --no-deps --force-recreate web caddy"

echo "==> Waiting for the certificate and https://$DOMAIN/api/phase"
DEADLINE=$((SECONDS + 180))
SERVER_OK=0
while [ $SECONDS -lt $DEADLINE ]; do
  # The VPS cannot reach its own public IP (no hairpin NAT), so pin the name to
  # loopback: SNI and certificate verification still use the real domain.
  if remote "curl -fsS -m 10 -o /dev/null --resolve '$DOMAIN:443:127.0.0.1' 'https://$DOMAIN/api/phase'" 2>/dev/null; then
    SERVER_OK=1
    break
  fi
  printf '.'
  sleep 5
done
echo

if [ "$SERVER_OK" != "1" ]; then
  echo "!! https://$DOMAIN/api/phase did not come up within 3 minutes. Caddy log:" >&2
  remote "cd '$REMOTE_DIR' && docker compose logs --tail=60 caddy" >&2 || true
  echo >&2
  echo "Site is probably DOWN right now. Roll back with:" >&2
  echo "    ./deploy/enable-domain.sh --rollback" >&2
  exit 1
fi
echo "    server-side: https://$DOMAIN/api/phase -> 200"

echo "==> Checking from this machine"
curl -fsS -m 20 "https://$DOMAIN/api/phase" && echo
REDIRECT="$(curl -s -m 20 -o /dev/null -w '%{http_code} %{redirect_url}' "http://$DOMAIN/api/phase" || true)"
echo "    http://$DOMAIN -> $REDIRECT"
case "$REDIRECT" in
  30[178]\ https://"$DOMAIN"/*) echo "    HTTP->HTTPS redirect OK" ;;
  *) echo "!! expected a 301/307/308 redirect to https://$DOMAIN, got: $REDIRECT" >&2 ;;
esac
LEGACY="$(curl -s -m 20 -o /dev/null -w '%{http_code} %{redirect_url}' "http://$EXPECTED_IP/api/phase" || true)"
echo "    http://$EXPECTED_IP -> $LEGACY"
case "$LEGACY" in
  30[1278]\ https://"$DOMAIN"/*) echo "    old IP links redirect to the domain: OK" ;;
  *) echo "!! expected http://$EXPECTED_IP to redirect to https://$DOMAIN, got: $LEGACY" >&2 ;;
esac

cat <<EOF

==> Done. The site is live on https://$DOMAIN

Next:
  - Health checks: deploy.sh now uses HEALTH_URL (default https://$DOMAIN/api/phase
    once SITE_URL is https). For uptime-check.sh pass the URL explicitly:
        deploy/uptime-check.sh https://$DOMAIN/api/health
  - Old links to http://$EXPECTED_IP/... now redirect (302) to https://$DOMAIN/...
  - Users who were logged in on http://$HOST_ONLY must log in again
    (cookies are now Secure and scoped to the domain).
  - Push notifications / PWA install become available (they need HTTPS).
  - Rollback at any time: ./deploy/enable-domain.sh --rollback
EOF
