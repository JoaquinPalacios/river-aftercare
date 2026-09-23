import "server-only";

import {
  effectiveAllowances,
  PLAN_ENTITLEMENT_POLICIES,
  type AllowanceAmounts,
  ZERO_ALLOWANCE_EXTRAS,
} from "@/lib/entitlements/plan-policy";
import {
  countAdaptedTemplateGuides,
  countOriginalCustomGuides,
} from "@/lib/entitlements/guide-usage";
import {
  allowanceExtrasFrom,
  countTeamUsage,
  readStoredEntitlement,
} from "@/lib/entitlements/team-usage";
import { getPrisma } from "@/lib/prisma";

export const DOWNGRADE_CONFLICTS = {
  TEAM_MEMBERS: "TEAM_MEMBERS",
  CUSTOM_GUIDES: "CUSTOM_GUIDES",
  TEMPLATE_ADAPTATIONS: "TEMPLATE_ADAPTATIONS",
} as const;

export type DowngradeConflict =
  (typeof DOWNGRADE_CONFLICTS)[keyof typeof DOWNGRADE_CONFLICTS];

export type EssentialDowngradeReadiness = {
  ready: boolean;
  conflicts: DowngradeConflict[];
  team: { current: number; limit: number };
  guides: { current: number; limit: number };
  adaptedTemplates: { current: number; limit: number };
};

/**
 * Whether current usage would fit Essential after a later plan change.
 * Limits are Essential base plus the clinic's current persistent extras.
 * Extras are not discarded. This does not schedule a Stripe downgrade.
 */
export function assessEssentialDowngradeReadiness(input: {
  occupiedTeamPlaces: number;
  customGuideCount: number;
  adaptedTemplateCount: number;
  extras?: AllowanceAmounts;
}): EssentialDowngradeReadiness {
  const extras = input.extras ?? ZERO_ALLOWANCE_EXTRAS;
  const limits = effectiveAllowances(
    PLAN_ENTITLEMENT_POLICIES.ESSENTIAL.base,
    extras
  );
  const conflicts: DowngradeConflict[] = [];
  if (input.occupiedTeamPlaces > limits.teamMembers) {
    conflicts.push(DOWNGRADE_CONFLICTS.TEAM_MEMBERS);
  }
  if (input.customGuideCount > limits.customGuides) {
    conflicts.push(DOWNGRADE_CONFLICTS.CUSTOM_GUIDES);
  }
  if (input.adaptedTemplateCount > limits.templateAdaptations) {
    conflicts.push(DOWNGRADE_CONFLICTS.TEMPLATE_ADAPTATIONS);
  }

  return {
    ready: conflicts.length === 0,
    conflicts,
    team: { current: input.occupiedTeamPlaces, limit: limits.teamMembers },
    guides: { current: input.customGuideCount, limit: limits.customGuides },
    adaptedTemplates: {
      current: input.adaptedTemplateCount,
      limit: limits.templateAdaptations,
    },
  };
}

export async function loadEssentialDowngradeReadiness(
  clinicId: string,
  now: Date = new Date()
): Promise<EssentialDowngradeReadiness> {
  const prisma = getPrisma();
  const entitlement = await readStoredEntitlement(clinicId, prisma);
  const team = await countTeamUsage(prisma, clinicId, now);
  const guides = await countOriginalCustomGuides(prisma, clinicId);
  const adapted = await countAdaptedTemplateGuides(prisma, clinicId);
  return assessEssentialDowngradeReadiness({
    occupiedTeamPlaces: team.occupiedPlaces,
    customGuideCount: guides,
    adaptedTemplateCount: adapted,
    extras: allowanceExtrasFrom(entitlement),
  });
}
