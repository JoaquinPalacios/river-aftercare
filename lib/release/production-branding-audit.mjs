import { resolve } from "node:path";

import {
  PRODUCTION_ENV_FILE_NAME,
  connectionHostIsLoopback,
  evaluateProductionMigrateEnv,
  redactSecrets,
} from "./production-migrate.mjs";

export const AUDIT_SKIP_DOTENV_ENV = "RIVER_AFTERCARE_AUDIT_SKIP_DOTENV";
export const AUDIT_TARGET_ENV = "RIVER_AFTERCARE_AUDIT_TARGET";
export const PRODUCTION_AUDIT_TARGET = "production";

export const PRODUCTION_AUDIT_TARGET_LABEL =
  "production database from .env.neon-production via unpooled DIRECT_URL";

/**
 * Same file, name, and loopback checks as prod:db:status / migrate / verify.
 * The audit queries through DIRECT_URL (unpooled), which those commands use.
 * Ambient DATABASE_URL and DIRECT_URL are removed so .env cannot win.
 *
 * @param {{
 *   envFilePath: string,
 *   envFileExists: boolean,
 *   parsed: Record<string, string>,
 *   prismaProvider?: string | null,
 *   ambientEnv?: Record<string, string | undefined>,
 * }} input
 * @returns {{
 *   ok: boolean,
 *   errors: string[],
 *   warnings: string[],
 *   banner: string,
 *   childEnv: Record<string, string | undefined> | null,
 *   generateEnv: Record<string, string | undefined> | null,
 * }}
 */
export function buildProductionBrandingAuditPlan(input) {
  const evaluation = evaluateProductionMigrateEnv({
    envFilePath: input.envFilePath,
    envFileExists: input.envFileExists,
    parsed: input.parsed,
    prismaProvider: input.prismaProvider,
  });
  if (!evaluation.ok) {
    return {
      ok: false,
      errors: evaluation.errors,
      warnings: evaluation.warnings,
      banner: "",
      childEnv: null,
      generateEnv: null,
    };
  }

  const directUrl = input.parsed.DIRECT_URL.trim();
  const ambient = input.ambientEnv ?? {};
  /** @type {Record<string, string | undefined>} */
  const childEnv = { ...ambient };
  delete childEnv.DATABASE_URL;
  delete childEnv.DIRECT_URL;
  delete childEnv.DOTENV_CONFIG_PATH;
  childEnv[AUDIT_SKIP_DOTENV_ENV] = "1";
  childEnv[AUDIT_TARGET_ENV] = PRODUCTION_AUDIT_TARGET;
  childEnv.DATABASE_URL = directUrl;
  childEnv.DIRECT_URL = directUrl;

  /** @type {Record<string, string | undefined>} */
  const generateEnv = { ...ambient };
  delete generateEnv.DATABASE_URL;
  delete generateEnv.DIRECT_URL;
  delete generateEnv.DOTENV_CONFIG_PATH;

  return {
    ok: true,
    errors: [],
    warnings: evaluation.warnings,
    banner:
      "Auditing the production database from .env.neon-production (read-only, unpooled DIRECT_URL).",
    childEnv,
    generateEnv,
  };
}

export function localAuditTargetLabel(connectionString) {
  if (connectionHostIsLoopback(connectionString)) {
    return "configured DATABASE_URL (local development). Not the production audit.";
  }
  return "configured DATABASE_URL (non-local host). Not pnpm prod:audit:account-split-branding.";
}

export function productionAuditEnvFilePath(envFile = PRODUCTION_ENV_FILE_NAME) {
  return resolve(envFile);
}

export function redactAuditOutput(text) {
  return redactSecrets(text);
}
