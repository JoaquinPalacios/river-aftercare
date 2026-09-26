import "server-only";

import type { EntitlementStatus } from "@prisma/client";

import { groupCapacityPersistence } from "@/lib/clinics/group-capacity";

export const groupCapacityEntitlementSelect = {
  commercialPlan: true,
  entitlementStatus: true,
  siteAllowance: true,
  locationAllowance: true,
  purchasedAdditionalSiteQuantity: true,
  extraSiteAllowance: true,
  extraLocationAllowance: true,
} as const;

type GroupCapacityEntitlementRow = {
  commercialPlan: string | null;
  entitlementStatus: EntitlementStatus;
  siteAllowance: number;
  locationAllowance: number;
  purchasedAdditionalSiteQuantity: number | null;
  extraSiteAllowance: number;
  extraLocationAllowance: number;
};

export function groupCapacityEntitlementFlags(
  row: GroupCapacityEntitlementRow | null
): {
  capacityEntitlementActive: boolean;
  purchasedAdditionalSiteQuantity: number | null;
  extraSiteAllowance: number;
  extraLocationAllowance: number;
} {
  return {
    capacityEntitlementActive: row?.entitlementStatus === "ACTIVE",
    purchasedAdditionalSiteQuantity:
      row?.purchasedAdditionalSiteQuantity ?? null,
    extraSiteAllowance: row?.extraSiteAllowance ?? 0,
    extraLocationAllowance: row?.extraLocationAllowance ?? 0,
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
