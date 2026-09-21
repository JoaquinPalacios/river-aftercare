import {
  ALLOWED_ERROR_CONTEXTS,
  ALLOWED_ERROR_TAG_KEYS,
} from "./error-tracking-allowlists.ts";
import {
  REDACTED_MARKER,
  sanitizeErrorMessage,
  sanitizeErrorTrackingUrl,
  sanitizeSensitiveValue,
} from "./sensitive-value-sanitizer.ts";

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

function sanitizeRuntimeContext(
  value: unknown
): Record<string, unknown> | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const runtime: Record<string, unknown> = {};
  if (typeof record.name === "string" && record.name.trim()) {
    runtime.name = record.name.trim();
  }
  if (typeof record.version === "string" && record.version.trim()) {
    runtime.version = record.version.trim();
  }

  return Object.keys(runtime).length > 0 ? runtime : undefined;
}

function sanitizeContexts(
  contexts: unknown
): Record<string, unknown> | undefined {
  const record = asRecord(contexts);
  if (!record) {
    return undefined;
  }

  const output: Record<string, unknown> = {};
  for (const key of ALLOWED_ERROR_CONTEXTS) {
    if (key === "runtime" && record.runtime !== undefined) {
      const runtime = sanitizeRuntimeContext(record.runtime);
      if (runtime) {
        output.runtime = runtime;
      }
    }
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

function sanitizeTags(tags: unknown): Record<string, string> | undefined {
  const record = asRecord(tags);
  if (!record) {
    return undefined;
  }

  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (
      !ALLOWED_ERROR_TAG_KEYS.has(key) ||
      typeof value !== "string" ||
      !value
    ) {
      continue;
    }
    const sanitized = sanitizeSensitiveValue(value, key);
    if (typeof sanitized === "string" && sanitized.length > 0) {
      output[key] = sanitized;
    }
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

function stripLocalVariablesFromException(
  exception: SanitizedErrorEvent["exception"]
): SanitizedErrorEvent["exception"] {
  if (!exception?.values) {
    return exception;
  }

  return {
    values: exception.values.map((entry) => {
      const stacktrace = asRecord(entry.stacktrace);
      const frames = stacktrace?.frames;
      if (!Array.isArray(frames)) {
        return entry;
      }

      return {
        ...entry,
        stacktrace: {
          ...stacktrace,
          frames: frames.map((frame) => {
            const record = asRecord(frame) ?? {};
            delete record.vars;
            return record;
          }),
        },
      };
    }),
  };
}

export function sanitizeErrorEvent(
  event: Record<string, unknown>
): SanitizedErrorEvent {
  const sanitized: SanitizedErrorEvent = { ...event };

  delete sanitized.user;
  delete sanitized.modules;
  delete sanitized.extra;
  delete (sanitized as { server_name?: unknown }).server_name;
  delete (sanitized as { attachments?: unknown }).attachments;
  delete (sanitized as { debug_meta?: unknown }).debug_meta;
  delete (sanitized as { breadcrumbs?: unknown }).breadcrumbs;

  const sdk = asRecord(event.sdk);
  if (sdk) {
    const nextSdk: Record<string, unknown> = {};
    if (typeof sdk.name === "string") {
      nextSdk.name = sdk.name;
    }
    if (typeof sdk.version === "string") {
      nextSdk.version = sdk.version;
    }
    if (Object.keys(nextSdk).length > 0) {
      sanitized.sdk = nextSdk;
    } else {
      delete sanitized.sdk;
    }
  }

  if (typeof event.message === "string") {
    sanitized.message = sanitizeErrorMessage(event.message);
  }

  if (typeof event.transaction === "string") {
    sanitized.transaction =
      sanitizeErrorTrackingUrl(event.transaction) ??
      sanitizeErrorMessage(event.transaction);
  }

  sanitized.request = sanitizeRequest(event.request);
  if (!sanitized.request) {
    delete sanitized.request;
  }

  sanitized.exception = stripLocalVariablesFromException(
    sanitizeException(event.exception)
  );
  if (!sanitized.exception) {
    delete sanitized.exception;
  }

  const tags = sanitizeTags(event.tags);
  if (tags) {
    sanitized.tags = tags;
  } else {
    delete sanitized.tags;
  }

  const contexts = sanitizeContexts(event.contexts);
  if (contexts) {
    sanitized.contexts = contexts;
  } else {
    delete sanitized.contexts;
  }

  return sanitized;
}
