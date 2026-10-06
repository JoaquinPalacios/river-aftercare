import "server-only";

import {
  BillingStatus,
  NegotiatedOfferStatus,
  PlatformRole,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { isDemoTenant } from "@/lib/aftercare/demo-tenant";
import { lockAccountSplits } from "@/lib/account-split/locks";
import type { ClinicAssetStorage } from "@/lib/clinic-assets/clinic-asset-storage";
import {
  clinicLogoStorageKeyFromStoredValue,
  isOwnedClinicBrandingKey,
} from "@/lib/clinic-assets/clinic-logo";
import { getClinicAssetStorage } from "@/lib/clinic-assets/get-clinic-asset-storage";
import { lockClinicAccountStructures } from "@/lib/entitlements/locks";
import { lockTenantSlugs } from "@/lib/clinics/retired-tenant-slug";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { getPrisma } from "@/lib/prisma";

/**
 * Local seed id for the shared demonstration account.
 * Production identifies that account by the `demodental` site slug.
 */
const DESIGNATED_DEMO_CLINIC_ID = "clinic_demo_rivers";

const LIVE_SUBSCRIPTION_STATUSES: readonly BillingStatus[] = [
  BillingStatus.ACTIVE,
  BillingStatus.PAST_DUE,
  BillingStatus.UNPAID,
];

const OPEN_NEGOTIATED_STATUSES: readonly NegotiatedOfferStatus[] = [
  NegotiatedOfferStatus.PREPARED,
  NegotiatedOfferStatus.CHECKOUT_OPEN,
];

export const CLINIC_PERMANENTLY_DELETED_REACTIVATE_MESSAGE =
  "This clinic was permanently deleted and cannot be reactivated.";

export const PERMANENT_DELETION_MESSAGES = {
  missing: "That clinic could not be found.",
  active: "Deactivate the clinic before permanently deleting it.",
  already_deleted: "This clinic is already permanently deleted.",
  demo: "The shared demo clinic cannot be permanently deleted.",
  split_history:
    "This clinic has account-split history that must be retained, so it cannot be permanently deleted.",
  negotiated_offer:
    "Withdraw the open negotiated offer before permanently deleting this clinic.",
  checkout_session:
    "Finish or expire the Stripe Checkout session before permanently deleting this clinic.",
  subscription:
    "This clinic still has a live subscription. Settle it with the existing billing controls first.",
  cancel_at_period_end:
    "This clinic's subscription is set to cancel at the end of the period. Wait until it has ended.",
  subscription_schedule:
    "This clinic still has a subscription schedule. Remove it with the existing billing controls first.",
  commercial_transition:
    "A plan, capacity, or payment change is still in progress for this clinic.",
  price_change: "A price change is still scheduled for this clinic.",
  billing_notice:
    "A billing notice is still waiting to be sent for this clinic.",
  location_redirect:
    "A location redirect still uses one of this clinic's sites.",
  storage:
    "Branding files are stored for this clinic, and file storage is not configured.",
  confirmation:
    "Type the clinic name or tenant address to confirm permanent deletion.",
  operator: "Only a platform operator can permanently delete a clinic.",
  cleanup:
    "Clinic permanently deleted. Some branding files could not be removed. Retry branding cleanup.",
  deleted: "Clinic permanently deleted. The tenant address cannot be reused.",
} as const;

export type PermanentDeletionBlockerCode = Exclude<
  keyof typeof PERMANENT_DELETION_MESSAGES,
  "confirmation" | "operator" | "cleanup" | "deleted"
>;

export interface PermanentDeletionBlocker {
  code: PermanentDeletionBlockerCode;
  message: string;
}

export interface PermanentDeletionEligibility {
  eligible: boolean;
  blockers: PermanentDeletionBlocker[];
  name: string | null;
  slug: string | null;
}

export interface BrandingCleanupResult {
  deletedKeys: string[];
  failedKeys: string[];
  listFailed: boolean;
}

export type PermanentDeletionResult =
  | {
      ok: true;
      storageCleanup: BrandingCleanupResult;
    }
  | {
      ok: false;
      error: string;
      blockers: PermanentDeletionBlocker[];
    };

type Db = Prisma.TransactionClient | PrismaClient;

type StorageChoice = ClinicAssetStorage | null | undefined;

const clinicSelect = {
  id: true,
  name: true,
  slug: true,
  deactivatedAt: true,
  permanentlyDeletedAt: true,
  profile: {
    select: {
      displayName: true,
      logoUrl: true,
      darkLogoUrl: true,
      faviconUrl: true,
    },
  },
  sites: {
    select: {
      id: true,
      slug: true,
      logoUrl: true,
      darkLogoUrl: true,
      faviconUrl: true,
    },
  },
  entitlement: {
    select: {
      billingStatus: true,
      cancelAtPeriodEnd: true,
      scheduledCommercialPlan: true,
      scheduledPlanEffectiveAt: true,
      scheduledAdditionalSiteQuantity: true,
      scheduledCapacityEffectiveAt: true,
    },
  },
  billingProfile: {
    select: {
      stripeCheckoutSessionId: true,
      stripeSubscriptionScheduleId: true,
      stripePlanDowngradeAttemptId: true,
    },
  },
} as const;

type ClinicRow = Prisma.ClinicGetPayload<{ select: typeof clinicSelect }>;

function blocker(code: PermanentDeletionBlockerCode): PermanentDeletionBlocker {
  return { code, message: PERMANENT_DELETION_MESSAGES[code] };
}

function isDesignatedDemoClinic(clinic: {
  id: string;
  slug: string;
  sites: readonly { slug: string }[];
}): boolean {
  return (
    clinic.id === DESIGNATED_DEMO_CLINIC_ID ||
    isDemoTenant(clinic.slug) ||
    clinic.sites.some((site) => isDemoTenant(site.slug))
  );
}

export function confirmationMatchesClinic(
  clinic: { name: string; slug: string; sites?: readonly { slug: string }[] },
  confirmation: string
): boolean {
  const typed = confirmation.trim();
  if (typed.length === 0) {
    return false;
  }
  return (
    typed === clinic.name ||
    typed === clinic.slug ||
    (clinic.sites?.some((site) => site.slug === typed) ?? false)
  );
}

function ownedBrandingKeys(clinic: ClinicRow): string[] {
  const values = [
    clinic.profile?.logoUrl,
    clinic.profile?.darkLogoUrl,
    clinic.profile?.faviconUrl,
    ...clinic.sites.flatMap((site) => [
      site.logoUrl,
      site.darkLogoUrl,
      site.faviconUrl,
    ]),
  ];
  const keys = new Set<string>();
  for (const value of values) {
    const key = clinicLogoStorageKeyFromStoredValue(value);
    if (key && isOwnedClinicBrandingKey(clinic.id, key)) {
      keys.add(key);
    }
  }
  return [...keys];
}

function accountSplitInvolvementWhere(
  clinicId: string
): Prisma.ClinicAccountSplitPreparationWhereInput {
  const guideOwnedByClinic = {
    OR: [
      { sourcePracticeGuide: { clinicId } },
      { destinationPracticeGuide: { clinicId } },
      {
        revisions: {
          some: {
            OR: [
              { sourceRevision: { practiceGuide: { clinicId } } },
              { destinationRevision: { practiceGuide: { clinicId } } },
            ],
          },
        },
      },
    ],
  };
  return {
    OR: [
      { sourceClinicId: clinicId },
      { destinationClinicId: clinicId },
      { keptClinicSite: { clinicId } },
      { sourceLocation: { clinicId } },
      { siteDecisions: { some: { clinicSite: { clinicId } } } },
      {
        events: {
          some: {
            OR: [
              { sourceClinicId: clinicId },
              { destinationClinicId: clinicId },
            ],
          },
        },
      },
      { guideMaps: { some: guideOwnedByClinic } },
    ],
  };
}

function brandingKeyBelongsToClinic(
  clinicId: string,
  storageKey: string
): boolean {
  return (
    isOwnedClinicBrandingKey(clinicId, storageKey) && !storageKey.includes("..")
  );
}

function resolveStorage(storage: StorageChoice): ClinicAssetStorage | null {
  if (storage === undefined) {
    return getClinicAssetStorage();
  }
  return storage;
}

async function readEligibility(
  db: Db,
  clinicId: string,
  storage: ClinicAssetStorage | null
): Promise<{
  eligibility: PermanentDeletionEligibility;
  clinic: ClinicRow | null;
  ownedKeys: string[];
}> {
  const clinic = await db.clinic.findUnique({
    where: { id: clinicId },
    select: clinicSelect,
  });
  if (!clinic) {
    return {
      eligibility: {
        eligible: false,
        blockers: [blocker("missing")],
        name: null,
        slug: null,
      },
      clinic: null,
      ownedKeys: [],
    };
  }

  const blockers: PermanentDeletionBlocker[] = [];
  if (!clinic.deactivatedAt) {
    blockers.push(blocker("active"));
  }
  if (clinic.permanentlyDeletedAt) {
    blockers.push(blocker("already_deleted"));
  }
  if (isDesignatedDemoClinic(clinic)) {
    blockers.push(blocker("demo"));
  }

  const splitHistory = await db.clinicAccountSplitPreparation.findFirst({
    where: accountSplitInvolvementWhere(clinic.id),
    select: { id: true },
  });
  if (splitHistory) {
    blockers.push(blocker("split_history"));
  }

  const openOffer = await db.clinicNegotiatedOffer.findFirst({
    where: {
      clinicId: clinic.id,
      status: { in: [...OPEN_NEGOTIATED_STATUSES] },
    },
    select: { id: true },
  });
  if (openOffer) {
    blockers.push(blocker("negotiated_offer"));
  }

  if (clinic.billingProfile?.stripeCheckoutSessionId) {
    blockers.push(blocker("checkout_session"));
  }

  const billingStatus = clinic.entitlement?.billingStatus ?? null;
  if (billingStatus && LIVE_SUBSCRIPTION_STATUSES.includes(billingStatus)) {
    blockers.push(blocker("subscription"));
  }
  if (
    billingStatus === BillingStatus.CANCEL_AT_PERIOD_END ||
    clinic.entitlement?.cancelAtPeriodEnd
  ) {
    blockers.push(blocker("cancel_at_period_end"));
  }
  if (clinic.billingProfile?.stripeSubscriptionScheduleId) {
    blockers.push(blocker("subscription_schedule"));
  }
  if (
    billingStatus === BillingStatus.PAYMENT_PENDING ||
    clinic.billingProfile?.stripePlanDowngradeAttemptId ||
    clinic.entitlement?.scheduledCommercialPlan ||
    clinic.entitlement?.scheduledPlanEffectiveAt ||
    clinic.entitlement?.scheduledAdditionalSiteQuantity != null ||
    clinic.entitlement?.scheduledCapacityEffectiveAt
  ) {
    blockers.push(blocker("commercial_transition"));
  }

  const scheduledPrice = await db.billingPriceChange.findFirst({
    where: { clinicId: clinic.id, status: "SCHEDULED" },
    select: { id: true },
  });
  if (scheduledPrice) {
    blockers.push(blocker("price_change"));
  }

  const pendingNotice = await db.billingNoticeDelivery.findFirst({
    where: { clinicId: clinic.id, status: "PENDING" },
    select: { id: true },
  });
  if (pendingNotice) {
    blockers.push(blocker("billing_notice"));
  }

  const redirect = await db.clinicLocationRedirect.findFirst({
    where: {
      OR: [
        { sourceClinicSite: { clinicId: clinic.id } },
        { destinationClinicSite: { clinicId: clinic.id } },
      ],
    },
    select: { id: true },
  });
  if (redirect) {
    blockers.push(blocker("location_redirect"));
  }

  const ownedKeys = ownedBrandingKeys(clinic);
  if (ownedKeys.length > 0 && !storage) {
    blockers.push(blocker("storage"));
  }

  return {
    eligibility: {
      eligible: blockers.length === 0,
      blockers,
      name: clinic.name,
      slug: clinic.slug,
    },
    clinic,
    ownedKeys,
  };
}

export async function canPermanentlyDeleteClinic(
  clinicId: string,
  options: { db?: Db; storage?: StorageChoice } = {}
): Promise<PermanentDeletionEligibility> {
  const db = options.db ?? getPrisma();
  const storage = resolveStorage(options.storage);
  const read = await readEligibility(db, clinicId, storage);
  return read.eligibility;
}

async function relatedClinicIds(db: Db, clinicId: string): Promise<string[]> {
  const splits = await db.clinicAccountSplitPreparation.findMany({
    where: accountSplitInvolvementWhere(clinicId),
    select: {
      sourceClinicId: true,
      destinationClinicId: true,
      events: {
        select: { sourceClinicId: true, destinationClinicId: true },
      },
    },
  });
  const ids = new Set<string>([clinicId]);
  for (const split of splits) {
    ids.add(split.sourceClinicId);
    if (split.destinationClinicId) {
      ids.add(split.destinationClinicId);
    }
    for (const event of split.events) {
      ids.add(event.sourceClinicId);
      if (event.destinationClinicId) {
        ids.add(event.destinationClinicId);
      }
    }
  }
  return [...ids];
}

function refusal(
  eligibility: PermanentDeletionEligibility
): Extract<PermanentDeletionResult, { ok: false }> {
  return {
    ok: false,
    error:
      eligibility.blockers[0]?.message ?? PERMANENT_DELETION_MESSAGES.missing,
    blockers: eligibility.blockers,
  };
}

async function retireClinic(
  tx: Prisma.TransactionClient,
  clinic: ClinicRow,
  operatorUserId: string,
  now: Date
): Promise<void> {
  const slugs = new Set<string>([clinic.slug]);
  for (const site of clinic.sites) {
    slugs.add(site.slug);
  }
  const orderedSlugs = [...slugs].sort();
  await lockTenantSlugs(tx, orderedSlugs);
  for (const slug of orderedSlugs) {
    const siteOwner = await tx.clinicSite.findUnique({
      where: { slug },
      select: { clinicId: true },
    });
    if (siteOwner && siteOwner.clinicId !== clinic.id) {
      throw new ClinicPortalError(
        "This clinic's address changed during deletion. It was not deleted.",
        "conflict"
      );
    }
    const accountOwner = await tx.clinic.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (accountOwner && accountOwner.id !== clinic.id) {
      throw new ClinicPortalError(
        "This clinic's address changed during deletion. It was not deleted.",
        "conflict"
      );
    }
  }
  await tx.retiredTenantSlug.createMany({
    data: [...slugs].map((slug) => ({
      slug,
      formerClinicId: clinic.id,
      retiredAt: now,
    })),
  });

  await tx.accountToken.deleteMany({ where: { clinicId: clinic.id } });
  await tx.clinicMembership.deleteMany({ where: { clinicId: clinic.id } });
  await tx.clinicDowngradePreparation.deleteMany({
    where: { clinicId: clinic.id },
  });
  await tx.practiceGuide.updateMany({
    where: { copiedFromPracticeGuide: { clinicId: clinic.id } },
    data: { copiedFromPracticeGuideId: null },
  });
  await tx.practiceGuidePlacement.deleteMany({
    where: { clinicId: clinic.id },
  });
  await tx.practiceGuideHomeCareInstruction.deleteMany({
    where: {
      section: { revision: { practiceGuide: { clinicId: clinic.id } } },
    },
  });
  await tx.practiceGuideRevisionSection.deleteMany({
    where: { revision: { practiceGuide: { clinicId: clinic.id } } },
  });
  await tx.practiceGuideRevision.deleteMany({
    where: { practiceGuide: { clinicId: clinic.id } },
  });
  await tx.practiceGuideOverride.deleteMany({
    where: { practiceGuide: { clinicId: clinic.id } },
  });
  await tx.practiceGuideAddition.deleteMany({
    where: { practiceGuide: { clinicId: clinic.id } },
  });
  await tx.practiceGuide.deleteMany({ where: { clinicId: clinic.id } });
  await tx.clinicSiteServiceCategory.deleteMany({
    where: { clinicId: clinic.id },
  });
  await tx.clinicLocation.deleteMany({ where: { clinicId: clinic.id } });
  await tx.clinicSite.deleteMany({ where: { clinicId: clinic.id } });

  if (clinic.profile) {
    await tx.clinicProfile.update({
      where: { clinicId: clinic.id },
      data: {
        displayName: clinic.name,
        phone: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        region: null,
        postalCode: null,
        country: null,
        bookingUrl: null,
        contactUrl: null,
        contactEmail: null,
        emergencyInstructions: null,
        logoUrl: null,
        darkLogoUrl: null,
        faviconUrl: null,
        primaryColor: null,
        accentColor: null,
        darkPrimaryColor: null,
        darkAccentColor: null,
        neutralColor: null,
        useCustomDarkBranding: false,
        typeface: null,
        allowPatientThemeToggle: false,
        radiusPreset: "MEDIUM",
        themeMode: "SYSTEM",
        instructionTerminology: "AFTERCARE",
      },
    });
  }

  await tx.clinic.update({
    where: { id: clinic.id },
    data: {
      permanentlyDeletedAt: now,
      permanentlyDeletedByUserId: operatorUserId,
    },
  });
}

async function cleanupBranding(input: {
  clinicId: string;
  storage: ClinicAssetStorage | null;
  ownedKeys: readonly string[];
}): Promise<BrandingCleanupResult> {
  if (!input.storage) {
    return {
      deletedKeys: [],
      failedKeys: [...input.ownedKeys],
      listFailed: input.ownedKeys.length > 0,
    };
  }

  const keys = new Set(
    input.ownedKeys.filter((key) =>
      brandingKeyBelongsToClinic(input.clinicId, key)
    )
  );
  let listFailed = false;
  try {
    for (const key of await input.storage.listOwnedBrandingKeys(
      input.clinicId
    )) {
      if (brandingKeyBelongsToClinic(input.clinicId, key)) {
        keys.add(key);
      }
    }
  } catch {
    listFailed = true;
  }

  const deletedKeys: string[] = [];
  const failedKeys: string[] = [];
  for (const storageKey of keys) {
    if (!brandingKeyBelongsToClinic(input.clinicId, storageKey)) {
      continue;
    }
    try {
      await input.storage.deleteLogo({
        clinicId: input.clinicId,
        storageKey,
      });
      deletedKeys.push(storageKey);
    } catch {
      failedKeys.push(storageKey);
    }
  }
  return { deletedKeys, failedKeys, listFailed };
}

/**
 * Permanently retires one deactivated clinic.
 *
 * Lock order matches clinic deactivation and split destination selection:
 * 1. clinic-account-structure for this clinic and every split-history
 *    counterpart, sorted
 * 2. clinic-account-split for those same clinics, sorted
 * 3. re-read every eligibility condition
 * 4. lock tenant slugs, re-check that no other account owns them, tombstone,
 *    then remove operational rows
 *
 * Any account-split involvement, in any status, blocks retirement. Split
 * preparations, events, decisions, and guide or revision maps stay.
 *
 * Stripe is not called. Object storage runs only after the tombstone commits.
 */
export async function permanentlyDeleteClinic(input: {
  clinicId: string;
  operatorUserId: string;
  confirmation: string;
  now?: Date;
  storage?: StorageChoice;
  /**
   * Test seam. Runs after the structure and split locks, before the
   * eligibility re-read. Production deletion does not pass it.
   */
  afterLocks?: () => Promise<void> | void;
  /**
   * Test seam. Runs after tenant-slug locks and tombstone inserts, before
   * the transaction commits. Production deletion does not pass it.
   */
  afterSlugLocks?: () => Promise<void> | void;
}): Promise<PermanentDeletionResult> {
  const now = input.now ?? new Date();
  const storage = resolveStorage(input.storage);
  const outcome = await getPrisma().$transaction(
    async (tx) => {
      const related = await relatedClinicIds(tx, input.clinicId);
      await lockClinicAccountStructures(tx, related);
      await lockAccountSplits(tx, related);
      if (input.afterLocks) {
        await input.afterLocks();
      }

      const operator = await tx.user.findUnique({
        where: { id: input.operatorUserId },
        select: { platformRole: true },
      });
      if (operator?.platformRole !== PlatformRole.OPERATOR) {
        return {
          ok: false as const,
          error: PERMANENT_DELETION_MESSAGES.operator,
          blockers: [],
        };
      }

      const read = await readEligibility(tx, input.clinicId, storage);
      if (!read.eligibility.eligible || !read.clinic) {
        return refusal(read.eligibility);
      }
      if (!confirmationMatchesClinic(read.clinic, input.confirmation)) {
        return {
          ok: false as const,
          error: PERMANENT_DELETION_MESSAGES.confirmation,
          blockers: [],
        };
      }

      await retireClinic(tx, read.clinic, input.operatorUserId, now);
      if (input.afterSlugLocks) {
        await input.afterSlugLocks();
      }
      return {
        ok: true as const,
        clinicId: read.clinic.id,
        ownedKeys: read.ownedKeys,
      };
    },
    { maxWait: 10_000, timeout: 20_000 }
  );

  if (!outcome.ok) {
    return outcome;
  }

  const storageCleanup = await cleanupBranding({
    clinicId: outcome.clinicId,
    storage,
    ownedKeys: outcome.ownedKeys,
  });
  return { ok: true, storageCleanup };
}

export async function retryPermanentDeletionBrandingCleanup(input: {
  clinicId: string;
  operatorUserId: string;
  storage?: StorageChoice;
}): Promise<
  | { ok: true; storageCleanup: BrandingCleanupResult }
  | { ok: false; error: string }
> {
  const storage = resolveStorage(input.storage);
  const gate = await getPrisma().$transaction(async (tx) => {
    await lockClinicAccountStructures(tx, [input.clinicId]);
    const operator = await tx.user.findUnique({
      where: { id: input.operatorUserId },
      select: { platformRole: true },
    });
    if (operator?.platformRole !== PlatformRole.OPERATOR) {
      return {
        ok: false as const,
        error: PERMANENT_DELETION_MESSAGES.operator,
      };
    }
    const clinic = await tx.clinic.findUnique({
      where: { id: input.clinicId },
      select: { id: true, permanentlyDeletedAt: true },
    });
    if (!clinic) {
      return { ok: false as const, error: PERMANENT_DELETION_MESSAGES.missing };
    }
    if (!clinic.permanentlyDeletedAt) {
      return {
        ok: false as const,
        error: "Branding cleanup is only available after permanent deletion.",
      };
    }
    return { ok: true as const, clinicId: clinic.id };
  });
  if (!gate.ok) {
    return gate;
  }
  const storageCleanup = await cleanupBranding({
    clinicId: gate.clinicId,
    storage,
    ownedKeys: [],
  });
  return { ok: true, storageCleanup };
}

export function brandingCleanupNeedsRetry(
  cleanup: BrandingCleanupResult
): boolean {
  return cleanup.listFailed || cleanup.failedKeys.length > 0;
}
