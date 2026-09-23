import "dotenv/config";

import {
  BillingStatus,
  EntitlementStatus,
  GuideRevisionStatus,
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
import { countCustomGuides } from "@/lib/entitlements/guide-usage";
import { ENTITLEMENT_CODES } from "@/lib/entitlements/messages";
import { PLAN_ENTITLEMENT_POLICIES } from "@/lib/entitlements/plan-policy";
import { loadEssentialDowngradeReadiness } from "@/lib/entitlements/downgrade-readiness";
import { getPrisma } from "@/lib/prisma";

const prisma = getPrisma();
const PREFIX = "test_ent_guide_";
const CLINIC_ID = `${PREFIX}clinic`;
const USER_ID = `${PREFIX}admin`;
const TEMPLATE_ID = `${PREFIX}template`;
const REVISION_ID = `${PREFIX}revision`;
const essentialGuides = PLAN_ENTITLEMENT_POLICIES.ESSENTIAL.customGuideLimit;
const practiceGuides = PLAN_ENTITLEMENT_POLICIES.PRACTICE.customGuideLimit;

async function cleanup() {
  await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
  await prisma.guideTemplateRevision.deleteMany({
    where: { id: REVISION_ID },
  });
  await prisma.guideTemplate.deleteMany({ where: { id: TEMPLATE_ID } });
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

async function seedBlankGuides(count: number) {
  if (count === 0) {
    return;
  }
  await prisma.practiceGuide.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      clinicId: CLINIC_ID,
      title: `Seeded ${index}`,
      publicSlug: `seeded-${index}`,
      status: PracticeGuideStatus.DRAFT,
    })),
  });
}

describe("custom guide allowance", () => {
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
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("counts custom guides and not canonical templates or as-supplied pins", async () => {
    await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
    await setPlan("ESSENTIAL");
    expect(await countCustomGuides(prisma, CLINIC_ID)).toBe(0);

    const supplied = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { templateId: TEMPLATE_ID },
    });
    expect(await countCustomGuides(prisma, CLINIC_ID)).toBe(0);
    const pinned = await prisma.practiceGuide.findUniqueOrThrow({
      where: { id: supplied.id },
    });
    expect(pinned.guideTemplateId).toBe(TEMPLATE_ID);

    const custom = await createCustomPracticeGuide({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { title: "Custom one", publicSlug: "custom-one" },
    });
    expect(await countCustomGuides(prisma, CLINIC_ID)).toBe(1);

    await prisma.practiceGuide.update({
      where: { id: custom.id },
      data: {
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
      },
    });
    expect(await countCustomGuides(prisma, CLINIC_ID)).toBe(1);
    await prisma.practiceGuide.update({
      where: { id: custom.id },
      data: {
        status: PracticeGuideStatus.UNPUBLISHED,
        isEnabled: false,
      },
    });
    expect(await countCustomGuides(prisma, CLINIC_ID)).toBe(1);

    await savePracticeGuideDraft({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: {
        guideId: custom.id,
        title: "Custom one edited",
        publicSlug: "custom-one",
        introduction: "Still editable at the allowance.",
        sections: [
          {
            key: "introduction",
            kind: "INTRODUCTION",
            title: "About this guide",
            body: "Edited while the clinic is inside its allowance.",
            periodLabel: null,
            startDay: null,
            endDay: null,
          },
        ],
      },
    });

    const second = await createCustomPracticeGuide({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { title: "Custom two", publicSlug: "custom-two" },
    });
    expect(await countCustomGuides(prisma, CLINIC_ID)).toBe(essentialGuides);

    await expect(
      createCustomPracticeGuide({
        clinicId: CLINIC_ID,
        actorUserId: USER_ID,
        values: { title: "Custom three", publicSlug: "custom-three" },
      })
    ).rejects.toMatchObject({ code: "custom_guide_limit" });

    await savePracticeGuideDraft({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: {
        guideId: second.id,
        title: "Custom two still editable",
        publicSlug: "custom-two",
        introduction: "",
        sections: [
          {
            key: "introduction",
            kind: "INTRODUCTION",
            title: "About this guide",
            body: "Editing at the limit stays available.",
            periodLabel: null,
            startDay: null,
            endDay: null,
          },
        ],
      },
    });

    await deletePracticeGuide({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      guideId: second.id,
    });
    expect(await countCustomGuides(prisma, CLINIC_ID)).toBe(
      essentialGuides - 1
    );
    await createCustomPracticeGuide({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { title: "Custom replacement", publicSlug: "custom-replacement" },
    });
    expect(await countCustomGuides(prisma, CLINIC_ID)).toBe(essentialGuides);
  });

  it("rejects Essential template adaptation and counts a Practice adaptation", async () => {
    await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
    await setPlan("ESSENTIAL");
    const supplied = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { templateId: TEMPLATE_ID },
    });
    const draft = await prisma.practiceGuideRevision.findFirstOrThrow({
      where: { practiceGuideId: supplied.id, version: 0 },
      include: { sections: true },
    });

    await expect(
      savePracticeGuideDraft({
        clinicId: CLINIC_ID,
        actorUserId: USER_ID,
        values: {
          guideId: supplied.id,
          title: "Clinic extraction",
          publicSlug: "ent-extract",
          introduction: "",
          sections: draft.sections.map((section) => ({
            key: section.key,
            kind: section.kind,
            title: section.title,
            body: "Clinic-specific rewrite.",
            periodLabel: section.periodLabel,
            startDay: section.startDay,
            endDay: section.endDay,
          })),
        },
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);

    await expect(
      adaptPracticeGuideFromTemplate({
        clinicId: CLINIC_ID,
        guideId: supplied.id,
      })
    ).rejects.toMatchObject({ code: "template_adaptation_unavailable" });
    expect(await countCustomGuides(prisma, CLINIC_ID)).toBe(0);
    const canonical = await prisma.guideTemplate.findUniqueOrThrow({
      where: { id: TEMPLATE_ID },
    });
    expect(canonical.title).toBe("Tooth Extraction");

    await setPlan("PRACTICE");
    await expect(
      savePracticeGuideDraft({
        clinicId: CLINIC_ID,
        actorUserId: USER_ID,
        values: {
          guideId: supplied.id,
          title: "Clinic extraction",
          publicSlug: "ent-extract",
          introduction: "",
          sections: draft.sections.map((section) => ({
            key: section.key,
            kind: section.kind,
            title: section.title,
            body: "Clinic-specific rewrite.",
            periodLabel: section.periodLabel,
            startDay: section.startDay,
            endDay: section.endDay,
          })),
        },
      })
    ).rejects.toMatchObject({ code: "template_adaptation_required" });

    const adapted = await adaptPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      guideId: supplied.id,
    });
    const adaptedRow = await prisma.practiceGuide.findUniqueOrThrow({
      where: { id: adapted.id },
    });
    expect(adaptedRow.guideTemplateId).toBeNull();
    expect(adaptedRow.pinnedRevisionId).toBeNull();
    expect(adaptedRow.sourceGuideTemplateId).toBe(TEMPLATE_ID);
    expect(adaptedRow.adaptedAt).toBeTruthy();
    expect(await countCustomGuides(prisma, CLINIC_ID)).toBe(1);
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
  });

  it("blocks the 31st Practice guide and adaptation at 30 of 30", async () => {
    await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
    await setPlan("PRACTICE");
    await seedBlankGuides(practiceGuides - 1);
    await createCustomPracticeGuide({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { title: "Thirtieth", publicSlug: "thirtieth" },
    });
    expect(await countCustomGuides(prisma, CLINIC_ID)).toBe(practiceGuides);
    await expect(
      createCustomPracticeGuide({
        clinicId: CLINIC_ID,
        actorUserId: USER_ID,
        values: { title: "Thirty first", publicSlug: "thirty-first" },
      })
    ).rejects.toMatchObject({
      code: "custom_guide_limit",
    });

    await prisma.practiceGuide.deleteMany({
      where: { clinicId: CLINIC_ID, publicSlug: "thirtieth" },
    });
    const supplied = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { templateId: TEMPLATE_ID },
    });
    expect(await countCustomGuides(prisma, CLINIC_ID)).toBe(practiceGuides - 1);
    await adaptPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      guideId: supplied.id,
    });
    expect(await countCustomGuides(prisma, CLINIC_ID)).toBe(practiceGuides);
    await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
    await seedBlankGuides(practiceGuides);
    const full = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { templateId: TEMPLATE_ID },
    });
    await expect(
      adaptPracticeGuideFromTemplate({
        clinicId: CLINIC_ID,
        guideId: full.id,
      })
    ).rejects.toMatchObject({ code: "custom_guide_limit" });
    expect(ENTITLEMENT_CODES.CUSTOM_GUIDE_LIMIT_REACHED).toBe(
      "CUSTOM_GUIDE_LIMIT_REACHED"
    );
  });

  it("does not let two simultaneous creates exceed the Essential allowance", async () => {
    await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
    await setPlan("ESSENTIAL");
    await seedBlankGuides(essentialGuides - 1);
    const results = await Promise.allSettled([
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
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(await countCustomGuides(prisma, CLINIC_ID)).toBe(essentialGuides);
  });

  it("does not impose the fixed caps on legacy or Group clinics", async () => {
    await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
    await setPlan(null);
    await seedBlankGuides(essentialGuides);
    await createCustomPracticeGuide({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { title: "Legacy extra", publicSlug: "legacy-extra" },
    });
    expect(await countCustomGuides(prisma, CLINIC_ID)).toBe(
      essentialGuides + 1
    );

    await setPlan("GROUP");
    await createCustomPracticeGuide({
      clinicId: CLINIC_ID,
      actorUserId: USER_ID,
      values: { title: "Group extra", publicSlug: "group-extra" },
    });
    expect(await countCustomGuides(prisma, CLINIC_ID)).toBe(
      essentialGuides + 2
    );
  });

  it("keeps an above-limit Essential clinic editable without deleting guides", async () => {
    await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
    await setPlan("ESSENTIAL");
    await seedBlankGuides(essentialGuides + 1);
    const existing = await prisma.practiceGuide.findFirstOrThrow({
      where: { clinicId: CLINIC_ID },
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
    await expect(
      createCustomPracticeGuide({
        clinicId: CLINIC_ID,
        actorUserId: USER_ID,
        values: { title: "Not created", publicSlug: "not-created" },
      })
    ).rejects.toMatchObject({ code: "custom_guide_limit" });
    expect(await countCustomGuides(prisma, CLINIC_ID)).toBe(
      essentialGuides + 1
    );

    const readiness = await loadEssentialDowngradeReadiness(CLINIC_ID);
    expect(readiness.conflicts).toContain("CUSTOM_GUIDES");
    expect(readiness.guides.current).toBe(essentialGuides + 1);
  });
});
