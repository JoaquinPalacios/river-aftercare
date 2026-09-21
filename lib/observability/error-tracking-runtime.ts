type Env = Record<string, string | undefined>;

export const SENTRY_DSN_ENV = "SENTRY_DSN";
export const NEXT_PUBLIC_SENTRY_DSN_ENV = "NEXT_PUBLIC_SENTRY_DSN";

const MAX_DSN_LENGTH = 512;
const GIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

export type ErrorTrackingEnvironment = "production" | "preview";

export type ErrorTrackingConfig =
  | { enabled: false }
  | {
      enabled: true;
      dsn: string;
      environment: ErrorTrackingEnvironment;
      release: string | undefined;
    };

export type ErrorTrackingRuntime = "server" | "client";

export function isTelemetryRuntimeBlocked(env: Env = process.env): boolean {
  if (env.VITEST) {
    return true;
  }
  if (env.NODE_ENV === "test") {
    return true;
  }
  return false;
}

export function readVercelDeployEnvironment(
  env: Env = process.env
): ErrorTrackingEnvironment | null {
  const value = env.VERCEL_ENV ?? env.NEXT_PUBLIC_VERCEL_ENV;
  if (value === "production" || value === "preview") {
    return value;
  }
  return null;
}

export function isValidSentryDsn(value: string): boolean {
  const dsn = value.trim();
  if (!dsn || dsn.length > MAX_DSN_LENGTH || /\s/.test(dsn)) {
    return false;
  }

  try {
    const url = new URL(dsn);
    return (
      url.protocol === "https:" &&
      url.username.length > 0 &&
      url.hostname.length > 0 &&
      url.search.length === 0 &&
      url.hash.length === 0
    );
  } catch {
    return false;
  }
}

function readValidDsn(raw: string | undefined): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const dsn = raw.trim();
  if (!isValidSentryDsn(dsn)) {
    return null;
  }
  return dsn;
}

export function readSentryDsn(
  env: Env = process.env,
  runtime: ErrorTrackingRuntime = "server"
): string | null {
  if (runtime === "client") {
    return readValidDsn(env[NEXT_PUBLIC_SENTRY_DSN_ENV]);
  }

  return (
    readValidDsn(env[SENTRY_DSN_ENV]) ??
    readValidDsn(env[NEXT_PUBLIC_SENTRY_DSN_ENV])
  );
}

export function readErrorTrackingRelease(
  env: Env = process.env
): string | undefined {
  const sha = (
    env.VERCEL_GIT_COMMIT_SHA ?? env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
  )?.trim();
  if (!sha || !GIT_SHA_PATTERN.test(sha)) {
    return undefined;
  }
  return sha;
}

export function getErrorTrackingConfig(
  env: Env = process.env,
  runtime: ErrorTrackingRuntime = "server"
): ErrorTrackingConfig {
  const environment = readVercelDeployEnvironment(env);
  if (!environment) {
    return { enabled: false };
  }

  const dsn = readSentryDsn(env, runtime);
  if (!dsn) {
    return { enabled: false };
  }

  return {
    enabled: true,
    dsn,
    environment,
    release: readErrorTrackingRelease(env),
  };
}

export function isErrorTrackingEnabled(
  env: Env = process.env,
  runtime: ErrorTrackingRuntime = "server"
): boolean {
  return getErrorTrackingConfig(env, runtime).enabled;
}
