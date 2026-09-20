import "server-only";

import {
  REDACTED_MARKER,
  sanitizeErrorMessage,
  sanitizeErrorTrackingUrl,
  sanitizeSensitiveValue,
} from "@/lib/observability/sensitive-value-sanitizer";

const DIAGNOSTIC_CONTEXTS = new Set([
  "app",
  "os",
  "device",
  "runtime",
  "browser",
  "gpu",
  "culture",
  "cloud_resource",
  "trace",
]);

export type SanitizedErrorEvent = {
  message?: string;
  user?: undefined;
  request?: {
    url?: string;
    method?: string;
  };
  extra?: unknown;
  contexts?: Record<string, unknown>;
  tags?: unknown;
  breadcrumbs?: never[];
  exception?: {
    values?: Array<{
      type?: string;
      value?: string;
      stacktrace?: unknown;
      mechanism?: unknown;
    }>;
  };
  [key: string]: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function sanitizeRequest(request: unknown): SanitizedErrorEvent["request"] {
  const record = asRecord(request);
  if (!record) {
    return undefined;
  }

  const sanitized: NonNullable<SanitizedErrorEvent["request"]> = {};
  const url = sanitizeErrorTrackingUrl(record.url);
  if (url) {
    sanitized.url = url;
  }
  if (typeof record.method === "string" && record.method.trim()) {
    sanitized.method = record.method.trim().toUpperCase();
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function sanitizeException(
  exception: unknown
): SanitizedErrorEvent["exception"] {
  const record = asRecord(exception);
  const values = record?.values;
  if (!Array.isArray(values)) {
    return undefined;
  }

  return {
    values: values.map((entry) => {
      const value = asRecord(entry) ?? {};
      const sanitized: NonNullable<
        NonNullable<SanitizedErrorEvent["exception"]>["values"]
      >[number] = {};

      if (typeof value.type === "string") {
        sanitized.type = value.type;
      }
      if (typeof value.value === "string") {
        sanitized.value = sanitizeErrorMessage(value.value);
      } else if (value.value != null) {
        sanitized.value = REDACTED_MARKER;
      }
      if (value.stacktrace) {
        sanitized.stacktrace = value.stacktrace;
      }
      if (value.mechanism) {
        sanitized.mechanism = value.mechanism;
      }
      return sanitized;
    }),
  };
}

function sanitizeContexts(
  contexts: unknown
): Record<string, unknown> | undefined {
  const record = asRecord(contexts);
  if (!record) {
    return undefined;
  }

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (DIAGNOSTIC_CONTEXTS.has(key)) {
      output[key] = sanitizeSensitiveValue(value, key);
      continue;
    }
    output[key] = sanitizeSensitiveValue(value, key);
  }
  return output;
}

export function sanitizeErrorEvent(
  event: Record<string, unknown>
): SanitizedErrorEvent {
  const sanitized: SanitizedErrorEvent = { ...event };

  delete sanitized.user;
  delete sanitized.modules;
  delete (sanitized as { attachments?: unknown }).attachments;
  delete (sanitized as { debug_meta?: unknown }).debug_meta;

  if (typeof event.message === "string") {
    sanitized.message = sanitizeErrorMessage(event.message);
  }

  sanitized.request = sanitizeRequest(event.request);
  if (!sanitized.request) {
    delete sanitized.request;
  }

  sanitized.exception = sanitizeException(event.exception);
  if (!sanitized.exception) {
    delete sanitized.exception;
  }

  if (event.extra !== undefined) {
    sanitized.extra = sanitizeSensitiveValue(event.extra, "extra");
  }
  if (event.tags !== undefined) {
    sanitized.tags = sanitizeSensitiveValue(event.tags, "tags");
  }
  if (event.contexts !== undefined) {
    sanitized.contexts = sanitizeContexts(event.contexts);
  }

  sanitized.breadcrumbs = [];

  return sanitized;
}
