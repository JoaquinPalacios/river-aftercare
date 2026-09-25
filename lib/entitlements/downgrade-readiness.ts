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
import { countActiveSiteLocationUsage } from "@/lib/clinics/site-location-capacity";
import { getPrisma } from "@/lib/prisma";

export const DOWNGRADE_CONFLICTS = {
  TEAM_MEMBERS: "TEAM_MEMBERS",
  CUSTOM_GUIDES: "CUSTOM_GUIDES",
  TEMPLATE_ADAPTATIONS: "TEMPLATE_ADAPTATIONS",
  COMBINED_GUIDES: "COMBINED_GUIDES",
  SITE_LOCATIONS: "SITE_LOCATIONS",
} as const;

export type DowngradeConflict =
  (typeof DOWNGRADE_CONFLICTS)[keyof typeof DOWNGRADE_CONFLICTS];

export type EssentialDowngradeReadiness = {
  ready: boolean;
  conflicts: DowngradeConflict[];
  team: { current: number; limit: number };
  guides: { current: number; limit: number };
  adaptedTemplates: { current: number; limit: number };
  combinedGuides: { current: number; limit: number };
  sites?: { current: number; limit: number };
  locations?: { current: number; limit: number };
};

/**
 * Whether current active usage would fit Essential.
 * Limits are Essential base plus the clinic's current persistent extras.
 * Downgrade-retained guides are excluded by the usage counts.
 * Guide overage is reported here and does not by itself block scheduling
 * once a confirmed keep-selection fits. Team overage remains a hard block.
 * Scheduling lives in plan-downgrade.
 */
export function readinessHasGuideOverage(
  readiness: EssentialDowngradeReadiness
): boolean {
  return readiness.conflicts.some(
    (conflict) =>
      conflict !== DOWNGRADE_CONFLICTS.TEAM_MEMBERS &&
      conflict !== DOWNGRADE_CONFLICTS.SITE_LOCATIONS
  );
}

export function assessEssentialDowngradeReadiness(input: {
  occupiedTeamPlaces: number;
  customGuideCount: number;
  adaptedTemplateCount: number;
  extras?: AllowanceAmounts;
  activeSites?: number;
  activeLocations?: number;
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
  const combinedGuideCount =
    input.customGuideCount + input.adaptedTemplateCount;
  if (combinedGuideCount > limits.combinedClinicOwnedGuides) {
    conflicts.push(DOWNGRADE_CONFLICTS.COMBINED_GUIDES);
  }
  const activeSites = input.activeSites ?? 0;
  const activeLocations = input.activeLocations ?? 0;
  if (activeSites > 1 || activeLocations > 1) {
    conflicts.push(DOWNGRADE_CONFLICTS.SITE_LOCATIONS);
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
    combinedGuides: {
      current: combinedGuideCount,
      limit: limits.combinedClinicOwnedGuides,
    },
    sites: { current: activeSites, limit: 1 },
    locations: { current: activeLocations, limit: 1 },
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
  const sites = await countActiveSiteLocationUsage(prisma, clinicId);
  return assessEssentialDowngradeReadiness({
    occupiedTeamPlaces: team.occupiedPlaces,
    customGuideCount: guides,
    adaptedTemplateCount: adapted,
    extras: allowanceExtrasFrom(entitlement),
    activeSites: sites.activeSites,
    activeLocations: sites.activeLocations,
  });
}
