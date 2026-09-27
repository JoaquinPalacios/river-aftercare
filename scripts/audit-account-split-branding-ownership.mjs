#!/usr/bin/env node
/**
 * Read-only audit of completed Site splits whose destination ClinicSite
 * branding still uses a source-owned storage key.
 *
 * Local / configured database:
 *   pnpm audit:account-split-branding
 * Uses DATABASE_URL. When that variable is unset, dotenv loads .env.
 * It does not load .env.neon-production.
 *
 * Production (trusted machine only):
 *   pnpm prod:audit:account-split-branding
 *
 * Do not point the local command at production from Cursor Cloud.
 */
import {
  formatBrandingAuditReport,
  listCrossOwnedCompletedSplits,
} from "../lib/account-split/branding-ownership-audit.mjs";
import {
  AUDIT_SKIP_DOTENV_ENV,
  AUDIT_TARGET_ENV,
  PRODUCTION_AUDIT_TARGET,
  PRODUCTION_AUDIT_TARGET_LABEL,
  localAuditTargetLabel,
  redactAuditOutput,
} from "../lib/release/production-branding-audit.mjs";

function printHelp() {
  console.log(`Read-only completed-split branding ownership audit.

Prints preparation id, source clinic id, destination clinic id, site id, and
field names when a completed destination Site still stores a source-owned
branding key. Prints "Affected completed splits: 0" only after a successful
query. Does not mutate the database or object storage.

Local:
  pnpm audit:account-split-branding
  Uses the configured DATABASE_URL (.env when DATABASE_URL is unset).

Production:
  pnpm prod:audit:account-split-branding
  Loads .env.neon-production the same way as pnpm prod:db:status.
`);
}

function targetLabel(connectionString) {
  if (process.env[AUDIT_TARGET_ENV] === PRODUCTION_AUDIT_TARGET) {
    return PRODUCTION_AUDIT_TARGET_LABEL;
  }
  return localAuditTargetLabel(connectionString);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }
  const unknown = process.argv
    .slice(2)
    .filter((arg) => arg !== "--help" && arg !== "-h");
  if (unknown.length > 0) {
    throw new Error(`Unknown arguments: ${unknown.join(", ")}`);
  }
  if (process.env[AUDIT_SKIP_DOTENV_ENV] !== "1") {
    await import("dotenv/config");
  }
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required. pnpm audit:account-split-branding uses the configured DATABASE_URL (.env when it is unset). Production is pnpm prod:audit:account-split-branding."
    );
  }

  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    const findings = await listCrossOwnedCompletedSplits(prisma);
    process.stdout.write(
      formatBrandingAuditReport(findings, targetLabel(connectionString))
    );
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Audit failed.";
  console.error(redactAuditOutput(message));
  console.error("Audit failed. Affected count was not established.");
  process.exitCode = 1;
});
