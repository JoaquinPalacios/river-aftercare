import "server-only";

import { PlatformRole } from "@prisma/client";

import { logOperatorAllowanceExtra } from "@/lib/entitlements/allowance-log";
import {
  lockClinicGuideCapacity,
  lockClinicTeamCapacity,
} from "@/lib/entitlements/locks";
import {
  effectiveAllowances,
  isGovernedCommercialPlan,
  PLAN_ENTITLEMENT_POLICIES,
  type AllowanceAmounts,
} from "@/lib/entitlements/plan-policy";
import { allowanceExtrasFrom } from "@/lib/entitlements/team-usage";
import { getPrisma } from "@/lib/prisma";

/** PostgreSQL integer upper bound. This is not a commercial price cap. */
export const MAX_OPERATOR_EXTRA_ALLOWANCE = 2_147_483_647;

export type OperatorExtrasResult =
  | { ok: true; extras: AllowanceAmounts; effective: AllowanceAmounts }
  | { ok: false; error: string };

function isNonNegativeInt(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_OPERATOR_EXTRA_ALLOWANCE
  );
}

/**
 * Persists operator-granted extras on the clinic entitlement.
 * Does not change commercialPlan, Stripe, or existing guides and members.
 * Reducing an extra below current usage is allowed and leaves the clinic
 * over the new effective allowance.
 */
export async function updateOperatorAllowanceExtras(input: {
  actorUserId: string;
  actorPlatformRole: PlatformRole;
  clinicId: string;
  extras: AllowanceAmounts;
}): Promise<OperatorExtrasResult> {
  if (input.actorPlatformRole !== PlatformRole.OPERATOR) {
    return {
      ok: false,
      error: "Only a platform operator can change allowances.",
    };
  }
  if (
    !isNonNegativeInt(input.extras.teamMembers) ||
    !isNonNegativeInt(input.extras.customGuides) ||
    !isNonNegativeInt(input.extras.templateAdaptations)
  ) {
    return {
      ok: false,
      error: "Extra allowances must be whole numbers of zero or more.",
    };
  }

  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    await lockClinicTeamCapacity(tx, input.clinicId);
    await lockClinicGuideCapacity(tx, input.clinicId);

    const current = await tx.clinicEntitlement.findUnique({
      where: { clinicId: input.clinicId },
      select: {
        commercialPlan: true,
        extraTeamMemberAllowance: true,
        extraCustomGuideAllowance: true,
        extraTemplateAdaptationAllowance: true,
      },
    });
    if (!current || !isGovernedCommercialPlan(current.commercialPlan)) {
      return {
        ok: false as const,
        error: "Fixed allowances apply only to Essential and Practice clinics.",
      };
    }

    const previous = allowanceExtrasFrom(current);
    await tx.clinicEntitlement.update({
      where: { clinicId: input.clinicId },
      data: {
        extraTeamMemberAllowance: input.extras.teamMembers,
        extraCustomGuideAllowance: input.extras.customGuides,
        extraTemplateAdaptationAllowance: input.extras.templateAdaptations,
      },
    });

    const base = PLAN_ENTITLEMENT_POLICIES[current.commercialPlan].base;
    const effective = effectiveAllowances(base, input.extras);
    const changes: Array<{
      dimension: "team_members" | "custom_guides" | "template_adaptations";
      previousExtra: number;
      nextExtra: number;
      effectiveAllowance: number;
    }> = [];
    if (previous.teamMembers !== input.extras.teamMembers) {
      changes.push({
        dimension: "team_members",
        previousExtra: previous.teamMembers,
        nextExtra: input.extras.teamMembers,
        effectiveAllowance: effective.teamMembers,
      });
    }
    if (previous.customGuides !== input.extras.customGuides) {
      changes.push({
        dimension: "custom_guides",
        previousExtra: previous.customGuides,
        nextExtra: input.extras.customGuides,
        effectiveAllowance: effective.customGuides,
      });
    }
    if (previous.templateAdaptations !== input.extras.templateAdaptations) {
      changes.push({
        dimension: "template_adaptations",
        previousExtra: previous.templateAdaptations,
        nextExtra: input.extras.templateAdaptations,
        effectiveAllowance: effective.templateAdaptations,
      });
    }
    for (const change of changes) {
      logOperatorAllowanceExtra({
        event: "operator_allowance_extra_updated",
        actorUserId: input.actorUserId,
        clinicId: input.clinicId,
        ...change,
      });
    }

    return { ok: true as const, extras: input.extras, effective };
  });
}
