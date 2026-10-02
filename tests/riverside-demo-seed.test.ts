import "dotenv/config";

import { afterAll, describe, expect, it } from "vitest";

import {
  riversidePracticeSeedPlan,
  syncRiversidePracticePublication,
} from "@/lib/dev/riverside-demo-seed";
import { getPrisma } from "@/lib/prisma";
import { withSampleCategoryLock } from "@/tests/active-sample-slot";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const describeDb = hasDatabase ? describe : describe.skip;

const PRACTICE_GUIDE_ID = "practice_guide_demo_rivers_extraction";
const CANONICAL_V1 = "guide_rev_demo_extraction_v1";
const PRACTICE_V1 = "practice_rev_demo_rivers_extraction_v1";
const PLACEMENT_ID = "mpl_practice_guide_demo_rivers_extraction";
const TEMPLATE_ID = "guide_tmpl_demo_extraction";
const SYNTHETIC_PRACTICE_ID = "practice_rev_sdp_seed_guard";
const SYNTHETIC_CANONICAL_ID = "guide_rev_sdp_seed_pin";

describe("riverside demo seed plan", () => {
  it("preserves a publication newer than the original snapshot", () => {
    expect(riversidePracticeSeedPlan([]).preserveAdoptedRevisions).toBe(false);
    expect(riversidePracticeSeedPlan([1]).preserveAdoptedRevisions).toBe(false);
    expect(riversidePracticeSeedPlan([1, 2]).preserveAdoptedRevisions).toBe(
      true
    );
  });
});

describeDb("riverside demo reseed", () => {
  afterAll(async () => {
    if (!hasDatabase) {
      return;
    }
    await withSampleCategoryLock(["DENTAL"], async () => {
      const prisma = getPrisma();
      await prisma.practiceGuide.update({
        where: { id: PRACTICE_GUIDE_ID },
        data: { pinnedRevisionId: CANONICAL_V1 },
      });
      await prisma.practiceGuidePlacement.update({
        where: { id: PLACEMENT_ID },
        data: { publishedPracticeGuideRevisionId: PRACTICE_V1 },
      });
      await prisma.practiceGuideRevision.deleteMany({
        where: { id: SYNTHETIC_PRACTICE_ID },
      });
      await prisma.guideTemplateRevision.deleteMany({
        where: { id: SYNTHETIC_CANONICAL_ID },
      });
    });
  });

  it("does not reset an adopted demo when the seed publication sync runs again", async () => {
    await withSampleCategoryLock(["DENTAL"], async () => {
      const prisma = getPrisma();
      await prisma.practiceGuideRevision.deleteMany({
        where: { id: SYNTHETIC_PRACTICE_ID },
      });
      await prisma.guideTemplateRevision.deleteMany({
        where: { id: SYNTHETIC_CANONICAL_ID },
      });
      await prisma.guideTemplateRevision.create({
        data: {
          id: SYNTHETIC_CANONICAL_ID,
          guideTemplateId: TEMPLATE_ID,
          version: 40,
          status: "PUBLISHED",
          publishedAt: new Date("2026-10-02T00:00:00.000Z"),
        },
      });
      await prisma.practiceGuideRevision.create({
        data: {
          id: SYNTHETIC_PRACTICE_ID,
          practiceGuideId: PRACTICE_GUIDE_ID,
          version: 4,
          status: "PUBLISHED",
          title: "Tooth Extraction",
          publishedAt: new Date("2026-10-02T00:00:00.000Z"),
        },
      });
      await prisma.practiceGuide.update({
        where: { id: PRACTICE_GUIDE_ID },
        data: { pinnedRevisionId: SYNTHETIC_CANONICAL_ID },
      });
      await prisma.practiceGuidePlacement.update({
        where: { id: PLACEMENT_ID },
        data: {
          publishedPracticeGuideRevisionId: SYNTHETIC_PRACTICE_ID,
        },
      });

      const result = await syncRiversidePracticePublication(prisma, {
        practiceGuideId: PRACTICE_GUIDE_ID,
        clinicId: "clinic_demo_rivers",
        locationId: (
          await prisma.practiceGuidePlacement.findUniqueOrThrow({
            where: { id: PLACEMENT_ID },
            select: { locationId: true },
          })
        ).locationId,
        seededPinnedRevisionId: CANONICAL_V1,
        seededPublishedRevisionId: PRACTICE_V1,
        seededDraftRevisionId: "practice_rev_demo_rivers_extraction_draft",
        title: "Tooth Extraction",
        publicSlug: "extraction",
        publishedAt: new Date("2026-08-31T00:00:00.000Z"),
        sections: [],
      });

      expect(result.preserved).toBe(true);
      const guide = await prisma.practiceGuide.findUniqueOrThrow({
        where: { id: PRACTICE_GUIDE_ID },
      });
      const placement = await prisma.practiceGuidePlacement.findUniqueOrThrow({
        where: { id: PLACEMENT_ID },
      });
      const historical = await prisma.practiceGuideRevision.findUnique({
        where: { id: PRACTICE_V1 },
      });
      const adopted = await prisma.practiceGuideRevision.findUnique({
        where: { id: SYNTHETIC_PRACTICE_ID },
      });
      expect(guide.pinnedRevisionId).toBe(SYNTHETIC_CANONICAL_ID);
      expect(placement.publishedPracticeGuideRevisionId).toBe(
        SYNTHETIC_PRACTICE_ID
      );
      expect(placement.publicSlug).toBe("extraction");
      expect(historical?.id).toBe(PRACTICE_V1);
      expect(adopted?.version).toBe(4);
    });
  });
});
