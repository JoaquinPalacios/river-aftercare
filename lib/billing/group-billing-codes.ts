import "server-only";

/**
 * Stable operational names for a malformed Group Stripe subscription.
 * The webhook keeps the last-known-good entitlement, fails the event, and
 * reports this code. It does not write purchased N.
 */
export const GROUP_SUBSCRIPTION_SHAPE_FAILURE_CODE =
  "group_subscription_shape_invalid" as const;

export const GROUP_SUBSCRIPTION_SHAPE_LOG_EVENT =
  "stripe_webhook_group_subscription_shape_invalid" as const;

/**
 * An established Group row still has a null purchased quantity.
 * Ordinary webhook projection leaves it null. This is informational and
 * must not be reported to Sentry.
 */
export const GROUP_SITE_QUANTITY_LEGACY_PRESERVED_LOG_EVENT =
  "group_site_quantity_legacy_preserved" as const;

export const PRACTICE_SUBSCRIPTION_SHAPE_FAILURE_CODE =
  "practice_subscription_shape_invalid" as const;

export const PRACTICE_SUBSCRIPTION_SHAPE_LOG_EVENT =
  "stripe_webhook_practice_subscription_shape_invalid" as const;

/**
 * An established Practice row still has a null purchased quantity.
 * Ordinary webhook projection leaves it null. This is informational and
 * must not be reported to Sentry.
 */
export const PRACTICE_LOCATION_QUANTITY_LEGACY_PRESERVED_LOG_EVENT =
  "practice_location_quantity_legacy_preserved" as const;
