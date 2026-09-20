#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  PRODUCTION_ENV_FILE_NAME,
  PRODUCTION_MIGRATE_INTENT_ENV,
  assertProductionPrismaArgs,
  evaluateProductionMigrateEnv,
  parseEnvFileContents,
  productionPrismaArgs,
  redactSecrets,
  readPrismaProviderFromLockfile,
} from "../lib/release/production-migrate.mjs";

const ACTIONS = new Set(["status", "migrate", "verify"]);

function printHelp() {
  console.log(`Canonical production Prisma migrate helpers.

These commands require a local gitignored ${PRODUCTION_ENV_FILE_NAME} file.
They never fall back to .env, never print connection strings, never seed,
and never run db push / migrate dev / migrate reset.

Usage:
  pnpm prod:db:status
  pnpm prod:db:verify
  pnpm prod:db:migrate
  pnpm prod:db:migrate --apply

Equivalent manual commands (trusted machine only):

  env -u DATABASE_URL -u DIRECT_URL \\
    DOTENV_CONFIG_PATH=.env.neon-production \\
    pnpm exec prisma migrate status --config prisma.config.ts

  env -u DATABASE_URL -u DIRECT_URL \\
    DOTENV_CONFIG_PATH=.env.neon-production \\
    pnpm exec prisma migrate deploy --config prisma.config.ts
`);
}

function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    return { help: true };
  }

  const action = argv[0];
  if (!ACTIONS.has(action)) {
    throw new Error(
      `Unknown action "${action}". Use status, migrate, or verify.`
    );
  }

  let apply = false;
  let envFile = PRODUCTION_ENV_FILE_NAME;
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      apply = true;
      continue;
    }
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

  if (apply && action !== "migrate") {
    throw new Error("--apply is only valid with migrate.");
  }

  return { help: false, action, apply, envFile };
}

function fail(message) {
  console.error(redactSecrets(message));
  return 1;
}

function loadProductionEnv(envFilePath) {
  const envFileExists = existsSync(envFilePath);
  let parsed = {};
  if (envFileExists) {
    parsed = parseEnvFileContents(readFileSync(envFilePath, "utf8"));
  }

  let prismaProvider = null;
  try {
    prismaProvider = readPrismaProviderFromLockfile(
      readFileSync(resolve("prisma/migrations/migration_lock.toml"), "utf8")
    );
  } catch {
    prismaProvider = null;
  }

  return evaluateProductionMigrateEnv({
    envFilePath,
    envFileExists,
    parsed,
    prismaProvider,
  });
}

function childEnv(absEnvFile, parsed) {
  const env = { ...process.env };
  env.DOTENV_CONFIG_PATH = absEnvFile;
  env[PRODUCTION_MIGRATE_INTENT_ENV] = "1";
  env.DATABASE_URL = parsed.DATABASE_URL.trim();
  env.DIRECT_URL = parsed.DIRECT_URL.trim();
  return env;
}

function runPrisma(args, env) {
  assertProductionPrismaArgs(args);
  const result = spawnSync("pnpm", ["exec", "prisma", ...args], {
    encoding: "utf8",
    env,
  });
  const stdout = redactSecrets(result.stdout ?? "");
  const stderr = redactSecrets(result.stderr ?? "");
  if (stdout.trim()) {
    console.log(stdout.trimEnd());
  }
  if (stderr.trim()) {
    console.error(stderr.trimEnd());
  }
  return result.status === 0 ? 0 : (result.status ?? 1);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }

  const envFilePath = resolve(options.envFile);
  const evaluation = loadProductionEnv(envFilePath);
  for (const warning of evaluation.warnings) {
    console.warn(warning);
  }
  if (!evaluation.ok) {
    for (const error of evaluation.errors) {
      console.error(error);
    }
    return 1;
  }

  const parsed = parseEnvFileContents(readFileSync(envFilePath, "utf8"));
  const prismaAction = options.action === "migrate" ? "deploy" : "status";
  const args = productionPrismaArgs(prismaAction);
  assertProductionPrismaArgs(args);

  if (options.action === "migrate" && !options.apply) {
    console.log(
      [
        "Production migrate deploy is a trusted human release action.",
        "Would run: pnpm exec prisma migrate deploy --config prisma.config.ts",
        `Env file: ${PRODUCTION_ENV_FILE_NAME}`,
        "Datasource: DIRECT_URL (unpooled), selected explicitly from that file.",
        "This helper does not run seed, db push, migrate dev, or migrate reset.",
        "Re-run with --apply to execute.",
      ].join("\n")
    );
    return 0;
  }

  console.log(
    options.action === "migrate"
      ? "Applying production migrations with prisma migrate deploy via DIRECT_URL."
      : "Checking production migration status via DIRECT_URL."
  );

  return runPrisma(args, childEnv(envFilePath, parsed));
}

try {
  process.exit(main());
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.exit(fail(message));
}
