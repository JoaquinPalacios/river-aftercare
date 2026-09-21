import "server-only";

import {
  getErrorTrackingConfig,
  isErrorTrackingEnabled,
  type ErrorTrackingConfig,
} from "@/lib/observability/error-tracking-runtime";

export {
  NEXT_PUBLIC_SENTRY_DSN_ENV,
  SENTRY_DSN_ENV,
  getErrorTrackingConfig,
  isErrorTrackingEnabled,
  isValidSentryDsn,
  readErrorTrackingRelease,
  readSentryDsn,
  readVercelDeployEnvironment,
} from "@/lib/observability/error-tracking-runtime";

export type {
  ErrorTrackingConfig,
  ErrorTrackingEnvironment,
  ErrorTrackingRuntime,
} from "@/lib/observability/error-tracking-runtime";

export type ServerErrorTrackingConfig = ErrorTrackingConfig;

export function getServerErrorTrackingConfig(
  env: Record<string, string | undefined> = process.env
): ServerErrorTrackingConfig {
  return getErrorTrackingConfig(env, "server");
}

export function isServerErrorTrackingEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return isErrorTrackingEnabled(env, "server");
}
