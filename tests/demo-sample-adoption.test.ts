import "dotenv/config";

import { readFileSync } from "node:fs";

import {
  GuideRevisionStatus,
  type GuideSectionKind,
  type PracticeSectionProvenance,
} from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { abandonCanonicalTemplateDraft } from "@/lib/canonical-templates/abandon-canonical-template-draft";
import { createCanonicalTemplate } from "@/lib/canonical-templates/create-canonical-template";
import { createCanonicalTemplateDraft } from "@/lib/canonical-templates/create-canonical-template-draft";
import { publishCanonicalTemplateRevision } from "@/lib/canonical-templates/publish-canonical-template-revision";
import { saveCanonicalTemplateDraft } from "@/lib/canonical-templates/save-canonical-template-draft";
import {
  adoptPublishedSampleForDesignatedDemo,
  type AdoptPublishedSampleInput,
} from "@/lib/demo-adoption/adopt-demo-sample-revision";
import {
  ClinicPortalError,
  isClinicPortalError,
} from "@/lib/clinic-portal/errors";
import { getPrisma } from "@/lib/prisma";
import { withSampleCategoryLock } from "@/tests/active-sample-slot";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const describeDb = hasDatabase ? describe : describe.skip;

const TEMPLATE_ID = "guide_tmpl_demo_extraction";
const CANONICAL_V1 = "guide_rev_demo_extraction_v1";
const PRACTICE_GUIDE_ID = "practice_guide_demo_rivers_extraction";
const PRACTICE_V1 = "practice_rev_demo_rivers_extraction_v1";
const DRAFT_ID = "practice_rev_demo_rivers_extraction_draft";
const PLACEMENT_ID = "mpl_practice_guide_demo_rivers_extraction";
const CLINIC_ID = "clinic_demo_rivers";
const OVERRIDE_ID = "practice_override_demo_rivers_extraction_contact";
const ADDITION_ID = "practice_addition_demo_rivers_extraction_hours";
const OPERATOR_ID = "sdp_operator";
const STAFF_ID = "sdp_staff";

interface DraftSectionSnapshot {
  key: string;
  kind: GuideSectionKind;
  title: string;
  body: string;
  periodLabel: string | null;
  startDay: number | null;
  endDay: number | null;
  sortOrder: number;
  provenance: PracticeSectionProvenance;
}

let originalDraftSections: DraftSectionSnapshot[] = [];

async function expectPortalCode(
  promise: Promise<unknown>,
  code: ClinicPortalError["code"]
) {
  try {
    await promise;
  } catch (error) {
    expect(isClinicPortalError(error)).toBe(true);
    if (isClinicPortalError(error)) {
      expect(error.code).toBe(code);
      return error;
    }
  }
  throw new Error(`Expected clinic portal error ${code}.`);
}

async function restoreDemo() {
  const prisma = getPrisma();
  const drafts = await prisma.guideTemplateRevision.findMany({
    where: { guideTemplateId: TEMPLATE_ID, status: GuideRevisionStatus.DRAFT },
    select: { id: true },
  });
  for (const draft of drafts) {
    await abandonCanonicalTemplateDraft({
      templateId: TEMPLATE_ID,
      revisionId: draft.id,
      actorUserId: OPERATOR_ID,
    });
  }

  await prisma.practiceGuide.update({
    where: { id: PRACTICE_GUIDE_ID },
    data: {
      clinicId: CLINIC_ID,
      title: "Tooth Extraction",
      guideTemplateId: TEMPLATE_ID,
      pinnedRevisionId: CANONICAL_V1,
      sourceGuideTemplateId: null,
      adaptedAt: null,
      copiedFromPracticeGuideId: null,
      publicSlug: "extraction",
      isEnabled: true,
      status: "PUBLISHED",
    },
  });
  await prisma.practiceGuidePlacement.update({
    where: { id: PLACEMENT_ID },
    data: {
      publishedPracticeGuideRevisionId: PRACTICE_V1,
      publicSlug: "extraction",
      isEnabled: true,
    },
  });
  await prisma.practiceGuideRevision.deleteMany({
    where: { practiceGuideId: PRACTICE_GUIDE_ID, version: { gt: 1 } },
  });
  await prisma.guideTemplateRevision.deleteMany({
    where: {
      guideTemplateId: TEMPLATE_ID,
      version: { gt: 1 },
    },
  });
  await prisma.practiceGuideOverride.deleteMany({
    where: { practiceGuideId: PRACTICE_GUIDE_ID, id: { not: OVERRIDE_ID } },
  });
  await prisma.practiceGuideAddition.deleteMany({
    where: { practiceGuideId: PRACTICE_GUIDE_ID, id: { not: ADDITION_ID } },
  });
  await prisma.practiceGuideRevisionSection.deleteMany({
    where: { revisionId: DRAFT_ID },
  });
  if (originalDraftSections.length > 0) {
    await prisma.practiceGuideRevisionSection.createMany({
      data: originalDraftSections.map((section) => ({
        revisionId: DRAFT_ID,
        ...section,
      })),
    });
  }
  await prisma.practiceGuide.deleteMany({
    where: {
      OR: [{ id: "sdp_copy_source" }, { clinicId: "sdp_other_clinic" }],
    },
  });
  await prisma.clinic.deleteMany({ where: { id: "sdp_other_clinic" } });
  await prisma.guideTemplate.deleteMany({
    where: { slug: { startsWith: "sdp-" } },
  });
}

async function publishChangedExtraction(body: string) {
  const opened = await createCanonicalTemplateDraft({
    templateId: TEMPLATE_ID,
    actorUserId: OPERATOR_ID,
  });
  const revision = await getPrisma().guideTemplateRevision.findUniqueOrThrow({
    where: { id: opened.revisionId },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
        include: {
          homeCareInstructions: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
  await saveCanonicalTemplateDraft({
    templateId: TEMPLATE_ID,
    revisionId: opened.revisionId,
    actorUserId: OPERATOR_ID,
    sections: revision.sections.map((section) => ({
      key: section.key,
      kind: section.kind,
      title: section.title,
      body: section.key === "what-is-normal" ? body : section.body,
      periodLabel: section.periodLabel,
      startDay: section.startDay,
      endDay: section.endDay,
      homeCareInstructions: section.homeCareInstructions.map((item) => ({
        key: item.key,
        title: item.title,
        body: item.body,
        frequencyCount: item.frequencyCount,
        frequencyPeriod: item.frequencyPeriod,
        timingLabel: item.timingLabel,
        durationValue: item.durationValue,
        durationUnit: item.durationUnit,
      })),
    })),
  });
  return publishCanonicalTemplateRevision({
    templateId: TEMPLATE_ID,
    revisionId: opened.revisionId,
    actorUserId: OPERATOR_ID,
    expectedVersion: opened.version,
  });
}

function adoptInput(
  overrides: Partial<AdoptPublishedSampleInput> &
    Pick<AdoptPublishedSampleInput, "canonicalRevisionId">
): AdoptPublishedSampleInput {
  return {
    actorUserId: OPERATOR_ID,
    templateId: TEMPLATE_ID,
    expectedPinnedRevisionId: CANONICAL_V1,
    expectedPublishedPracticeGuideRevisionId: PRACTICE_V1,
    ...overrides,
  };
}

describe("demo sample adoption contracts", () => {
  it("does not adopt a demo when a canonical revision is published", () => {
    const source = readFileSync(
      "lib/canonical-templates/publish-canonical-template-revision.ts",
      "utf8"
    );
    expect(source).not.toContain("adoptPublishedSample");
    expect(source).not.toContain("advancePublishedPlacement");
  });
});

describeDb("designated demo sample adoption", () => {
  beforeAll(async () => {
    const prisma = getPrisma();
    await prisma.user.deleteMany({
      where: {
        email: {
          in: ["operator@sdp.example.test", "staff@sdp.example.test"],
        },
      },
    });
    await prisma.user.create({
      data: {
        id: OPERATOR_ID,
        email: "operator@sdp.example.test",
        name: "Demo Adoption Operator",
        platformRole: "OPERATOR",
      },
    });
    await prisma.user.create({
      data: {
        id: STAFF_ID,
        email: "staff@sdp.example.test",
        name: "Demo Adoption Staff",
        platformRole: "NONE",
      },
    });
    originalDraftSections = await prisma.practiceGuideRevisionSection.findMany({
      where: { revisionId: DRAFT_ID },
      orderBy: { sortOrder: "asc" },
      select: {
        key: true,
        kind: true,
        title: true,
        body: true,
        periodLabel: true,
        startDay: true,
        endDay: true,
        sortOrder: true,
        provenance: true,
      },
    });
  });

  beforeEach(async () => {
    await withSampleCategoryLock(["DENTAL"], async () => {
      await restoreDemo();
    });
  });

  afterAll(async () => {
    if (!hasDatabase) {
      return;
    }
    await withSampleCategoryLock(["DENTAL"], async () => {
      await restoreDemo();
    });
    const prisma = getPrisma();
    await prisma.user.deleteMany({
      where: { id: { in: [OPERATOR_ID, STAFF_ID] } },
    });
  });

  it("rejects a caller who is not a platform operator", async () => {
    await withSampleCategoryLock(["DENTAL"], async () => {
      const error = await expectPortalCode(
        adoptPublishedSampleForDesignatedDemo(
          adoptInput({
            actorUserId: STAFF_ID,
            canonicalRevisionId: CANONICAL_V1,
          })
        ),
        "forbidden"
      );
      expect(error.message).toContain("cannot update the live demo");
    });
  });

  it("rejects a canonical draft and a production template", async () => {
    await withSampleCategoryLock(["DENTAL"], async () => {
      const opened = await createCanonicalTemplateDraft({
        templateId: TEMPLATE_ID,
        actorUserId: OPERATOR_ID,
      });
      const draftError = await expectPortalCode(
        adoptPublishedSampleForDesignatedDemo(
          adoptInput({ canonicalRevisionId: opened.revisionId })
        ),
        "invalid"
      );
      expect(draftError.message).toContain("canonical draft");

      const production = await createCanonicalTemplate({
        actorUserId: OPERATOR_ID,
        title: "Synthetic production guide",
        slug: "sdp-production",
        serviceCategory: "DENTAL",
        classification: "PRODUCTION",
      });
      const productionError = await expectPortalCode(
        adoptPublishedSampleForDesignatedDemo({
          actorUserId: OPERATOR_ID,
          templateId: production.templateId,
          canonicalRevisionId: production.revisionId,
          expectedPinnedRevisionId: null,
          expectedPublishedPracticeGuideRevisionId: null,
        }),
        "invalid"
      );
      expect(productionError.message).toContain("production template");
    });
  });

  it("rejects a sample category that has no designated demo", async () => {
    await withSampleCategoryLock(["DENTAL", "PHYSIOTHERAPY"], async () => {
      const sample = await createCanonicalTemplate({
        actorUserId: OPERATOR_ID,
        title: "Synthetic physiotherapy sample",
        slug: "sdp-physiotherapy",
        serviceCategory: "PHYSIOTHERAPY",
        classification: "SAMPLE",
      });
      const error = await expectPortalCode(
        adoptPublishedSampleForDesignatedDemo({
          actorUserId: OPERATOR_ID,
          templateId: sample.templateId,
          canonicalRevisionId: sample.revisionId,
          expectedPinnedRevisionId: null,
          expectedPublishedPracticeGuideRevisionId: null,
        }),
        "invalid"
      );
      expect(error.message).toContain("does not have a designated demo");
    });
  });

  it("publishing a canonical revision leaves the demo pin and snapshot in place", async () => {
    await withSampleCategoryLock(["DENTAL"], async () => {
      const published = await publishChangedExtraction(
        "Synthetic normal text that must not appear until adoption."
      );
      const prisma = getPrisma();
      const guide = await prisma.practiceGuide.findUniqueOrThrow({
        where: { id: PRACTICE_GUIDE_ID },
      });
      const placement = await prisma.practiceGuidePlacement.findUniqueOrThrow({
        where: { id: PLACEMENT_ID },
      });
      expect(published.version).toBeGreaterThan(1);
      expect(guide.pinnedRevisionId).toBe(CANONICAL_V1);
      expect(placement.publishedPracticeGuideRevisionId).toBe(PRACTICE_V1);
      expect(placement.publicSlug).toBe("extraction");
    });
  });

  it("adopts a published sample, keeps history, and is idempotent", async () => {
    await withSampleCategoryLock(["DENTAL"], async () => {
      const prisma = getPrisma();
      const published = await publishChangedExtraction(
        "Synthetic normal text adopted into the demo."
      );
      const unrelated = await prisma.clinic.create({
        data: {
          id: "sdp_other_clinic",
          name: "Unrelated Clinic",
          slug: "sdp-other-clinic",
        },
      });
      await prisma.practiceGuide.create({
        data: {
          id: "sdp_other_guide",
          clinicId: unrelated.id,
          title: "Unrelated extraction",
          guideTemplateId: TEMPLATE_ID,
          pinnedRevisionId: CANONICAL_V1,
          publicSlug: "extraction",
          status: "PUBLISHED",
        },
      });

      const first = await adoptPublishedSampleForDesignatedDemo(
        adoptInput({ canonicalRevisionId: published.revisionId })
      );
      expect(first.status).toBe("adopted");
      expect(first.publicSlug).toBe("extraction");

      const guide = await prisma.practiceGuide.findUniqueOrThrow({
        where: { id: PRACTICE_GUIDE_ID },
      });
      const placement = await prisma.practiceGuidePlacement.findUniqueOrThrow({
        where: { id: PLACEMENT_ID },
      });
      expect(guide.pinnedRevisionId).toBe(published.revisionId);
      expect(placement.publishedPracticeGuideRevisionId).toBe(
        first.practiceRevisionId
      );
      expect(placement.publicSlug).toBe("extraction");
      expect(first.practiceRevisionId).not.toBe(PRACTICE_V1);

      const historical = await prisma.practiceGuideRevision.findUniqueOrThrow({
        where: { id: PRACTICE_V1 },
        include: { sections: true },
      });
      expect(
        historical.sections.find((section) => section.key === "what-is-normal")
          ?.body
      ).not.toContain("Synthetic normal text adopted");
      expect(historical.id).toBe(PRACTICE_V1);

      const adopted = await prisma.practiceGuideRevision.findUniqueOrThrow({
        where: { id: first.practiceRevisionId },
        include: { sections: { orderBy: { sortOrder: "asc" } } },
      });
      expect(
        adopted.sections.find((section) => section.key === "what-is-normal")
          ?.body
      ).toContain("Synthetic normal text adopted");
      expect(
        adopted.sections.find((section) => section.key === "first-24-hours")
          ?.title
      ).toBe("The first day at Riverside Dental Demo");
      expect(
        adopted.sections.find((section) => section.key === "weekend-contact")
          ?.title
      ).toBe("Weekend contact");
      const canonicalV1 = await prisma.guideTemplateRevision.findUniqueOrThrow({
        where: { id: CANONICAL_V1 },
      });
      expect(canonicalV1.version).toBe(1);
      expect(canonicalV1.status).toBe("PUBLISHED");

      const other = await prisma.practiceGuide.findUniqueOrThrow({
        where: { id: "sdp_other_guide" },
      });
      expect(other.pinnedRevisionId).toBe(CANONICAL_V1);

      const publishedCount = await prisma.practiceGuideRevision.count({
        where: {
          practiceGuideId: PRACTICE_GUIDE_ID,
          status: "PUBLISHED",
        },
      });
      const repeat = await adoptPublishedSampleForDesignatedDemo(
        adoptInput({
          canonicalRevisionId: published.revisionId,
          expectedPinnedRevisionId: guide.pinnedRevisionId,
          expectedPublishedPracticeGuideRevisionId:
            placement.publishedPracticeGuideRevisionId,
        })
      );
      const staleRetry = await adoptPublishedSampleForDesignatedDemo(
        adoptInput({ canonicalRevisionId: published.revisionId })
      );
      expect(repeat.status).toBe("current");
      expect(staleRetry.status).toBe("current");
      expect(staleRetry.practiceRevisionId).toBe(first.practiceRevisionId);
      expect(
        await prisma.practiceGuideRevision.count({
          where: {
            practiceGuideId: PRACTICE_GUIDE_ID,
            status: "PUBLISHED",
          },
        })
      ).toBe(publishedCount);
    });
  });

  it("rejects a stale confirmation for a different revision", async () => {
    await withSampleCategoryLock(["DENTAL"], async () => {
      const firstPublication = await publishChangedExtraction(
        "Synthetic normal text for revision two."
      );
      await adoptPublishedSampleForDesignatedDemo(
        adoptInput({ canonicalRevisionId: firstPublication.revisionId })
      );
      const secondPublication = await publishChangedExtraction(
        "Synthetic normal text for revision three."
      );
      const error = await expectPortalCode(
        adoptPublishedSampleForDesignatedDemo(
          adoptInput({ canonicalRevisionId: secondPublication.revisionId })
        ),
        "conflict"
      );
      expect(error.message).toContain("changed after this confirmation");
      const prisma = getPrisma();
      const guide = await prisma.practiceGuide.findUniqueOrThrow({
        where: { id: PRACTICE_GUIDE_ID },
      });
      expect(guide.pinnedRevisionId).toBe(firstPublication.revisionId);
    });
  });

  it("rejects a missing override key and an independent edit", async () => {
    await withSampleCategoryLock(["DENTAL"], async () => {
      const prisma = getPrisma();
      await prisma.practiceGuideOverride.create({
        data: {
          practiceGuideId: PRACTICE_GUIDE_ID,
          sectionKey: "retired-home-care",
          title: "Retired home care",
          body: "This section is no longer in the sample.",
        },
      });
      const missing = await expectPortalCode(
        adoptPublishedSampleForDesignatedDemo(
          adoptInput({ canonicalRevisionId: CANONICAL_V1 })
        ),
        "invalid"
      );
      expect(missing.message).toContain("retired-home-care");
      await prisma.practiceGuideOverride.deleteMany({
        where: {
          practiceGuideId: PRACTICE_GUIDE_ID,
          sectionKey: "retired-home-care",
        },
      });

      await prisma.practiceGuideRevisionSection.updateMany({
        where: { revisionId: DRAFT_ID, key: "what-is-normal" },
        data: { body: "Independent clinic draft edit." },
      });
      const published = await publishChangedExtraction(
        "Synthetic normal text that must not overwrite the draft."
      );
      const drifted = await expectPortalCode(
        adoptPublishedSampleForDesignatedDemo(
          adoptInput({ canonicalRevisionId: published.revisionId })
        ),
        "conflict"
      );
      expect(drifted.message).toContain("demo draft");
      const placement = await prisma.practiceGuidePlacement.findUniqueOrThrow({
        where: { id: PLACEMENT_ID },
      });
      expect(placement.publishedPracticeGuideRevisionId).toBe(PRACTICE_V1);
    });
  });

  it("does not overwrite an adapted guide or a location copy", async () => {
    await withSampleCategoryLock(["DENTAL"], async () => {
      const prisma = getPrisma();
      await prisma.practiceGuide.update({
        where: { id: PRACTICE_GUIDE_ID },
        data: {
          guideTemplateId: null,
          pinnedRevisionId: null,
          sourceGuideTemplateId: TEMPLATE_ID,
          adaptedAt: new Date(),
        },
      });
      const adapted = await expectPortalCode(
        adoptPublishedSampleForDesignatedDemo(
          adoptInput({ canonicalRevisionId: CANONICAL_V1 })
        ),
        "conflict"
      );
      expect(adapted.message).toContain("adapted");

      await prisma.practiceGuide.update({
        where: { id: PRACTICE_GUIDE_ID },
        data: {
          guideTemplateId: TEMPLATE_ID,
          pinnedRevisionId: CANONICAL_V1,
          sourceGuideTemplateId: null,
          adaptedAt: null,
        },
      });
      await prisma.practiceGuide.create({
        data: {
          id: "sdp_copy_source",
          clinicId: CLINIC_ID,
          title: "Copy source",
          publicSlug: "sdp-copy-source",
          status: "DRAFT",
        },
      });
      await prisma.practiceGuide.update({
        where: { id: PRACTICE_GUIDE_ID },
        data: { copiedFromPracticeGuideId: "sdp_copy_source" },
      });
      const copy = await expectPortalCode(
        adoptPublishedSampleForDesignatedDemo(
          adoptInput({ canonicalRevisionId: CANONICAL_V1 })
        ),
        "conflict"
      );
      expect(copy.message).toContain("location copy");
    });
  });

  it("serializes two adoption requests without a duplicate revision", async () => {
    await withSampleCategoryLock(["DENTAL"], async () => {
      const published = await publishChangedExtraction(
        "Synthetic normal text for a concurrent adoption."
      );
      const input = adoptInput({ canonicalRevisionId: published.revisionId });
      const [first, second] = await Promise.all([
        adoptPublishedSampleForDesignatedDemo(input),
        adoptPublishedSampleForDesignatedDemo(input),
      ]);
      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual(["adopted", "current"]);
      expect(first.practiceRevisionId).toBe(second.practiceRevisionId);
      const count = await getPrisma().practiceGuideRevision.count({
        where: {
          practiceGuideId: PRACTICE_GUIDE_ID,
          version: { gt: 1 },
          status: "PUBLISHED",
        },
      });
      expect(count).toBe(1);
    });
  });
});
