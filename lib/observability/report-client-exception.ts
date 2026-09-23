import * as Sentry from "@sentry/nextjs";

import {
  getErrorTrackingConfig,
  readClientErrorTrackingEnv,
} from "@/lib/observability/error-tracking-runtime";

export function reportClientException(error: unknown): void {
  try {
    if (
      !getErrorTrackingConfig(readClientErrorTrackingEnv(), "client").enabled
    ) {
      return;
    }

    Sentry.captureException(error);
  } catch {
    // Telemetry must never change application control flow or error UI.
  }
}
