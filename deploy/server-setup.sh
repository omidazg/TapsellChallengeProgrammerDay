#!/usr/bin/env bash
# Idempotent bootstrap for a fresh Ubuntu 22.04/24.04 VPS that will run
# the arena app via Docker Compose + Caddy.
#
# Usage (as root, on the server):
#   bash server-setup.sh            # base setup, SSH password auth left alone
#   bash server-setup.sh --harden   # also disables SSH password auth at the end
#
# Safe to re-run: every step checks current state before acting.
set -euo pipefail

HARDEN=0
for arg in "$@"; do
  case "$arg" in
    --harden) HARDEN=1 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

# Optional domestic apt mirror. On the ArvanCloud Qeysar VPS the default
# Ubuntu archive hangs `apt-get update` for 10+ minutes; e.g.
#   APT_MIRROR=http://mirror.iranserver.com/ubuntu/ bash server-setup.sh
if [ -n "${APT_MIRROR:-}" ] && [ -f /etc/apt/sources.list.d/ubuntu.sources ]; then
  echo "==> apt mirror -> $APT_MIRROR"
  sed -i -E "s#^URIs: .*#URIs: ${APT_MIRROR}#" /etc/apt/sources.list.d/ubuntu.sources
fi

# A VPS created without IPv6 still resolves AAAA records, and Docker then
# fails ghcr.io blob downloads with "network is unreachable" instead of
# falling back to IPv4. Turn IPv6 off when there is no global IPv6 address.
if ! ip -6 addr show scope global 2>/dev/null | grep -q inet6; then
  echo "==> no global IPv6 address: disabling IPv6"
  printf "net.ipv6.conf.all.disable_ipv6 = 1\nnet.ipv6.conf.default.disable_ipv6 = 1\nnet.ipv6.conf.lo.disable_ipv6 = 1\n" \
    > /etc/sysctl.d/99-disable-ipv6.conf
  sysctl -q --system || true
fi

echo "==> apt update/upgrade"
apt-get update -y
apt-get upgrade -y

echo "==> base packages"
apt-get install -y \
  ca-certificates curl gnupg lsb-release git ufw fail2ban \
  unattended-upgrades apt-listchanges

echo "==> Docker Engine + Compose plugin (official apt repo)"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
  fi
  ARCH="$(dpkg --print-architecture)"
  CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  # download.docker.com is often too slow from Iranian VPSes; fall back to
  # Ubuntu's own packages (served by the apt mirror) when it fails.
  if ! { apt-get update -y && timeout 600 apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin; }; then
    echo "    official Docker repo failed; installing Ubuntu's docker.io + docker-compose-v2 instead"
    rm -f /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker.io docker-compose-v2 docker-buildx
  fi
else
  echo "docker already installed: $(docker --version)"
fi
systemctl enable --now docker

echo "==> Docker registry mirror (ArvanCloud)"
# registry-1.docker.io (Docker Hub, AWS-hosted) is unreliable/unreachable from
# this VPS; ArvanCloud's mirror is. Without this, `docker build`/`docker pull`
# time out resolving even cached base images.
DAEMON_JSON=/etc/docker/daemon.json
if [ ! -f "$DAEMON_JSON" ] || ! grep -q "arvancloud" "$DAEMON_JSON" 2>/dev/null; then
  cat > "$DAEMON_JSON" <<'EOF'
{
  "registry-mirrors": ["https://docker.arvancloud.ir"]
}
EOF
  systemctl restart docker
else
  echo "    registry mirror already configured."
fi

echo "==> firewall (ufw): allow SSH, HTTP, HTTPS"
ufw allow 22/tcp || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw --force enable

echo "==> fail2ban"
systemctl enable --now fail2ban

echo "==> unattended-upgrades"
dpkg-reconfigure -f noninteractive unattended-upgrades || true
systemctl enable --now unattended-upgrades || true

echo "==> timezone"
timedatectl set-timezone Asia/Tehran || true

echo "==> app directories"
mkdir -p /srv/arena/app /srv/arena/data
chmod 700 /srv/arena/data

if [ "$HARDEN" -eq 1 ]; then
  echo "==> --harden: disabling SSH password authentication"
  echo "    (make sure your SSH key already logs you in before this runs!)"
  SSHD_CONFIG=/etc/ssh/sshd_config
  if grep -qE '^\s*#?\s*PasswordAuthentication' "$SSHD_CONFIG"; then
    sed -i 's/^\s*#\?\s*PasswordAuthentication.*/PasswordAuthentication no/' "$SSHD_CONFIG"
  else
    echo "PasswordAuthentication no" >> "$SSHD_CONFIG"
  fi
  systemctl reload ssh || systemctl reload sshd || true
  echo "SSH password authentication is now DISABLED. Key-based login only."
else
  echo "==> skipping SSH hardening (pass --harden to disable password auth)"
fi

echo "==> done. Docker: $(docker --version); Compose: $(docker compose version)"
