#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import { redactSecrets } from "../lib/release/production-migrate.mjs";
import {
  interpretMigrateStatusOutput,
  shouldRunVercelProductionSchemaGate,
} from "../lib/release/vercel-schema-gate.mjs";

function fail(message) {
  console.error(redactSecrets(message));
  process.exit(1);
}

function main() {
  const decision = shouldRunVercelProductionSchemaGate(process.env);
  if (decision.reason === "not-production") {
    return;
  }
  if (decision.reason === "skipped") {
    console.warn(
      "SKIP_PRODUCTION_SCHEMA_GATE=1: skipping the Vercel production pending-migration check. Do not use this to deploy code that requires unapplied Prisma migrations."
    );
    return;
  }

  if (!process.env.DATABASE_URL?.trim() && !process.env.DIRECT_URL?.trim()) {
    fail(
      "Vercel production schema gate: DATABASE_URL and DIRECT_URL are both missing. Refusing to build application code that cannot prove the production schema is current."
    );
  }

  const args = ["migrate", "status", "--config", "prisma.config.ts"];
  const result = spawnSync("pnpm", ["exec", "prisma", ...args], {
    encoding: "utf8",
    env: process.env,
  });
  const output = redactSecrets(
    `${result.stdout ?? ""}\n${result.stderr ?? ""}`
  );
  if (output.trim()) {
    console.log(output.trimEnd());
  }

  if (result.status !== 0) {
    fail(
      "Vercel production schema gate: prisma migrate status failed. This build does not run migrate deploy. Fix connectivity or apply migrations from a trusted machine, then redeploy."
    );
  }

  const state = interpretMigrateStatusOutput(output);
  if (state === "pending") {
    fail(
      "Vercel production schema gate: production still has pending Prisma migrations. Apply them with pnpm prod:db:migrate --apply from a trusted machine using .env.neon-production, verify with pnpm prod:db:verify, then redeploy this git SHA. This build does not run migrate deploy, seed, or db push."
    );
  }
  if (state !== "up-to-date") {
    fail(
      "Vercel production schema gate: could not recognize prisma migrate status output. Refusing to deploy. This build does not run migrate deploy."
    );
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  fail(message);
}
