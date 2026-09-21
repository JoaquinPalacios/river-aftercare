import * as Sentry from "@sentry/nextjs";

import { initClientErrorTracking } from "@/lib/observability/init-client-error-tracking";

initClientErrorTracking();

// Required by the current SDK for App Router client navigations.
// tracesSampleRate remains 0, so this does not send performance traces.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
