import "server-only";

const STRIPE_API_ERROR_TYPES = new Set([
  "api_error",
  "authentication_error",
  "card_error",
  "idempotency_error",
  "invalid_grant",
  "invalid_request_error",
  "rate_limit_error",
  "validation_error",
]);

const SECRET_MATERIAL = /(?:sk|rk)_(?:live|test)_|whsec_|Bearer\s+/i;

export type StripeCheckoutFailureClass = "definitive" | "ambiguous";

export type CheckoutFailureLogFields = {
  operation?: string;
  commercialPlan?: string;
  billingInterval?: string;
  stripeErrorType?: string;
  stripeErrorCode?: string;
  stripeRequestId?: string;
  stripeStatusCode?: number;
  stripeParam?: string;
  stripeFailureClass?: StripeCheckoutFailureClass;
  checkoutAttempt?: number;
  errorName?: string;
  errorCode?: string;
};

const DEFINITIVE_REJECTION_TYPES = new Set([
  "invalid_request_error",
  "validation_error",
  "authentication_error",
]);

const DEFINITIVE_REJECTION_STATUSES = new Set([400, 401, 403, 404]);

/**
 * A definitive rejection is a Stripe API response that refused the request
 * before a Checkout Session could exist. Network loss, 5xx, rate limits,
 * card errors, and idempotency conflicts stay ambiguous: the attempt may
 * already have created a Session, so the same key must be reused.
 */
export function classifyStripeCheckoutFailure(
  error: unknown
): StripeCheckoutFailureClass | null {
  const record = stripeErrorRecord(error);
  if (!record) {
    return null;
  }

  const rawType = token(record.rawType, /^[a-z0-9_]+$/);
  const requestId = token(record.requestId, /^req_[A-Za-z0-9]+$/);
  const statusCode =
    typeof record.statusCode === "number" ? record.statusCode : undefined;
  if (
    record.charge ||
    record.payment_intent ||
    rawType === "idempotency_error" ||
    rawType === "api_error" ||
    rawType === "rate_limit_error" ||
    rawType === "card_error"
  ) {
    return "ambiguous";
  }
  if (
    rawType &&
    DEFINITIVE_REJECTION_TYPES.has(rawType) &&
    requestId &&
    statusCode !== undefined &&
    DEFINITIVE_REJECTION_STATUSES.has(statusCode)
  ) {
    return "definitive";
  }
  return "ambiguous";
}

function stripeErrorRecord(error: unknown): Record<string, unknown> | null {
  if (error === null || typeof error !== "object") {
    return null;
  }
  const record = error as Record<string, unknown>;
  const rawType = token(record.rawType, /^[a-z0-9_]+$/);
  const declaredType = token(record.type, /^[A-Za-z0-9_]+$/);
  const name = token(record.name, /^[A-Za-z0-9_]+$/);
  const requestId = token(record.requestId, /^req_[A-Za-z0-9]+$/);
  const stripeClass = Boolean(
    (declaredType && /^Stripe[A-Za-z]+Error$/.test(declaredType)) ||
    (name && /^Stripe[A-Za-z]+Error$/.test(name))
  );
  const knownType = Boolean(
    (rawType && STRIPE_API_ERROR_TYPES.has(rawType)) ||
    (declaredType && STRIPE_API_ERROR_TYPES.has(declaredType))
  );
  if (!knownType && !stripeClass && !requestId) {
    return null;
  }
  return record;
}

function token(value: unknown, pattern: RegExp): string | undefined {
  return typeof value === "string" && pattern.test(value) ? value : undefined;
}

/**
 * Fields safe to print when Checkout fails.
 * Stripe error messages, headers, raw bodies, payment methods, and addresses
 * stay out: they can carry secrets, card data, or billing contact details.
 */
export function checkoutFailureLogFields(input: {
  operation?: string;
  commercialPlan?: string | null;
  billingInterval?: string | null;
  error?: unknown;
  checkoutAttempt?: number;
}): CheckoutFailureLogFields {
  const fields: CheckoutFailureLogFields = {};
  const operation = token(input.operation, /^[a-z0-9_]+$/);
  if (operation) {
    fields.operation = operation;
  }
  if (
    input.commercialPlan === "ESSENTIAL" ||
    input.commercialPlan === "PRACTICE" ||
    input.commercialPlan === "GROUP"
  ) {
    fields.commercialPlan = input.commercialPlan;
  }
  if (
    input.billingInterval === "MONTHLY" ||
    input.billingInterval === "YEARLY"
  ) {
    fields.billingInterval = input.billingInterval;
  }
  if (isCheckoutAttempt(input.checkoutAttempt)) {
    fields.checkoutAttempt = input.checkoutAttempt;
  }

  const record =
    input.error !== null && typeof input.error === "object"
      ? (input.error as Record<string, unknown>)
      : null;
  if (!record) {
    return fields;
  }

  const errorName = token(record.name, /^[A-Za-z0-9_]+$/);
  if (errorName && errorName !== "Error") {
    fields.errorName = errorName;
  }

  const prismaCode = token(record.code, /^P\d{4}$/);
  if (prismaCode) {
    fields.errorCode = prismaCode;
  }

  const rawType = token(record.rawType, /^[a-z0-9_]+$/);
  const declaredType = token(record.type, /^[A-Za-z0-9_]+$/);
  const apiType =
    rawType && STRIPE_API_ERROR_TYPES.has(rawType)
      ? rawType
      : declaredType && STRIPE_API_ERROR_TYPES.has(declaredType)
        ? declaredType
        : undefined;
  const stripeClass =
    declaredType && /^Stripe[A-Za-z]+Error$/.test(declaredType)
      ? declaredType
      : undefined;
  const requestId = token(record.requestId, /^req_[A-Za-z0-9]+$/);
  if (!apiType && !stripeClass && !requestId) {
    return fields;
  }

  if (apiType) {
    fields.stripeErrorType = apiType;
  } else if (stripeClass) {
    fields.stripeErrorType = stripeClass;
  }
  const stripeCode = token(record.code, /^[a-z0-9_]+$/);
  if (stripeCode) {
    fields.stripeErrorCode = stripeCode;
  }
  if (requestId) {
    fields.stripeRequestId = requestId;
  }
  if (
    typeof record.statusCode === "number" &&
    record.statusCode >= 100 &&
    record.statusCode <= 599
  ) {
    fields.stripeStatusCode = record.statusCode;
  }
  const param = token(record.param, /^[A-Za-z0-9_.[\]]+$/);
  if (param && param.length <= 80 && !SECRET_MATERIAL.test(param)) {
    fields.stripeParam = param;
  }
  const failureClass = classifyStripeCheckoutFailure(input.error);
  if (failureClass) {
    fields.stripeFailureClass = failureClass;
  }
  return fields;
}

function isCheckoutAttempt(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 1_000_000
  );
}
