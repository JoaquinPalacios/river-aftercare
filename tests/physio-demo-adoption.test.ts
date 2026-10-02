import "dotenv/config";

import { afterAll, describe, expect, it } from "vitest";

import { abandonCanonicalTemplateDraft } from "@/lib/canonical-templates/abandon-canonical-template-draft";
import { createCanonicalTemplateDraft } from "@/lib/canonical-templates/create-canonical-template-draft";
import { publishCanonicalTemplateRevision } from "@/lib/canonical-templates/publish-canonical-template-revision";
import { saveCanonicalTemplateDraft } from "@/lib/canonical-templates/save-canonical-template-draft";
import { adoptPublishedSampleForDesignatedDemo } from "@/lib/demo-adoption/adopt-demo-sample-revision";
import {
  PHYSIO_DEMO_CANONICAL_REVISION_ID,
  PHYSIO_DEMO_PRACTICE_GUIDE_ID,
  PHYSIO_DEMO_PUBLIC_SLUG,
  PHYSIO_DEMO_TEMPLATE_ID,
} from "@/lib/dev/physio-demo-seed";
import { createPracticeGuideFromTemplate } from "@/lib/clinic-portal/create-practice-guide";
import { isClinicPortalError } from "@/lib/clinic-portal/errors";
import { listCanonicalGuideTemplates } from "@/lib/clinic-portal/list-canonical-templates";
import { getPrisma } from "@/lib/prisma";
import { withSampleCategoryLock } from "@/tests/active-sample-slot";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const describeDb = hasDatabase ? describe : describe.skip;

const PRACTICE_V1 = "practice_rev_demo_physio_home_exercise_v1";
const OPERATOR_ID = "sdp_physio_operator";
const DENTAL_GUIDE_ID = "practice_guide_demo_rivers_extraction";
const CHANGED_BODY =
  "Synthetic expected-symptom text adopted into River Physio Demo.";
const LATER_BODY =
  "Synthetic expected-symptom text for a later canonical revision.";

async function restorePhysioDemo() {
  const prisma = getPrisma();
  const drafts = await prisma.guideTemplateRevision.findMany({
    where: {
      guideTemplateId: PHYSIO_DEMO_TEMPLATE_ID,
      status: "DRAFT",
    },
    select: { id: true },
  });
  for (const draft of drafts) {
    await abandonCanonicalTemplateDraft({
      templateId: PHYSIO_DEMO_TEMPLATE_ID,
      revisionId: draft.id,
      actorUserId: OPERATOR_ID,
    });
  }
  await prisma.practiceGuide.update({
    where: { id: PHYSIO_DEMO_PRACTICE_GUIDE_ID },
    data: { pinnedRevisionId: PHYSIO_DEMO_CANONICAL_REVISION_ID },
  });
  await prisma.practiceGuidePlacement.updateMany({
    where: { practiceGuideId: PHYSIO_DEMO_PRACTICE_GUIDE_ID },
    data: { publishedPracticeGuideRevisionId: PRACTICE_V1 },
  });
  await prisma.practiceGuideRevision.deleteMany({
    where: {
      practiceGuideId: PHYSIO_DEMO_PRACTICE_GUIDE_ID,
      version: { gt: 1 },
    },
  });
  await prisma.guideTemplateRevision.deleteMany({
    where: {
      guideTemplateId: PHYSIO_DEMO_TEMPLATE_ID,
      version: { gt: 1 },
    },
  });
}

async function publishChangedHomeExercise(body: string) {
  const opened = await createCanonicalTemplateDraft({
    templateId: PHYSIO_DEMO_TEMPLATE_ID,
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
    templateId: PHYSIO_DEMO_TEMPLATE_ID,
    revisionId: opened.revisionId,
    actorUserId: OPERATOR_ID,
    sections: revision.sections.map((section) => ({
      key: section.key,
      kind: section.kind,
      title: section.title,
      body: section.key === "expected-symptoms" ? body : section.body,
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
    templateId: PHYSIO_DEMO_TEMPLATE_ID,
    revisionId: opened.revisionId,
    actorUserId: OPERATOR_ID,
    expectedVersion: opened.version,
  });
}

describeDb("physiotherapy designated demo adoption", () => {
  afterAll(async () => {
    if (!hasDatabase) {
      return;
    }
    await withSampleCategoryLock(["PHYSIOTHERAPY"], async () => {
      await restorePhysioDemo();
    });
    await getPrisma().user.deleteMany({ where: { id: OPERATOR_ID } });
  });

  it("adopts only into River Physio Demo and leaves Riverside in place", async () => {
    await withSampleCategoryLock(["PHYSIOTHERAPY"], async () => {
      const prisma = getPrisma();
      await prisma.user.deleteMany({ where: { id: OPERATOR_ID } });
      await prisma.user.create({
        data: {
          id: OPERATOR_ID,
          email: "physio-operator@sdp.example.test",
          name: "Physio Demo Operator",
          platformRole: "OPERATOR",
        },
      });
      await restorePhysioDemo();

      const dentalBefore = await prisma.practiceGuide.findUniqueOrThrow({
        where: { id: DENTAL_GUIDE_ID },
        select: { pinnedRevisionId: true, publicSlug: true },
      });
      const dental = await prisma.clinic.findUniqueOrThrow({
        where: { slug: "demodental" },
      });
      const physio = await prisma.clinic.findUniqueOrThrow({
        where: { slug: "demophysio" },
      });
      const dentalTemplates = await listCanonicalGuideTemplates(dental.id);
      const physioTemplates = await listCanonicalGuideTemplates(physio.id);
      expect(
        dentalTemplates.templates.some(
          (template) => template.id === PHYSIO_DEMO_TEMPLATE_ID
        )
      ).toBe(false);
      expect(
        physioTemplates.templates.find(
          (template) => template.id === PHYSIO_DEMO_TEMPLATE_ID
        )?.availability
      ).toBe("sample");
      expect(
        physioTemplates.templates.some(
          (template) =>
            template.serviceCategory === "DENTAL" &&
            template.availability === "sample"
        )
      ).toBe(false);

      await expect(
        createPracticeGuideFromTemplate({
          clinicId: dental.id,
          actorUserId: OPERATOR_ID,
          values: { templateId: PHYSIO_DEMO_TEMPLATE_ID },
        })
      ).rejects.toSatisfy(
        (error: unknown) =>
          isClinicPortalError(error) && error.code === "not_found"
      );
      await expect(
        createPracticeGuideFromTemplate({
          clinicId: physio.id,
          actorUserId: OPERATOR_ID,
          values: { templateId: PHYSIO_DEMO_TEMPLATE_ID },
        })
      ).rejects.toSatisfy(
        (error: unknown) =>
          isClinicPortalError(error) && error.code === "conflict"
      );

      const published = await publishChangedHomeExercise(CHANGED_BODY);
      const dentalDuring = await prisma.practiceGuide.findUniqueOrThrow({
        where: { id: DENTAL_GUIDE_ID },
        select: { pinnedRevisionId: true },
      });
      expect(dentalDuring.pinnedRevisionId).toBe(dentalBefore.pinnedRevisionId);

      const first = await adoptPublishedSampleForDesignatedDemo({
        actorUserId: OPERATOR_ID,
        templateId: PHYSIO_DEMO_TEMPLATE_ID,
        canonicalRevisionId: published.revisionId,
        expectedPinnedRevisionId: PHYSIO_DEMO_CANONICAL_REVISION_ID,
        expectedPublishedPracticeGuideRevisionId: PRACTICE_V1,
      });
      expect(first.status).toBe("adopted");
      expect(first.publicSlug).toBe(PHYSIO_DEMO_PUBLIC_SLUG);

      const historical = await prisma.practiceGuideRevision.findUniqueOrThrow({
        where: { id: PRACTICE_V1 },
        include: { sections: true },
      });
      expect(
        historical.sections.find(
          (section) => section.key === "expected-symptoms"
        )?.body
      ).not.toContain(CHANGED_BODY);
      const canonicalV1 = await prisma.guideTemplateRevision.findUniqueOrThrow({
        where: { id: PHYSIO_DEMO_CANONICAL_REVISION_ID },
        include: { sections: true },
      });
      expect(canonicalV1.status).toBe("PUBLISHED");
      expect(canonicalV1.version).toBe(1);
      expect(
        canonicalV1.sections.find(
          (section) => section.key === "expected-symptoms"
        )?.body
      ).not.toContain(CHANGED_BODY);

      const adopted = await prisma.practiceGuideRevision.findUniqueOrThrow({
        where: { id: first.practiceRevisionId },
        include: {
          sections: {
            orderBy: { sortOrder: "asc" },
            include: {
              homeCareInstructions: { orderBy: { sortOrder: "asc" } },
            },
          },
        },
      });
      expect(
        adopted.sections.find((section) => section.key === "expected-symptoms")
          ?.body
      ).toBe(CHANGED_BODY);
      expect(
        adopted.sections.find((section) => section.key === "introduction")
          ?.title
      ).toBe("About this demonstration");
      expect(
        adopted.sections.find((section) => section.key === "demonstration-note")
          ?.body
      ).toContain("not individually prescribed");
      expect(
        adopted.sections
          .find((section) => section.key === "home-care-plan")
          ?.homeCareInstructions.map((item) => item.title)
      ).toEqual(["Demonstration repetition", "Demonstration weekly note"]);
      expect(
        adopted.sections.some((section) => section.kind === "RECOVERY_TIMELINE")
      ).toBe(false);

      const guide = await prisma.practiceGuide.findUniqueOrThrow({
        where: { id: PHYSIO_DEMO_PRACTICE_GUIDE_ID },
      });
      const repeat = await adoptPublishedSampleForDesignatedDemo({
        actorUserId: OPERATOR_ID,
        templateId: PHYSIO_DEMO_TEMPLATE_ID,
        canonicalRevisionId: published.revisionId,
        expectedPinnedRevisionId: guide.pinnedRevisionId,
        expectedPublishedPracticeGuideRevisionId: first.practiceRevisionId,
      });
      expect(repeat.status).toBe("current");
      expect(repeat.practiceRevisionId).toBe(first.practiceRevisionId);

      const second = await publishChangedHomeExercise(LATER_BODY);
      const stale = adoptPublishedSampleForDesignatedDemo({
        actorUserId: OPERATOR_ID,
        templateId: PHYSIO_DEMO_TEMPLATE_ID,
        canonicalRevisionId: second.revisionId,
        expectedPinnedRevisionId: PHYSIO_DEMO_CANONICAL_REVISION_ID,
        expectedPublishedPracticeGuideRevisionId: PRACTICE_V1,
      });
      await expect(stale).rejects.toSatisfy(
        (error: unknown) =>
          isClinicPortalError(error) &&
          error.code === "conflict" &&
          error.message.includes("changed after this confirmation")
      );
      const stillFirst = await prisma.practiceGuide.findUniqueOrThrow({
        where: { id: PHYSIO_DEMO_PRACTICE_GUIDE_ID },
      });
      expect(stillFirst.pinnedRevisionId).toBe(published.revisionId);
      expect(stillFirst.publicSlug).toBe(PHYSIO_DEMO_PUBLIC_SLUG);

      const dentalAfter = await prisma.practiceGuide.findUniqueOrThrow({
        where: { id: DENTAL_GUIDE_ID },
        select: { pinnedRevisionId: true, publicSlug: true },
      });
      expect(dentalAfter).toEqual(dentalBefore);
    });
  });
});
