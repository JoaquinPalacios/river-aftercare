import "server-only";

/**
 * Stable operational names for a malformed Group Stripe subscription.
 * The webhook does not emit these yet. A later projector keeps the
 * last-known-good entitlement, fails the event, and reports this code.
 */
export const GROUP_SUBSCRIPTION_SHAPE_FAILURE_CODE =
  "group_subscription_shape_invalid" as const;

export const GROUP_SUBSCRIPTION_SHAPE_LOG_EVENT =
  "stripe_webhook_group_subscription_shape_invalid" as const;
