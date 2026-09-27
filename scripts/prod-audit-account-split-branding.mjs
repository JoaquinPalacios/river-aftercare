#!/usr/bin/env node
/**
 * Read-only production branding audit.
 *
 * Loads gitignored .env.neon-production with the same checks as
 * pnpm prod:db:status / prod:db:migrate / prod:db:verify.
 * Queries through unpooled DIRECT_URL. Does not migrate.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  PRODUCTION_ENV_FILE_NAME,
  parseEnvFileContents,
  readPrismaProviderFromLockfile,
} from "../lib/release/production-migrate.mjs";
import {
  buildProductionBrandingAuditPlan,
  productionAuditEnvFilePath,
  redactAuditOutput,
} from "../lib/release/production-branding-audit.mjs";

function printHelp() {
  console.log(`Read-only production branding ownership audit.

Uses gitignored ${PRODUCTION_ENV_FILE_NAME}, the same file as pnpm prod:db:status,
pnpm prod:db:migrate, and pnpm prod:db:verify. Never falls back to .env.
Queries the unpooled DIRECT_URL. Does not migrate, write, or call Stripe.

Usage:
  pnpm prod:audit:account-split-branding

Run from the repository root on a trusted machine.
`);
}

function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { help: true };
  }
  let envFile = PRODUCTION_ENV_FILE_NAME;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--env-file") {
      envFile = argv[index + 1];
      index += 1;
      if (!envFile) {
        throw new Error("--env-file requires a path.");
      }
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { help: false, envFile };
}

function prismaProvider() {
  try {
    return readPrismaProviderFromLockfile(
      readFileSync(resolve("prisma/migrations/migration_lock.toml"), "utf8")
    );
  } catch {
    return null;
  }
}

function runGenerate(env) {
  const result = spawnSync(
    "pnpm",
    ["exec", "prisma", "generate", "--config", "prisma.config.ts"],
    { encoding: "utf8", env }
  );
  const output = redactAuditOutput(
    `${result.stdout ?? ""}\n${result.stderr ?? ""}`
  );
  if (result.status !== 0) {
    if (output.trim()) {
      console.error(output.trimEnd());
    }
    throw new Error(
      "prisma generate failed. The audit did not query the database."
    );
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }

  const envFilePath = productionAuditEnvFilePath(options.envFile);
  const envFileExists = existsSync(envFilePath);
  const parsed = envFileExists
    ? parseEnvFileContents(readFileSync(envFilePath, "utf8"))
    : {};
  const plan = buildProductionBrandingAuditPlan({
    envFilePath,
    envFileExists,
    parsed,
    prismaProvider: prismaProvider(),
    ambientEnv: process.env,
  });
  for (const warning of plan.warnings) {
    console.warn(redactAuditOutput(warning));
  }
  if (!plan.ok || !plan.childEnv || !plan.generateEnv) {
    for (const error of plan.errors) {
      console.error(redactAuditOutput(error));
    }
    console.error("Audit failed. Affected count was not established.");
    return 1;
  }

  console.log(plan.banner);
  runGenerate(plan.generateEnv);

  const auditScript = resolve(
    "scripts/audit-account-split-branding-ownership.mjs"
  );
  const result = spawnSync(process.execPath, [auditScript], {
    encoding: "utf8",
    env: plan.childEnv,
  });
  const stdout = redactAuditOutput(result.stdout ?? "");
  const stderr = redactAuditOutput(result.stderr ?? "");
  if (stdout.trim()) {
    process.stdout.write(stdout.endsWith("\n") ? stdout : `${stdout}\n`);
  }
  if (stderr.trim()) {
    console.error(stderr.trimEnd());
  }
  if (result.status !== 0) {
    return result.status ?? 1;
  }
  return 0;
}

try {
  process.exit(main());
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(redactAuditOutput(message));
  console.error("Audit failed. Affected count was not established.");
  process.exit(1);
}
