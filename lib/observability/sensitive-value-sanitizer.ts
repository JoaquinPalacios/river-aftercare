export const REDACTED_MARKER = "[REDACTED]";

const MAX_SANITIZE_DEPTH = 8;
const MAX_SANITIZE_KEYS = 80;
const MAX_ARRAY_ITEMS = 40;

const SENSITIVE_KEYS = new Set(
  [
    "password",
    "passwordhash",
    "currentpassword",
    "newpassword",
    "confirmpassword",
    "token",
    "rawtoken",
    "tokenhash",
    "session",
    "sessiontoken",
    "authorization",
    "cookie",
    "secret",
    "apikey",
    "accesskey",
    "credential",
    "dsn",
    "databaseurl",
    "directurl",
    "accesskeyid",
    "secretaccesskey",
    "turnstilesecret",
    "turnstilesecretkey",
    "email",
    "name",
    "phone",
    "address",
  ].map((key) => key.toLowerCase())
);

const DIAGNOSTIC_NAME_PARENTS = new Set([
  "os",
  "device",
  "runtime",
  "app",
  "browser",
  "gpu",
  "culture",
  "cloud_resource",
]);

const FILENAME_LIKE_KEYS = new Set([
  "filename",
  "pathname",
  "dirname",
  "basename",
  "hostname",
  "typename",
  "classname",
  "modulename",
  "functionname",
  "methodname",
  "sourcename",
  "packagename",
]);

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._\-+=/]+/gi;
const AUTHORIZATION_PATTERN = /Authorization\s*[:=]\s*[^\r\n]+/gi;
const POSTGRES_URL_PATTERN =
  /(?:postgres(?:ql)?|prisma\+postgres):\/\/[^\s"'<>]+/gi;
const URL_WITH_USERINFO_PATTERN =
  /[a-z][a-z0-9+.-]*:\/\/[^/\s"'<>]*:[^/\s"'<>]*@[^\s"'<>]+/gi;
const JWT_PATTERN =
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const TOKEN_QUERY_PATTERN = /([?&#](?:raw)?token=)[A-Za-z0-9._~-]+/gi;
const RESEND_KEY_PATTERN = /\bre_[A-Za-z0-9]{8,}\b/g;

export function normalizeSensitiveKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isSensitiveKey(key: string, parentKey?: string): boolean {
  const normalized = normalizeSensitiveKey(key);
  if (!normalized) {
    return false;
  }

  if (FILENAME_LIKE_KEYS.has(normalized)) {
    return false;
  }

  if (
    normalized === "name" &&
    parentKey &&
    DIAGNOSTIC_NAME_PARENTS.has(parentKey)
  ) {
    return false;
  }

  if (SENSITIVE_KEYS.has(normalized)) {
    return true;
  }

  for (const sensitive of SENSITIVE_KEYS) {
    if (normalized !== sensitive && normalized.endsWith(sensitive)) {
      return true;
    }
  }

  return false;
}

export function sanitizeErrorMessage(value: string): string {
  return value
    .replace(AUTHORIZATION_PATTERN, "Authorization: [REDACTED]")
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(EMAIL_PATTERN, REDACTED_MARKER)
    .replace(POSTGRES_URL_PATTERN, REDACTED_MARKER)
    .replace(URL_WITH_USERINFO_PATTERN, REDACTED_MARKER)
    .replace(JWT_PATTERN, REDACTED_MARKER)
    .replace(TOKEN_QUERY_PATTERN, `$1${REDACTED_MARKER}`)
    .replace(RESEND_KEY_PATTERN, REDACTED_MARKER);
}

export function sanitizeErrorTrackingUrl(url: unknown): string | undefined {
  if (typeof url !== "string") {
    return undefined;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const absolute = trimmed.includes("://");
    const parsed = absolute
      ? new URL(trimmed)
      : new URL(trimmed, "https://river-aftercare.invalid");
    if (absolute) {
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    }
    return parsed.pathname;
  } catch {
    const stripped = trimmed.split(/[?#]/, 1)[0];
    return stripped || undefined;
  }
}

export function sanitizeSensitiveValue(
  value: unknown,
  parentKey?: string,
  depth = 0,
  seen = new WeakSet<object>()
): unknown {
  if (
    value == null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeErrorMessage(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "function" || typeof value === "symbol") {
    return REDACTED_MARKER;
  }

  if (depth >= MAX_SANITIZE_DEPTH) {
    return REDACTED_MARKER;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return REDACTED_MARKER;
    }
    seen.add(value);
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((entry) =>
        sanitizeSensitiveValue(entry, parentKey, depth + 1, seen)
      );
  }

  if (typeof value !== "object") {
    return REDACTED_MARKER;
  }

  if (seen.has(value)) {
    return REDACTED_MARKER;
  }
  seen.add(value);

  const source = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  const keys = Object.keys(source).slice(0, MAX_SANITIZE_KEYS);

  for (const key of keys) {
    if (isSensitiveKey(key, parentKey)) {
      output[key] = REDACTED_MARKER;
      continue;
    }
    output[key] = sanitizeSensitiveValue(source[key], key, depth + 1, seen);
  }

  return output;
}
