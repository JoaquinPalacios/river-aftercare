import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import { lockClinicAccountStructure } from "@/lib/entitlements/locks";
import {
  DISCARD_CUSTOMER_ACTIVITY_MESSAGE,
  DISCARD_NOT_ASSISTED_MESSAGE,
} from "@/lib/operator/discard-assisted-clinic-messages";
import { getPrisma } from "@/lib/prisma";

export { DISCARD_CUSTOMER_ACTIVITY_MESSAGE, DISCARD_NOT_ASSISTED_MESSAGE };

type DiscardReader = Prisma.TransactionClient | PrismaClient;

const discardSelect = {
  assistedOnboarding: true,
  memberships: { select: { id: true }, take: 1 },
  accountTokens: { select: { id: true }, take: 1 },
  practiceGuides: { select: { id: true }, take: 1 },
  legalAcceptances: { select: { id: true }, take: 1 },
  billingPriceChanges: { select: { id: true }, take: 1 },
  billingNoticeDeliveries: { select: { id: true }, take: 1 },
  negotiatedOffers: { select: { id: true }, take: 1 },
  sourceAccountSplits: { select: { id: true }, take: 1 },
  destinationAccountSplits: { select: { id: true }, take: 1 },
  billingProfile: { select: { id: true } },
  downgradePreparation: { select: { clinicId: true } },
  sites: {
    select: {
      locationRedirectsFrom: { select: { id: true }, take: 1 },
      locationRedirectsTo: { select: { id: true }, take: 1 },
      keptByAccountSplits: { select: { id: true }, take: 1 },
    },
  },
} satisfies Prisma.ClinicSelect;

type DiscardClinic = Prisma.ClinicGetPayload<{ select: typeof discardSelect }>;

/**
 * Customer activity is anything the clinic or its people have started:
 * a membership, invitation, guide, billing profile, legal acceptance,
 * negotiated offer, account split, downgrade, or billing notice.
 * The creation shell and an operator-only entitlement are not activity.
 */
export function clinicHasCustomerActivity(clinic: DiscardClinic): boolean {
  if (
    clinic.memberships.length > 0 ||
    clinic.accountTokens.length > 0 ||
    clinic.practiceGuides.length > 0 ||
    clinic.legalAcceptances.length > 0 ||
    clinic.billingPriceChanges.length > 0 ||
    clinic.billingNoticeDeliveries.length > 0 ||
    clinic.negotiatedOffers.length > 0 ||
    clinic.sourceAccountSplits.length > 0 ||
    clinic.destinationAccountSplits.length > 0 ||
    clinic.billingProfile !== null ||
    clinic.downgradePreparation !== null
  ) {
    return true;
  }
  return clinic.sites.some(
    (site) =>
      site.locationRedirectsFrom.length > 0 ||
      site.locationRedirectsTo.length > 0 ||
      site.keptByAccountSplits.length > 0
  );
}

async function readDiscardClinic(
  db: DiscardReader,
  clinicId: string
): Promise<DiscardClinic | null> {
  return db.clinic.findUnique({
    where: { id: clinicId },
    select: discardSelect,
  });
}

export async function assistedClinicCanBeDiscarded(
  clinicId: string
): Promise<boolean> {
  const clinic = await readDiscardClinic(getPrisma(), clinicId);
  return (
    clinic !== null &&
    clinic.assistedOnboarding &&
    !clinicHasCustomerActivity(clinic)
  );
}

export async function discardAssistedClinic(
  clinicId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    return await getPrisma().$transaction(async (tx) => {
      await lockClinicAccountStructure(tx, clinicId);
      const clinic = await readDiscardClinic(tx, clinicId);
      if (!clinic) {
        return { ok: false, error: "This clinic was not found." };
      }
      if (!clinic.assistedOnboarding) {
        return { ok: false, error: DISCARD_NOT_ASSISTED_MESSAGE };
      }
      if (clinicHasCustomerActivity(clinic)) {
        return { ok: false, error: DISCARD_CUSTOMER_ACTIVITY_MESSAGE };
      }
      await tx.clinic.delete({ where: { id: clinicId } });
      return { ok: true };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2003" || error.code === "P2014")
    ) {
      return { ok: false, error: DISCARD_CUSTOMER_ACTIVITY_MESSAGE };
    }
    throw error;
  }
}
