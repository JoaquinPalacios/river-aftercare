import "server-only";

import { isVercelProduction } from "@/lib/runtime/vercel-production";

export const BETTER_STACK_ERROR_DSN_ENV = "BETTER_STACK_ERROR_DSN";

type Env = Record<string, string | undefined>;

const MAX_DSN_LENGTH = 512;
const GIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

export type ServerErrorTrackingConfig =
  | { enabled: false }
  | {
      enabled: true;
      dsn: string;
      environment: "production";
      release: string | undefined;
    };

export function isValidBetterStackErrorDsn(value: string): boolean {
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

export function readBetterStackErrorDsn(env: Env = process.env): string | null {
  const raw = env[BETTER_STACK_ERROR_DSN_ENV];
  if (typeof raw !== "string") {
    return null;
  }

  const dsn = raw.trim();
  if (!isValidBetterStackErrorDsn(dsn)) {
    return null;
  }

  return dsn;
}

export function readErrorTrackingRelease(
  env: Env = process.env
): string | undefined {
  const sha = env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (!sha || !GIT_SHA_PATTERN.test(sha)) {
    return undefined;
  }
  return sha;
}

export function isServerErrorTrackingEnabled(env: Env = process.env): boolean {
  return getServerErrorTrackingConfig(env).enabled;
}

export function getServerErrorTrackingConfig(
  env: Env = process.env
): ServerErrorTrackingConfig {
  if (!isVercelProduction(env)) {
    return { enabled: false };
  }

  const dsn = readBetterStackErrorDsn(env);
  if (!dsn) {
    return { enabled: false };
  }

  return {
    enabled: true,
    dsn,
    environment: "production",
    release: readErrorTrackingRelease(env),
  };
}
