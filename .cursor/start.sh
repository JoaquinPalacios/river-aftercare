#!/usr/bin/env bash
# Per-boot reconciliation: ensure PostgreSQL is running and the database is
# migrated + seeded. The Next.js dev server itself runs in a named terminal.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

"$REPO_ROOT/.cursor/db-up.sh"
