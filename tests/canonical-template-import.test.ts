import "dotenv/config";

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { GuideRevisionStatus } from "@prisma/client";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createCanonicalTemplate } from "@/lib/canonical-templates/create-canonical-template";
import { publishCanonicalTemplateRevision } from "@/lib/canonical-templates/publish-canonical-template-revision";
import {
  canonicalDraftSectionWriter,
  saveCanonicalTemplateDraft,
} from "@/lib/canonical-templates/save-canonical-template-draft";
import {
  importCanonicalTemplateDraft,
  importCanonicalTemplateFiles,
} from "@/lib/canonical-templates/import/import-canonical-template-draft";
import { IMPORT_SAMPLE_REFUSAL } from "@/lib/canonical-templates/import/messages";
import { listCanonicalGuideTemplates } from "@/lib/clinic-portal/list-canonical-templates";
import { ensurePrimarySiteForClinic } from "@/lib/clinics/primary-site-location.mjs";
import { assignPrimarySiteServiceCategories } from "@/lib/clinics/site-service-categories";
import { getPrisma } from "@/lib/prisma";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const describeDb = hasDatabase ? describe : describe.skip;

const OPERATOR_ID = "cti_operator";
const STAFF_ID = "cti_staff";
const CLINIC_ID = "cti_clinic";
const OPERATOR_EMAIL = "operator@cti.example.test";
const STAFF_EMAIL = "staff@cti.example.test";

function section(
  body = "Synthetic placeholder copy. This is not clinical guidance."
) {
  return {
    key: "introduction",
    kind: "INTRODUCTION" as const,
    title: "Placeholder introduction",
    body,
  };
}

function payload(input: {
  mode?: "create" | "create-revision" | "update-draft";
  slug?: string;
  title?: string | null;
  serviceCategory?: string;
  sections?: unknown[];
}) {
  const template: Record<string, unknown> = {
    slug: input.slug ?? "cti-example",
    serviceCategory: input.serviceCategory ?? "PHYSIOTHERAPY",
  };
  if (input.title !== null) {
    template.title = input.title ?? "Example placeholder template";
  }
  return {
    schemaVersion: 1,
    mode: input.mode ?? "create",
    template,
    revision: {
      sections: input.sections ?? [section()],
    },
  };
}

async function cleanup() {
  const prisma = getPrisma();
  await prisma.clinic.deleteMany({ where: { id: CLINIC_ID } });
  await prisma.guideTemplate.deleteMany({
    where: { slug: { startsWith: "cti-" } },
  });
  await prisma.user.deleteMany({
    where: { email: { endsWith: "@cti.example.test" } },
  });
}

async function seedActors() {
  const prisma = getPrisma();
  await prisma.user.create({
    data: {
      id: OPERATOR_ID,
      email: OPERATOR_EMAIL,
      name: "River Operator",
      platformRole: "OPERATOR",
    },
  });
  await prisma.user.create({
    data: {
      id: STAFF_ID,
      email: STAFF_EMAIL,
      name: "Clinic Staff",
      platformRole: "NONE",
    },
  });
}

async function snapshotTemplate(slug: string) {
  return getPrisma().guideTemplate.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true,
      slug: true,
      serviceCategory: true,
      isSample: true,
      isActive: true,
      updatedAt: true,
      revisions: {
        orderBy: { version: "asc" },
        select: {
          id: true,
          version: true,
          status: true,
          updatedAt: true,
          reviewerName: true,
          reviewedAt: true,
          reviewRecordedByUserId: true,
          publishedAt: true,
          publishedByUserId: true,
          sections: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              key: true,
              body: true,
              sortOrder: true,
            },
          },
        },
      },
    },
  });
}

async function publishSynthetic(
  slug: string,
  sections = [section("Published placeholder copy.")]
) {
  const created = await createCanonicalTemplate({
    actorUserId: OPERATOR_ID,
    title: "Example placeholder template",
    slug,
    serviceCategory: "PHYSIOTHERAPY",
  });
  await saveCanonicalTemplateDraft({
    templateId: created.templateId,
    revisionId: created.revisionId,
    actorUserId: OPERATOR_ID,
    sections,
  });
  await publishCanonicalTemplateRevision({
    actorUserId: OPERATOR_ID,
    templateId: created.templateId,
    revisionId: created.revisionId,
    expectedVersion: 1,
  });
  return created;
}

describeDb("canonical template draft import", () => {
  beforeEach(async () => {
    await cleanup();
    await seedActors();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (hasDatabase) {
      await cleanup();
    }
  });

  it("dry-run writes nothing", async () => {
    const before = await snapshotTemplate("cti-dry");
    const report = await importCanonicalTemplateDraft({
      payload: payload({ slug: "cti-dry" }),
      apply: false,
    });
    expect(report.outcome).toBe("valid");
    expect(report.schemaValid).toBe(true);
    expect(report.mode).toBe("create");
    expect(report.templateExists).toBe(false);
    expect(report.openDraftExists).toBe(false);
    expect(report.latestPublishedVersion).toBeNull();
    expect(report.intendedDraftVersion).toBe(1);
    expect(report.sectionCount).toBe(1);
    expect(await snapshotTemplate("cti-dry")).toEqual(before);
  });

  it("apply creates an unreviewed unpublished draft and stores the operator", async () => {
    const report = await importCanonicalTemplateDraft({
      payload: payload({ slug: "cti-create" }),
      apply: true,
      operatorEmail: OPERATOR_EMAIL,
    });
    expect(report.outcome).toBe("applied");
    expect(report.draftVersion).toBe(1);
    expect(report.reviewCleared).toBe(false);
    expect(report.reviewKept).toBe(false);

    const template = await snapshotTemplate("cti-create");
    expect(template?.isSample).toBe(false);
    expect(template?.serviceCategory).toBe("PHYSIOTHERAPY");
    const revision = template?.revisions[0];
    expect(revision?.status).toBe(GuideRevisionStatus.DRAFT);
    expect(revision?.version).toBe(1);
    const stored = await getPrisma().guideTemplateRevision.findUniqueOrThrow({
      where: { id: revision?.id },
    });
    expect(stored.createdByUserId).toBe(OPERATOR_ID);
    expect(stored.status).toBe(GuideRevisionStatus.DRAFT);
    expect(stored.reviewerName).toBeNull();
    expect(stored.reviewerCredential).toBeNull();
    expect(stored.reviewNote).toBeNull();
    expect(stored.reviewedAt).toBeNull();
    expect(stored.reviewRecordedByUserId).toBeNull();
    expect(stored.publishedAt).toBeNull();
    expect(stored.publishedByUserId).toBeNull();
    expect(revision?.sections[0]?.body).toContain("Synthetic placeholder");
  });

  it("does not show an imported draft in clinic discovery", async () => {
    await importCanonicalTemplateDraft({
      payload: payload({
        slug: "cti-hidden",
        serviceCategory: "PHYSIOTHERAPY",
      }),
      apply: true,
      operatorEmail: OPERATOR_EMAIL,
    });
    const visible = await publishSynthetic("cti-visible");
    const prisma = getPrisma();
    await prisma.clinic.create({
      data: {
        id: CLINIC_ID,
        name: "Import Discovery Clinic",
        slug: "cti-clinic",
        memberships: { create: { userId: STAFF_ID, role: "ADMIN" } },
      },
    });
    await ensurePrimarySiteForClinic(prisma, CLINIC_ID);
    await assignPrimarySiteServiceCategories(prisma, CLINIC_ID, [
      "PHYSIOTHERAPY",
    ]);
    const listed = await listCanonicalGuideTemplates(CLINIC_ID);
    expect(listed.templates.map((item) => item.slug)).toContain("cti-visible");
    expect(listed.templates.map((item) => item.slug)).not.toContain(
      "cti-hidden"
    );
    expect(visible.templateId).toBeTruthy();
  });

  it("fails a duplicate slug and a content error without a partial template", async () => {
    await importCanonicalTemplateDraft({
      payload: payload({ slug: "cti-dup" }),
      apply: true,
      operatorEmail: OPERATOR_EMAIL,
    });
    const duplicate = await importCanonicalTemplateDraft({
      payload: payload({ slug: "cti-dup" }),
      apply: true,
      operatorEmail: OPERATOR_EMAIL,
    });
    expect(duplicate.outcome).toBe("invalid");
    expect(duplicate.lifecycleConflicts.join("\n")).toContain("already exists");
    expect((await snapshotTemplate("cti-dup"))?.revisions).toHaveLength(1);

    const invalid = await importCanonicalTemplateDraft({
      payload: payload({
        slug: "cti-overlap",
        sections: [
          {
            key: "first-window",
            kind: "RECOVERY_TIMELINE",
            title: "Placeholder window",
            body: "Synthetic timeline stage. Not a treatment instruction.",
            startDay: 0,
            endDay: 2,
          },
          {
            key: "next-window",
            kind: "RECOVERY_TIMELINE",
            title: "Next placeholder window",
            body: "Synthetic timeline stage. Not a treatment instruction.",
            startDay: 2,
            endDay: 4,
          },
        ],
      }),
      apply: true,
      operatorEmail: OPERATOR_EMAIL,
    });
    expect(invalid.outcome).toBe("invalid");
    expect(await snapshotTemplate("cti-overlap")).toBeNull();
  });

  it("requires an Operator and rejects other actors before writing", async () => {
    const missing = await importCanonicalTemplateDraft({
      payload: payload({ slug: "cti-actor" }),
      apply: true,
    });
    expect(missing.outcome).toBe("invalid");
    expect(missing.validationErrors.join("\n")).toContain("--operator-email");

    const staff = await importCanonicalTemplateDraft({
      payload: payload({ slug: "cti-actor" }),
      apply: true,
      operatorEmail: STAFF_EMAIL,
    });
    expect(staff.outcome).toBe("invalid");
    expect(staff.validationErrors.join("\n")).toContain("not an Operator");

    const absent = await importCanonicalTemplateDraft({
      payload: payload({ slug: "cti-actor" }),
      apply: true,
      operatorEmail: "nobody@cti.example.test",
    });
    expect(absent.outcome).toBe("invalid");
    expect(absent.validationErrors.join("\n")).toContain("No user exists");
    expect(await snapshotTemplate("cti-actor")).toBeNull();
  });

  it("create-revision fills the next draft and leaves the published revision unchanged", async () => {
    const created = await publishSynthetic("cti-next");
    const before = await snapshotTemplate("cti-next");
    const published = before?.revisions[0];
    const report = await importCanonicalTemplateDraft({
      payload: payload({
        mode: "create-revision",
        slug: "cti-next",
        sections: [section("Imported placeholder draft.")],
      }),
      apply: true,
      operatorEmail: OPERATOR_EMAIL,
    });
    expect(report.outcome).toBe("applied");
    expect(report.draftVersion).toBe(2);
    expect(report.reviewKept).toBe(false);

    const after = await snapshotTemplate("cti-next");
    const stillPublished = after?.revisions.find(
      (revision) => revision.id === published?.id
    );
    expect(stillPublished?.status).toBe(GuideRevisionStatus.PUBLISHED);
    expect(stillPublished?.version).toBe(1);
    expect(stillPublished?.sections.map((item) => item.id)).toEqual(
      published?.sections.map((item) => item.id)
    );
    expect(stillPublished?.sections[0]?.body).toBe(
      "Published placeholder copy."
    );
    expect(stillPublished?.publishedAt).toEqual(published?.publishedAt);
    const draft = after?.revisions.find(
      (revision) => revision.status === GuideRevisionStatus.DRAFT
    );
    expect(draft?.version).toBe(2);
    expect(draft?.sections[0]?.body).toBe("Imported placeholder draft.");
    const stored = await getPrisma().guideTemplateRevision.findUniqueOrThrow({
      where: { id: draft?.id },
    });
    expect(stored.createdByUserId).toBe(OPERATOR_ID);
    expect(stored.reviewerName).toBeNull();
    expect(stored.reviewedAt).toBeNull();
    expect(stored.reviewRecordedByUserId).toBeNull();
    expect(stored.publishedAt).toBeNull();
    expect(stored.publishedByUserId).toBeNull();
    expect(created.revisionId).toBe(published?.id);
  });

  it("refuses create-revision when an open draft exists and refuses a published-only update", async () => {
    await publishSynthetic("cti-open");
    await importCanonicalTemplateDraft({
      payload: payload({
        mode: "create-revision",
        slug: "cti-open",
        sections: [section("First imported draft.")],
      }),
      apply: true,
      operatorEmail: OPERATOR_EMAIL,
    });
    const before = await snapshotTemplate("cti-open");
    const again = await importCanonicalTemplateDraft({
      payload: payload({
        mode: "create-revision",
        slug: "cti-open",
        sections: [section("Should not open another draft.")],
      }),
      apply: true,
      operatorEmail: OPERATOR_EMAIL,
    });
    expect(again.outcome).toBe("invalid");
    expect(again.lifecycleConflicts.join("\n")).toContain("open draft");
    expect(await snapshotTemplate("cti-open")).toEqual(before);

    const publishedOnly = await importCanonicalTemplateDraft({
      payload: payload({
        mode: "update-draft",
        slug: "cti-published-only",
      }),
      apply: false,
    });
    await publishSynthetic("cti-published-only");
    const blocked = await importCanonicalTemplateDraft({
      payload: payload({
        mode: "update-draft",
        slug: "cti-published-only",
        sections: [section("Should not edit the published revision.")],
      }),
      apply: true,
      operatorEmail: OPERATOR_EMAIL,
    });
    expect(blocked.outcome).toBe("invalid");
    expect(blocked.lifecycleConflicts.join("\n")).toContain("create-revision");
    const published = await snapshotTemplate("cti-published-only");
    expect(published?.revisions).toHaveLength(1);
    expect(published?.revisions[0]?.status).toBe(GuideRevisionStatus.PUBLISHED);
    expect(published?.revisions[0]?.sections[0]?.body).toBe(
      "Published placeholder copy."
    );
    expect(publishedOnly.outcome).toBe("invalid");
  });

  it("updates draft content without publishing or clearing historical review", async () => {
    const created = await createCanonicalTemplate({
      actorUserId: OPERATOR_ID,
      title: "Example placeholder template",
      slug: "cti-review",
      serviceCategory: "PHYSIOTHERAPY",
    });
    await saveCanonicalTemplateDraft({
      templateId: created.templateId,
      revisionId: created.revisionId,
      actorUserId: OPERATOR_ID,
      sections: [section("Original placeholder copy.")],
    });
    const historicalReviewedAt = new Date("2026-09-01T00:00:00.000Z");
    await getPrisma().guideTemplateRevision.update({
      where: { id: created.revisionId },
      data: {
        reviewerName: "Dr Ada Example",
        reviewerCredential: "BDS",
        reviewNote: "Historical note.",
        reviewedAt: historicalReviewedAt,
        reviewRecordedByUserId: OPERATOR_ID,
      },
    });

    const dryRun = await importCanonicalTemplateDraft({
      payload: payload({
        mode: "update-draft",
        slug: "cti-review",
        sections: [section("Changed placeholder copy.")],
      }),
      apply: false,
      operatorEmail: OPERATOR_EMAIL,
    });
    expect(dryRun.outcome).toBe("valid");
    expect(dryRun.reviewNotice).toBeNull();
    const stillHistorical =
      await getPrisma().guideTemplateRevision.findUniqueOrThrow({
        where: { id: created.revisionId },
      });
    expect(stillHistorical.reviewedAt?.toISOString()).toBe(
      historicalReviewedAt.toISOString()
    );

    const applied = await importCanonicalTemplateDraft({
      payload: payload({
        mode: "update-draft",
        slug: "cti-review",
        sections: [section("Changed placeholder copy.")],
      }),
      apply: true,
      operatorEmail: OPERATOR_EMAIL,
    });
    expect(applied.outcome).toBe("applied");
    expect(applied.reviewCleared).toBe(false);
    expect(applied.reviewKept).toBe(false);
    expect(applied.reviewNotice).toBeNull();
    const kept = await getPrisma().guideTemplateRevision.findUniqueOrThrow({
      where: { id: created.revisionId },
      include: { sections: true },
    });
    expect(kept.status).toBe(GuideRevisionStatus.DRAFT);
    expect(kept.reviewerName).toBe("Dr Ada Example");
    expect(kept.reviewerCredential).toBe("BDS");
    expect(kept.reviewNote).toBe("Historical note.");
    expect(kept.reviewedAt?.toISOString()).toBe(
      historicalReviewedAt.toISOString()
    );
    expect(kept.reviewRecordedByUserId).toBe(OPERATOR_ID);
    expect(kept.publishedAt).toBeNull();
    expect(kept.publishedByUserId).toBeNull();
    expect(kept.createdByUserId).toBe(OPERATOR_ID);
    expect(kept.sections[0]?.body).toContain("Changed placeholder copy.");
  });

  it("does not change title or service category for an existing template", async () => {
    await publishSynthetic("cti-identity");
    const category = await importCanonicalTemplateDraft({
      payload: payload({
        mode: "create-revision",
        slug: "cti-identity",
        serviceCategory: "DENTAL",
      }),
      apply: true,
      operatorEmail: OPERATOR_EMAIL,
    });
    expect(category.outcome).toBe("invalid");
    expect(category.lifecycleConflicts.join("\n")).toContain("DENTAL");
    const title = await importCanonicalTemplateDraft({
      payload: payload({
        mode: "create-revision",
        slug: "cti-identity",
        title: "Different placeholder title",
      }),
      apply: true,
      operatorEmail: OPERATOR_EMAIL,
    });
    expect(title.outcome).toBe("invalid");
    expect(title.lifecycleConflicts.join("\n")).toContain(
      "does not change the template title"
    );
    const stored = await snapshotTemplate("cti-identity");
    expect(stored?.title).toBe("Example placeholder template");
    expect(stored?.serviceCategory).toBe("PHYSIOTHERAPY");
    expect(stored?.revisions).toHaveLength(1);
  });

  it("refuses sample templates and leaves extraction unchanged", async () => {
    const prisma = getPrisma();
    await prisma.guideTemplate.create({
      data: {
        title: "Synthetic sample",
        slug: "cti-sample",
        serviceCategory: "DENTAL",
        isSample: true,
        revisions: {
          create: {
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            publishedAt: new Date(),
          },
        },
      },
    });
    const beforeSample = await snapshotTemplate("cti-sample");
    for (const mode of ["create", "create-revision", "update-draft"] as const) {
      const report = await importCanonicalTemplateDraft({
        payload: payload({
          mode,
          slug: "cti-sample",
          serviceCategory: "DENTAL",
        }),
        apply: true,
        operatorEmail: OPERATOR_EMAIL,
      });
      expect(report.outcome).toBe("invalid");
      expect(report.lifecycleConflicts).toContain(IMPORT_SAMPLE_REFUSAL);
    }
    expect(await snapshotTemplate("cti-sample")).toEqual(beforeSample);

    const beforeExtraction = await snapshotTemplate("extraction");
    for (const mode of ["create", "create-revision", "update-draft"] as const) {
      const report = await importCanonicalTemplateDraft({
        payload: payload({
          mode,
          slug: "extraction",
          serviceCategory: "DENTAL",
        }),
        apply: true,
        operatorEmail: OPERATOR_EMAIL,
      });
      expect(report.outcome).toBe("invalid");
      expect(report.validationErrors.join("\n")).toContain("extraction");
    }
    expect(await snapshotTemplate("extraction")).toEqual(beforeExtraction);
  });

  it("rolls back a failed create and a failed create-revision in one transaction", async () => {
    const replace = vi
      .spyOn(canonicalDraftSectionWriter, "replace")
      .mockRejectedValueOnce(new Error("section write failed"));
    const created = await importCanonicalTemplateDraft({
      payload: payload({ slug: "cti-atomic" }),
      apply: true,
      operatorEmail: OPERATOR_EMAIL,
    });
    expect(created.outcome).toBe("failed");
    expect(created.failurePersisted).toBe(false);
    expect(created.failureMessage).toContain("section write failed");
    expect(await snapshotTemplate("cti-atomic")).toBeNull();

    replace.mockRestore();
    await publishSynthetic("cti-atomic-next");
    const before = await snapshotTemplate("cti-atomic-next");
    vi.spyOn(canonicalDraftSectionWriter, "replace").mockRejectedValueOnce(
      new Error("section write failed")
    );
    const revised = await importCanonicalTemplateDraft({
      payload: payload({
        mode: "create-revision",
        slug: "cti-atomic-next",
        sections: [section("Should not remain.")],
      }),
      apply: true,
      operatorEmail: OPERATOR_EMAIL,
    });
    expect(revised.outcome).toBe("failed");
    expect(revised.failurePersisted).toBe(false);
    expect(await snapshotTemplate("cti-atomic-next")).toEqual(before);
    expect(before?.revisions).toHaveLength(1);
    expect(before?.revisions[0]?.status).toBe(GuideRevisionStatus.PUBLISHED);
  });

  it("rolls back a failed update-draft without clearing review", async () => {
    const created = await importCanonicalTemplateDraft({
      payload: payload({ slug: "cti-atomic-update" }),
      apply: true,
      operatorEmail: OPERATOR_EMAIL,
    });
    const draftId = (await snapshotTemplate("cti-atomic-update"))?.revisions[0]
      ?.id;
    await getPrisma().guideTemplateRevision.update({
      where: { id: draftId ?? "" },
      data: {
        reviewerName: "Dr Ada Example",
        reviewedAt: new Date("2026-09-01T00:00:00.000Z"),
        reviewRecordedByUserId: OPERATOR_ID,
      },
    });
    const before = await snapshotTemplate("cti-atomic-update");
    vi.spyOn(canonicalDraftSectionWriter, "replace").mockRejectedValueOnce(
      new Error("section write failed")
    );
    const updated = await importCanonicalTemplateDraft({
      payload: payload({
        mode: "update-draft",
        slug: "cti-atomic-update",
        sections: [section("Changed placeholder that must not persist.")],
      }),
      apply: true,
      operatorEmail: OPERATOR_EMAIL,
    });
    expect(updated.outcome).toBe("failed");
    expect(updated.failurePersisted).toBe(false);
    expect(await snapshotTemplate("cti-atomic-update")).toEqual(before);
    expect(before?.revisions[0]?.reviewedAt).not.toBeNull();
    expect(before?.revisions[0]?.publishedAt).toBeNull();
  });

  it("applies a valid file when another file in the directory is invalid", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "cti-batch-"));
    await writeFile(
      path.join(directory, "a-invalid.json"),
      JSON.stringify({ schemaVersion: 2, mode: "publish" })
    );
    await writeFile(
      path.join(directory, "b-valid.json"),
      JSON.stringify(payload({ slug: "cti-batch" }))
    );
    const reports = await importCanonicalTemplateFiles({
      targets: [directory],
      apply: true,
      operatorEmail: OPERATOR_EMAIL,
    });
    expect(
      reports.map((item) => path.basename(item.sourceLabel ?? ""))
    ).toEqual(["a-invalid.json", "b-valid.json"]);
    expect(reports[0]?.outcome).toBe("invalid");
    expect(reports[1]?.outcome).toBe("applied");
    expect((await snapshotTemplate("cti-batch"))?.revisions[0]?.status).toBe(
      GuideRevisionStatus.DRAFT
    );
  });

  it("keeps a successful file when another file's content write rolls back", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "cti-atomic-batch-"));
    await writeFile(
      path.join(directory, "a-fail.json"),
      JSON.stringify(payload({ slug: "cti-batch-fail" }))
    );
    await writeFile(
      path.join(directory, "b-ok.json"),
      JSON.stringify(payload({ slug: "cti-batch-ok" }))
    );
    vi.spyOn(canonicalDraftSectionWriter, "replace").mockRejectedValueOnce(
      new Error("section write failed")
    );
    const reports = await importCanonicalTemplateFiles({
      targets: [directory],
      apply: true,
      operatorEmail: OPERATOR_EMAIL,
    });
    expect(reports.map((item) => item.outcome)).toEqual(["failed", "applied"]);
    expect(await snapshotTemplate("cti-batch-fail")).toBeNull();
    const stored = await snapshotTemplate("cti-batch-ok");
    expect(stored?.revisions).toHaveLength(1);
    expect(stored?.revisions[0]?.status).toBe(GuideRevisionStatus.DRAFT);
    expect(stored?.revisions[0]?.publishedAt).toBeNull();
    expect(stored?.revisions[0]?.reviewedAt).toBeNull();
  });
});
