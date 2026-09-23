#!/usr/bin/env bash
# Server hardening for the arena Ubuntu box: firewall, fail2ban, unattended
# security upgrades, and (carefully) disabling SSH password/root-password
# login. This is a SCRIPT ONLY — it is not run by this agent. The lead
# copies it to the server and runs it there deliberately.
#
# Usage (as root, on the server):
#   bash deploy/harden-server.sh
#
# Idempotent: safe to re-run. Every step checks current state before acting.
#
# What it does:
#   - ufw: default deny incoming, allow 22 (ssh), 80/443 (http/https),
#     8080 (staging web, see docker-compose.staging.yml).
#   - fail2ban: installs + enables the sshd jail.
#   - unattended-upgrades: installs + enables automatic security updates.
#   - sshd: sets PasswordAuthentication no and PermitRootLogin
#     prohibit-password, but ONLY after confirming
#     /root/.ssh/authorized_keys is non-empty (otherwise you'd lock
#     yourself out). Validates the new config with `sshd -t` before
#     reloading, and does not reload if validation fails.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "==> apt update"
apt-get update -y

echo "==> installing ufw, fail2ban, unattended-upgrades"
apt-get install -y --no-install-recommends ufw fail2ban unattended-upgrades apt-listchanges

echo "==> ufw: default deny incoming, allow 22/80/443/8080"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    comment 'ssh'
ufw allow 80/tcp    comment 'http'
ufw allow 443/tcp   comment 'https'
ufw allow 8080/tcp  comment 'staging web'
ufw --force enable
ufw status verbose

echo "==> fail2ban: sshd jail"
JAIL_LOCAL=/etc/fail2ban/jail.local
if [ ! -f "$JAIL_LOCAL" ]; then
  cat > "$JAIL_LOCAL" <<'EOF'
[sshd]
enabled = true
port    = ssh
backend = systemd
maxretry = 5
bantime  = 1h
findtime = 10m
EOF
  echo "    wrote $JAIL_LOCAL"
else
  if ! grep -q '^\[sshd\]' "$JAIL_LOCAL"; then
    printf '\n[sshd]\nenabled = true\nport = ssh\nbackend = systemd\nmaxretry = 5\nbantime = 1h\nfindtime = 10m\n' >> "$JAIL_LOCAL"
    echo "    appended [sshd] section to existing $JAIL_LOCAL"
  else
    echo "    $JAIL_LOCAL already has an [sshd] section, leaving it alone"
  fi
fi
systemctl enable --now fail2ban
systemctl restart fail2ban
fail2ban-client status sshd || true

echo "==> unattended-upgrades: enable automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades || true
UPGRADES_FILE=/etc/apt/apt.conf.d/20auto-upgrades
if [ ! -f "$UPGRADES_FILE" ] || ! grep -q 'APT::Periodic::Unattended-Upgrade "1"' "$UPGRADES_FILE"; then
  cat > "$UPGRADES_FILE" <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
  echo "    wrote $UPGRADES_FILE"
else
  echo "    $UPGRADES_FILE already configured"
fi
systemctl enable --now unattended-upgrades

echo "==> SSH hardening (password auth off, root login key-only)"
AUTHORIZED_KEYS=/root/.ssh/authorized_keys
if [ ! -s "$AUTHORIZED_KEYS" ]; then
  echo "!! $AUTHORIZED_KEYS is missing or empty." >&2
  echo "!! Refusing to disable SSH password authentication -- you would lock yourself out." >&2
  echo "!! Install your public key there first (see deploy/README-deploy.md), then re-run this script." >&2
  exit 1
fi
echo "    found $(grep -c '^ssh-' "$AUTHORIZED_KEYS" || echo 0) key(s) in $AUTHORIZED_KEYS -- safe to proceed"

SSHD_CONFIG=/etc/ssh/sshd_config
SSHD_CONFIG_TMP="$(mktemp)"
cp "$SSHD_CONFIG" "$SSHD_CONFIG_TMP"

set_sshd_option() {
  local key="$1" value="$2"
  if grep -qE "^\s*#?\s*${key}\b" "$SSHD_CONFIG_TMP"; then
    sed -i -E "s/^\s*#?\s*${key}\b.*/${key} ${value}/" "$SSHD_CONFIG_TMP"
  else
    echo "${key} ${value}" >> "$SSHD_CONFIG_TMP"
  fi
}
set_sshd_option PasswordAuthentication no
set_sshd_option PermitRootLogin prohibit-password

echo "==> validating candidate sshd config with sshd -t"
if sshd -t -f "$SSHD_CONFIG_TMP"; then
  cp "$SSHD_CONFIG_TMP" "$SSHD_CONFIG"
  rm -f "$SSHD_CONFIG_TMP"
  systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
  echo "    sshd config updated and reloaded: PasswordAuthentication no, PermitRootLogin prohibit-password"

  # On modern Ubuntu, /etc/ssh/sshd_config.d/*.conf drop-ins (often left by the
  # cloud image) are Included at the TOP of sshd_config, and sshd keeps the
  # FIRST value it sees -- so a drop-in saying "PasswordAuthentication yes"
  # silently wins over what we just wrote. Check what sshd actually resolves.
  echo "==> verifying effective sshd settings (sshd -T)"
  EFFECTIVE="$(sshd -T 2>/dev/null || true)"
  if [ -n "$EFFECTIVE" ]; then
    echo "$EFFECTIVE" | grep -iE '^(passwordauthentication|permitrootlogin) ' | sed 's/^/    /'
    if echo "$EFFECTIVE" | grep -qi '^passwordauthentication yes'; then
      echo "!! Password authentication is STILL ENABLED after the change." >&2
      echo "!! A drop-in is overriding it. Check: grep -r PasswordAuthentication /etc/ssh/sshd_config.d/" >&2
      echo "!! Fix that file, then re-run this script." >&2
      exit 1
    fi
  else
    echo "    (sshd -T unavailable; verify manually with: sshd -T | grep -i passwordauth)"
  fi
else
  echo "!! sshd -t validation FAILED on the candidate config -- leaving live sshd_config untouched." >&2
  rm -f "$SSHD_CONFIG_TMP"
  exit 1
fi

echo "==> done. ufw: $(ufw status | head -1); fail2ban: $(systemctl is-active fail2ban); unattended-upgrades: $(systemctl is-active unattended-upgrades)"
