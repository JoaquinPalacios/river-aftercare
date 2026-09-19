#!/usr/bin/env bash
# Idempotent repository bootstrap for Cloud Agents.
# Installs system + Node dependencies, generates the Prisma client, prepares a
# local .env, and brings the local Postgres database up to a migrated + seeded
# state so the app is usable immediately.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# 1. System dependency: PostgreSQL (Docker is not available inside the VM, so we
#    run a native cluster instead of compose.yaml).
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    postgresql postgresql-contrib
fi

# 2. Node dependencies (respect the pinned package manager + lockfile).
#    The base image already ships pnpm; only fall back to corepack when it is
#    genuinely missing so we don't accidentally pull a different pnpm major.
if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable pnpm
fi
pnpm install --frozen-lockfile

# 3. Prisma client generation.
pnpm db:generate

# 4. Local dev env file. Never committed; AUTH_SECRET is generated once and then
#    reused so existing sessions survive re-runs.
if [ ! -f .env ]; then
  cat > .env <<EOF
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/care_guide?schema=public"
AUTH_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
NEXT_PUBLIC_SUPABASE_URL=""
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=""
SUPABASE_SERVICE_ROLE_KEY=""
DATABASE_PASSWORD=""
EOF
fi

# 5. Bring the database up: start the cluster, ensure role/db exist, apply
#    migrations, and seed the demo clinic. All steps are idempotent.
"$REPO_ROOT/.cursor/db-up.sh"

echo "care-guide install complete."
