import "server-only";

import type {
  BillingInterval,
  BillingStatus,
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
  extraTeamMemberAllowance: number;
  extraCustomGuideAllowance: number;
  extraTemplateAdaptationAllowance: number;
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
      extraTeamMemberAllowance: true,
      extraCustomGuideAllowance: true,
      extraTemplateAdaptationAllowance: true,
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
    extraTeamMemberAllowance: row.extraTeamMemberAllowance,
    extraCustomGuideAllowance: row.extraCustomGuideAllowance,
    extraTemplateAdaptationAllowance: row.extraTemplateAdaptationAllowance,
  };
}
