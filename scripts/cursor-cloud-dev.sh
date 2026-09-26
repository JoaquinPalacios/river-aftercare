#!/usr/bin/env bash
# Foreground Next.js dev server for the Cloud Agent terminal.
set -euo pipefail

cd "$(dirname "$0")/.."

export CARE_GUIDE_ROOT_DOMAIN="${CARE_GUIDE_ROOT_DOMAIN:-localhost}"
exec pnpm exec next dev --hostname 0.0.0.0 --port 3000
