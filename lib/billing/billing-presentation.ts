import "server-only";

import {
  BillingStatus,
  EntitlementStatus,
  type BillingInterval,
  type CommercialPlan,
} from "@prisma/client";

import {
  billingIntervalLabel,
  commercialOfferSummary,
  commercialPlanLabel,
  type SelfServePlanCode,
} from "@/lib/billing/offer-display";

export type BillingAttention = "past_due" | "cancel_scheduled";

export type BillingReturnPresentation =
  | {
      kind: "active";
      productAccess: true;
      assistedSetup: boolean;
      planName: string;
      intervalLabel: string;
      attention: BillingAttention | null;
      attentionMessage: string | null;
    }
  | { kind: "processing"; productAccess: false }
  | { kind: "retry"; productAccess: false; canRestartCheckout: boolean }
  | { kind: "restricted"; productAccess: false }
  | { kind: "inactive"; productAccess: false }
  | { kind: "setup"; productAccess: false }
  | { kind: "support"; productAccess: false };

export function formatBillingDate(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Sydney",
  }).format(date);
}

export function billingPeriodLabel(
  cancelScheduled: boolean
): "Access until" | "Next renewal" {
  return cancelScheduled ? "Access until" : "Next renewal";
}

export function cancellationScheduledMessage(effectiveEnd: Date): string {
  return `Your subscription is scheduled to end on ${formatBillingDate(effectiveEnd)}.`;
}

export const PAST_DUE_BILLING_MESSAGE =
  "There’s a payment issue. Stripe is retrying it, and your clinic can keep using River Aftercare.";

export const RESTRICTED_BILLING_MESSAGE =
  "The latest payment hasn’t gone through. Clinic editing is paused. Published patient guides stay available, and billing on this page stays open.";

export const ENDED_BILLING_MESSAGE =
  "Your subscription has ended. Clinic editing is unavailable.";

export const ACTIVE_SUBSCRIPTION_PLAN_CHANGE_NOTICE =
  "This clinic has an active Stripe subscription. Use the Plan change section below for supported changes.";

export function presentOperatorOfferBlock(input: {
  domainMessage: string;
  planChangeVisible: boolean;
}): string {
  if (input.planChangeVisible) {
    return ACTIVE_SUBSCRIPTION_PLAN_CHANGE_NOTICE;
  }
  return input.domainMessage;
}

export function presentBillingReturn(input: {
  entitlementStatus: EntitlementStatus | null;
  billingStatus: BillingStatus | null;
  commercialPlan: CommercialPlan | null;
  billingInterval: BillingInterval | null;
  checkoutStarted: boolean;
  stripeSubscriptionId: string | null;
  paidThrough?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
}): BillingReturnPresentation {
  const planName = commercialPlanLabel(input.commercialPlan);
  const intervalLabel = billingIntervalLabel(input.billingInterval);

  if (input.entitlementStatus === EntitlementStatus.ACTIVE) {
    const effectiveEnd = input.paidThrough ?? input.currentPeriodEnd ?? null;
    const cancelScheduled =
      input.cancelAtPeriodEnd === true ||
      input.billingStatus === BillingStatus.CANCEL_AT_PERIOD_END;
    const pastDue = input.billingStatus === BillingStatus.PAST_DUE;
    const attention: BillingAttention | null = pastDue
      ? "past_due"
      : cancelScheduled
        ? "cancel_scheduled"
        : null;
    return {
      kind: "active",
      productAccess: true,
      assistedSetup: input.commercialPlan === "PRACTICE",
      planName,
      intervalLabel,
      attention,
      attentionMessage:
        attention === "past_due"
          ? PAST_DUE_BILLING_MESSAGE
          : attention === "cancel_scheduled" && effectiveEnd
            ? cancellationScheduledMessage(effectiveEnd)
            : attention === "cancel_scheduled"
              ? "Your subscription is scheduled to end at the close of the current paid period."
              : null,
    };
  }

  if (input.entitlementStatus === EntitlementStatus.ENDED) {
    return { kind: "inactive", productAccess: false };
  }

  if (
    input.entitlementStatus === EntitlementStatus.RESTRICTED ||
    input.billingStatus === BillingStatus.UNPAID
  ) {
    return { kind: "restricted", productAccess: false };
  }

  if (input.billingStatus === BillingStatus.PAST_DUE) {
    return {
      kind: "retry",
      productAccess: false,
      canRestartCheckout: !input.stripeSubscriptionId,
    };
  }

  if (
    input.entitlementStatus === EntitlementStatus.PENDING &&
    (input.billingStatus === BillingStatus.PAYMENT_PENDING ||
      input.checkoutStarted)
  ) {
    return { kind: "processing", productAccess: false };
  }

  if (
    input.entitlementStatus === EntitlementStatus.PENDING &&
    input.billingStatus === BillingStatus.OFFER_PREPARED
  ) {
    return { kind: "setup", productAccess: false };
  }

  return { kind: "support", productAccess: false };
}

export function offerSummaryForEntitlement(
  plan: CommercialPlan | null,
  interval: BillingInterval | null
): ReturnType<typeof commercialOfferSummary> | null {
  if ((plan !== "ESSENTIAL" && plan !== "PRACTICE") || !interval) {
    return null;
  }
  return commercialOfferSummary(plan as SelfServePlanCode, interval);
}

export function billingStateLabel(status: BillingStatus | null): string {
  switch (status) {
    case BillingStatus.OFFER_PREPARED:
      return "Ready for payment";
    case BillingStatus.PAYMENT_PENDING:
      return "Payment processing";
    case BillingStatus.ACTIVE:
    case BillingStatus.CANCEL_AT_PERIOD_END:
      return "Active";
    case BillingStatus.PAST_DUE:
      return "Payment issue";
    case BillingStatus.UNPAID:
      return "Unpaid";
    case BillingStatus.ENDED:
      return "Ended";
    default:
      return "Not started";
  }
}

export function entitlementStateLabel(
  status: EntitlementStatus | null
): string {
  switch (status) {
    case EntitlementStatus.PENDING:
      return "Pending";
    case EntitlementStatus.ACTIVE:
      return "Active";
    case EntitlementStatus.RESTRICTED:
      return "Restricted";
    case EntitlementStatus.ENDED:
      return "Ended";
    default:
      return "Not started";
  }
}

export const BILLING_CANCELLED_MESSAGE =
  "Payment setup wasn't completed. Your details have been saved.";

export function billingSetupCancelMessage(
  checkout: string | null | undefined
): string | null {
  return checkout === "cancelled" ? BILLING_CANCELLED_MESSAGE : null;
}
