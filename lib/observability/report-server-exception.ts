import "server-only";

import * as Sentry from "@sentry/nextjs";

import { isServerErrorTrackingEnabled } from "@/lib/observability/error-tracking-env";
import { sanitizeSensitiveValue } from "@/lib/observability/sensitive-value-sanitizer";

export const OPERATIONAL_FAILURE_CODES = {
  CONTACT_EMAIL_DELIVERY_FAILED: "contact_email_delivery_failed",
  AUTH_EMAIL_DELIVERY_FAILED: "auth_email_delivery_failed",
  AUTH_EMAIL_NOT_CONFIGURED: "auth_email_not_configured",
} as const;

export type OperationalFailureCode =
  (typeof OPERATIONAL_FAILURE_CODES)[keyof typeof OPERATIONAL_FAILURE_CODES];

export type OperationalFailureComponent = "contact-email" | "auth-email";

export type OperationalFailureCodeValue =
  "not_configured" | "delivery_failed" | "invalid_message";

const ALLOWED_TAG_KEYS = new Set(["component", "failure_code", "environment"]);

export type ServerExceptionTags = Partial<{
  component: OperationalFailureComponent | string;
  failure_code: string;
  environment: string;
}>;

function allowlistedTags(
  tags: Record<string, unknown> | undefined
): Record<string, string> | undefined {
  if (!tags) {
    return undefined;
  }

  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (!ALLOWED_TAG_KEYS.has(key) || typeof value !== "string" || !value) {
      continue;
    }
    const sanitized = sanitizeSensitiveValue(value, key);
    if (typeof sanitized === "string" && sanitized.length > 0) {
      output[key] = sanitized;
    }
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

export function reportServerException(
  error: unknown,
  options?: { tags?: ServerExceptionTags }
): void {
  try {
    if (!isServerErrorTrackingEnabled()) {
      return;
    }

    Sentry.captureException(error, {
      tags: allowlistedTags(options?.tags),
    });
  } catch {
    // Telemetry must never change application control flow.
  }
}

export function reportOperationalFailure(
  code: OperationalFailureCode,
  tags: {
    component: OperationalFailureComponent;
    failure_code: OperationalFailureCodeValue;
  }
): void {
  try {
    if (!isServerErrorTrackingEnabled()) {
      return;
    }

    Sentry.captureEvent({
      message: code,
      level: "error",
      fingerprint: [code],
      tags: allowlistedTags({
        component: tags.component,
        failure_code: tags.failure_code,
        environment: "production",
      }),
    });
  } catch {
    // Telemetry must never change application control flow.
  }
}

export function reportAuthEmailFailure(
  reason: OperationalFailureCodeValue
): void {
  reportOperationalFailure(
    reason === "not_configured"
      ? OPERATIONAL_FAILURE_CODES.AUTH_EMAIL_NOT_CONFIGURED
      : OPERATIONAL_FAILURE_CODES.AUTH_EMAIL_DELIVERY_FAILED,
    {
      component: "auth-email",
      failure_code: reason,
    }
  );
}

export function reportContactEmailFailure(
  reason: OperationalFailureCodeValue
): void {
  reportOperationalFailure(
    OPERATIONAL_FAILURE_CODES.CONTACT_EMAIL_DELIVERY_FAILED,
    {
      component: "contact-email",
      failure_code: reason,
    }
  );
}
