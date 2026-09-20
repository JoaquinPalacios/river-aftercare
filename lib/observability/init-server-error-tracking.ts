import "server-only";

import * as Sentry from "@sentry/nextjs";

import { getServerErrorTrackingConfig } from "@/lib/observability/error-tracking-env";
import { sanitizeErrorEvent } from "@/lib/observability/sanitize-error-event";

const DISABLED_INTEGRATION_NAMES = new Set([
  "Breadcrumbs",
  "CaptureConsole",
  "Prisma",
  "Postgres",
  "Mysql",
  "Mongo",
  "PrismaLoader",
  "LocalVariables",
  "LocalVariablesAsync",
]);

export type ErrorTrackingInitOptions = {
  dsn: string;
  environment: "production" | "verification";
  release?: string;
};

type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;

export function createErrorTrackingInitOptions(
  config: ErrorTrackingInitOptions
) {
  return {
    dsn: config.dsn,
    enabled: true,
    environment: config.environment,
    release: config.release,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    maxBreadcrumbs: 0,
    enableLogs: false,
    includeLocalVariables: false,
    sendClientReports: false,
    attachStacktrace: true,
    skipOpenTelemetrySetup: true,
    beforeSend(event: Record<string, unknown>) {
      try {
        return sanitizeErrorEvent(event);
      } catch {
        return null;
      }
    },
    integrations(integrations: Array<{ name: string }>) {
      return integrations.filter((integration) => {
        return !DISABLED_INTEGRATION_NAMES.has(integration.name);
      });
    },
  };
}

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
