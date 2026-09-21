import "server-only";

import * as Sentry from "@sentry/nextjs";

import { isServerErrorTrackingEnabled } from "@/lib/observability/error-tracking-env";
import { sanitizeErrorTrackingUrl } from "@/lib/observability/sensitive-value-sanitizer";

type RequestErrorRequest = {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
};

type RequestErrorContext = {
  routerKind: string;
  routePath: string;
  routeType: string;
};

export async function captureServerRequestError(
  error: unknown,
  request: RequestErrorRequest,
  context: RequestErrorContext
): Promise<void> {
  try {
    if (!isServerErrorTrackingEnabled()) {
      return;
    }

    const safePath = sanitizeErrorTrackingUrl(request.path) ?? "/";
    Sentry.captureRequestError(
      error,
      {
        path: safePath,
        method: request.method,
        headers: {},
      },
      {
        routerKind: context.routerKind,
        routePath: context.routePath,
        routeType: context.routeType,
      }
    );
  } catch {
    // Sentry must never fail the Next.js request.
  }
}
