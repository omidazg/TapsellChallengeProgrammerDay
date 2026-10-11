#!/bin/sh
# Privilege drop for every container that touches the shared sqlite volume
# (web, migrate, backup). Used as the image ENTRYPOINT (see Dockerfile):
#
#   drop-privs.sh <command> [args...]
#
# Started as root (the default -- the images have no USER line on purpose):
#   1. Makes every path under $CHOWN_DIRS (default: /app/data) owned by
#      $RUN_AS_USER (default: node, uid/gid 1000). Only entries that are NOT
#      already owned are touched, so after the first run this is a quick scan.
#      Needed because the production volume (/srv/arena/data: dev.db, -wal,
#      -shm, uploads/) was created by containers that ran as root. A root
#      process that later creates dev.db-wal/-shm would make them unwritable
#      for the app user ("attempt to write a readonly database"), which is why
#      ALL services that open the db go through this script.
#   2. Re-execs <command> as $RUN_AS_USER via setpriv (util-linux, already in
#      node:*-bookworm-slim -- no extra package, no network at build time).
#
# Started as non-root (e.g. `user:` set in compose): runs <command> unchanged.
#
# Emergency switch: RUN_AS_USER=root (e.g. in the server's .env, then
# `docker compose up -d --force-recreate web backup`) skips the drop entirely
# and restores the old run-as-root behaviour. Switching back later is safe:
# step 1 re-chowns whatever root created in the meantime.
set -eu

RUN_AS="${RUN_AS_USER:-node}"

if [ "$(id -u)" != "0" ] || [ "$RUN_AS" = "root" ]; then
  exec "$@"
fi

for dir in ${CHOWN_DIRS:-/app/data}; do
  [ -d "$dir" ] || continue
  # -xdev: never wander onto another filesystem; -h: never follow symlinks.
  find "$dir" -xdev \( ! -user "$RUN_AS" -o ! -group "$RUN_AS" \) \
    -exec chown -h "$RUN_AS:$RUN_AS" {} + || {
      echo "[drop-privs] WARNING: could not chown everything under $dir" >&2
    }
done

# npx/prisma/tsx write caches under $HOME; root's HOME (/root) is not
# writable for the app user.
HOME="$(getent passwd "$RUN_AS" | cut -d: -f6)"
export HOME

exec setpriv --reuid="$RUN_AS" --regid="$RUN_AS" --init-groups "$@"
