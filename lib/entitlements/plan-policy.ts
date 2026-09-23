import type { CommercialPlan } from "@prisma/client";

/**
 * Fixed commercial allowances for self-serve plans.
 *
 * These numbers are product entitlements. They are not Stripe quantities,
 * per-seat prices, or values read from marketing copy or Price metadata.
 *
 * Original custom guides and River-template adaptations are independent
 * pools. An adapted copy does not consume a custom-guide place.
 *
 * GROUP has no fixed allowance here. A clinic with no ClinicEntitlement row
 * stays on the legacy open path. A row whose commercial plan is null is
 * unspecified and is also not given an Essential or Practice cap.
 *
 * Operator-granted extras are added to the base. They are not stored as the
 * effective total, because the base plan can change.
 */
export const ESSENTIAL_TEAM_MEMBER_LIMIT = 2;
export const ESSENTIAL_CUSTOM_GUIDE_LIMIT = 2;
export const ESSENTIAL_TEMPLATE_ADAPTATION_LIMIT = 2;
export const PRACTICE_TEAM_MEMBER_LIMIT = 5;
export const PRACTICE_CUSTOM_GUIDE_LIMIT = 30;
export const PRACTICE_TEMPLATE_ADAPTATION_LIMIT = 10;

export type GovernedCommercialPlan = "ESSENTIAL" | "PRACTICE";

export type AllowanceAmounts = {
  teamMembers: number;
  customGuides: number;
  templateAdaptations: number;
};

export type PlanEntitlementPolicy = {
  commercialPlan: GovernedCommercialPlan;
  base: AllowanceAmounts;
};

export const ZERO_ALLOWANCE_EXTRAS: AllowanceAmounts = {
  teamMembers: 0,
  customGuides: 0,
  templateAdaptations: 0,
};

export const PLAN_ENTITLEMENT_POLICIES: Record<
  GovernedCommercialPlan,
  PlanEntitlementPolicy
> = {
  ESSENTIAL: {
    commercialPlan: "ESSENTIAL",
    base: {
      teamMembers: ESSENTIAL_TEAM_MEMBER_LIMIT,
      customGuides: ESSENTIAL_CUSTOM_GUIDE_LIMIT,
      templateAdaptations: ESSENTIAL_TEMPLATE_ADAPTATION_LIMIT,
    },
  },
  PRACTICE: {
    commercialPlan: "PRACTICE",
    base: {
      teamMembers: PRACTICE_TEAM_MEMBER_LIMIT,
      customGuides: PRACTICE_CUSTOM_GUIDE_LIMIT,
      templateAdaptations: PRACTICE_TEMPLATE_ADAPTATION_LIMIT,
    },
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

export function effectiveAllowances(
  base: AllowanceAmounts,
  extras: AllowanceAmounts
): AllowanceAmounts {
  return {
    teamMembers: base.teamMembers + extras.teamMembers,
    customGuides: base.customGuides + extras.customGuides,
    templateAdaptations: base.templateAdaptations + extras.templateAdaptations,
  };
}

export type AllowanceDimension = {
  used: number;
  base: number;
  extra: number;
  effective: number;
  remaining: number;
  atLimit: boolean;
  overLimit: boolean;
};

export function allowanceDimension(input: {
  used: number;
  base: number;
  extra: number;
}): AllowanceDimension {
  const effective = input.base + input.extra;
  return {
    used: input.used,
    base: input.base,
    extra: input.extra,
    effective,
    remaining: Math.max(effective - input.used, 0),
    atLimit: input.used >= effective,
    overLimit: input.used > effective,
  };
}

/** True when another adaptation would fit the effective allowance. */
export function canCreateTemplateAdaptation(input: {
  used: number;
  effective: number;
}): boolean {
  return input.used < input.effective;
}
