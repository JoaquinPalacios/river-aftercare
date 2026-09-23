import * as Sentry from "@sentry/nextjs";

import { createErrorTrackingInitOptions } from "@/lib/observability/error-tracking-privacy";
import {
  getErrorTrackingConfig,
  isTelemetryRuntimeBlocked,
  readClientErrorTrackingEnv,
} from "@/lib/observability/error-tracking-runtime";

type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;

export function initClientErrorTracking(
  env?: Record<string, string | undefined>
): void {
  const resolvedEnv = env ?? readClientErrorTrackingEnv();

  try {
    if (isTelemetryRuntimeBlocked(resolvedEnv)) {
      return;
    }

    const config = getErrorTrackingConfig(resolvedEnv, "client");
    if (!config.enabled) {
      return;
    }

    Sentry.init(
      createErrorTrackingInitOptions({
        dsn: config.dsn,
        environment: config.environment,
        release: config.release,
      }) as unknown as SentryInitOptions
    );
  } catch {
    // Missing DSN, SDK failure, or Sentry unavailability must not
    // fail browser startup or hide the application UI.
  }
}
