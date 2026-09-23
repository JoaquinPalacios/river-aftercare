import type { CommercialPlan } from "@prisma/client";

/**
 * Fixed commercial allowances for self-serve plans.
 *
 * These numbers are product entitlements. They are not Stripe quantities,
 * per-seat prices, or values read from marketing copy or Price metadata.
 *
 * GROUP has no fixed allowance here. A clinic with no ClinicEntitlement row
 * stays on the legacy open path. A row whose commercial plan is null is
 * unspecified and is also not given an Essential or Practice cap.
 */
export const ESSENTIAL_TEAM_MEMBER_LIMIT = 2;
export const ESSENTIAL_CUSTOM_GUIDE_LIMIT = 2;
export const PRACTICE_TEAM_MEMBER_LIMIT = 5;
export const PRACTICE_CUSTOM_GUIDE_LIMIT = 30;

export type GovernedCommercialPlan = "ESSENTIAL" | "PRACTICE";

export type PlanEntitlementPolicy = {
  commercialPlan: GovernedCommercialPlan;
  teamMemberLimit: number;
  customGuideLimit: number;
  canAdaptRiverTemplates: boolean;
};

export const PLAN_ENTITLEMENT_POLICIES: Record<
  GovernedCommercialPlan,
  PlanEntitlementPolicy
> = {
  ESSENTIAL: {
    commercialPlan: "ESSENTIAL",
    teamMemberLimit: ESSENTIAL_TEAM_MEMBER_LIMIT,
    customGuideLimit: ESSENTIAL_CUSTOM_GUIDE_LIMIT,
    canAdaptRiverTemplates: false,
  },
  PRACTICE: {
    commercialPlan: "PRACTICE",
    teamMemberLimit: PRACTICE_TEAM_MEMBER_LIMIT,
    customGuideLimit: PRACTICE_CUSTOM_GUIDE_LIMIT,
    canAdaptRiverTemplates: true,
  },
};

export type PlanGovernance =
  | { governed: false; reason: "legacy" | "group" | "unspecified" }
  | { governed: true; policy: PlanEntitlementPolicy };

export function planGovernanceFromEntitlement(input: {
  entitlement: { commercialPlan: CommercialPlan | null } | null;
}): PlanGovernance {
  if (!input.entitlement) {
    return { governed: false, reason: "legacy" };
  }

  if (input.entitlement.commercialPlan === "GROUP") {
    return { governed: false, reason: "group" };
  }

  if (
    input.entitlement.commercialPlan === "ESSENTIAL" ||
    input.entitlement.commercialPlan === "PRACTICE"
  ) {
    return {
      governed: true,
      policy: PLAN_ENTITLEMENT_POLICIES[input.entitlement.commercialPlan],
    };
  }

  return { governed: false, reason: "unspecified" };
}

export function isGovernedCommercialPlan(
  plan: CommercialPlan | null
): plan is GovernedCommercialPlan {
  return plan === "ESSENTIAL" || plan === "PRACTICE";
}
