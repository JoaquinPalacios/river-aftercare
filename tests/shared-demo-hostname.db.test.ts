import "dotenv/config";

import { afterAll, describe, expect, it } from "vitest";

import { getClinicBySlug } from "@/lib/aftercare/get-clinic-by-slug";
import { ensurePrimarySiteAndRootLocation } from "@/lib/clinics/primary-site-location.mjs";
import { isLocalDevelopmentDatabase } from "@/lib/dev/database-target";
import {
  applySharedDemoConfig,
  loadSharedDemoConfigSnapshot,
  planSharedDemoConfig,
} from "@/lib/dev/shared-demo-config";
import { getPrisma } from "@/lib/prisma";

const DECOY_ID = "sdp_decoy_demo_host";
const DENTAL_GUIDE_ID = "practice_guide_demo_rivers_extraction";
const local = isLocalDevelopmentDatabase(process.env.DATABASE_URL);
const describeDb = local ? describe : describe.skip;

describeDb("shared demo hostname and configuration", () => {
  const prisma = getPrisma();

  afterAll(async () => {
    await prisma.clinic.deleteMany({ where: { id: DECOY_ID } });
    const snapshot = await loadSharedDemoConfigSnapshot(prisma);
    if (snapshot.site) {
      const plan = planSharedDemoConfig({
        local: true,
        apply: true,
        allowProduction: false,
        confirmSharedDemo: false,
        confirmBranding: false,
        snapshot,
      });
      await applySharedDemoConfig(prisma, plan);
    }
    await prisma.$disconnect();
  });

  it("resolves demo to demodental and ignores a site whose slug is demo", async () => {
    await prisma.clinic.deleteMany({ where: { id: DECOY_ID } });
    await prisma.clinic.create({
      data: {
        id: DECOY_ID,
        name: "Decoy Demo Host",
        slug: "sdp-decoy-host",
      },
    });
    await prisma.clinicProfile.create({
      data: {
        clinicId: DECOY_ID,
        displayName: "Decoy Demo Host",
      },
    });
    const profile = await prisma.clinicProfile.findUniqueOrThrow({
      where: { clinicId: DECOY_ID },
    });
    await ensurePrimarySiteAndRootLocation(prisma, {
      clinicId: DECOY_ID,
      clinicName: "Decoy Demo Host",
      slug: "sdp-decoy-host",
      profile,
    });
    await prisma.clinicSite.update({
      where: { slug: "sdp-decoy-host" },
      data: { slug: "demo" },
    });

    const decoy = await prisma.clinicSite.findUnique({
      where: { slug: "demo" },
      select: { clinicId: true },
    });
    expect(decoy?.clinicId).toBe(DECOY_ID);

    const aliased = await getClinicBySlug("demo");
    const legacy = await getClinicBySlug("demodental");
    expect(aliased?.id).toBe("clinic_demo_rivers");
    expect(aliased?.slug).toBe("demodental");
    expect(legacy?.id).toBe(aliased?.id);
    await expect(getClinicBySlug("not-the-shared-demo")).resolves.toBeNull();
  });

  it("adds a missing category without moving the dental practice snapshot", async () => {
    const before = await prisma.practiceGuidePlacement.findFirstOrThrow({
      where: {
        practiceGuideId: DENTAL_GUIDE_ID,
        isEnabled: true,
      },
      select: { publishedPracticeGuideRevisionId: true },
    });
    const site = await prisma.clinicSite.findUniqueOrThrow({
      where: { slug: "demodental" },
      select: { id: true },
    });
    await prisma.clinicSiteServiceCategory.deleteMany({
      where: { clinicSiteId: site.id, serviceCategory: "CHIROPRACTIC" },
    });

    const planned = planSharedDemoConfig({
      local: true,
      apply: true,
      allowProduction: false,
      confirmSharedDemo: false,
      confirmBranding: false,
      snapshot: await loadSharedDemoConfigSnapshot(prisma),
    });
    expect(planned.action).toBe("configure");
    expect(planned.missingCategories).toContain("CHIROPRACTIC");
    expect(planned.writesIdentity).toBe(false);
    const clinicId = "clinic_demo_rivers";
    const sitesBefore = await prisma.clinicSite.count({
      where: { clinicId },
    });
    const locationsBefore = await prisma.clinicLocation.count({
      where: { clinicId },
    });
    const brandBefore = await prisma.clinicSite.findUniqueOrThrow({
      where: { slug: "demodental" },
      select: {
        primaryColor: true,
        accentColor: true,
        logoUrl: true,
        themeMode: true,
      },
    });
    const guideBefore = await prisma.practiceGuide.findUniqueOrThrow({
      where: { id: DENTAL_GUIDE_ID },
      select: { pinnedRevisionId: true, publicSlug: true },
    });
    const overridesBefore = await prisma.practiceGuideOverride.count({
      where: { practiceGuideId: DENTAL_GUIDE_ID },
    });
    const additionsBefore = await prisma.practiceGuideAddition.count({
      where: { practiceGuideId: DENTAL_GUIDE_ID },
    });
    await applySharedDemoConfig(prisma, planned);

    const restored = await loadSharedDemoConfigSnapshot(prisma);
    expect(restored.categories).toEqual(
      expect.arrayContaining([
        "DENTAL",
        "PHYSIOTHERAPY",
        "CHIROPRACTIC",
        "COSMETIC_AESTHETIC",
      ])
    );
    const again = planSharedDemoConfig({
      local: true,
      apply: true,
      allowProduction: false,
      confirmSharedDemo: false,
      confirmBranding: false,
      snapshot: restored,
    });
    expect(again.action).toBe("noop");

    const after = await prisma.practiceGuidePlacement.findFirstOrThrow({
      where: {
        practiceGuideId: DENTAL_GUIDE_ID,
        isEnabled: true,
      },
      select: { publishedPracticeGuideRevisionId: true },
    });
    expect(after.publishedPracticeGuideRevisionId).toBe(
      before.publishedPracticeGuideRevisionId
    );
    expect(await prisma.clinicSite.count({ where: { clinicId } })).toBe(
      sitesBefore
    );
    expect(await prisma.clinicLocation.count({ where: { clinicId } })).toBe(
      locationsBefore
    );
    const brandAfter = await prisma.clinicSite.findUniqueOrThrow({
      where: { slug: "demodental" },
      select: {
        primaryColor: true,
        accentColor: true,
        logoUrl: true,
        themeMode: true,
      },
    });
    expect(brandAfter).toEqual(brandBefore);
    const guideAfter = await prisma.practiceGuide.findUniqueOrThrow({
      where: { id: DENTAL_GUIDE_ID },
      select: { pinnedRevisionId: true, publicSlug: true },
    });
    expect(guideAfter).toEqual(guideBefore);
    expect(
      await prisma.practiceGuideOverride.count({
        where: { practiceGuideId: DENTAL_GUIDE_ID },
      })
    ).toBe(overridesBefore);
    expect(
      await prisma.practiceGuideAddition.count({
        where: { practiceGuideId: DENTAL_GUIDE_ID },
      })
    ).toBe(additionsBefore);
  });

  it("clears a stored phone without replacing colour, logo, or theme and without creating rows", async () => {
    const clinicId = "clinic_demo_rivers";
    const before = await prisma.clinicSite.findUniqueOrThrow({
      where: { slug: "demodental" },
      select: {
        primaryColor: true,
        accentColor: true,
        logoUrl: true,
        themeMode: true,
      },
    });
    const clinicsBefore = await prisma.clinic.count();
    const sitesBefore = await prisma.clinicSite.count();
    const locationsBefore = await prisma.clinicLocation.count();
    await prisma.clinicProfile.update({
      where: { clinicId },
      data: { phone: "0000000000" },
    });
    try {
      const planned = planSharedDemoConfig({
        local: true,
        apply: true,
        allowProduction: false,
        confirmSharedDemo: false,
        confirmBranding: true,
        snapshot: await loadSharedDemoConfigSnapshot(prisma),
      });
      expect(planned.action).toBe("configure");
      expect(planned.writesIdentity).toBe(true);
      expect(planned.writesCategories).toBe(false);
      expect(planned.clinicId).toBe(clinicId);
      await applySharedDemoConfig(prisma, planned);
      const profile = await prisma.clinicProfile.findUniqueOrThrow({
        where: { clinicId },
        select: {
          phone: true,
          primaryColor: true,
          logoUrl: true,
          themeMode: true,
        },
      });
      expect(profile.phone).toBeNull();
      expect(profile.primaryColor).toBe(before.primaryColor);
      expect(profile.logoUrl).toBe(before.logoUrl);
      expect(profile.themeMode).toBe(before.themeMode);
      const site = await prisma.clinicSite.findUniqueOrThrow({
        where: { slug: "demodental" },
        select: {
          primaryColor: true,
          accentColor: true,
          logoUrl: true,
          themeMode: true,
        },
      });
      expect(site).toEqual(before);
      const repeat = planSharedDemoConfig({
        local: true,
        apply: true,
        allowProduction: false,
        confirmSharedDemo: false,
        confirmBranding: true,
        snapshot: await loadSharedDemoConfigSnapshot(prisma),
      });
      expect(repeat.action).toBe("noop");
    } finally {
      await prisma.clinicProfile.update({
        where: { clinicId },
        data: { phone: null },
      });
    }
    expect(await prisma.clinic.count()).toBe(clinicsBefore);
    expect(await prisma.clinicSite.count()).toBe(sitesBefore);
    expect(await prisma.clinicLocation.count()).toBe(locationsBefore);

    await expect(
      applySharedDemoConfig(prisma, {
        action: "configure",
        reason: "missing account",
        clinicId: "missing_shared_demo_account",
        siteId: "missing_shared_demo_site",
        locationId: "missing_shared_demo_location",
        missingCategories: [],
        writesCategories: false,
        writesIdentity: true,
        identityFields: [],
        contactFields: [],
        emergencyFields: [],
        retainedProfileBrand: [],
        retainedSiteBrand: [],
        categoryReport: {
          label: "service categories",
          current: "(none)",
          proposed: "(none)",
        },
      })
    ).rejects.toThrow(/does not create an account/);
    expect(await prisma.clinic.count()).toBe(clinicsBefore);
  });
});
