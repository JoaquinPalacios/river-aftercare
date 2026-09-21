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

export type BillingReturnPresentation =
  | {
      kind: "active";
      productAccess: true;
      assistedSetup: boolean;
      planName: string;
      intervalLabel: string;
    }
  | { kind: "processing"; productAccess: false }
  | { kind: "retry"; productAccess: false; canRestartCheckout: boolean }
  | { kind: "inactive"; productAccess: false }
  | { kind: "setup"; productAccess: false }
  | { kind: "support"; productAccess: false };

export function presentBillingReturn(input: {
  entitlementStatus: EntitlementStatus | null;
  billingStatus: BillingStatus | null;
  commercialPlan: CommercialPlan | null;
  billingInterval: BillingInterval | null;
  checkoutStarted: boolean;
  stripeSubscriptionId: string | null;
}): BillingReturnPresentation {
  const planName = commercialPlanLabel(input.commercialPlan);
  const intervalLabel = billingIntervalLabel(input.billingInterval);

  if (input.entitlementStatus === EntitlementStatus.ACTIVE) {
    return {
      kind: "active",
      productAccess: true,
      assistedSetup: input.commercialPlan === "PRACTICE",
      planName,
      intervalLabel,
    };
  }

  if (input.entitlementStatus === EntitlementStatus.ENDED) {
    return { kind: "inactive", productAccess: false };
  }

  if (
    input.billingStatus === BillingStatus.PAST_DUE ||
    input.billingStatus === BillingStatus.UNPAID ||
    input.entitlementStatus === EntitlementStatus.RESTRICTED
  ) {
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
