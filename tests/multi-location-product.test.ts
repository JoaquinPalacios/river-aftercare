import "dotenv/config";
import { readFileSync } from "node:fs";

import {
  BillingStatus,
  EntitlementStatus,
  type PrismaClient,
} from "@prisma/client";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { getClinicBySlug } from "@/lib/aftercare/get-clinic-by-slug";
import { getPublishedPracticeGuide } from "@/lib/aftercare/get-published-practice-guide";
import { listPublishedLocationGuides } from "@/lib/aftercare/list-published-location-guides";
import { updateLocationAction } from "@/app/(staff)/(clinic-portal)/practice/sites/actions";
import { createCustomPracticeGuide } from "@/lib/clinic-portal/create-practice-guide";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import {
  detachPlacementGuide,
  setGuideAvailableAtLocation,
  useLatestPlacementVersion,
} from "@/lib/clinic-portal/guide-placements";
import { loadPublishedGuideShareTarget } from "@/lib/clinic-portal/published-guide-share";
import { publishPracticeGuide } from "@/lib/clinic-portal/publish-practice-guide";
import { savePracticeGuideDraft } from "@/lib/clinic-portal/save-practice-guide-draft";
import { unpublishPracticeGuide } from "@/lib/clinic-portal/unpublish-practice-guide";
import { countActiveSiteLocationUsage } from "@/lib/clinics/site-location-capacity";
import {
  createClinicLocation,
  createClinicSiteWithRootLocation,
  deactivateClinicLocation,
  deactivateClinicSite,
  reactivateClinicLocation,
  reactivateClinicSite,
  updateClinicLocation,
  updateClinicSiteBranding,
} from "@/lib/clinics/site-location-mutations";
import type { SiteBrandingInput } from "@/lib/clinics/site-location-schemas";
import { loadEssentialDowngradeReadiness } from "@/lib/entitlements/downgrade-readiness";
import { prepareClinicCommercialOffer } from "@/lib/billing/prepare-offer";
import {
  loadOperatorSiteLocationCapacity,
  updateOperatorGroupComplimentaryCapacity,
  updateOperatorSiteLocationAllowance,
} from "@/lib/operator/update-site-location-allowance";
import { getPrisma } from "@/lib/prisma";

const requireClinicAdminMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/require-clinic-admin", () => ({
  requireClinicAdmin: requireClinicAdminMock,
}));

vi.mock("@/lib/billing/activation-gate", () => ({
  enforcePrePaymentActivationGate: vi.fn(async () => undefined),
}));

const PREFIX = "mlpd_";

function db(): PrismaClient {
  return getPrisma();
}

function locationInput(
  name: string,
  extras: Partial<{
    phone: string | null;
    emergencyInstructions: string | null;
    addressLine1: string | null;
    city: string | null;
  }> = {}
) {
  return {
    name,
    displayName: name,
    phone: extras.phone ?? "0755550101",
    addressLine1: extras.addressLine1 ?? "1 Test Street",
    addressLine2: null,
    city: extras.city ?? "Robina",
    region: "QLD",
    postalCode: "4226",
    country: "AU",
    contactUrl: null,
    contactEmail: null,
    bookingUrl: null,
    emergencyInstructions:
      extras.emergencyInstructions ?? `Emergency for ${name}.`,
  };
}

function siteInput(siteName: string, siteSlug: string, locationName: string) {
  return {
    siteName,
    siteSlug,
    locationName,
    locationDisplayName: locationName,
    ...locationInput(locationName),
  };
}

async function cleanup(): Promise<void> {
  const prisma = db();
  await prisma.clinic.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

async function seedAccount(input: {
  key: string;
  name?: string;
  siteSlug?: string;
  plan?: "ESSENTIAL" | "PRACTICE" | "GROUP" | null;
  siteAllowance?: number;
  locationAllowance?: number;
  billingStatus?: BillingStatus;
  entitlementStatus?: EntitlementStatus;
  primaryColor?: string;
}): Promise<{
  clinicId: string;
  userId: string;
  siteId: string;
  locationId: string;
  siteSlug: string;
}> {
  const clinicId = `${PREFIX}${input.key}`;
  const userId = `${PREFIX}user_${input.key}`;
  const siteSlug = input.siteSlug ?? `mlpd-${input.key}`;
  const name = input.name ?? `Account ${input.key}`;
  await db().user.create({
    data: { id: userId, email: `${userId}@example.test`, name },
  });
  await db().clinic.create({
    data: {
      id: clinicId,
      name,
      slug: `mlpd-account-${input.key}`,
      profile: {
        create: {
          displayName: "Legacy Profile Must Stay",
          phone: "0211111111",
          primaryColor: "#111111",
          emergencyInstructions: "Legacy emergency.",
        },
      },
      memberships: { create: { userId, role: "ADMIN" } },
    },
  });
  const site = await db().clinicSite.create({
    data: {
      id: `${PREFIX}site_${input.key}`,
      clinicId,
      name,
      slug: siteSlug,
      displayName: `${name} Site`,
      active: true,
      isPrimary: true,
      primaryColor: input.primaryColor ?? "#0f766e",
      accentColor: "#b45309",
      radiusPreset: "SOFT",
      instructionTerminology: "RECOVERY",
      themeMode: "LIGHT",
      allowPatientThemeToggle: true,
      showCareGuideAttribution: true,
    },
  });
  const location = await db().clinicLocation.create({
    data: {
      id: `${PREFIX}loc_${input.key}`,
      clinicSiteId: site.id,
      clinicId,
      name: "Burleigh Heads",
      slug: null,
      displayName: "Burleigh Heads",
      phone: "0755550001",
      addressLine1: "9 Root Road",
      city: "Burleigh Heads",
      region: "QLD",
      postalCode: "4220",
      country: "AU",
      emergencyInstructions: "Burleigh emergency.",
      isPrimary: true,
      servesSiteRoot: true,
      active: true,
    },
  });
  if (input.plan !== undefined) {
    await db().clinicEntitlement.create({
      data: {
        clinicId,
        commercialPlan: input.plan,
        billingInterval: input.plan ? "MONTHLY" : null,
        billingStatus: input.billingStatus ?? BillingStatus.ACTIVE,
        entitlementStatus: input.entitlementStatus ?? EntitlementStatus.ACTIVE,
        siteAllowance: input.siteAllowance ?? 1,
        locationAllowance: input.locationAllowance ?? 1,
      },
    });
  }
  return {
    clinicId,
    userId,
    siteId: site.id,
    locationId: location.id,
    siteSlug,
  };
}

async function publishGuide(input: {
  clinicId: string;
  userId: string;
  slug: string;
  body: string;
  title?: string;
  guideId?: string;
}): Promise<{ guideId: string; version: number; revisionId: string }> {
  const title = input.title ?? "Extraction";
  const guideId =
    input.guideId ??
    (
      await createCustomPracticeGuide({
        clinicId: input.clinicId,
        actorUserId: input.userId,
        values: { title, publicSlug: input.slug },
      })
    ).id;
  await savePracticeGuideDraft({
    clinicId: input.clinicId,
    actorUserId: input.userId,
    values: {
      guideId,
      title,
      publicSlug: input.slug,
      introduction: null,
      sections: [
        {
          key: "introduction",
          kind: "INTRODUCTION",
          title: "About",
          body: input.body,
          periodLabel: null,
          startDay: null,
          endDay: null,
        },
      ],
    },
  });
  const published = await publishPracticeGuide({
    clinicId: input.clinicId,
    actorUserId: input.userId,
    guideId,
    reviewAttested: true,
  });
  const revision = await db().practiceGuideRevision.findFirstOrThrow({
    where: {
      practiceGuideId: guideId,
      version: published.version,
      status: "PUBLISHED",
    },
  });
  return { guideId, version: published.version, revisionId: revision.id };
}

describe("multi-location product", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  beforeAll(() => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
  });

  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    if (previousRoot === undefined) {
      delete process.env.CARE_GUIDE_ROOT_DOMAIN;
    } else {
      process.env.CARE_GUIDE_ROOT_DOMAIN = previousRoot;
    }
    await db().$disconnect();
  });

  it("keeps Essential at one site and one location even when stored allowances are higher", async () => {
    const account = await seedAccount({
      key: "essential",
      plan: "ESSENTIAL",
      siteAllowance: 9,
      locationAllowance: 9,
    });
    await expect(
      createClinicSiteWithRootLocation({
        clinicId: account.clinicId,
        values: siteInput("Second Site", "mlpd-essential-two", "Second"),
      })
    ).rejects.toMatchObject({ code: "capacity" });
    await expect(
      createClinicLocation({
        clinicId: account.clinicId,
        siteId: account.siteId,
        values: { ...locationInput("Robina"), slug: "robina" },
      })
    ).rejects.toMatchObject({ code: "capacity" });
    const usage = await countActiveSiteLocationUsage(db(), account.clinicId);
    expect(usage).toEqual({ activeSites: 1, activeLocations: 1 });
  });

  it("treats a missing entitlement as one site and one location", async () => {
    const account = await seedAccount({ key: "missing" });
    await expect(
      createClinicSiteWithRootLocation({
        clinicId: account.clinicId,
        values: siteInput("Second", "mlpd-missing-two", "Second"),
      })
    ).rejects.toMatchObject({ code: "capacity" });
    await expect(
      createClinicLocation({
        clinicId: account.clinicId,
        siteId: account.siteId,
        values: { ...locationInput("Robina"), slug: "robina" },
      })
    ).rejects.toMatchObject({ code: "capacity" });
  });

  it("keeps Practice to one site and enforces the location allowance", async () => {
    const account = await seedAccount({
      key: "practice",
      plan: "PRACTICE",
      siteAllowance: 4,
      locationAllowance: 3,
    });
    await expect(
      createClinicSiteWithRootLocation({
        clinicId: account.clinicId,
        values: siteInput("Second", "mlpd-practice-two", "Second"),
      })
    ).rejects.toMatchObject({ code: "capacity" });

    const robina = await createClinicLocation({
      clinicId: account.clinicId,
      siteId: account.siteId,
      values: { ...locationInput("Robina"), slug: "robina" },
    });
    const broadbeach = await createClinicLocation({
      clinicId: account.clinicId,
      siteId: account.siteId,
      values: { ...locationInput("Broadbeach"), slug: "broadbeach" },
    });
    await expect(
      createClinicLocation({
        clinicId: account.clinicId,
        siteId: account.siteId,
        values: { ...locationInput("Varsity"), slug: "varsity" },
      })
    ).rejects.toMatchObject({ code: "capacity" });

    await deactivateClinicLocation({
      clinicId: account.clinicId,
      locationId: robina.locationId,
    });
    const freed = await countActiveSiteLocationUsage(db(), account.clinicId);
    expect(freed.activeLocations).toBe(2);
    const varsity = await createClinicLocation({
      clinicId: account.clinicId,
      siteId: account.siteId,
      values: { ...locationInput("Varsity"), slug: "varsity" },
    });
    expect(varsity.locationId).toBeTruthy();
    await expect(
      reactivateClinicLocation({
        clinicId: account.clinicId,
        locationId: robina.locationId,
      })
    ).rejects.toMatchObject({ code: "capacity" });

    await deactivateClinicLocation({
      clinicId: account.clinicId,
      locationId: broadbeach.locationId,
    });
    await reactivateClinicLocation({
      clinicId: account.clinicId,
      locationId: robina.locationId,
    });
    const restored = await db().clinicLocation.findUniqueOrThrow({
      where: { id: robina.locationId },
    });
    expect(restored.active).toBe(true);
    expect(restored.slug).toBe("robina");
  });

  it("lets a Group account distribute locations across sites inside 2/5, 3/6, and 4/7", async () => {
    const account = await seedAccount({
      key: "group",
      name: "Pacific Health Group",
      siteSlug: "mlpd-pacific",
      plan: "GROUP",
      siteAllowance: 2,
      locationAllowance: 5,
    });
    const coast = await createClinicSiteWithRootLocation({
      clinicId: account.clinicId,
      values: siteInput("Coast Dental", "mlpd-coast", "Kingscliff"),
    });
    const coastSite = await db().clinicSite.findUniqueOrThrow({
      where: { id: coast.siteId },
    });
    const coastRoot = await db().clinicLocation.findUniqueOrThrow({
      where: { id: coast.locationId },
    });
    expect(coastSite.isPrimary).toBe(false);
    expect(coastSite.primaryColor).toBeNull();
    expect(coastSite.radiusPreset).toBe("MEDIUM");
    expect(coastRoot.servesSiteRoot).toBe(true);
    expect(coastRoot.slug).toBeNull();
    const profile = await db().clinicProfile.findUniqueOrThrow({
      where: { clinicId: account.clinicId },
    });
    expect(profile.displayName).toBe("Legacy Profile Must Stay");

    const afterSite = await countActiveSiteLocationUsage(
      db(),
      account.clinicId
    );
    expect(afterSite).toEqual({ activeSites: 2, activeLocations: 2 });

    for (const slug of ["robina", "broadbeach", "varsity"]) {
      await createClinicLocation({
        clinicId: account.clinicId,
        siteId: account.siteId,
        values: { ...locationInput(slug), slug },
      });
    }
    const distributed = await countActiveSiteLocationUsage(
      db(),
      account.clinicId
    );
    expect(distributed).toEqual({ activeSites: 2, activeLocations: 5 });
    const pacificLocations = await db().clinicLocation.count({
      where: { clinicSiteId: account.siteId, active: true },
    });
    expect(pacificLocations).toBe(4);

    await expect(
      createClinicLocation({
        clinicId: account.clinicId,
        siteId: coast.siteId,
        values: { ...locationInput("Tweed"), slug: "tweed" },
      })
    ).rejects.toMatchObject({ code: "capacity" });
    await expect(
      createClinicSiteWithRootLocation({
        clinicId: account.clinicId,
        values: siteInput("Third", "mlpd-third", "Third"),
      })
    ).rejects.toMatchObject({ code: "capacity" });

    expect(
      await updateOperatorGroupComplimentaryCapacity({
        clinicId: account.clinicId,
        extraSiteAllowance: 1,
        extraLocationAllowance: 1,
      })
    ).toEqual({ ok: true, commerciallyActive: true });
    await createClinicSiteWithRootLocation({
      clinicId: account.clinicId,
      values: siteInput("Third Dental", "mlpd-third", "Third Place"),
    });
    expect(await countActiveSiteLocationUsage(db(), account.clinicId)).toEqual({
      activeSites: 3,
      activeLocations: 6,
    });

    expect(
      await updateOperatorGroupComplimentaryCapacity({
        clinicId: account.clinicId,
        extraSiteAllowance: 2,
        extraLocationAllowance: 2,
      })
    ).toEqual({ ok: true, commerciallyActive: true });
    await createClinicSiteWithRootLocation({
      clinicId: account.clinicId,
      values: siteInput("Fourth Dental", "mlpd-fourth", "Fourth Place"),
    });
    expect(await countActiveSiteLocationUsage(db(), account.clinicId)).toEqual({
      activeSites: 4,
      activeLocations: 7,
    });
  });

  it("stops two concurrent creates from exceeding site or location capacity", async () => {
    const sites = await seedAccount({
      key: "race-sites",
      plan: "GROUP",
      siteAllowance: 2,
      locationAllowance: 5,
    });
    const siteResults = await Promise.allSettled([
      createClinicSiteWithRootLocation({
        clinicId: sites.clinicId,
        values: siteInput("Race A", "mlpd-race-a", "Race A"),
      }),
      createClinicSiteWithRootLocation({
        clinicId: sites.clinicId,
        values: siteInput("Race B", "mlpd-race-b", "Race B"),
      }),
    ]);
    expect(
      siteResults.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(await countActiveSiteLocationUsage(db(), sites.clinicId)).toEqual({
      activeSites: 2,
      activeLocations: 2,
    });

    const locations = await seedAccount({
      key: "race-locs",
      plan: "PRACTICE",
      locationAllowance: 2,
    });
    const locationResults = await Promise.allSettled([
      createClinicLocation({
        clinicId: locations.clinicId,
        siteId: locations.siteId,
        values: { ...locationInput("Robina"), slug: "robina" },
      }),
      createClinicLocation({
        clinicId: locations.clinicId,
        siteId: locations.siteId,
        values: { ...locationInput("Broadbeach"), slug: "broadbeach" },
      }),
    ]);
    expect(
      locationResults.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(
      (await countActiveSiteLocationUsage(db(), locations.clinicId))
        .activeLocations
    ).toBe(2);
  });

  it("rejects reserved and colliding slugs and turns uniqueness races into a form error", async () => {
    const account = await seedAccount({
      key: "slugs",
      name: "Pacific Dental",
      siteSlug: "mlpd-pacific",
      plan: "GROUP",
      siteAllowance: 4,
      locationAllowance: 8,
    });
    await expect(
      createClinicSiteWithRootLocation({
        clinicId: account.clinicId,
        values: siteInput("Web", "www", "Web"),
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);
    await expect(
      createClinicLocation({
        clinicId: account.clinicId,
        siteId: account.siteId,
        values: { ...locationInput("Print"), slug: "print" },
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);

    const published = await publishGuide({
      clinicId: account.clinicId,
      userId: account.userId,
      slug: "robina",
      body: "Root guide body.",
    });
    await expect(
      createClinicLocation({
        clinicId: account.clinicId,
        siteId: account.siteId,
        values: { ...locationInput("Robina"), slug: "robina" },
      })
    ).rejects.toThrow(/already used by a guide/);

    const broadbeach = await createClinicLocation({
      clinicId: account.clinicId,
      siteId: account.siteId,
      values: { ...locationInput("Broadbeach"), slug: "broadbeach" },
    });
    await expect(
      createCustomPracticeGuide({
        clinicId: account.clinicId,
        actorUserId: account.userId,
        values: { title: "Clash", publicSlug: "broadbeach" },
      })
    ).rejects.toThrow(/already used by a location/);
    const draft = await createCustomPracticeGuide({
      clinicId: account.clinicId,
      actorUserId: account.userId,
      values: { title: "Draft", publicSlug: "draft-guide" },
    });
    await expect(
      savePracticeGuideDraft({
        clinicId: account.clinicId,
        actorUserId: account.userId,
        values: {
          guideId: draft.id,
          title: "Draft",
          publicSlug: "broadbeach",
          introduction: null,
          sections: [
            {
              key: "introduction",
              kind: "INTRODUCTION",
              title: "About",
              body: "Draft body.",
              periodLabel: null,
              startDay: null,
              endDay: null,
            },
          ],
        },
      })
    ).rejects.toThrow(/already used by a location/);
    const guide = await db().practiceGuide.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(guide.publicSlug).toBe("draft-guide");
    const publishedGuide = await db().practiceGuide.findUniqueOrThrow({
      where: { id: published.guideId },
    });
    expect(publishedGuide.publicSlug).toBe("robina");

    const other = await seedAccount({
      key: "slugs-other",
      siteSlug: "mlpd-other",
      plan: "GROUP",
      siteAllowance: 2,
      locationAllowance: 5,
    });
    await createClinicLocation({
      clinicId: other.clinicId,
      siteId: other.siteId,
      values: { ...locationInput("Broadbeach"), slug: "broadbeach" },
    });

    await updateClinicLocation({
      clinicId: account.clinicId,
      locationId: broadbeach.locationId,
      values: locationInput("Broadbeach Heads", { phone: "0755550199" }),
    });
    const renamed = await db().clinicLocation.findUniqueOrThrow({
      where: { id: broadbeach.locationId },
    });
    expect(renamed.slug).toBe("broadbeach");
    expect(renamed.name).toBe("Broadbeach Heads");

    const raced = await Promise.allSettled([
      createClinicSiteWithRootLocation({
        clinicId: account.clinicId,
        values: siteInput("Same", "mlpd-same-slug", "Same A"),
      }),
      createClinicSiteWithRootLocation({
        clinicId: account.clinicId,
        values: siteInput("Same", "mlpd-same-slug", "Same B"),
      }),
    ]);
    const rejected = raced.find((result) => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toBeInstanceOf(ClinicPortalError);
      expect(String(rejected.reason.message)).toMatch(/already in use/);
      expect(String(rejected.reason.message)).not.toMatch(/P2002|prisma/i);
    }
    expect(
      await db().clinicSite.count({ where: { slug: "mlpd-same-slug" } })
    ).toBe(1);

    requireClinicAdminMock.mockResolvedValue({
      clinicMembership: {
        source: "membership",
        role: "ADMIN",
        clinic: { id: account.clinicId },
      },
    });
    const form = new FormData();
    form.set("locationId", broadbeach.locationId);
    form.set("slug", "changed");
    form.set("name", "Broadbeach");
    form.set("displayName", "Broadbeach");
    const actionResult = await updateLocationAction({}, form);
    expect(actionResult.error).toMatch(/cannot be changed/);
  });

  it("refuses to republish a root guide over a location that now owns its slug", async () => {
    const account = await seedAccount({
      key: "shadow",
      siteSlug: "mlpd-shadow",
      plan: "GROUP",
      siteAllowance: 2,
      locationAllowance: 5,
    });
    const published = await publishGuide({
      clinicId: account.clinicId,
      userId: account.userId,
      slug: "robina",
      body: "Root robina guide.",
    });
    await unpublishPracticeGuide({
      clinicId: account.clinicId,
      actorUserId: account.userId,
      guideId: published.guideId,
    });
    const disabled = await db().practiceGuidePlacement.findFirstOrThrow({
      where: {
        practiceGuideId: published.guideId,
        locationId: account.locationId,
      },
    });
    expect(disabled.publicSlug).toBe("robina");
    expect(disabled.isEnabled).toBe(false);

    const location = await createClinicLocation({
      clinicId: account.clinicId,
      siteId: account.siteId,
      values: { ...locationInput("Robina"), slug: "robina" },
    });
    expect(location.locationId).toBeTruthy();
    await expect(
      getPublishedPracticeGuide({
        clinicSlug: account.siteSlug,
        publicSlug: "robina",
      })
    ).resolves.toBeNull();
    await expect(
      listPublishedLocationGuides({
        siteSlug: account.siteSlug,
        locationSlug: "robina",
      })
    ).resolves.toMatchObject({ locationSlug: "robina" });

    await expect(
      publishPracticeGuide({
        clinicId: account.clinicId,
        actorUserId: account.userId,
        guideId: published.guideId,
        reviewAttested: true,
      })
    ).rejects.toThrow(/already used by a location/);
    await expect(
      setGuideAvailableAtLocation({
        clinicId: account.clinicId,
        guideId: published.guideId,
        locationId: account.locationId,
        available: true,
      })
    ).rejects.toThrow(/already used by a location/);

    const after = await db().practiceGuide.findUniqueOrThrow({
      where: { id: published.guideId },
    });
    const placement = await db().practiceGuidePlacement.findUniqueOrThrow({
      where: { id: disabled.id },
    });
    expect(after.status).toBe("UNPUBLISHED");
    expect(after.publicSlug).toBe("robina");
    expect(placement.isEnabled).toBe(false);
    await expect(
      getPublishedPracticeGuide({
        clinicSlug: account.siteSlug,
        publicSlug: "robina",
      })
    ).resolves.toBeNull();
    await expect(
      listPublishedLocationGuides({
        siteSlug: account.siteSlug,
        locationSlug: "robina",
      })
    ).resolves.toMatchObject({ placeName: "Robina" });

    await savePracticeGuideDraft({
      clinicId: account.clinicId,
      actorUserId: account.userId,
      values: {
        guideId: published.guideId,
        title: "Extraction",
        publicSlug: "former-robina",
        introduction: null,
        sections: [
          {
            key: "introduction",
            kind: "INTRODUCTION",
            title: "About",
            body: "Root robina guide.",
            periodLabel: null,
            startDay: null,
            endDay: null,
          },
        ],
      },
    });
    const moved = await db().practiceGuide.findUniqueOrThrow({
      where: { id: published.guideId },
    });
    expect(moved.publicSlug).toBe("former-robina");
    expect(moved.status).toBe("UNPUBLISHED");

    await expect(
      createCustomPracticeGuide({
        clinicId: account.clinicId,
        actorUserId: account.userId,
        values: { title: "Second", publicSlug: "robina" },
      })
    ).rejects.toThrow(/already used by a location/);
    const other = await createCustomPracticeGuide({
      clinicId: account.clinicId,
      actorUserId: account.userId,
      values: { title: "Other", publicSlug: "other-guide" },
    });
    await savePracticeGuideDraft({
      clinicId: account.clinicId,
      actorUserId: account.userId,
      values: {
        guideId: other.id,
        title: "Other",
        publicSlug: "other-guide",
        introduction: null,
        sections: [
          {
            key: "introduction",
            kind: "INTRODUCTION",
            title: "About",
            body: "Other body.",
            periodLabel: null,
            startDay: null,
            endDay: null,
          },
        ],
      },
    });
    await expect(
      savePracticeGuideDraft({
        clinicId: account.clinicId,
        actorUserId: account.userId,
        values: {
          guideId: other.id,
          title: "Other",
          publicSlug: "robina",
          introduction: null,
          sections: [
            {
              key: "introduction",
              kind: "INTRODUCTION",
              title: "About",
              body: "Stolen body.",
              periodLabel: null,
              startDay: null,
              endDay: null,
            },
          ],
        },
      })
    ).rejects.toThrow(/already used by a location/);
    await publishPracticeGuide({
      clinicId: account.clinicId,
      actorUserId: account.userId,
      guideId: other.id,
      reviewAttested: true,
    });
    await expect(
      getPublishedPracticeGuide({
        clinicSlug: account.siteSlug,
        publicSlug: "robina",
      })
    ).resolves.toBeNull();
    await expect(
      getPublishedPracticeGuide({
        clinicSlug: account.siteSlug,
        publicSlug: "other-guide",
      })
    ).resolves.toMatchObject({ sections: [{ body: "Other body." }] });
  });

  it("resolves nested location pages and keeps root URLs on the root placement", async () => {
    const pacific = await seedAccount({
      key: "route",
      name: "Pacific Health Group",
      siteSlug: "mlpd-pacific",
      plan: "GROUP",
      siteAllowance: 2,
      locationAllowance: 5,
      primaryColor: "#1d4ed8",
    });
    const coast = await createClinicSiteWithRootLocation({
      clinicId: pacific.clinicId,
      values: siteInput("Coast Dental", "mlpd-coast", "Kingscliff"),
    });
    await updateClinicSiteBranding({
      clinicId: pacific.clinicId,
      siteId: coast.siteId,
      values: branding("Coast Dental", "#166534"),
    });
    const robina = await createClinicLocation({
      clinicId: pacific.clinicId,
      siteId: pacific.siteId,
      values: {
        ...locationInput("Robina", {
          phone: "0755550108",
          emergencyInstructions: "Robina emergency.",
        }),
        slug: "robina",
      },
    });
    const burleighGuide = await publishGuide({
      clinicId: pacific.clinicId,
      userId: pacific.userId,
      slug: "extraction",
      body: "Burleigh extraction.",
    });
    await setGuideAvailableAtLocation({
      clinicId: pacific.clinicId,
      guideId: burleighGuide.guideId,
      locationId: robina.locationId,
      available: true,
    });
    expect(
      await db().practiceGuide.count({ where: { clinicId: pacific.clinicId } })
    ).toBe(1);

    const root = await getPublishedPracticeGuide({
      clinicSlug: pacific.siteSlug,
      publicSlug: "extraction",
    });
    expect(root?.sections[0]?.body).toBe("Burleigh extraction.");
    expect(root?.placeName).toBeUndefined();
    expect(root?.profile?.displayName).toBe("Pacific Health Group Site");
    expect(root?.profile?.phone).toBe("0755550001");

    const nested = await getPublishedPracticeGuide({
      clinicSlug: pacific.siteSlug,
      locationSlug: "robina",
      publicSlug: "extraction",
    });
    expect(nested?.sections[0]?.body).toBe("Burleigh extraction.");
    expect(nested?.placeName).toBe("Robina");
    expect(nested?.profile?.phone).toBe("0755550108");
    expect(nested?.profile?.primaryColor).toBe("#1d4ed8");
    expect(nested?.profile?.displayName).toBe("Pacific Health Group Site");

    const home = await listPublishedLocationGuides({
      siteSlug: pacific.siteSlug,
      locationSlug: "robina",
    });
    expect(home?.guides.map((guide) => guide.publicSlug)).toEqual([
      "extraction",
    ]);
    expect(home?.guides[0]?.href).toBe("/robina/extraction");
    expect(home?.profile.displayName).toBe("Pacific Health Group Site");

    const rootShare = await loadPublishedGuideShareTarget({
      clinicId: pacific.clinicId,
      guideId: burleighGuide.guideId,
      requestHost: "app.localhost:3000",
      protocol: "http",
    });
    expect(rootShare?.publicUrl).toBe(
      "http://mlpd-pacific.localhost:3000/extraction"
    );
    const robinaPlacement = await db().practiceGuidePlacement.findFirstOrThrow({
      where: { locationId: robina.locationId },
    });
    const robinaShare = await loadPublishedGuideShareTarget({
      clinicId: pacific.clinicId,
      guideId: burleighGuide.guideId,
      placementId: robinaPlacement.id,
      requestHost: "app.localhost:3000",
      protocol: "http",
    });
    expect(robinaShare?.publicUrl).toBe(
      "http://mlpd-pacific.localhost:3000/robina/extraction"
    );

    await setGuideAvailableAtLocation({
      clinicId: pacific.clinicId,
      guideId: burleighGuide.guideId,
      locationId: robina.locationId,
      available: false,
    });
    await expect(
      getPublishedPracticeGuide({
        clinicSlug: pacific.siteSlug,
        locationSlug: "robina",
        publicSlug: "extraction",
      })
    ).resolves.toBeNull();
    await expect(
      getPublishedPracticeGuide({
        clinicSlug: pacific.siteSlug,
        publicSlug: "extraction",
      })
    ).resolves.toMatchObject({ sections: [{ body: "Burleigh extraction." }] });

    await setGuideAvailableAtLocation({
      clinicId: pacific.clinicId,
      guideId: burleighGuide.guideId,
      locationId: robina.locationId,
      available: true,
    });
    await unpublishPracticeGuide({
      clinicId: pacific.clinicId,
      actorUserId: pacific.userId,
      guideId: burleighGuide.guideId,
    });
    const placements = await db().practiceGuidePlacement.findMany({
      where: { practiceGuideId: burleighGuide.guideId },
    });
    expect(placements.every((placement) => placement.isEnabled === false)).toBe(
      true
    );
    await expect(
      getPublishedPracticeGuide({
        clinicSlug: pacific.siteSlug,
        locationSlug: "robina",
        publicSlug: "extraction",
      })
    ).resolves.toBeNull();

    await db().clinicLocation.update({
      where: { id: robina.locationId },
      data: { active: false },
    });
    await expect(
      listPublishedLocationGuides({
        siteSlug: pacific.siteSlug,
        locationSlug: "robina",
      })
    ).resolves.toBeNull();

    const other = await seedAccount({
      key: "route-other",
      siteSlug: "mlpd-other",
      plan: "GROUP",
      siteAllowance: 2,
      locationAllowance: 2,
    });
    await expect(
      getPublishedPracticeGuide({
        clinicSlug: other.siteSlug,
        publicSlug: "extraction",
      })
    ).resolves.toBeNull();
    await expect(
      createClinicLocation({
        clinicId: other.clinicId,
        siteId: pacific.siteId,
        values: { ...locationInput("Stolen"), slug: "stolen" },
      })
    ).rejects.toThrow(/not found/i);

    await db().clinicSite.update({
      where: { id: coast.siteId },
      data: { active: false },
    });
    await expect(getClinicBySlug("mlpd-coast")).resolves.toBeNull();

    const nestedPage = readFileSync(
      "app/(aftercare)/%5Fsites/[tenant]/[guideSlug]/[...rest]/page.tsx",
      "utf8"
    );
    expect(nestedPage).toContain("getPublishedPracticeGuide");
    expect(nestedPage).toContain("PrintableGuide");
    expect(nestedPage).toContain('extra === "print"');
  });

  it("pins extra locations until Use latest, then detaches only that placement", async () => {
    const account = await seedAccount({
      key: "pin",
      siteSlug: "mlpd-pin",
      plan: "GROUP",
      siteAllowance: 2,
      locationAllowance: 5,
    });
    const robina = await createClinicLocation({
      clinicId: account.clinicId,
      siteId: account.siteId,
      values: { ...locationInput("Robina"), slug: "robina" },
    });
    const broadbeach = await createClinicLocation({
      clinicId: account.clinicId,
      siteId: account.siteId,
      values: { ...locationInput("Broadbeach"), slug: "broadbeach" },
    });
    const first = await publishGuide({
      clinicId: account.clinicId,
      userId: account.userId,
      slug: "extraction",
      body: "Revision one.",
    });
    await setGuideAvailableAtLocation({
      clinicId: account.clinicId,
      guideId: first.guideId,
      locationId: robina.locationId,
      available: true,
    });
    await setGuideAvailableAtLocation({
      clinicId: account.clinicId,
      guideId: first.guideId,
      locationId: broadbeach.locationId,
      available: true,
    });
    const second = await publishGuide({
      clinicId: account.clinicId,
      userId: account.userId,
      guideId: first.guideId,
      slug: "extraction",
      body: "Revision two.",
    });
    const rootPlacement = await db().practiceGuidePlacement.findFirstOrThrow({
      where: { locationId: account.locationId },
    });
    const robinaPlacement = await db().practiceGuidePlacement.findFirstOrThrow({
      where: { locationId: robina.locationId },
    });
    const broadbeachPlacement =
      await db().practiceGuidePlacement.findFirstOrThrow({
        where: { locationId: broadbeach.locationId },
      });
    expect(rootPlacement.publishedPracticeGuideRevisionId).toBe(
      second.revisionId
    );
    expect(robinaPlacement.publishedPracticeGuideRevisionId).toBe(
      first.revisionId
    );
    expect(broadbeachPlacement.publishedPracticeGuideRevisionId).toBe(
      first.revisionId
    );
    expect(
      (
        await getPublishedPracticeGuide({
          clinicSlug: account.siteSlug,
          locationSlug: "robina",
          publicSlug: "extraction",
        })
      )?.sections[0]?.body
    ).toBe("Revision one.");

    await useLatestPlacementVersion({
      clinicId: account.clinicId,
      placementId: robinaPlacement.id,
    });
    const robinaLatest = await db().practiceGuidePlacement.findUniqueOrThrow({
      where: { id: robinaPlacement.id },
    });
    const broadbeachStill = await db().practiceGuidePlacement.findUniqueOrThrow(
      {
        where: { id: broadbeachPlacement.id },
      }
    );
    expect(robinaLatest.publishedPracticeGuideRevisionId).toBe(
      second.revisionId
    );
    expect(broadbeachStill.publishedPracticeGuideRevisionId).toBe(
      first.revisionId
    );
    expect(robinaLatest.publicSlug).toBe("extraction");

    const beforeGuides = await db().practiceGuide.count({
      where: { clinicId: account.clinicId },
    });
    const detached = await detachPlacementGuide({
      clinicId: account.clinicId,
      actorUserId: account.userId,
      placementId: robinaLatest.id,
    });
    expect(
      await db().practiceGuide.count({ where: { clinicId: account.clinicId } })
    ).toBe(beforeGuides + 1);
    const copy = await db().practiceGuide.findUniqueOrThrow({
      where: { id: detached.guideId },
      include: {
        contentRevisions: { include: { sections: true } },
      },
    });
    expect(copy.copiedFromPracticeGuideId).toBe(first.guideId);
    const visible = copy.contentRevisions.find(
      (revision) => revision.version === 1
    );
    expect(visible?.sections[0]?.body).toBe("Revision two.");
    const moved = await db().practiceGuidePlacement.findUniqueOrThrow({
      where: { id: robinaLatest.id },
    });
    expect(moved.practiceGuideId).toBe(copy.id);
    expect(moved.publicSlug).toBe("extraction");
    expect(broadbeachStill.practiceGuideId).toBe(first.guideId);

    await publishGuide({
      clinicId: account.clinicId,
      userId: account.userId,
      guideId: copy.id,
      slug: copy.publicSlug,
      title: copy.title,
      body: "Detached wording.",
    });
    expect(
      (
        await getPublishedPracticeGuide({
          clinicSlug: account.siteSlug,
          locationSlug: "robina",
          publicSlug: "extraction",
        })
      )?.sections[0]?.body
    ).toBe("Detached wording.");
    expect(
      (
        await getPublishedPracticeGuide({
          clinicSlug: account.siteSlug,
          locationSlug: "broadbeach",
          publicSlug: "extraction",
        })
      )?.sections[0]?.body
    ).toBe("Revision one.");

    const originalSections = await db().practiceGuideRevision.findFirstOrThrow({
      where: { id: second.revisionId },
      include: { sections: true },
    });
    expect(originalSections.sections[0]?.body).toBe("Revision two.");
  });

  it("rolls back a detach that would exceed the guide allowance", async () => {
    const account = await seedAccount({
      key: "detach-cap",
      plan: "ESSENTIAL",
    });
    const first = await publishGuide({
      clinicId: account.clinicId,
      userId: account.userId,
      slug: "extraction",
      body: "Original.",
    });
    await publishGuide({
      clinicId: account.clinicId,
      userId: account.userId,
      slug: "implant",
      body: "Second custom.",
    });
    const placement = await db().practiceGuidePlacement.findFirstOrThrow({
      where: { practiceGuideId: first.guideId, locationId: account.locationId },
    });
    await expect(
      detachPlacementGuide({
        clinicId: account.clinicId,
        actorUserId: account.userId,
        placementId: placement.id,
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);
    expect(
      await db().practiceGuide.count({ where: { clinicId: account.clinicId } })
    ).toBe(2);
    const unchanged = await db().practiceGuidePlacement.findUniqueOrThrow({
      where: { id: placement.id },
    });
    expect(unchanged.practiceGuideId).toBe(first.guideId);
  });

  it("keeps site branding and location contact independent", async () => {
    const account = await seedAccount({
      key: "brand",
      name: "Pacific Health Group",
      siteSlug: "mlpd-pacific",
      plan: "GROUP",
      siteAllowance: 2,
      locationAllowance: 5,
      primaryColor: "#1d4ed8",
    });
    const coast = await createClinicSiteWithRootLocation({
      clinicId: account.clinicId,
      values: siteInput("Coast Dental", "mlpd-coast", "Kingscliff"),
    });
    await updateClinicSiteBranding({
      clinicId: account.clinicId,
      siteId: coast.siteId,
      values: branding("Coast Dental", "#166534"),
    });
    const robina = await createClinicLocation({
      clinicId: account.clinicId,
      siteId: account.siteId,
      values: {
        ...locationInput("Robina", { phone: "0755550108" }),
        slug: "robina",
      },
    });
    await updateClinicLocation({
      clinicId: account.clinicId,
      locationId: robina.locationId,
      values: locationInput("Robina", {
        phone: "0755550199",
        emergencyInstructions: "Updated Robina emergency.",
      }),
    });

    const pacific = await db().clinicSite.findUniqueOrThrow({
      where: { id: account.siteId },
    });
    const coastSite = await db().clinicSite.findUniqueOrThrow({
      where: { id: coast.siteId },
    });
    const burleigh = await db().clinicLocation.findUniqueOrThrow({
      where: { id: account.locationId },
    });
    const profile = await db().clinicProfile.findUniqueOrThrow({
      where: { clinicId: account.clinicId },
    });
    const memberships = await db().clinicMembership.count({
      where: { clinicId: account.clinicId },
    });
    expect(pacific.primaryColor).toBe("#1d4ed8");
    expect(coastSite.primaryColor).toBe("#166534");
    expect(coastSite.displayName).toBe("Coast Dental");
    expect(profile.primaryColor).toBe("#111111");
    expect(profile.phone).toBe("0211111111");
    expect(burleigh.phone).toBe("0755550001");
    expect(memberships).toBe(1);

    const robinaPage = await listPublishedLocationGuides({
      siteSlug: "mlpd-pacific",
      locationSlug: "robina",
    });
    expect(robinaPage?.profile.primaryColor).toBe("#1d4ed8");
    expect(robinaPage?.profile.phone).toBe("0755550199");
    expect(robinaPage?.profile.emergencyInstructions).toBe(
      "Updated Robina emergency."
    );
    const coastTenant = await getClinicBySlug("mlpd-coast");
    expect(coastTenant?.profile?.displayName).toBe("Coast Dental");
    expect(coastTenant?.profile?.primaryColor).toBe("#166534");
    expect(coastTenant?.name).toBe("Pacific Health Group");
  });

  it("lets an operator set capacity without Stripe and gates site reactivation", async () => {
    const practice = await seedAccount({
      key: "op-practice",
      plan: "PRACTICE",
      locationAllowance: 1,
    });
    expect(
      await updateOperatorSiteLocationAllowance({
        clinicId: practice.clinicId,
        siteAllowance: 2,
        locationAllowance: 3,
      })
    ).toMatchObject({ ok: false });
    expect(
      await updateOperatorSiteLocationAllowance({
        clinicId: practice.clinicId,
        siteAllowance: 1,
        locationAllowance: 3,
      })
    ).toEqual({ ok: true });
    const practiceRow = await db().clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: practice.clinicId },
    });
    expect(practiceRow.siteAllowance).toBe(1);
    expect(practiceRow.locationAllowance).toBe(3);

    const group = await seedAccount({
      key: "op-group",
      plan: "GROUP",
      siteAllowance: 2,
      locationAllowance: 5,
    });
    const second = await createClinicSiteWithRootLocation({
      clinicId: group.clinicId,
      values: siteInput("Coast", "mlpd-op-coast", "Kingscliff"),
    });
    await createClinicLocation({
      clinicId: group.clinicId,
      siteId: group.siteId,
      values: { ...locationInput("Robina"), slug: "robina" },
    });
    const loaded = await loadOperatorSiteLocationCapacity(group.clinicId);
    expect(loaded.usage).toEqual({ activeSites: 2, activeLocations: 3 });
    expect(loaded.allowance.siteAllowance).toBe(2);
    expect(loaded.allowance.locationAllowance).toBe(5);
    expect(loaded.groupCapacity?.configured).toBe(false);

    expect(
      await updateOperatorSiteLocationAllowance({
        clinicId: group.clinicId,
        siteAllowance: 9,
        locationAllowance: 9,
      })
    ).toMatchObject({ ok: false });
    const unchanged = await db().clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: group.clinicId },
    });
    expect(unchanged.siteAllowance).toBe(2);
    expect(unchanged.purchasedAdditionalSiteQuantity).toBeNull();

    expect(
      await updateOperatorGroupComplimentaryCapacity({
        clinicId: group.clinicId,
        extraSiteAllowance: 7,
        extraLocationAllowance: 0,
      })
    ).toEqual({ ok: true, commerciallyActive: true });
    const raised = await db().clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: group.clinicId },
    });
    expect(raised.purchasedAdditionalSiteQuantity).toBe(0);
    expect(raised.extraSiteAllowance).toBe(7);
    expect(raised.extraLocationAllowance).toBe(0);
    expect(raised.siteAllowance).toBe(9);
    expect(raised.locationAllowance).toBe(5);
    expect(
      await updateOperatorGroupComplimentaryCapacity({
        clinicId: group.clinicId,
        extraSiteAllowance: 7,
        extraLocationAllowance: 0,
      })
    ).toEqual({ ok: true, commerciallyActive: true });
    const repeated = await db().clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: group.clinicId },
    });
    expect(repeated.siteAllowance).toBe(9);
    expect(repeated.locationAllowance).toBe(5);

    await deactivateClinicSite({
      clinicId: group.clinicId,
      siteId: second.siteId,
    });
    const coastLocation = await db().clinicLocation.findFirstOrThrow({
      where: { clinicSiteId: second.siteId, servesSiteRoot: true },
    });
    expect(coastLocation.active).toBe(true);
    expect(await countActiveSiteLocationUsage(db(), group.clinicId)).toEqual({
      activeSites: 1,
      activeLocations: 2,
    });
    await expect(getClinicBySlug("mlpd-op-coast")).resolves.toBeNull();

    await db().clinicEntitlement.update({
      where: { clinicId: group.clinicId },
      data: {
        purchasedAdditionalSiteQuantity: null,
        extraSiteAllowance: 0,
        extraLocationAllowance: 0,
        siteAllowance: 2,
        locationAllowance: 2,
      },
    });
    await expect(
      reactivateClinicSite({ clinicId: group.clinicId, siteId: second.siteId })
    ).rejects.toMatchObject({ code: "capacity" });
    await db().clinicEntitlement.update({
      where: { clinicId: group.clinicId },
      data: { locationAllowance: 3 },
    });
    await reactivateClinicSite({
      clinicId: group.clinicId,
      siteId: second.siteId,
    });
    expect(await getClinicBySlug("mlpd-op-coast")).not.toBeNull();

    await expect(
      deactivateClinicLocation({
        clinicId: group.clinicId,
        locationId: group.locationId,
      })
    ).rejects.toThrow(/root location/i);

    const allowanceSource = readFileSync(
      "lib/operator/update-site-location-allowance.ts",
      "utf8"
    );
    const actionSource = readFileSync(
      "app/(staff)/(operator)/operator/clinics/[clinicId]/site-location-actions.ts",
      "utf8"
    );
    expect(allowanceSource.toLowerCase()).not.toContain("stripe");
    expect(actionSource.toLowerCase()).not.toContain("stripe");
  });

  it("reduces Group complimentary extras below usage without deactivating sites", async () => {
    const group = await seedAccount({
      key: "extras-over",
      plan: "GROUP",
      siteAllowance: 4,
      locationAllowance: 7,
    });
    await createClinicSiteWithRootLocation({
      clinicId: group.clinicId,
      values: siteInput("Second", "mlpd-extras-two", "Second"),
    });
    await createClinicSiteWithRootLocation({
      clinicId: group.clinicId,
      values: siteInput("Third", "mlpd-extras-three", "Third"),
    });
    expect(await countActiveSiteLocationUsage(db(), group.clinicId)).toEqual({
      activeSites: 3,
      activeLocations: 3,
    });

    expect(
      await updateOperatorGroupComplimentaryCapacity({
        clinicId: group.clinicId,
        extraSiteAllowance: 0,
        extraLocationAllowance: 0,
      })
    ).toEqual({ ok: true, commerciallyActive: true });

    const row = await db().clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: group.clinicId },
    });
    expect(row.purchasedAdditionalSiteQuantity).toBe(0);
    expect(row.extraSiteAllowance).toBe(0);
    expect(row.extraLocationAllowance).toBe(0);
    expect(row.siteAllowance).toBe(2);
    expect(row.locationAllowance).toBe(5);
    expect(
      await db().clinicSite.count({
        where: { clinicId: group.clinicId, active: true },
      })
    ).toBe(3);
    expect(
      await db().clinicLocation.count({
        where: { clinicId: group.clinicId, active: true },
      })
    ).toBe(3);
    await expect(
      createClinicSiteWithRootLocation({
        clinicId: group.clinicId,
        values: siteInput("Fourth", "mlpd-extras-four", "Fourth"),
      })
    ).rejects.toMatchObject({ code: "capacity" });
  });

  it("fails a plan transition closed when active sites or locations would not fit", async () => {
    const practice = await seedAccount({
      key: "downgrade",
      plan: "PRACTICE",
      locationAllowance: 3,
    });
    await createClinicLocation({
      clinicId: practice.clinicId,
      siteId: practice.siteId,
      values: { ...locationInput("Robina"), slug: "robina" },
    });
    const readiness = await loadEssentialDowngradeReadiness(practice.clinicId);
    expect(readiness.conflicts).toContain("SITE_LOCATIONS");
    expect(readiness.locations).toEqual({ current: 2, limit: 1 });

    const group = await seedAccount({
      key: "downgrade-group",
      plan: "GROUP",
      siteAllowance: 2,
      locationAllowance: 5,
      billingStatus: BillingStatus.OFFER_PREPARED,
      entitlementStatus: EntitlementStatus.PENDING,
    });
    await createClinicSiteWithRootLocation({
      clinicId: group.clinicId,
      values: siteInput("Coast", "mlpd-down-coast", "Kingscliff"),
    });
    const offer = await prepareClinicCommercialOffer({
      clinicId: group.clinicId,
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
    });
    expect(offer).toMatchObject({ ok: false });
    const stillGroup = await db().clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: group.clinicId },
    });
    expect(stillGroup.commercialPlan).toBe("GROUP");
    expect(
      await db().clinicSite.count({
        where: { clinicId: group.clinicId, active: true },
      })
    ).toBe(2);
  });
});

function branding(
  displayName: string,
  primaryColor: string
): SiteBrandingInput {
  return {
    name: displayName,
    displayName,
    logoUrl: null,
    darkLogoUrl: null,
    faviconUrl: null,
    primaryColor,
    accentColor: "#15803d",
    darkPrimaryColor: null,
    darkAccentColor: null,
    useCustomDarkBranding: false,
    neutralColor: "#f0fdf4",
    radiusPreset: "SOFT",
    typeface: null,
    instructionTerminology: "AFTERCARE",
    themeMode: "LIGHT",
    allowPatientThemeToggle: true,
    showCareGuideAttribution: true,
  };
}
