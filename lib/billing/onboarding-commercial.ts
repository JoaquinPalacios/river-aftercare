import "server-only";

import type {
  BillingInterval,
  BillingStatus,
  CommercialArrangement,
  CommercialPlan,
  EntitlementStatus,
} from "@prisma/client";

import {
  billingStateLabel,
  entitlementStateLabel,
  formatBillingDate,
} from "@/lib/billing/billing-presentation";
import {
  billingIntervalLabel,
  commercialPlanLabel,
} from "@/lib/billing/offer-display";
import { getPrisma } from "@/lib/prisma";

export type CommercialEntitlementSnapshot = {
  commercialPlan: CommercialPlan | null;
  commercialArrangement: CommercialArrangement;
  billingStatus: BillingStatus;
  billingInterval: BillingInterval | null;
  entitlementStatus: EntitlementStatus;
  complimentaryExpiresAt: Date | null;
  commercialReviewAt: Date | null;
};

export type OnboardingCommercialState =
  | { configured: false }
  | {
      configured: true;
      kind: "complimentary" | "standard_paid" | "paid";
      plan: CommercialPlan;
      planLabel: string;
      arrangementLabel: string;
      statusLabel: string;
      detail: string;
    };

/**
 * An explicit commercial path recorded by the existing entitlement services.
 * A missing row is not a commercial setup and is not treated as ready.
 */
export function initialCommercialSetupIsValid(
  entitlement: Pick<
    CommercialEntitlementSnapshot,
    "commercialPlan" | "commercialArrangement"
  > | null
): boolean {
  if (!entitlement?.commercialPlan) {
    return false;
  }
  if (entitlement.commercialArrangement === "COMPLIMENTARY") {
    return (
      entitlement.commercialPlan === "ESSENTIAL" ||
      entitlement.commercialPlan === "PRACTICE"
    );
  }
  return (
    entitlement.commercialPlan === "ESSENTIAL" ||
    entitlement.commercialPlan === "PRACTICE" ||
    entitlement.commercialPlan === "GROUP"
  );
}

export function describeOnboardingCommercial(input: {
  entitlement: CommercialEntitlementSnapshot | null;
  negotiatedOfferOpen: boolean;
}): {
  commercial: OnboardingCommercialState;
  negotiatedOfferOpen: boolean;
} {
  const commercial = commercialState(input.entitlement);
  if (!commercial.configured) {
    return { commercial, negotiatedOfferOpen: input.negotiatedOfferOpen };
  }
  return {
    commercial: {
      ...commercial,
      arrangementLabel: arrangementLabel({
        kind: commercial.kind,
        negotiatedOfferOpen: input.negotiatedOfferOpen,
      }),
    },
    negotiatedOfferOpen: input.negotiatedOfferOpen,
  };
}

function commercialState(
  entitlement: CommercialEntitlementSnapshot | null
): OnboardingCommercialState {
  if (
    !initialCommercialSetupIsValid(entitlement) ||
    !entitlement?.commercialPlan
  ) {
    return { configured: false };
  }
  const plan = entitlement.commercialPlan;
  const planLabel = commercialPlanLabel(plan);
  const statusLabel = `${entitlementStateLabel(entitlement.entitlementStatus)} · ${billingStateLabel(entitlement.billingStatus)}`;
  if (entitlement.commercialArrangement === "COMPLIMENTARY") {
    const expiry =
      entitlement.complimentaryExpiresAt === null
        ? "Indefinite"
        : `Ends ${formatBillingDate(entitlement.complimentaryExpiresAt)}`;
    const review = entitlement.commercialReviewAt
      ? `Commercial review ${formatBillingDate(entitlement.commercialReviewAt)}`
      : null;
    return {
      configured: true,
      kind: "complimentary",
      plan,
      planLabel,
      arrangementLabel: "Complimentary",
      statusLabel,
      detail: [expiry, review].filter(Boolean).join(". "),
    };
  }
  const interval = billingIntervalLabel(entitlement.billingInterval);
  return {
    configured: true,
    kind: plan === "GROUP" ? "paid" : "standard_paid",
    plan,
    planLabel,
    arrangementLabel: plan === "GROUP" ? "Paid offer" : "Standard paid offer",
    statusLabel,
    detail:
      interval === "Not selected" ? statusLabel : `${interval}. ${statusLabel}`,
  };
}

function arrangementLabel(input: {
  kind: "complimentary" | "standard_paid" | "paid";
  negotiatedOfferOpen: boolean;
}): string {
  if (input.kind === "complimentary" && input.negotiatedOfferOpen) {
    return "Complimentary, with a negotiated price prepared";
  }
  if (input.kind === "complimentary") {
    return "Complimentary";
  }
  if (input.kind === "standard_paid") {
    return "Standard paid offer";
  }
  return "Paid offer";
}

export async function loadOnboardingCommercial(clinicId: string): Promise<{
  commercial: OnboardingCommercialState;
  negotiatedOfferOpen: boolean;
}> {
  const row = await getPrisma().clinic.findUnique({
    where: { id: clinicId },
    select: {
      entitlement: {
        select: {
          commercialPlan: true,
          commercialArrangement: true,
          billingStatus: true,
          billingInterval: true,
          entitlementStatus: true,
          complimentaryExpiresAt: true,
          commercialReviewAt: true,
        },
      },
      negotiatedOffers: {
        where: { status: { in: ["PREPARED", "CHECKOUT_OPEN"] } },
        select: { id: true },
        take: 1,
      },
    },
  });
  return describeOnboardingCommercial({
    entitlement: row?.entitlement ?? null,
    negotiatedOfferOpen: (row?.negotiatedOffers.length ?? 0) > 0,
  });
}
