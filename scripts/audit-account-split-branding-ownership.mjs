#!/usr/bin/env node
/**
 * Read-only audit of completed Site splits whose destination ClinicSite
 * branding still uses a source-owned storage key.
 *
 * Uses DATABASE_URL only. Does not read DIRECT_URL, does not print the
 * connection string, and does not write to the database or object storage.
 *
 * Run from a trusted machine after choosing the database:
 *
 *   DATABASE_URL="postgresql://..." node scripts/audit-account-split-branding-ownership.mjs
 *
 * Do not point this command at production from Cursor Cloud.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { listCrossOwnedCompletedSplits } from "../lib/account-split/branding-ownership-audit.mjs";

function printHelp() {
  console.log(`Read-only completed-split branding ownership audit.

Prints preparation, source clinic, destination clinic, site, and field names
when a completed destination Site still stores a source-owned branding key.
Prints an empty list when none are affected. Does not mutate data.

Usage:
  node scripts/audit-account-split-branding-ownership.mjs

Requires DATABASE_URL. Does not use DIRECT_URL.
`);
}

async function main() {
  if (process.argv.includes("--help")) {
    printHelp();
    return;
  }
  const unknown = process.argv.slice(2).filter((arg) => arg !== "--help");
  if (unknown.length > 0) {
    throw new Error(`Unknown arguments: ${unknown.join(", ")}`);
  }
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    const findings = await listCrossOwnedCompletedSplits(prisma);
    console.log(
      JSON.stringify(
        {
          readOnly: true,
          affectedCount: findings.length,
          findings,
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Audit failed.";
  console.error(message);
  process.exitCode = 1;
});
