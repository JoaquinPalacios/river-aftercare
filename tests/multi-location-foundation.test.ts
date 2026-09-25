import "dotenv/config";
import { readFileSync } from "node:fs";

import { Prisma } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/prisma";
import { findDestructiveSql } from "@/lib/release/prisma-migration-gate.mjs";

const MIGRATION_PATH =
  "prisma/migrations/20260925021500_add_multi_location_foundation/migration.sql";
const BACKFILL_BEGIN = "-- river-aftercare:multi-location-backfill-begin";
const BACKFILL_END = "-- river-aftercare:multi-location-backfill-end";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const describeDb = hasDatabase ? describe : describe.skip;

const PREFIX = "mlfnd_";

function migrationSql(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

function backfillSql(): string {
  const sql = migrationSql();
  const start = sql.indexOf(BACKFILL_BEGIN);
  const end = sql.indexOf(BACKFILL_END);
  if (start < 0 || end < start) {
    throw new Error("multi-location backfill markers missing");
  }
  return sql.slice(start + BACKFILL_BEGIN.length, end).trim();
}

async function rerunBackfill(): Promise<void> {
  const statements = backfillSql()
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
  expect(statements).toHaveLength(2);
  for (const statement of statements) {
    await getPrisma().$executeRawUnsafe(statement);
  }
}

function constraintMessage(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `${error.code}\n${error.message}\n${JSON.stringify(error.meta ?? {})}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

describe("multi-location foundation migration", () => {
  it("is additive", () => {
    const sql = migrationSql();
    expect(findDestructiveSql(sql)).toEqual([]);
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE|SCHEMA)\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\bALTER\s+TABLE\b[\s\S]{0,200}\bDROP\b/i);
    expect(sql).toContain('ADD COLUMN "copiedFromPracticeGuideId"');
    expect(sql).toContain(
      'ADD COLUMN "extraLocationAllowance" INTEGER NOT NULL DEFAULT 0'
    );
    expect(sql).toContain("ClinicLocation_root_slug_check");
    expect(sql).toContain("ClinicLocation_one_primary_per_clinic_key");
    expect(sql).toContain("ClinicLocation_one_account_root_per_clinic_key");
    expect(sql).not.toMatch(/isPrimary"\s*=\s*"servesAccountRoot/);
  });

  it("backfills every clinic, including demodental, without inventing a root slug", () => {
    const sql = backfillSql();
    expect(sql).toContain('FROM "Clinic" AS clinic');
    expect(sql).not.toMatch(/clinic\."slug"\s*(<>|=)/);
    expect(sql).not.toMatch(/demodental/);
    expect(sql).toContain("NULL");
    expect(sql).not.toMatch(/'primary'|\"primary\"|'main'/);
    expect(sql).toContain("WHERE NOT EXISTS");
  });
});

describeDb("multi-location foundation database", () => {
  function prisma() {
    return getPrisma();
  }

  async function cleanupOwned() {
    await prisma().clinic.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });
    await prisma().guideTemplate.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });
  }

  afterAll(async () => {
    if (!hasDatabase) {
      return;
    }
    await cleanupOwned();
    await prisma().$disconnect();
  });

  async function createClinic(
    id: string,
    slug: string,
    name = "Foundation Clinic"
  ) {
    return prisma().clinic.create({
      data: { id, name, slug },
    });
  }

  it("relates a location to exactly one clinic and scopes slug uniqueness to that clinic", async () => {
    await cleanupOwned();
    await createClinic(`${PREFIX}clinic_a`, "mlfnd-clinic-a", "Clinic A");
    await createClinic(`${PREFIX}clinic_b`, "mlfnd-clinic-b", "Clinic B");

    const location = await prisma().clinicLocation.create({
      data: {
        id: `${PREFIX}loc_a`,
        clinicId: `${PREFIX}clinic_a`,
        name: "Burleigh Heads",
        displayName: "Burleigh Heads",
        slug: null,
        isPrimary: true,
        servesAccountRoot: true,
        active: true,
      },
    });

    const loaded = await prisma().clinic.findUnique({
      where: { id: `${PREFIX}clinic_a` },
      include: { locations: true },
    });
    expect(loaded?.locations).toEqual([
      expect.objectContaining({
        id: location.id,
        clinicId: `${PREFIX}clinic_a`,
      }),
    ]);

    await prisma().clinicLocation.create({
      data: {
        id: `${PREFIX}loc_b`,
        clinicId: `${PREFIX}clinic_b`,
        name: "Robina",
        displayName: "Robina",
        slug: "robina",
        isPrimary: false,
        servesAccountRoot: false,
        active: true,
      },
    });
    await prisma().clinicLocation.create({
      data: {
        id: `${PREFIX}loc_a_robina`,
        clinicId: `${PREFIX}clinic_a`,
        name: "Robina",
        displayName: "Robina",
        slug: "robina",
        isPrimary: false,
        servesAccountRoot: false,
        active: true,
      },
    });

    await expect(
      prisma().clinicLocation.create({
        data: {
          id: `${PREFIX}loc_a_robina_dup`,
          clinicId: `${PREFIX}clinic_a`,
          name: "Robina again",
          displayName: "Robina again",
          slug: "robina",
          isPrimary: false,
          servesAccountRoot: false,
          active: true,
        },
      })
    ).rejects.toThrow(/ClinicLocation_clinicId_slug_key/);
  });

  it("allows primary and account-root to differ, and rejects a second of either", async () => {
    await cleanupOwned();
    await createClinic(`${PREFIX}split`, "mlfnd-split");

    await prisma().clinicLocation.create({
      data: {
        id: `${PREFIX}split_root`,
        clinicId: `${PREFIX}split`,
        name: "Historic root",
        displayName: "Historic root",
        slug: null,
        isPrimary: false,
        servesAccountRoot: true,
        active: true,
      },
    });
    await prisma().clinicLocation.create({
      data: {
        id: `${PREFIX}split_primary`,
        clinicId: `${PREFIX}split`,
        name: "Editing default",
        displayName: "Editing default",
        slug: "burleigh",
        isPrimary: true,
        servesAccountRoot: false,
        active: true,
      },
    });

    await expect(
      prisma().clinicLocation.create({
        data: {
          id: `${PREFIX}split_primary_2`,
          clinicId: `${PREFIX}split`,
          name: "Second primary",
          displayName: "Second primary",
          slug: "broadbeach",
          isPrimary: true,
          servesAccountRoot: false,
          active: false,
        },
      })
    ).rejects.toThrow(/ClinicLocation_one_primary_per_clinic_key/);

    await expect(
      prisma().clinicLocation.create({
        data: {
          id: `${PREFIX}split_root_2`,
          clinicId: `${PREFIX}split`,
          name: "Second root",
          displayName: "Second root",
          slug: null,
          isPrimary: false,
          servesAccountRoot: true,
          active: true,
        },
      })
    ).rejects.toThrow(/ClinicLocation_one_account_root_per_clinic_key/);

    await expect(
      prisma().clinicLocation.create({
        data: {
          id: `${PREFIX}split_root_slug`,
          clinicId: `${PREFIX}split`,
          name: "Root with slug",
          displayName: "Root with slug",
          slug: "main",
          isPrimary: false,
          servesAccountRoot: true,
          active: true,
        },
      })
    ).rejects.toThrow(
      /ClinicLocation_root_slug_check|ClinicLocation_one_account_root_per_clinic_key/
    );

    await expect(
      prisma().clinicLocation.create({
        data: {
          clinicId: `${PREFIX}split`,
          name: "Missing slug",
          displayName: "Missing slug",
          slug: null,
          isPrimary: false,
          servesAccountRoot: false,
          active: true,
        },
      })
    ).rejects.toThrow(/ClinicLocation_root_slug_check/);

    await expect(
      prisma().clinicLocation.create({
        data: {
          clinicId: `${PREFIX}split`,
          name: "Bad slug",
          displayName: "Bad slug",
          slug: "Robina Heads",
          isPrimary: false,
          servesAccountRoot: false,
          active: true,
        },
      })
    ).rejects.toThrow(/ClinicLocation_slug_format_check/);
  });

  it("scopes placement slugs to a location and keeps copy provenance optional", async () => {
    await cleanupOwned();
    await createClinic(`${PREFIX}place`, "mlfnd-place");
    const root = await prisma().clinicLocation.create({
      data: {
        id: `${PREFIX}place_root`,
        clinicId: `${PREFIX}place`,
        name: "Root",
        displayName: "Root",
        slug: null,
        isPrimary: true,
        servesAccountRoot: true,
      },
    });
    const other = await prisma().clinicLocation.create({
      data: {
        id: `${PREFIX}place_other`,
        clinicId: `${PREFIX}place`,
        name: "Robina",
        displayName: "Robina",
        slug: "robina",
        isPrimary: false,
        servesAccountRoot: false,
      },
    });
    const source = await prisma().practiceGuide.create({
      data: {
        id: `${PREFIX}guide_source`,
        clinicId: `${PREFIX}place`,
        title: "Source",
        publicSlug: "source-guide",
      },
    });
    const copy = await prisma().practiceGuide.create({
      data: {
        id: `${PREFIX}guide_copy`,
        clinicId: `${PREFIX}place`,
        title: "Copy",
        publicSlug: "copy-guide",
        copiedFromPracticeGuideId: source.id,
      },
    });
    expect(source.copiedFromPracticeGuideId).toBeNull();
    expect(copy.copiedFromPracticeGuideId).toBe(source.id);

    await prisma().practiceGuidePlacement.create({
      data: {
        practiceGuideId: source.id,
        locationId: root.id,
        publicSlug: "extraction",
        isEnabled: true,
      },
    });
    await prisma().practiceGuidePlacement.create({
      data: {
        practiceGuideId: source.id,
        locationId: other.id,
        publicSlug: "extraction",
        isEnabled: false,
      },
    });
    await expect(
      prisma().practiceGuidePlacement.create({
        data: {
          practiceGuideId: copy.id,
          locationId: root.id,
          publicSlug: "extraction",
          isEnabled: false,
        },
      })
    ).rejects.toThrow(/PracticeGuidePlacement_locationId_publicSlug_key/);
    await expect(
      prisma().practiceGuidePlacement.create({
        data: {
          practiceGuideId: source.id,
          locationId: root.id,
          publicSlug: "other-slug",
          isEnabled: false,
        },
      })
    ).rejects.toThrow(/PracticeGuidePlacement_locationId_practiceGuideId_key/);

    const loaded = await prisma().practiceGuidePlacement.findFirst({
      where: { practiceGuideId: source.id, locationId: root.id },
      include: {
        practiceGuide: true,
        location: true,
        publishedPracticeGuideRevision: true,
      },
    });
    expect(loaded?.publishedPracticeGuideRevisionId).toBeNull();
    expect(loaded?.practiceGuide.clinicId).toBe(loaded?.location.clinicId);
  });

  it("defaults extraLocationAllowance to 0 and rejects a negative value", async () => {
    await cleanupOwned();
    await createClinic(`${PREFIX}ent`, "mlfnd-ent");
    const entitlement = await prisma().clinicEntitlement.create({
      data: {
        id: `${PREFIX}entitlement`,
        clinicId: `${PREFIX}ent`,
        billingStatus: "ACTIVE",
        entitlementStatus: "ACTIVE",
      },
    });
    expect(entitlement.extraLocationAllowance).toBe(0);

    await expect(
      prisma().$executeRaw`
        UPDATE "ClinicEntitlement"
        SET "extraLocationAllowance" = -1
        WHERE "id" = ${entitlement.id}
      `
    ).rejects.toThrow(/ClinicEntitlement_extraLocationAllowance_check/);
  });

  it("stores a downgrade location selection against the existing preparation", async () => {
    await cleanupOwned();
    await createClinic(`${PREFIX}down`, "mlfnd-down");
    const location = await prisma().clinicLocation.create({
      data: {
        id: `${PREFIX}down_root`,
        clinicId: `${PREFIX}down`,
        name: "Root",
        displayName: "Root",
        slug: null,
        isPrimary: true,
        servesAccountRoot: true,
      },
    });
    const preparation = await prisma().clinicDowngradePreparation.create({
      data: {
        id: `${PREFIX}prep`,
        clinicId: `${PREFIX}down`,
        targetPlan: "ESSENTIAL",
        status: "AWAITING_SELECTION",
      },
    });
    const selection = await prisma().downgradeLocationSelection.create({
      data: {
        id: `${PREFIX}down_sel`,
        preparationId: preparation.id,
        locationId: location.id,
      },
    });
    const loaded = await prisma().clinicDowngradePreparation.findUnique({
      where: { id: preparation.id },
      include: { locationSelections: true },
    });
    expect(loaded?.locationSelections.map((row) => row.id)).toEqual([
      selection.id,
    ]);

    await expect(
      prisma().downgradeLocationSelection.create({
        data: {
          preparationId: preparation.id,
          locationId: location.id,
        },
      })
    ).rejects.toThrow(
      /DowngradeLocationSelection_preparationId_locationId_key/
    );
  });

  it("backfills one root location and preserves profile fields and Clinic.slug", async () => {
    await cleanupOwned();
    const withProfile = await createClinic(
      `${PREFIX}profile`,
      "mlfnd-profile",
      "Pacific Dental Account"
    );
    await prisma().clinicProfile.create({
      data: {
        clinicId: withProfile.id,
        displayName: "Pacific Dental",
        logoUrl: "clinics/profile/branding/logo.png",
        primaryColor: "#112233",
        phone: "07 5555 0101",
        addressLine1: "1 The Esplanade",
        addressLine2: "Level 2",
        city: "Burleigh Heads",
        region: "QLD",
        postalCode: "4220",
        country: "AU",
        contactUrl: "https://example.com/contact",
        contactEmail: "hello@example.com",
        bookingUrl: "https://example.com/book",
        emergencyInstructions: "Call the practice.",
      },
    });
    await createClinic(`${PREFIX}bare`, "mlfnd-bare", "Bare Clinic");
    await createClinic(
      `${PREFIX}noent`,
      "mlfnd-noent",
      "No Entitlement Clinic"
    );
    await prisma().clinicEntitlement.create({
      data: {
        id: `${PREFIX}profile_entitlement`,
        clinicId: withProfile.id,
        billingStatus: "OFFER_PREPARED",
        entitlementStatus: "PENDING",
        extraTeamMemberAllowance: 2,
      },
    });

    await rerunBackfill();
    await rerunBackfill();

    const profileClinic = await prisma().clinic.findUniqueOrThrow({
      where: { id: withProfile.id },
      include: { profile: true, locations: true, entitlement: true },
    });
    expect(profileClinic.slug).toBe("mlfnd-profile");
    expect(profileClinic.locations).toHaveLength(1);
    expect(profileClinic.locations[0]).toMatchObject({
      slug: null,
      name: "Pacific Dental",
      displayName: "Pacific Dental",
      phone: "07 5555 0101",
      addressLine1: "1 The Esplanade",
      addressLine2: "Level 2",
      city: "Burleigh Heads",
      region: "QLD",
      postalCode: "4220",
      country: "AU",
      contactUrl: "https://example.com/contact",
      contactEmail: "hello@example.com",
      bookingUrl: "https://example.com/book",
      emergencyInstructions: "Call the practice.",
      isPrimary: true,
      servesAccountRoot: true,
      active: true,
      deactivatedAt: null,
    });
    expect(profileClinic.profile).toMatchObject({
      displayName: "Pacific Dental",
      logoUrl: "clinics/profile/branding/logo.png",
      primaryColor: "#112233",
      phone: "07 5555 0101",
      emergencyInstructions: "Call the practice.",
    });
    expect(profileClinic.entitlement?.extraLocationAllowance).toBe(0);
    expect(profileClinic.entitlement?.extraTeamMemberAllowance).toBe(2);

    const bare = await prisma().clinic.findUniqueOrThrow({
      where: { id: `${PREFIX}bare` },
      include: { profile: true, locations: true },
    });
    expect(bare.slug).toBe("mlfnd-bare");
    expect(bare.profile).toBeNull();
    expect(bare.locations).toHaveLength(1);
    expect(bare.locations[0]).toMatchObject({
      name: "Bare Clinic",
      displayName: "Bare Clinic",
      slug: null,
      phone: null,
      addressLine1: null,
      city: null,
      emergencyInstructions: null,
      isPrimary: true,
      servesAccountRoot: true,
      active: true,
      deactivatedAt: null,
    });

    const noEntitlement = await prisma().clinic.findUniqueOrThrow({
      where: { id: `${PREFIX}noent` },
      include: { entitlement: true, locations: true },
    });
    expect(noEntitlement.entitlement).toBeNull();
    expect(noEntitlement.locations).toHaveLength(1);
    expect(noEntitlement.locations[0]?.servesAccountRoot).toBe(true);
  });

  it("backfills published revisions, template fallback, and unpublished guides without publishing them", async () => {
    await cleanupOwned();
    const clinic = await createClinic(
      `${PREFIX}guides`,
      "mlfnd-guides",
      "Guide Clinic"
    );
    await prisma().guideTemplate.create({
      data: {
        id: `${PREFIX}template`,
        specialty: "DENTAL",
        slug: "mlfnd-canonical",
        title: "Canonical extraction",
      },
    });
    await prisma().guideTemplateRevision.create({
      data: {
        id: `${PREFIX}template_rev`,
        guideTemplateId: `${PREFIX}template`,
        version: 1,
        status: "PUBLISHED",
        publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });

    const published = await prisma().practiceGuide.create({
      data: {
        id: `${PREFIX}published`,
        clinicId: clinic.id,
        title: "Published guide",
        publicSlug: "extraction",
        isEnabled: true,
        status: "PUBLISHED",
        publishedAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    });
    await prisma().practiceGuideRevision.create({
      data: {
        id: `${PREFIX}published_draft`,
        practiceGuideId: published.id,
        version: 0,
        status: "DRAFT",
        title: "Draft title",
      },
    });
    await prisma().practiceGuideRevision.create({
      data: {
        id: `${PREFIX}published_v1`,
        practiceGuideId: published.id,
        version: 1,
        status: "PUBLISHED",
        title: "Version 1",
        publishedAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    });
    await prisma().practiceGuideRevision.create({
      data: {
        id: `${PREFIX}published_v2`,
        practiceGuideId: published.id,
        version: 2,
        status: "PUBLISHED",
        title: "Version 2",
        publishedAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    });

    const draft = await prisma().practiceGuide.create({
      data: {
        id: `${PREFIX}draft`,
        clinicId: clinic.id,
        title: "Draft guide",
        publicSlug: "draft-guide",
        isEnabled: false,
        status: "DRAFT",
      },
    });
    await prisma().practiceGuideRevision.create({
      data: {
        id: `${PREFIX}draft_v0`,
        practiceGuideId: draft.id,
        version: 0,
        status: "DRAFT",
        title: "Working draft",
      },
    });

    const templateGuide = await prisma().practiceGuide.create({
      data: {
        id: `${PREFIX}template_guide`,
        clinicId: clinic.id,
        title: "Template guide",
        publicSlug: "template-guide",
        guideTemplateId: `${PREFIX}template`,
        pinnedRevisionId: `${PREFIX}template_rev`,
        isEnabled: true,
        status: "PUBLISHED",
      },
    });

    const unpublished = await prisma().practiceGuide.create({
      data: {
        id: `${PREFIX}unpublished`,
        clinicId: clinic.id,
        title: "Unpublished guide",
        publicSlug: "hidden-guide",
        isEnabled: false,
        status: "UNPUBLISHED",
      },
    });
    await prisma().practiceGuideRevision.create({
      data: {
        id: `${PREFIX}unpublished_v1`,
        practiceGuideId: unpublished.id,
        version: 1,
        status: "PUBLISHED",
        title: "Previously published",
        publishedAt: new Date("2026-01-15T00:00:00.000Z"),
      },
    });

    await rerunBackfill();

    const location = await prisma().clinicLocation.findFirstOrThrow({
      where: { clinicId: clinic.id, servesAccountRoot: true },
    });
    expect(location.slug).toBeNull();

    const placements = await prisma().practiceGuidePlacement.findMany({
      where: { locationId: location.id },
      orderBy: { publicSlug: "asc" },
    });
    expect(placements).toHaveLength(4);
    expect(
      placements.map((placement) => placement.practiceGuideId).sort()
    ).toEqual(
      [draft.id, published.id, templateGuide.id, unpublished.id].sort()
    );

    const publishedPlacement = placements.find(
      (placement) => placement.practiceGuideId === published.id
    );
    expect(publishedPlacement).toMatchObject({
      isEnabled: true,
      publicSlug: "extraction",
      publishedPracticeGuideRevisionId: `${PREFIX}published_v2`,
    });

    const draftPlacement = placements.find(
      (placement) => placement.practiceGuideId === draft.id
    );
    expect(draftPlacement).toMatchObject({
      isEnabled: false,
      publicSlug: "draft-guide",
      publishedPracticeGuideRevisionId: null,
    });

    const templatePlacement = placements.find(
      (placement) => placement.practiceGuideId === templateGuide.id
    );
    expect(templatePlacement).toMatchObject({
      isEnabled: true,
      publicSlug: "template-guide",
      publishedPracticeGuideRevisionId: null,
    });

    const unpublishedPlacement = placements.find(
      (placement) => placement.practiceGuideId === unpublished.id
    );
    expect(unpublishedPlacement).toMatchObject({
      isEnabled: false,
      publicSlug: "hidden-guide",
      publishedPracticeGuideRevisionId: null,
    });

    const guidesAfter = await prisma().practiceGuide.findMany({
      where: { clinicId: clinic.id },
    });
    expect(guidesAfter).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: draft.id,
          status: "DRAFT",
          isEnabled: false,
          copiedFromPracticeGuideId: null,
        }),
        expect.objectContaining({
          id: unpublished.id,
          status: "UNPUBLISHED",
          isEnabled: false,
        }),
        expect.objectContaining({
          id: templateGuide.id,
          guideTemplateId: `${PREFIX}template`,
          pinnedRevisionId: `${PREFIX}template_rev`,
          status: "PUBLISHED",
          isEnabled: true,
        }),
        expect.objectContaining({
          id: published.id,
          publicSlug: "extraction",
          status: "PUBLISHED",
          isEnabled: true,
        }),
      ])
    );
    expect(
      await prisma().practiceGuideRevision.count({
        where: { practiceGuideId: templateGuide.id },
      })
    ).toBe(0);

    const beforeSecond = await prisma().practiceGuidePlacement.count({
      where: { locationId: location.id },
    });
    await rerunBackfill();
    expect(
      await prisma().clinicLocation.count({ where: { clinicId: clinic.id } })
    ).toBe(1);
    expect(
      await prisma().practiceGuidePlacement.count({
        where: { locationId: location.id },
      })
    ).toBe(beforeSecond);
  });

  it("includes demodental in the same root-location backfill", async () => {
    const existing = await prisma().clinic.findUnique({
      where: { slug: "demodental" },
    });
    const createdHere = !existing;
    if (!existing) {
      await prisma().clinic.create({
        data: {
          id: `${PREFIX}demodental`,
          name: "Demo Dental",
          slug: "demodental",
        },
      });
    }

    await rerunBackfill();
    await rerunBackfill();

    const demo = await prisma().clinic.findUniqueOrThrow({
      where: { slug: "demodental" },
      include: { locations: true },
    });
    expect(demo.slug).toBe("demodental");
    const roots = demo.locations.filter(
      (location) => location.servesAccountRoot
    );
    expect(roots).toHaveLength(1);
    expect(roots[0]).toMatchObject({
      slug: null,
      isPrimary: true,
      servesAccountRoot: true,
      active: true,
      deactivatedAt: null,
    });

    if (createdHere) {
      await prisma().clinic.delete({ where: { id: `${PREFIX}demodental` } });
    }
  });
});
