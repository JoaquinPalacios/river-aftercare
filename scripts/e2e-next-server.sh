#!/usr/bin/env bash
# Builds and starts the Playwright server. Static marketing links are baked
# from CARE_GUIDE_METADATA_BASE, so this process owns that value and writes
# to .next-e2e. It does not change `pnpm dev` or a normal `pnpm build`.
set -euo pipefail

port="${E2E_PORT:?E2E_PORT is required}"
expected="http://localhost:${port}"

if [[ "${CARE_GUIDE_METADATA_BASE:-}" != "$expected" ]]; then
  echo "E2E build requires CARE_GUIDE_METADATA_BASE=${expected}" >&2
  exit 1
fi

if [[ "${CARE_GUIDE_E2E_BUILD:-}" != "1" ]]; then
  echo "E2E build requires CARE_GUIDE_E2E_BUILD=1 so output stays out of .next" >&2
  exit 1
fi

pnpm exec next build
exec pnpm exec next start --hostname 0.0.0.0 --port "$port"
