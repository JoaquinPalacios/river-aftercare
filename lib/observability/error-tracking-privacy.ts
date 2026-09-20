import { sanitizeErrorEvent } from "./sanitize-error-event.ts";
import { DISABLED_ERROR_TRACKING_INTEGRATIONS } from "./error-tracking-allowlists.ts";

export type ErrorTrackingInitOptions = {
  dsn: string;
  environment: "production" | "verification";
  release?: string;
};

export {
  ALLOWED_ERROR_CONTEXTS,
  ALLOWED_ERROR_TAG_KEYS,
  DISABLED_ERROR_TRACKING_INTEGRATIONS,
} from "./error-tracking-allowlists.ts";

export function filterErrorTrackingIntegrations<T extends { name: string }>(
  integrations: T[]
): T[] {
  return integrations.filter((integration) => {
    return !DISABLED_ERROR_TRACKING_INTEGRATIONS.has(integration.name);
  });
}

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
    includeServerName: false,
    sendClientReports: false,
    attachStacktrace: true,
    skipOpenTelemetrySetup: true,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      stackFrameVariables: false,
    },
    beforeSend(event: Record<string, unknown>) {
      try {
        return sanitizeErrorEvent(event);
      } catch {
        return null;
      }
    },
    integrations(integrations: Array<{ name: string }>) {
      return filterErrorTrackingIntegrations(integrations);
    },
  };
}
