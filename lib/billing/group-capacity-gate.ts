import "server-only";

import type { EntitlementStatus } from "@prisma/client";

import type { CommercialPlan, Prisma } from "@prisma/client";

import { groupCapacityPersistence } from "@/lib/clinics/group-capacity";
import { getPrisma } from "@/lib/prisma";

export const groupCapacityEntitlementSelect = {
  commercialPlan: true,
  entitlementStatus: true,
  siteAllowance: true,
  locationAllowance: true,
  purchasedAdditionalSiteQuantity: true,
  purchasedAdditionalLocationQuantity: true,
  extraSiteAllowance: true,
  extraLocationAllowance: true,
  extraTeamMemberAllowance: true,
  extraCustomGuideAllowance: true,
  extraTemplateAdaptationAllowance: true,
} as const;

type GroupCapacityEntitlementRow = {
  commercialPlan: CommercialPlan | null;
  entitlementStatus: EntitlementStatus;
  siteAllowance: number;
  locationAllowance: number;
  purchasedAdditionalSiteQuantity: number | null;
  purchasedAdditionalLocationQuantity: number | null;
  extraSiteAllowance: number;
  extraLocationAllowance: number;
  extraTeamMemberAllowance: number;
  extraCustomGuideAllowance: number;
  extraTemplateAdaptationAllowance: number;
};

export type AccountCapacityFacts = {
  commercialPlan: CommercialPlan | null;
  siteAllowance: number;
  locationAllowance: number;
  capacityEntitlementActive: boolean;
  purchasedAdditionalSiteQuantity: number | null;
  purchasedAdditionalLocationQuantity: number | null;
  extraSiteAllowance: number;
  extraLocationAllowance: number;
  extraTeamMemberAllowance: number;
  extraCustomGuideAllowance: number;
  extraTemplateAdaptationAllowance: number;
};

export function groupCapacityEntitlementFlags(
  row: GroupCapacityEntitlementRow | null
): {
  capacityEntitlementActive: boolean;
  purchasedAdditionalSiteQuantity: number | null;
  purchasedAdditionalLocationQuantity: number | null;
  extraSiteAllowance: number;
  extraLocationAllowance: number;
} {
  return {
    capacityEntitlementActive: row?.entitlementStatus === "ACTIVE",
    purchasedAdditionalSiteQuantity:
      row?.purchasedAdditionalSiteQuantity ?? null,
    purchasedAdditionalLocationQuantity:
      row?.purchasedAdditionalLocationQuantity ?? null,
    extraSiteAllowance: row?.extraSiteAllowance ?? 0,
    extraLocationAllowance: row?.extraLocationAllowance ?? 0,
  };
}

export async function readAccountCapacityFacts(
  clinicId: string,
  db: Prisma.TransactionClient | ReturnType<typeof getPrisma> = getPrisma()
): Promise<AccountCapacityFacts | null> {
  const row = await db.clinicEntitlement.findUnique({
    where: { clinicId },
    select: groupCapacityEntitlementSelect,
  });
  if (!row) {
    return null;
  }
  const flags = groupCapacityEntitlementFlags(row);
  return {
    commercialPlan: row.commercialPlan,
    siteAllowance: row.siteAllowance,
    locationAllowance: row.locationAllowance,
    capacityEntitlementActive: flags.capacityEntitlementActive,
    purchasedAdditionalSiteQuantity: flags.purchasedAdditionalSiteQuantity,
    purchasedAdditionalLocationQuantity:
      flags.purchasedAdditionalLocationQuantity,
    extraSiteAllowance: flags.extraSiteAllowance,
    extraLocationAllowance: flags.extraLocationAllowance,
    extraTeamMemberAllowance: row.extraTeamMemberAllowance,
    extraCustomGuideAllowance: row.extraCustomGuideAllowance,
    extraTemplateAdaptationAllowance: row.extraTemplateAdaptationAllowance,
  };
}

export function groupCapacityPersistenceFromRow(
  row: GroupCapacityEntitlementRow,
  extras: {
    extraSiteAllowance: number;
    extraLocationAllowance: number;
  }
) {
  return groupCapacityPersistence({
    capacityEntitlementActive: row.entitlementStatus === "ACTIVE",
    purchasedAdditionalSiteQuantity: row.purchasedAdditionalSiteQuantity,
    extraSiteAllowance: extras.extraSiteAllowance,
    extraLocationAllowance: extras.extraLocationAllowance,
    siteAllowance: row.siteAllowance,
    locationAllowance: row.locationAllowance,
  });
}
