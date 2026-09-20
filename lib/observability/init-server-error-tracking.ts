import "server-only";

import * as Sentry from "@sentry/nextjs";

import { getServerErrorTrackingConfig } from "@/lib/observability/error-tracking-env";
import { createErrorTrackingInitOptions } from "@/lib/observability/error-tracking-privacy";

export { createErrorTrackingInitOptions } from "@/lib/observability/error-tracking-privacy";
export type { ErrorTrackingInitOptions } from "@/lib/observability/error-tracking-privacy";

type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;

export function initServerErrorTracking(
  env: Record<string, string | undefined> = process.env
): void {
  try {
    if (env.VITEST) {
      return;
    }

    const config = getServerErrorTrackingConfig(env);
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
    // Missing DSN, SDK failure, or Better Stack unavailability must not
    // fail Next.js startup or the incoming request.
  }
}
