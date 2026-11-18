import "server-only";

import {
  BillingStatus,
  EntitlementStatus,
  type BillingInterval,
  type CommercialPlan,
} from "@prisma/client";

/** Catalogue Checkout only. Negotiated, Group, and existing subscriptions stay off this path. */
export const CATALOGUE_TRIAL_PERIOD_DAYS = 14;

/** Present only on a Checkout Session that actually requests the catalogue trial. */
export const RIVER_TRIAL_DAYS_METADATA_KEY = "riverTrialDays";

export const CATALOGUE_TRIAL_DISCLOSURE =
  "When this clinic is eligible, Checkout includes 14 days of River Aftercare before the first charge. A card or Australian bank debit is still required. The catalogue price is charged when the trial ends, unless the subscription is canceled from Billing before then.";

export function stripeTrialStillOpen(
  trialEndUnix: number | null | undefined,
  nowMs = Date.now()
): boolean {
  return (
    typeof trialEndUnix === "number" &&
    Number.isFinite(trialEndUnix) &&
    trialEndUnix * 1000 > nowMs
  );
}

export function trialStillOpen(
  trialEndsAt: Date | null | undefined,
  now = new Date()
): boolean {
  return Boolean(trialEndsAt && trialEndsAt.getTime() > now.getTime());
}

type CatalogueTrialState = {
  commercialArrangement?: "PAID" | "COMPLIMENTARY" | null;
  commercialPlan: CommercialPlan | string | null;
  billingInterval: BillingInterval | string | null;
  billingStatus: BillingStatus | null;
  entitlementStatus: EntitlementStatus | null;
  stripeSubscriptionId: string | null;
  trialEndsAt?: Date | null;
};

/**
 * Local eligibility for a new Essential or Practice catalogue trial.
 * Stripe subscription history is checked separately and can still withhold it.
 * A stored trial end stays after the trial, including once the clinic has paid.
 */
export function catalogueTrialDaysForState(
  state: CatalogueTrialState
): typeof CATALOGUE_TRIAL_PERIOD_DAYS | null {
  if (state.commercialArrangement === "COMPLIMENTARY") {
    return null;
  }
  if (
    state.commercialPlan !== "ESSENTIAL" &&
    state.commercialPlan !== "PRACTICE"
  ) {
    return null;
  }
  if (
    state.billingInterval !== "MONTHLY" &&
    state.billingInterval !== "YEARLY"
  ) {
    return null;
  }
  if (state.stripeSubscriptionId || state.trialEndsAt) {
    return null;
  }
  if (
    state.entitlementStatus === EntitlementStatus.ACTIVE ||
    state.entitlementStatus === EntitlementStatus.RESTRICTED ||
    state.entitlementStatus === EntitlementStatus.ENDED
  ) {
    return null;
  }
  if (
    state.billingStatus === BillingStatus.ACTIVE ||
    state.billingStatus === BillingStatus.TRIALING ||
    state.billingStatus === BillingStatus.PAST_DUE ||
    state.billingStatus === BillingStatus.UNPAID ||
    state.billingStatus === BillingStatus.CANCEL_AT_PERIOD_END ||
    state.billingStatus === BillingStatus.ENDED ||
    state.billingStatus === BillingStatus.PAYMENT_PENDING ||
    state.billingStatus === BillingStatus.NOT_BILLED
  ) {
    return null;
  }
  if (state.billingStatus !== BillingStatus.OFFER_PREPARED) {
    return null;
  }
  return CATALOGUE_TRIAL_PERIOD_DAYS;
}

export function catalogueCheckoutTrialEligible(
  state: CatalogueTrialState
): boolean {
  return catalogueTrialDaysForState(state) === CATALOGUE_TRIAL_PERIOD_DAYS;
}

export type CatalogueTrialHistory = "none" | "present" | "unavailable";

export async function catalogueTrialHistory(input: {
  listSubscriptions?:
    | ((params: {
        customer: string;
        status: "all";
        limit: number;
      }) => Promise<{ data?: readonly unknown[] | null }>)
    | undefined;
  customerId: string;
}): Promise<CatalogueTrialHistory> {
  if (typeof input.listSubscriptions !== "function") {
    return "unavailable";
  }
  try {
    const page = await input.listSubscriptions({
      customer: input.customerId,
      status: "all",
      limit: 1,
    });
    return (page.data?.length ?? 0) > 0 ? "present" : "none";
  } catch {
    return "unavailable";
  }
}
