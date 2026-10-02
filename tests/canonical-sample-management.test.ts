import "dotenv/config";

import { readFileSync } from "node:fs";

import { GuideRevisionStatus, type ServiceCategory } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { canonicalContentSignature } from "@/lib/canonical-templates/content";
import {
  deactivateCanonicalTemplates,
  deleteNeverPublishedCanonicalTemplates,
  publishCanonicalTemplates,
  reactivateCanonicalTemplates,
} from "@/lib/canonical-templates/bulk-canonical-template-lifecycle";
import { createCanonicalTemplateDraft } from "@/lib/canonical-templates/create-canonical-template-draft";
import { createCanonicalTemplate } from "@/lib/canonical-templates/create-canonical-template";
import {
  isBulkCanonicalTemplateError,
  isCanonicalTemplateError,
  type CanonicalTemplateError,
} from "@/lib/canonical-templates/errors";
import { publishCanonicalTemplateRevision } from "@/lib/canonical-templates/publish-canonical-template-revision";
import { saveCanonicalTemplateDraft } from "@/lib/canonical-templates/save-canonical-template-draft";
import {
  deactivateCanonicalTemplate,
  reactivateCanonicalTemplate,
} from "@/lib/canonical-templates/set-canonical-template-activation";
import { updateCanonicalTemplateMetadata } from "@/lib/canonical-templates/update-canonical-template-metadata";
import { createPracticeGuideFromTemplate } from "@/lib/clinic-portal/create-practice-guide";
import { isClinicPortalError } from "@/lib/clinic-portal/errors";
import { listCanonicalGuideTemplates } from "@/lib/clinic-portal/list-canonical-templates";
import { ensurePrimarySiteForClinic } from "@/lib/clinics/primary-site-location.mjs";
import { assignPrimarySiteServiceCategories } from "@/lib/clinics/site-service-categories";
import {
  countAdaptedTemplateGuides,
  countOriginalCustomGuides,
} from "@/lib/entitlements/guide-usage";
import { getPrisma } from "@/lib/prisma";
import { withSampleCategoryLock } from "@/tests/active-sample-slot";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const describeDb = hasDatabase ? describe : describe.skip;

const OPERATOR_ID = "csm_operator";
const ADMIN_ID = "csm_admin";
const CLINIC_ID = "csm_clinic";

const intro = {
  key: "introduction",
  kind: "INTRODUCTION" as const,
  title: "After treatment",
  body: "Rest and follow the practice instructions.",
};

const sectionInclude = {
  orderBy: { sortOrder: "asc" as const },
  include: {
    homeCareInstructions: { orderBy: { sortOrder: "asc" as const } },
  },
};

async function cleanup() {
  const prisma = getPrisma();
  await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
  await prisma.clinic.deleteMany({ where: { id: CLINIC_ID } });
  await prisma.guideTemplate.deleteMany({
    where: { slug: { startsWith: "csm-" } },
  });
  await prisma.user.deleteMany({
    where: { email: { endsWith: "@csm.example.test" } },
  });
}

async function seedActors() {
  const prisma = getPrisma();
  await prisma.user.create({
    data: {
      id: OPERATOR_ID,
      email: "operator@csm.example.test",
      name: "Sample Operator",
      platformRole: "OPERATOR",
    },
  });
  await prisma.user.create({
    data: {
      id: ADMIN_ID,
      email: "admin@csm.example.test",
      name: "Sample Clinic Admin",
    },
  });
  await prisma.clinic.create({
    data: {
      id: CLINIC_ID,
      name: "Sample Management Clinic",
      slug: "csm-clinic",
      memberships: { create: { userId: ADMIN_ID, role: "ADMIN" } },
    },
  });
  await ensurePrimarySiteForClinic(prisma, CLINIC_ID);
  await assignPrimarySiteServiceCategories(prisma, CLINIC_ID, ["DENTAL"]);
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
    }
    return error;
  }
  throw new Error(`Expected canonical error ${code}.`);
}

async function publishIntro(created: {
  templateId: string;
  revisionId: string;
}) {
  await saveCanonicalTemplateDraft({
    templateId: created.templateId,
    revisionId: created.revisionId,
    actorUserId: OPERATOR_ID,
    sections: [intro],
  });
  return publishCanonicalTemplateRevision({
    templateId: created.templateId,
    revisionId: created.revisionId,
    actorUserId: OPERATOR_ID,
    expectedVersion: 1,
  });
}

describe("canonical sample management contracts", () => {
  it("adds one active sample per category without rewriting templates", () => {
    const sql = readFileSync(
      "prisma/migrations/20261002100000_one_active_canonical_sample_per_category/migration.sql",
      "utf8"
    );
    expect(sql).toContain("GuideTemplate_one_active_sample_per_category_key");
    expect(sql).toContain(`WHERE "isSample" = true AND "isActive" = true`);
    expect(sql).not.toMatch(/UPDATE\s+"GuideTemplate"/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+"GuideTemplate"/i);

    const preview = readFileSync(
      "app/(staff)/(operator-preview)/operator/templates/canonical-patient-preview.tsx",
      "utf8"
    );
    expect(preview).toContain("Print / Save as PDF");
    expect(preview).not.toContain("isSample");

    const draftPage = readFileSync(
      "app/(staff)/(operator)/operator/templates/[templateId]/draft/page.tsx",
      "utf8"
    );
    expect(draftPage).not.toContain("cannot be converted or published");
    expect(draftPage).toContain("CanonicalDraftEditor");
  });
});

describeDb("canonical sample management", () => {
  beforeEach(async () => {
    await cleanup();
    await seedActors();
  });

  afterAll(async () => {
    if (hasDatabase) {
      await cleanup();
    }
  });

  it("creates a production template by default", async () => {
    const created = await createCanonicalTemplate({
      actorUserId: OPERATOR_ID,
      title: "Production physio plan",
      slug: "csm-prod",
      serviceCategory: "PHYSIOTHERAPY",
    });
    const template = await getPrisma().guideTemplate.findUniqueOrThrow({
      where: { id: created.templateId },
      include: { revisions: true },
    });
    expect(template.isSample).toBe(false);
    expect(template.revisions).toHaveLength(1);
    expect(template.revisions[0]?.status).toBe(GuideRevisionStatus.DRAFT);
  });

  it("creates one active sample per service category and rejects a second", async () => {
    await withSampleCategoryLock(
      ["PHYSIOTHERAPY", "CHIROPRACTIC", "COSMETIC_AESTHETIC"],
      async () => {
        const dental = await getPrisma().guideTemplate.findUnique({
          where: { slug: "extraction" },
        });
        expect(dental).toMatchObject({
          isSample: true,
          isActive: true,
          serviceCategory: "DENTAL",
          title: "Tooth Extraction",
        });

        const categories = [
          ["PHYSIOTHERAPY", "physio"],
          ["CHIROPRACTIC", "chiro"],
          ["COSMETIC_AESTHETIC", "cosmetic"],
        ] as const;
        for (const [serviceCategory, slug] of categories) {
          const created = await createCanonicalTemplate({
            actorUserId: OPERATOR_ID,
            title: `${serviceCategory} sample`,
            slug: `csm-${slug}`,
            serviceCategory,
            classification: "SAMPLE",
          });
          const row = await getPrisma().guideTemplate.findUniqueOrThrow({
            where: { id: created.templateId },
          });
          expect(row.isSample).toBe(true);
          expect(row.isActive).toBe(true);

          const error = await expectCanonicalCode(
            createCanonicalTemplate({
              actorUserId: OPERATOR_ID,
              title: `${serviceCategory} second`,
              slug: `csm-${slug}-2`,
              serviceCategory,
              classification: "SAMPLE",
            }),
            "conflict"
          );
          expect(error).toBeInstanceOf(Error);
          if (error instanceof Error) {
            expect(error.message).toContain("already has an active sample");
          }
        }

        const dentalError = await expectCanonicalCode(
          createCanonicalTemplate({
            actorUserId: OPERATOR_ID,
            title: "Second dental sample",
            slug: "csm-dental-2",
            serviceCategory: "DENTAL",
            classification: "SAMPLE",
          }),
          "conflict"
        );
        if (dentalError instanceof Error) {
          expect(dentalError.message).toBe(
            "Dental already has an active sample: Tooth Extraction."
          );
        }

        const active = await getPrisma().guideTemplate.groupBy({
          by: ["serviceCategory"],
          where: { isSample: true, isActive: true },
          _count: { _all: true },
        });
        for (const row of active) {
          expect(row._count._all).toBe(1);
        }
      }
    );
  });

  it("lets only one of two concurrent sample creates occupy a category", async () => {
    await withSampleCategoryLock(["PHYSIOTHERAPY"], async () => {
      const results = await Promise.allSettled([
        createCanonicalTemplate({
          actorUserId: OPERATOR_ID,
          title: "Race sample A",
          slug: "csm-race-a",
          serviceCategory: "PHYSIOTHERAPY",
          classification: "SAMPLE",
        }),
        createCanonicalTemplate({
          actorUserId: OPERATOR_ID,
          title: "Race sample B",
          slug: "csm-race-b",
          serviceCategory: "PHYSIOTHERAPY",
          classification: "SAMPLE",
        }),
      ]);
      const fulfilled = results.filter(
        (result) => result.status === "fulfilled"
      );
      const rejected = results.filter((result) => result.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const reason =
        rejected[0]?.status === "rejected" ? rejected[0].reason : null;
      expect(isCanonicalTemplateError(reason)).toBe(true);
      if (isCanonicalTemplateError(reason)) {
        expect(reason.code).toBe("conflict");
        expect(reason.message).toContain("already has an active sample");
      }
      expect(
        await getPrisma().guideTemplate.count({
          where: {
            serviceCategory: "PHYSIOTHERAPY",
            isSample: true,
            isActive: true,
          },
        })
      ).toBe(1);
    });
  });

  it("replaces a sample without deleting history or reactivating the previous one", async () => {
    await withSampleCategoryLock(["CHIROPRACTIC"], async () => {
      const first = await createCanonicalTemplate({
        actorUserId: OPERATOR_ID,
        title: "Old chiropractic sample",
        slug: "csm-chiro-old",
        serviceCategory: "CHIROPRACTIC",
        classification: "SAMPLE",
      });
      await publishIntro(first);
      await deactivateCanonicalTemplate({
        templateId: first.templateId,
        actorUserId: OPERATOR_ID,
      });
      const retired = await getPrisma().guideTemplate.findUniqueOrThrow({
        where: { id: first.templateId },
        include: { revisions: true },
      });
      expect(retired.isActive).toBe(false);
      expect(retired.isSample).toBe(true);
      expect(retired.revisions.map((revision) => revision.status)).toEqual([
        GuideRevisionStatus.PUBLISHED,
      ]);

      const replacement = await createCanonicalTemplate({
        actorUserId: OPERATOR_ID,
        title: "New chiropractic sample",
        slug: "csm-chiro-new",
        serviceCategory: "CHIROPRACTIC",
        classification: "SAMPLE",
      });
      await publishIntro(replacement);

      const error = await expectCanonicalCode(
        reactivateCanonicalTemplate({
          templateId: first.templateId,
          actorUserId: OPERATOR_ID,
        }),
        "conflict"
      );
      if (error instanceof Error) {
        expect(error.message).toBe(
          "Chiropractic already has an active sample: New chiropractic sample."
        );
      }
      const stillRetired = await getPrisma().guideTemplate.findUniqueOrThrow({
        where: { id: first.templateId },
        include: { revisions: true },
      });
      expect(stillRetired.isActive).toBe(false);
      expect(stillRetired.revisions).toHaveLength(1);
      expect(stillRetired.revisions[0]?.version).toBe(1);
      expect(stillRetired.revisions[0]?.status).toBe(
        GuideRevisionStatus.PUBLISHED
      );

      await deactivateCanonicalTemplates({
        actorUserId: OPERATOR_ID,
        templateIds: [replacement.templateId],
      });
      await reactivateCanonicalTemplates({
        actorUserId: OPERATOR_ID,
        templateIds: [first.templateId],
      });
      const restored = await getPrisma().guideTemplate.findUniqueOrThrow({
        where: { id: first.templateId },
      });
      const replacementRow = await getPrisma().guideTemplate.findUniqueOrThrow({
        where: { id: replacement.templateId },
      });
      expect(restored.isActive).toBe(true);
      expect(replacementRow.isActive).toBe(false);
    });
  });

  it("changes classification only before the first publication", async () => {
    await withSampleCategoryLock(["COSMETIC_AESTHETIC"], async () => {
      const created = await createCanonicalTemplate({
        actorUserId: OPERATOR_ID,
        title: "Unpublished cosmetic",
        slug: "csm-cosmetic",
        serviceCategory: "COSMETIC_AESTHETIC",
        classification: "PRODUCTION",
      });
      await updateCanonicalTemplateMetadata({
        actorUserId: OPERATOR_ID,
        templateId: created.templateId,
        classification: "SAMPLE",
      });
      expect(
        (
          await getPrisma().guideTemplate.findUniqueOrThrow({
            where: { id: created.templateId },
          })
        ).isSample
      ).toBe(true);

      await expectCanonicalCode(
        createCanonicalTemplate({
          actorUserId: OPERATOR_ID,
          title: "Blocked cosmetic sample",
          slug: "csm-cosmetic-blocked",
          serviceCategory: "COSMETIC_AESTHETIC",
          classification: "SAMPLE",
        }),
        "conflict"
      );

      await updateCanonicalTemplateMetadata({
        actorUserId: OPERATOR_ID,
        templateId: created.templateId,
        classification: "PRODUCTION",
      });
      const sample = await createCanonicalTemplate({
        actorUserId: OPERATOR_ID,
        title: "Cosmetic sample",
        slug: "csm-cosmetic-sample",
        serviceCategory: "COSMETIC_AESTHETIC",
        classification: "SAMPLE",
      });
      await publishIntro(sample);
      await expectCanonicalCode(
        updateCanonicalTemplateMetadata({
          actorUserId: OPERATOR_ID,
          templateId: sample.templateId,
          classification: "PRODUCTION",
        }),
        "immutable"
      );
      await updateCanonicalTemplateMetadata({
        actorUserId: OPERATOR_ID,
        templateId: sample.templateId,
        title: "Cosmetic sample renamed",
      });
      const published = await getPrisma().guideTemplate.findUniqueOrThrow({
        where: { id: sample.templateId },
      });
      expect(published).toMatchObject({
        title: "Cosmetic sample renamed",
        slug: "csm-cosmetic-sample",
        serviceCategory: "COSMETIC_AESTHETIC",
        isSample: true,
      });
    });
  });

  it("publishes the next Tooth Extraction revision without changing the published original", async () => {
    await withSampleCategoryLock(["DENTAL"], async () => {
      const prisma = getPrisma();
      const before = await prisma.guideTemplate.findUniqueOrThrow({
        where: { slug: "extraction" },
        include: {
          revisions: {
            orderBy: { version: "asc" },
            include: { sections: sectionInclude },
          },
          practiceGuides: {
            select: { id: true, pinnedRevisionId: true, guideTemplateId: true },
          },
        },
      });
      expect(before.isSample).toBe(true);
      expect(before.serviceCategory).toBe("DENTAL");
      const originalRevisionIds = before.revisions.map(
        (revision) => revision.id
      );
      const publishedBefore = before.revisions.filter(
        (revision) => revision.status === GuideRevisionStatus.PUBLISHED
      );
      expect(publishedBefore.length).toBeGreaterThan(0);
      const signatures = new Map(
        publishedBefore.map((revision) => [
          revision.id,
          canonicalContentSignature(revision.sections),
        ])
      );

      try {
        expect(
          before.revisions.some(
            (revision) => revision.status === GuideRevisionStatus.DRAFT
          )
        ).toBe(false);
        const draft = await createCanonicalTemplateDraft({
          templateId: before.id,
          actorUserId: OPERATOR_ID,
        });
        expect(draft.version).toBe(
          Math.max(...before.revisions.map((revision) => revision.version)) + 1
        );
        const stored = await prisma.guideTemplateSection.findMany({
          where: { revisionId: draft.revisionId },
          ...sectionInclude,
        });
        expect(stored.length).toBeGreaterThan(0);
        const sections = stored.map((section) => ({
          key: section.key,
          kind: section.kind,
          title: section.title,
          body:
            section.sortOrder === stored[0]?.sortOrder
              ? `${section.body}\nSynthetic sample draft note.`
              : section.body,
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
        }));
        await saveCanonicalTemplateDraft({
          templateId: before.id,
          revisionId: draft.revisionId,
          actorUserId: OPERATOR_ID,
          sections,
        });
        await publishCanonicalTemplateRevision({
          templateId: before.id,
          revisionId: draft.revisionId,
          actorUserId: OPERATOR_ID,
          expectedVersion: draft.version,
        });

        const during = await prisma.guideTemplate.findUniqueOrThrow({
          where: { id: before.id },
          include: {
            revisions: {
              orderBy: { version: "asc" },
              include: { sections: sectionInclude },
            },
          },
        });
        expect(during.id).toBe(before.id);
        expect(during.slug).toBe("extraction");
        expect(during.isSample).toBe(true);
        for (const revision of publishedBefore) {
          const current = during.revisions.find(
            (item) => item.id === revision.id
          );
          expect(current?.status).toBe(GuideRevisionStatus.PUBLISHED);
          expect(current?.version).toBe(revision.version);
          expect(canonicalContentSignature(current?.sections ?? [])).toBe(
            signatures.get(revision.id)
          );
        }
        const publishedNext = during.revisions.find(
          (revision) => revision.id === draft.revisionId
        );
        expect(publishedNext?.status).toBe(GuideRevisionStatus.PUBLISHED);
        expect(
          canonicalContentSignature(publishedNext?.sections ?? [])
        ).not.toBe(signatures.get(publishedBefore[0]?.id ?? ""));
      } finally {
        await prisma.guideTemplateRevision.deleteMany({
          where: {
            guideTemplateId: before.id,
            id: { notIn: originalRevisionIds },
          },
        });
        const after = await prisma.guideTemplate.findUniqueOrThrow({
          where: { id: before.id },
          include: {
            revisions: { orderBy: { version: "asc" } },
            practiceGuides: {
              select: {
                id: true,
                pinnedRevisionId: true,
                guideTemplateId: true,
              },
            },
          },
        });
        expect(after).toMatchObject({
          id: before.id,
          slug: before.slug,
          title: before.title,
          serviceCategory: before.serviceCategory,
          isSample: true,
          isActive: before.isActive,
        });
        expect(after.revisions.map((revision) => revision.id)).toEqual(
          originalRevisionIds
        );
        expect(after.practiceGuides).toEqual(before.practiceGuides);
      }
    });
  });

  it("keeps samples out of production adoption and guide allowances", async () => {
    const extraction = await getPrisma().guideTemplate.findUniqueOrThrow({
      where: { slug: "extraction" },
    });
    const production = await createCanonicalTemplate({
      actorUserId: OPERATOR_ID,
      title: "Production dental",
      slug: "csm-prod-dental",
      serviceCategory: "DENTAL",
    });
    await publishIntro(production);

    const listed = await listCanonicalGuideTemplates(CLINIC_ID);
    expect(listed.isDemoTenant).toBe(false);
    expect(listed.templates.map((template) => template.id)).toContain(
      production.templateId
    );
    expect(listed.templates.map((template) => template.id)).not.toContain(
      extraction.id
    );

    const customBefore = await countOriginalCustomGuides(
      getPrisma(),
      CLINIC_ID
    );
    const adaptedBefore = await countAdaptedTemplateGuides(
      getPrisma(),
      CLINIC_ID
    );
    await expect(
      createPracticeGuideFromTemplate({
        clinicId: CLINIC_ID,
        actorUserId: ADMIN_ID,
        values: { templateId: extraction.id },
      })
    ).rejects.toSatisfy(
      (error: unknown) =>
        isClinicPortalError(error) && error.code === "not_found"
    );
    expect(await countOriginalCustomGuides(getPrisma(), CLINIC_ID)).toBe(
      customBefore
    );
    expect(await countAdaptedTemplateGuides(getPrisma(), CLINIC_ID)).toBe(
      adaptedBefore
    );

    const enabled = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      actorUserId: ADMIN_ID,
      values: {
        templateId: production.templateId,
        publicSlug: "csm-prod-guide",
      },
    });
    const guide = await getPrisma().practiceGuide.findUniqueOrThrow({
      where: { id: enabled.id },
    });
    expect(guide.guideTemplateId).toBe(production.templateId);
    expect(await countOriginalCustomGuides(getPrisma(), CLINIC_ID)).toBe(
      customBefore
    );
    expect(await countAdaptedTemplateGuides(getPrisma(), CLINIC_ID)).toBe(
      adaptedBefore
    );

    const demo = await getPrisma().clinic.findUnique({
      where: { slug: "demodental" },
    });
    expect(demo).not.toBeNull();
    if (demo) {
      const demoList = await listCanonicalGuideTemplates(demo.id);
      expect(demoList.isDemoTenant).toBe(true);
      expect(demoList.templates.map((template) => template.id)).toContain(
        extraction.id
      );
      const demoGuide = demoList.templates.find(
        (template) => template.id === extraction.id
      );
      expect(demoGuide?.availability).toBe("sample");
    }
  });

  it("enforces sample uniqueness and publication rules in bulk", async () => {
    await withSampleCategoryLock(
      ["PHYSIOTHERAPY", "COSMETIC_AESTHETIC"] as ServiceCategory[],
      async () => {
        const sample = await createCanonicalTemplate({
          actorUserId: OPERATOR_ID,
          title: "Bulk physio sample",
          slug: "csm-bulk-sample",
          serviceCategory: "PHYSIOTHERAPY",
          classification: "SAMPLE",
        });
        const production = await createCanonicalTemplate({
          actorUserId: OPERATOR_ID,
          title: "Bulk physio production",
          slug: "csm-bulk-prod",
          serviceCategory: "PHYSIOTHERAPY",
        });
        await saveCanonicalTemplateDraft({
          templateId: sample.templateId,
          revisionId: sample.revisionId,
          actorUserId: OPERATOR_ID,
          sections: [intro],
        });
        await saveCanonicalTemplateDraft({
          templateId: production.templateId,
          revisionId: production.revisionId,
          actorUserId: OPERATOR_ID,
          sections: [intro],
        });
        const published = await publishCanonicalTemplates({
          actorUserId: OPERATOR_ID,
          templates: [
            {
              templateId: sample.templateId,
              revisionId: sample.revisionId,
              expectedVersion: 1,
            },
            {
              templateId: production.templateId,
              revisionId: production.revisionId,
              expectedVersion: 1,
            },
          ],
        });
        expect(published.count).toBe(2);

        const disposable = await createCanonicalTemplate({
          actorUserId: OPERATOR_ID,
          title: "Disposable cosmetic sample",
          slug: "csm-bulk-delete",
          serviceCategory: "COSMETIC_AESTHETIC",
          classification: "SAMPLE",
        });
        await deleteNeverPublishedCanonicalTemplates({
          actorUserId: OPERATOR_ID,
          templateIds: [disposable.templateId],
        });
        expect(
          await getPrisma().guideTemplate.findUnique({
            where: { id: disposable.templateId },
          })
        ).toBeNull();

        await deactivateCanonicalTemplates({
          actorUserId: OPERATOR_ID,
          templateIds: [sample.templateId],
        });
        const successor = await createCanonicalTemplate({
          actorUserId: OPERATOR_ID,
          title: "Successor physio sample",
          slug: "csm-bulk-successor",
          serviceCategory: "PHYSIOTHERAPY",
          classification: "SAMPLE",
        });
        await expect(
          reactivateCanonicalTemplates({
            actorUserId: OPERATOR_ID,
            templateIds: [sample.templateId],
          })
        ).rejects.toSatisfy((error: unknown) => {
          return (
            isBulkCanonicalTemplateError(error) &&
            error.message.includes("Nothing was changed.") &&
            error.message.includes("already has an active sample")
          );
        });
        const blocked = await getPrisma().guideTemplate.findUniqueOrThrow({
          where: { id: sample.templateId },
        });
        expect(blocked.isActive).toBe(false);
        expect(
          (
            await getPrisma().guideTemplate.findUniqueOrThrow({
              where: { id: successor.templateId },
            })
          ).isActive
        ).toBe(true);
      }
    );
  });
});
