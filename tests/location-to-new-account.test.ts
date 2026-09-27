import "dotenv/config";
import { readFileSync } from "node:fs";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  default: () => ({
    auth: vi.fn(),
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: vi.fn(() => ({})),
}));

import {
  AccountTokenType,
  BillingStatus,
  EntitlementStatus,
  GuideRevisionStatus,
  GuideSectionKind,
  PracticeGuideStatus,
  PracticeSectionProvenance,
  type CommercialPlan,
} from "@prisma/client";

import { prepareAccountSplitBranding } from "@/lib/account-split/branding";
import {
  AccountSplitExecutionInterrupted,
  executeClinicAccountSplit,
} from "@/lib/account-split/execute";
import { locationMoveEligibility } from "@/lib/account-split/location-policy";
import {
  confirmLocationDestinationSiteSlug,
  createLocationToNewAccountPreparation,
  createSplitDestinationAccount,
  previewAccountSplit,
  revalidateAccountSplitPreparation,
  saveAccountSplitStaffSelections,
  saveLocationToNewAccountSelection,
} from "@/lib/account-split/preparation";
import { isOwnedClinicBrandingKey } from "@/lib/clinic-assets/clinic-logo";
import {
  getClinicAssetStorage,
  resetClinicAssetStorageCache,
} from "@/lib/clinic-assets/get-clinic-asset-storage";
import {
  memoryClinicAssetKeys,
  resetMemoryClinicAssetStorage,
} from "@/lib/clinic-assets/memory-clinic-asset-storage";
import {
  destinationPathForRetiredLocation,
  retiredLocationRequestFromPublicPath,
} from "@/lib/aftercare/patient-location-redirect";
import { getPatientLocation } from "@/lib/aftercare/get-patient-location";
import { getPublishedPracticeGuide } from "@/lib/aftercare/get-published-practice-guide";
import { assertLocationSlugAvailable } from "@/lib/clinics/slug-collisions";
import { getPrisma } from "@/lib/prisma";

const PREFIX = "ltn_";

function db() {
  return getPrisma();
}

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function cleanup() {
  const prisma = db();
  const preparations = await prisma.clinicAccountSplitPreparation.findMany({
    where: { sourceClinicId: { startsWith: PREFIX } },
    select: { destinationClinicId: true },
  });
  const destinationIds = preparations.flatMap((row) =>
    row.destinationClinicId ? [row.destinationClinicId] : []
  );
  const clinicIds = (
    await prisma.clinic.findMany({
      where: {
        OR: [
          { id: { startsWith: PREFIX } },
          { slug: { startsWith: "ltn-" } },
          { id: { in: destinationIds } },
        ],
      },
      select: { id: true },
    })
  ).map((row) => row.id);
  await prisma.clinicLocationRedirect.deleteMany({
    where: {
      OR: [
        { sourceClinicSite: { clinicId: { in: clinicIds } } },
        { destinationClinicSite: { clinicId: { in: clinicIds } } },
      ],
    },
  });
  await prisma.clinicAccountSplitPreparation.deleteMany({
    where: { sourceClinicId: { startsWith: PREFIX } },
  });
  if (clinicIds.length > 0) {
    await prisma.clinic.deleteMany({ where: { id: { in: clinicIds } } });
  }
  await prisma.guideTemplate.deleteMany({
    where: { slug: { startsWith: "ltn-" } },
  });
  await prisma.user.deleteMany({
    where: {
      OR: [{ id: { startsWith: PREFIX } }, { email: { startsWith: PREFIX } }],
    },
  });
}

async function seedPractice(
  key: string,
  options?: {
    plan?: CommercialPlan;
    purchased?: number | null;
    extraLocationAllowance?: number;
    movingActive?: boolean;
    movingPrimary?: boolean;
    siteActive?: boolean;
    rootActive?: boolean;
    extraStay?: boolean;
  }
) {
  const plan = options?.plan ?? "PRACTICE";
  const clinicId = `${PREFIX}${key}`;
  const operatorId = `${PREFIX}op_${key}`;
  const adminId = `${PREFIX}admin_${key}`;
  const staffId = `${PREFIX}staff_${key}`;
  const siteId = `${PREFIX}site_${key}`;
  const rootId = `${PREFIX}root_${key}`;
  const movingId = `${PREFIX}move_${key}`;
  const siteSlug = `ltn-src-${key}`.slice(0, 32);
  const movingSlug = `ltn-loc-${key}`.slice(0, 32);
  await db().user.createMany({
    data: [
      {
        id: operatorId,
        email: `${operatorId}@example.test`,
        name: "Operator",
        platformRole: "OPERATOR",
      },
      {
        id: adminId,
        email: `${adminId}@example.test`,
        name: "Ada Admin",
        platformRole: "NONE",
      },
      {
        id: staffId,
        email: `${staffId}@example.test`,
        name: "Sam Staff",
        platformRole: "NONE",
      },
    ],
  });
  await db().clinic.create({
    data: {
      id: clinicId,
      name: `Practice ${key}`,
      slug: siteSlug,
      profile: { create: { displayName: `Practice ${key}` } },
      memberships: {
        create: [
          { userId: adminId, role: "ADMIN" },
          { userId: staffId, role: "STAFF" },
        ],
      },
      entitlement: {
        create: {
          commercialPlan: plan,
          billingInterval: "MONTHLY",
          billingStatus: BillingStatus.ACTIVE,
          entitlementStatus: EntitlementStatus.ACTIVE,
          siteAllowance: 1,
          locationAllowance: 3,
          purchasedAdditionalLocationQuantity: options?.purchased ?? 1,
          extraLocationAllowance: options?.extraLocationAllowance ?? 2,
        },
      },
    },
  });
  await db().clinicSite.create({
    data: {
      id: siteId,
      clinicId,
      name: `Site ${key}`,
      slug: siteSlug,
      displayName: `Site ${key}`,
      active: options?.siteActive ?? true,
      isPrimary: true,
      logoUrl: null,
      darkLogoUrl: null,
      faviconUrl: null,
    },
  });
  await db().clinicLocation.create({
    data: {
      id: rootId,
      clinicSiteId: siteId,
      clinicId,
      name: "Root",
      slug: null,
      displayName: "Root",
      addressLine1: "1 Source Street",
      city: "Sydney",
      isPrimary: !(options?.movingPrimary ?? false),
      servesSiteRoot: true,
      active: options?.rootActive ?? true,
    },
  });
  await db().clinicLocation.create({
    data: {
      id: movingId,
      clinicSiteId: siteId,
      clinicId,
      name: "Bondi",
      slug: movingSlug,
      displayName: "Bondi",
      addressLine1: "10 Beach Road",
      city: "Sydney",
      isPrimary: options?.movingPrimary ?? false,
      servesSiteRoot: false,
      active: options?.movingActive ?? true,
    },
  });
  let stayingId: string | null = null;
  if (options?.extraStay) {
    stayingId = `${PREFIX}stay_${key}`;
    await db().clinicLocation.create({
      data: {
        id: stayingId,
        clinicSiteId: siteId,
        clinicId,
        name: "Manly",
        slug: `ltn-stay-${key}`.slice(0, 32),
        displayName: "Manly",
        isPrimary: false,
        servesSiteRoot: false,
        active: true,
      },
    });
  }
  return {
    clinicId,
    operatorId,
    adminId,
    staffId,
    siteId,
    siteSlug,
    rootId,
    movingId,
    movingSlug,
    stayingId,
    destinationSlug: `ltn-dst-${key}`.slice(0, 32),
  };
}

async function revisionOf(preparationId: string) {
  const row = await db().clinicAccountSplitPreparation.findUniqueOrThrow({
    where: { id: preparationId },
    select: { preparationRevision: true, status: true },
  });
  return row;
}

async function staffChoices(
  account: Awaited<ReturnType<typeof seedPractice>>,
  placement: "split" | "source" | "both" = "split"
) {
  const members = await db().clinicMembership.findMany({
    where: { clinicId: account.clinicId, active: true },
    select: { userId: true },
  });
  return members.map((member) => {
    const toDestination =
      placement !== "source" && member.userId === account.adminId;
    const keep =
      placement === "both"
        ? true
        : placement === "source"
          ? true
          : member.userId !== account.adminId;
    return {
      userId: member.userId,
      keepOnSource: keep,
      grantOnDestination: toDestination || placement === "both",
      destinationRole:
        member.userId === account.adminId
          ? ("ADMIN" as const)
          : ("STAFF" as const),
    };
  });
}

async function activateDestination(input: {
  clinicId: string;
  plan: "ESSENTIAL" | "PRACTICE";
  interval?: "MONTHLY" | "YEARLY";
  purchased?: number | null;
  billingStatus?: BillingStatus;
  cancelAtPeriodEnd?: boolean;
  scheduledCommercialPlan?: CommercialPlan | null;
}) {
  await db().clinicEntitlement.upsert({
    where: { clinicId: input.clinicId },
    create: {
      clinicId: input.clinicId,
      commercialPlan: input.plan,
      billingInterval: input.interval ?? "MONTHLY",
      billingStatus: input.billingStatus ?? BillingStatus.ACTIVE,
      entitlementStatus: EntitlementStatus.ACTIVE,
      siteAllowance: 1,
      locationAllowance: 1,
      purchasedAdditionalLocationQuantity:
        input.plan === "PRACTICE"
          ? input.purchased === undefined
            ? 0
            : input.purchased
          : null,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      scheduledCommercialPlan: input.scheduledCommercialPlan ?? null,
    },
    update: {
      commercialPlan: input.plan,
      billingInterval: input.interval ?? "MONTHLY",
      billingStatus: input.billingStatus ?? BillingStatus.ACTIVE,
      entitlementStatus: EntitlementStatus.ACTIVE,
      siteAllowance: 1,
      locationAllowance: 1,
      purchasedAdditionalLocationQuantity:
        input.plan === "PRACTICE"
          ? input.purchased === undefined
            ? 0
            : input.purchased
          : null,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      scheduledCommercialPlan: input.scheduledCommercialPlan ?? null,
    },
  });
}

async function openMove(
  account: Awaited<ReturnType<typeof seedPractice>>,
  options?: {
    plan?: "ESSENTIAL" | "PRACTICE";
    locationId?: string;
    siteId?: string;
  }
) {
  return createLocationToNewAccountPreparation({
    sourceClinicId: account.clinicId,
    sourceClinicSiteId: options?.siteId ?? account.siteId,
    sourceLocationId: options?.locationId ?? account.movingId,
    destinationPlan: options?.plan ?? "ESSENTIAL",
    destinationBillingInterval: "MONTHLY",
    operatorUserId: account.operatorId,
  });
}

async function prepareReady(
  account: Awaited<ReturnType<typeof seedPractice>>,
  options?: {
    plan?: "ESSENTIAL" | "PRACTICE";
    purchased?: number | null;
    staff?: "split" | "source" | "both";
    skipSlug?: boolean;
  }
) {
  const plan = options?.plan ?? "ESSENTIAL";
  const preparation = await openMove(account, { plan });
  if (!options?.skipSlug) {
    await confirmLocationDestinationSiteSlug({
      preparationId: preparation.id,
      destinationSiteSlug: account.destinationSlug,
    });
  }
  await saveAccountSplitStaffSelections({
    preparationId: preparation.id,
    selections: await staffChoices(account, options?.staff ?? "split"),
  });
  const shell = await createSplitDestinationAccount(preparation.id);
  await activateDestination({
    clinicId: shell.id,
    plan,
    purchased: options?.purchased,
  });
  await revalidateAccountSplitPreparation(preparation.id);
  return { preparationId: preparation.id, destinationId: shell.id };
}

async function executePrepared(
  input: Omit<
    Parameters<typeof executeClinicAccountSplit>[0],
    "reviewedRevision"
  > & { reviewedRevision?: number }
) {
  const reviewedRevision =
    input.reviewedRevision ??
    (
      await db().clinicAccountSplitPreparation.findUniqueOrThrow({
        where: { id: input.preparationId },
        select: { preparationRevision: true },
      })
    ).preparationRevision;
  return executeClinicAccountSplit({ ...input, reviewedRevision });
}

async function placeGuide(input: {
  clinicId: string;
  locationIds: string[];
  slug: string;
  title: string;
  enabled?: boolean;
  body?: string;
  guideTemplateId?: string;
  pinnedRevisionId?: string;
  sourceGuideTemplateId?: string;
  adaptedAt?: Date | null;
}) {
  const guide = await db().practiceGuide.create({
    data: {
      clinicId: input.clinicId,
      title: input.title,
      publicSlug: input.slug,
      status: PracticeGuideStatus.PUBLISHED,
      isEnabled: input.enabled ?? true,
      publishedAt: new Date("2026-09-01T00:00:00.000Z"),
      guideTemplateId: input.guideTemplateId,
      pinnedRevisionId: input.pinnedRevisionId,
      sourceGuideTemplateId: input.sourceGuideTemplateId,
      adaptedAt: input.adaptedAt,
      downgradeRetainedAt: new Date("2026-08-01T00:00:00.000Z"),
      downgradeRetentionUntil: new Date("2026-10-01T00:00:00.000Z"),
      contentRevisions: {
        create: {
          version: 1,
          status: GuideRevisionStatus.PUBLISHED,
          title: input.title,
          publishedAt: new Date("2026-09-01T00:00:00.000Z"),
          sections: {
            create: {
              key: "care",
              kind: GuideSectionKind.SITE_CARE,
              title: "Care",
              body: input.body ?? `${input.title} body`,
              sortOrder: 0,
              provenance: PracticeSectionProvenance.PRACTICE_CUSTOM,
            },
          },
        },
      },
    },
    include: { contentRevisions: true },
  });
  const placements = [];
  for (const locationId of input.locationIds) {
    placements.push(
      await db().practiceGuidePlacement.create({
        data: {
          clinicId: input.clinicId,
          locationId,
          practiceGuideId: guide.id,
          publishedPracticeGuideRevisionId: guide.contentRevisions[0]!.id,
          publicSlug: input.slug,
          isEnabled: input.enabled ?? true,
        },
      })
    );
  }
  return { guide, placements };
}

describe("location move eligibility", () => {
  const site = { id: "site", clinicId: "clinic", active: true };
  const root = { id: "root", active: true, servesSiteRoot: true };
  const moving = {
    id: "move",
    clinicId: "clinic",
    clinicSiteId: "site",
    active: true,
    servesSiteRoot: false,
    slug: "bondi",
  };

  it("accepts one active Practice non-root location", () => {
    expect(
      locationMoveEligibility({
        commercialPlan: "PRACTICE",
        sourceSite: site,
        location: moving,
        rootLocation: root,
      })
    ).toBeNull();
  });

  it("rejects a root, a null slug, an inactive location, and the wrong site", () => {
    expect(
      locationMoveEligibility({
        commercialPlan: "PRACTICE",
        sourceSite: site,
        location: { ...moving, servesSiteRoot: true, slug: null },
        rootLocation: root,
      })?.code
    ).toBe("location_is_root");
    expect(
      locationMoveEligibility({
        commercialPlan: "PRACTICE",
        sourceSite: site,
        location: { ...moving, slug: null },
        rootLocation: root,
      })?.code
    ).toBe("location_missing_slug");
    expect(
      locationMoveEligibility({
        commercialPlan: "PRACTICE",
        sourceSite: site,
        location: { ...moving, active: false },
        rootLocation: root,
      })?.code
    ).toBe("location_inactive");
    expect(
      locationMoveEligibility({
        commercialPlan: "PRACTICE",
        sourceSite: site,
        location: { ...moving, clinicSiteId: "other" },
        rootLocation: root,
      })?.code
    ).toBe("location_wrong_site");
  });

  it("rejects Essential and Group sources and a missing source root", () => {
    expect(
      locationMoveEligibility({
        commercialPlan: "ESSENTIAL",
        sourceSite: site,
        location: moving,
        rootLocation: root,
      })?.code
    ).toBe("source_plan_mismatch");
    expect(
      locationMoveEligibility({
        commercialPlan: "GROUP",
        sourceSite: site,
        location: moving,
        rootLocation: root,
      })?.code
    ).toBe("source_plan_mismatch");
    expect(
      locationMoveEligibility({
        commercialPlan: "PRACTICE",
        sourceSite: site,
        location: moving,
        rootLocation: { ...root, active: false },
      })?.code
    ).toBe("source_root_missing");
  });
});

describe("move location to new account", () => {
  beforeEach(async () => {
    resetMemoryClinicAssetStorage();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await db().$disconnect();
  });

  it("rejects ineligible sources before a preparation exists", async () => {
    const essential = await seedPractice("esssrc", { plan: "ESSENTIAL" });
    await expect(openMove(essential)).rejects.toThrow(/Essential/);
    const group = await seedPractice("grpsrc", { plan: "GROUP" });
    await expect(openMove(group)).rejects.toThrow(/Group/);
    const inactive = await seedPractice("inactive", { movingActive: false });
    await expect(openMove(inactive)).rejects.toThrow(/active location/);
    const rootless = await seedPractice("noroot", { rootActive: false });
    await expect(openMove(rootless)).rejects.toThrow(/root location/);
    const practice = await seedPractice("wrong");
    await expect(
      openMove(practice, { locationId: practice.rootId })
    ).rejects.toThrow(/root location/);
    const other = await seedPractice("other");
    await expect(
      openMove(practice, { locationId: other.movingId })
    ).rejects.toThrow(/not on the source/);
    await expect(
      createLocationToNewAccountPreparation({
        sourceClinicId: practice.clinicId,
        sourceClinicSiteId: practice.siteId,
        sourceLocationId: practice.movingId,
        destinationPlan: "GROUP",
        destinationBillingInterval: "MONTHLY",
        operatorUserId: practice.operatorId,
      })
    ).rejects.toThrow(/Essential or Practice/);
  });

  it("persists the operation and increments revision only when the review changes", async () => {
    const account = await seedPractice("prep");
    const second = `${PREFIX}move2_prep`;
    await db().clinicLocation.create({
      data: {
        id: second,
        clinicSiteId: account.siteId,
        clinicId: account.clinicId,
        name: "Paddington",
        slug: "ltn-pad-prep",
        displayName: "Paddington",
        servesSiteRoot: false,
        isPrimary: false,
        active: true,
      },
    });
    const created = await openMove(account);
    const row = await db().clinicAccountSplitPreparation.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.operationKind).toBe("LOCATION_TO_NEW_ACCOUNT");
    expect(row.sourceLocationId).toBe(account.movingId);
    expect(row.destinationSiteSlug).toBeNull();
    expect(row.keptClinicSiteId).toBe(account.siteId);
    expect(row.status).toBe("DRAFT");
    const before = await revisionOf(created.id);
    await saveLocationToNewAccountSelection({
      preparationId: created.id,
      sourceLocationId: account.movingId,
    });
    expect((await revisionOf(created.id)).preparationRevision).toBe(
      before.preparationRevision
    );
    await saveLocationToNewAccountSelection({
      preparationId: created.id,
      sourceLocationId: second,
    });
    expect((await revisionOf(created.id)).preparationRevision).toBe(
      before.preparationRevision + 1
    );
    await confirmLocationDestinationSiteSlug({
      preparationId: created.id,
      destinationSiteSlug: account.destinationSlug,
    });
    const confirmed = await revisionOf(created.id);
    await confirmLocationDestinationSiteSlug({
      preparationId: created.id,
      destinationSiteSlug: account.destinationSlug,
    });
    expect((await revisionOf(created.id)).preparationRevision).toBe(
      confirmed.preparationRevision
    );
    expect(
      await db().clinicSite.findUnique({
        where: { slug: account.destinationSlug },
      })
    ).toBeNull();
    await createSplitDestinationAccount(created.id);
    await db().clinicAccountSplitPreparation.update({
      where: { id: created.id },
      data: { operationKind: "SITE_TO_NEW_GROUP", status: "READY_TO_EXECUTE" },
    });
    await expect(
      executePrepared({
        preparationId: created.id,
        confirmation: `move ${account.destinationSlug}`,
        operatorUserId: account.operatorId,
      })
    ).rejects.toThrow(/not available/);
  });

  it("blocks destination billing that is not explicitly ready", async () => {
    const account = await seedPractice("bill");
    const ready = await prepareReady(account, { plan: "ESSENTIAL" });
    const preview = await previewAccountSplit(ready.preparationId);
    expect(preview?.status).toBe("READY_TO_EXECUTE");
    expect(preview?.blockers.map((blocker) => blocker.code)).not.toContain(
      "billing_not_ready"
    );

    const practice = await seedPractice("prn");
    const practiceReady = await prepareReady(practice, {
      plan: "PRACTICE",
      purchased: 0,
    });
    expect(
      (await previewAccountSplit(practiceReady.preparationId))?.status
    ).toBe("READY_TO_EXECUTE");

    const unprojected = await seedPractice("nulln");
    const nullReady = await prepareReady(unprojected, {
      plan: "PRACTICE",
      purchased: null,
    });
    const nullPreview = await previewAccountSplit(nullReady.preparationId);
    expect(nullPreview?.blockers.map((blocker) => blocker.code)).toContain(
      "destination_location_quantity_unprojected"
    );
    expect(nullPreview?.status).not.toBe("READY_TO_EXECUTE");

    const wrongPlan = await seedPractice("wplan");
    const wrong = await prepareReady(wrongPlan, { plan: "ESSENTIAL" });
    await activateDestination({
      clinicId: wrong.destinationId,
      plan: "PRACTICE",
      purchased: 0,
    });
    await revalidateAccountSplitPreparation(wrong.preparationId);
    expect(
      (await previewAccountSplit(wrong.preparationId))?.blockers.map(
        (blocker) => blocker.code
      )
    ).toContain("billing_not_ready");

    const wrongInterval = await seedPractice("wint");
    const interval = await prepareReady(wrongInterval);
    await activateDestination({
      clinicId: interval.destinationId,
      plan: "ESSENTIAL",
      interval: "YEARLY",
    });
    await revalidateAccountSplitPreparation(interval.preparationId);
    expect(
      (await previewAccountSplit(interval.preparationId))?.blockers.some(
        (blocker) => blocker.message.includes("interval")
      )
    ).toBe(true);

    const cancel = await seedPractice("cancel");
    const cancelling = await prepareReady(cancel);
    await activateDestination({
      clinicId: cancelling.destinationId,
      plan: "ESSENTIAL",
      cancelAtPeriodEnd: true,
    });
    await revalidateAccountSplitPreparation(cancelling.preparationId);
    expect(
      (await previewAccountSplit(cancelling.preparationId))?.blockers.some(
        (blocker) => blocker.message.includes("cancel")
      )
    ).toBe(true);

    const scheduled = await seedPractice("sched");
    const scheduling = await prepareReady(scheduled);
    await activateDestination({
      clinicId: scheduling.destinationId,
      plan: "ESSENTIAL",
      scheduledCommercialPlan: "PRACTICE",
    });
    await revalidateAccountSplitPreparation(scheduling.preparationId);
    expect(
      (await previewAccountSplit(scheduling.preparationId))?.blockers.some(
        (blocker) => blocker.message.includes("scheduled plan")
      )
    ).toBe(true);
  });

  it("promotes the same location onto a new site and keeps source capacity", async () => {
    const account = await seedPractice("move", {
      purchased: 1,
      extraLocationAllowance: 2,
      extraStay: true,
    });
    const placed = await placeGuide({
      clinicId: account.clinicId,
      locationIds: [account.movingId],
      slug: "extraction",
      title: "Extraction",
      body: "Visible rinse instructions",
    });
    await placeGuide({
      clinicId: account.clinicId,
      locationIds: [account.rootId],
      slug: "root-only",
      title: "Root only",
    });
    const before = await getPublishedPracticeGuide({
      clinicSlug: account.siteSlug,
      locationSlug: account.movingSlug,
      publicSlug: "extraction",
    });
    expect(before?.practiceGuide.id).toBe(placed.guide.id);
    const ready = await prepareReady(account);
    const stale = await executePrepared({
      preparationId: ready.preparationId,
      confirmation: `move ${account.destinationSlug}`,
      operatorUserId: account.operatorId,
      reviewedRevision: 0,
    }).catch((error: unknown) => error);
    expect(stale).toBeInstanceOf(Error);
    expect((stale as Error).message).toMatch(/Review it again/);
    expect(
      (
        await db().clinicAccountSplitEvent.findMany({
          where: {
            preparationId: ready.preparationId,
            kind: "STALE_REVISION_REFUSED",
          },
        })
      ).length
    ).toBe(1);

    const result = await executePrepared({
      preparationId: ready.preparationId,
      confirmation: `move ${account.destinationSlug}`,
      operatorUserId: account.operatorId,
    });
    expect(result.alreadyCompleted).toBe(false);
    const moved = await db().clinicLocation.findUniqueOrThrow({
      where: { id: account.movingId },
    });
    expect(moved.clinicId).toBe(ready.destinationId);
    expect(moved.slug).toBeNull();
    expect(moved.servesSiteRoot).toBe(true);
    expect(moved.isPrimary).toBe(true);
    const destinationSite = await db().clinicSite.findUniqueOrThrow({
      where: { slug: account.destinationSlug },
    });
    expect(destinationSite.clinicId).toBe(ready.destinationId);
    expect(destinationSite.isPrimary).toBe(true);
    expect(destinationSite.displayName).toBe("Bondi");
    expect(moved.clinicSiteId).toBe(destinationSite.id);
    const sourceRoot = await db().clinicLocation.findUniqueOrThrow({
      where: { id: account.rootId },
    });
    expect(sourceRoot.clinicId).toBe(account.clinicId);
    expect(sourceRoot.servesSiteRoot).toBe(true);
    expect(sourceRoot.slug).toBeNull();
    const staying = await db().clinicLocation.findUniqueOrThrow({
      where: { id: account.stayingId! },
    });
    expect(staying.clinicId).toBe(account.clinicId);
    expect(staying.active).toBe(true);
    const sourceEntitlement = await db().clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: account.clinicId },
    });
    expect(sourceEntitlement.purchasedAdditionalLocationQuantity).toBe(1);
    expect(sourceEntitlement.extraLocationAllowance).toBe(2);
    expect(sourceEntitlement.commercialPlan).toBe("PRACTICE");
    const sourceGuide = await db().practiceGuide.findUniqueOrThrow({
      where: { id: placed.guide.id },
    });
    expect(sourceGuide.clinicId).toBe(account.clinicId);
    const copies = await db().practiceGuide.findMany({
      where: { clinicId: ready.destinationId },
    });
    expect(copies).toHaveLength(1);
    expect(copies[0]?.copiedFromPracticeGuideId).toBeNull();
    expect(copies[0]?.publicSlug).toBe("extraction");
    expect(copies[0]?.downgradeRetainedAt).toBeNull();
    const placement = await db().practiceGuidePlacement.findUniqueOrThrow({
      where: { id: placed.placements[0]!.id },
    });
    expect(placement.clinicId).toBe(ready.destinationId);
    expect(placement.locationId).toBe(account.movingId);
    expect(placement.publicSlug).toBe("extraction");
    expect(placement.practiceGuideId).toBe(copies[0]?.id);
    expect(
      await getPublishedPracticeGuide({
        clinicSlug: account.siteSlug,
        locationSlug: account.movingSlug,
        publicSlug: "extraction",
      })
    ).toBeNull();
    expect(
      await getPatientLocation({
        siteSlug: account.siteSlug,
        locationSlug: account.movingSlug,
      })
    ).toBeNull();
    const destinationGuide = await getPublishedPracticeGuide({
      clinicSlug: account.destinationSlug,
      publicSlug: "extraction",
    });
    expect(destinationGuide?.practiceGuide.id).toBe(copies[0]?.id);
    expect(destinationGuide?.sections.map((section) => section.body)).toEqual([
      "Visible rinse instructions",
    ]);
    const redirect = await db().clinicLocationRedirect.findUniqueOrThrow({
      where: {
        sourceClinicSiteId_fromSlug: {
          sourceClinicSiteId: account.siteId,
          fromSlug: account.movingSlug,
        },
      },
    });
    expect(redirect.destinationClinicSiteId).toBe(destinationSite.id);
    expect(
      retiredLocationRequestFromPublicPath(`/${account.movingSlug}/print`)
    ).toBeNull();
    expect(destinationPathForRetiredLocation({ kind: "landing" })).toBe("/");
    expect(
      destinationPathForRetiredLocation({
        kind: "guide",
        guideSlug: "extraction",
      })
    ).toBe("/extraction");
    expect(
      destinationPathForRetiredLocation({
        kind: "guide-print",
        guideSlug: "extraction",
      })
    ).toBe("/extraction/print");
    await expect(
      assertLocationSlugAvailable(db(), {
        clinicId: account.clinicId,
        clinicSiteId: account.siteId,
        slug: account.movingSlug,
      })
    ).rejects.toThrow(/retired|reserved|address/i);
    const retry = await executePrepared({
      preparationId: ready.preparationId,
      confirmation: `move ${account.destinationSlug}`,
      operatorUserId: account.operatorId,
    });
    expect(retry.alreadyCompleted).toBe(true);
    expect(
      await db().clinicSite.count({ where: { clinicId: ready.destinationId } })
    ).toBe(1);
    expect(
      await db().clinicLocationRedirect.count({
        where: { sourceClinicSiteId: account.siteId },
      })
    ).toBe(1);
    const events = await db().clinicAccountSplitEvent.findMany({
      where: { preparationId: ready.preparationId },
      select: { kind: true },
    });
    const kinds = events.map((event) => event.kind);
    expect(kinds).toContain("CUTOVER_STARTED");
    expect(kinds).toContain("CUTOVER_COMPLETED");
    expect(kinds).toContain("COMPLETED_RETRY");
    expect(kinds).toContain("STALE_REVISION_REFUSED");
  });

  it("makes the source root primary when the departing location was primary", async () => {
    const account = await seedPractice("primary", { movingPrimary: true });
    const ready = await prepareReady(account);
    await executePrepared({
      preparationId: ready.preparationId,
      confirmation: `move ${account.destinationSlug}`,
      operatorUserId: account.operatorId,
    });
    const root = await db().clinicLocation.findUniqueOrThrow({
      where: { id: account.rootId },
    });
    const moved = await db().clinicLocation.findUniqueOrThrow({
      where: { id: account.movingId },
    });
    expect(root.isPrimary).toBe(true);
    expect(root.clinicId).toBe(account.clinicId);
    expect(moved.isPrimary).toBe(true);
    expect(moved.clinicSiteId).not.toBe(account.siteId);
    expect(
      await db().clinicLocation.count({
        where: { clinicSiteId: account.siteId, isPrimary: true },
      })
    ).toBe(1);
  });

  it("copies only guides placed on the moving location", async () => {
    const account = await seedPractice("guides");
    const template = await db().guideTemplate.create({
      data: {
        specialty: "DENTAL",
        slug: "ltn-template-guides",
        title: "Cleaning",
        revisions: {
          create: {
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            publishedAt: new Date("2026-09-01T00:00:00.000Z"),
          },
        },
      },
      include: { revisions: true },
    });
    const pinned = await placeGuide({
      clinicId: account.clinicId,
      locationIds: [account.movingId],
      slug: "cleaning",
      title: "Cleaning",
      guideTemplateId: template.id,
      pinnedRevisionId: template.revisions[0]!.id,
    });
    const adaptedTemplate = await db().guideTemplate.create({
      data: {
        specialty: "DENTAL",
        slug: "ltn-adapted-guides",
        title: "Adapted source",
      },
    });
    const adapted = await placeGuide({
      clinicId: account.clinicId,
      locationIds: [account.movingId],
      slug: "adapted-care",
      title: "Adapted",
      sourceGuideTemplateId: adaptedTemplate.id,
      adaptedAt: new Date("2026-07-01T00:00:00.000Z"),
    });
    const shared = await placeGuide({
      clinicId: account.clinicId,
      locationIds: [account.movingId, account.rootId],
      slug: "shared-care",
      title: "Shared",
    });
    const disabled = await placeGuide({
      clinicId: account.clinicId,
      locationIds: [account.movingId],
      slug: "disabled-care",
      title: "Disabled",
      enabled: false,
    });
    const unrelated = await placeGuide({
      clinicId: account.clinicId,
      locationIds: [account.rootId],
      slug: "unrelated",
      title: "Unrelated",
    });
    const ready = await prepareReady(account, {
      plan: "PRACTICE",
      purchased: 0,
    });
    await executePrepared({
      preparationId: ready.preparationId,
      confirmation: `move ${account.destinationSlug}`,
      operatorUserId: account.operatorId,
    });
    const copies = await db().practiceGuide.findMany({
      where: { clinicId: ready.destinationId },
      orderBy: { publicSlug: "asc" },
    });
    expect(copies.map((guide) => guide.publicSlug).sort()).toEqual([
      "adapted-care",
      "cleaning",
      "disabled-care",
      "shared-care",
    ]);
    const pinnedCopy = copies.find((guide) => guide.publicSlug === "cleaning");
    expect(pinnedCopy?.guideTemplateId).toBe(template.id);
    expect(pinnedCopy?.pinnedRevisionId).toBe(template.revisions[0]!.id);
    const adaptedCopy = copies.find(
      (guide) => guide.publicSlug === "adapted-care"
    );
    expect(adaptedCopy?.sourceGuideTemplateId).toBe(adaptedTemplate.id);
    expect(adaptedCopy?.adaptedAt).toEqual(
      new Date("2026-07-01T00:00:00.000Z")
    );
    expect(adaptedCopy?.guideTemplateId).toBeNull();
    expect(
      (
        await db().practiceGuide.findUniqueOrThrow({
          where: { id: shared.guide.id },
        })
      ).clinicId
    ).toBe(account.clinicId);
    expect(
      await db().practiceGuidePlacement.findFirst({
        where: { practiceGuideId: shared.guide.id, locationId: account.rootId },
      })
    ).not.toBeNull();
    const disabledPlacement =
      await db().practiceGuidePlacement.findUniqueOrThrow({
        where: { id: disabled.placements[0]!.id },
      });
    expect(disabledPlacement.isEnabled).toBe(false);
    expect(disabledPlacement.clinicId).toBe(ready.destinationId);
    expect(
      (
        await db().practiceGuide.findUniqueOrThrow({
          where: { id: unrelated.guide.id },
        })
      ).clinicId
    ).toBe(account.clinicId);
    expect(
      await db().practiceGuide.findFirst({
        where: { clinicId: ready.destinationId, publicSlug: "unrelated" },
      })
    ).toBeNull();
    expect(pinned.guide.id).not.toBe(pinnedCopy?.id);
    const copiedSection = await db().practiceGuideRevision.findFirstOrThrow({
      where: { practiceGuideId: adaptedCopy!.id, status: "PUBLISHED" },
      include: { sections: true },
    });
    expect(copiedSection.sections[0]?.body).toBe("Adapted body");
  });

  it("blocks Essential and Practice guide capacity without dropping guides", async () => {
    const essential = await seedPractice("capess");
    await db().practiceGuide.createMany({
      data: [0, 1, 2].map((index) => ({
        id: `${PREFIX}essg${index}`,
        clinicId: essential.clinicId,
        title: `Custom ${index}`,
        publicSlug: `custom-${index}`,
        status: PracticeGuideStatus.DRAFT,
        isEnabled: true,
      })),
    });
    await db().practiceGuidePlacement.createMany({
      data: [0, 1, 2].map((index) => ({
        clinicId: essential.clinicId,
        locationId: essential.movingId,
        practiceGuideId: `${PREFIX}essg${index}`,
        publicSlug: `custom-${index}`,
        isEnabled: true,
      })),
    });
    const essentialReady = await prepareReady(essential);
    const essentialPreview = await previewAccountSplit(
      essentialReady.preparationId
    );
    expect(essentialPreview?.blockers.map((blocker) => blocker.code)).toContain(
      "destination_custom_guide_allowance"
    );
    expect(
      await db().practiceGuide.count({
        where: { clinicId: essential.clinicId },
      })
    ).toBe(3);

    const practice = await seedPractice("capprac");
    await db().practiceGuide.createMany({
      data: Array.from({ length: 31 }, (_, index) => ({
        id: `${PREFIX}prg${index}`,
        clinicId: practice.clinicId,
        title: `Practice ${index}`,
        publicSlug: `practice-${index}`,
        status: PracticeGuideStatus.DRAFT,
        isEnabled: false,
      })),
    });
    await db().practiceGuidePlacement.createMany({
      data: Array.from({ length: 31 }, (_, index) => ({
        clinicId: practice.clinicId,
        locationId: practice.movingId,
        practiceGuideId: `${PREFIX}prg${index}`,
        publicSlug: `practice-${index}`,
        isEnabled: false,
      })),
    });
    const practiceReady = await prepareReady(practice, {
      plan: "PRACTICE",
      purchased: 0,
    });
    expect(
      (await previewAccountSplit(practiceReady.preparationId))?.blockers.map(
        (blocker) => blocker.code
      )
    ).toContain("destination_custom_guide_allowance");
  });

  it("copies source branding onto destination-owned keys and goes stale when the source changes", async () => {
    const account = await seedPractice("brand");
    const sourceKey = `clinics/${account.clinicId}/branding/site.png`;
    await db().clinicSite.update({
      where: { id: account.siteId },
      data: {
        logoUrl: sourceKey,
        darkLogoUrl: null,
        faviconUrl: "/static/icon.svg",
      },
    });
    process.env.CLINIC_ASSET_STORAGE_DRIVER = "memory";
    resetClinicAssetStorageCache();
    const storage = getClinicAssetStorage();
    if (!storage) {
      throw new Error("Memory branding storage is required.");
    }
    await storage.uploadLogo({
      clinicId: account.clinicId,
      storageKey: sourceKey,
      bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
      mimeType: "image/png",
    });
    const ready = await prepareReady(account);
    await prepareAccountSplitBranding({
      preparationId: ready.preparationId,
      operatorUserId: account.operatorId,
      storage,
    });
    await revalidateAccountSplitPreparation(ready.preparationId);
    expect((await previewAccountSplit(ready.preparationId))?.status).toBe(
      "READY_TO_EXECUTE"
    );
    await db().clinicSite.update({
      where: { id: account.siteId },
      data: { logoUrl: `clinics/${account.clinicId}/branding/changed.png` },
    });
    await revalidateAccountSplitPreparation(ready.preparationId);
    expect(
      (await previewAccountSplit(ready.preparationId))?.blockers.map(
        (blocker) => blocker.code
      )
    ).toContain("branding_assets_not_ready");
    await db().clinicSite.update({
      where: { id: account.siteId },
      data: { logoUrl: sourceKey },
    });
    await revalidateAccountSplitPreparation(ready.preparationId);
    await executePrepared({
      preparationId: ready.preparationId,
      confirmation: `move ${account.destinationSlug}`,
      operatorUserId: account.operatorId,
    });
    const destinationSite = await db().clinicSite.findUniqueOrThrow({
      where: { slug: account.destinationSlug },
    });
    expect(destinationSite.logoUrl).not.toBe(sourceKey);
    expect(
      isOwnedClinicBrandingKey(
        ready.destinationId,
        destinationSite.logoUrl ?? ""
      )
    ).toBe(true);
    expect(destinationSite.faviconUrl).toBe("/static/icon.svg");
    expect(destinationSite.darkLogoUrl).toBeNull();
    expect(memoryClinicAssetKeys()).toContain(sourceKey);
    const cutover = readFileSync(
      "lib/account-split/location-execute.ts",
      "utf8"
    );
    expect(cutover).not.toMatch(/stripe/i);
    expect(cutover).not.toContain("getClinicAssetStorage");
    expect(cutover).not.toContain("fetch(");
  });

  it("keeps staff exclusive and ignores operators and pending invitations", async () => {
    const account = await seedPractice("staff");
    await db().clinicMembership.create({
      data: {
        clinicId: account.clinicId,
        userId: account.operatorId,
        role: "ADMIN",
      },
    });
    const invited = await db().user.create({
      data: {
        id: `${PREFIX}invite_staff`,
        email: `${PREFIX}invite_staff@example.test`,
        name: "Pending",
      },
    });
    await db().accountToken.create({
      data: {
        type: AccountTokenType.INVITATION,
        userId: invited.id,
        clinicId: account.clinicId,
        role: "STAFF",
        email: invited.email,
        tokenHash: `${PREFIX}invite_hash_staff`,
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      },
    });
    const ready = await prepareReady(account, { staff: "source" });
    const missingAdmin = await previewAccountSplit(ready.preparationId);
    expect(missingAdmin?.blockers.map((blocker) => blocker.code)).toContain(
      "destination_admin_required"
    );
    expect(missingAdmin?.warnings.map((warning) => warning.code)).toContain(
      "outstanding_source_invitations"
    );
    await saveAccountSplitStaffSelections({
      preparationId: ready.preparationId,
      selections: (await staffChoices(account, "both")).map((selection) =>
        selection.userId === account.operatorId
          ? { ...selection, keepOnSource: false, grantOnDestination: true }
          : selection
      ),
    });
    await revalidateAccountSplitPreparation(ready.preparationId);
    expect(
      (await previewAccountSplit(ready.preparationId))?.blockers.map(
        (blocker) => blocker.code
      )
    ).toContain("dual_membership");
    await expect(
      executePrepared({
        preparationId: ready.preparationId,
        confirmation: `move ${account.destinationSlug}`,
        operatorUserId: account.operatorId,
      })
    ).rejects.toThrow(/not ready to execute/);
    expect(
      (
        await db().clinicMembership.findUniqueOrThrow({
          where: {
            clinicId_userId: {
              clinicId: account.clinicId,
              userId: account.adminId,
            },
          },
        })
      ).active
    ).toBe(true);
    await saveAccountSplitStaffSelections({
      preparationId: ready.preparationId,
      selections: (await staffChoices(account, "split")).map((selection) =>
        selection.userId === account.operatorId
          ? {
              ...selection,
              keepOnSource: false,
              grantOnDestination: true,
              destinationRole: "ADMIN" as const,
            }
          : selection
      ),
    });
    await db().clinicMembership.create({
      data: {
        clinicId: ready.destinationId,
        userId: account.adminId,
        role: "STAFF",
        active: false,
      },
    });
    await revalidateAccountSplitPreparation(ready.preparationId);
    await executePrepared({
      preparationId: ready.preparationId,
      confirmation: `move ${account.destinationSlug}`,
      operatorUserId: account.operatorId,
    });
    expect(
      await db().clinicMembership.findUnique({
        where: {
          clinicId_userId: {
            clinicId: account.clinicId,
            userId: account.staffId,
          },
        },
      })
    ).toMatchObject({ active: true });
    expect(
      await db().clinicMembership.findUnique({
        where: {
          clinicId_userId: {
            clinicId: ready.destinationId,
            userId: account.adminId,
          },
        },
      })
    ).toMatchObject({ role: "ADMIN", active: true });
    expect(
      await db().clinicMembership.findUnique({
        where: {
          clinicId_userId: {
            clinicId: account.clinicId,
            userId: account.operatorId,
          },
        },
      })
    ).toMatchObject({ active: true });
    expect(
      await db().clinicMembership.findUnique({
        where: {
          clinicId_userId: {
            clinicId: ready.destinationId,
            userId: account.operatorId,
          },
        },
      })
    ).toBeNull();
    expect(
      await db().accountToken.findFirstOrThrow({
        where: { tokenHash: `${PREFIX}invite_hash_staff` },
      })
    ).toMatchObject({ clinicId: account.clinicId });
  });

  it("removes only the moved location downgrade selection", async () => {
    const blocked = await seedPractice("downblock");
    const blockedReady = await prepareReady(blocked);
    const downgrade = await db().clinicDowngradePreparation.create({
      data: {
        clinicId: blocked.clinicId,
        targetPlan: "ESSENTIAL",
        status: "AWAITING_SELECTION",
        locationSelections: {
          create: [
            { locationId: blocked.movingId },
            { locationId: blocked.rootId },
          ],
        },
      },
    });
    await revalidateAccountSplitPreparation(blockedReady.preparationId);
    expect(
      (await previewAccountSplit(blockedReady.preparationId))?.blockers.map(
        (blocker) => blocker.code
      )
    ).toContain("source_downgrade_preparation");
    await expect(
      executePrepared({
        preparationId: blockedReady.preparationId,
        confirmation: `move ${blocked.destinationSlug}`,
        operatorUserId: blocked.operatorId,
      })
    ).rejects.toThrow(/not ready to execute/);
    expect(
      await db().downgradeLocationSelection.count({
        where: { preparationId: downgrade.id },
      })
    ).toBe(2);
    expect(
      (
        await db().clinicLocation.findUniqueOrThrow({
          where: { id: blocked.movingId },
        })
      ).clinicId
    ).toBe(blocked.clinicId);

    const account = await seedPractice("downclean");
    const ready = await prepareReady(account);
    await executePrepared({
      preparationId: ready.preparationId,
      confirmation: `move ${account.destinationSlug}`,
      operatorUserId: account.operatorId,
      hooks: {
        observe: async (point) => {
          if (point !== "after_guide_copies") {
            return;
          }
          await db().clinicDowngradePreparation.create({
            data: {
              clinicId: account.clinicId,
              targetPlan: "ESSENTIAL",
              status: "SELECTION_CONFIRMED",
              locationSelections: {
                create: [
                  { locationId: account.movingId },
                  { locationId: account.rootId },
                ],
              },
            },
          });
        },
      },
    });
    const remaining = await db().downgradeLocationSelection.findMany({
      where: { locationId: { in: [account.movingId, account.rootId] } },
    });
    expect(remaining.map((row) => row.locationId)).toEqual([account.rootId]);
    expect(
      await db().clinicDowngradePreparation.findUnique({
        where: { clinicId: account.clinicId },
      })
    ).not.toBeNull();
  });

  it("rolls back when cutover is interrupted and does not duplicate a second execute", async () => {
    const points = [
      "after_guide_copies",
      "after_destination_site_creation",
      "after_location_promotion",
      "after_location_redirect",
    ] as const;
    for (const [index, point] of points.entries()) {
      const account = await seedPractice(`f${index}`);
      await placeGuide({
        clinicId: account.clinicId,
        locationIds: [account.movingId],
        slug: "extraction",
        title: "Extraction",
      });
      const ready = await prepareReady(account);
      await expect(
        executePrepared({
          preparationId: ready.preparationId,
          confirmation: `move ${account.destinationSlug}`,
          operatorUserId: account.operatorId,
          hooks: { interruptAfter: point },
        })
      ).rejects.toBeInstanceOf(AccountSplitExecutionInterrupted);
      const location = await db().clinicLocation.findUniqueOrThrow({
        where: { id: account.movingId },
      });
      expect(location.clinicId).toBe(account.clinicId);
      expect(location.slug).toBe(account.movingSlug);
      expect(location.servesSiteRoot).toBe(false);
      expect(
        await db().clinicSite.findUnique({
          where: { slug: account.destinationSlug },
        })
      ).toBeNull();
      expect(
        await db().clinicLocationRedirect.count({
          where: { sourceClinicSiteId: account.siteId },
        })
      ).toBe(0);
      expect(
        (
          await db().clinicAccountSplitPreparation.findUniqueOrThrow({
            where: { id: ready.preparationId },
          })
        ).status
      ).toBe("READY_TO_EXECUTE");
    }

    const account = await seedPractice("twice");
    const ready = await prepareReady(account);
    const release = deferred();
    const holding = deferred();
    const first = executePrepared({
      preparationId: ready.preparationId,
      confirmation: `move ${account.destinationSlug}`,
      operatorUserId: account.operatorId,
      hooks: {
        afterLocks: async () => {
          holding.resolve();
          await release.promise;
        },
      },
    });
    await holding.promise;
    const second = executePrepared({
      preparationId: ready.preparationId,
      confirmation: `move ${account.destinationSlug}`,
      operatorUserId: account.operatorId,
    });
    release.resolve();
    const results = await Promise.all([first, second]);
    expect(results.filter((result) => result.alreadyCompleted)).toHaveLength(1);
    expect(
      await db().clinicSite.count({ where: { clinicId: ready.destinationId } })
    ).toBe(1);
    expect(
      await db().clinicLocationRedirect.count({
        where: { sourceClinicSiteId: account.siteId },
      })
    ).toBe(1);
  });

  it("stops when the location, slug, or destination billing changes before cutover", async () => {
    const changed = await seedPractice("changed");
    const changedReady = await prepareReady(changed);
    await db().clinicLocation.update({
      where: { id: changed.movingId },
      data: { active: false },
    });
    await expect(
      executePrepared({
        preparationId: changedReady.preparationId,
        confirmation: `move ${changed.destinationSlug}`,
        operatorUserId: changed.operatorId,
      })
    ).rejects.toThrow();
    expect(
      (
        await db().clinicLocation.findUniqueOrThrow({
          where: { id: changed.movingId },
        })
      ).clinicId
    ).toBe(changed.clinicId);

    const taken = await seedPractice("taken");
    const takenReady = await prepareReady(taken);
    await db().clinicSite.create({
      data: {
        clinicId: taken.clinicId,
        name: "Taken",
        slug: taken.destinationSlug,
        displayName: "Taken",
        active: false,
        isPrimary: false,
      },
    });
    await expect(
      executePrepared({
        preparationId: takenReady.preparationId,
        confirmation: `move ${taken.destinationSlug}`,
        operatorUserId: taken.operatorId,
      })
    ).rejects.toThrow(/already in use/);
    expect(
      (
        await db().clinicAccountSplitPreparation.findUniqueOrThrow({
          where: { id: takenReady.preparationId },
        })
      ).status
    ).not.toBe("COMPLETED");

    const billing = await seedPractice("dbill");
    const billingReady = await prepareReady(billing);
    await db().clinicEntitlement.update({
      where: { clinicId: billingReady.destinationId },
      data: { billingStatus: BillingStatus.PAST_DUE },
    });
    await expect(
      executePrepared({
        preparationId: billingReady.preparationId,
        confirmation: `move ${billing.destinationSlug}`,
        operatorUserId: billing.operatorId,
      })
    ).rejects.toThrow(/billing/i);
    expect(
      (
        await db().clinicLocation.findUniqueOrThrow({
          where: { id: billing.movingId },
        })
      ).slug
    ).toBe(billing.movingSlug);
  });

  it("does not treat an existing account as a new destination shell", async () => {
    const account = await seedPractice("exist");
    const ready = await prepareReady(account);
    await db().clinic.update({
      where: { id: ready.destinationId },
      data: { slug: "ltn-existing-account" },
    });
    await revalidateAccountSplitPreparation(ready.preparationId);
    expect(
      (await previewAccountSplit(ready.preparationId))?.blockers.map(
        (blocker) => blocker.code
      )
    ).toContain("destination_not_new_account");
    const source = await seedPractice("srcwarn");
    await db().clinicEntitlement.update({
      where: { clinicId: source.clinicId },
      data: { billingStatus: BillingStatus.PAST_DUE },
    });
    await db().clinicBillingProfile.create({
      data: {
        clinicId: source.clinicId,
        stripeSubscriptionScheduleId: "sched_ltn_srcwarn",
      },
    });
    const warningReady = await prepareReady(source);
    const preview = await previewAccountSplit(warningReady.preparationId);
    expect(preview?.warnings.map((warning) => warning.code)).toContain(
      "source_past_due"
    );
    expect(preview?.warnings.map((warning) => warning.code)).toContain(
      "source_capacity_not_reduced"
    );
    expect(preview?.blockers.map((blocker) => blocker.code)).toContain(
      "source_subscription_schedule"
    );
    expect(preview?.status).not.toBe("READY_TO_EXECUTE");
  });
});
