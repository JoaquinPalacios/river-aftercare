import "dotenv/config";

import {
  BillingStatus,
  EntitlementStatus,
  GuideRevisionStatus,
  GuideSectionKind,
  PracticeGuideStatus,
  PracticeSectionProvenance,
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adaptPracticeGuideFromTemplate } from "@/lib/clinic-portal/adapt-practice-guide";
import {
  createCustomPracticeGuide,
  createPracticeGuideFromTemplate,
} from "@/lib/clinic-portal/create-practice-guide";
import { deletePracticeGuide } from "@/lib/clinic-portal/delete-practice-guide-draft";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { savePracticeGuideDraft } from "@/lib/clinic-portal/save-practice-guide-draft";
import { loadEssentialDowngradeReadiness } from "@/lib/entitlements/downgrade-readiness";
import {
  countAdaptedTemplateGuides,
  countOriginalCustomGuides,
  isAdaptedTemplateGuide,
  isOriginalCustomGuide,
  isPinnedRiverTemplate,
} from "@/lib/entitlements/guide-usage";
import { PLAN_ENTITLEMENT_POLICIES } from "@/lib/entitlements/plan-policy";
import { getPrisma } from "@/lib/prisma";

const prisma = getPrisma();
const PREFIX = "test_ent_guide_";
const CLINIC_ID = `${PREFIX}clinic`;
const USER_ID = `${PREFIX}admin`;
const TEMPLATE_ID = `${PREFIX}template`;
const TEMPLATE_B_ID = `${PREFIX}template_b`;
const REVISION_ID = `${PREFIX}revision`;
const REVISION_B_ID = `${PREFIX}revision_b`;
const essentialCustom = PLAN_ENTITLEMENT_POLICIES.ESSENTIAL.base.customGuides;
const essentialAdapted =
  PLAN_ENTITLEMENT_POLICIES.ESSENTIAL.base.templateAdaptations;
const practiceCustom = PLAN_ENTITLEMENT_POLICIES.PRACTICE.base.customGuides;
const practiceAdapted =
  PLAN_ENTITLEMENT_POLICIES.PRACTICE.base.templateAdaptations;
const practiceCombined =
  PLAN_ENTITLEMENT_POLICIES.PRACTICE.base.combinedClinicOwnedGuides;

async function cleanup() {
  await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
  await prisma.guideTemplateRevision.deleteMany({
    where: { id: { startsWith: PREFIX } },
  });
  await prisma.guideTemplate.deleteMany({
    where: { id: { startsWith: PREFIX } },
  });
  await prisma.clinicEntitlement.deleteMany({ where: { clinicId: CLINIC_ID } });
  await prisma.clinicMembership.deleteMany({ where: { clinicId: CLINIC_ID } });
  await prisma.clinic.deleteMany({ where: { id: CLINIC_ID } });
  await prisma.user.deleteMany({ where: { id: USER_ID } });
}

async function setPlan(plan: "ESSENTIAL" | "PRACTICE" | "GROUP" | null) {
  if (plan === null) {
    await prisma.clinicEntitlement.deleteMany({
      where: { clinicId: CLINIC_ID },
    });
    return;
  }
  await prisma.clinicEntitlement.upsert({
    where: { clinicId: CLINIC_ID },
    create: {
      clinicId: CLINIC_ID,
      commercialPlan: plan,
      billingStatus: BillingStatus.ACTIVE,
      entitlementStatus: EntitlementStatus.ACTIVE,
    },
    update: { commercialPlan: plan },
  });
}

async function setExtras(input: {
  team?: number;
  custom?: number;
  adapted?: number;
}) {
  await prisma.clinicEntitlement.update({
    where: { clinicId: CLINIC_ID },
    data: {
      extraTeamMemberAllowance: input.team ?? 0,
      extraCustomGuideAllowance: input.custom ?? 0,
      extraTemplateAdaptationAllowance: input.adapted ?? 0,
    },
  });
}

async function seedCustomGuides(count: number) {
  if (count === 0) {
    return;
  }
  await prisma.practiceGuide.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      clinicId: CLINIC_ID,
      title: `Seeded custom ${index}`,
      publicSlug: `seeded-custom-${index}`,
      status: PracticeGuideStatus.DRAFT,
    })),
  });
}

async function seedAdaptedGuides(
  count: number,
  status: PracticeGuideStatus = PracticeGuideStatus.DRAFT
) {
  if (count === 0) {
    return;
  }
  await prisma.practiceGuide.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      clinicId: CLINIC_ID,
      title: `Seeded adapted ${index}`,
      publicSlug: `seeded-adapted-${status.toLowerCase()}-${index}`,
      status,
      guideTemplateId: null,
      sourceGuideTemplateId: TEMPLATE_ID,
      adaptedAt: new Date("2026-09-02T00:00:00.000Z"),
    })),
  });
}

function sectionPayload(
  sections: Array<{
    key: string;
    kind: GuideSectionKind;
    title: string;
    periodLabel: string | null;
    startDay: number | null;
    endDay: number | null;
  }>,
  body: string
) {
  return sections.map((section) => ({
    key: section.key,
    kind: section.kind,
    title: section.title,
    body,
    periodLabel: section.periodLabel,
    startDay: section.startDay,
    endDay: section.endDay,
  }));
}

describe("guide allowance pools", () => {
  beforeAll(async () => {
    await cleanup();
    await prisma.user.create({
      data: {
        id: USER_ID,
        email: `${PREFIX}admin@example.test`,
        name: "Guide Admin",
      },
    });
    await prisma.clinic.create({
      data: {
        id: CLINIC_ID,
        name: "Entitlement Guide Clinic",
        slug: "ent-guide-clinic",
        memberships: {
          create: { userId: USER_ID, role: "ADMIN" },
        },
      },
    });
    await prisma.guideTemplate.create({
      data: {
        id: TEMPLATE_ID,
        specialty: "DENTAL",
        slug: "ent-extract",
        title: "Tooth Extraction",
        revisions: {
          create: {
            id: REVISION_ID,
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            publishedAt: new Date("2026-09-01T00:00:00.000Z"),
            reviewedAt: new Date("2026-09-01T00:00:00.000Z"),
            reviewedBy: "Guide entitlement reviewer",
            sections: {
              create: {
                key: "introduction",
                kind: "INTRODUCTION",
                title: "After your extraction",
                body: "Canonical introduction.",
                sortOrder: 1,
              },
            },
          },
        },
      },
    });
    await prisma.guideTemplate.create({
      data: {
        id: TEMPLATE_B_ID,
        specialty: "DENTAL",
        slug: "ent-implant",
        title: "Dental Implant",
        revisions: {
          create: {
            id: REVISION_B_ID,
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            publishedAt: new Date("2026-09-01T00:00:00.000Z"),
            reviewedAt: new Date("2026-09-01T00:00:00.000Z"),
            reviewedBy: "Guide entitlement reviewer",
            sections: {
              create: {
                key: "introduction",
                kind: "INTRODUCTION",
                title: "After your implant",
                body: "Canonical implant introduction.",
                sortOrder: 1,
              },
            },
          },
        },
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("classifies pinned, original custom, and adapted guides into separate pools", () => {
    expect(isPinnedRiverTemplate({ guideTemplateId: TEMPLATE_ID })).toBe(true);
    expect(
      isOriginalCustomGuide({
        guideTemplateId: null,
        sourceGuideTemplateId: null,
      })
    ).toBe(true);
    expect(
      isOriginalCustomGuide({
        guideTemplateId: null,
        sourceGuideTemplateId: TEMPLATE_ID,
        adaptedAt: new Date(),
      })
    ).toBe(false);
    expect(
      isAdaptedTemplateGuide({
        guideTemplateId: null,
        sourceGuideTemplateId: TEMPLATE_ID,
        adaptedAt: new Date(),
      })
    ).toBe(true);
    expect(
      isAdaptedTemplateGuide({
        guideTemplateId: null,
        sourceGuideTemplateId: null,
        adaptedAt: null,
      })
    ).toBe(false);
  });

  it("counts original custom guides without counting pinned or adapted copies", async () => {
    await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
    await setPlan("ESSENTIAL");
    await setExtras({});
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(0);
    expect(await countAdaptedTemplateGuides(prisma, CLINIC_ID)).toBe(0);

    const supplied = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { templateId: TEMPLATE_ID },
    });
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(0);
    expect(await countAdaptedTemplateGuides(prisma, CLINIC_ID)).toBe(0);
    const pinned = await prisma.practiceGuide.findUniqueOrThrow({
      where: { id: supplied.id },
    });
    expect(pinned.guideTemplateId).toBe(TEMPLATE_ID);
    expect(pinned.sourceGuideTemplateId).toBeNull();

    const custom = await createCustomPracticeGuide({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { title: "Custom one", publicSlug: "custom-one" },
    });
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(1);

    await prisma.practiceGuide.update({
      where: { id: custom.id },
      data: { status: PracticeGuideStatus.PUBLISHED, isEnabled: true },
    });
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(1);
    await prisma.practiceGuide.update({
      where: { id: custom.id },
      data: { status: PracticeGuideStatus.UNPUBLISHED, isEnabled: false },
    });
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(1);

    await savePracticeGuideDraft({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: {
        guideId: custom.id,
        title: "Custom one edited",
        publicSlug: "custom-one",
        introduction: "Still editable.",
        sections: [
          {
            key: "introduction",
            kind: "INTRODUCTION",
            title: "About this guide",
            body: "Edited while inside the allowance.",
            periodLabel: null,
            startDay: null,
            endDay: null,
          },
        ],
      },
    });
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(1);

    await deletePracticeGuide({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      guideId: custom.id,
    });
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(0);
  });

  it("lets Essential hold 2 original guides and 2 adapted copies, and blocks a third of either pool", async () => {
    await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
    await setPlan("ESSENTIAL");
    await setExtras({});

    await createCustomPracticeGuide({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { title: "Custom one", publicSlug: "custom-one" },
    });
    await createCustomPracticeGuide({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { title: "Custom two", publicSlug: "custom-two" },
    });
    await expect(
      createCustomPracticeGuide({
        clinicId: CLINIC_ID,
        actorUserId: USER_ID,
        values: { title: "Custom three", publicSlug: "custom-three" },
      })
    ).rejects.toMatchObject({ code: "custom_guide_limit" });

    const first = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { templateId: TEMPLATE_ID },
    });
    const draft = await prisma.practiceGuideRevision.findFirstOrThrow({
      where: { practiceGuideId: first.id, version: 0 },
      include: { sections: true },
    });
    await expect(
      savePracticeGuideDraft({
        clinicId: CLINIC_ID,
        actorUserId: USER_ID,
        values: {
          guideId: first.id,
          title: "Clinic extraction",
          publicSlug: "ent-extract",
          introduction: "",
          sections: sectionPayload(draft.sections, "Clinic-specific rewrite."),
        },
      })
    ).rejects.toMatchObject({ code: "template_adaptation_required" });

    const canonicalBefore = await prisma.guideTemplateSection.findFirstOrThrow({
      where: { revisionId: REVISION_ID },
    });
    const adapted = await adaptPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      guideId: first.id,
    });
    const adaptedRow = await prisma.practiceGuide.findUniqueOrThrow({
      where: { id: adapted.id },
    });
    expect(adaptedRow.guideTemplateId).toBeNull();
    expect(adaptedRow.pinnedRevisionId).toBeNull();
    expect(adaptedRow.sourceGuideTemplateId).toBe(TEMPLATE_ID);
    expect(adaptedRow.adaptedAt).toBeTruthy();
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(
      essentialCustom
    );
    expect(await countAdaptedTemplateGuides(prisma, CLINIC_ID)).toBe(1);
    const canonicalAfter = await prisma.guideTemplate.findUniqueOrThrow({
      where: { id: TEMPLATE_ID },
    });
    const canonicalSection = await prisma.guideTemplateSection.findFirstOrThrow(
      {
        where: { revisionId: REVISION_ID },
      }
    );
    expect(canonicalAfter.title).toBe("Tooth Extraction");
    expect(canonicalSection.body).toBe(canonicalBefore.body);
    expect(
      (
        await prisma.practiceGuideRevisionSection.findFirstOrThrow({
          where: { revisionId: draft.id },
        })
      ).provenance
    ).toBe(PracticeSectionProvenance.CANONICAL);

    await savePracticeGuideDraft({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: {
        guideId: adapted.id,
        title: "Clinic extraction",
        publicSlug: "clinic-extraction",
        introduction: "Local introduction.",
        sections: [
          {
            key: "introduction",
            kind: "INTRODUCTION",
            title: "After your extraction",
            body: "Clinic-specific rewrite.",
            periodLabel: null,
            startDay: null,
            endDay: null,
          },
        ],
      },
    });
    const afterEdit = await prisma.practiceGuide.findUniqueOrThrow({
      where: { id: adapted.id },
    });
    expect(afterEdit.sourceGuideTemplateId).toBe(TEMPLATE_ID);
    expect(await countAdaptedTemplateGuides(prisma, CLINIC_ID)).toBe(1);

    const second = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { templateId: TEMPLATE_B_ID },
    });
    await adaptPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      guideId: second.id,
    });
    expect(await countAdaptedTemplateGuides(prisma, CLINIC_ID)).toBe(
      essentialAdapted
    );

    await prisma.practiceGuide.deleteMany({
      where: { clinicId: CLINIC_ID, guideTemplateId: { not: null } },
    });
    const blockedPin = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { templateId: TEMPLATE_ID },
    });
    await expect(
      adaptPracticeGuideFromTemplate({
        clinicId: CLINIC_ID,
        guideId: blockedPin.id,
      })
    ).rejects.toMatchObject({ code: "adapted_template_limit" });
    expect(await countAdaptedTemplateGuides(prisma, CLINIC_ID)).toBe(
      essentialAdapted
    );
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(
      essentialCustom
    );
  });

  it("counts draft, published, and unpublished adapted copies, and frees a slot on delete", async () => {
    await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
    await setPlan("ESSENTIAL");
    await setExtras({});
    await seedAdaptedGuides(1, PracticeGuideStatus.DRAFT);
    expect(await countAdaptedTemplateGuides(prisma, CLINIC_ID)).toBe(1);
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(0);
    await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
    await seedAdaptedGuides(1, PracticeGuideStatus.PUBLISHED);
    expect(await countAdaptedTemplateGuides(prisma, CLINIC_ID)).toBe(1);
    await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
    await seedAdaptedGuides(1, PracticeGuideStatus.UNPUBLISHED);
    expect(await countAdaptedTemplateGuides(prisma, CLINIC_ID)).toBe(1);
    const row = await prisma.practiceGuide.findFirstOrThrow({
      where: { clinicId: CLINIC_ID },
    });
    await prisma.practiceGuide.delete({ where: { id: row.id } });
    expect(await countAdaptedTemplateGuides(prisma, CLINIC_ID)).toBe(0);
  });

  it("lets Essential extras raise one category and the combined ceiling", async () => {
    await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
    await setPlan("ESSENTIAL");
    await setExtras({ custom: 1 });
    await seedCustomGuides(essentialCustom);
    await seedAdaptedGuides(essentialAdapted);
    await createCustomPracticeGuide({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { title: "Extra custom", publicSlug: "extra-custom" },
    });
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(3);
    expect(await countAdaptedTemplateGuides(prisma, CLINIC_ID)).toBe(2);
    await expect(
      createCustomPracticeGuide({
        clinicId: CLINIC_ID,
        actorUserId: USER_ID,
        values: { title: "Fourth custom", publicSlug: "fourth-custom" },
      })
    ).rejects.toMatchObject({ code: "custom_guide_limit" });

    await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
    await setExtras({ adapted: 1 });
    await seedCustomGuides(essentialCustom);
    await seedAdaptedGuides(essentialAdapted);
    const adaptedPin = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { templateId: TEMPLATE_ID },
    });
    await adaptPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      guideId: adaptedPin.id,
    });
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(2);
    expect(await countAdaptedTemplateGuides(prisma, CLINIC_ID)).toBe(3);

    await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
    await setExtras({ custom: 1, adapted: 1 });
    await seedCustomGuides(essentialCustom);
    await seedAdaptedGuides(essentialAdapted);
    await createCustomPracticeGuide({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { title: "Both custom", publicSlug: "both-custom" },
    });
    const bothPin = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { templateId: TEMPLATE_B_ID },
    });
    await adaptPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      guideId: bothPin.id,
    });
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(3);
    expect(await countAdaptedTemplateGuides(prisma, CLINIC_ID)).toBe(3);
  });

  it("lets Practice distribute 40 clinic-owned guides across the two category caps", async () => {
    expect(practiceCustom).toBe(30);
    expect(practiceAdapted).toBe(30);
    expect(practiceCombined).toBe(40);

    async function prepare(
      custom: number,
      adapted: number,
      extras?: { custom?: number; adapted?: number }
    ) {
      await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
      await setPlan("PRACTICE");
      await setExtras(extras ?? {});
      await seedCustomGuides(custom);
      await seedAdaptedGuides(adapted);
    }

    async function nextCustom(slug: string) {
      return createCustomPracticeGuide({
        clinicId: CLINIC_ID,
        actorUserId: USER_ID,
        values: { title: slug, publicSlug: slug },
      });
    }

    async function nextAdapted() {
      const pin = await createPracticeGuideFromTemplate({
        clinicId: CLINIC_ID,
        actorUserId: USER_ID,
        values: { templateId: TEMPLATE_ID },
      });
      return adaptPracticeGuideFromTemplate({
        clinicId: CLINIC_ID,
        guideId: pin.id,
      });
    }

    await prepare(29, 10);
    await nextCustom("mix-30-10");
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(30);
    expect(await countAdaptedTemplateGuides(prisma, CLINIC_ID)).toBe(10);

    await prepare(20, 19);
    await nextAdapted();
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(20);
    expect(await countAdaptedTemplateGuides(prisma, CLINIC_ID)).toBe(20);

    await prepare(9, 30);
    await nextCustom("mix-10-30");
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(10);
    expect(await countAdaptedTemplateGuides(prisma, CLINIC_ID)).toBe(30);

    await prepare(30, 10);
    await expect(nextAdapted()).rejects.toMatchObject({
      code: "combined_guide_limit",
    });

    await prepare(10, 30);
    await expect(nextCustom("mix-11-30")).rejects.toMatchObject({
      code: "combined_guide_limit",
    });

    await prepare(30, 0);
    await expect(nextCustom("mix-31-0")).rejects.toMatchObject({
      code: "custom_guide_limit",
    });

    await prepare(0, 30);
    await expect(nextAdapted()).rejects.toMatchObject({
      code: "adapted_template_limit",
    });

    await prepare(25, 14);
    await nextAdapted();
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(25);
    expect(await countAdaptedTemplateGuides(prisma, CLINIC_ID)).toBe(15);

    await prepare(25, 15);
    await expect(nextAdapted()).rejects.toMatchObject({
      code: "combined_guide_limit",
    });
  });

  it("lets Practice guide extras raise the category and the combined ceiling", async () => {
    async function prepare(
      custom: number,
      adapted: number,
      extras: { custom?: number; adapted?: number }
    ) {
      await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
      await setPlan("PRACTICE");
      await setExtras(extras);
      await seedCustomGuides(custom);
      await seedAdaptedGuides(adapted);
    }

    await prepare(30, 10, { custom: 1 });
    await createCustomPracticeGuide({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { title: "Extra custom", publicSlug: "practice-extra-custom" },
    });
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(31);
    expect(await countAdaptedTemplateGuides(prisma, CLINIC_ID)).toBe(10);

    await prepare(30, 10, { adapted: 1 });
    const adaptedPin = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { templateId: TEMPLATE_ID },
    });
    await adaptPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      guideId: adaptedPin.id,
    });
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(30);
    expect(await countAdaptedTemplateGuides(prisma, CLINIC_ID)).toBe(11);

    await prepare(30, 10, { custom: 1, adapted: 1 });
    await createCustomPracticeGuide({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { title: "Both custom", publicSlug: "practice-both-custom" },
    });
    const bothPin = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { templateId: TEMPLATE_B_ID },
    });
    await adaptPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      guideId: bothPin.id,
    });
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(31);
    expect(await countAdaptedTemplateGuides(prisma, CLINIC_ID)).toBe(11);
    const entitlement = await prisma.clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: CLINIC_ID },
    });
    expect(entitlement.commercialPlan).toBe("PRACTICE");
    expect(entitlement.stripePriceId).toBeNull();
  });

  it("does not block an adapted-template place because the custom pool is over limit", async () => {
    await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
    await setPlan("ESSENTIAL");
    await setExtras({});
    await seedCustomGuides(essentialCustom + 1);
    const pin = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { templateId: TEMPLATE_ID },
    });
    await adaptPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      guideId: pin.id,
    });
    expect(await countAdaptedTemplateGuides(prisma, CLINIC_ID)).toBe(1);
    await expect(
      createCustomPracticeGuide({
        clinicId: CLINIC_ID,
        actorUserId: USER_ID,
        values: { title: "Still blocked", publicSlug: "still-blocked" },
      })
    ).rejects.toMatchObject({ code: "custom_guide_limit" });
  });

  it("does not let two creates or two forks take the last place in the same pool", async () => {
    await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
    await setPlan("ESSENTIAL");
    await setExtras({});
    await seedCustomGuides(essentialCustom - 1);
    const creates = await Promise.allSettled([
      createCustomPracticeGuide({
        clinicId: CLINIC_ID,
        actorUserId: USER_ID,
        values: { title: "Race A", publicSlug: "race-a" },
      }),
      createCustomPracticeGuide({
        clinicId: CLINIC_ID,
        actorUserId: USER_ID,
        values: { title: "Race B", publicSlug: "race-b" },
      }),
    ]);
    expect(
      creates.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(
      essentialCustom
    );

    await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
    await seedAdaptedGuides(essentialAdapted - 1);
    const first = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { templateId: TEMPLATE_ID },
    });
    const second = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { templateId: TEMPLATE_B_ID },
    });
    const forks = await Promise.allSettled([
      adaptPracticeGuideFromTemplate({
        clinicId: CLINIC_ID,
        guideId: first.id,
      }),
      adaptPracticeGuideFromTemplate({
        clinicId: CLINIC_ID,
        guideId: second.id,
      }),
    ]);
    expect(
      forks.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(await countAdaptedTemplateGuides(prisma, CLINIC_ID)).toBe(
      essentialAdapted
    );
  });

  it("lets only one of a custom create and a template adaptation take the last combined place", async () => {
    await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
    await setPlan("PRACTICE");
    await setExtras({});
    await seedCustomGuides(20);
    await seedAdaptedGuides(19);
    const pin = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { templateId: TEMPLATE_ID },
    });
    expect(
      (await countOriginalCustomGuides(prisma, CLINIC_ID)) +
        (await countAdaptedTemplateGuides(prisma, CLINIC_ID))
    ).toBe(practiceCombined - 1);
    const raced = await Promise.allSettled([
      createCustomPracticeGuide({
        clinicId: CLINIC_ID,
        actorUserId: USER_ID,
        values: { title: "Last combined", publicSlug: "last-combined" },
      }),
      adaptPracticeGuideFromTemplate({
        clinicId: CLINIC_ID,
        guideId: pin.id,
      }),
    ]);
    expect(
      raced.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(
      (await countOriginalCustomGuides(prisma, CLINIC_ID)) +
        (await countAdaptedTemplateGuides(prisma, CLINIC_ID))
    ).toBe(practiceCombined);
  });

  it("does not impose the fixed caps on legacy or Group clinics, and does not fork them", async () => {
    await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
    await setPlan(null);
    await seedCustomGuides(essentialCustom);
    await createCustomPracticeGuide({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { title: "Legacy extra", publicSlug: "legacy-extra" },
    });
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(
      essentialCustom + 1
    );
    const legacyPin = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { templateId: TEMPLATE_ID },
    });
    await expect(
      adaptPracticeGuideFromTemplate({
        clinicId: CLINIC_ID,
        guideId: legacyPin.id,
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);

    await setPlan("GROUP");
    await createCustomPracticeGuide({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { title: "Group extra", publicSlug: "group-extra" },
    });
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(
      essentialCustom + 2
    );
  });

  it("keeps an above-limit clinic editable and reports downgrade conflicts with extras", async () => {
    await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
    await setPlan("ESSENTIAL");
    await setExtras({});
    await seedCustomGuides(essentialCustom + 1);
    const existing = await prisma.practiceGuide.findFirstOrThrow({
      where: { clinicId: CLINIC_ID, sourceGuideTemplateId: null },
    });
    await savePracticeGuideDraft({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: {
        guideId: existing.id,
        title: existing.title,
        publicSlug: existing.publicSlug,
        introduction: "Historical guide stays editable.",
        sections: [
          {
            key: "introduction",
            kind: "INTRODUCTION",
            title: "About this guide",
            body: "No automatic cleanup.",
            periodLabel: null,
            startDay: null,
            endDay: null,
          },
        ],
      },
    });
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(
      essentialCustom + 1
    );

    await setPlan("PRACTICE");
    await setExtras({
      team: 1,
      custom: 2,
      adapted: 3,
    });
    const readiness = await loadEssentialDowngradeReadiness(CLINIC_ID);
    expect(readiness.guides.limit).toBe(essentialCustom + 2);
    expect(readiness.adaptedTemplates.limit).toBe(essentialAdapted + 3);
    expect(readiness.team.limit).toBe(
      PLAN_ENTITLEMENT_POLICIES.ESSENTIAL.base.teamMembers + 1
    );
    expect(readiness.combinedGuides.limit).toBe(
      PLAN_ENTITLEMENT_POLICIES.ESSENTIAL.base.combinedClinicOwnedGuides + 2 + 3
    );
    expect(readiness.conflicts).not.toContain("CUSTOM_GUIDES");
    expect(readiness.conflicts).not.toContain("COMBINED_GUIDES");
  });
});
