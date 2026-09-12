#!/usr/bin/env sh
# Entrypoint for the one-shot "migrate" compose service.
# Applies the schema (idempotent) and runs the idempotent seed script
# against the shared sqlite volume, then exits successfully so the
# "web" service (depends_on: condition: service_completed_successfully)
# is allowed to start.
set -eu

echo "[migrate] DATABASE_URL=${DATABASE_URL:-unset}"

if [ -d "/app/prisma/migrations" ] && [ -n "$(ls -A /app/prisma/migrations 2>/dev/null)" ]; then
  echo "[migrate] migrations directory found, running: prisma migrate deploy"
  npx prisma migrate deploy
else
  echo "[migrate] no migrations directory, running: prisma db push"
  npx prisma db push
fi

echo "[migrate] seeding (idempotent)..."
npx tsx prisma/seed.ts

echo "[migrate] done."
