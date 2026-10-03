import "dotenv/config";

import { readFileSync } from "node:fs";

import { GuideRevisionStatus, type Prisma } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { canonicalContentSignature } from "@/lib/canonical-templates/content";
import { createCanonicalTemplateDraft } from "@/lib/canonical-templates/create-canonical-template-draft";
import { createCanonicalTemplate } from "@/lib/canonical-templates/create-canonical-template";
import { duplicateCanonicalTemplate } from "@/lib/canonical-templates/duplicate-canonical-template";
import {
  CANONICAL_DUPLICATE_CATEGORY_MESSAGE,
  CANONICAL_DUPLICATE_UNPUBLISHED_MESSAGE,
  suggestDuplicateTemplateTitle,
} from "@/lib/canonical-templates/duplicate-template-messages";
import {
  isCanonicalTemplateError,
  type CanonicalTemplateError,
} from "@/lib/canonical-templates/errors";
import {
  canonicalTemplateLockKey,
  lockCanonicalTemplate,
} from "@/lib/canonical-templates/locks";
import { publishCanonicalTemplateRevision } from "@/lib/canonical-templates/publish-canonical-template-revision";
import { saveCanonicalTemplateDraft } from "@/lib/canonical-templates/save-canonical-template-draft";
import { deactivateCanonicalTemplate } from "@/lib/canonical-templates/set-canonical-template-activation";
import { createPracticeGuideFromTemplate } from "@/lib/clinic-portal/create-practice-guide";
import { publishPracticeGuide } from "@/lib/clinic-portal/publish-practice-guide";
import { ensurePrimarySiteForClinic } from "@/lib/clinics/primary-site-location.mjs";
import { assignPrimarySiteServiceCategories } from "@/lib/clinics/site-service-categories";
import { getPrisma } from "@/lib/prisma";
import { withSampleCategoryLock } from "@/tests/active-sample-slot";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const describeDb = hasDatabase ? describe : describe.skip;

const OPERATOR_ID = "dct_operator";
const ADMIN_ID = "dct_admin";
const CLINIC_ID = "dct_clinic";

const sectionInclude = {
  orderBy: { sortOrder: "asc" as const },
  include: {
    homeCareInstructions: { orderBy: { sortOrder: "asc" as const } },
  },
} satisfies Prisma.GuideTemplateSectionFindManyArgs;

const physioPlan = [
  {
    key: "introduction",
    kind: "INTRODUCTION" as const,
    title: "Your home exercise plan",
    body: "Follow the exercises your physiotherapist selected.",
  },
  {
    key: "immediate-care",
    kind: "IMMEDIATE_CARE" as const,
    title: "Before you start",
    body: "Use a clear space and stop if pain sharpens.",
  },
  {
    key: "first-24-hours",
    kind: "RECOVERY_TIMELINE" as const,
    title: "First 24 hours",
    body: "Start with the gentlest movements.",
    periodLabel: "First 24 hours",
    startDay: 0,
    endDay: 1,
  },
  {
    key: "days-2-3",
    kind: "RECOVERY_TIMELINE" as const,
    title: "Days 2–3",
    body: "Repeat the first session if it stayed comfortable.",
    periodLabel: "Days 2–3",
    startDay: 2,
    endDay: 3,
  },
  {
    key: "home-care",
    kind: "HOME_CARE_PLAN" as const,
    title: "Home exercises",
    body: "",
    homeCareInstructions: [
      {
        key: "sit-to-stand",
        title: "Sit to stand",
        body: "Stand up slowly from a firm chair.",
        frequencyCount: 3,
        frequencyPeriod: "WEEK" as const,
        timingLabel: "Morning",
        durationValue: 4,
        durationUnit: "WEEKS" as const,
      },
      {
        key: "heel-raises",
        title: "Heel raises",
        body: null,
        frequencyCount: 1,
        frequencyPeriod: "DAY" as const,
        timingLabel: null,
        durationValue: 7,
        durationUnit: "DAYS" as const,
      },
      {
        key: "easy-walk",
        title: "Easy walk",
        body: "Stop before fatigue.",
        frequencyCount: null,
        frequencyPeriod: null,
        timingLabel: "Afternoon",
        durationValue: null,
        durationUnit: null,
      },
    ],
  },
  {
    key: "warning-signs",
    kind: "WARNING_SIGNS" as const,
    title: "Warning signs",
    body: "Contact the clinic if swelling or pain increases.",
  },
  {
    key: "emergency",
    kind: "EMERGENCY" as const,
    title: "Emergency",
    body: "Call emergency services for chest pain or sudden weakness.",
  },
];

const createdTemplateIds: string[] = [];

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function advisoryLockCounts(lockKey: string) {
  const rows = await getPrisma().$queryRaw<
    { granted: number; waiting: number }[]
  >`
    SELECT
      COALESCE(SUM(CASE WHEN l.granted THEN 1 ELSE 0 END), 0)::int AS granted,
      COALESCE(SUM(CASE WHEN NOT l.granted THEN 1 ELSE 0 END), 0)::int AS waiting
    FROM pg_locks l
    WHERE l.locktype = 'advisory'
      AND l.objsubid = 1
      AND ((l.classid::bigint << 32) | l.objid::bigint) = hashtext(${lockKey})::bigint
  `;
  return {
    granted: Number(rows[0]?.granted ?? 0),
    waiting: Number(rows[0]?.waiting ?? 0),
  };
}

async function waitForCanonicalWaiter(templateId: string) {
  const lockKey = canonicalTemplateLockKey(templateId);
  const started = Date.now();
  let last = { granted: 0, waiting: 0 };
  while (Date.now() - started < 8_000) {
    last = await advisoryLockCounts(lockKey);
    if (last.granted >= 1 && last.waiting >= 1) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `No session was waiting on ${lockKey}. granted=${last.granted} waiting=${last.waiting}`
  );
}

async function cleanup() {
  const prisma = getPrisma();
  await prisma.clinic.deleteMany({ where: { id: CLINIC_ID } });
  if (createdTemplateIds.length > 0) {
    await prisma.guideTemplate.deleteMany({
      where: { id: { in: createdTemplateIds } },
    });
  }
  await prisma.guideTemplate.deleteMany({
    where: { slug: { startsWith: "dct-" } },
  });
  await prisma.user.deleteMany({
    where: { email: { endsWith: "@dct.example.test" } },
  });
  createdTemplateIds.length = 0;
}

async function seedActors() {
  const prisma = getPrisma();
  await prisma.user.create({
    data: {
      id: OPERATOR_ID,
      email: "operator@dct.example.test",
      name: "Duplicate Operator",
      platformRole: "OPERATOR",
    },
  });
  await prisma.user.create({
    data: {
      id: ADMIN_ID,
      email: "admin@dct.example.test",
      name: "Duplicate Clinic Admin",
    },
  });
  await prisma.clinic.create({
    data: {
      id: CLINIC_ID,
      name: "Duplicate Template Clinic",
      slug: "dct-clinic",
      memberships: { create: { userId: ADMIN_ID, role: "ADMIN" } },
    },
  });
  await ensurePrimarySiteForClinic(prisma, CLINIC_ID);
  await assignPrimarySiteServiceCategories(prisma, CLINIC_ID, [
    "PHYSIOTHERAPY",
    "CHIROPRACTIC",
    "COSMETIC_AESTHETIC",
    "DENTAL",
  ]);
}

async function expectCanonicalCode(
  promise: Promise<unknown>,
  code: CanonicalTemplateError["code"]
) {
  try {
    await promise;
  } catch (error) {
    expect(isCanonicalTemplateError(error)).toBe(true);
    if (isCanonicalTemplateError(error)) {
      expect(error.code).toBe(code);
      return error;
    }
  }
  throw new Error(`Expected canonical error ${code}.`);
}

async function publishTemplate(input: {
  title: string;
  slug: string;
  serviceCategory:
    "DENTAL" | "PHYSIOTHERAPY" | "CHIROPRACTIC" | "COSMETIC_AESTHETIC";
  classification?: "PRODUCTION" | "SAMPLE";
  sections: readonly unknown[];
}) {
  const created = await createCanonicalTemplate({
    actorUserId: OPERATOR_ID,
    title: input.title,
    slug: input.slug,
    serviceCategory: input.serviceCategory,
    classification: input.classification ?? "PRODUCTION",
  });
  createdTemplateIds.push(created.templateId);
  await saveCanonicalTemplateDraft({
    templateId: created.templateId,
    revisionId: created.revisionId,
    actorUserId: OPERATOR_ID,
    sections: input.sections,
  });
  await publishCanonicalTemplateRevision({
    templateId: created.templateId,
    revisionId: created.revisionId,
    actorUserId: OPERATOR_ID,
    expectedVersion: 1,
  });
  return created;
}

async function duplicateTracked(
  input: Parameters<typeof duplicateCanonicalTemplate>[0]
) {
  const created = await duplicateCanonicalTemplate(input);
  createdTemplateIds.push(created.templateId);
  return created;
}

async function loadTemplate(templateId: string) {
  return getPrisma().guideTemplate.findUniqueOrThrow({
    where: { id: templateId },
    include: {
      revisions: {
        orderBy: { version: "asc" },
        include: { sections: sectionInclude },
      },
      practiceGuides: {
        orderBy: { id: "asc" },
        include: {
          contentRevisions: {
            orderBy: { version: "asc" },
            select: { id: true, version: true, status: true },
          },
          placements: {
            select: { id: true, publicSlug: true, isEnabled: true },
          },
        },
      },
    },
  });
}

function identityIds(template: Awaited<ReturnType<typeof loadTemplate>>) {
  const ids = new Set<string>([template.id]);
  for (const revision of template.revisions) {
    ids.add(revision.id);
    for (const section of revision.sections) {
      ids.add(section.id);
      for (const item of section.homeCareInstructions) {
        ids.add(item.id);
      }
    }
  }
  for (const guide of template.practiceGuides) {
    ids.add(guide.id);
    for (const revision of guide.contentRevisions) {
      ids.add(revision.id);
    }
  }
  return ids;
}

describe("canonical template duplication contracts", () => {
  it("reuses canonical creation and the published-revision copy", () => {
    const source = readFileSync(
      "lib/canonical-templates/duplicate-canonical-template.ts",
      "utf8"
    );
    expect(source).toContain("createCanonicalTemplateInTransaction");
    expect(source).toContain("saveCanonicalTemplateDraftInTransaction");
    expect(source).toContain("loadLatestPublishedCanonicalContent");
    expect(source).toContain("lockCanonicalTemplate");
    expect(source).not.toContain("adoptPublishedSample");
    expect(source).not.toContain("publishCanonicalTemplateRevision");
    expect(source).not.toContain("practiceGuide");
    expect(
      suggestDuplicateTemplateTitle("Physiotherapy Home Exercise Plan")
    ).toBe("Physiotherapy Home Exercise Plan copy");
    expect(suggestDuplicateTemplateTitle(`${"A".repeat(120)}`)).toHaveLength(
      120
    );
  });
});

describeDb("canonical template duplication", () => {
  beforeEach(async () => {
    await cleanup();
    await seedActors();
  });

  afterAll(async () => {
    if (!hasDatabase) {
      return;
    }
    await cleanup();
    await getPrisma().$disconnect();
  });

  it("refuses an unpublished source, another category, and a slug conflict", async () => {
    const draftOnly = await createCanonicalTemplate({
      actorUserId: OPERATOR_ID,
      title: "Unpublished source",
      slug: "dct-unpublished",
      serviceCategory: "DENTAL",
    });
    createdTemplateIds.push(draftOnly.templateId);
    const unpublished = await expectCanonicalCode(
      duplicateCanonicalTemplate({
        actorUserId: OPERATOR_ID,
        sourceTemplateId: draftOnly.templateId,
        title: "Unpublished copy",
        slug: "dct-unpublished-copy",
        serviceCategory: "DENTAL",
        classification: "PRODUCTION",
      }),
      "invalid"
    );
    expect(unpublished.message).toBe(CANONICAL_DUPLICATE_UNPUBLISHED_MESSAGE);
    expect(
      await getPrisma().guideTemplateRevision.count({
        where: { guideTemplateId: draftOnly.templateId },
      })
    ).toBe(1);

    const source = await publishTemplate({
      title: "Dental source",
      slug: "dct-dental-source",
      serviceCategory: "DENTAL",
      sections: [physioPlan[0]],
    });
    const category = await expectCanonicalCode(
      duplicateCanonicalTemplate({
        actorUserId: OPERATOR_ID,
        sourceTemplateId: source.templateId,
        title: "Moved category",
        slug: "dct-moved-category",
        serviceCategory: "PHYSIOTHERAPY",
        classification: "PRODUCTION",
      }),
      "invalid"
    );
    expect(category.message).toBe(CANONICAL_DUPLICATE_CATEGORY_MESSAGE);

    const reserved = await expectCanonicalCode(
      duplicateCanonicalTemplate({
        actorUserId: OPERATOR_ID,
        sourceTemplateId: source.templateId,
        title: "Reserved slug",
        slug: "extraction",
        serviceCategory: "DENTAL",
        classification: "PRODUCTION",
      }),
      "invalid"
    );
    expect(reserved.message).toMatch(/extraction/i);

    const sameSlug = await expectCanonicalCode(
      duplicateCanonicalTemplate({
        actorUserId: OPERATOR_ID,
        sourceTemplateId: source.templateId,
        title: "Same slug",
        slug: "dct-dental-source",
        serviceCategory: "DENTAL",
        classification: "PRODUCTION",
      }),
      "conflict"
    );
    expect(sameSlug.message).toBe("That slug is already used.");
    expect(
      await getPrisma().guideTemplate.count({
        where: { slug: { startsWith: "dct-" } },
      })
    ).toBe(2);
  });

  it("copies the latest published physiotherapy plan and leaves the source in place", async () => {
    await withSampleCategoryLock(["PHYSIOTHERAPY"], async () => {
      const source = await publishTemplate({
        title: "Physiotherapy Home Exercise Plan",
        slug: "dct-physio-hep",
        serviceCategory: "PHYSIOTHERAPY",
        sections: physioPlan,
      });
      const nextDraft = await createCanonicalTemplateDraft({
        templateId: source.templateId,
        actorUserId: OPERATOR_ID,
      });
      await saveCanonicalTemplateDraft({
        templateId: source.templateId,
        revisionId: nextDraft.revisionId,
        actorUserId: OPERATOR_ID,
        sections: [
          {
            key: "working-draft",
            kind: "INTRODUCTION",
            title: "Unpublished working draft",
            body: "This draft must not be copied.",
          },
        ],
      });
      const practice = await createPracticeGuideFromTemplate({
        clinicId: CLINIC_ID,
        actorUserId: ADMIN_ID,
        values: {
          templateId: source.templateId,
          publicSlug: "dct-physio-guide",
        },
      });
      await publishPracticeGuide({
        clinicId: CLINIC_ID,
        actorUserId: ADMIN_ID,
        guideId: practice.id,
      });

      const before = await loadTemplate(source.templateId);
      const occupant = await getPrisma().guideTemplate.findFirst({
        where: {
          serviceCategory: "PHYSIOTHERAPY",
          isSample: true,
          isActive: true,
        },
        select: { id: true, title: true, slug: true, updatedAt: true },
      });
      const slugOwner = await getPrisma().guideTemplate.findUnique({
        where: { slug: "home-exercise-plan" },
        select: {
          id: true,
          slug: true,
          isSample: true,
          isActive: true,
          updatedAt: true,
        },
      });
      const slotFree = occupant === null;
      const slugFree = slugOwner === null;
      const demoTitle = "Physiotherapy Home Exercise Plan — Demo";
      const demoSlug = "home-exercise-plan";

      let duplicatedId = "";
      if (slotFree) {
        const created = await duplicateTracked({
          actorUserId: OPERATOR_ID,
          sourceTemplateId: source.templateId,
          title: demoTitle,
          slug: slugFree ? demoSlug : "dct-physio-demo",
          serviceCategory: "PHYSIOTHERAPY",
          classification: "SAMPLE",
        });
        duplicatedId = created.templateId;
        const copy = await loadTemplate(created.templateId);
        expect(copy.title).toBe(demoTitle);
        expect(copy.slug).toBe(slugFree ? demoSlug : "dct-physio-demo");
        expect(copy.serviceCategory).toBe("PHYSIOTHERAPY");
        expect(copy.isSample).toBe(true);
        expect(copy.isActive).toBe(true);
      } else {
        const exact = await expectCanonicalCode(
          duplicateCanonicalTemplate({
            actorUserId: OPERATOR_ID,
            sourceTemplateId: source.templateId,
            title: demoTitle,
            slug: demoSlug,
            serviceCategory: "PHYSIOTHERAPY",
            classification: "SAMPLE",
          }),
          "conflict"
        );
        expect(exact.message).toMatch(
          slugFree ? /active sample/i : /slug is already used/
        );
        const sampleAttempt = await expectCanonicalCode(
          duplicateCanonicalTemplate({
            actorUserId: OPERATOR_ID,
            sourceTemplateId: source.templateId,
            title: demoTitle,
            slug: "dct-physio-sample",
            serviceCategory: "PHYSIOTHERAPY",
            classification: "SAMPLE",
          }),
          "conflict"
        );
        expect(sampleAttempt.message).toMatch(/active sample/i);
        expect(sampleAttempt.message).not.toMatch(/P2002/);
        const created = await duplicateTracked({
          actorUserId: OPERATOR_ID,
          sourceTemplateId: source.templateId,
          title: demoTitle,
          slug: "dct-physio-demo",
          serviceCategory: "PHYSIOTHERAPY",
          classification: "PRODUCTION",
        });
        duplicatedId = created.templateId;
        const copy = await loadTemplate(created.templateId);
        expect(copy.isSample).toBe(false);
        expect(copy.serviceCategory).toBe("PHYSIOTHERAPY");
        expect(copy.slug).toBe("dct-physio-demo");
      }

      const copy = await loadTemplate(duplicatedId);
      const sourceAfter = await loadTemplate(source.templateId);
      expect(sourceAfter).toEqual(before);
      expect(copy.revisions).toHaveLength(1);
      const draft = copy.revisions[0];
      expect(draft?.version).toBe(1);
      expect(draft?.status).toBe(GuideRevisionStatus.DRAFT);
      expect(draft?.publishedAt).toBeNull();
      expect(draft?.publishedByUserId).toBeNull();
      expect(draft?.reviewerName).toBeNull();
      expect(draft?.reviewedAt).toBeNull();
      expect(draft?.createdByUserId).toBe(OPERATOR_ID);
      expect(copy.practiceGuides).toEqual([]);
      expect(draft?.sections.map((section) => section.title)).not.toContain(
        "Unpublished working draft"
      );

      const published = before.revisions.find(
        (revision) => revision.status === "PUBLISHED"
      );
      expect(published?.version).toBe(1);
      expect(canonicalContentSignature(draft?.sections ?? [])).toBe(
        canonicalContentSignature(published?.sections ?? [])
      );
      const sourceIds = identityIds(before);
      for (const id of identityIds(copy)) {
        expect(sourceIds.has(id)).toBe(false);
      }
      expect(draft?.sections.map((section) => section.key)).toEqual(
        published?.sections.map((section) => section.key)
      );
      const warning = draft?.sections.find(
        (section) => section.kind === "WARNING_SIGNS"
      );
      const emergency = draft?.sections.find(
        (section) => section.kind === "EMERGENCY"
      );
      const timeline = draft?.sections.filter(
        (section) => section.kind === "RECOVERY_TIMELINE"
      );
      const plan = draft?.sections.find(
        (section) => section.kind === "HOME_CARE_PLAN"
      );
      expect(warning?.body).toBe(
        "Contact the clinic if swelling or pain increases."
      );
      expect(emergency?.body).toBe(
        "Call emergency services for chest pain or sudden weakness."
      );
      expect(
        timeline?.map((section) => [
          section.periodLabel,
          section.startDay,
          section.endDay,
        ])
      ).toEqual([
        ["First 24 hours", 0, 1],
        ["Days 2–3", 2, 3],
      ]);
      expect(plan?.homeCareInstructions).toMatchObject([
        {
          key: "sit-to-stand",
          frequencyCount: 3,
          frequencyPeriod: "WEEK",
          timingLabel: "Morning",
          durationValue: 4,
          durationUnit: "WEEKS",
        },
        {
          key: "heel-raises",
          frequencyCount: 1,
          frequencyPeriod: "DAY",
          durationValue: 7,
          durationUnit: "DAYS",
        },
        {
          key: "easy-walk",
          timingLabel: "Afternoon",
          frequencyCount: null,
          durationValue: null,
        },
      ]);

      const edited = physioPlan.map((section) =>
        section.key === "introduction"
          ? { ...section, title: "Edited duplicate introduction" }
          : section
      );
      await saveCanonicalTemplateDraft({
        templateId: copy.id,
        revisionId: draft?.id ?? "",
        actorUserId: OPERATOR_ID,
        sections: edited,
      });
      await publishCanonicalTemplateRevision({
        templateId: copy.id,
        revisionId: draft?.id ?? "",
        actorUserId: OPERATOR_ID,
        expectedVersion: 1,
      });
      const publishedCopy = await loadTemplate(copy.id);
      const sourceStill = await loadTemplate(source.templateId);
      expect(publishedCopy.revisions[0]?.status).toBe(
        GuideRevisionStatus.PUBLISHED
      );
      expect(publishedCopy.revisions[0]?.version).toBe(1);
      expect(
        publishedCopy.revisions[0]?.sections.find(
          (section) => section.key === "introduction"
        )?.title
      ).toBe("Edited duplicate introduction");
      expect(sourceStill).toEqual(before);
      expect(publishedCopy.practiceGuides).toEqual([]);
      expect(sourceStill.slug).toBe("dct-physio-hep");
      expect(sourceStill.isActive).toBe(true);
      expect(sourceStill.isSample).toBe(false);

      if (occupant) {
        const occupantAfter = await getPrisma().guideTemplate.findUniqueOrThrow(
          {
            where: { id: occupant.id },
            select: { id: true, title: true, slug: true, updatedAt: true },
          }
        );
        expect(occupantAfter).toEqual(occupant);
      }
      if (slugOwner) {
        const slugAfter = await getPrisma().guideTemplate.findUniqueOrThrow({
          where: { id: slugOwner.id },
          select: {
            id: true,
            slug: true,
            isSample: true,
            isActive: true,
            updatedAt: true,
          },
        });
        expect(slugAfter).toEqual(slugOwner);
      }
    });
  });

  it("duplicates a sample into production and refuses a second active sample", async () => {
    await withSampleCategoryLock(["CHIROPRACTIC"], async () => {
      const source = await publishTemplate({
        title: "Chiropractic sample source",
        slug: "dct-chiro-sample",
        serviceCategory: "CHIROPRACTIC",
        classification: "SAMPLE",
        sections: physioPlan,
      });
      const before = await loadTemplate(source.templateId);
      const created = await duplicateTracked({
        actorUserId: OPERATOR_ID,
        sourceTemplateId: source.templateId,
        title: "Chiropractic production copy",
        slug: "dct-chiro-production",
        serviceCategory: "CHIROPRACTIC",
        classification: "PRODUCTION",
      });
      const copy = await loadTemplate(created.templateId);
      expect(copy.isSample).toBe(false);
      expect(copy.revisions[0]?.status).toBe(GuideRevisionStatus.DRAFT);
      expect(canonicalContentSignature(copy.revisions[0]?.sections ?? [])).toBe(
        canonicalContentSignature(before.revisions[0]?.sections ?? [])
      );
      const blocked = await expectCanonicalCode(
        duplicateCanonicalTemplate({
          actorUserId: OPERATOR_ID,
          sourceTemplateId: source.templateId,
          title: "Second chiropractic sample",
          slug: "dct-chiro-sample-2",
          serviceCategory: "CHIROPRACTIC",
          classification: "SAMPLE",
        }),
        "conflict"
      );
      expect(blocked.message).toBe(
        "Chiropractic already has an active sample: Chiropractic sample source."
      );
      expect(await loadTemplate(source.templateId)).toEqual(before);
      expect(
        await getPrisma().guideTemplate.count({
          where: {
            serviceCategory: "CHIROPRACTIC",
            isSample: true,
            isActive: true,
            slug: { startsWith: "dct-" },
          },
        })
      ).toBe(1);
    });
  });

  it("serializes concurrent slug and sample requests and keeps the database constraint", async () => {
    const first = await publishTemplate({
      title: "Race source one",
      slug: "dct-race-source-1",
      serviceCategory: "DENTAL",
      sections: [physioPlan[0]],
    });
    const second = await publishTemplate({
      title: "Race source two",
      slug: "dct-race-source-2",
      serviceCategory: "DENTAL",
      sections: [physioPlan[0]],
    });
    const slugRace = await Promise.allSettled([
      duplicateCanonicalTemplate({
        actorUserId: OPERATOR_ID,
        sourceTemplateId: first.templateId,
        title: "Race slug",
        slug: "dct-race-slug",
        serviceCategory: "DENTAL",
        classification: "PRODUCTION",
      }),
      duplicateCanonicalTemplate({
        actorUserId: OPERATOR_ID,
        sourceTemplateId: second.templateId,
        title: "Race slug",
        slug: "dct-race-slug",
        serviceCategory: "DENTAL",
        classification: "PRODUCTION",
      }),
    ]);
    const slugWinner = slugRace.find((result) => result.status === "fulfilled");
    const slugLoser = slugRace.find((result) => result.status === "rejected");
    expect(slugWinner?.status).toBe("fulfilled");
    if (slugWinner?.status === "fulfilled") {
      createdTemplateIds.push(slugWinner.value.templateId);
    }
    expect(slugLoser?.status).toBe("rejected");
    if (slugLoser?.status === "rejected") {
      expect(isCanonicalTemplateError(slugLoser.reason)).toBe(true);
      if (isCanonicalTemplateError(slugLoser.reason)) {
        expect(slugLoser.reason.message).toBe("That slug is already used.");
      }
    }
    expect(
      await getPrisma().guideTemplate.count({
        where: { slug: "dct-race-slug" },
      })
    ).toBe(1);
    expect(await loadTemplate(first.templateId)).toMatchObject({
      slug: "dct-race-source-1",
      isActive: true,
    });
    expect(
      (
        await getPrisma().guideTemplateRevision.findMany({
          where: { guideTemplateId: first.templateId },
        })
      ).map((revision) => revision.version)
    ).toEqual([1]);

    await withSampleCategoryLock(["COSMETIC_AESTHETIC"], async () => {
      const sampleSource = await publishTemplate({
        title: "Cosmetic race source",
        slug: "dct-cosmetic-source",
        serviceCategory: "COSMETIC_AESTHETIC",
        sections: [physioPlan[0]],
      });
      const otherSource = await publishTemplate({
        title: "Cosmetic race other",
        slug: "dct-cosmetic-other",
        serviceCategory: "COSMETIC_AESTHETIC",
        sections: [physioPlan[0]],
      });
      const sampleRace = await Promise.allSettled([
        duplicateCanonicalTemplate({
          actorUserId: OPERATOR_ID,
          sourceTemplateId: sampleSource.templateId,
          title: "Cosmetic sample one",
          slug: "dct-cosmetic-sample-1",
          serviceCategory: "COSMETIC_AESTHETIC",
          classification: "SAMPLE",
        }),
        duplicateCanonicalTemplate({
          actorUserId: OPERATOR_ID,
          sourceTemplateId: otherSource.templateId,
          title: "Cosmetic sample two",
          slug: "dct-cosmetic-sample-2",
          serviceCategory: "COSMETIC_AESTHETIC",
          classification: "SAMPLE",
        }),
      ]);
      const sampleWinner = sampleRace.find(
        (result) => result.status === "fulfilled"
      );
      const sampleLoser = sampleRace.find(
        (result) => result.status === "rejected"
      );
      expect(sampleWinner?.status).toBe("fulfilled");
      if (sampleWinner?.status === "fulfilled") {
        createdTemplateIds.push(sampleWinner.value.templateId);
      }
      expect(sampleLoser?.status).toBe("rejected");
      if (sampleLoser?.status === "rejected") {
        expect(isCanonicalTemplateError(sampleLoser.reason)).toBe(true);
        if (isCanonicalTemplateError(sampleLoser.reason)) {
          expect(sampleLoser.reason.code).toBe("conflict");
          expect(sampleLoser.reason.message).toMatch(/active sample/i);
          expect(sampleLoser.reason.message).not.toMatch(/P2002/);
        }
      }
      expect(
        await getPrisma().guideTemplate.count({
          where: {
            serviceCategory: "COSMETIC_AESTHETIC",
            isSample: true,
            isActive: true,
            slug: { startsWith: "dct-" },
          },
        })
      ).toBe(1);
      await expect(
        getPrisma().guideTemplate.create({
          data: {
            title: "Cosmetic index backstop",
            slug: "dct-cosmetic-index",
            serviceCategory: "COSMETIC_AESTHETIC",
            isSample: true,
            isActive: true,
          },
        })
      ).rejects.toMatchObject({ code: "P2002" });
      expect(
        await getPrisma().guideTemplate.findUnique({
          where: { slug: "dct-cosmetic-index" },
        })
      ).toBeNull();
    });
  });

  it("waits for the source template lock and starts a new revision history", async () => {
    const source = await publishTemplate({
      title: "Versioned source",
      slug: "dct-versioned",
      serviceCategory: "DENTAL",
      sections: [
        {
          key: "introduction",
          kind: "INTRODUCTION",
          title: "Version one",
          body: "Published first.",
        },
      ],
    });
    const next = await createCanonicalTemplateDraft({
      templateId: source.templateId,
      actorUserId: OPERATOR_ID,
    });
    await saveCanonicalTemplateDraft({
      templateId: source.templateId,
      revisionId: next.revisionId,
      actorUserId: OPERATOR_ID,
      sections: [
        {
          key: "introduction",
          kind: "INTRODUCTION",
          title: "Version two",
          body: "Published second.",
        },
      ],
    });
    await publishCanonicalTemplateRevision({
      templateId: source.templateId,
      revisionId: next.revisionId,
      actorUserId: OPERATOR_ID,
      expectedVersion: 2,
    });

    const release = deferred();
    const ready = deferred();
    let finished = false;
    const holder = getPrisma().$transaction(
      async (tx) => {
        await lockCanonicalTemplate(tx, source.templateId);
        ready.resolve();
        await release.promise;
      },
      { maxWait: 10_000, timeout: 20_000 }
    );
    try {
      await ready.promise;
      const blocked = duplicateCanonicalTemplate({
        actorUserId: OPERATOR_ID,
        sourceTemplateId: source.templateId,
        title: "Locked copy",
        slug: "dct-locked-copy",
        serviceCategory: "DENTAL",
        classification: "PRODUCTION",
      }).then((result) => {
        finished = true;
        return result;
      });
      await waitForCanonicalWaiter(source.templateId);
      expect(finished).toBe(false);
      release.resolve();
      const created = await blocked;
      createdTemplateIds.push(created.templateId);
      expect(finished).toBe(true);
      const copy = await loadTemplate(created.templateId);
      const sourceAfter = await loadTemplate(source.templateId);
      expect(copy.revisions.map((revision) => revision.version)).toEqual([1]);
      expect(copy.revisions[0]?.sections[0]?.title).toBe("Version two");
      expect(sourceAfter.revisions.map((revision) => revision.version)).toEqual(
        [1, 2]
      );
      expect(sourceAfter.revisions[0]?.sections[0]?.title).toBe("Version one");
      expect(sourceAfter.revisions[1]?.status).toBe(
        GuideRevisionStatus.PUBLISHED
      );
    } finally {
      release.resolve();
      await holder;
    }

    const inactiveSource = await publishTemplate({
      title: "Inactive source",
      slug: "dct-inactive-source",
      serviceCategory: "DENTAL",
      sections: [physioPlan[0]],
    });
    await deactivateCanonicalTemplate({
      templateId: inactiveSource.templateId,
      actorUserId: OPERATOR_ID,
    });
    const inactiveCopy = await duplicateTracked({
      actorUserId: OPERATOR_ID,
      sourceTemplateId: inactiveSource.templateId,
      title: "Copy of inactive",
      slug: "dct-inactive-copy",
      serviceCategory: "DENTAL",
      classification: "PRODUCTION",
    });
    expect((await loadTemplate(inactiveSource.templateId)).isActive).toBe(
      false
    );
    expect((await loadTemplate(inactiveCopy.templateId)).isActive).toBe(true);
    expect(
      (await loadTemplate(inactiveCopy.templateId)).revisions[0]?.status
    ).toBe(GuideRevisionStatus.DRAFT);
  });
});
