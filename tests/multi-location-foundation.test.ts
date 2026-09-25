import "dotenv/config";
import { readFileSync } from "node:fs";

import { Prisma } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import { ensurePrimarySiteAndRootLocation } from "@/lib/clinics/primary-site-location.mjs";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { createOperatorClinic } from "@/lib/operator/create-operator-clinic";
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
  expect(statements).toHaveLength(3);
  for (const statement of statements) {
    await getPrisma().$executeRawUnsafe(statement);
  }
}

describe("multi-location foundation migration", () => {
  it("is additive against production schema", () => {
    const sql = migrationSql();
    expect(findDestructiveSql(sql)).toEqual([]);
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE|SCHEMA)\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\bALTER\s+TABLE\b[\s\S]{0,200}\bDROP\b/i);
    expect(sql).toContain('CREATE TABLE "ClinicSite"');
    expect(sql).toContain('CREATE TABLE "ClinicLocation"');
    expect(sql).toContain('ADD COLUMN "copiedFromPracticeGuideId"');
    expect(sql).toContain(
      'ADD COLUMN "siteAllowance" INTEGER NOT NULL DEFAULT 1'
    );
    expect(sql).toContain(
      'ADD COLUMN "locationAllowance" INTEGER NOT NULL DEFAULT 1'
    );
    expect(sql).toContain("ClinicEntitlement_siteAllowance_check");
    expect(sql).toContain("ClinicEntitlement_locationAllowance_check");
    expect(sql).toContain("ClinicSite_one_primary_per_clinic_key");
    expect(sql).toContain("ClinicLocation_one_primary_per_site_key");
    expect(sql).toContain("ClinicLocation_one_site_root_per_site_key");
    expect(sql).toContain("ClinicLocation_root_slug_check");
    expect(sql).toContain("servesSiteRoot");
    expect(sql).not.toContain("servesAccountRoot");
    expect(sql).not.toContain("extraLocationAllowance");
    expect(sql).not.toContain('CREATE TABLE "DowngradeSiteSelection"');
    expect(sql).not.toMatch(/isPrimary"\s*=\s*"servesSiteRoot/);
  });

  it("backfills one site from Clinic.slug and one root location without inventing a path slug", () => {
    const sql = backfillSql();
    expect(sql).toContain('FROM "Clinic" AS clinic');
    expect(sql).toContain('clinic."slug"');
    expect(sql).toContain("'csite_' || clinic.\"id\"");
    expect(sql).toContain("'cloc_' || clinic.\"id\"");
    expect(sql).not.toMatch(/demodental/);
    expect(sql).not.toMatch(/'primary'|\"primary\"|'main'/);
    expect(sql).toContain("WHERE NOT EXISTS");
    expect(sql).toContain('profile."logoUrl"');
    expect(sql).toContain('profile."phone"');
    expect(sql).toContain('profile."emergencyInstructions"');
    expect(sql).not.toContain('profile."logoUrl",\n    profile."phone"');
  });
});

describeDb("multi-location foundation database", () => {
  function prisma() {
    return getPrisma();
  }

  async function cleanupOwned() {
    await prisma().$executeRaw`
      DROP TRIGGER IF EXISTS mlfnd_reject_location ON "ClinicLocation"
    `;
    await prisma().$executeRaw`
      DROP FUNCTION IF EXISTS mlfnd_reject_location()
    `;
    await prisma().clinic.deleteMany({
      where: {
        OR: [
          { id: { startsWith: PREFIX } },
          { slug: { startsWith: "mlfnd-" } },
        ],
      },
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

  async function createPrimarySite(clinic: {
    id: string;
    name: string;
    slug: string;
  }) {
    return prisma().clinicSite.create({
      data: {
        id: `${PREFIX}site_${clinic.slug}`,
        clinicId: clinic.id,
        name: clinic.name,
        slug: clinic.slug,
        displayName: clinic.name,
        isPrimary: true,
      },
    });
  }

  async function createRootLocation(
    site: { id: string; clinicId: string },
    id: string,
    name = "Root"
  ) {
    return prisma().clinicLocation.create({
      data: {
        id,
        clinicSiteId: site.id,
        clinicId: site.clinicId,
        name,
        displayName: name,
        slug: null,
        isPrimary: true,
        servesSiteRoot: true,
      },
    });
  }

  it("relates a site to one account and a location to that site", async () => {
    await cleanupOwned();
    const clinic = await createClinic(
      `${PREFIX}clinic_a`,
      "mlfnd-clinic-a",
      "Clinic A"
    );
    const other = await createClinic(
      `${PREFIX}clinic_b`,
      "mlfnd-clinic-b",
      "Clinic B"
    );
    const site = await createPrimarySite(clinic);
    const otherSite = await createPrimarySite(other);
    const location = await createRootLocation(site, `${PREFIX}loc_a`);

    expect(site.clinicId).toBe(clinic.id);
    expect(location.clinicSiteId).toBe(site.id);
    expect(location.clinicId).toBe(clinic.id);

    await expect(
      prisma().clinicLocation.create({
        data: {
          clinicSiteId: site.id,
          clinicId: other.id,
          name: "Cross account",
          displayName: "Cross account",
          slug: "robina",
          servesSiteRoot: false,
        },
      })
    ).rejects.toThrow(/ClinicLocation_clinicSiteId_clinicId_fkey/);

    const robinaA = await prisma().clinicLocation.create({
      data: {
        clinicSiteId: site.id,
        clinicId: clinic.id,
        name: "Robina",
        displayName: "Robina",
        slug: "robina",
        servesSiteRoot: false,
      },
    });
    const robinaB = await prisma().clinicLocation.create({
      data: {
        clinicSiteId: otherSite.id,
        clinicId: other.id,
        name: "Robina",
        displayName: "Robina",
        slug: "robina",
        servesSiteRoot: false,
      },
    });
    expect(robinaA.slug).toBe(robinaB.slug);

    await expect(
      prisma().clinicLocation.create({
        data: {
          clinicSiteId: site.id,
          clinicId: clinic.id,
          name: "Robina again",
          displayName: "Robina again",
          slug: "robina",
          servesSiteRoot: false,
        },
      })
    ).rejects.toThrow(/ClinicLocation_clinicSiteId_slug_key/);

    await expect(
      prisma().clinicSite.create({
        data: {
          clinicId: other.id,
          name: "Taken hostname",
          slug: clinic.slug,
          displayName: "Taken hostname",
        },
      })
    ).rejects.toThrow(/ClinicSite_slug_key/);
  });

  it("allows one primary site per account and one primary and one root location per site", async () => {
    await cleanupOwned();
    const clinic = await createClinic(`${PREFIX}flags`, "mlfnd-flags");
    const site = await createPrimarySite(clinic);
    await createRootLocation(site, `${PREFIX}flags_root`);

    const secondSite = await prisma().clinicSite.create({
      data: {
        clinicId: clinic.id,
        name: "Coast Dental",
        slug: "mlfnd-coast",
        displayName: "Coast Dental",
        isPrimary: false,
      },
    });
    await expect(
      prisma().clinicSite.create({
        data: {
          clinicId: clinic.id,
          name: "Second primary",
          slug: "mlfnd-second-primary",
          displayName: "Second primary",
          isPrimary: true,
        },
      })
    ).rejects.toThrow(/ClinicSite_one_primary_per_clinic_key/);

    await prisma().clinicLocation.create({
      data: {
        clinicSiteId: site.id,
        clinicId: clinic.id,
        name: "Robina",
        displayName: "Robina",
        slug: "robina",
        isPrimary: false,
        servesSiteRoot: false,
      },
    });
    await expect(
      prisma().clinicLocation.create({
        data: {
          clinicSiteId: site.id,
          clinicId: clinic.id,
          name: "Another primary",
          displayName: "Another primary",
          slug: "broadbeach",
          isPrimary: true,
          servesSiteRoot: false,
        },
      })
    ).rejects.toThrow(/ClinicLocation_one_primary_per_site_key/);
    await expect(
      prisma().clinicLocation.create({
        data: {
          clinicSiteId: site.id,
          clinicId: clinic.id,
          name: "Another root",
          displayName: "Another root",
          slug: null,
          isPrimary: false,
          servesSiteRoot: true,
        },
      })
    ).rejects.toThrow(
      /ClinicLocation_one_site_root_per_site_key|ClinicLocation_root_slug_check/
    );

    const otherRoot = await prisma().clinicLocation.create({
      data: {
        clinicSiteId: secondSite.id,
        clinicId: clinic.id,
        name: "Kingscliff",
        displayName: "Kingscliff",
        slug: null,
        isPrimary: true,
        servesSiteRoot: true,
      },
    });
    expect(otherRoot.servesSiteRoot).toBe(true);

    await expect(
      prisma().clinicLocation.create({
        data: {
          clinicSiteId: secondSite.id,
          clinicId: clinic.id,
          name: "Bad root",
          displayName: "Bad root",
          slug: "kingscliff",
          servesSiteRoot: true,
        },
      })
    ).rejects.toThrow(/ClinicLocation_root_slug_check/);
    await expect(
      prisma().clinicLocation.create({
        data: {
          clinicSiteId: secondSite.id,
          clinicId: clinic.id,
          name: "Missing slug",
          displayName: "Missing slug",
          slug: null,
          servesSiteRoot: false,
        },
      })
    ).rejects.toThrow(/ClinicLocation_root_slug_check/);
    await expect(
      prisma().clinicLocation.create({
        data: {
          clinicSiteId: secondSite.id,
          clinicId: clinic.id,
          name: "Bad slug",
          displayName: "Bad slug",
          slug: "Robina",
          servesSiteRoot: false,
        },
      })
    ).rejects.toThrow(/ClinicLocation_slug_format_check/);
    await expect(
      prisma().clinicSite.create({
        data: {
          clinicId: clinic.id,
          name: "Bad site",
          slug: "NO",
          displayName: "Bad site",
        },
      })
    ).rejects.toThrow(/ClinicSite_slug_format_check/);
  });

  it("keeps placements on the same account and copy provenance optional", async () => {
    await cleanupOwned();
    const clinic = await createClinic(`${PREFIX}place`, "mlfnd-place");
    const other = await createClinic(`${PREFIX}place_b`, "mlfnd-place-b");
    const site = await createPrimarySite(clinic);
    const otherSite = await createPrimarySite(other);
    const root = await createRootLocation(site, `${PREFIX}place_root`);
    const sibling = await prisma().clinicLocation.create({
      data: {
        clinicSiteId: site.id,
        clinicId: clinic.id,
        name: "Robina",
        displayName: "Robina",
        slug: "robina",
        servesSiteRoot: false,
      },
    });
    const foreignRoot = await createRootLocation(
      otherSite,
      `${PREFIX}place_foreign`
    );
    const source = await prisma().practiceGuide.create({
      data: {
        id: `${PREFIX}guide_source`,
        clinicId: clinic.id,
        title: "Source",
        publicSlug: "source-guide",
      },
    });
    const copy = await prisma().practiceGuide.create({
      data: {
        id: `${PREFIX}guide_copy`,
        clinicId: clinic.id,
        title: "Copy",
        publicSlug: "copy-guide",
        copiedFromPracticeGuideId: source.id,
      },
    });
    expect(source.copiedFromPracticeGuideId).toBeNull();
    expect(copy.copiedFromPracticeGuideId).toBe(source.id);
    expect(source.clinicId).toBe(clinic.id);

    await prisma().practiceGuidePlacement.create({
      data: {
        practiceGuideId: source.id,
        locationId: root.id,
        clinicId: clinic.id,
        publicSlug: "extraction",
        isEnabled: true,
      },
    });
    await prisma().practiceGuidePlacement.create({
      data: {
        practiceGuideId: source.id,
        locationId: sibling.id,
        clinicId: clinic.id,
        publicSlug: "extraction",
        isEnabled: false,
      },
    });
    await expect(
      prisma().practiceGuidePlacement.create({
        data: {
          practiceGuideId: copy.id,
          locationId: root.id,
          clinicId: clinic.id,
          publicSlug: "extraction",
          isEnabled: false,
        },
      })
    ).rejects.toThrow(/PracticeGuidePlacement_locationId_publicSlug_key/);
    await expect(
      prisma().practiceGuidePlacement.create({
        data: {
          practiceGuideId: source.id,
          locationId: foreignRoot.id,
          clinicId: other.id,
          publicSlug: "extraction",
        },
      })
    ).rejects.toThrow(/PracticeGuidePlacement_practiceGuideId_clinicId_fkey/);
    await expect(
      prisma().practiceGuidePlacement.create({
        data: {
          practiceGuideId: source.id,
          locationId: foreignRoot.id,
          clinicId: clinic.id,
          publicSlug: "extraction",
        },
      })
    ).rejects.toThrow(/PracticeGuidePlacement_locationId_clinicId_fkey/);
  });

  it("stores total site and location allowances and rejects a zero cap", async () => {
    await cleanupOwned();
    const clinic = await createClinic(`${PREFIX}ent`, "mlfnd-ent");
    const entitlement = await prisma().clinicEntitlement.create({
      data: {
        id: `${PREFIX}entitlement`,
        clinicId: clinic.id,
        billingStatus: "ACTIVE",
        entitlementStatus: "ACTIVE",
        extraTeamMemberAllowance: 1,
      },
    });
    expect(entitlement.siteAllowance).toBe(1);
    expect(entitlement.locationAllowance).toBe(1);
    expect(entitlement.extraTeamMemberAllowance).toBe(1);

    await createClinic(`${PREFIX}raw_clinic`, "mlfnd-raw-ent");
    await prisma().$executeRaw`
      INSERT INTO "ClinicEntitlement" (
        "id",
        "clinicId",
        "billingStatus",
        "entitlementStatus",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${`${PREFIX}raw_entitlement`},
        ${`${PREFIX}raw_clinic`},
        'OFFER_PREPARED'::"BillingStatus",
        'PENDING'::"EntitlementStatus",
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `;
    const raw = await prisma().clinicEntitlement.findUniqueOrThrow({
      where: { id: `${PREFIX}raw_entitlement` },
    });
    expect(raw.siteAllowance).toBe(1);
    expect(raw.locationAllowance).toBe(1);

    const siteCapColumns = await prisma().$queryRaw<
      Array<{ column_name: string }>
    >`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ClinicSite'
        AND column_name IN ('locationAllowance', 'siteAllowance')
    `;
    expect(siteCapColumns).toEqual([]);

    const group = await prisma().clinicEntitlement.update({
      where: { id: entitlement.id },
      data: { siteAllowance: 2, locationAllowance: 5, commercialPlan: "GROUP" },
    });
    expect(group.siteAllowance).toBe(2);
    expect(group.locationAllowance).toBe(5);

    await expect(
      prisma().$executeRaw`
        UPDATE "ClinicEntitlement"
        SET "siteAllowance" = 0
        WHERE "id" = ${entitlement.id}
      `
    ).rejects.toThrow(/ClinicEntitlement_siteAllowance_check/);
    await expect(
      prisma().$executeRaw`
        UPDATE "ClinicEntitlement"
        SET "locationAllowance" = 0
        WHERE "id" = ${entitlement.id}
      `
    ).rejects.toThrow(/ClinicEntitlement_locationAllowance_check/);

    const bare = await prisma().clinic.findUniqueOrThrow({
      where: { id: `${PREFIX}raw_clinic` },
      include: { entitlement: true, sites: true },
    });
    expect(bare.entitlement?.siteAllowance).toBe(1);
    const missing = await createClinic(`${PREFIX}missing_ent`, "mlfnd-missing");
    const missingRow = await prisma().clinic.findUniqueOrThrow({
      where: { id: missing.id },
      include: { entitlement: true },
    });
    expect(missingRow.entitlement).toBeNull();
    expect(missingRow.entitlement).not.toMatchObject({
      siteAllowance: expect.any(Number),
    });
  });

  it("stores a downgrade location selection without a site-selection table", async () => {
    await cleanupOwned();
    const clinic = await createClinic(`${PREFIX}down`, "mlfnd-down");
    const site = await createPrimarySite(clinic);
    const location = await createRootLocation(site, `${PREFIX}down_root`);
    const preparation = await prisma().clinicDowngradePreparation.create({
      data: {
        id: `${PREFIX}prep`,
        clinicId: clinic.id,
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
    const loaded = await prisma().clinicDowngradePreparation.findUniqueOrThrow({
      where: { id: preparation.id },
      include: { locationSelections: true },
    });
    expect(loaded.locationSelections.map((row) => row.id)).toEqual([
      selection.id,
    ]);
    const tables = await prisma().$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'DowngradeSiteSelection'
    `;
    expect(tables).toEqual([]);
  });

  it("copies branding onto the site and contact onto the root location", async () => {
    await cleanupOwned();
    const withProfile = await createClinic(
      `${PREFIX}profile`,
      "mlfnd-profile",
      "Pacific Health Group"
    );
    await prisma().clinicProfile.create({
      data: {
        clinicId: withProfile.id,
        displayName: "Pacific Dental",
        logoUrl: "clinics/profile/branding/logo.png",
        darkLogoUrl: "clinics/profile/branding/dark.png",
        faviconUrl: "clinics/profile/branding/favicon.png",
        primaryColor: "#112233",
        accentColor: "#445566",
        darkPrimaryColor: "#778899",
        darkAccentColor: "#99aabb",
        useCustomDarkBranding: true,
        neutralColor: "#ffffff",
        radiusPreset: "SOFT",
        typeface: "INTER",
        instructionTerminology: "POST_TREATMENT",
        themeMode: "DARK",
        allowPatientThemeToggle: true,
        showCareGuideAttribution: false,
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
      include: {
        profile: true,
        sites: { include: { locations: true } },
        entitlement: true,
      },
    });
    expect(profileClinic.slug).toBe("mlfnd-profile");
    expect(profileClinic.sites).toHaveLength(1);
    expect(profileClinic.sites[0]).toMatchObject({
      id: `csite_${withProfile.id}`,
      name: "Pacific Health Group",
      slug: "mlfnd-profile",
      displayName: "Pacific Dental",
      isPrimary: true,
      active: true,
      logoUrl: "clinics/profile/branding/logo.png",
      darkLogoUrl: "clinics/profile/branding/dark.png",
      faviconUrl: "clinics/profile/branding/favicon.png",
      primaryColor: "#112233",
      accentColor: "#445566",
      darkPrimaryColor: "#778899",
      darkAccentColor: "#99aabb",
      useCustomDarkBranding: true,
      neutralColor: "#ffffff",
      radiusPreset: "SOFT",
      typeface: "INTER",
      instructionTerminology: "POST_TREATMENT",
      themeMode: "DARK",
      allowPatientThemeToggle: true,
      showCareGuideAttribution: false,
    });
    expect(profileClinic.sites[0]?.locations).toHaveLength(1);
    expect(profileClinic.sites[0]?.locations[0]).toMatchObject({
      id: `cloc_${withProfile.id}`,
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
      servesSiteRoot: true,
      active: true,
      deactivatedAt: null,
    });
    expect(profileClinic.profile).toMatchObject({
      displayName: "Pacific Dental",
      logoUrl: "clinics/profile/branding/logo.png",
      phone: "07 5555 0101",
      emergencyInstructions: "Call the practice.",
    });
    expect(profileClinic.entitlement).toMatchObject({
      siteAllowance: 1,
      locationAllowance: 1,
      extraTeamMemberAllowance: 2,
    });

    const locationColumns = await prisma().$queryRaw<
      Array<{ column_name: string }>
    >`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ClinicLocation'
        AND column_name IN ('logoUrl', 'primaryColor', 'typeface')
    `;
    expect(locationColumns).toEqual([]);

    const bare = await prisma().clinic.findUniqueOrThrow({
      where: { id: `${PREFIX}bare` },
      include: { profile: true, sites: { include: { locations: true } } },
    });
    expect(bare.profile).toBeNull();
    expect(bare.sites).toHaveLength(1);
    expect(bare.sites[0]).toMatchObject({
      slug: bare.slug,
      name: "Bare Clinic",
      displayName: "Bare Clinic",
      logoUrl: null,
      radiusPreset: "MEDIUM",
      instructionTerminology: "AFTERCARE",
      themeMode: "SYSTEM",
      isPrimary: true,
    });
    expect(bare.sites[0]?.locations[0]).toMatchObject({
      name: "Bare Clinic",
      displayName: "Bare Clinic",
      slug: null,
      phone: null,
      emergencyInstructions: null,
      servesSiteRoot: true,
      isPrimary: true,
    });
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
    await prisma().practiceGuideRevision.createMany({
      data: [
        {
          id: `${PREFIX}published_draft`,
          practiceGuideId: published.id,
          version: 0,
          status: "DRAFT",
          title: "Draft title",
        },
        {
          id: `${PREFIX}published_v1`,
          practiceGuideId: published.id,
          version: 1,
          status: "PUBLISHED",
          title: "Version 1",
          publishedAt: new Date("2026-02-01T00:00:00.000Z"),
        },
        {
          id: `${PREFIX}published_v2`,
          practiceGuideId: published.id,
          version: 2,
          status: "PUBLISHED",
          title: "Version 2",
          publishedAt: new Date("2026-03-01T00:00:00.000Z"),
        },
      ],
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

    const site = await prisma().clinicSite.findFirstOrThrow({
      where: { clinicId: clinic.id, isPrimary: true },
    });
    expect(site.slug).toBe(clinic.slug);
    const location = await prisma().clinicLocation.findFirstOrThrow({
      where: { clinicSiteId: site.id, servesSiteRoot: true },
    });
    expect(location.slug).toBeNull();

    const placements = await prisma().practiceGuidePlacement.findMany({
      where: { locationId: location.id },
    });
    expect(placements).toHaveLength(4);
    expect(
      placements.every((placement) => placement.clinicId === clinic.id)
    ).toBe(true);

    expect(
      placements.find((placement) => placement.practiceGuideId === published.id)
    ).toMatchObject({
      isEnabled: true,
      publicSlug: "extraction",
      publishedPracticeGuideRevisionId: `${PREFIX}published_v2`,
    });
    expect(
      placements.find((placement) => placement.practiceGuideId === draft.id)
    ).toMatchObject({
      isEnabled: false,
      publicSlug: "draft-guide",
      publishedPracticeGuideRevisionId: null,
    });
    expect(
      placements.find(
        (placement) => placement.practiceGuideId === templateGuide.id
      )
    ).toMatchObject({
      isEnabled: true,
      publicSlug: "template-guide",
      publishedPracticeGuideRevisionId: null,
    });
    expect(
      placements.find(
        (placement) => placement.practiceGuideId === unpublished.id
      )
    ).toMatchObject({
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
          id: published.id,
          clinicId: clinic.id,
          status: "PUBLISHED",
          isEnabled: true,
          publicSlug: "extraction",
        }),
        expect.objectContaining({
          id: draft.id,
          status: "DRAFT",
          isEnabled: false,
          copiedFromPracticeGuideId: null,
        }),
        expect.objectContaining({
          id: templateGuide.id,
          guideTemplateId: `${PREFIX}template`,
          pinnedRevisionId: `${PREFIX}template_rev`,
          status: "PUBLISHED",
          isEnabled: true,
        }),
        expect.objectContaining({
          id: unpublished.id,
          status: "UNPUBLISHED",
          isEnabled: false,
        }),
      ])
    );
    expect(
      await prisma().practiceGuideRevision.count({
        where: { practiceGuideId: templateGuide.id },
      })
    ).toBe(0);

    await rerunBackfill();
    expect(
      await prisma().clinicSite.count({ where: { clinicId: clinic.id } })
    ).toBe(1);
    expect(
      await prisma().clinicLocation.count({ where: { clinicSiteId: site.id } })
    ).toBe(1);
    expect(
      await prisma().practiceGuidePlacement.count({
        where: { locationId: location.id },
      })
    ).toBe(4);
  });

  it("includes demodental in the same site and root-location backfill", async () => {
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
      include: { sites: { include: { locations: true } } },
    });
    expect(demo.slug).toBe("demodental");
    expect(demo.sites).toHaveLength(1);
    expect(demo.sites[0]).toMatchObject({
      slug: "demodental",
      isPrimary: true,
    });
    const roots = demo.sites[0]?.locations.filter(
      (location) => location.servesSiteRoot
    );
    expect(roots).toHaveLength(1);
    expect(roots?.[0]).toMatchObject({
      slug: null,
      isPrimary: true,
      servesSiteRoot: true,
      active: true,
      deactivatedAt: null,
    });

    if (createdHere) {
      await prisma().clinic.delete({ where: { id: `${PREFIX}demodental` } });
    }
  });

  it("creates an operator clinic with a primary site and root location, and rolls back together", async () => {
    await cleanupOwned();
    const created = await createOperatorClinic({
      name: "Operator Dental",
      slug: "mlfnd-operator",
    });
    const clinic = await prisma().clinic.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        profile: true,
        sites: { include: { locations: true } },
      },
    });
    expect(clinic.slug).toBe("mlfnd-operator");
    expect(clinic.profile?.displayName).toBe("Operator Dental");
    expect(clinic.sites).toHaveLength(1);
    expect(clinic.sites[0]).toMatchObject({
      slug: "mlfnd-operator",
      name: "Operator Dental",
      displayName: "Operator Dental",
      isPrimary: true,
      logoUrl: null,
      radiusPreset: "MEDIUM",
    });
    expect(clinic.sites[0]?.locations).toHaveLength(1);
    expect(clinic.sites[0]?.locations[0]).toMatchObject({
      slug: null,
      servesSiteRoot: true,
      isPrimary: true,
      phone: null,
      displayName: "Operator Dental",
    });

    const holder = await createClinic(
      `${PREFIX}holder`,
      "mlfnd-holder",
      "Holder"
    );
    await prisma().clinicSite.create({
      data: {
        clinicId: holder.id,
        name: "Held hostname",
        slug: "mlfnd-taken",
        displayName: "Held hostname",
        isPrimary: true,
      },
    });
    await expect(
      createOperatorClinic({
        name: "Should Roll Back",
        slug: "mlfnd-taken",
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);
    expect(
      await prisma().clinic.findUnique({ where: { slug: "mlfnd-taken" } })
    ).toBeNull();

    await prisma().$executeRaw`
      CREATE OR REPLACE FUNCTION mlfnd_reject_location()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW."name" = 'MLFND ROLLBACK' THEN
          RAISE EXCEPTION 'mlfnd forced location failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `;
    await prisma().$executeRaw`
      CREATE TRIGGER mlfnd_reject_location
      BEFORE INSERT ON "ClinicLocation"
      FOR EACH ROW
      EXECUTE FUNCTION mlfnd_reject_location()
    `;
    await expect(
      createOperatorClinic({
        name: "MLFND ROLLBACK",
        slug: "mlfnd-rollback",
      })
    ).rejects.toThrow(/mlfnd forced location failure/);
    expect(
      await prisma().clinic.findUnique({ where: { slug: "mlfnd-rollback" } })
    ).toBeNull();
    expect(
      await prisma().clinicSite.findUnique({
        where: { slug: "mlfnd-rollback" },
      })
    ).toBeNull();
  });

  it("builds the demo hierarchy from the seed helper", async () => {
    await cleanupOwned();
    const clinic = await createClinic(
      `${PREFIX}demo_helper`,
      "mlfnd-demo-helper",
      "Rivers Care Demo Clinic"
    );
    await prisma().clinicProfile.create({
      data: {
        clinicId: clinic.id,
        displayName: "Riverside Dental Demo",
        logoUrl: "/demo/riverside-mark.svg",
        primaryColor: "#0f766e",
        phone: "02 5550 0100",
        emergencyInstructions: "Call the clinic during hours.",
      },
    });
    const profile = await prisma().clinicProfile.findUniqueOrThrow({
      where: { clinicId: clinic.id },
    });
    await ensurePrimarySiteAndRootLocation(prisma(), {
      clinicId: clinic.id,
      clinicName: clinic.name,
      slug: clinic.slug,
      profile,
    });
    await ensurePrimarySiteAndRootLocation(prisma(), {
      clinicId: clinic.id,
      clinicName: clinic.name,
      slug: clinic.slug,
      profile,
    });

    const loaded = await prisma().clinic.findUniqueOrThrow({
      where: { id: clinic.id },
      include: { sites: { include: { locations: true } } },
    });
    expect(loaded.sites).toHaveLength(1);
    expect(loaded.sites[0]).toMatchObject({
      id: `csite_${clinic.id}`,
      slug: "mlfnd-demo-helper",
      displayName: "Riverside Dental Demo",
      logoUrl: "/demo/riverside-mark.svg",
      primaryColor: "#0f766e",
      isPrimary: true,
    });
    expect(loaded.sites[0]?.locations).toHaveLength(1);
    expect(loaded.sites[0]?.locations[0]).toMatchObject({
      id: `cloc_${clinic.id}`,
      slug: null,
      phone: "02 5550 0100",
      emergencyInstructions: "Call the clinic during hours.",
      servesSiteRoot: true,
      isPrimary: true,
    });
  });
});
