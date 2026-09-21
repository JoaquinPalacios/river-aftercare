import * as Sentry from "@sentry/nextjs";

import { createErrorTrackingInitOptions } from "@/lib/observability/error-tracking-privacy";
import {
  getErrorTrackingConfig,
  isTelemetryRuntimeBlocked,
} from "@/lib/observability/error-tracking-runtime";

type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;

export function initClientErrorTracking(
  env: Record<string, string | undefined> = process.env
): void {
  try {
    if (isTelemetryRuntimeBlocked(env)) {
      return;
    }

    const config = getErrorTrackingConfig(env, "client");
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
