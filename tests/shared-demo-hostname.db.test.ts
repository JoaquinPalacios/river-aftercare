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
    expect(planned.writesBranding).toBe(false);
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
  });
});
