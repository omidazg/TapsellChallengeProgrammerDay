#!/usr/bin/env sh
# Entrypoint for the one-shot "migrate" compose service.
# Applies the schema (idempotent) and runs the idempotent seed script
# against the shared sqlite volume, then exits successfully so the
# "web" service (depends_on: condition: service_completed_successfully)
# is allowed to start.
set -eu

echo "[migrate] DATABASE_URL=${DATABASE_URL:-unset}"

if [ -d "/app/prisma/migrations" ] && [ -n "$(ls -A /app/prisma/migrations 2>/dev/null)" ]; then
  # A database created earlier with `db push` has tables but no migration
  # history. Mark the baseline (0_init == schema at that time) as applied so
  # `migrate deploy` only runs the migrations that came after it.
  NEEDS_BASELINE=$(node -e '
    const url = process.env.DATABASE_URL || "";
    const file = url.replace(/^file:/, "");
    const fs = require("fs");
    if (!file || !fs.existsSync(file)) { console.log("no"); process.exit(0); }
    const db = new (require("better-sqlite3"))(file, { readonly: true });
    const has = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE name=?").get(t);
    console.log(has("User") && !has("_prisma_migrations") ? "yes" : "no");
  ')
  if [ "$NEEDS_BASELINE" = "yes" ]; then
    echo "[migrate] existing db without migration history -> baselining 0_init"
    npx prisma migrate resolve --applied 0_init
  fi
  echo "[migrate] migrations directory found, running: prisma migrate deploy"
  npx prisma migrate deploy
else
  echo "[migrate] no migrations directory, running: prisma db push"
  npx prisma db push
fi

echo "[migrate] seeding (idempotent)..."
npx tsx prisma/seed.ts

echo "[migrate] done."
