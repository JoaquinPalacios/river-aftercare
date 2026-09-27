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
  type CommercialPlan,
} from "@prisma/client";

import { prepareAccountSplitBranding } from "@/lib/account-split/branding";
import {
  AccountSplitExecutionInterrupted,
  executeClinicAccountSplit,
  type AccountSplitExecutionInterrupt,
} from "@/lib/account-split/execute";
import {
  cancelAccountSplitPreparation,
  createSiteToExistingGroupPreparation,
  createSplitDestinationAccount,
  previewAccountSplit,
  revalidateAccountSplitPreparation,
  saveAccountSplitStaffSelections,
  saveCanonicalRetargetConfirmations,
  saveSiteToExistingGroupSelection,
  selectExistingGroupDestination,
} from "@/lib/account-split/preparation";
import { assessSiteToExistingGroup } from "@/lib/account-split/site-to-existing-group-policy";
import { allocateAccountGuideSlug } from "@/lib/account-split/site-to-existing-group-policy";
import { loadAccountSplitSnapshot } from "@/lib/account-split/snapshot";
import { effectiveSiteLocationAllowance } from "@/lib/clinics/site-location-allowance";
import {
  getClinicAssetStorage,
  resetClinicAssetStorageCache,
} from "@/lib/clinic-assets/get-clinic-asset-storage";
import { resetMemoryClinicAssetStorage } from "@/lib/clinic-assets/memory-clinic-asset-storage";
import { getPrisma } from "@/lib/prisma";

const PREFIX = "stg_";

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
  const clinics = await prisma.clinic.findMany({
    where: {
      OR: [{ id: { startsWith: PREFIX } }, { slug: { startsWith: "stg-" } }],
    },
    select: { id: true },
  });
  const clinicIds = clinics.map((row) => row.id);
  if (clinicIds.length > 0) {
    await prisma.clinicLocationRedirect.deleteMany({
      where: {
        OR: [
          { sourceClinicSite: { clinicId: { in: clinicIds } } },
          { destinationClinicSite: { clinicId: { in: clinicIds } } },
        ],
      },
    });
    await prisma.clinicAccountSplitPreparation.deleteMany({
      where: {
        OR: [
          { sourceClinicId: { in: clinicIds } },
          { destinationClinicId: { in: clinicIds } },
        ],
      },
    });
    await prisma.clinic.deleteMany({ where: { id: { in: clinicIds } } });
  }
  await prisma.guideTemplate.deleteMany({
    where: { slug: { startsWith: "stg-" } },
  });
  await prisma.user.deleteMany({
    where: {
      OR: [{ id: { startsWith: PREFIX } }, { email: { startsWith: PREFIX } }],
    },
  });
}

type SeedSite = {
  key: string;
  primary?: boolean;
  active?: boolean;
  locations?: number;
  inactiveLocations?: number;
};

async function seedGroup(
  key: string,
  options?: {
    plan?: CommercialPlan;
    purchased?: number | null;
    extraSite?: number;
    extraLocation?: number;
    siteAllowance?: number;
    locationAllowance?: number;
    billingStatus?: BillingStatus;
    entitlementStatus?: EntitlementStatus;
    cancelAtPeriodEnd?: boolean;
    offered?: number | null;
    scheduledQuantity?: number | null;
    scheduledAt?: Date | null;
    scheduledPlan?: CommercialPlan | null;
    sites?: SeedSite[];
    shellSlug?: boolean;
  }
) {
  const plan = options?.plan ?? "GROUP";
  const clinicId = `${PREFIX}${key}`;
  const operatorId = `${PREFIX}op_${key}`;
  const adminId = `${PREFIX}admin_${key}`;
  const staffId = `${PREFIX}staff_${key}`;
  const sites = options?.sites ?? [
    { key: "kept", primary: true },
    { key: "move" },
  ];
  const primary = sites.find((site) => site.primary) ?? sites[0]!;
  const primarySlug = `stg-${key}-${primary.key}`.slice(0, 48);
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
      name: `Group ${key}`,
      slug: options?.shellSlug
        ? `xsp${key
            .replace(/[^a-f0-9]/g, "")
            .padEnd(8, "a")
            .slice(0, 8)}`
        : primarySlug,
      profile: { create: { displayName: `Group ${key}` } },
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
          billingStatus: options?.billingStatus ?? BillingStatus.ACTIVE,
          entitlementStatus:
            options?.entitlementStatus ?? EntitlementStatus.ACTIVE,
          siteAllowance: options?.siteAllowance ?? 2,
          locationAllowance: options?.locationAllowance ?? 5,
          purchasedAdditionalSiteQuantity:
            options && "purchased" in options ? options.purchased : 0,
          extraSiteAllowance: options?.extraSite ?? 0,
          extraLocationAllowance: options?.extraLocation ?? 0,
          offeredAdditionalSiteQuantity: options?.offered ?? null,
          scheduledAdditionalSiteQuantity: options?.scheduledQuantity ?? null,
          scheduledCapacityEffectiveAt: options?.scheduledAt ?? null,
          scheduledCommercialPlan: options?.scheduledPlan ?? null,
          cancelAtPeriodEnd: options?.cancelAtPeriodEnd ?? false,
        },
      },
    },
  });
  const createdSites: Array<{ key: string; id: string; slug: string }> = [];
  for (const site of sites) {
    const siteId = `${PREFIX}${key}_${site.key}`;
    const slug = `stg-${key}-${site.key}`.slice(0, 48);
    await db().clinicSite.create({
      data: {
        id: siteId,
        clinicId,
        name: site.key,
        slug,
        displayName: site.key,
        active: site.active ?? true,
        isPrimary: Boolean(site.primary),
        primaryColor: "#112233",
      },
    });
    const locationTotal = site.locations ?? 1;
    for (let index = 0; index < locationTotal; index += 1) {
      const root = index === 0;
      await db().clinicLocation.create({
        data: {
          id: `${siteId}_loc_${index}`,
          clinicSiteId: siteId,
          clinicId,
          name: root ? "Root" : `Place ${index}`,
          slug: root ? null : `place-${index}`,
          displayName: root ? "Root" : `Place ${index}`,
          isPrimary: root,
          servesSiteRoot: root,
          active: true,
        },
      });
    }
    for (let index = 0; index < (site.inactiveLocations ?? 0); index += 1) {
      await db().clinicLocation.create({
        data: {
          id: `${siteId}_off_${index}`,
          clinicSiteId: siteId,
          clinicId,
          name: `Closed ${index}`,
          slug: `closed-${index}`,
          displayName: `Closed ${index}`,
          isPrimary: false,
          servesSiteRoot: false,
          active: false,
        },
      });
    }
    createdSites.push({ key: site.key, id: siteId, slug });
  }
  return {
    clinicId,
    operatorId,
    adminId,
    staffId,
    slug: options?.shellSlug
      ? `xsp${key
          .replace(/[^a-f0-9]/g, "")
          .padEnd(8, "a")
          .slice(0, 8)}`
      : primarySlug,
    sites: createdSites,
  };
}

function siteOf(account: Awaited<ReturnType<typeof seedGroup>>, key: string) {
  const site = account.sites.find((row) => row.key === key);
  if (!site) {
    throw new Error(`Missing site ${key}`);
  }
  return site;
}

async function blockers(preparationId: string) {
  const preview = await previewAccountSplit(preparationId);
  return preview?.blockers.map((blocker) => blocker.code) ?? [];
}

async function openMove(input: {
  source: Awaited<ReturnType<typeof seedGroup>>;
  destination?: Awaited<ReturnType<typeof seedGroup>>;
  movingKey?: string;
  keptKey?: string | null;
}) {
  const moving = siteOf(input.source, input.movingKey ?? "move");
  const movingRow = await db().clinicSite.findUniqueOrThrow({
    where: { id: moving.id },
    select: { isPrimary: true },
  });
  const kept = movingRow.isPrimary
    ? siteOf(input.source, input.keptKey ?? "kept")
    : null;
  const created = await createSiteToExistingGroupPreparation({
    sourceClinicId: input.source.clinicId,
    movingClinicSiteId: moving.id,
    keptClinicSiteId: kept?.id ?? null,
    operatorUserId: input.source.operatorId,
  });
  if (input.destination) {
    await selectExistingGroupDestination({
      preparationId: created.id,
      destinationClinicId: input.destination.clinicId,
    });
  }
  await revalidateAccountSplitPreparation(created.id);
  return created.id;
}

async function executeMove(preparationId: string, operatorUserId: string) {
  const row = await db().clinicAccountSplitPreparation.findUniqueOrThrow({
    where: { id: preparationId },
    select: { preparationRevision: true, expectedConfirmation: true },
  });
  return executeClinicAccountSplit({
    preparationId,
    confirmation: row.expectedConfirmation ?? "",
    operatorUserId,
    reviewedRevision: row.preparationRevision,
  });
}

async function placeGuide(input: {
  clinicId: string;
  locationId: string;
  slug: string;
  title: string;
  enabled?: boolean;
  guideId?: string;
  status?: PracticeGuideStatus;
  isEnabled?: boolean;
  guideTemplateId?: string | null;
  pinnedRevisionId?: string | null;
  sourceGuideTemplateId?: string | null;
  adaptedAt?: Date | null;
  downgradeRetainedAt?: Date | null;
  withRevision?: boolean;
  withOverride?: boolean;
  withAddition?: boolean;
}) {
  const guideId =
    input.guideId ??
    `${PREFIX}guide_${input.slug}_${input.locationId}`.slice(0, 80);
  await db().practiceGuide.create({
    data: {
      id: guideId,
      clinicId: input.clinicId,
      title: input.title,
      publicSlug: input.slug,
      status: input.status ?? PracticeGuideStatus.PUBLISHED,
      isEnabled: input.isEnabled ?? true,
      guideTemplateId: input.guideTemplateId ?? null,
      pinnedRevisionId: input.pinnedRevisionId ?? null,
      sourceGuideTemplateId: input.sourceGuideTemplateId ?? null,
      adaptedAt: input.adaptedAt ?? null,
      downgradeRetainedAt: input.downgradeRetainedAt ?? null,
      ...(input.withRevision
        ? {
            contentRevisions: {
              create: {
                version: 1,
                status: GuideRevisionStatus.PUBLISHED,
                title: input.title,
                publishedAt: new Date("2026-08-01T00:00:00.000Z"),
              },
            },
          }
        : {}),
      ...(input.withOverride
        ? {
            overrides: {
              create: {
                sectionKey: "intro",
                title: "Override",
                body: "Changed",
              },
            },
          }
        : {}),
      ...(input.withAddition
        ? {
            additions: {
              create: {
                key: "extra",
                kind: GuideSectionKind.INTRODUCTION,
                title: "Extra",
                body: "Added",
                sortOrder: 0,
              },
            },
          }
        : {}),
    },
  });
  const placement = await db().practiceGuidePlacement.create({
    data: {
      clinicId: input.clinicId,
      locationId: input.locationId,
      practiceGuideId: guideId,
      publicSlug: input.slug,
      isEnabled: input.enabled ?? true,
    },
    select: { id: true },
  });
  return { guideId, placementId: placement.id };
}

async function publishTemplate(slug: string) {
  const revisionId = `${PREFIX}rev_${slug}`.slice(0, 40);
  const template = await db().guideTemplate.create({
    data: {
      slug: `stg-${slug}`.slice(0, 48),
      title: slug,
      serviceCategory: "DENTAL",
      revisions: {
        create: {
          id: revisionId,
          version: 1,
          status: GuideRevisionStatus.PUBLISHED,
          publishedAt: new Date("2026-08-01T00:00:00.000Z"),
        },
      },
    },
  });
  return { templateId: template.id, revisionId };
}

describe("move site to existing group", () => {
  beforeEach(async () => {
    resetMemoryClinicAssetStorage();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await db().$disconnect();
  });

  it("accepts a Group source and rejects Essential, Practice, inactive, foreign, and the last active site", async () => {
    const source = await seedGroup("elig");
    const destination = await seedGroup("eligd", {
      sites: [{ key: "home", primary: true }],
    });
    const preparationId = await openMove({ source, destination });
    expect(await blockers(preparationId)).not.toContain("source_plan_mismatch");
    expect(
      (
        await db().clinicAccountSplitPreparation.findUniqueOrThrow({
          where: { id: preparationId },
        })
      ).operationKind
    ).toBe("SITE_TO_EXISTING_GROUP");

    const essential = await seedGroup("ess", { plan: "ESSENTIAL" });
    await expect(
      createSiteToExistingGroupPreparation({
        sourceClinicId: essential.clinicId,
        movingClinicSiteId: siteOf(essential, "move").id,
        operatorUserId: essential.operatorId,
      })
    ).rejects.toThrow(/Essential/);

    const practice = await seedGroup("prac", { plan: "PRACTICE" });
    await expect(
      createSiteToExistingGroupPreparation({
        sourceClinicId: practice.clinicId,
        movingClinicSiteId: siteOf(practice, "move").id,
        operatorUserId: practice.operatorId,
      })
    ).rejects.toThrow(/Practice/);

    const quiet = await seedGroup("quiet", {
      sites: [
        { key: "kept", primary: true },
        { key: "move", active: false },
      ],
    });
    await expect(
      createSiteToExistingGroupPreparation({
        sourceClinicId: quiet.clinicId,
        movingClinicSiteId: siteOf(quiet, "move").id,
        operatorUserId: quiet.operatorId,
      })
    ).rejects.toThrow(/active/);

    const only = await seedGroup("only", {
      sites: [
        { key: "kept", primary: true },
        { key: "move", active: false },
      ],
    });
    await expect(
      createSiteToExistingGroupPreparation({
        sourceClinicId: only.clinicId,
        movingClinicSiteId: siteOf(only, "kept").id,
        operatorUserId: only.operatorId,
      })
    ).rejects.toThrow(/at least one other active/);

    await expect(
      saveSiteToExistingGroupSelection({
        preparationId,
        movingClinicSiteId: siteOf(destination, "home").id,
      })
    ).rejects.toThrow(/belongs to this Account/);
  });

  it("rejects a destination that is Essential, Practice, the source, or a shell", async () => {
    const source = await seedGroup("dests");
    const essential = await seedGroup("deste", {
      plan: "ESSENTIAL",
      sites: [{ key: "home", primary: true }],
    });
    const practice = await seedGroup("destp", {
      plan: "PRACTICE",
      sites: [{ key: "home", primary: true }],
    });
    const shell = await seedGroup("destsh", {
      shellSlug: true,
      sites: [{ key: "home", primary: true }],
    });
    const preparationId = await openMove({ source });
    await expect(
      selectExistingGroupDestination({
        preparationId,
        destinationClinicId: essential.clinicId,
      })
    ).rejects.toThrow(/Essential/);
    await expect(
      selectExistingGroupDestination({
        preparationId,
        destinationClinicId: practice.clinicId,
      })
    ).rejects.toThrow(/Practice/);
    await expect(
      selectExistingGroupDestination({
        preparationId,
        destinationClinicId: source.clinicId,
      })
    ).rejects.toThrow(/different Group/);
    await expect(
      selectExistingGroupDestination({
        preparationId,
        destinationClinicId: shell.clinicId,
      })
    ).rejects.toThrow(/already exists/);
    await expect(createSplitDestinationAccount(preparationId)).rejects.toThrow(
      /does not create a destination Account/
    );
  });

  it("keeps the source primary when a non-primary site moves and requires an explicit kept site for a primary move", async () => {
    const source = await seedGroup("prim", {
      sites: [
        { key: "kept", primary: true },
        { key: "move" },
        { key: "other" },
      ],
    });
    const destination = await seedGroup("primd", {
      sites: [{ key: "home", primary: true, locations: 1 }],
    });
    const preparationId = await openMove({ source, destination });
    const before = await db().clinicAccountSplitPreparation.findUniqueOrThrow({
      where: { id: preparationId },
      select: { keptClinicSiteId: true, preparationRevision: true },
    });
    expect(before.keptClinicSiteId).toBe(siteOf(source, "kept").id);
    await saveSiteToExistingGroupSelection({
      preparationId,
      movingClinicSiteId: siteOf(source, "move").id,
      keptClinicSiteId: siteOf(source, "other").id,
    });
    const after = await db().clinicAccountSplitPreparation.findUniqueOrThrow({
      where: { id: preparationId },
      select: { keptClinicSiteId: true, preparationRevision: true },
    });
    expect(after.keptClinicSiteId).toBe(siteOf(source, "kept").id);
    expect(after.preparationRevision).toBe(before.preparationRevision);
    await cancelAccountSplitPreparation(preparationId);

    const primarySource = await seedGroup("prim2", {
      sites: [
        { key: "move", primary: true },
        { key: "kept" },
        { key: "other" },
      ],
    });
    await expect(
      createSiteToExistingGroupPreparation({
        sourceClinicId: primarySource.clinicId,
        movingClinicSiteId: siteOf(primarySource, "move").id,
        keptClinicSiteId: siteOf(primarySource, "move").id,
        operatorUserId: primarySource.operatorId,
      })
    ).rejects.toThrow(/become the source primary/);
    const primaryId = await openMove({
      source: primarySource,
      destination,
      movingKey: "move",
      keptKey: "kept",
    });
    const result = await executeMove(primaryId, primarySource.operatorId);
    expect(result.sourcePrimarySite.id).toBe(siteOf(primarySource, "kept").id);
    const moved = await db().clinicSite.findUniqueOrThrow({
      where: { id: siteOf(primarySource, "move").id },
    });
    expect(moved.clinicId).toBe(destination.clinicId);
    expect(moved.isPrimary).toBe(false);
    const destinationPrimary = await db().clinicSite.findFirstOrThrow({
      where: { clinicId: destination.clinicId, isPrimary: true },
    });
    expect(destinationPrimary.id).toBe(siteOf(destination, "home").id);
    expect(
      (
        await db().clinic.findUniqueOrThrow({
          where: { id: destination.clinicId },
        })
      ).slug
    ).toBe(destination.slug);
  });

  it("blocks a destination with no active primary and a forged second primary", async () => {
    const source = await seedGroup("noprim");
    const destination = await seedGroup("noprimd", {
      sites: [{ key: "home", primary: true }],
    });
    const preparationId = await openMove({ source, destination });
    await db().clinicSite.update({
      where: { id: siteOf(destination, "home").id },
      data: { isPrimary: false },
    });
    await revalidateAccountSplitPreparation(preparationId);
    expect(await blockers(preparationId)).toContain(
      "destination_primary_missing"
    );

    await db().clinicSite.update({
      where: { id: siteOf(destination, "home").id },
      data: { isPrimary: true },
    });
    await revalidateAccountSplitPreparation(preparationId);
    const snapshot = await loadAccountSplitSnapshot(preparationId);
    if (!snapshot) {
      throw new Error("Missing snapshot");
    }
    const home = snapshot.destinationDetail.sites[0];
    if (!home) {
      throw new Error("Missing destination site");
    }
    const assessed = assessSiteToExistingGroup({
      ...snapshot,
      destinationDetail: {
        ...snapshot.destinationDetail,
        sites: [home, { ...home, id: `${home.id}_copy` }],
      },
    });
    expect(assessed.blockers.map((blocker) => blocker.code)).toContain(
      "destination_primary_conflict"
    );
  });

  it("fits destination site and location capacity and ignores inactive locations, offered quantity, and scheduled quantity", async () => {
    const source = await seedGroup("cap");
    const exactSites = await seedGroup("caps", {
      sites: [{ key: "home", primary: true }],
    });
    const fitId = await openMove({ source, destination: exactSites });
    expect(await blockers(fitId)).not.toContain("destination_site_allowance");
    const preview = await previewAccountSplit(fitId);
    expect(preview?.existingGroup?.postMoveActiveSites).toBe(2);
    expect(preview?.existingGroup?.siteAllowance).toBe(2);
    expect(preview?.status).not.toBe("AWAITING_PAYMENT");

    const overSites = await seedGroup("capo", {
      purchased: 0,
      sites: [{ key: "home", primary: true }, { key: "second" }],
    });
    const overSource = await seedGroup("capos");
    const overId = await openMove({
      source: overSource,
      destination: overSites,
    });
    expect(await blockers(overId)).toContain("destination_site_allowance");

    const locationFit = await seedGroup("locf", {
      sites: [{ key: "home", primary: true, locations: 4 }],
    });
    const locationSource = await seedGroup("locfs");
    const locationFitId = await openMove({
      source: locationSource,
      destination: locationFit,
    });
    const locationPreview = await previewAccountSplit(locationFitId);
    expect(locationPreview?.existingGroup?.postMoveActiveLocations).toBe(5);
    expect(locationPreview?.existingGroup?.locationAllowance).toBe(5);
    expect(await blockers(locationFitId)).not.toContain(
      "destination_location_allowance"
    );

    const locationOver = await seedGroup("loco", {
      sites: [{ key: "home", primary: true, locations: 5 }],
    });
    const locationOverSource = await seedGroup("locos");
    expect(
      await blockers(
        await openMove({
          source: locationOverSource,
          destination: locationOver,
        })
      )
    ).toContain("destination_location_allowance");

    const inactive = await seedGroup("inact", {
      sites: [
        {
          key: "home",
          primary: true,
          locations: 1,
          inactiveLocations: 5,
        },
      ],
    });
    const inactiveSource = await seedGroup("inacts", {
      sites: [
        { key: "kept", primary: true },
        { key: "move", inactiveLocations: 4 },
      ],
    });
    const inactiveId = await openMove({
      source: inactiveSource,
      destination: inactive,
    });
    expect(await blockers(inactiveId)).not.toContain(
      "destination_location_allowance"
    );
    expect(
      (await previewAccountSplit(inactiveId))?.existingGroup
        ?.postMoveActiveLocations
    ).toBe(2);

    const projected = await seedGroup("proj", {
      purchased: 1,
      sites: [{ key: "home", primary: true }, { key: "second" }],
    });
    const projectedSource = await seedGroup("projs");
    const projectedPreview = await previewAccountSplit(
      await openMove({ source: projectedSource, destination: projected })
    );
    expect(projectedPreview?.existingGroup?.siteAllowance).toBe(3);
    expect(projectedPreview?.existingGroup?.locationAllowance).toBe(6);
    expect(
      projectedPreview?.blockers.map((blocker) => blocker.code)
    ).not.toContain("destination_site_allowance");

    const extras = await seedGroup("extra", {
      purchased: 0,
      extraSite: 1,
      extraLocation: 1,
      sites: [{ key: "home", primary: true }, { key: "second" }],
    });
    const extrasSource = await seedGroup("extras");
    const extrasPreview = await previewAccountSplit(
      await openMove({ source: extrasSource, destination: extras })
    );
    expect(extrasPreview?.existingGroup?.siteAllowance).toBe(3);
    expect(
      extrasPreview?.blockers.map((blocker) => blocker.code)
    ).not.toContain("destination_site_allowance");

    const offered = await seedGroup("offer", {
      purchased: 0,
      offered: 10,
      sites: [{ key: "home", primary: true }, { key: "second" }],
    });
    const offeredSource = await seedGroup("offers");
    const offeredPreview = await previewAccountSplit(
      await openMove({ source: offeredSource, destination: offered })
    );
    expect(offeredPreview?.existingGroup?.siteAllowance).toBe(2);
    expect(offeredPreview?.blockers.map((blocker) => blocker.code)).toContain(
      "destination_site_allowance"
    );

    const scheduled = await seedGroup("sched", {
      purchased: 0,
      scheduledQuantity: 10,
      scheduledAt: new Date("2027-01-01T00:00:00.000Z"),
      sites: [{ key: "home", primary: true }],
    });
    const scheduledSource = await seedGroup("scheds");
    const scheduledCodes = await blockers(
      await openMove({ source: scheduledSource, destination: scheduled })
    );
    expect(scheduledCodes).toContain("destination_scheduled_capacity");
    expect(scheduledCodes).not.toContain("destination_site_allowance");

    const legacy = await seedGroup("leg", {
      purchased: null,
      siteAllowance: 3,
      locationAllowance: 10,
      sites: [{ key: "home", primary: true }, { key: "second" }],
    });
    const legacySource = await seedGroup("legs");
    const legacyPreview = await previewAccountSplit(
      await openMove({ source: legacySource, destination: legacy })
    );
    expect(legacyPreview?.existingGroup?.siteAllowance).toBe(
      effectiveSiteLocationAllowance({
        entitlement: {
          commercialPlan: "GROUP",
          siteAllowance: 3,
          locationAllowance: 10,
          capacityEntitlementActive: true,
          purchasedAdditionalSiteQuantity: null,
          extraSiteAllowance: 0,
          extraLocationAllowance: 0,
        },
      }).siteAllowance
    );
    expect(
      legacyPreview?.blockers.map((blocker) => blocker.code)
    ).not.toContain("destination_site_allowance");

    const legacyTight = await seedGroup("legt", {
      purchased: null,
      siteAllowance: 1,
      locationAllowance: 1,
      sites: [{ key: "home", primary: true }],
    });
    const legacyTightSource = await seedGroup("legts");
    expect(
      await blockers(
        await openMove({
          source: legacyTightSource,
          destination: legacyTight,
        })
      )
    ).toContain("destination_site_allowance");
  });

  it("moves the same site and locations without a redirect and leaves source capacity unchanged", async () => {
    const source = await seedGroup("move", { purchased: 2, extraSite: 1 });
    const destination = await seedGroup("moved", {
      purchased: 1,
      extraLocation: 2,
      sites: [{ key: "home", primary: true }],
    });
    await db().clinicSite.update({
      where: { id: siteOf(destination, "home").id },
      data: { primaryColor: "#abcdef", logoUrl: "/static/dest.svg" },
    });
    const destinationProfile = await db().clinicProfile.findUniqueOrThrow({
      where: { clinicId: destination.clinicId },
    });
    const moving = siteOf(source, "move");
    const location = await db().clinicLocation.findFirstOrThrow({
      where: { clinicSiteId: moving.id, servesSiteRoot: true },
    });
    const placed = await placeGuide({
      clinicId: source.clinicId,
      locationId: location.id,
      slug: "aftercare",
      title: "Aftercare",
    });
    const redirectWhere = {
      OR: [
        { sourceClinicSiteId: moving.id },
        { destinationClinicSiteId: moving.id },
      ],
    };
    const redirectsBefore = await db().clinicLocationRedirect.count({
      where: redirectWhere,
    });
    const preparationId = await openMove({ source, destination });
    const sourceCommercial = await db().clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: source.clinicId },
    });
    const destinationCommercial =
      await db().clinicEntitlement.findUniqueOrThrow({
        where: { clinicId: destination.clinicId },
      });
    const legalBefore = await db().legalAcceptance.count({
      where: { clinicId: destination.clinicId },
    });
    const result = await executeMove(preparationId, source.operatorId);
    expect(result.alreadyCompleted).toBe(false);
    const moved = await db().clinicSite.findUniqueOrThrow({
      where: { id: moving.id },
    });
    expect(moved.clinicId).toBe(destination.clinicId);
    expect(moved.slug).toBe(moving.slug);
    expect(moved.isPrimary).toBe(false);
    expect(moved.primaryColor).toBe("#112233");
    const locations = await db().clinicLocation.findMany({
      where: { clinicSiteId: moving.id },
    });
    expect(locations.map((row) => row.id)).toContain(location.id);
    expect(
      locations.every((row) => row.clinicId === destination.clinicId)
    ).toBe(true);
    expect(locations.find((row) => row.id === location.id)?.slug).toBeNull();
    const placement = await db().practiceGuidePlacement.findUniqueOrThrow({
      where: { id: placed.placementId },
    });
    expect(placement.publicSlug).toBe("aftercare");
    expect(placement.clinicId).toBe(destination.clinicId);
    expect(
      await db().clinicLocationRedirect.count({ where: redirectWhere })
    ).toBe(redirectsBefore);
    expect(redirectsBefore).toBe(0);
    const sourceAfter = await db().clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: source.clinicId },
    });
    const destinationAfter = await db().clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: destination.clinicId },
    });
    expect(sourceAfter.purchasedAdditionalSiteQuantity).toBe(
      sourceCommercial.purchasedAdditionalSiteQuantity
    );
    expect(sourceAfter.extraSiteAllowance).toBe(
      sourceCommercial.extraSiteAllowance
    );
    expect(destinationAfter.purchasedAdditionalSiteQuantity).toBe(
      destinationCommercial.purchasedAdditionalSiteQuantity
    );
    expect(destinationAfter.extraLocationAllowance).toBe(
      destinationCommercial.extraLocationAllowance
    );
    const home = await db().clinicSite.findUniqueOrThrow({
      where: { id: siteOf(destination, "home").id },
    });
    expect(home.primaryColor).toBe("#abcdef");
    expect(home.logoUrl).toBe("/static/dest.svg");
    expect(home.isPrimary).toBe(true);
    const profileAfter = await db().clinicProfile.findUniqueOrThrow({
      where: { clinicId: destination.clinicId },
    });
    expect(profileAfter.displayName).toBe(destinationProfile.displayName);
    expect(profileAfter.logoUrl).toBe(destinationProfile.logoUrl);
    expect(
      await db().legalAcceptance.count({
        where: { clinicId: destination.clinicId },
      })
    ).toBe(legalBefore);
    expect(result.guideCopyCount).toBe(1);
    expect(result.canonicalGuideReuseCount).toBe(0);
    const retry = await executeMove(preparationId, source.operatorId);
    expect(retry.alreadyCompleted).toBe(true);
    expect(retry.guideCopyCount).toBe(1);
    expect(retry.canonicalGuideReuseCount).toBe(0);
    expect(await db().clinicSite.count({ where: { id: moving.id } })).toBe(1);
    expect(
      await db().practiceGuide.count({
        where: { clinicId: destination.clinicId, publicSlug: "aftercare" },
      })
    ).toBe(1);
  });

  it("copies only guides placed on the moving site and suffixes a colliding custom slug", async () => {
    const source = await seedGroup("guides");
    const destination = await seedGroup("guidesd", {
      sites: [{ key: "home", primary: true }],
    });
    const movingLocation = `${siteOf(source, "move").id}_loc_0`;
    const keptLocation = `${siteOf(source, "kept").id}_loc_0`;
    const only = await placeGuide({
      clinicId: source.clinicId,
      locationId: movingLocation,
      slug: "only-moving",
      title: "Only moving",
      enabled: false,
    });
    const shared = await placeGuide({
      clinicId: source.clinicId,
      locationId: movingLocation,
      slug: "shared-guide",
      title: "Shared title",
    });
    await db().practiceGuidePlacement.create({
      data: {
        clinicId: source.clinicId,
        locationId: keptLocation,
        practiceGuideId: shared.guideId,
        publicSlug: "shared-guide",
        isEnabled: true,
      },
    });
    await placeGuide({
      clinicId: source.clinicId,
      locationId: keptLocation,
      slug: "stays",
      title: "Stays",
    });
    const template = await publishTemplate("adapt");
    await placeGuide({
      clinicId: source.clinicId,
      locationId: movingLocation,
      slug: "adapted-copy",
      title: "Adapted title",
      sourceGuideTemplateId: template.templateId,
      adaptedAt: new Date("2026-08-02T00:00:00.000Z"),
      withRevision: true,
    });
    await db().practiceGuide.create({
      data: {
        clinicId: destination.clinicId,
        title: "Existing custom",
        publicSlug: "only-moving",
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
      },
    });
    const preparationId = await openMove({ source, destination });
    expect(await blockers(preparationId)).not.toContain(
      "destination_custom_guide_allowance"
    );
    const seen: string[] = [];
    await expect(
      executeClinicAccountSplit({
        preparationId,
        confirmation: "move site stg-guides-move",
        operatorUserId: source.operatorId,
        reviewedRevision: (
          await db().clinicAccountSplitPreparation.findUniqueOrThrow({
            where: { id: preparationId },
          })
        ).preparationRevision,
        hooks: {
          interruptAfter: "after_guide_copies",
          observe: async (point) => {
            if (point === "after_guide_copies") {
              seen.push(point);
            }
          },
        },
      })
    ).rejects.toBeInstanceOf(AccountSplitExecutionInterrupted);
    expect(seen).toEqual(["after_guide_copies"]);
    expect(
      await db().practiceGuide.count({
        where: { clinicId: destination.clinicId, publicSlug: "only-moving-2" },
      })
    ).toBe(0);
    await executeMove(preparationId, source.operatorId);
    const destinationGuides = await db().practiceGuide.findMany({
      where: { clinicId: destination.clinicId },
      select: { title: true, publicSlug: true, sourceGuideTemplateId: true },
    });
    expect(destinationGuides.map((guide) => guide.publicSlug).sort()).toEqual(
      ["adapted-copy", "only-moving", "only-moving-2", "shared-guide"].sort()
    );
    expect(
      destinationGuides.find((guide) => guide.publicSlug === "only-moving")
        ?.title
    ).toBe("Existing custom");
    expect(
      destinationGuides.find((guide) => guide.publicSlug === "only-moving-2")
        ?.title
    ).toBe("Only moving");
    expect(
      destinationGuides.find((guide) => guide.publicSlug === "shared-guide")
        ?.title
    ).toBe("Shared title");
    expect(
      destinationGuides.find((guide) => guide.publicSlug === "adapted-copy")
        ?.sourceGuideTemplateId
    ).toBe(template.templateId);
    expect(
      await db().practiceGuide.findMany({
        where: { clinicId: source.clinicId },
        select: { publicSlug: true, title: true },
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ publicSlug: "stays", title: "Stays" }),
        expect.objectContaining({
          publicSlug: "shared-guide",
          title: "Shared title",
        }),
        expect.objectContaining({
          publicSlug: "only-moving",
          title: "Only moving",
        }),
      ])
    );
    expect(
      await db().practiceGuide.count({
        where: { clinicId: destination.clinicId, publicSlug: "stays" },
      })
    ).toBe(0);
    const sourceSharedPlacement = await db().practiceGuidePlacement.findFirst({
      where: {
        practiceGuideId: shared.guideId,
        locationId: keptLocation,
      },
    });
    expect(sourceSharedPlacement?.clinicId).toBe(source.clinicId);
    const movedPlacement = await db().practiceGuidePlacement.findFirstOrThrow({
      where: { locationId: movingLocation, publicSlug: "shared-guide" },
    });
    expect(movedPlacement.practiceGuideId).not.toBe(shared.guideId);
    expect(movedPlacement.clinicId).toBe(destination.clinicId);
    expect(only.placementId).toBe(
      (
        await db().practiceGuidePlacement.findFirstOrThrow({
          where: { locationId: movingLocation, publicSlug: "only-moving" },
        })
      ).id
    );
    const taken = new Set(["only-moving"]);
    expect(allocateAccountGuideSlug("only-moving", new Set(taken))).toBe(
      "only-moving-2"
    );
    expect(allocateAccountGuideSlug("only-moving", new Set(taken))).toBe(
      "only-moving-2"
    );
  });

  it("requires explicit confirmation before retargeting an exact canonical guide", async () => {
    const source = await seedGroup("can");
    const destination = await seedGroup("cand", {
      sites: [{ key: "home", primary: true }],
    });
    const template = await publishTemplate("river");
    const movingLocation = `${siteOf(source, "move").id}_loc_0`;
    const sourceGuide = await placeGuide({
      clinicId: source.clinicId,
      locationId: movingLocation,
      slug: "river-guide",
      title: "River guide",
      guideTemplateId: template.templateId,
      pinnedRevisionId: template.revisionId,
      enabled: true,
    });
    const destinationGuide = await db().practiceGuide.create({
      data: {
        clinicId: destination.clinicId,
        title: "Destination river",
        publicSlug: "destination-river",
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
        guideTemplateId: template.templateId,
        pinnedRevisionId: template.revisionId,
      },
    });
    const preparationId = await openMove({ source, destination });
    expect(await blockers(preparationId)).toContain(
      "canonical_retarget_unconfirmed"
    );
    const before = await db().clinicAccountSplitPreparation.findUniqueOrThrow({
      where: { id: preparationId },
      select: { preparationRevision: true },
    });
    await saveCanonicalRetargetConfirmations({
      preparationId,
      sourcePracticeGuideIds: [sourceGuide.guideId],
    });
    const confirmed =
      await db().clinicAccountSplitPreparation.findUniqueOrThrow({
        where: { id: preparationId },
        select: { preparationRevision: true },
      });
    expect(confirmed.preparationRevision).toBe(before.preparationRevision + 1);
    await saveCanonicalRetargetConfirmations({
      preparationId,
      sourcePracticeGuideIds: [sourceGuide.guideId],
    });
    expect(
      (
        await db().clinicAccountSplitPreparation.findUniqueOrThrow({
          where: { id: preparationId },
        })
      ).preparationRevision
    ).toBe(confirmed.preparationRevision);
    await revalidateAccountSplitPreparation(preparationId);
    expect(await blockers(preparationId)).not.toContain(
      "canonical_retarget_unconfirmed"
    );
    const ready = await previewAccountSplit(preparationId);
    expect(ready?.existingGroup?.guidesToCopy).toBe(0);
    expect(ready?.existingGroup?.guidesToRetarget).toBe(1);
    const fingerprint = await db().practiceGuide.findUniqueOrThrow({
      where: { id: destinationGuide.id },
    });
    const result = await executeMove(preparationId, source.operatorId);
    expect(result.guideCopyCount).toBe(0);
    expect(result.canonicalGuideReuseCount).toBe(1);
    const placement = await db().practiceGuidePlacement.findUniqueOrThrow({
      where: { id: sourceGuide.placementId },
    });
    expect(placement.practiceGuideId).toBe(destinationGuide.id);
    expect(placement.publicSlug).toBe("river-guide");
    const after = await db().practiceGuide.findUniqueOrThrow({
      where: { id: destinationGuide.id },
    });
    expect(after.title).toBe(fingerprint.title);
    expect(after.publicSlug).toBe(fingerprint.publicSlug);
    expect(after.status).toBe(fingerprint.status);
    expect(after.isEnabled).toBe(fingerprint.isEnabled);
    expect(after.pinnedRevisionId).toBe(fingerprint.pinnedRevisionId);
    expect(
      await db().practiceGuide.count({
        where: {
          clinicId: destination.clinicId,
          guideTemplateId: template.templateId,
        },
      })
    ).toBe(1);
  });

  it("counts one copied guide and one reused canonical guide, including a completed retry", async () => {
    const source = await seedGroup("sum");
    const destination = await seedGroup("sumd", {
      sites: [{ key: "home", primary: true }],
    });
    const template = await publishTemplate("sum");
    const movingLocation = `${siteOf(source, "move").id}_loc_0`;
    const sourceGuide = await placeGuide({
      clinicId: source.clinicId,
      locationId: movingLocation,
      slug: "sum-river",
      title: "River guide",
      guideTemplateId: template.templateId,
      pinnedRevisionId: template.revisionId,
    });
    await placeGuide({
      clinicId: source.clinicId,
      locationId: movingLocation,
      slug: "sum-note",
      title: "Harbour note",
    });
    const destinationGuide = await db().practiceGuide.create({
      data: {
        clinicId: destination.clinicId,
        title: "Destination river",
        publicSlug: "destination-river",
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
        guideTemplateId: template.templateId,
        pinnedRevisionId: template.revisionId,
      },
    });
    const preparationId = await openMove({ source, destination });
    await saveCanonicalRetargetConfirmations({
      preparationId,
      sourcePracticeGuideIds: [sourceGuide.guideId],
    });
    await revalidateAccountSplitPreparation(preparationId);
    const result = await executeMove(preparationId, source.operatorId);
    expect(result.guideCopyCount).toBe(1);
    expect(result.canonicalGuideReuseCount).toBe(1);
    const retry = await executeMove(preparationId, source.operatorId);
    expect(retry.alreadyCompleted).toBe(true);
    expect(retry.guideCopyCount).toBe(result.guideCopyCount);
    expect(retry.canonicalGuideReuseCount).toBe(
      result.canonicalGuideReuseCount
    );
    expect(
      await db().practiceGuide.count({
        where: {
          clinicId: destination.clinicId,
          guideTemplateId: template.templateId,
        },
      })
    ).toBe(1);
    expect(
      await db().practiceGuide.count({
        where: { clinicId: destination.clinicId, publicSlug: "sum-note" },
      })
    ).toBe(1);
    const placement = await db().practiceGuidePlacement.findUniqueOrThrow({
      where: { id: sourceGuide.placementId },
    });
    expect(placement.practiceGuideId).toBe(destinationGuide.id);
  });

  it("blocks incompatible canonical guides and allows a disabled placement onto a non-public exact match", async () => {
    async function pair(
      key: string,
      mutate?: {
        source?: Partial<Parameters<typeof placeGuide>[0]>;
        destination?: Record<string, unknown>;
        enabled?: boolean;
        differentPin?: boolean;
      }
    ) {
      const source = await seedGroup(`${key}s`);
      const destination = await seedGroup(`${key}d`, {
        sites: [{ key: "home", primary: true }],
      });
      const template = await publishTemplate(key);
      let destinationPin = template.revisionId;
      if (mutate?.differentPin) {
        const alt = await db().guideTemplateRevision.create({
          data: {
            id: `${PREFIX}alt_${key}`.slice(0, 40),
            guideTemplateId: template.templateId,
            version: 2,
            status: GuideRevisionStatus.PUBLISHED,
            publishedAt: new Date("2026-08-03T00:00:00.000Z"),
          },
        });
        destinationPin = alt.id;
      }
      const movingLocation = `${siteOf(source, "move").id}_loc_0`;
      const sourceFields = { ...(mutate?.source ?? {}) };
      delete sourceFields.clinicId;
      delete sourceFields.locationId;
      delete sourceFields.slug;
      delete sourceFields.title;
      await placeGuide({
        clinicId: source.clinicId,
        locationId: movingLocation,
        slug: `${key}-guide`,
        title: key,
        guideTemplateId: template.templateId,
        pinnedRevisionId: template.revisionId,
        enabled: mutate?.enabled ?? true,
        ...sourceFields,
      });
      await db().practiceGuide.create({
        data: {
          clinicId: destination.clinicId,
          title: `${key} destination`,
          publicSlug: `${key}-destination`,
          status: PracticeGuideStatus.PUBLISHED,
          isEnabled: true,
          guideTemplateId: template.templateId,
          pinnedRevisionId: destinationPin,
          ...(mutate?.destination ?? {}),
        },
      });
      const preparationId = await openMove({ source, destination });
      return blockers(preparationId);
    }

    expect(await pair("pin", { differentPin: true })).toContain(
      "canonical_retarget_incompatible"
    );

    const adaptedTemplate = await publishTemplate("srcadaptbase");
    expect(
      await pair("srcadapt", {
        source: {
          sourceGuideTemplateId: adaptedTemplate.templateId,
          adaptedAt: new Date("2026-08-01T00:00:00.000Z"),
        },
      })
    ).toContain("canonical_retarget_incompatible");

    expect(await pair("over", { source: { withOverride: true } })).toContain(
      "canonical_retarget_incompatible"
    );
    expect(await pair("add", { source: { withAddition: true } })).toContain(
      "canonical_retarget_incompatible"
    );
    expect(await pair("rev", { source: { withRevision: true } })).toContain(
      "canonical_retarget_incompatible"
    );
    expect(
      await pair("keep", {
        source: {
          downgradeRetainedAt: new Date("2026-08-01T00:00:00.000Z"),
        },
      })
    ).toContain("canonical_retarget_incompatible");
    expect(
      await pair("life", {
        destination: {
          downgradeRetainedAt: new Date("2026-08-01T00:00:00.000Z"),
        },
      })
    ).toContain("canonical_retarget_incompatible");
    expect(
      await pair("pub", {
        destination: {
          status: PracticeGuideStatus.DRAFT,
          isEnabled: false,
        },
      })
    ).toContain("canonical_retarget_incompatible");

    const source = await seedGroup("dis");
    const destination = await seedGroup("disd", {
      sites: [{ key: "home", primary: true }],
    });
    const template = await publishTemplate("disabled");
    const movingLocation = `${siteOf(source, "move").id}_loc_0`;
    const guide = await placeGuide({
      clinicId: source.clinicId,
      locationId: movingLocation,
      slug: "disabled-guide",
      title: "Disabled",
      guideTemplateId: template.templateId,
      pinnedRevisionId: template.revisionId,
      enabled: false,
    });
    const destinationGuide = await db().practiceGuide.create({
      data: {
        clinicId: destination.clinicId,
        title: "Disabled destination",
        publicSlug: "disabled-destination",
        status: PracticeGuideStatus.DRAFT,
        isEnabled: false,
        guideTemplateId: template.templateId,
        pinnedRevisionId: template.revisionId,
      },
    });
    const preparationId = await openMove({ source, destination });
    expect(await blockers(preparationId)).toContain(
      "canonical_retarget_unconfirmed"
    );
    expect(await blockers(preparationId)).not.toContain(
      "canonical_retarget_incompatible"
    );
    await saveCanonicalRetargetConfirmations({
      preparationId,
      sourcePracticeGuideIds: [guide.guideId],
    });
    await revalidateAccountSplitPreparation(preparationId);
    await executeMove(preparationId, source.operatorId);
    expect(
      (
        await db().practiceGuidePlacement.findUniqueOrThrow({
          where: { id: guide.placementId },
        })
      ).practiceGuideId
    ).toBe(destinationGuide.id);
    expect(
      (
        await db().practiceGuide.findUniqueOrThrow({
          where: { id: destinationGuide.id },
        })
      ).status
    ).toBe(PracticeGuideStatus.DRAFT);
  });

  it("rewrites prepared branding and leaves destination sites and static paths unchanged", async () => {
    const source = await seedGroup("brand");
    const destination = await seedGroup("brandd", {
      sites: [{ key: "home", primary: true }],
    });
    const sourceKey = `clinics/${source.clinicId}/branding/site.png`;
    const darkKey = `clinics/${source.clinicId}/branding/dark.png`;
    await db().clinicSite.update({
      where: { id: siteOf(source, "move").id },
      data: {
        logoUrl: sourceKey,
        darkLogoUrl: darkKey,
        faviconUrl: "/static/icon.svg",
      },
    });
    await db().clinicSite.update({
      where: { id: siteOf(destination, "home").id },
      data: { logoUrl: `clinics/${destination.clinicId}/branding/home.png` },
    });
    process.env.CLINIC_ASSET_STORAGE_DRIVER = "memory";
    resetClinicAssetStorageCache();
    const storage = getClinicAssetStorage();
    if (!storage) {
      throw new Error("Memory branding storage is required.");
    }
    await storage.uploadLogo({
      clinicId: source.clinicId,
      storageKey: sourceKey,
      bytes: Uint8Array.from([1, 2, 3]),
      mimeType: "image/png",
    });
    await storage.uploadLogo({
      clinicId: source.clinicId,
      storageKey: darkKey,
      bytes: Uint8Array.from([4, 5, 6]),
      mimeType: "image/png",
    });
    const preparationId = await openMove({ source, destination });
    expect(await blockers(preparationId)).toContain(
      "branding_assets_not_ready"
    );
    await prepareAccountSplitBranding({
      preparationId,
      operatorUserId: source.operatorId,
      storage,
    });
    await revalidateAccountSplitPreparation(preparationId);
    expect(await blockers(preparationId)).not.toContain(
      "branding_assets_not_ready"
    );
    await db().clinicSite.update({
      where: { id: siteOf(source, "move").id },
      data: { logoUrl: `clinics/${source.clinicId}/branding/changed.png` },
    });
    await revalidateAccountSplitPreparation(preparationId);
    expect(await blockers(preparationId)).toContain(
      "branding_assets_not_ready"
    );
    await db().clinicSite.update({
      where: { id: siteOf(source, "move").id },
      data: { logoUrl: sourceKey },
    });
    await revalidateAccountSplitPreparation(preparationId);
    const executeSource = readFileSync(
      "lib/account-split/site-to-existing-group-execute.ts",
      "utf8"
    );
    expect(executeSource).not.toMatch(/from ["']stripe["']/);
    expect(executeSource).not.toMatch(/uploadLogo|getClinicAssetStorage/);
    await executeMove(preparationId, source.operatorId);
    const moved = await db().clinicSite.findUniqueOrThrow({
      where: { id: siteOf(source, "move").id },
    });
    expect(
      moved.logoUrl?.startsWith(`clinics/${destination.clinicId}/branding/`)
    ).toBe(true);
    expect(
      moved.darkLogoUrl?.startsWith(`clinics/${destination.clinicId}/branding/`)
    ).toBe(true);
    expect(moved.faviconUrl).toBe("/static/icon.svg");
    expect(moved.logoUrl).not.toBe(sourceKey);
    expect(
      (
        await db().clinicSite.findUniqueOrThrow({
          where: { id: siteOf(destination, "home").id },
        })
      ).logoUrl
    ).toBe(`clinics/${destination.clinicId}/branding/home.png`);
    expect(
      await storage.readLogo({
        clinicId: source.clinicId,
        storageKey: sourceKey,
      })
    ).toBeTruthy();
  });

  it("applies exclusive staff decisions and leaves operators and invitations on the source", async () => {
    const source = await seedGroup("staff");
    const destination = await seedGroup("staffd", {
      sites: [{ key: "home", primary: true }],
    });
    await db().clinicMembership.create({
      data: {
        clinicId: source.clinicId,
        userId: source.operatorId,
        role: "ADMIN",
      },
    });
    const invitedId = `${PREFIX}invite_staff`;
    await db().user.create({
      data: {
        id: invitedId,
        email: `${invitedId}@example.test`,
        name: "Pending",
      },
    });
    await db().accountToken.create({
      data: {
        type: AccountTokenType.INVITATION,
        userId: invitedId,
        clinicId: source.clinicId,
        role: "STAFF",
        email: `${invitedId}@example.test`,
        tokenHash: `${PREFIX}invite_hash`,
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      },
    });
    const preparationId = await openMove({ source, destination });
    await revalidateAccountSplitPreparation(preparationId);
    expect(await blockers(preparationId)).not.toContain(
      "staff_selection_missing"
    );
    await executeMove(preparationId, source.operatorId);
    expect(
      await db().clinicMembership.findFirst({
        where: { clinicId: destination.clinicId, userId: source.operatorId },
      })
    ).toBeNull();
    expect(
      (
        await db().accountToken.findFirstOrThrow({
          where: { tokenHash: `${PREFIX}invite_hash` },
        })
      ).clinicId
    ).toBe(source.clinicId);
    expect(
      (
        await db().clinicMembership.findFirstOrThrow({
          where: {
            clinicId: destination.clinicId,
            userId: destination.adminId,
          },
        })
      ).active
    ).toBe(true);

    const moverSource = await seedGroup("staffm");
    const moverDestination = await seedGroup("staffmd", {
      sites: [{ key: "home", primary: true }],
    });
    const moverId = await openMove({
      source: moverSource,
      destination: moverDestination,
    });
    await saveAccountSplitStaffSelections({
      preparationId: moverId,
      selections: [
        {
          userId: moverSource.adminId,
          keepOnSource: true,
          grantOnDestination: false,
          destinationRole: "ADMIN",
        },
        {
          userId: moverSource.staffId,
          keepOnSource: false,
          grantOnDestination: true,
          destinationRole: "STAFF",
        },
      ],
    });
    await revalidateAccountSplitPreparation(moverId);
    await executeMove(moverId, moverSource.operatorId);
    expect(
      await db().clinicMembership.findFirst({
        where: { clinicId: moverSource.clinicId, userId: moverSource.staffId },
      })
    ).toBeNull();
    expect(
      (
        await db().clinicMembership.findFirstOrThrow({
          where: {
            clinicId: moverDestination.clinicId,
            userId: moverSource.staffId,
          },
        })
      ).role
    ).toBe("STAFF");

    const idleSource = await seedGroup("staffi");
    const idleDestination = await seedGroup("staffid", {
      sites: [{ key: "home", primary: true }],
    });
    await db().clinicMembership.create({
      data: {
        clinicId: idleDestination.clinicId,
        userId: idleSource.staffId,
        role: "ADMIN",
        active: false,
      },
    });
    const idleId = await openMove({
      source: idleSource,
      destination: idleDestination,
    });
    await saveAccountSplitStaffSelections({
      preparationId: idleId,
      selections: [
        {
          userId: idleSource.adminId,
          keepOnSource: true,
          grantOnDestination: false,
          destinationRole: "ADMIN",
        },
        {
          userId: idleSource.staffId,
          keepOnSource: false,
          grantOnDestination: true,
          destinationRole: "STAFF",
        },
      ],
    });
    await revalidateAccountSplitPreparation(idleId);
    expect(await blockers(idleId)).toContain("destination_role_conflict");
    await saveAccountSplitStaffSelections({
      preparationId: idleId,
      selections: [
        {
          userId: idleSource.adminId,
          keepOnSource: true,
          grantOnDestination: false,
          destinationRole: "ADMIN",
        },
        {
          userId: idleSource.staffId,
          keepOnSource: false,
          grantOnDestination: true,
          destinationRole: "ADMIN",
        },
      ],
    });
    await revalidateAccountSplitPreparation(idleId);
    await executeMove(idleId, idleSource.operatorId);
    const reactivated = await db().clinicMembership.findFirstOrThrow({
      where: { clinicId: idleDestination.clinicId, userId: idleSource.staffId },
    });
    expect(reactivated.active).toBe(true);
    expect(reactivated.role).toBe("ADMIN");

    const bothSource = await seedGroup("staffb");
    const bothDestination = await seedGroup("staffbd", {
      sites: [{ key: "home", primary: true }],
    });
    await db().clinicMembership.create({
      data: {
        clinicId: bothDestination.clinicId,
        userId: bothSource.staffId,
        role: "STAFF",
        active: true,
      },
    });
    const bothId = await openMove({
      source: bothSource,
      destination: bothDestination,
    });
    expect(await blockers(bothId)).toContain("dual_membership");
  });

  it("blocks scheduled commercial changes and records a commercial conflict without moving the site", async () => {
    const source = await seedGroup("comm", {
      scheduledPlan: "PRACTICE",
    });
    const destination = await seedGroup("commd", {
      sites: [{ key: "home", primary: true }],
    });
    expect(await blockers(await openMove({ source, destination }))).toContain(
      "source_scheduled_plan"
    );

    const clear = await seedGroup("comm2");
    const scheduledDestination = await seedGroup("comm2d", {
      scheduledQuantity: 3,
      scheduledAt: new Date("2027-02-01T00:00:00.000Z"),
      sites: [{ key: "home", primary: true }],
    });
    expect(
      await blockers(
        await openMove({ source: clear, destination: scheduledDestination })
      )
    ).toContain("destination_scheduled_capacity");

    const live = await seedGroup("comm3");
    const liveDestination = await seedGroup("comm3d", {
      sites: [{ key: "home", primary: true }],
    });
    const preparationId = await openMove({
      source: live,
      destination: liveDestination,
    });
    await db().clinicBillingProfile.create({
      data: {
        clinicId: live.clinicId,
        stripeSubscriptionScheduleId: `${PREFIX}sched_comm3`,
      },
    });
    await expect(executeMove(preparationId, live.operatorId)).rejects.toThrow(
      /subscription schedule/
    );
    expect(
      (
        await db().clinicSite.findUniqueOrThrow({
          where: { id: siteOf(live, "move").id },
        })
      ).clinicId
    ).toBe(live.clinicId);
    expect(
      await db().clinicAccountSplitEvent.findFirst({
        where: { preparationId, kind: "COMMERCIAL_CONFLICT" },
      })
    ).not.toBeNull();
    const purchased = await db().clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: live.clinicId },
    });
    expect(purchased.purchasedAdditionalSiteQuantity).toBe(0);
  });

  it("rolls back each cutover point and refuses a stale revision, a changed primary, and lost capacity", async () => {
    const points: AccountSplitExecutionInterrupt[] = [
      "after_guide_copies",
      "after_placement_deletion",
      "after_primary_switch",
      "after_site_move",
      "after_placement_reinsertion",
      "after_membership_changes",
    ];
    for (const [index, point] of points.entries()) {
      const source = await seedGroup(`rb${index}`, {
        sites: [{ key: "move", primary: true }, { key: "kept" }],
      });
      const destination = await seedGroup(`rbd${index}`, {
        sites: [{ key: "home", primary: true }],
      });
      await placeGuide({
        clinicId: source.clinicId,
        locationId: `${siteOf(source, "move").id}_loc_0`,
        slug: `rollback-${index}`,
        title: "Rollback",
      });
      const preparationId = await openMove({
        source,
        destination,
        movingKey: "move",
        keptKey: "kept",
      });
      await expect(
        executeClinicAccountSplit({
          preparationId,
          confirmation: `move site ${siteOf(source, "move").slug}`,
          operatorUserId: source.operatorId,
          reviewedRevision: (
            await db().clinicAccountSplitPreparation.findUniqueOrThrow({
              where: { id: preparationId },
            })
          ).preparationRevision,
          hooks: { interruptAfter: point },
        })
      ).rejects.toBeInstanceOf(AccountSplitExecutionInterrupted);
      expect(
        (
          await db().clinicSite.findUniqueOrThrow({
            where: { id: siteOf(source, "move").id },
          })
        ).clinicId
      ).toBe(source.clinicId);
      expect(
        (
          await db().clinicAccountSplitPreparation.findUniqueOrThrow({
            where: { id: preparationId },
          })
        ).status
      ).toBe("READY_TO_EXECUTE");
      expect(
        await db().practiceGuide.count({
          where: {
            clinicId: destination.clinicId,
            publicSlug: `rollback-${index}`,
          },
        })
      ).toBe(0);
    }

    const source = await seedGroup("stale", {
      sites: [
        { key: "move", primary: true },
        { key: "kept" },
        { key: "other" },
      ],
    });
    const destination = await seedGroup("staled", {
      sites: [{ key: "home", primary: true }],
    });
    const preparationId = await openMove({
      source,
      destination,
      movingKey: "move",
      keptKey: "kept",
    });
    const reviewed = (
      await db().clinicAccountSplitPreparation.findUniqueOrThrow({
        where: { id: preparationId },
      })
    ).preparationRevision;
    await saveSiteToExistingGroupSelection({
      preparationId,
      movingClinicSiteId: siteOf(source, "move").id,
      keptClinicSiteId: siteOf(source, "other").id,
    });
    await expect(
      executeClinicAccountSplit({
        preparationId,
        confirmation: `move site ${siteOf(source, "move").slug}`,
        operatorUserId: source.operatorId,
        reviewedRevision: reviewed,
      })
    ).rejects.toThrow(/Review it again/);
    expect(
      await db().clinicAccountSplitEvent.findFirst({
        where: { preparationId, kind: "STALE_REVISION_REFUSED" },
      })
    ).not.toBeNull();

    const primary = await seedGroup("flip", {
      sites: [
        { key: "kept", primary: true },
        { key: "move" },
        { key: "other" },
      ],
    });
    const primaryDestination = await seedGroup("flipd", {
      sites: [{ key: "home", primary: true }],
    });
    const flipId = await openMove({
      source: primary,
      destination: primaryDestination,
    });
    await db().clinicSite.update({
      where: { id: siteOf(primary, "kept").id },
      data: { isPrimary: false },
    });
    await db().clinicSite.update({
      where: { id: siteOf(primary, "other").id },
      data: { isPrimary: true },
    });
    await expect(executeMove(flipId, primary.operatorId)).rejects.toThrow();
    expect(
      (
        await db().clinicSite.findUniqueOrThrow({
          where: { id: siteOf(primary, "move").id },
        })
      ).clinicId
    ).toBe(primary.clinicId);

    const crowdedSource = await seedGroup("crowd");
    const crowded = await seedGroup("crowdd", {
      sites: [{ key: "home", primary: true }],
    });
    const crowdedId = await openMove({
      source: crowdedSource,
      destination: crowded,
    });
    await db().clinicSite.create({
      data: {
        id: `${PREFIX}crowd_extra`,
        clinicId: crowded.clinicId,
        name: "Extra",
        slug: "stg-crowd-extra",
        displayName: "Extra",
        active: true,
        isPrimary: false,
      },
    });
    await db().clinicLocation.create({
      data: {
        id: `${PREFIX}crowd_extra_root`,
        clinicSiteId: `${PREFIX}crowd_extra`,
        clinicId: crowded.clinicId,
        name: "Root",
        slug: null,
        displayName: "Root",
        isPrimary: true,
        servesSiteRoot: true,
        active: true,
      },
    });
    await expect(
      executeMove(crowdedId, crowdedSource.operatorId)
    ).rejects.toThrow(/active Clinic Sites/);

    const canonicalSource = await seedGroup("cstale");
    const canonicalDestination = await seedGroup("cstaled", {
      sites: [{ key: "home", primary: true }],
    });
    const template = await publishTemplate("cstale");
    const guide = await placeGuide({
      clinicId: canonicalSource.clinicId,
      locationId: `${siteOf(canonicalSource, "move").id}_loc_0`,
      slug: "cstale-guide",
      title: "Canonical",
      guideTemplateId: template.templateId,
      pinnedRevisionId: template.revisionId,
    });
    const destinationGuide = await db().practiceGuide.create({
      data: {
        clinicId: canonicalDestination.clinicId,
        title: "Canonical destination",
        publicSlug: "cstale-destination",
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
        guideTemplateId: template.templateId,
        pinnedRevisionId: template.revisionId,
      },
    });
    const canonicalId = await openMove({
      source: canonicalSource,
      destination: canonicalDestination,
    });
    await saveCanonicalRetargetConfirmations({
      preparationId: canonicalId,
      sourcePracticeGuideIds: [guide.guideId],
    });
    await revalidateAccountSplitPreparation(canonicalId);
    await db().practiceGuideOverride.create({
      data: {
        practiceGuideId: destinationGuide.id,
        sectionKey: "intro",
        title: "Changed",
        body: "Changed",
      },
    });
    await expect(
      executeMove(canonicalId, canonicalSource.operatorId)
    ).rejects.toThrow();
    expect(
      (
        await db().clinicSite.findUniqueOrThrow({
          where: { id: siteOf(canonicalSource, "move").id },
        })
      ).clinicId
    ).toBe(canonicalSource.clinicId);
  });

  it("lets only one concurrent execute move the site", async () => {
    const source = await seedGroup("race");
    const destination = await seedGroup("raced", {
      sites: [{ key: "home", primary: true }],
    });
    const preparationId = await openMove({ source, destination });
    const release = deferred();
    const holding = deferred();
    const row = await db().clinicAccountSplitPreparation.findUniqueOrThrow({
      where: { id: preparationId },
    });
    const first = executeClinicAccountSplit({
      preparationId,
      confirmation: row.expectedConfirmation ?? "",
      operatorUserId: source.operatorId,
      reviewedRevision: row.preparationRevision,
      hooks: {
        afterLocks: async () => {
          holding.resolve();
          await release.promise;
        },
      },
    });
    await holding.promise;
    const second = executeClinicAccountSplit({
      preparationId,
      confirmation: row.expectedConfirmation ?? "",
      operatorUserId: source.operatorId,
      reviewedRevision: row.preparationRevision,
    });
    release.resolve();
    const results = await Promise.all([first, second]);
    expect(results.filter((result) => result.alreadyCompleted)).toHaveLength(1);
    expect(
      await db().clinicSite.count({
        where: {
          id: siteOf(source, "move").id,
          clinicId: destination.clinicId,
        },
      })
    ).toBe(1);
    expect(
      await db().clinicLocationRedirect.count({
        where: { sourceClinicSiteId: siteOf(source, "move").id },
      })
    ).toBe(0);
  });

  it("keeps an open downgrade selection and does not copy it", async () => {
    const source = await seedGroup("down");
    const destination = await seedGroup("downd", {
      sites: [{ key: "home", primary: true }],
    });
    const preparationId = await openMove({ source, destination });
    const downgrade = await db().clinicDowngradePreparation.create({
      data: {
        clinicId: source.clinicId,
        targetPlan: "PRACTICE",
        status: "AWAITING_SELECTION",
      },
    });
    await db().downgradeLocationSelection.create({
      data: {
        preparationId: downgrade.id,
        locationId: `${siteOf(source, "move").id}_loc_0`,
      },
    });
    await revalidateAccountSplitPreparation(preparationId);
    expect(await blockers(preparationId)).toContain(
      "source_downgrade_preparation"
    );
    await expect(
      executeMove(preparationId, source.operatorId)
    ).rejects.toThrow();
    expect(
      await db().downgradeLocationSelection.count({
        where: { preparationId: downgrade.id },
      })
    ).toBe(1);
    expect(
      await db().clinicDowngradePreparation.count({
        where: { clinicId: destination.clinicId },
      })
    ).toBe(0);
  });

  it("records preparation, branding, cancel, and cutover events", async () => {
    const source = await seedGroup("event");
    const destination = await seedGroup("eventd", {
      sites: [{ key: "home", primary: true }],
    });
    const preparationId = await openMove({ source, destination });
    await executeMove(preparationId, source.operatorId);
    const completed = await db().clinicAccountSplitEvent.findMany({
      where: { preparationId },
      select: { kind: true },
    });
    expect(completed.map((event) => event.kind)).toEqual(
      expect.arrayContaining([
        "PREPARATION_CREATED",
        "STATUS_TRANSITION",
        "CUTOVER_STARTED",
        "CUTOVER_COMPLETED",
      ])
    );
    const retry = await executeMove(preparationId, source.operatorId);
    expect(retry.alreadyCompleted).toBe(true);
    expect(
      await db().clinicAccountSplitEvent.findFirst({
        where: { preparationId, kind: "COMPLETED_RETRY" },
      })
    ).not.toBeNull();

    const cancelSource = await seedGroup("cancel");
    const cancelId = await openMove({ source: cancelSource });
    await cancelAccountSplitPreparation(cancelId);
    expect(
      await db().clinicAccountSplitEvent.findFirst({
        where: { preparationId: cancelId, kind: "CANCELLED" },
      })
    ).not.toBeNull();
  });

  it("does not enable a new Group destination or Group Checkout", () => {
    const actions = readFileSync(
      "app/(staff)/(operator)/operator/clinics/[clinicId]/split/actions.ts",
      "utf8"
    );
    const executeSource = readFileSync(
      "lib/account-split/site-to-existing-group-execute.ts",
      "utf8"
    );
    expect(actions).not.toContain("SITE_TO_NEW_GROUP");
    expect(executeSource).not.toMatch(/checkout\.sessions/);
    expect(executeSource).not.toMatch(/from ["']stripe["']/);
    expect(readFileSync("lib/account-split/assess.ts", "utf8")).toContain(
      "SITE_TO_EXISTING_GROUP"
    );
    const completedPage = readFileSync(
      "app/(staff)/(operator)/operator/clinics/[clinicId]/split/page.tsx",
      "utf8"
    );
    expect(completedPage).toContain("Guides copied");
    expect(completedPage).toContain("Canonical guides reused");
    expect(completedPage).toContain("Guide copies");
    const locationPage = readFileSync(
      "app/(staff)/(operator)/operator/clinics/[clinicId]/split/location-move-page.tsx",
      "utf8"
    );
    expect(locationPage).toContain("Guide copies");
    expect(locationPage).not.toContain("Canonical guides reused");
  });
});
