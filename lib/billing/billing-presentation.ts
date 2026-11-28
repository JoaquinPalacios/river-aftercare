import "server-only";

import {
  BillingStatus,
  EntitlementStatus,
  type BillingInterval,
  type CommercialPlan,
} from "@prisma/client";

import { isOfferedAdditionalSiteQuantity } from "@/lib/clinics/group-commercial";
import {
  billingIntervalLabel,
  commercialOfferSummary,
  commercialPlanLabel,
  groupCommercialOfferSummary,
  type SelfServePlanCode,
} from "@/lib/billing/offer-display";

export type BillingAttention = "past_due" | "cancel_scheduled";

export type BillingTrialPhase =
  "in_trial" | "awaiting_first_charge" | "first_payment_failed";

export type BillingTrialPresentation = {
  phase: BillingTrialPhase;
  endsAt: Date;
  message: string | null;
};

/**
 * How a still-pending Checkout should be described.
 * A stored Session id is not evidence that payment details were submitted.
 */
export type CheckoutFollowUpPhase =
  "complete_payment" | "confirmation_pending" | "async_processing";

export type CheckoutSessionEvidence = {
  status: "open" | "complete" | "expired";
  paymentStatus: "paid" | "unpaid" | "no_payment_required" | null;
};

export type BillingReturnPresentation =
  | {
      kind: "active";
      productAccess: true;
      assistedSetup: boolean;
      planName: string;
      intervalLabel: string;
      attention: BillingAttention | null;
      attentionMessage: string | null;
      trial: BillingTrialPresentation | null;
    }
  | {
      kind: "processing";
      productAccess: false;
      phase: CheckoutFollowUpPhase;
    }
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

export type ScheduledPlanChangePresentation = {
  targetLabel: string;
  effectiveLabel: string;
  operatorLines: {
    plan: string;
    scheduledChange: string;
    currentAccess: string;
  };
  customerMessage: string;
};

/**
 * A scheduled Practice → Essential change. Hidden once the current plan is
 * Essential, and hidden when cancellation is already scheduled.
 */
export function presentScheduledPlanChange(input: {
  commercialPlan: CommercialPlan | null;
  scheduledCommercialPlan: CommercialPlan | null;
  effectiveAt: Date | null;
  cancelAtPeriodEnd: boolean;
}): ScheduledPlanChangePresentation | null {
  if (input.cancelAtPeriodEnd) {
    return null;
  }
  if (input.commercialPlan !== "PRACTICE") {
    return null;
  }
  if (
    input.scheduledCommercialPlan !== "ESSENTIAL" ||
    input.effectiveAt == null
  ) {
    return null;
  }
  const effectiveLabel = formatBillingDate(input.effectiveAt);
  return {
    targetLabel: "Essential",
    effectiveLabel,
    operatorLines: {
      plan: "Practice",
      scheduledChange: `Essential on ${effectiveLabel}`,
      currentAccess: `Practice until ${effectiveLabel}`,
    },
    customerMessage: `Essential begins on ${effectiveLabel}. Practice stays active until then.`,
  };
}

export const PAST_DUE_BILLING_MESSAGE =
  "We couldn't collect your latest subscription payment. Please review your billing details to avoid an interruption to your service.";

export const RESTRICTED_BILLING_MESSAGE =
  "The latest payment hasn’t gone through. Clinic editing is paused. Published patient guides stay available, and billing on this page stays open.";

export const ENDED_BILLING_MESSAGE =
  "Your subscription has ended. Clinic editing is unavailable.";

export const CHECKOUT_INCOMPLETE_MESSAGE =
  "Secure payment hasn’t been completed. Continue to secure payment to finish setting up your subscription.";

export const CHECKOUT_CONFIRMATION_PENDING_MESSAGE =
  "Checkout is complete. We’re confirming your subscription. This page updates when Stripe confirms it.";

export const ASYNC_PAYMENT_PROCESSING_MESSAGE =
  "Your payment is processing. We’ll activate your subscription once Stripe confirms it.";

export function processingFollowUp(phase: CheckoutFollowUpPhase): {
  label: string;
  message: string;
} {
  switch (phase) {
    case "complete_payment":
      return {
        label: "Ready for payment",
        message: CHECKOUT_INCOMPLETE_MESSAGE,
      };
    case "confirmation_pending":
      return {
        label: "Confirming subscription",
        message: CHECKOUT_CONFIRMATION_PENDING_MESSAGE,
      };
    case "async_processing":
      return {
        label: "Payment processing",
        message: ASYNC_PAYMENT_PROCESSING_MESSAGE,
      };
  }
}

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

function checkoutFollowUpPhase(input: {
  entitlementStatus: EntitlementStatus | null;
  billingStatus: BillingStatus | null;
  checkoutStarted: boolean;
  checkoutSession?: CheckoutSessionEvidence | null;
}): CheckoutFollowUpPhase | null {
  if (input.entitlementStatus !== EntitlementStatus.PENDING) {
    return null;
  }
  const session = input.checkoutSession ?? null;
  if (session?.status === "complete" && session.paymentStatus === "unpaid") {
    return "async_processing";
  }
  if (session?.status === "complete") {
    return "confirmation_pending";
  }
  if (session?.status === "open" || session?.status === "expired") {
    return "complete_payment";
  }
  if (input.billingStatus === BillingStatus.PAYMENT_PENDING) {
    return "confirmation_pending";
  }
  if (input.checkoutStarted) {
    return "complete_payment";
  }
  return null;
}

export function presentBillingReturn(input: {
  entitlementStatus: EntitlementStatus | null;
  billingStatus: BillingStatus | null;
  commercialPlan: CommercialPlan | null;
  billingInterval: BillingInterval | null;
  checkoutStarted: boolean;
  /**
   * Retrieved Checkout Session. Absent means the page could not read one.
   * An open or expired Session is not a submitted payment. `unpaid` on a
   * completed Session is the verified asynchronous-payment signal.
   */
  checkoutSession?: CheckoutSessionEvidence | null;
  stripeSubscriptionId: string | null;
  paidThrough?: Date | null;
  /**
   * The stored paid-through instant, even when it is not reliable enough to
   * display as a renewal date. A historical trial end is not unpaid while
   * this date is present.
   */
  recordedPaidThrough?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  trialEndsAt?: Date | null;
  now?: Date;
}): BillingReturnPresentation {
  const planName = commercialPlanLabel(input.commercialPlan);
  const intervalLabel = billingIntervalLabel(input.billingInterval);

  if (input.entitlementStatus === EntitlementStatus.ACTIVE) {
    const now = input.now ?? new Date();
    const settledPaidThrough =
      input.recordedPaidThrough ?? input.paidThrough ?? null;
    const unpaidTrial =
      Boolean(input.trialEndsAt) && settledPaidThrough == null;
    const effectiveEnd = unpaidTrial
      ? (input.trialEndsAt ?? null)
      : (input.paidThrough ?? input.currentPeriodEnd ?? null);
    const cancelScheduled =
      input.cancelAtPeriodEnd === true ||
      input.billingStatus === BillingStatus.CANCEL_AT_PERIOD_END;
    const pastDue = input.billingStatus === BillingStatus.PAST_DUE;
    const attention: BillingAttention | null = pastDue
      ? "past_due"
      : cancelScheduled
        ? "cancel_scheduled"
        : null;
    const trial = unpaidTrial
      ? unpaidTrialPresentation({
          trialEndsAt: input.trialEndsAt ?? null,
          pastDue,
          cancelScheduled,
          now,
        })
      : null;
    return {
      kind: "active",
      productAccess: true,
      assistedSetup: input.commercialPlan === "PRACTICE",
      planName,
      intervalLabel,
      attention,
      attentionMessage: unpaidTrial
        ? trialCancelOrFailureMessage({
            attention,
            effectiveEnd,
            pastDue,
          })
        : attention === "past_due"
          ? PAST_DUE_BILLING_MESSAGE
          : attention === "cancel_scheduled" && effectiveEnd
            ? cancellationScheduledMessage(effectiveEnd)
            : attention === "cancel_scheduled"
              ? "Your subscription is scheduled to end at the close of the current paid period."
              : null,
      trial,
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

  const followUp = checkoutFollowUpPhase(input);
  if (followUp) {
    return { kind: "processing", productAccess: false, phase: followUp };
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
  interval: BillingInterval | null,
  offeredAdditionalSiteQuantity: number | null = null
): ReturnType<typeof commercialOfferSummary> | null {
  if (plan === "GROUP") {
    if (
      !interval ||
      !isOfferedAdditionalSiteQuantity(offeredAdditionalSiteQuantity)
    ) {
      return null;
    }
    return groupCommercialOfferSummary(interval, offeredAdditionalSiteQuantity);
  }
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
    case BillingStatus.NOT_BILLED:
      return "Complimentary";
    case BillingStatus.TRIALING:
      return "Free trial";
    default:
      return "Not started";
  }
}

function unpaidTrialPresentation(input: {
  trialEndsAt: Date | null;
  pastDue: boolean;
  cancelScheduled: boolean;
  now: Date;
}): BillingTrialPresentation | null {
  if (!input.trialEndsAt) {
    return null;
  }
  if (input.pastDue) {
    return {
      phase: "first_payment_failed",
      endsAt: input.trialEndsAt,
      message: null,
    };
  }
  const open = input.trialEndsAt.getTime() > input.now.getTime();
  if (open) {
    return {
      phase: "in_trial",
      endsAt: input.trialEndsAt,
      message: input.cancelScheduled
        ? null
        : `Your free trial includes full access through ${formatBillingDate(input.trialEndsAt)}. The catalogue price is charged then, unless you cancel from Billing before the trial ends.`,
    };
  }
  return {
    phase: "awaiting_first_charge",
    endsAt: input.trialEndsAt,
    message:
      "Your free trial has ended. The first payment is being processed, and clinic access stays open.",
  };
}

function trialCancelOrFailureMessage(input: {
  attention: BillingAttention | null;
  effectiveEnd: Date | null;
  pastDue: boolean;
}): string | null {
  if (input.pastDue) {
    return PAST_DUE_BILLING_MESSAGE;
  }
  if (input.attention === "cancel_scheduled" && input.effectiveEnd) {
    return `Your free trial is scheduled to end on ${formatBillingDate(input.effectiveEnd)}. You will not be charged.`;
  }
  if (input.attention === "cancel_scheduled") {
    return "Your free trial is scheduled to end. You will not be charged.";
  }
  return null;
}

export function customerBillingStatusLabel(input: {
  presentation: BillingReturnPresentation;
  complimentaryLabel: string | null;
  showCommercialDetail: boolean;
  billingLabel: string;
}): string {
  if (input.complimentaryLabel) {
    return input.complimentaryLabel;
  }
  const presentation = input.presentation;
  if (
    presentation.kind === "active" &&
    presentation.trial?.phase === "in_trial"
  ) {
    return presentation.attention === "cancel_scheduled"
      ? "Trial ending"
      : "Free trial";
  }
  if (
    presentation.kind === "active" &&
    presentation.trial?.phase === "awaiting_first_charge"
  ) {
    return "First payment processing";
  }
  if (
    presentation.kind === "active" &&
    presentation.attention === "cancel_scheduled"
  ) {
    return "Scheduled to end";
  }
  if (
    presentation.kind === "active" &&
    presentation.attention === "past_due" &&
    input.showCommercialDetail
  ) {
    return "Payment issue";
  }
  if (presentation.kind === "active") {
    return "Active";
  }
  if (presentation.kind === "processing") {
    return processingFollowUp(presentation.phase).label;
  }
  if (presentation.kind === "restricted" && input.showCommercialDetail) {
    return "Unpaid";
  }
  if (presentation.kind === "restricted") {
    return "Billing";
  }
  if (presentation.kind === "inactive") {
    return "Ended";
  }
  return input.billingLabel;
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
