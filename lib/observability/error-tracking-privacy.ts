import { sanitizeErrorEvent } from "./sanitize-error-event.ts";
import { DISABLED_ERROR_TRACKING_INTEGRATIONS } from "./error-tracking-allowlists.ts";

export type ErrorTrackingInitOptions = {
  dsn: string;
  environment: "production" | "preview" | "verification";
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
    ...(config.release ? { release: config.release } : {}),
    tracesSampleRate: 0,
    maxBreadcrumbs: 0,
    enableLogs: false,
    includeLocalVariables: false,
    includeServerName: false,
    sendClientReports: false,
    attachStacktrace: true,
    enableOpenTelemetrySetup: false,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    profilesSampleRate: 0,
    // SDK 11 collects these categories unless they are set. This keeps the
    // previous restrictive floor: no user info, cookies, bodies, query text,
    // or model inputs. Header and query denylist matches the v10 scrub.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
        response: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
      },
      httpBodies: [],
      urlQueryParams: {
        deny: ["forwarded", "-ip", "remote-", "via", "-user"],
      },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
      stackFrameVariables: false,
      frameContextLines: 7,
    },
    beforeSend(event: Record<string, unknown>) {
      try {
        return sanitizeErrorEvent(event);
      } catch {
        return null;
      }
    },
    beforeSendTransaction() {
      return null;
    },
    beforeBreadcrumb() {
      return null;
    },
    integrations(integrations: Array<{ name: string }>) {
      return filterErrorTrackingIntegrations(integrations);
    },
  };
}
