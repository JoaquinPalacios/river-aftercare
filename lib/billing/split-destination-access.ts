import "server-only";

import type {
  BillingInterval,
  BillingStatus,
  CommercialArrangement,
  CommercialPlan,
  EntitlementStatus,
  Prisma,
} from "@prisma/client";

import { getPrisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

/**
 * Local commercial projection for an account-split destination shell.
 * Callers outside billing receive `access` so they do not read the
 * entitlement column name directly.
 */
export type SplitDestinationCommercialState = {
  commercialPlan: CommercialPlan | null;
  billingInterval: BillingInterval | null;
  billingStatus: BillingStatus;
  access: EntitlementStatus;
  cancelAtPeriodEnd: boolean;
  scheduledCommercialPlan: CommercialPlan | null;
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
  commercialArrangement: CommercialArrangement;
};

export async function readSplitDestinationCommercialState(
  clinicId: string,
  db: Db = getPrisma()
): Promise<SplitDestinationCommercialState | null> {
  const row = await db.clinicEntitlement.findUnique({
    where: { clinicId },
    select: {
      commercialPlan: true,
      billingInterval: true,
      billingStatus: true,
      entitlementStatus: true,
      cancelAtPeriodEnd: true,
      scheduledCommercialPlan: true,
      siteAllowance: true,
      locationAllowance: true,
      purchasedAdditionalSiteQuantity: true,
      purchasedAdditionalLocationQuantity: true,
      extraSiteAllowance: true,
      extraLocationAllowance: true,
      extraTeamMemberAllowance: true,
      extraCustomGuideAllowance: true,
      extraTemplateAdaptationAllowance: true,
      commercialArrangement: true,
    },
  });
  if (!row) {
    return null;
  }
  return {
    commercialPlan: row.commercialPlan,
    billingInterval: row.billingInterval,
    billingStatus: row.billingStatus,
    access: row.entitlementStatus,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    scheduledCommercialPlan: row.scheduledCommercialPlan,
    siteAllowance: row.siteAllowance,
    locationAllowance: row.locationAllowance,
    capacityEntitlementActive: row.entitlementStatus === "ACTIVE",
    purchasedAdditionalSiteQuantity: row.purchasedAdditionalSiteQuantity,
    purchasedAdditionalLocationQuantity:
      row.purchasedAdditionalLocationQuantity,
    extraSiteAllowance: row.extraSiteAllowance,
    extraLocationAllowance: row.extraLocationAllowance,
    extraTeamMemberAllowance: row.extraTeamMemberAllowance,
    extraCustomGuideAllowance: row.extraCustomGuideAllowance,
    extraTemplateAdaptationAllowance: row.extraTemplateAdaptationAllowance,
    commercialArrangement: row.commercialArrangement,
  };
}

export type SplitSourceCommercialSignals = {
  billingStatus: BillingStatus | null;
  access: EntitlementStatus | null;
  cancelAtPeriodEnd: boolean;
  scheduledCommercialPlan: CommercialPlan | null;
  scheduledAdditionalSiteQuantity: number | null;
  scheduledCapacityEffectiveAt: Date | null;
  offeredAdditionalSiteQuantity: number | null;
};

export async function readSplitSourceCommercialSignals(
  clinicId: string,
  db: Db = getPrisma()
): Promise<SplitSourceCommercialSignals | null> {
  const row = await db.clinicEntitlement.findUnique({
    where: { clinicId },
    select: {
      billingStatus: true,
      entitlementStatus: true,
      cancelAtPeriodEnd: true,
      scheduledCommercialPlan: true,
      scheduledAdditionalSiteQuantity: true,
      scheduledCapacityEffectiveAt: true,
      offeredAdditionalSiteQuantity: true,
    },
  });
  if (!row) {
    return null;
  }
  return {
    billingStatus: row.billingStatus,
    access: row.entitlementStatus,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    scheduledCommercialPlan: row.scheduledCommercialPlan,
    scheduledAdditionalSiteQuantity: row.scheduledAdditionalSiteQuantity,
    scheduledCapacityEffectiveAt: row.scheduledCapacityEffectiveAt,
    offeredAdditionalSiteQuantity: row.offeredAdditionalSiteQuantity,
  };
}
