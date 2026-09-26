#!/usr/bin/env bash
# Idempotent Cloud Agent install. Prepares dependencies and caches only.
# Does not migrate, seed, or require CLOUD_* / AUTH_SECRET.
set -euo pipefail

cd "$(dirname "$0")/.."

export DEBIAN_FRONTEND=noninteractive
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

if [[ -n "${DIRECT_URL:-}" ]]; then
  echo "Refusing Cloud install: DIRECT_URL must not be set." >&2
  exit 1
fi

if [[ "${DATABASE_URL:-}${E2E_DATABASE_URL:-}" == *neon.tech* ]]; then
  echo "Refusing Cloud install: a Neon database URL is set." >&2
  exit 1
fi

corepack enable
corepack prepare --activate

if ! docker info >/dev/null 2>&1; then
  sudo service docker start
  ready=0
  for _ in $(seq 1 30); do
    if docker info >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [[ "${ready}" != "1" ]]; then
    echo "Docker did not become usable during Cloud install." >&2
    exit 1
  fi
fi

docker pull postgres:18-alpine

export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/care_guide?schema=public}"
pnpm install --frozen-lockfile
pnpm exec prisma generate --config prisma.config.ts
pnpm exec playwright install --with-deps chromium

mkdir -p /home/ubuntu/.local/bin
executable="$(
  node --input-type=module -e 'import { chromium } from "@playwright/test"; process.stdout.write(chromium.executablePath())'
)"
ln -sfn "${executable}" /home/ubuntu/.local/bin/river-aftercare-chromium
