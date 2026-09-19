import { basename } from "node:path";

export const PRODUCTION_ENV_FILE_NAME = ".env.neon-production";
export const PRODUCTION_MIGRATE_INTENT_ENV =
  "RIVER_AFTERCARE_PRODUCTION_MIGRATE";

const FORBIDDEN_PRISMA_TOKENS = new Set([
  "seed",
  "push",
  "pull",
  "reset",
  "dev",
  "execute",
  "studio",
]);

/**
 * @param {string} contents
 * @returns {Record<string, string>}
 */
export function parseEnvFileContents(contents) {
  /** @type {Record<string, string>} */
  const parsed = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const line = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

/**
 * @param {string} filePath
 * @returns {boolean}
 */
export function productionEnvFileNameIsAllowed(filePath) {
  return basename(filePath) === PRODUCTION_ENV_FILE_NAME;
}

/**
 * @param {string} connectionString
 * @returns {boolean}
 */
export function connectionHostIsLoopback(connectionString) {
  const host = hostnameFromConnectionString(connectionString);
  if (!host) {
    return /localhost|127\.0\.0\.1|\[::1\]/i.test(connectionString);
  }
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "0.0.0.0" ||
    normalized.endsWith(".localhost")
  );
}

/**
 * @param {string} connectionString
 * @returns {string | null}
 */
function hostnameFromConnectionString(connectionString) {
  try {
    return new URL(connectionString).hostname || null;
  } catch {
    return null;
  }
}

/**
 * @param {string} text
 * @returns {string}
 */
export function redactSecrets(text) {
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s'"\\]+/gi, "[redacted-database-url]")
    .replace(
      /\b(?:DATABASE_URL|DIRECT_URL|PASSWORD|SECRET|TOKEN|API_KEY)\s*=\s*[^\s]+/gi,
      (match) => `${match.split("=")[0]}=[redacted]`
    );
}

/**
 * @param {string} lockfileContents
 * @returns {string | null}
 */
export function readPrismaProviderFromLockfile(lockfileContents) {
  const match = lockfileContents.match(/^\s*provider\s*=\s*"([^"]+)"/m);
  return match?.[1] ?? null;
}

/**
 * @param {{
 *   envFilePath: string,
 *   envFileExists: boolean,
 *   parsed: Record<string, string>,
 *   prismaProvider?: string | null,
 * }} input
 */
export function evaluateProductionMigrateEnv(input) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];

  if (!productionEnvFileNameIsAllowed(input.envFilePath)) {
    errors.push(
      "Refusing to run: production helpers only accept a file named .env.neon-production. Local .env is never used."
    );
  }

  if (!input.envFileExists) {
    errors.push(
      "Refusing to run: .env.neon-production is not present. This helper will not fall back to .env, Preview, or ambient DATABASE_URL."
    );
  }

  const databaseUrl = input.parsed.DATABASE_URL?.trim() ?? "";
  const directUrl = input.parsed.DIRECT_URL?.trim() ?? "";
  const hasDatabaseUrl = databaseUrl.length > 0;
  const hasDirectUrl = directUrl.length > 0;

  if (input.envFileExists && !hasDirectUrl) {
    errors.push(
      "Refusing to run: DIRECT_URL is missing from .env.neon-production. Production migrate deploy must use the unpooled connection."
    );
  }

  if (input.envFileExists && !hasDatabaseUrl) {
    errors.push(
      "Refusing to run: DATABASE_URL is missing from .env.neon-production."
    );
  }

  if (hasDirectUrl && connectionHostIsLoopback(directUrl)) {
    errors.push(
      "Refusing to run: DIRECT_URL points at a loopback host, which is not production."
    );
  }

  if (hasDatabaseUrl && connectionHostIsLoopback(databaseUrl)) {
    errors.push(
      "Refusing to run: DATABASE_URL points at a loopback host, which is not production."
    );
  }

  if (input.prismaProvider && input.prismaProvider !== "postgresql") {
    errors.push("Refusing to run: Prisma provider must be postgresql.");
  }

  if (hasDirectUrl) {
    const host = hostnameFromConnectionString(directUrl);
    if (
      host &&
      !/neon\.tech$/i.test(host) &&
      !host.toLowerCase().includes("neon")
    ) {
      warnings.push(
        "DIRECT_URL host is not a neon.tech hostname. Filename intent still applies; confirm this is the intended production database before --apply."
      );
    }
  }

  const uniqueErrors = [...new Set(errors)];
  return {
    ok: uniqueErrors.length === 0,
    errors: uniqueErrors,
    warnings,
    hasDatabaseUrl,
    hasDirectUrl,
  };
}

/**
 * @param {"status" | "deploy" | "verify"} action
 * @returns {string[]}
 */
export function productionPrismaArgs(action) {
  if (action === "status" || action === "verify") {
    return ["migrate", "status", "--config", "prisma.config.ts"];
  }
  if (action === "deploy") {
    return ["migrate", "deploy", "--config", "prisma.config.ts"];
  }
  throw new Error("Unsupported production Prisma action.");
}

/**
 * @param {readonly string[]} args
 * @returns {boolean}
 */
export function isForbiddenProductionPrismaInvocation(args) {
  const lowered = args.map((arg) => arg.toLowerCase());
  if (lowered.includes("seed")) {
    return true;
  }
  if (lowered.includes("push") || lowered.includes("pull")) {
    return true;
  }
  if (lowered.includes("studio") || lowered.includes("execute")) {
    return true;
  }
  const joined = lowered.join(" ");
  if (joined.includes("migrate reset") || joined.includes("migrate dev")) {
    return true;
  }
  if (joined.includes("db push") || joined.includes("db seed")) {
    return true;
  }
  return lowered.some(
    (arg) => FORBIDDEN_PRISMA_TOKENS.has(arg) && arg !== "status"
  );
}

/**
 * @param {readonly string[]} args
 */
export function assertProductionPrismaArgs(args) {
  if (isForbiddenProductionPrismaInvocation(args)) {
    throw new Error(
      "Production helper refuses seed, db push, db pull, migrate reset, migrate dev, db execute, and studio."
    );
  }
  const allowedStatus =
    args[0] === "migrate" &&
    args[1] === "status" &&
    args.includes("--config") &&
    args.includes("prisma.config.ts");
  const allowedDeploy =
    args[0] === "migrate" &&
    args[1] === "deploy" &&
    args.includes("--config") &&
    args.includes("prisma.config.ts");
  if (!allowedStatus && !allowedDeploy) {
    throw new Error(
      "Production helper only runs prisma migrate status or prisma migrate deploy --config prisma.config.ts."
    );
  }
}
