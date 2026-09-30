import "dotenv/config";

import { readFileSync } from "node:fs";

import { GuideRevisionStatus } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createCanonicalTemplate } from "@/lib/canonical-templates/create-canonical-template";
import {
  isBulkCanonicalTemplateError,
  isCanonicalTemplateError,
} from "@/lib/canonical-templates/errors";
import {
  deactivateCanonicalTemplates,
  deleteNeverPublishedCanonicalTemplates,
  publishCanonicalTemplates,
  reactivateCanonicalTemplates,
} from "@/lib/canonical-templates/bulk-canonical-template-lifecycle";
import { publishCanonicalTemplateRevision } from "@/lib/canonical-templates/publish-canonical-template-revision";
import { saveCanonicalTemplateDraft } from "@/lib/canonical-templates/save-canonical-template-draft";
import { getPrisma } from "@/lib/prisma";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const describeDb = hasDatabase ? describe : describe.skip;

const OPERATOR_ID = "cbulk_operator";

const intro = {
  key: "introduction",
  kind: "INTRODUCTION" as const,
  title: "After treatment",
  body: "Rest and follow the practice instructions.",
};

async function cleanup() {
  const prisma = getPrisma();
  await prisma.guideTemplate.deleteMany({
    where: { slug: { startsWith: "cbulk-" } },
  });
  await prisma.user.deleteMany({
    where: { email: { endsWith: "@cbulk.example.test" } },
  });
}

async function seedOperator() {
  await getPrisma().user.create({
    data: {
      id: OPERATOR_ID,
      email: "operator@cbulk.example.test",
      name: "Bulk Operator",
      platformRole: "OPERATOR",
    },
  });
}

async function draftTemplate(slug: string, title: string, withSection = true) {
  const created = await createCanonicalTemplate({
    actorUserId: OPERATOR_ID,
    title,
    slug,
    serviceCategory: "DENTAL",
  });
  if (withSection) {
    await saveCanonicalTemplateDraft({
      templateId: created.templateId,
      revisionId: created.revisionId,
      actorUserId: OPERATOR_ID,
      sections: [intro],
    });
  }
  return created;
}

async function revisionStatus(revisionId: string) {
  const revision = await getPrisma().guideTemplateRevision.findUnique({
    where: { id: revisionId },
    select: { status: true },
  });
  return revision?.status ?? null;
}

describe("canonical template bulk lifecycle contracts", () => {
  it("publishes through the existing lifecycle service and does not add unpublish", () => {
    const source = readFileSync(
      "lib/canonical-templates/bulk-canonical-template-lifecycle.ts",
      "utf8"
    );
    expect(source).toContain("publishCanonicalTemplateRevisionInTransaction");
    expect(source).toContain("deactivateCanonicalTemplateInTransaction");
    expect(source).toContain("reactivateCanonicalTemplateInTransaction");
    expect(source).toContain("abandonCanonicalTemplateDraftInTransaction");
    expect(source).toContain("[...templateIds].sort()");
    expect(source).not.toContain("guideTemplateRevision.update");
    expect(source).not.toContain("guideTemplate.delete");
    expect(source).not.toMatch(/Unpublish/);
  });
});

describeDb("canonical template bulk lifecycle", () => {
  beforeEach(async () => {
    await cleanup();
    await seedOperator();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("publishes every selected draft or writes nothing", async () => {
    const alpha = await draftTemplate("cbulk-alpha", "Alpha draft");
    const beta = await draftTemplate("cbulk-beta", "Beta draft");
    const empty = await draftTemplate("cbulk-empty", "Empty draft", false);

    const published = await publishCanonicalTemplates({
      actorUserId: OPERATOR_ID,
      templates: [
        {
          templateId: beta.templateId,
          revisionId: beta.revisionId,
          expectedVersion: 1,
        },
        {
          templateId: alpha.templateId,
          revisionId: alpha.revisionId,
          expectedVersion: 1,
        },
      ],
    });
    expect(published.count).toBe(2);
    expect(await revisionStatus(alpha.revisionId)).toBe(
      GuideRevisionStatus.PUBLISHED
    );
    expect(await revisionStatus(beta.revisionId)).toBe(
      GuideRevisionStatus.PUBLISHED
    );

    await expect(
      publishCanonicalTemplateRevision({
        templateId: alpha.templateId,
        revisionId: alpha.revisionId,
        actorUserId: OPERATOR_ID,
        expectedVersion: 1,
      })
    ).rejects.toSatisfy((error: unknown) => {
      return isCanonicalTemplateError(error) && error.code === "immutable";
    });

    await expect(
      publishCanonicalTemplates({
        actorUserId: OPERATOR_ID,
        templates: [
          {
            templateId: empty.templateId,
            revisionId: empty.revisionId,
            expectedVersion: 1,
          },
          {
            templateId: alpha.templateId,
            revisionId: alpha.revisionId,
            expectedVersion: 1,
          },
        ],
      })
    ).rejects.toSatisfy((error: unknown) => {
      return (
        isBulkCanonicalTemplateError(error) &&
        error.message.startsWith("Nothing was changed.") &&
        error.message.includes("Empty draft") &&
        !error.message.includes("Prisma")
      );
    });
    expect(await revisionStatus(empty.revisionId)).toBe(
      GuideRevisionStatus.DRAFT
    );
  });

  it("rejects a stale draft version before publishing the rest", async () => {
    const ready = await draftTemplate("cbulk-ready", "Ready draft");
    const stale = await draftTemplate("cbulk-stale", "Stale draft");
    await expect(
      publishCanonicalTemplates({
        actorUserId: OPERATOR_ID,
        templates: [
          {
            templateId: ready.templateId,
            revisionId: ready.revisionId,
            expectedVersion: 1,
          },
          {
            templateId: stale.templateId,
            revisionId: stale.revisionId,
            expectedVersion: 9,
          },
        ],
      })
    ).rejects.toSatisfy(
      (error: unknown) =>
        isBulkCanonicalTemplateError(error) &&
        error.message.includes("Stale draft")
    );
    expect(await revisionStatus(ready.revisionId)).toBe(
      GuideRevisionStatus.DRAFT
    );
    expect(await revisionStatus(stale.revisionId)).toBe(
      GuideRevisionStatus.DRAFT
    );
  });

  it("leaves a sample and a valid template unpublished together", async () => {
    const ready = await draftTemplate("cbulk-prod", "Production draft");
    const sample = await getPrisma().guideTemplate.create({
      data: {
        title: "Synthetic sample",
        slug: "cbulk-sample",
        serviceCategory: "DENTAL",
        isSample: true,
        isActive: true,
        revisions: {
          create: {
            version: 1,
            status: "DRAFT",
            createdByUserId: OPERATOR_ID,
            sections: {
              create: {
                key: "introduction",
                kind: "INTRODUCTION",
                title: "After treatment",
                body: "Rest.",
                sortOrder: 1,
              },
            },
          },
        },
      },
      include: { revisions: true },
    });
    const sampleRevision = sample.revisions[0];
    expect(sampleRevision).toBeTruthy();
    await expect(
      publishCanonicalTemplates({
        actorUserId: OPERATOR_ID,
        templates: [
          {
            templateId: ready.templateId,
            revisionId: ready.revisionId,
            expectedVersion: 1,
          },
          {
            templateId: sample.id,
            revisionId: sampleRevision?.id ?? "",
            expectedVersion: 1,
          },
        ],
      })
    ).rejects.toSatisfy(
      (error: unknown) =>
        isBulkCanonicalTemplateError(error) &&
        error.message.includes("Synthetic sample") &&
        error.message.includes("Nothing was changed.")
    );
    expect(await revisionStatus(ready.revisionId)).toBe(
      GuideRevisionStatus.DRAFT
    );
    expect(await revisionStatus(sampleRevision?.id ?? "")).toBe(
      GuideRevisionStatus.DRAFT
    );
    expect(
      (
        await getPrisma().guideTemplate.findUniqueOrThrow({
          where: { id: sample.id },
        })
      ).isSample
    ).toBe(true);
  });

  it("deactivates and reactivates active production templates without deleting revisions", async () => {
    const first = await draftTemplate("cbulk-off", "First published");
    const second = await draftTemplate("cbulk-on", "Second published");
    await publishCanonicalTemplates({
      actorUserId: OPERATOR_ID,
      templates: [first, second].map((template) => ({
        templateId: template.templateId,
        revisionId: template.revisionId,
        expectedVersion: 1,
      })),
    });

    const deactivated = await deactivateCanonicalTemplates({
      actorUserId: OPERATOR_ID,
      templateIds: [first.templateId, second.templateId],
    });
    expect(deactivated.count).toBe(2);
    const stored = await getPrisma().guideTemplate.findMany({
      where: { id: { in: [first.templateId, second.templateId] } },
      include: { revisions: true },
    });
    expect(stored.every((template) => template.isActive === false)).toBe(true);
    expect(
      stored.every(
        (template) =>
          template.revisions[0]?.status === GuideRevisionStatus.PUBLISHED
      )
    ).toBe(true);

    await expect(
      deactivateCanonicalTemplates({
        actorUserId: OPERATOR_ID,
        templateIds: [first.templateId],
      })
    ).rejects.toSatisfy(
      (error: unknown) =>
        isBulkCanonicalTemplateError(error) &&
        error.message.includes("First published") &&
        error.message.includes("Nothing was changed.")
    );

    const reactivated = await reactivateCanonicalTemplates({
      actorUserId: OPERATOR_ID,
      templateIds: [second.templateId, first.templateId],
    });
    expect(reactivated.count).toBe(2);
    const active = await getPrisma().guideTemplate.findMany({
      where: { id: { in: [first.templateId, second.templateId] } },
    });
    expect(active.every((template) => template.isActive)).toBe(true);
    expect(active.every((template) => template.deactivatedAt === null)).toBe(
      true
    );
  });

  it("deletes never-published templates and refuses any published template", async () => {
    const unpublished = await draftTemplate(
      "cbulk-new",
      "Never published",
      false
    );
    const other = await draftTemplate("cbulk-other", "Also new", false);
    const published = await draftTemplate("cbulk-kept", "Keep history");
    await publishCanonicalTemplates({
      actorUserId: OPERATOR_ID,
      templates: [
        {
          templateId: published.templateId,
          revisionId: published.revisionId,
          expectedVersion: 1,
        },
      ],
    });

    await expect(
      deleteNeverPublishedCanonicalTemplates({
        actorUserId: OPERATOR_ID,
        templateIds: [unpublished.templateId, published.templateId],
      })
    ).rejects.toSatisfy(
      (error: unknown) =>
        isBulkCanonicalTemplateError(error) &&
        error.message.includes("Keep history") &&
        error.message.includes("published revision") &&
        error.message.startsWith("Nothing was changed.")
    );
    expect(
      await getPrisma().guideTemplate.findUnique({
        where: { id: unpublished.templateId },
      })
    ).not.toBeNull();
    expect(await revisionStatus(published.revisionId)).toBe(
      GuideRevisionStatus.PUBLISHED
    );

    const deleted = await deleteNeverPublishedCanonicalTemplates({
      actorUserId: OPERATOR_ID,
      templateIds: [other.templateId, unpublished.templateId],
    });
    expect(deleted.count).toBe(2);
    expect(
      await getPrisma().guideTemplate.findMany({
        where: {
          id: { in: [other.templateId, unpublished.templateId] },
        },
      })
    ).toEqual([]);
    expect(
      await getPrisma().guideTemplate.findUnique({
        where: { id: published.templateId },
      })
    ).not.toBeNull();
  });
});
