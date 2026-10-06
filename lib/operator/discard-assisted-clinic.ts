import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import {
  brandingFromProfile,
  contactFromProfile,
  primaryClinicSiteData,
  rootClinicLocationData,
} from "@/lib/clinics/primary-site-location.mjs";
import { lockClinicAccountStructure } from "@/lib/entitlements/locks";
import { lockAccountSplit } from "@/lib/account-split/locks";
import {
  DISCARD_NOT_ASSISTED_MESSAGE,
  DISCARD_NOT_FOUND_MESSAGE,
  DISCARD_NOT_PRISTINE_MESSAGE,
} from "@/lib/operator/discard-assisted-clinic-messages";
import { getPrisma } from "@/lib/prisma";

export {
  DISCARD_NOT_ASSISTED_MESSAGE,
  DISCARD_NOT_FOUND_MESSAGE,
  DISCARD_NOT_PRISTINE_MESSAGE,
};

type DiscardReader = Prisma.TransactionClient | PrismaClient;

const discardSelect = {
  id: true,
  name: true,
  slug: true,
  assistedOnboarding: true,
  profile: true,
  memberships: { select: { id: true }, take: 1 },
  accountTokens: { select: { id: true }, take: 1 },
  entitlement: { select: { id: true } },
  complimentaryAccessEvents: { select: { id: true }, take: 1 },
  negotiatedOffers: { select: { id: true }, take: 1 },
  billingProfile: { select: { id: true } },
  legalAcceptances: { select: { id: true }, take: 1 },
  practiceGuides: { select: { id: true }, take: 1 },
  downgradePreparation: { select: { clinicId: true } },
  billingPriceChanges: { select: { id: true }, take: 1 },
  billingNoticeDeliveries: { select: { id: true }, take: 1 },
  sourceAccountSplits: { select: { id: true }, take: 1 },
  destinationAccountSplits: { select: { id: true }, take: 1 },
  sites: {
    select: {
      id: true,
      clinicId: true,
      name: true,
      slug: true,
      displayName: true,
      active: true,
      isPrimary: true,
      logoUrl: true,
      darkLogoUrl: true,
      faviconUrl: true,
      primaryColor: true,
      accentColor: true,
      darkPrimaryColor: true,
      darkAccentColor: true,
      useCustomDarkBranding: true,
      neutralColor: true,
      radiusPreset: true,
      typeface: true,
      instructionTerminology: true,
      themeMode: true,
      allowPatientThemeToggle: true,
      showCareGuideAttribution: true,
      serviceCategories: {
        select: { clinicId: true, clinicSiteId: true },
      },
      locations: {
        select: {
          clinicId: true,
          clinicSiteId: true,
          name: true,
          slug: true,
          displayName: true,
          phone: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          region: true,
          postalCode: true,
          country: true,
          contactUrl: true,
          contactEmail: true,
          bookingUrl: true,
          emergencyInstructions: true,
          isPrimary: true,
          servesSiteRoot: true,
          active: true,
          deactivatedAt: true,
          placements: { select: { id: true }, take: 1 },
        },
      },
      locationRedirectsFrom: { select: { id: true }, take: 1 },
      locationRedirectsTo: { select: { id: true }, take: 1 },
      keptByAccountSplits: { select: { id: true }, take: 1 },
    },
  },
} satisfies Prisma.ClinicSelect;

type DiscardClinic = Prisma.ClinicGetPayload<{ select: typeof discardSelect }>;

type DiscardSnapshot = {
  clinic: DiscardClinic;
  hasStripeEventReceipt: boolean;
};

export type DiscardAssistedClinicOptions = {
  /**
   * Test seam. Runs after both locks and before the eligibility re-read.
   * Production discard does not pass it.
   */
  afterLocks?: (tx: Prisma.TransactionClient) => Promise<void>;
  /**
   * Test seam. Runs after the pristine re-read and before delete, inside
   * the same transaction. Production discard does not pass it.
   */
  beforeDelete?: (tx: Prisma.TransactionClient) => Promise<void>;
  maxWaitMs?: number;
  timeoutMs?: number;
};

function recordMatches(
  actual: object,
  expected: Record<string, unknown>
): boolean {
  return Object.entries(expected).every(
    ([key, value]) => (actual as Record<string, unknown>)[key] === value
  );
}

function creationProfile(clinicName: string) {
  return { displayName: clinicName };
}

/**
 * The clinic is still the graph `createOperatorClinic` writes: one profile,
 * one primary site on the clinic slug, one root location, and the selected
 * categories, with no later commercial, customer, content, or branding edit.
 */
export function isPristineAssistedCreation(snapshot: DiscardSnapshot): boolean {
  const { clinic } = snapshot;
  if (!clinic.assistedOnboarding || !clinic.profile) {
    return false;
  }
  if (
    clinic.memberships.length > 0 ||
    clinic.accountTokens.length > 0 ||
    clinic.entitlement !== null ||
    clinic.complimentaryAccessEvents.length > 0 ||
    clinic.negotiatedOffers.length > 0 ||
    clinic.billingProfile !== null ||
    snapshot.hasStripeEventReceipt ||
    clinic.legalAcceptances.length > 0 ||
    clinic.practiceGuides.length > 0 ||
    clinic.downgradePreparation !== null ||
    clinic.billingPriceChanges.length > 0 ||
    clinic.billingNoticeDeliveries.length > 0 ||
    clinic.sourceAccountSplits.length > 0 ||
    clinic.destinationAccountSplits.length > 0
  ) {
    return false;
  }

  const profile = creationProfile(clinic.name);
  if (
    clinic.profile.displayName !== clinic.name ||
    !recordMatches(clinic.profile, brandingFromProfile(profile)) ||
    !recordMatches(clinic.profile, contactFromProfile(null))
  ) {
    return false;
  }

  if (clinic.sites.length !== 1) {
    return false;
  }
  const site = clinic.sites[0]!;
  if (
    !recordMatches(
      site,
      primaryClinicSiteData({
        clinicId: clinic.id,
        clinicName: clinic.name,
        slug: clinic.slug,
        profile,
      })
    ) ||
    site.serviceCategories.length < 1 ||
    site.serviceCategories.some(
      (category) =>
        category.clinicId !== clinic.id || category.clinicSiteId !== site.id
    ) ||
    site.locations.length !== 1 ||
    site.locationRedirectsFrom.length > 0 ||
    site.locationRedirectsTo.length > 0 ||
    site.keptByAccountSplits.length > 0
  ) {
    return false;
  }

  const location = site.locations[0]!;
  return (
    recordMatches(
      location,
      rootClinicLocationData({
        clinicId: clinic.id,
        clinicSiteId: site.id,
        clinicName: clinic.name,
        profile,
      })
    ) && location.placements.length === 0
  );
}

async function readDiscardSnapshot(
  db: DiscardReader,
  clinicId: string
): Promise<DiscardSnapshot | null> {
  const clinic = await db.clinic.findUnique({
    where: { id: clinicId },
    select: discardSelect,
  });
  if (!clinic) {
    return null;
  }
  const receipt = await db.stripeEventReceipt.findFirst({
    where: { clinicId },
    select: { id: true },
  });
  return { clinic, hasStripeEventReceipt: receipt !== null };
}

export async function canDiscardAssistedClinic(
  clinicId: string
): Promise<boolean> {
  const snapshot = await readDiscardSnapshot(getPrisma(), clinicId);
  return snapshot !== null && isPristineAssistedCreation(snapshot);
}

function refusal(
  snapshot: DiscardSnapshot | null
): { ok: false; error: string } | null {
  if (!snapshot) {
    return { ok: false, error: DISCARD_NOT_FOUND_MESSAGE };
  }
  if (!snapshot.clinic.assistedOnboarding) {
    return { ok: false, error: DISCARD_NOT_ASSISTED_MESSAGE };
  }
  if (!isPristineAssistedCreation(snapshot)) {
    return { ok: false, error: DISCARD_NOT_PRISTINE_MESSAGE };
  }
  return null;
}

/**
 * Deletes an assisted clinic only when it is still the untouched creation
 * graph. Structure is locked first, then this clinic's account-split lock,
 * matching split execution. The predicate is read again after both locks.
 *
 * A pristine clinic cannot become a split destination under the current
 * rules: `selectExistingGroupDestination` requires a Group entitlement, and
 * that selection locks this clinic's structure lock before its split lock.
 * New destination shells
 * are created with `assistedOnboarding` false. Source preparation inserts
 * take this same split lock and also require a Group account with more than
 * one site, or a Practice non-root location, so they cannot land on a
 * clinic that still passes the re-read.
 */
export async function discardAssistedClinic(
  clinicId: string,
  options: DiscardAssistedClinicOptions = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    return await getPrisma().$transaction(
      async (tx) => {
        await lockClinicAccountStructure(tx, clinicId);
        await lockAccountSplit(tx, clinicId);
        if (options.afterLocks) {
          await options.afterLocks(tx);
        }
        const snapshot = await readDiscardSnapshot(tx, clinicId);
        const blocked = refusal(snapshot);
        if (blocked) {
          return blocked;
        }
        if (options.beforeDelete) {
          await options.beforeDelete(tx);
        }
        await tx.clinic.delete({ where: { id: clinicId } });
        return { ok: true };
      },
      {
        maxWait: options.maxWaitMs ?? 10_000,
        timeout: options.timeoutMs ?? 15_000,
      }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2003" || error.code === "P2014")
    ) {
      return { ok: false, error: DISCARD_NOT_PRISTINE_MESSAGE };
    }
    throw error;
  }
}
