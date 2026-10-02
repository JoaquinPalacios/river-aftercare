import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { isLocalDevelopmentDatabase } from "../lib/dev/database-target.ts";
import {
  createPhysioDemoClinicShell,
  loadPhysioDemoClinicExists,
  planPhysioDemoClinicShell,
} from "../lib/dev/physio-demo-seed.ts";

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
  const confirmDemoClinic = flags.has("--confirm-demo-clinic");
  flags.delete("--apply");
  flags.delete("--allow-production");
  flags.delete("--confirm-demo-clinic");
  flags.delete("--dry-run");
  if (flags.size > 0) {
    throw new Error(`Unknown flags: ${[...flags].join(", ")}`);
  }
  return { help: false, apply, allowProduction, confirmDemoClinic };
}

function printHelp() {
  console.info(`Provision the River Physio Demo clinic shell.

Creates the account, profile, primary Clinic Site, and root Location only.
Does not create a sample, a practice guide, a Stripe customer, or a checkout.

Dry-run is the default. A remote database also needs --allow-production and
--confirm-demo-clinic. Deployment does not run this command.

Usage:
  pnpm provision:physio-demo-clinic
  pnpm provision:physio-demo-clinic -- --apply
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
    const clinicExists = await loadPhysioDemoClinicExists(prisma);
    const plan = planPhysioDemoClinicShell({
      local,
      apply: options.apply,
      allowProduction: options.allowProduction,
      confirmDemoClinic: options.confirmDemoClinic,
      clinicExists,
    });
    console.info(`Plan: ${plan.action}`);
    if (plan.action !== "create") {
      console.info(plan.reason);
    }
    if (!options.apply || plan.action !== "create") {
      if (plan.action === "refuse") {
        process.exitCode = 1;
      }
      console.info(options.apply ? "Apply: no writes." : "Dry-run: no writes.");
      return;
    }
    await createPhysioDemoClinicShell(prisma);
    console.info(
      "Apply: created the River Physio Demo clinic shell. No sample was published."
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Physiotherapy demo clinic provisioning failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
