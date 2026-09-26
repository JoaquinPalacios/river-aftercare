#!/usr/bin/env bash
# Start the local PostgreSQL cluster and ensure the care_guide database exists,
# is migrated, and is seeded. Safe to run repeatedly (used by both install and
# start).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Detect the installed PostgreSQL major version (e.g. 16) rather than hardcoding.
PG_VER="$(ls /etc/postgresql 2>/dev/null | sort -n | tail -1 || true)"
if [ -z "${PG_VER}" ]; then
  echo "PostgreSQL is not installed; run .cursor/install.sh first." >&2
  exit 1
fi

sudo pg_ctlcluster "$PG_VER" main start 2>/dev/null || true

# Wait for the server to accept connections.
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q 2>/dev/null; then
    break
  fi
  sleep 1
done

# Ensure the password + database match DATABASE_URL in .env.
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';" >/dev/null
if ! sudo -u postgres psql -tAc \
  "SELECT 1 FROM pg_database WHERE datname='care_guide'" | grep -q 1; then
  sudo -u postgres createdb care_guide
fi

# Apply migrations and seed demo data (both idempotent).
pnpm exec prisma migrate deploy --config prisma.config.ts
pnpm db:seed

echo "care-guide database is ready (PostgreSQL ${PG_VER})."
