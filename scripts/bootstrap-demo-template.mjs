import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import {
  bootstrapDemoExtractionTemplate,
  formatDemoExtractionBootstrapPlan,
} from "../lib/clinic-portal/bootstrap-demo-extraction-template.mjs";

function prismaCliDatabaseUrl(env = process.env) {
  const direct = env.DIRECT_URL?.trim();
  if (direct) {
    return direct;
  }
  return env.DATABASE_URL;
}

function parseArgs(argv) {
  const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
  const unknown = argv.filter((arg) => !arg.startsWith("--"));

  if (unknown.length > 0) {
    throw new Error(`Unknown arguments: ${unknown.join(", ")}`);
  }

  if (flags.has("--help")) {
    return { help: true, apply: false };
  }

  const apply = flags.has("--apply");
  const dryRun = flags.has("--dry-run");
  flags.delete("--apply");
  flags.delete("--dry-run");

  if (flags.size > 0) {
    throw new Error(`Unknown flags: ${[...flags].join(", ")}`);
  }

  if (apply && dryRun) {
    throw new Error("Use either --apply or --dry-run, not both.");
  }

  return { help: false, apply };
}

function printHelp() {
  console.info(`Bootstrap the SAMPLE / NON-CLINICAL Tooth Extraction template.

Creates only GuideTemplate + GuideTemplateRevision + 8 GuideTemplateSection
rows. Never creates clinics, users, or practice guides.

Dry-run is the default. Writes require --apply.

Usage:
  pnpm bootstrap:demo-template
  pnpm bootstrap:demo-template -- --dry-run
  pnpm bootstrap:demo-template -- --apply

Uses DIRECT_URL when set, otherwise DATABASE_URL.
Does not run prisma/seed.mjs.
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const connectionString = prismaCliDatabaseUrl();
  if (!connectionString) {
    throw new Error("DIRECT_URL or DATABASE_URL is required.");
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const result = await bootstrapDemoExtractionTemplate({
      prisma,
      apply: options.apply,
    });
    console.info(formatDemoExtractionBootstrapPlan(result.plan));
    if (options.apply) {
      console.info(
        result.applied ? "Apply: wrote records." : "Apply: no writes."
      );
    } else {
      console.info("Dry-run: no writes.");
    }

    if (result.plan.action === "refuse") {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Demo template bootstrap failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
