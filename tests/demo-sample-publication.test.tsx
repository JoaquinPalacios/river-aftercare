import "dotenv/config";

import { GuideRevisionStatus, type PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { DemoToday } from "@/app/(aftercare)/components/demo-today";
import { PrintableGuide } from "@/app/(aftercare)/components/print-care-plan";
import { composeGuideDocument } from "@/lib/aftercare/compose-guide-document";
import {
  buildDemoTodayContent,
  resolveDemoRecoveryState,
} from "@/lib/aftercare/demo-recovery-state";
import { DEMO_RECOVERY_FIXTURE } from "@/lib/aftercare/demo-tenant";
import { getPublishedPracticeGuide } from "@/lib/aftercare/get-published-practice-guide";
import { resolvePracticeChrome } from "@/lib/aftercare/practice-chrome";
import { canonicalContentSignature } from "@/lib/canonical-templates/content";
import { createCanonicalTemplateDraft } from "@/lib/canonical-templates/create-canonical-template-draft";
import { createCanonicalTemplate } from "@/lib/canonical-templates/create-canonical-template";
import { publishCanonicalTemplateRevision } from "@/lib/canonical-templates/publish-canonical-template-revision";
import { saveCanonicalTemplateDraft } from "@/lib/canonical-templates/save-canonical-template-draft";
import { createPracticeGuideFromTemplate } from "@/lib/clinic-portal/create-practice-guide";
import { publishPracticeGuide } from "@/lib/clinic-portal/publish-practice-guide";
import { savePracticeGuideDraft } from "@/lib/clinic-portal/save-practice-guide-draft";
import { withTemporaryClinicCategory } from "@/tests/active-sample-slot";

const DEMO_CLINIC_ID = "clinic_demo_rivers";
const EXTRACTION_TEMPLATE_ID = "guide_tmpl_demo_extraction";
const EXTRACTION_REVISION_ID = "guide_rev_demo_extraction_v1";
const EXTRACTION_GUIDE_ID = "practice_guide_demo_rivers_extraction";
const EXTRACTION_PLACEMENT_ID = "mpl_practice_guide_demo_rivers_extraction";
const EXTRACTION_SNAPSHOT_ID = "practice_rev_demo_rivers_extraction_v1";
const OPERATOR_ID = "sdp_operator";
const SAMPLE_SLUG = "sdp-physio";

const V1_INTRO = "Synthetic physiotherapy introduction, revision 1.";
const V2_INTRO = "Synthetic physiotherapy introduction, revision 2.";
const V1_STAGE = "Keep the area supported during the first day.";
const V2_STAGE = "Synthetic revision 2 replaces the first-day stage.";
const WARNING_BODY = "Contact the practice if pain suddenly spreads.";
const EMERGENCY_BODY = "Seek urgent help for a sudden loss of strength.";
const CONTACT_BODY = "Use the practice phone if a movement is unclear.";

let prisma: PrismaClient | null = null;

function db(): PrismaClient {
  if (!prisma) {
    throw new Error("Prisma is not connected.");
  }
  return prisma;
}

async function connectOrSkip(ctx: { skip: () => void }): Promise<boolean> {
  try {
    const { getPrisma } = await import("@/lib/prisma");
    prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    ctx.skip();
    return false;
  }
}

function visibleSections(
  sections: Array<{
    key: string;
    kind: string;
    title: string;
    body: string;
    periodLabel: string | null;
    startDay?: number | null;
    endDay?: number | null;
  }>
) {
  return sections.map((section) => ({
    key: section.key,
    kind: section.kind,
    title: section.title,
    body: section.body,
    periodLabel: section.periodLabel,
    startDay: section.startDay ?? null,
    endDay: section.endDay ?? null,
  }));
}

const sampleSections = (introduction: string, stage: string) => [
  {
    key: "introduction",
    kind: "INTRODUCTION" as const,
    title: "About this plan",
    body: introduction,
    periodLabel: null,
    startDay: null,
    endDay: null,
  },
  {
    key: "first-day",
    kind: "RECOVERY_TIMELINE" as const,
    title: "First day",
    body: stage,
    periodLabel: "Today / first 24 hours",
    startDay: 1,
    endDay: 1,
  },
  {
    key: "what-is-normal",
    kind: "WHAT_IS_NORMAL" as const,
    title: "What's normal",
    body: "Mild soreness after the session can be expected.",
    periodLabel: null,
    startDay: null,
    endDay: null,
  },
  {
    key: "warning-signs",
    kind: "WARNING_SIGNS" as const,
    title: "Warning signs",
    body: WARNING_BODY,
    periodLabel: null,
    startDay: null,
    endDay: null,
  },
  {
    key: "contact-practice",
    kind: "CONTACT_PRACTICE" as const,
    title: "Contact the practice",
    body: CONTACT_BODY,
    periodLabel: null,
    startDay: null,
    endDay: null,
  },
  {
    key: "emergency",
    kind: "EMERGENCY" as const,
    title: "When this is urgent",
    body: EMERGENCY_BODY,
    periodLabel: null,
    startDay: null,
    endDay: null,
  },
];

async function cleanupSyntheticSample() {
  const guides = await db().practiceGuide.findMany({
    where: {
      OR: [
        { clinicId: DEMO_CLINIC_ID, publicSlug: SAMPLE_SLUG },
        { guideTemplate: { slug: SAMPLE_SLUG } },
      ],
    },
    select: { id: true },
  });
  const ids = guides.map((guide) => guide.id);
  if (ids.length > 0) {
    await db().practiceGuidePlacement.deleteMany({
      where: { practiceGuideId: { in: ids } },
    });
    await db().practiceGuide.deleteMany({ where: { id: { in: ids } } });
  }
  await db().guideTemplate.deleteMany({ where: { slug: SAMPLE_SLUG } });
  await db().user.deleteMany({ where: { id: OPERATOR_ID } });
}

describe("sample publication and the Riverside demo", () => {
  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await cleanupSyntheticSample();
    await prisma.$disconnect();
  });

  it("serves the seeded Riverside snapshot, not a live canonical read", async (ctx) => {
    if (!(await connectOrSkip(ctx))) {
      return;
    }

    const template = await db().guideTemplate.findUniqueOrThrow({
      where: { slug: "extraction" },
      include: {
        revisions: {
          orderBy: { version: "asc" },
          include: {
            sections: {
              orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
              include: {
                homeCareInstructions: { orderBy: { sortOrder: "asc" } },
              },
            },
          },
        },
      },
    });
    expect(template).toMatchObject({
      id: EXTRACTION_TEMPLATE_ID,
      slug: "extraction",
      title: "Tooth Extraction",
      isSample: true,
      isActive: true,
      serviceCategory: "DENTAL",
    });
    expect(
      template.revisions.some(
        (revision) => revision.status === GuideRevisionStatus.DRAFT
      )
    ).toBe(false);
    const canonical = template.revisions.find(
      (revision) => revision.id === EXTRACTION_REVISION_ID
    );
    expect(canonical?.status).toBe(GuideRevisionStatus.PUBLISHED);
    expect(canonical?.version).toBe(1);

    const guide = await db().practiceGuide.findUniqueOrThrow({
      where: { id: EXTRACTION_GUIDE_ID },
      include: {
        overrides: true,
        additions: { orderBy: { sortOrder: "asc" } },
      },
    });
    expect(guide).toMatchObject({
      clinicId: DEMO_CLINIC_ID,
      guideTemplateId: EXTRACTION_TEMPLATE_ID,
      pinnedRevisionId: EXTRACTION_REVISION_ID,
      publicSlug: "extraction",
      sourceGuideTemplateId: null,
      adaptedAt: null,
      copiedFromPracticeGuideId: null,
      status: "PUBLISHED",
    });

    const placement = await db().practiceGuidePlacement.findUniqueOrThrow({
      where: { id: EXTRACTION_PLACEMENT_ID },
    });
    expect(placement).toMatchObject({
      publicSlug: "extraction",
      isEnabled: true,
      publishedPracticeGuideRevisionId: EXTRACTION_SNAPSHOT_ID,
    });

    const document = await getPublishedPracticeGuide({
      clinicSlug: "demodental",
      publicSlug: "extraction",
    });
    expect(document?.revision.id).toBe(EXTRACTION_SNAPSHOT_ID);
    expect(document?.revision.id).not.toBe(guide.pinnedRevisionId);
    expect(document?.practiceGuide.publicSlug).toBe("extraction");

    const composed = composeGuideDocument({
      canonicalSections: (canonical?.sections ?? []).map((section) => ({
        key: section.key,
        kind: section.kind,
        title: section.title,
        body: section.body,
        periodLabel: section.periodLabel,
        startDay: section.startDay,
        endDay: section.endDay,
        sortOrder: section.sortOrder,
        homeCareInstructions: section.homeCareInstructions.map((item) => ({
          key: item.key,
          title: item.title,
          body: item.body,
          frequencyCount: item.frequencyCount,
          frequencyPeriod: item.frequencyPeriod,
          timingLabel: item.timingLabel,
          durationValue: item.durationValue,
          durationUnit: item.durationUnit,
          sortOrder: item.sortOrder,
        })),
      })),
      overrides: guide.overrides,
      additions: guide.additions,
    });
    expect(visibleSections(document?.sections ?? [])).toEqual(
      visibleSections(composed.sections)
    );
    expect(
      document?.sections.find((section) => section.key === "first-24-hours")
        ?.title
    ).toBe("The first day at Riverside Dental Demo");
    expect(
      canonical?.sections.find((section) => section.key === "first-24-hours")
        ?.title
    ).toBe("Protect the healing site");
    expect(
      document?.sections.some((section) => section.key === "weekend-contact")
    ).toBe(true);

    const recovery = resolveDemoRecoveryState(
      document?.sections ?? [],
      DEMO_RECOVERY_FIXTURE
    );
    expect(recovery.simulatedDay).toBe(1);
    expect(recovery.currentStage?.key).toBe("first-24-hours");
    expect(
      recovery.stages.find((stage) => stage.key === "immediate-care")?.status
    ).toBe("earlier");
    expect(recovery.simulatedStartDate).toBe("2026-09-10");
  });

  it("publishes canonical revision 2 without moving the demo, then an explicit clinic publish creates a new snapshot", async (ctx) => {
    if (!(await connectOrSkip(ctx))) {
      return;
    }

    const extractionBefore =
      await db().practiceGuidePlacement.findUniqueOrThrow({
        where: { id: EXTRACTION_PLACEMENT_ID },
      });
    const canonicalBefore = await db().guideTemplateRevision.findMany({
      where: { guideTemplateId: EXTRACTION_TEMPLATE_ID },
      orderBy: { version: "asc" },
      include: { sections: { orderBy: { sortOrder: "asc" } } },
    });

    await withTemporaryClinicCategory(
      DEMO_CLINIC_ID,
      "PHYSIOTHERAPY",
      async () => {
        await cleanupSyntheticSample();
        await db().user.create({
          data: {
            id: OPERATOR_ID,
            email: "sdp-operator@example.test",
            name: "Synthetic operator",
            platformRole: "OPERATOR",
          },
        });

        try {
          const created = await createCanonicalTemplate({
            actorUserId: OPERATOR_ID,
            title: "Synthetic physiotherapy sample",
            slug: SAMPLE_SLUG,
            serviceCategory: "PHYSIOTHERAPY",
            classification: "SAMPLE",
          });
          await saveCanonicalTemplateDraft({
            templateId: created.templateId,
            revisionId: created.revisionId,
            actorUserId: OPERATOR_ID,
            sections: sampleSections(V1_INTRO, V1_STAGE),
          });
          await publishCanonicalTemplateRevision({
            templateId: created.templateId,
            revisionId: created.revisionId,
            actorUserId: OPERATOR_ID,
            expectedVersion: 1,
          });

          const practice = await createPracticeGuideFromTemplate({
            clinicId: DEMO_CLINIC_ID,
            actorUserId: OPERATOR_ID,
            values: { templateId: created.templateId },
          });
          await publishPracticeGuide({
            clinicId: DEMO_CLINIC_ID,
            actorUserId: OPERATOR_ID,
            guideId: practice.id,
          });

          const adopted = await db().practiceGuide.findUniqueOrThrow({
            where: { id: practice.id },
            include: {
              placements: true,
              contentRevisions: {
                include: { sections: { orderBy: { sortOrder: "asc" } } },
              },
            },
          });
          expect(adopted.publicSlug).toBe(SAMPLE_SLUG);
          expect(adopted.pinnedRevisionId).toBe(created.revisionId);
          const firstSnapshot = adopted.contentRevisions.find(
            (revision) => revision.version === 1
          );
          expect(firstSnapshot?.status).toBe(GuideRevisionStatus.PUBLISHED);
          expect(firstSnapshot?.sections[0]?.body).toBe(V1_INTRO);
          expect(adopted.placements).toEqual([
            expect.objectContaining({
              publicSlug: SAMPLE_SLUG,
              isEnabled: true,
              publishedPracticeGuideRevisionId: firstSnapshot?.id,
            }),
          ]);

          const next = await createCanonicalTemplateDraft({
            templateId: created.templateId,
            actorUserId: OPERATOR_ID,
          });
          await saveCanonicalTemplateDraft({
            templateId: created.templateId,
            revisionId: next.revisionId,
            actorUserId: OPERATOR_ID,
            sections: sampleSections(V2_INTRO, V2_STAGE),
          });
          await publishCanonicalTemplateRevision({
            templateId: created.templateId,
            revisionId: next.revisionId,
            actorUserId: OPERATOR_ID,
            expectedVersion: 2,
          });

          const afterCanonicalPublish =
            await db().practiceGuide.findUniqueOrThrow({
              where: { id: practice.id },
              include: {
                placements: true,
                contentRevisions: {
                  include: { sections: { orderBy: { sortOrder: "asc" } } },
                },
              },
            });
          expect(afterCanonicalPublish.pinnedRevisionId).toBe(
            created.revisionId
          );
          expect(
            afterCanonicalPublish.placements[0]
              ?.publishedPracticeGuideRevisionId
          ).toBe(firstSnapshot?.id);
          expect(
            afterCanonicalPublish.contentRevisions.find(
              (revision) => revision.id === firstSnapshot?.id
            )?.sections[0]?.body
          ).toBe(V1_INTRO);
          const stillV1 = await getPublishedPracticeGuide({
            clinicSlug: "demodental",
            publicSlug: SAMPLE_SLUG,
          });
          expect(stillV1?.revision.id).toBe(firstSnapshot?.id);
          expect(stillV1?.sections[0]?.body).toBe(V1_INTRO);

          const canonicalV1 = await db().guideTemplateSection.findMany({
            where: { revisionId: created.revisionId },
            orderBy: { sortOrder: "asc" },
          });
          expect(canonicalV1[0]?.body).toBe(V1_INTRO);
          expect(
            canonicalContentSignature(
              canonicalV1.map((section) => ({
                ...section,
                homeCareInstructions: [],
              }))
            )
          ).toContain(V1_INTRO);

          await savePracticeGuideDraft({
            clinicId: DEMO_CLINIC_ID,
            actorUserId: OPERATOR_ID,
            values: {
              guideId: practice.id,
              title: "Synthetic physiotherapy sample",
              publicSlug: SAMPLE_SLUG,
              introduction: null,
              sections: sampleSections(V2_INTRO, V2_STAGE),
            },
          });
          await publishPracticeGuide({
            clinicId: DEMO_CLINIC_ID,
            actorUserId: OPERATOR_ID,
            guideId: practice.id,
          });

          const refreshed = await db().practiceGuide.findUniqueOrThrow({
            where: { id: practice.id },
            include: {
              placements: true,
              contentRevisions: {
                orderBy: { version: "asc" },
                include: { sections: { orderBy: { sortOrder: "asc" } } },
              },
            },
          });
          const historical = refreshed.contentRevisions.find(
            (revision) => revision.id === firstSnapshot?.id
          );
          const latest = refreshed.contentRevisions.find(
            (revision) => revision.version === 2
          );
          expect(historical?.sections[0]?.body).toBe(V1_INTRO);
          expect(latest?.status).toBe(GuideRevisionStatus.PUBLISHED);
          expect(latest?.sections[0]?.body).toBe(V2_INTRO);
          expect(refreshed.publicSlug).toBe(SAMPLE_SLUG);
          expect(refreshed.placements[0]?.publicSlug).toBe(SAMPLE_SLUG);
          expect(
            refreshed.placements[0]?.publishedPracticeGuideRevisionId
          ).toBe(latest?.id);
          expect(refreshed.pinnedRevisionId).toBe(created.revisionId);

          const published = await getPublishedPracticeGuide({
            clinicSlug: "demodental",
            publicSlug: SAMPLE_SLUG,
          });
          expect(published?.revision.id).toBe(latest?.id);
          expect(published?.practiceGuide.publicSlug).toBe(SAMPLE_SLUG);
          expect(published?.sections[0]?.body).toBe(V2_INTRO);

          const recovery = resolveDemoRecoveryState(
            published?.sections ?? [],
            DEMO_RECOVERY_FIXTURE
          );
          const today = buildDemoTodayContent(
            published?.sections ?? [],
            recovery
          );
          const chrome = resolvePracticeChrome({
            slug: published?.clinic.slug ?? "demodental",
            name: published?.clinic.name ?? "Rivers Care Demo Clinic",
            profile: published?.profile ?? null,
          });
          const todayHtml = renderToStaticMarkup(
            <DemoToday
              recovery={recovery}
              today={today}
              clinicName={chrome.displayName}
              phoneHref={chrome.phoneHref}
              phoneDisplay={chrome.phoneDisplay}
            />
          );
          const printHtml = renderToStaticMarkup(
            <PrintableGuide
              chrome={chrome}
              procedureTitle={published?.title ?? ""}
              instructionsLabel={chrome.instructionsLabel}
              sections={published?.sections ?? []}
              showDemoSample
              guideHref={`/${SAMPLE_SLUG}`}
            />
          );

          expect(recovery.currentStage?.body).toBe(V2_STAGE);
          expect(todayHtml).toContain(V2_STAGE);
          expect(todayHtml).toContain(WARNING_BODY);
          expect(todayHtml).toContain(EMERGENCY_BODY);
          expect(todayHtml).not.toContain(V2_INTRO);
          expect(todayHtml).not.toContain(CONTACT_BODY);
          expect(printHtml).toContain(V2_INTRO);
          expect(printHtml).toContain(V2_STAGE);
          expect(printHtml).toContain(WARNING_BODY);
          expect(printHtml).toContain(EMERGENCY_BODY);
          expect(printHtml).toContain(CONTACT_BODY);
          expect(printHtml).toContain(`href="/${SAMPLE_SLUG}"`);
          expect(chrome.emergencyInstructions).toContain("emergency services");
        } finally {
          await cleanupSyntheticSample();
        }
      }
    );

    const extractionAfter = await db().practiceGuidePlacement.findUniqueOrThrow(
      {
        where: { id: EXTRACTION_PLACEMENT_ID },
      }
    );
    expect(extractionAfter).toEqual(extractionBefore);
    const canonicalAfter = await db().guideTemplateRevision.findMany({
      where: { guideTemplateId: EXTRACTION_TEMPLATE_ID },
      orderBy: { version: "asc" },
      include: { sections: { orderBy: { sortOrder: "asc" } } },
    });
    expect(canonicalAfter.map((revision) => revision.id)).toEqual(
      canonicalBefore.map((revision) => revision.id)
    );
    expect(
      canonicalAfter.map((revision) =>
        revision.sections.map((section) => section.body)
      )
    ).toEqual(
      canonicalBefore.map((revision) =>
        revision.sections.map((section) => section.body)
      )
    );
  });
});
