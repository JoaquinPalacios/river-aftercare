import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { isLocalDevelopmentDatabase } from "../lib/dev/database-target.ts";
import {
  applySharedDemoConfig,
  formatSharedDemoConfigReport,
  loadSharedDemoConfigSnapshot,
  planSharedDemoConfig,
} from "../lib/dev/shared-demo-config.ts";

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
    return { help: true };
  }
  const apply = flags.has("--apply");
  const allowProduction = flags.has("--allow-production");
  const confirmSharedDemo = flags.has("--confirm-shared-demo");
  const confirmBranding = flags.has("--confirm-branding");
  flags.delete("--apply");
  flags.delete("--allow-production");
  flags.delete("--confirm-shared-demo");
  flags.delete("--confirm-branding");
  flags.delete("--dry-run");
  if (flags.size > 0) {
    throw new Error(`Unknown flags: ${[...flags].join(", ")}`);
  }
  return {
    help: false,
    apply,
    allowProduction,
    confirmSharedDemo,
    confirmBranding,
  };
}

function printHelp() {
  console.info(`Configure the existing shared River Aftercare demo.

Resolves the existing account by the unique slug demodental, then checks
that account id, primary site id, site slug, and root location id against
each other. Does not create an account, a site, or a location. Does not
rewrite published guide revisions, canonical pins, overrides, or additions.
Does not replace stored colours, logo, or theme.

Dry-run is the default. A remote database also needs --allow-production
and --confirm-shared-demo. --confirm-branding updates the public name,
contact details, and emergency instructions only.
Deployment does not run this command.

Usage:
  pnpm configure:shared-demo
  pnpm configure:shared-demo -- --apply
  pnpm configure:shared-demo -- --apply --confirm-branding
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
  const local = isLocalDevelopmentDatabase(
    connectionString,
    process.env.VERCEL_ENV
  );
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  try {
    const snapshot = await loadSharedDemoConfigSnapshot(prisma);
    const plan = planSharedDemoConfig({
      local,
      apply: options.apply,
      allowProduction: options.allowProduction,
      confirmSharedDemo: options.confirmSharedDemo,
      confirmBranding: options.confirmBranding,
      snapshot,
    });
    console.info(`Plan: ${plan.action}`);
    console.info(plan.reason);
    console.info(formatSharedDemoConfigReport(plan));
    if (!options.apply || plan.action !== "configure") {
      if (plan.action === "refuse") {
        process.exitCode = 1;
      }
      console.info(options.apply ? "Apply: no writes." : "Dry-run: no writes.");
      return;
    }
    await applySharedDemoConfig(prisma, plan);
    console.info(
      "Apply: updated the existing shared demo. No guide revision was rewritten."
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Shared demo configuration failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
