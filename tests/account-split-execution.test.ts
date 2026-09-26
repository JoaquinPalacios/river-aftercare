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
} from "@prisma/client";

import {
  AccountSplitExecutionInterrupted,
  executeClinicAccountSplit,
} from "@/lib/account-split/execute";
import {
  confirmationMatchesSplitSite,
  normalizeSplitConfirmation,
} from "@/lib/account-split/policy";
import {
  createAccountSplitPreparation,
  createSplitDestinationAccount,
  previewAccountSplit,
  revalidateAccountSplitPreparation,
  saveAccountSplitSiteDecisions,
  saveAccountSplitStaffSelections,
} from "@/lib/account-split/preparation";
import { isSplitShellCompatibilitySlug } from "@/lib/account-split/shell-slug";
import { getClinicBySlug } from "@/lib/aftercare/get-clinic-by-slug";
import { getPatientLocation } from "@/lib/aftercare/get-patient-location";
import { getPublishedPracticeGuide } from "@/lib/aftercare/get-published-practice-guide";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { setGuideAvailableAtLocation } from "@/lib/clinic-portal/guide-placements";
import { publishPracticeGuide } from "@/lib/clinic-portal/publish-practice-guide";
import { updateClinicSiteBranding } from "@/lib/clinics/site-location-mutations";
import {
  clinicAccountStructureLockKey,
  lockClinicAccountStructure,
} from "@/lib/entitlements/locks";
import { changeClinicMembershipRole } from "@/lib/operator/change-clinic-membership-role";
import { getPrisma } from "@/lib/prisma";

const PREFIX = "asx_";

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
  await prisma.clinicAccountSplitPreparation.deleteMany({
    where: { sourceClinicId: { startsWith: PREFIX } },
  });
  await prisma.clinic.deleteMany({ where: { id: { startsWith: PREFIX } } });
  if (destinationIds.length > 0) {
    await prisma.clinic.deleteMany({ where: { id: { in: destinationIds } } });
  }
  await prisma.clinic.deleteMany({
    where: { slug: { startsWith: "asx-" } },
  });
  await prisma.guideTemplate.deleteMany({
    where: { slug: { startsWith: "asx-" } },
  });
  await prisma.user.deleteMany({
    where: {
      OR: [{ id: { startsWith: PREFIX } }, { email: { startsWith: PREFIX } }],
    },
  });
}

type SiteSpec = {
  key: "kept" | "move" | "extra";
  name: string;
  decision?: "SPLIT" | "DEACTIVATE" | "RETAIN_ON_SOURCE";
  primary?: boolean;
  active?: boolean;
};

async function seedAccount(key: string, sites: SiteSpec[]) {
  const clinicId = `${PREFIX}${key}`;
  const operatorId = `${PREFIX}op_${key}`;
  const adminId = `${PREFIX}admin_${key}`;
  const staffId = `${PREFIX}staff_${key}`;
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
      slug: `asx-acct-${key}`.slice(0, 32),
      profile: {
        create: {
          displayName: `Group ${key}`,
          logoUrl: `clinics/${clinicId}/branding/account.png`,
        },
      },
      memberships: {
        create: [
          { userId: adminId, role: "ADMIN" },
          { userId: staffId, role: "STAFF" },
        ],
      },
      entitlement: {
        create: {
          commercialPlan: "GROUP",
          billingInterval: "MONTHLY",
          billingStatus: BillingStatus.ACTIVE,
          entitlementStatus: EntitlementStatus.ACTIVE,
          siteAllowance: 4,
          locationAllowance: 6,
        },
      },
    },
  });
  const created = [];
  for (const site of sites) {
    const row = await db().clinicSite.create({
      data: {
        id: `${PREFIX}${site.key}_${key}`,
        clinicId,
        name: site.name,
        slug: `asx-${site.key}-${key}`.slice(0, 32),
        displayName: site.name,
        active: site.active ?? true,
        isPrimary: site.primary ?? false,
        logoUrl: `clinics/${clinicId}/branding/${site.key}.png`,
        primaryColor: "#112233",
        accentColor: "#445566",
      },
    });
    const location = await db().clinicLocation.create({
      data: {
        id: `${PREFIX}${site.key}loc_${key}`,
        clinicSiteId: row.id,
        clinicId,
        name: `${site.name} root`,
        slug: null,
        displayName: `${site.name} root`,
        phone: "0200000000",
        addressLine1: `${site.name} street`,
        city: "Sydney",
        isPrimary: true,
        servesSiteRoot: true,
        active: true,
      },
    });
    created.push({
      ...site,
      id: row.id,
      slug: row.slug,
      locationId: location.id,
    });
  }
  return { clinicId, operatorId, adminId, staffId, sites: created };
}

async function prepareReady(input: {
  account: Awaited<ReturnType<typeof seedAccount>>;
  locationAllowance?: number;
  staff?: Array<{
    userId: string;
    keepOnSource: boolean;
    grantOnDestination: boolean;
    destinationRole: "ADMIN" | "STAFF";
  }>;
  destinationAdmin?: boolean;
}) {
  const kept = input.account.sites.find((site) => !site.decision);
  if (!kept) {
    throw new Error("Seed needs a kept site.");
  }
  const preparation = await createAccountSplitPreparation({
    sourceClinicId: input.account.clinicId,
    keptClinicSiteId: kept.id,
    destinationPlan: "PRACTICE",
    destinationBillingInterval: "MONTHLY",
    operatorUserId: input.account.operatorId,
  });
  await saveAccountSplitSiteDecisions({
    preparationId: preparation.id,
    decisions: input.account.sites.flatMap((site) =>
      site.decision ? [{ clinicSiteId: site.id, decision: site.decision }] : []
    ),
  });
  await saveAccountSplitStaffSelections({
    preparationId: preparation.id,
    selections: input.staff ?? [
      {
        userId: input.account.adminId,
        keepOnSource: false,
        grantOnDestination: true,
        destinationRole: "ADMIN",
      },
      {
        userId: input.account.staffId,
        keepOnSource: true,
        grantOnDestination: false,
        destinationRole: "STAFF",
      },
    ],
  });
  const shell = await createSplitDestinationAccount(preparation.id);
  if (input.destinationAdmin) {
    const userId = `${PREFIX}dest_${input.account.clinicId}`;
    await db().user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        name: "Destination Admin",
        platformRole: "NONE",
      },
    });
    await db().clinicMembership.create({
      data: { clinicId: shell.id, userId, role: "ADMIN" },
    });
  }
  await db().clinicEntitlement.upsert({
    where: { clinicId: shell.id },
    create: {
      clinicId: shell.id,
      commercialPlan: "PRACTICE",
      billingInterval: "MONTHLY",
      billingStatus: BillingStatus.ACTIVE,
      entitlementStatus: EntitlementStatus.ACTIVE,
      siteAllowance: 1,
      locationAllowance: input.locationAllowance ?? 1,
      cancelAtPeriodEnd: false,
    },
    update: {
      commercialPlan: "PRACTICE",
      billingInterval: "MONTHLY",
      billingStatus: BillingStatus.ACTIVE,
      entitlementStatus: EntitlementStatus.ACTIVE,
      siteAllowance: 1,
      locationAllowance: input.locationAllowance ?? 1,
      cancelAtPeriodEnd: false,
      scheduledCommercialPlan: null,
    },
  });
  await revalidateAccountSplitPreparation(preparation.id);
  return { preparationId: preparation.id, destinationId: shell.id };
}

async function structuralSnapshot(clinicId: string) {
  const prisma = db();
  const [clinic, sites, locations, guides, placements, memberships, maps] =
    await Promise.all([
      prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true, slug: true },
      }),
      prisma.clinicSite.findMany({
        where: { clinicId },
        orderBy: { id: "asc" },
        select: {
          id: true,
          clinicId: true,
          slug: true,
          active: true,
          isPrimary: true,
        },
      }),
      prisma.clinicLocation.findMany({
        where: { clinicId },
        orderBy: { id: "asc" },
        select: { id: true, clinicId: true, slug: true, servesSiteRoot: true },
      }),
      prisma.practiceGuide.findMany({
        where: { clinicId },
        orderBy: { id: "asc" },
        select: { id: true, publicSlug: true, copiedFromPracticeGuideId: true },
      }),
      prisma.practiceGuidePlacement.findMany({
        where: { clinicId },
        orderBy: { id: "asc" },
        select: {
          id: true,
          practiceGuideId: true,
          publicSlug: true,
          isEnabled: true,
        },
      }),
      prisma.clinicMembership.findMany({
        where: { clinicId },
        orderBy: { userId: "asc" },
        select: { userId: true, role: true, active: true },
      }),
      prisma.clinicAccountSplitGuideMap.count(),
    ]);
  return { clinic, sites, locations, guides, placements, memberships, maps };
}

describe("split confirmation", () => {
  it("accepts the loaded site slug and rejects names", () => {
    expect(normalizeSplitConfirmation("  split coastdental  ")).toBe(
      "split coastdental"
    );
    expect(
      confirmationMatchesSplitSite("coastdental", " split coastdental ")
    ).toBe(true);
    expect(confirmationMatchesSplitSite("coastdental", "Coast Dental")).toBe(
      false
    );
    expect(
      confirmationMatchesSplitSite("coastdental", "split coast-dental")
    ).toBe(false);
    expect(
      confirmationMatchesSplitSite("coastdental", "Split coastdental")
    ).toBe(false);
  });
});

describe("account split execution", () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await db().$disconnect();
  });

  it("rejects a clinic user before any structural write", async () => {
    const account = await seedAccount("auth", [
      { key: "kept", name: "Kept", primary: true },
      { key: "move", name: "Moving", decision: "SPLIT" },
    ]);
    const ready = await prepareReady({ account });
    const before = await structuralSnapshot(account.clinicId);
    await expect(
      executeClinicAccountSplit({
        preparationId: ready.preparationId,
        confirmation: `split ${account.sites[1]!.slug}`,
        operatorUserId: account.adminId,
      })
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(await structuralSnapshot(account.clinicId)).toEqual(before);
    const status = await db().clinicAccountSplitPreparation.findUnique({
      where: { id: ready.preparationId },
      select: { status: true },
    });
    expect(status?.status).toBe("READY_TO_EXECUTE");
  });

  it("rejects the wrong confirmation with no structural change", async () => {
    const account = await seedAccount("phrase", [
      { key: "kept", name: "Kept", primary: true },
      { key: "move", name: "Moving", decision: "SPLIT" },
    ]);
    const ready = await prepareReady({ account });
    const before = await structuralSnapshot(account.clinicId);
    await expect(
      executeClinicAccountSplit({
        preparationId: ready.preparationId,
        confirmation: `Group ${account.clinicId}`,
        operatorUserId: account.operatorId,
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);
    expect(await structuralSnapshot(account.clinicId)).toEqual(before);
    const status = await db().clinicAccountSplitPreparation.findUnique({
      where: { id: ready.preparationId },
      select: { status: true, executedAt: true },
    });
    expect(status).toMatchObject({
      status: "READY_TO_EXECUTE",
      executedAt: null,
    });
  });

  it("moves one site, keeps public slugs, and is idempotent", async () => {
    const account = await seedAccount("base", [
      { key: "kept", name: "Kept Clinic", primary: true },
      { key: "move", name: "Moving Clinic", decision: "SPLIT" },
    ]);
    const move = account.sites.find((site) => site.key === "move")!;
    const kept = account.sites.find((site) => site.key === "kept")!;
    const guideId = `${PREFIX}guide_base`;
    const placementId = `${PREFIX}place_base`;
    await db().practiceGuide.create({
      data: {
        id: guideId,
        clinicId: account.clinicId,
        title: "Extraction",
        publicSlug: "extraction",
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
        publishedAt: new Date("2026-09-01T00:00:00.000Z"),
        contentRevisions: {
          create: {
            id: `${PREFIX}rev_base`,
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            title: "Extraction",
            publishedAt: new Date("2026-09-01T00:00:00.000Z"),
            sections: {
              create: {
                key: "care",
                kind: GuideSectionKind.SITE_CARE,
                title: "Care",
                body: "Visible rinse instructions",
                sortOrder: 0,
                provenance: PracticeSectionProvenance.PRACTICE_CUSTOM,
              },
            },
          },
        },
      },
    });
    await db().practiceGuidePlacement.create({
      data: {
        id: placementId,
        clinicId: account.clinicId,
        locationId: move.locationId,
        practiceGuideId: guideId,
        publishedPracticeGuideRevisionId: `${PREFIX}rev_base`,
        publicSlug: "extraction",
        isEnabled: true,
      },
    });
    const ready = await prepareReady({ account });
    const first = await executeClinicAccountSplit({
      preparationId: ready.preparationId,
      confirmation: `split ${move.slug}`,
      operatorUserId: account.operatorId,
    });
    expect(first.alreadyCompleted).toBe(false);
    expect(first.movedSite).toMatchObject({ id: move.id, slug: move.slug });
    expect(first.sourcePrimarySite.id).toBe(kept.id);
    expect(first.destination.slug).toBe(move.slug);
    expect(first.source.slug).toBe(kept.slug);
    expect(first.guideCopyCount).toBe(1);
    expect(isSplitShellCompatibilitySlug(first.destination.slug)).toBe(false);

    const moved = await db().clinicSite.findUniqueOrThrow({
      where: { id: move.id },
    });
    expect(moved.clinicId).toBe(ready.destinationId);
    expect(moved.slug).toBe(move.slug);
    expect(moved.isPrimary).toBe(true);
    const location = await db().clinicLocation.findUniqueOrThrow({
      where: { id: move.locationId },
    });
    expect(location.clinicId).toBe(ready.destinationId);
    expect(location.slug).toBeNull();
    expect(location.servesSiteRoot).toBe(true);
    const placement = await db().practiceGuidePlacement.findUniqueOrThrow({
      where: { id: placementId },
    });
    expect(placement.id).toBe(placementId);
    expect(placement.publicSlug).toBe("extraction");
    expect(placement.clinicId).toBe(ready.destinationId);
    expect(placement.practiceGuideId).not.toBe(guideId);

    const sourcePlan = await db().clinicEntitlement.findUnique({
      where: { clinicId: account.clinicId },
      select: { commercialPlan: true },
    });
    expect(sourcePlan?.commercialPlan).toBe("GROUP");

    const second = await executeClinicAccountSplit({
      preparationId: ready.preparationId,
      confirmation: "ignored because it is already complete",
      operatorUserId: account.operatorId,
    });
    expect(second.alreadyCompleted).toBe(true);
    expect(second.executedAt).toEqual(first.executedAt);
    expect(
      await db().practiceGuide.count({
        where: { clinicId: ready.destinationId },
      })
    ).toBe(1);
    expect(
      await db().clinicAccountSplitGuideMap.count({
        where: { preparationId: ready.preparationId },
      })
    ).toBe(1);
    expect(
      await db().clinicMembership.count({
        where: { clinicId: ready.destinationId, userId: account.adminId },
      })
    ).toBe(1);
  });

  it.each([
    ["after_guide_copies", "gcopy"],
    ["after_placement_deletion", "pdel"],
    ["after_site_move", "smove"],
    ["after_placement_reinsertion", "pins"],
    ["after_membership_changes", "memb"],
  ] as const)("rolls back completely after %s", async (point, key) => {
    const account = await seedAccount(key, [
      { key: "kept", name: "Kept", primary: true },
      { key: "move", name: "Moving", decision: "SPLIT" },
    ]);
    const move = account.sites.find((site) => site.key === "move")!;
    const guideId = `${PREFIX}guide_${point}`;
    await db().practiceGuide.create({
      data: {
        id: guideId,
        clinicId: account.clinicId,
        title: "Rollback",
        publicSlug: "rollback",
        status: PracticeGuideStatus.DRAFT,
        isEnabled: false,
      },
    });
    await db().practiceGuidePlacement.create({
      data: {
        id: `${PREFIX}place_${point}`,
        clinicId: account.clinicId,
        locationId: move.locationId,
        practiceGuideId: guideId,
        publicSlug: "rollback",
        isEnabled: false,
      },
    });
    const ready = await prepareReady({ account });
    const before = await structuralSnapshot(account.clinicId);
    await expect(
      executeClinicAccountSplit({
        preparationId: ready.preparationId,
        confirmation: `split ${move.slug}`,
        operatorUserId: account.operatorId,
        hooks: { interruptAfter: point },
      })
    ).rejects.toBeInstanceOf(AccountSplitExecutionInterrupted);
    expect(await structuralSnapshot(account.clinicId)).toEqual(before);
    expect(
      await db().practiceGuide.count({
        where: { clinicId: ready.destinationId },
      })
    ).toBe(0);
    expect(
      await db().clinicAccountSplitGuideMap.count({
        where: { preparationId: ready.preparationId },
      })
    ).toBe(0);
    const status = await db().clinicAccountSplitPreparation.findUnique({
      where: { id: ready.preparationId },
      select: { status: true },
    });
    expect(status?.status).toBe("READY_TO_EXECUTE");
  });

  it("refuses execution when billing changes before the locks", async () => {
    const account = await seedAccount("race", [
      { key: "kept", name: "Kept", primary: true },
      { key: "move", name: "Moving", decision: "SPLIT" },
    ]);
    const move = account.sites.find((site) => site.key === "move")!;
    const ready = await prepareReady({ account });
    await db().clinicEntitlement.update({
      where: { clinicId: ready.destinationId },
      data: { cancelAtPeriodEnd: true },
    });
    await expect(
      executeClinicAccountSplit({
        preparationId: ready.preparationId,
        confirmation: `split ${move.slug}`,
        operatorUserId: account.operatorId,
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);
    const site = await db().clinicSite.findUniqueOrThrow({
      where: { id: move.id },
    });
    expect(site.clinicId).toBe(account.clinicId);
    const status = await db().clinicAccountSplitPreparation.findUnique({
      where: { id: ready.preparationId },
      select: { status: true },
    });
    expect(status?.status).not.toBe("COMPLETED");
    expect(status?.status).not.toBe("READY_TO_EXECUTE");
  });

  it("rejects an unrelated Clinic.slug collision", async () => {
    const account = await seedAccount("hit", [
      { key: "kept", name: "Kept", primary: true },
      { key: "move", name: "Moving", decision: "SPLIT" },
    ]);
    const move = account.sites.find((site) => site.key === "move")!;
    const ready = await prepareReady({ account });
    await db().clinic.create({
      data: {
        id: `${PREFIX}other_hit`,
        name: "Other",
        slug: move.slug,
        profile: { create: { displayName: "Other" } },
      },
    });
    const before = await structuralSnapshot(account.clinicId);
    await expect(
      executeClinicAccountSplit({
        preparationId: ready.preparationId,
        confirmation: `split ${move.slug}`,
        operatorUserId: account.operatorId,
      })
    ).rejects.toThrow(/compatibility address/i);
    expect(await structuralSnapshot(account.clinicId)).toEqual(before);
  });

  it("parks an xsp slug when source and destination compatibility slugs swap", async () => {
    const account = await seedAccount("swap", [
      { key: "kept", name: "Kept", primary: true },
      { key: "move", name: "Moving", decision: "SPLIT" },
    ]);
    const move = account.sites.find((site) => site.key === "move")!;
    const kept = account.sites.find((site) => site.key === "kept")!;
    const ready = await prepareReady({ account });
    const shell = await db().clinic.findUniqueOrThrow({
      where: { id: ready.destinationId },
      select: { slug: true },
    });
    await db().clinic.update({
      where: { id: ready.destinationId },
      data: { slug: kept.slug },
    });
    await db().clinic.update({
      where: { id: account.clinicId },
      data: { slug: move.slug },
    });
    const result = await executeClinicAccountSplit({
      preparationId: ready.preparationId,
      confirmation: `split ${move.slug}`,
      operatorUserId: account.operatorId,
    });
    expect(result.compatibilitySlugParked).toBe(true);
    expect(result.destination.slug).toBe(move.slug);
    expect(result.source.slug).toBe(kept.slug);
    expect(shell.slug).not.toBe(result.destination.slug);
    const parkedLeft = await db().clinic.count({
      where: {
        id: { in: [account.clinicId, ready.destinationId] },
        slug: { startsWith: "xsp" },
      },
    });
    expect(parkedLeft).toBe(0);
  });

  it("keeps a retained primary and sets the source slug from that site", async () => {
    const account = await seedAccount("seq", [
      { key: "kept", name: "Site A" },
      { key: "move", name: "Site B", decision: "SPLIT" },
      {
        key: "extra",
        name: "Site C",
        decision: "RETAIN_ON_SOURCE",
        primary: true,
      },
    ]);
    const move = account.sites.find((site) => site.key === "move")!;
    const extra = account.sites.find((site) => site.key === "extra")!;
    const kept = account.sites.find((site) => site.key === "kept")!;
    const ready = await prepareReady({ account });
    const result = await executeClinicAccountSplit({
      preparationId: ready.preparationId,
      confirmation: `split ${move.slug}`,
      operatorUserId: account.operatorId,
    });
    expect(result.source.slug).toBe(extra.slug);
    expect(result.source.slug).not.toBe(kept.slug);
    expect(result.sourcePrimarySite.id).toBe(extra.id);
    expect(result.practiceDowngradeReady).toBe(false);
    const sourceSites = await db().clinicSite.findMany({
      where: { clinicId: account.clinicId },
      select: { id: true },
    });
    expect(sourceSites.map((site) => site.id).sort()).toEqual(
      [kept.id, extra.id].sort()
    );
  });

  it("copies guide history once and leaves the source guide unchanged", async () => {
    const account = await seedAccount("hist", [
      { key: "kept", name: "Kept", primary: true },
      { key: "move", name: "Moving", decision: "SPLIT" },
    ]);
    const move = account.sites.find((site) => site.key === "move")!;
    const kept = account.sites.find((site) => site.key === "kept")!;
    const template = await db().guideTemplate.create({
      data: {
        slug: "asx-template-hist",
        title: "Template",
        specialty: "DENTAL",
        revisions: {
          create: {
            id: `${PREFIX}tpl_hist`,
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            publishedAt: new Date("2026-08-01T00:00:00.000Z"),
          },
        },
      },
    });
    const shared = await db().practiceGuide.create({
      data: {
        clinicId: account.clinicId,
        title: "Shared",
        publicSlug: "shared",
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
        guideTemplateId: template.id,
        pinnedRevisionId: `${PREFIX}tpl_hist`,
        sortOrder: 2,
        contentRevisions: {
          create: [
            {
              version: 0,
              status: GuideRevisionStatus.DRAFT,
              title: "Shared draft",
              createdByUserId: account.adminId,
            },
            {
              version: 1,
              status: GuideRevisionStatus.PUBLISHED,
              title: "Shared v1",
              publishedAt: new Date("2026-08-02T00:00:00.000Z"),
              reviewAttestedAt: new Date("2026-08-02T00:00:00.000Z"),
              reviewAttestedByUserId: account.adminId,
              createdByUserId: account.staffId,
              sections: {
                create: {
                  key: "intro",
                  kind: GuideSectionKind.INTRODUCTION,
                  title: "Intro",
                  body: "Shared body",
                  sortOrder: 0,
                  provenance: PracticeSectionProvenance.CANONICAL,
                },
              },
            },
            {
              version: 2,
              status: GuideRevisionStatus.PUBLISHED,
              title: "Shared v2",
              publishedAt: new Date("2026-08-03T00:00:00.000Z"),
              sections: {
                create: {
                  key: "later",
                  kind: GuideSectionKind.SITE_CARE,
                  title: "Later",
                  body: "Later body",
                  sortOrder: 0,
                  provenance: PracticeSectionProvenance.PRACTICE_CUSTOM,
                },
              },
            },
          ],
        },
        overrides: {
          create: { sectionKey: "intro", title: "Over", body: "Override body" },
        },
        additions: {
          create: {
            key: "extra",
            kind: GuideSectionKind.CUSTOM,
            title: "Added",
            body: "Addition body",
            sortOrder: 1,
          },
        },
      },
    });
    const only = await db().practiceGuide.create({
      data: {
        clinicId: account.clinicId,
        title: "Moving only",
        publicSlug: "moving-only",
        status: PracticeGuideStatus.DRAFT,
        isEnabled: false,
        sourceGuideTemplateId: template.id,
        adaptedAt: new Date("2026-07-01T00:00:00.000Z"),
        downgradeRetainedAt: new Date("2026-09-01T00:00:00.000Z"),
        downgradeRetentionUntil: new Date("2026-11-01T00:00:00.000Z"),
      },
    });
    const unrelated = await db().practiceGuide.create({
      data: {
        clinicId: account.clinicId,
        title: "Stays",
        publicSlug: "stays",
        status: PracticeGuideStatus.DRAFT,
        isEnabled: false,
      },
    });
    const published = await db().practiceGuideRevision.findFirstOrThrow({
      where: { practiceGuideId: shared.id, version: 2 },
    });
    const disabledId = `${PREFIX}disabled_hist`;
    const pinnedId = `${PREFIX}pinned_hist`;
    const nullPinId = `${PREFIX}null_hist`;
    await db().practiceGuidePlacement.createMany({
      data: [
        {
          id: `${PREFIX}kept_hist`,
          clinicId: account.clinicId,
          locationId: kept.locationId,
          practiceGuideId: shared.id,
          publicSlug: "shared",
          isEnabled: true,
          publishedPracticeGuideRevisionId: published.id,
        },
        {
          id: disabledId,
          clinicId: account.clinicId,
          locationId: move.locationId,
          practiceGuideId: shared.id,
          publicSlug: "shared",
          isEnabled: false,
          publishedPracticeGuideRevisionId: published.id,
        },
        {
          id: pinnedId,
          clinicId: account.clinicId,
          locationId: move.locationId,
          practiceGuideId: only.id,
          publicSlug: "moving-only",
          isEnabled: true,
          publishedPracticeGuideRevisionId: null,
        },
        {
          clinicId: account.clinicId,
          locationId: kept.locationId,
          practiceGuideId: unrelated.id,
          publicSlug: "stays",
          isEnabled: false,
        },
      ],
    });
    const sourceBefore = await db().practiceGuide.findUniqueOrThrow({
      where: { id: shared.id },
      include: {
        contentRevisions: {
          include: { sections: true },
          orderBy: { version: "asc" },
        },
        overrides: true,
        additions: true,
      },
    });
    const ready = await prepareReady({ account });
    await executeClinicAccountSplit({
      preparationId: ready.preparationId,
      confirmation: `split ${move.slug}`,
      operatorUserId: account.operatorId,
    });
    const sourceAfter = await db().practiceGuide.findUniqueOrThrow({
      where: { id: shared.id },
      include: {
        contentRevisions: {
          include: { sections: true },
          orderBy: { version: "asc" },
        },
        overrides: true,
        additions: true,
      },
    });
    expect(sourceAfter).toEqual(sourceBefore);
    const copies = await db().practiceGuide.findMany({
      where: { clinicId: ready.destinationId },
      include: {
        contentRevisions: {
          include: { sections: true },
          orderBy: { version: "asc" },
        },
        overrides: true,
        additions: true,
      },
    });
    expect(copies).toHaveLength(2);
    expect(
      copies.every((guide) => guide.copiedFromPracticeGuideId === null)
    ).toBe(true);
    const sharedCopy = copies.find((guide) => guide.publicSlug === "shared");
    const onlyCopy = copies.find((guide) => guide.publicSlug === "moving-only");
    expect(sharedCopy?.guideTemplateId).toBe(template.id);
    expect(sharedCopy?.pinnedRevisionId).toBe(`${PREFIX}tpl_hist`);
    expect(
      sharedCopy?.contentRevisions.map((revision) => revision.version)
    ).toEqual([0, 1, 2]);
    expect(sharedCopy?.overrides).toHaveLength(1);
    expect(sharedCopy?.additions).toHaveLength(1);
    expect(sharedCopy?.contentRevisions[1]?.reviewAttestedByUserId).toBe(
      account.adminId
    );
    expect(sharedCopy?.downgradeRetainedAt).toBeNull();
    expect(onlyCopy?.sourceGuideTemplateId).toBe(template.id);
    expect(onlyCopy?.adaptedAt).toEqual(new Date("2026-07-01T00:00:00.000Z"));
    expect(onlyCopy?.downgradeRetainedAt).toBeNull();
    expect(onlyCopy?.downgradeRetentionUntil).toBeNull();
    const disabled = await db().practiceGuidePlacement.findUniqueOrThrow({
      where: { id: disabledId },
    });
    expect(disabled.id).toBe(disabledId);
    expect(disabled.isEnabled).toBe(false);
    expect(disabled.practiceGuideId).toBe(sharedCopy?.id);
    const nullPin = await db().practiceGuidePlacement.findUniqueOrThrow({
      where: { id: pinnedId },
    });
    expect(nullPin.publishedPracticeGuideRevisionId).toBeNull();
    expect(nullPin.practiceGuideId).toBe(onlyCopy?.id);
    expect(
      await db().practiceGuide.findUnique({ where: { id: unrelated.id } })
    ).toMatchObject({ clinicId: account.clinicId });
    expect(
      await db().clinicAccountSplitGuideMap.count({
        where: { preparationId: ready.preparationId },
      })
    ).toBe(2);
    void nullPinId;
  });

  it("resolves the same public urls to the same site, location, and placement", async () => {
    const account = await seedAccount("url", [
      { key: "kept", name: "Kept", primary: true },
      { key: "move", name: "Coast Dental", decision: "SPLIT" },
    ]);
    const move = account.sites.find((site) => site.key === "move")!;
    const extraLocation = await db().clinicLocation.create({
      data: {
        id: `${PREFIX}tweed_url`,
        clinicSiteId: move.id,
        clinicId: account.clinicId,
        name: "Tweed Heads",
        slug: "tweed-heads",
        displayName: "Tweed Heads",
        isPrimary: false,
        servesSiteRoot: false,
        active: true,
      },
    });
    const guide = await db().practiceGuide.create({
      data: {
        clinicId: account.clinicId,
        title: "Extraction",
        publicSlug: "extraction",
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
        publishedAt: new Date("2026-09-01T00:00:00.000Z"),
        contentRevisions: {
          create: {
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            title: "Extraction",
            publishedAt: new Date("2026-09-01T00:00:00.000Z"),
            sections: {
              create: {
                key: "care",
                kind: GuideSectionKind.SITE_CARE,
                title: "Care",
                body: "Visible rinse instructions",
                sortOrder: 0,
                provenance: PracticeSectionProvenance.PRACTICE_CUSTOM,
              },
            },
          },
        },
      },
      include: { contentRevisions: true },
    });
    const revisionId = guide.contentRevisions[0]!.id;
    const rootPlacement = await db().practiceGuidePlacement.create({
      data: {
        id: `${PREFIX}root_url`,
        clinicId: account.clinicId,
        locationId: move.locationId,
        practiceGuideId: guide.id,
        publishedPracticeGuideRevisionId: revisionId,
        publicSlug: "extraction",
        isEnabled: true,
      },
    });
    const locationPlacement = await db().practiceGuidePlacement.create({
      data: {
        id: `${PREFIX}loc_url`,
        clinicId: account.clinicId,
        locationId: extraLocation.id,
        practiceGuideId: guide.id,
        publishedPracticeGuideRevisionId: revisionId,
        publicSlug: "extraction",
        isEnabled: true,
      },
    });
    const beforeRoot = await getPublishedPracticeGuide({
      clinicSlug: move.slug,
      publicSlug: "extraction",
    });
    const beforePlace = await getPatientLocation({
      siteSlug: move.slug,
      locationSlug: "tweed-heads",
    });
    const beforeLocationGuide = await getPublishedPracticeGuide({
      clinicSlug: move.slug,
      locationSlug: "tweed-heads",
      publicSlug: "extraction",
    });
    expect(beforeRoot?.practiceGuide.id).toBe(guide.id);
    expect(
      beforeRoot?.sections.some((section) =>
        section.body.includes("Visible rinse")
      )
    ).toBe(true);
    expect(beforePlace).toMatchObject({
      siteId: move.id,
      locationId: extraLocation.id,
    });
    expect(beforeLocationGuide?.practiceGuide.publicSlug).toBe("extraction");

    const ready = await prepareReady({ account, locationAllowance: 2 });
    await executeClinicAccountSplit({
      preparationId: ready.preparationId,
      confirmation: `split ${move.slug}`,
      operatorUserId: account.operatorId,
    });

    const afterRoot = await getPublishedPracticeGuide({
      clinicSlug: move.slug,
      publicSlug: "extraction",
    });
    const afterPlace = await getPatientLocation({
      siteSlug: move.slug,
      locationSlug: "tweed-heads",
    });
    const afterLocationGuide = await getPublishedPracticeGuide({
      clinicSlug: move.slug,
      locationSlug: "tweed-heads",
      publicSlug: "extraction",
    });
    const site = await db().clinicSite.findUniqueOrThrow({
      where: { slug: move.slug },
    });
    expect(site.id).toBe(move.id);
    expect(afterRoot?.practiceGuide.publicSlug).toBe("extraction");
    expect(afterRoot?.practiceGuide.id).not.toBe(guide.id);
    expect(afterRoot?.practiceGuide.id).toBe(
      afterLocationGuide?.practiceGuide.id
    );
    expect(afterRoot?.sections.map((section) => section.body)).toEqual(
      beforeRoot?.sections.map((section) => section.body)
    );
    expect(afterPlace).toMatchObject({
      siteId: move.id,
      locationId: extraLocation.id,
      locationSlug: "tweed-heads",
    });
    expect(await getClinicBySlug(move.slug)).not.toBeNull();
    expect(
      await db().practiceGuidePlacement.findUnique({
        where: { id: rootPlacement.id },
      })
    ).toMatchObject({ id: rootPlacement.id, publicSlug: "extraction" });
    expect(
      await db().practiceGuidePlacement.findUnique({
        where: { id: locationPlacement.id },
      })
    ).toMatchObject({ id: locationPlacement.id, publicSlug: "extraction" });
  });

  it("moves selected staff, keeps sessions for everyone else, and leaves invitations", async () => {
    const account = await seedAccount("team", [
      { key: "kept", name: "Kept", primary: true },
      { key: "move", name: "Moving", decision: "SPLIT" },
    ]);
    const move = account.sites.find((site) => site.key === "move")!;
    const destStaffId = `${PREFIX}dstaff_team`;
    const idleId = `${PREFIX}idle_team`;
    const inviteeId = `${PREFIX}invite_team`;
    await db().user.createMany({
      data: [
        {
          id: destStaffId,
          email: `${destStaffId}@example.test`,
          name: "Destination Staff",
        },
        { id: idleId, email: `${idleId}@example.test`, name: "Idle" },
        { id: inviteeId, email: `${inviteeId}@example.test`, name: "Invited" },
      ],
    });
    await db().clinicMembership.createMany({
      data: [
        { clinicId: account.clinicId, userId: destStaffId, role: "STAFF" },
        {
          clinicId: account.clinicId,
          userId: idleId,
          role: "STAFF",
          active: false,
        },
      ],
    });
    await db().accountToken.create({
      data: {
        type: AccountTokenType.INVITATION,
        tokenHash: `${PREFIX}token_team`,
        userId: inviteeId,
        clinicId: account.clinicId,
        email: `${inviteeId}@example.test`,
        role: "STAFF",
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const ready = await prepareReady({
      account,
      destinationAdmin: true,
      staff: [
        {
          userId: account.adminId,
          keepOnSource: false,
          grantOnDestination: true,
          destinationRole: "ADMIN",
        },
        {
          userId: account.staffId,
          keepOnSource: true,
          grantOnDestination: false,
          destinationRole: "STAFF",
        },
        {
          userId: destStaffId,
          keepOnSource: false,
          grantOnDestination: true,
          destinationRole: "STAFF",
        },
      ],
    });
    const established = await db().clinicMembership.findFirstOrThrow({
      where: { clinicId: ready.destinationId, role: "ADMIN" },
    });
    for (const userId of [
      account.adminId,
      account.staffId,
      destStaffId,
      idleId,
      established.userId,
    ]) {
      await db().session.create({
        data: {
          sessionToken: `${PREFIX}sess_${userId}`,
          userId,
          expires: new Date(Date.now() + 86_400_000),
        },
      });
    }
    await executeClinicAccountSplit({
      preparationId: ready.preparationId,
      confirmation: `split ${move.slug}`,
      operatorUserId: account.operatorId,
    });
    const sourceMembers = await db().clinicMembership.findMany({
      where: { clinicId: account.clinicId, active: true },
    });
    const destinationMembers = await db().clinicMembership.findMany({
      where: { clinicId: ready.destinationId, active: true },
    });
    expect(sourceMembers.map((row) => row.userId)).toEqual([account.staffId]);
    expect(
      destinationMembers.map((row) => `${row.userId}:${row.role}`).sort()
    ).toEqual(
      [
        `${account.adminId}:ADMIN`,
        `${destStaffId}:STAFF`,
        `${established.userId}:ADMIN`,
      ].sort()
    );
    const overlap = sourceMembers.filter((member) =>
      destinationMembers.some((other) => other.userId === member.userId)
    );
    expect(overlap).toEqual([]);
    const sessions = await db().session.findMany({
      where: { sessionToken: { startsWith: PREFIX } },
      select: { userId: true },
    });
    expect(sessions.map((row) => row.userId).sort()).toEqual(
      [account.staffId, idleId, established.userId].sort()
    );
    const idle = await db().clinicMembership.findUnique({
      where: {
        clinicId_userId: { clinicId: account.clinicId, userId: idleId },
      },
    });
    expect(idle).toMatchObject({ active: false, role: "STAFF" });
    const invitation = await db().accountToken.findUniqueOrThrow({
      where: { tokenHash: `${PREFIX}token_team` },
    });
    expect(invitation.clinicId).toBe(account.clinicId);
    expect(invitation.consumedAt).toBeNull();
  });

  it("deactivates a non-primary site and a primary site with promotion", async () => {
    const account = await seedAccount("off", [
      { key: "kept", name: "Kept" },
      { key: "move", name: "Moving", decision: "SPLIT" },
      {
        key: "extra",
        name: "Old primary",
        decision: "DEACTIVATE",
        primary: true,
      },
    ]);
    const move = account.sites.find((site) => site.key === "move")!;
    const extra = account.sites.find((site) => site.key === "extra")!;
    const kept = account.sites.find((site) => site.key === "kept")!;
    await db().practiceGuide.create({
      data: {
        id: `${PREFIX}guide_off`,
        clinicId: account.clinicId,
        title: "Old",
        publicSlug: "old-guide",
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
      },
    });
    await db().practiceGuidePlacement.create({
      data: {
        id: `${PREFIX}place_off`,
        clinicId: account.clinicId,
        locationId: extra.locationId,
        practiceGuideId: `${PREFIX}guide_off`,
        publicSlug: "old-guide",
        isEnabled: true,
      },
    });
    const ready = await prepareReady({ account });
    const result = await executeClinicAccountSplit({
      preparationId: ready.preparationId,
      confirmation: `split ${move.slug}`,
      operatorUserId: account.operatorId,
    });
    expect(result.deactivatedSiteCount).toBe(1);
    expect(result.sourcePrimarySite.id).toBe(kept.id);
    const deactivated = await db().clinicSite.findUniqueOrThrow({
      where: { id: extra.id },
    });
    expect(deactivated).toMatchObject({
      clinicId: account.clinicId,
      active: false,
      slug: extra.slug,
    });
    expect(await getClinicBySlug(extra.slug)).toBeNull();
    expect(
      await db().clinicLocation.count({ where: { clinicSiteId: extra.id } })
    ).toBe(1);
    expect(
      await db().practiceGuidePlacement.count({
        where: { locationId: extra.locationId },
      })
    ).toBe(1);
  });

  it("mirrors profiles onto the post-execution primary sites without calling storage", async () => {
    const account = await seedAccount("logo", [
      { key: "kept", name: "Kept", primary: false },
      { key: "move", name: "Moving", decision: "SPLIT", primary: true },
    ]);
    const move = account.sites.find((site) => site.key === "move")!;
    const kept = account.sites.find((site) => site.key === "kept")!;
    await db().clinicProfile.update({
      where: { clinicId: account.clinicId },
      data: { logoUrl: `clinics/${account.clinicId}/branding/move.png` },
    });
    const ready = await prepareReady({ account });
    await executeClinicAccountSplit({
      preparationId: ready.preparationId,
      confirmation: `split ${move.slug}`,
      operatorUserId: account.operatorId,
    });
    const sourceProfile = await db().clinicProfile.findUniqueOrThrow({
      where: { clinicId: account.clinicId },
    });
    const destinationProfile = await db().clinicProfile.findUniqueOrThrow({
      where: { clinicId: ready.destinationId },
    });
    const movedSite = await db().clinicSite.findUniqueOrThrow({
      where: { id: move.id },
    });
    expect(sourceProfile.logoUrl).toBe(
      `clinics/${account.clinicId}/branding/kept.png`
    );
    expect(sourceProfile.displayName).toBe("Kept");
    expect(sourceProfile.logoUrl).not.toBe(movedSite.logoUrl);
    expect(destinationProfile.logoUrl).toBe(movedSite.logoUrl);
    expect(destinationProfile.displayName).toBe("Moving");
    expect(movedSite.logoUrl).toBe(
      `clinics/${account.clinicId}/branding/move.png`
    );
    expect(kept.id).not.toBe(move.id);
  });

  it("waits for one account lock and then completes", async () => {
    const account = await seedAccount("dead", [
      { key: "kept", name: "Kept", primary: true },
      { key: "move", name: "Moving", decision: "SPLIT" },
    ]);
    const move = account.sites.find((site) => site.key === "move")!;
    const ready = await prepareReady({ account, destinationAdmin: true });
    const first = [account.clinicId, ready.destinationId].sort()[0]!;
    const release = deferred();
    const readyLock = deferred();
    const holder = db().$transaction(
      async (tx) => {
        await lockClinicAccountStructure(tx, first);
        readyLock.resolve();
        await release.promise;
      },
      { maxWait: 10_000, timeout: 20_000 }
    );
    await readyLock.promise;
    let settled = false;
    const execution = executeClinicAccountSplit({
      preparationId: ready.preparationId,
      confirmation: `split ${move.slug}`,
      operatorUserId: account.operatorId,
      hooks: {
        afterLocks: () => {
          settled = true;
        },
      },
    }).finally(() => undefined);
    const counts = await waitForStructureWaiter(first);
    expect(counts.waiting).toBeGreaterThanOrEqual(1);
    expect(settled).toBe(false);
    release.resolve();
    await holder;
    const result = await execution;
    expect(result.alreadyCompleted).toBe(false);
    expect(result.movedSite.id).toBe(move.id);
  });

  it("blocks concurrent account mutations until execution commits", async () => {
    const account = await seedAccount("lock", [
      { key: "kept", name: "Kept", primary: true },
      { key: "move", name: "Moving", decision: "SPLIT" },
    ]);
    const move = account.sites.find((site) => site.key === "move")!;
    const kept = account.sites.find((site) => site.key === "kept")!;
    const guide = await db().practiceGuide.create({
      data: {
        clinicId: account.clinicId,
        title: "Draft",
        publicSlug: "draft-guide",
        status: PracticeGuideStatus.DRAFT,
        isEnabled: false,
        contentRevisions: {
          create: {
            version: 0,
            status: GuideRevisionStatus.DRAFT,
            title: "Draft",
            sections: {
              create: {
                key: "care",
                kind: GuideSectionKind.SITE_CARE,
                title: "Care",
                body: "Draft body",
                sortOrder: 0,
                provenance: PracticeSectionProvenance.PRACTICE_CUSTOM,
              },
            },
          },
        },
      },
    });
    await db().practiceGuidePlacement.create({
      data: {
        clinicId: account.clinicId,
        locationId: kept.locationId,
        practiceGuideId: guide.id,
        publicSlug: "draft-guide",
        isEnabled: false,
      },
    });
    const ready = await prepareReady({
      account,
      destinationAdmin: true,
      staff: [
        {
          userId: account.adminId,
          keepOnSource: true,
          grantOnDestination: false,
          destinationRole: "ADMIN",
        },
        {
          userId: account.staffId,
          keepOnSource: true,
          grantOnDestination: false,
          destinationRole: "STAFF",
        },
      ],
    });
    const membership = await db().clinicMembership.findUniqueOrThrow({
      where: {
        clinicId_userId: {
          clinicId: account.clinicId,
          userId: account.staffId,
        },
      },
    });
    const release = deferred();
    const holding = deferred();
    const execution = executeClinicAccountSplit({
      preparationId: ready.preparationId,
      confirmation: `split ${move.slug}`,
      operatorUserId: account.operatorId,
      hooks: {
        afterLocks: async () => {
          holding.resolve();
          await release.promise;
        },
      },
    });
    await holding.promise;
    const publish = publishPracticeGuide({
      clinicId: account.clinicId,
      actorUserId: account.adminId,
      guideId: guide.id,
      reviewAttested: true,
    });
    const branding = updateClinicSiteBranding({
      clinicId: account.clinicId,
      siteId: kept.id,
      values: {
        name: "Kept renamed",
        displayName: "Kept",
        logoUrl: null,
        darkLogoUrl: null,
        faviconUrl: null,
        primaryColor: "#112233",
        accentColor: "#445566",
        darkPrimaryColor: null,
        darkAccentColor: null,
        useCustomDarkBranding: false,
        neutralColor: "#ffffff",
        radiusPreset: "MEDIUM",
        typeface: null,
        instructionTerminology: "AFTERCARE",
        themeMode: "SYSTEM",
        allowPatientThemeToggle: false,
        showCareGuideAttribution: true,
      },
    });
    const placement = setGuideAvailableAtLocation({
      clinicId: account.clinicId,
      guideId: guide.id,
      locationId: kept.locationId,
      available: true,
    });
    const membershipChange = changeClinicMembershipRole({
      clinicId: account.clinicId,
      membershipId: membership.id,
      role: "ADMIN",
    });
    const billing = db().$transaction(async (tx) => {
      await lockClinicAccountStructure(tx, account.clinicId);
      await tx.clinicEntitlement.update({
        where: { clinicId: account.clinicId },
        data: { extraTeamMemberAllowance: 1 },
      });
    });
    const waiting = await waitForStructureWaiter(account.clinicId);
    expect(waiting.waiting).toBeGreaterThanOrEqual(1);
    release.resolve();
    const [published, role] = await Promise.all([
      execution,
      publish,
      branding,
      placement,
      membershipChange,
      billing,
    ]).then((values) => [values[0], values[4]] as const);
    expect(published.movedSite.id).toBe(move.id);
    expect(role).toMatchObject({ ok: true });
    const renamed = await db().clinicSite.findUniqueOrThrow({
      where: { id: kept.id },
    });
    expect(renamed.name).toBe("Kept renamed");
    const entitlement = await db().clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: account.clinicId },
    });
    expect(entitlement.commercialPlan).toBe("GROUP");
    expect(entitlement.extraTeamMemberAllowance).toBe(1);
  });

  it("does not call Stripe, Resend, R2, or fetch from the execution module", () => {
    const source = readFileSync("lib/account-split/execute.ts", "utf8");
    expect(source).not.toMatch(
      /from ["']stripe|from ["']resend|@aws-sdk|fetch\(/
    );
    expect(previewAccountSplit).toBeTypeOf("function");
  });
});

async function advisoryLockCounts(lockKey: string) {
  const rows = await db().$queryRaw<
    Array<{ granted: number; waiting: number }>
  >`
    SELECT
      COALESCE(SUM(CASE WHEN l.granted THEN 1 ELSE 0 END), 0)::int AS granted,
      COALESCE(SUM(CASE WHEN NOT l.granted THEN 1 ELSE 0 END), 0)::int AS waiting
    FROM pg_locks l
    WHERE l.locktype = 'advisory'
      AND l.objsubid = 1
      AND ((l.classid::bigint << 32) | l.objid::bigint) = hashtext(${lockKey})::bigint
  `;
  return {
    granted: Number(rows[0]?.granted ?? 0),
    waiting: Number(rows[0]?.waiting ?? 0),
  };
}

async function waitForStructureWaiter(clinicId: string) {
  const lockKey = clinicAccountStructureLockKey(clinicId);
  const started = Date.now();
  let last = { granted: 0, waiting: 0 };
  while (Date.now() - started < 8_000) {
    last = await advisoryLockCounts(lockKey);
    if (last.granted >= 1 && last.waiting >= 1) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `No session was waiting on ${lockKey}. granted=${last.granted} waiting=${last.waiting}`
  );
}
