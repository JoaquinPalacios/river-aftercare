import "server-only";

import { PLAN_ENTITLEMENT_POLICIES } from "@/lib/entitlements/plan-policy";
import { countCustomGuides } from "@/lib/entitlements/guide-usage";
import { countTeamUsage } from "@/lib/entitlements/team-usage";
import { getPrisma } from "@/lib/prisma";

export const DOWNGRADE_CONFLICTS = {
  TEAM_MEMBERS: "TEAM_MEMBERS",
  CUSTOM_GUIDES: "CUSTOM_GUIDES",
} as const;

export type DowngradeConflict =
  (typeof DOWNGRADE_CONFLICTS)[keyof typeof DOWNGRADE_CONFLICTS];

export type EssentialDowngradeReadiness = {
  ready: boolean;
  conflicts: DowngradeConflict[];
  team: { current: number; limit: number };
  guides: { current: number; limit: number };
};

/**
 * Whether current usage would fit Essential. This does not schedule a
 * Stripe downgrade. Operator-overridden extra members and adapted template
 * copies are included in the counts. Canonical template pins are not.
 */
export function assessEssentialDowngradeReadiness(input: {
  occupiedTeamPlaces: number;
  customGuideCount: number;
}): EssentialDowngradeReadiness {
  const teamLimit = PLAN_ENTITLEMENT_POLICIES.ESSENTIAL.teamMemberLimit;
  const guideLimit = PLAN_ENTITLEMENT_POLICIES.ESSENTIAL.customGuideLimit;
  const conflicts: DowngradeConflict[] = [];
  if (input.occupiedTeamPlaces > teamLimit) {
    conflicts.push(DOWNGRADE_CONFLICTS.TEAM_MEMBERS);
  }
  if (input.customGuideCount > guideLimit) {
    conflicts.push(DOWNGRADE_CONFLICTS.CUSTOM_GUIDES);
  }

  return {
    ready: conflicts.length === 0,
    conflicts,
    team: { current: input.occupiedTeamPlaces, limit: teamLimit },
    guides: { current: input.customGuideCount, limit: guideLimit },
  };
}

export async function loadEssentialDowngradeReadiness(
  clinicId: string,
  now: Date = new Date()
): Promise<EssentialDowngradeReadiness> {
  const prisma = getPrisma();
  const team = await countTeamUsage(prisma, clinicId, now);
  const guides = await countCustomGuides(prisma, clinicId);
  return assessEssentialDowngradeReadiness({
    occupiedTeamPlaces: team.occupiedPlaces,
    customGuideCount: guides,
  });
}
