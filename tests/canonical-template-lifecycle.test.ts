import "dotenv/config";

import { readFileSync } from "node:fs";

import { GuideRevisionStatus, PracticeGuideStatus } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { WORKING_DRAFT_VERSION } from "@/lib/aftercare/practice-revision-document";
import { abandonCanonicalTemplateDraft } from "@/lib/canonical-templates/abandon-canonical-template-draft";
import {
  FUTURE_PRODUCTION_TOOTH_EXTRACTION_SLUG,
  isReservedDemoCanonicalSlug,
} from "@/lib/canonical-templates/constants";
import { canonicalContentSignature } from "@/lib/canonical-templates/content";
import { createCanonicalTemplateDraft } from "@/lib/canonical-templates/create-canonical-template-draft";
import { createCanonicalTemplate } from "@/lib/canonical-templates/create-canonical-template";
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
import {
  createCanonicalTemplateSchema,
  parseCanonicalInput,
  updateCanonicalTemplateMetadataSchema,
} from "@/lib/canonical-templates/schemas";
import {
  deactivateCanonicalTemplate,
  reactivateCanonicalTemplate,
} from "@/lib/canonical-templates/set-canonical-template-activation";
import { updateCanonicalTemplateMetadata } from "@/lib/canonical-templates/update-canonical-template-metadata";
import { createPracticeGuideFromTemplate } from "@/lib/clinic-portal/create-practice-guide";
import { listCanonicalGuideTemplates } from "@/lib/clinic-portal/list-canonical-templates";
import { publishPracticeGuide } from "@/lib/clinic-portal/publish-practice-guide";
import { ensurePrimarySiteForClinic } from "@/lib/clinics/primary-site-location.mjs";
import { assignPrimarySiteServiceCategories } from "@/lib/clinics/site-service-categories";
import { getPrisma } from "@/lib/prisma";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const describeDb = hasDatabase ? describe : describe.skip;

const OPERATOR_ID = "ctl_operator";
const ADMIN_ID = "ctl_admin";
const CLINIC_ID = "ctl_clinic";
const REVIEWER = "Dr Ada Example";

const intro = {
  key: "introduction",
  kind: "INTRODUCTION" as const,
  title: "After treatment",
  body: "Rest and follow the practice instructions.",
};

function planSection(order: Array<"rinse" | "rest"> = ["rinse", "rest"]) {
  const items = {
    rinse: {
      key: "rinse",
      title: "Rinse gently",
      body: "Use the rinse the practice recommended.",
      frequencyCount: 2,
      frequencyPeriod: "DAY" as const,
      timingLabel: "After meals",
      durationValue: 7,
      durationUnit: "DAYS" as const,
    },
    rest: {
      key: "rest",
      title: "Rest the area",
      frequencyCount: 1,
      frequencyPeriod: "DAY" as const,
    },
  };
  return {
    key: "home-care",
    kind: "HOME_CARE_PLAN" as const,
    title: "Home care",
    body: "",
    homeCareInstructions: order.map((key) => items[key]),
  };
}

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
  await prisma.guideTemplate.deleteMany({
    where: { slug: { startsWith: "ctl-" } },
  });
  await prisma.user.deleteMany({
    where: { email: { endsWith: "@ctl.example.test" } },
  });
}

async function seedActors() {
  const prisma = getPrisma();
  await prisma.user.create({
    data: {
      id: OPERATOR_ID,
      email: "operator@ctl.example.test",
      name: "River Operator",
      platformRole: "OPERATOR",
    },
  });
  await prisma.user.create({
    data: {
      id: ADMIN_ID,
      email: "admin@ctl.example.test",
      name: "Clinic Admin",
    },
  });
  await prisma.clinic.create({
    data: {
      id: CLINIC_ID,
      name: "Canonical Lifecycle Clinic",
      slug: "ctl-clinic",
      memberships: {
        create: { userId: ADMIN_ID, role: "ADMIN" },
      },
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
    return;
  }
  throw new Error(`Expected canonical error ${code}.`);
}

describe("canonical template lifecycle contracts", () => {
  it("copies historical reviewer text and enforces one open draft in SQL", () => {
    const sql = readFileSync(
      "prisma/migrations/20260927223000_canonical_template_lifecycle/migration.sql",
      "utf8"
    );
    expect(sql).toContain('SET "reviewerName" = "reviewedBy"');
    expect(sql).toContain('WHERE "reviewedBy" IS NOT NULL');
    expect(sql).toContain("GuideTemplateRevision_one_open_draft_key");
    expect(sql).toContain(`WHERE "status" = 'DRAFT'`);
    expect(sql).toContain("ON DELETE SET NULL");
    expect(sql).toContain("river-aftercare:destructive-reviewed");
    expect(sql).not.toContain("DELETE FROM");
  });

  it("reserves the demo slug and the future production tooth-extraction slug", () => {
    expect(isReservedDemoCanonicalSlug("extraction")).toBe(true);
    expect(FUTURE_PRODUCTION_TOOTH_EXTRACTION_SLUG).toBe("tooth-extraction");
    expect(isReservedDemoCanonicalSlug("tooth-extraction")).toBe(false);
    expect(() =>
      parseCanonicalInput(createCanonicalTemplateSchema, {
        actorUserId: OPERATOR_ID,
        title: "Tooth Extraction",
        slug: "extraction",
        serviceCategory: "DENTAL",
      })
    ).toThrow(/reserved/);
    const metadata = parseCanonicalInput(
      updateCanonicalTemplateMetadataSchema,
      {
        actorUserId: OPERATOR_ID,
        templateId: "template",
        title: "Renamed",
        isSample: true,
      }
    );
    expect(metadata).not.toHaveProperty("isSample");
    expect(
      canonicalContentSignature([
        {
          ...intro,
          periodLabel: null,
          startDay: null,
          endDay: null,
          sortOrder: 1,
          homeCareInstructions: [],
        },
      ])
    ).not.toBe(
      canonicalContentSignature([
        {
          ...intro,
          title: "Changed",
          periodLabel: null,
          startDay: null,
          endDay: null,
          sortOrder: 1,
          homeCareInstructions: [],
        },
      ])
    );
  });
});

describeDb("canonical template lifecycle", () => {
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

  it("creates a production draft v1 and rejects sample, reserved, and duplicate slugs", async () => {
    const created = await createCanonicalTemplate({
      actorUserId: OPERATOR_ID,
      title: "Physio placeholder",
      slug: "ctl-physio",
      serviceCategory: "PHYSIOTHERAPY",
    });
    expect(created.version).toBe(1);

    const template = await getPrisma().guideTemplate.findUniqueOrThrow({
      where: { id: created.templateId },
      include: { revisions: true },
    });
    expect(template.isSample).toBe(false);
    expect(template.isActive).toBe(true);
    expect(template.revisions).toHaveLength(1);
    expect(template.revisions[0]).toMatchObject({
      version: 1,
      status: GuideRevisionStatus.DRAFT,
      createdByUserId: OPERATOR_ID,
      reviewerName: null,
      reviewerCredential: null,
      reviewNote: null,
      reviewedAt: null,
      reviewRecordedByUserId: null,
      publishedByUserId: null,
      publishedAt: null,
    });

    await expectCanonicalCode(
      createCanonicalTemplate({
        actorUserId: OPERATOR_ID,
        title: "Tooth Extraction",
        slug: "extraction",
        serviceCategory: "DENTAL",
      }),
      "invalid"
    );
    await expectCanonicalCode(
      createCanonicalTemplate({
        actorUserId: OPERATOR_ID,
        title: "Duplicate",
        slug: "ctl-physio",
        serviceCategory: "DENTAL",
      }),
      "conflict"
    );
    expect(
      await getPrisma().guideTemplate.findUnique({
        where: { slug: FUTURE_PRODUCTION_TOOTH_EXTRACTION_SLUG },
      })
    ).toBeNull();
  });

  it("allows slug and category corrections only before the first publication", async () => {
    const created = await createCanonicalTemplate({
      actorUserId: OPERATOR_ID,
      title: "Draft title",
      slug: "ctl-meta",
      serviceCategory: "DENTAL",
    });
    await updateCanonicalTemplateMetadata({
      actorUserId: OPERATOR_ID,
      templateId: created.templateId,
      title: "Corrected title",
      slug: "ctl-meta-fixed",
      serviceCategory: "CHIROPRACTIC",
    });
    const corrected = await getPrisma().guideTemplate.findUniqueOrThrow({
      where: { id: created.templateId },
    });
    expect(corrected).toMatchObject({
      title: "Corrected title",
      slug: "ctl-meta-fixed",
      serviceCategory: "CHIROPRACTIC",
      isSample: false,
    });

    await saveCanonicalTemplateDraft({
      templateId: created.templateId,
      revisionId: created.revisionId,
      actorUserId: OPERATOR_ID,
      sections: [intro],
    });
    await publishCanonicalTemplateRevision({
      templateId: created.templateId,
      revisionId: created.revisionId,
      actorUserId: OPERATOR_ID,
      expectedVersion: 1,
    });

    await updateCanonicalTemplateMetadata({
      actorUserId: OPERATOR_ID,
      templateId: created.templateId,
      title: "Library title",
    });
    await expectCanonicalCode(
      updateCanonicalTemplateMetadata({
        actorUserId: OPERATOR_ID,
        templateId: created.templateId,
        slug: "ctl-meta-later",
      }),
      "immutable"
    );
    await expectCanonicalCode(
      updateCanonicalTemplateMetadata({
        actorUserId: OPERATOR_ID,
        templateId: created.templateId,
        serviceCategory: "DENTAL",
      }),
      "immutable"
    );
    const published = await getPrisma().guideTemplate.findUniqueOrThrow({
      where: { id: created.templateId },
      include: { revisions: true },
    });
    expect(published.title).toBe("Library title");
    expect(published.slug).toBe("ctl-meta-fixed");
    expect(published.serviceCategory).toBe("CHIROPRACTIC");
    expect(published.isSample).toBe(false);
    expect(published.revisions[0]?.reviewerName).toBeNull();
  });

  it("clones the latest published revision into exactly one next draft", async () => {
    const created = await createCanonicalTemplate({
      actorUserId: OPERATOR_ID,
      title: "Clone source",
      slug: "ctl-clone",
      serviceCategory: "DENTAL",
    });
    await saveCanonicalTemplateDraft({
      templateId: created.templateId,
      revisionId: created.revisionId,
      actorUserId: OPERATOR_ID,
      sections: [intro, planSection()],
    });
    await publishCanonicalTemplateRevision({
      templateId: created.templateId,
      revisionId: created.revisionId,
      actorUserId: OPERATOR_ID,
      expectedVersion: 1,
    });

    const draft = await createCanonicalTemplateDraft({
      templateId: created.templateId,
      actorUserId: OPERATOR_ID,
    });
    expect(draft.version).toBe(2);
    await expectCanonicalCode(
      createCanonicalTemplateDraft({
        templateId: created.templateId,
        actorUserId: OPERATOR_ID,
      }),
      "conflict"
    );

    const revision = await getPrisma().guideTemplateRevision.findUniqueOrThrow({
      where: { id: draft.revisionId },
      include: {
        sections: {
          orderBy: { sortOrder: "asc" },
          include: { homeCareInstructions: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
    expect(revision).toMatchObject({
      status: GuideRevisionStatus.DRAFT,
      createdByUserId: OPERATOR_ID,
      reviewerName: null,
      reviewedAt: null,
      reviewRecordedByUserId: null,
      publishedAt: null,
      publishedByUserId: null,
    });
    expect(revision.sections.map((section) => section.key)).toEqual([
      "introduction",
      "home-care",
    ]);
    const instructions = revision.sections[1]?.homeCareInstructions ?? [];
    expect(instructions.map((item) => item.key)).toEqual(["rinse", "rest"]);
    expect(instructions[0]).toMatchObject({
      sortOrder: 1,
      frequencyCount: 2,
      frequencyPeriod: "DAY",
      timingLabel: "After meals",
      durationValue: 7,
      durationUnit: "DAYS",
    });
    expect(instructions[1]?.sortOrder).toBe(2);

    const versions = await getPrisma().guideTemplateRevision.findMany({
      where: { guideTemplateId: created.templateId },
      select: { version: true, status: true },
      orderBy: { version: "asc" },
    });
    expect(versions).toEqual([
      { version: 1, status: GuideRevisionStatus.PUBLISHED },
      { version: 2, status: GuideRevisionStatus.DRAFT },
    ]);
  });

  it("persists draft edits and leaves historical review columns unchanged", async () => {
    const created = await createCanonicalTemplate({
      actorUserId: OPERATOR_ID,
      title: "Save target",
      slug: "ctl-save",
      serviceCategory: "DENTAL",
    });
    const saved = await saveCanonicalTemplateDraft({
      templateId: created.templateId,
      revisionId: created.revisionId,
      actorUserId: OPERATOR_ID,
      sections: [intro, planSection()],
    });
    expect(saved).toEqual({ revisionId: created.revisionId });

    const historicalReviewedAt = new Date("2026-09-01T00:00:00.000Z");
    await getPrisma().guideTemplateRevision.update({
      where: { id: created.revisionId },
      data: {
        reviewerName: REVIEWER,
        reviewerCredential: "BDS",
        reviewNote: "Historical note.",
        reviewedAt: historicalReviewedAt,
        reviewRecordedByUserId: OPERATOR_ID,
      },
    });

    const unchanged = await saveCanonicalTemplateDraft({
      templateId: created.templateId,
      revisionId: created.revisionId,
      actorUserId: OPERATOR_ID,
      sections: [intro, planSection()],
    });
    expect(unchanged).toEqual({ revisionId: created.revisionId });

    const changed = await saveCanonicalTemplateDraft({
      templateId: created.templateId,
      revisionId: created.revisionId,
      actorUserId: OPERATOR_ID,
      sections: [intro, planSection(["rest", "rinse"])],
    });
    expect(changed).toEqual({ revisionId: created.revisionId });
    const stored = await getPrisma().guideTemplateRevision.findUniqueOrThrow({
      where: { id: created.revisionId },
      include: {
        sections: {
          orderBy: { sortOrder: "asc" },
          include: { homeCareInstructions: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
    expect(stored).toMatchObject({
      status: GuideRevisionStatus.DRAFT,
      reviewerName: REVIEWER,
      reviewerCredential: "BDS",
      reviewNote: "Historical note.",
      reviewRecordedByUserId: OPERATOR_ID,
      publishedAt: null,
      publishedByUserId: null,
    });
    expect(stored.reviewedAt?.toISOString()).toBe(
      historicalReviewedAt.toISOString()
    );
    expect(
      stored.sections[1]?.homeCareInstructions.map((item) => item.key)
    ).toEqual(["rest", "rinse"]);
  });

  it("publishes a valid unreviewed active draft and rejects a second publish", async () => {
    const created = await createCanonicalTemplate({
      actorUserId: OPERATOR_ID,
      title: "Publish target",
      slug: "ctl-publish",
      serviceCategory: "DENTAL",
    });
    await expectCanonicalCode(
      publishCanonicalTemplateRevision({
        templateId: created.templateId,
        revisionId: created.revisionId,
        actorUserId: OPERATOR_ID,
        expectedVersion: 1,
      }),
      "invalid"
    );
    await saveCanonicalTemplateDraft({
      templateId: created.templateId,
      revisionId: created.revisionId,
      actorUserId: OPERATOR_ID,
      sections: [intro],
    });
    await deactivateCanonicalTemplate({
      templateId: created.templateId,
      actorUserId: OPERATOR_ID,
    });
    await expectCanonicalCode(
      publishCanonicalTemplateRevision({
        templateId: created.templateId,
        revisionId: created.revisionId,
        actorUserId: OPERATOR_ID,
        expectedVersion: 1,
      }),
      "inactive"
    );
    await reactivateCanonicalTemplate({
      templateId: created.templateId,
      actorUserId: OPERATOR_ID,
    });

    const sectionBefore =
      await getPrisma().guideTemplateSection.findFirstOrThrow({
        where: { revisionId: created.revisionId },
      });
    const published = await publishCanonicalTemplateRevision({
      templateId: created.templateId,
      revisionId: created.revisionId,
      actorUserId: OPERATOR_ID,
      expectedVersion: 1,
    });
    const revision = await getPrisma().guideTemplateRevision.findUniqueOrThrow({
      where: { id: published.revisionId },
    });
    const sectionAfter =
      await getPrisma().guideTemplateSection.findFirstOrThrow({
        where: { revisionId: created.revisionId },
      });
    expect(revision.status).toBe(GuideRevisionStatus.PUBLISHED);
    expect(revision.publishedByUserId).toBe(OPERATOR_ID);
    expect(revision.publishedAt).not.toBeNull();
    expect(sectionAfter.id).toBe(sectionBefore.id);
    expect(sectionAfter.body).toBe(intro.body);
    await expectCanonicalCode(
      publishCanonicalTemplateRevision({
        templateId: created.templateId,
        revisionId: created.revisionId,
        actorUserId: OPERATOR_ID,
        expectedVersion: 1,
      }),
      "immutable"
    );
  });

  it("refuses edits and deletion of a published canonical revision", async () => {
    const created = await createCanonicalTemplate({
      actorUserId: OPERATOR_ID,
      title: "Immutable",
      slug: "ctl-immutable",
      serviceCategory: "DENTAL",
    });
    await saveCanonicalTemplateDraft({
      templateId: created.templateId,
      revisionId: created.revisionId,
      actorUserId: OPERATOR_ID,
      sections: [intro, planSection()],
    });
    await publishCanonicalTemplateRevision({
      templateId: created.templateId,
      revisionId: created.revisionId,
      actorUserId: OPERATOR_ID,
      expectedVersion: 1,
    });

    await expectCanonicalCode(
      saveCanonicalTemplateDraft({
        templateId: created.templateId,
        revisionId: created.revisionId,
        actorUserId: OPERATOR_ID,
        sections: [{ ...intro, body: "Changed after publication." }],
      }),
      "immutable"
    );
    await expectCanonicalCode(
      abandonCanonicalTemplateDraft({
        templateId: created.templateId,
        revisionId: created.revisionId,
        actorUserId: OPERATOR_ID,
      }),
      "immutable"
    );

    const stored = await getPrisma().guideTemplateSection.findMany({
      where: { revisionId: created.revisionId },
      include: { homeCareInstructions: true },
    });
    expect(stored.find((section) => section.key === "introduction")?.body).toBe(
      intro.body
    );
    expect(
      stored.find((section) => section.key === "home-care")
        ?.homeCareInstructions
    ).toHaveLength(2);
    expect(
      await getPrisma().guideTemplateRevision.findUnique({
        where: { id: created.revisionId },
      })
    ).not.toBeNull();
  });

  it("deletes an unpublished template with its only draft, and only the later draft after publication", async () => {
    const fresh = await createCanonicalTemplate({
      actorUserId: OPERATOR_ID,
      title: "Never published",
      slug: "ctl-abandon",
      serviceCategory: "DENTAL",
    });
    const abandoned = await abandonCanonicalTemplateDraft({
      templateId: fresh.templateId,
      revisionId: fresh.revisionId,
      actorUserId: OPERATOR_ID,
    });
    expect(abandoned.deletedTemplate).toBe(true);
    expect(
      await getPrisma().guideTemplate.findUnique({
        where: { id: fresh.templateId },
      })
    ).toBeNull();

    const published = await createCanonicalTemplate({
      actorUserId: OPERATOR_ID,
      title: "Published then drafted",
      slug: "ctl-abandon-v2",
      serviceCategory: "DENTAL",
    });
    await saveCanonicalTemplateDraft({
      templateId: published.templateId,
      revisionId: published.revisionId,
      actorUserId: OPERATOR_ID,
      sections: [intro],
    });
    await publishCanonicalTemplateRevision({
      templateId: published.templateId,
      revisionId: published.revisionId,
      actorUserId: OPERATOR_ID,
      expectedVersion: 1,
    });
    const next = await createCanonicalTemplateDraft({
      templateId: published.templateId,
      actorUserId: OPERATOR_ID,
    });
    const result = await abandonCanonicalTemplateDraft({
      templateId: published.templateId,
      revisionId: next.revisionId,
      actorUserId: OPERATOR_ID,
    });
    expect(result.deletedTemplate).toBe(false);
    const remaining = await getPrisma().guideTemplateRevision.findMany({
      where: { guideTemplateId: published.templateId },
    });
    expect(remaining.map((revision) => revision.version)).toEqual([1]);
    expect(remaining[0]?.status).toBe(GuideRevisionStatus.PUBLISHED);
  });

  it("refuses to abandon a draft a clinic guide still pins", async () => {
    const created = await createCanonicalTemplate({
      actorUserId: OPERATOR_ID,
      title: "Pinned draft",
      slug: "ctl-pinned-draft",
      serviceCategory: "DENTAL",
    });
    await getPrisma().practiceGuide.create({
      data: {
        clinicId: CLINIC_ID,
        title: "Pinned draft",
        guideTemplateId: created.templateId,
        pinnedRevisionId: created.revisionId,
        publicSlug: "ctl-pinned-draft",
        serviceCategory: "DENTAL",
      },
    });
    await expectCanonicalCode(
      abandonCanonicalTemplateDraft({
        templateId: created.templateId,
        revisionId: created.revisionId,
        actorUserId: OPERATOR_ID,
      }),
      "pinned"
    );
    expect(
      await getPrisma().guideTemplate.findUnique({
        where: { id: created.templateId },
      })
    ).not.toBeNull();
  });

  it("does not move a clinic pin or published snapshot when canonical v2 is published", async () => {
    const created = await createCanonicalTemplate({
      actorUserId: OPERATOR_ID,
      title: "Pinned source",
      slug: "ctl-pin",
      serviceCategory: "DENTAL",
    });
    await saveCanonicalTemplateDraft({
      templateId: created.templateId,
      revisionId: created.revisionId,
      actorUserId: OPERATOR_ID,
      sections: [intro],
    });
    await publishCanonicalTemplateRevision({
      templateId: created.templateId,
      revisionId: created.revisionId,
      actorUserId: OPERATOR_ID,
      expectedVersion: 1,
    });

    const practice = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      actorUserId: ADMIN_ID,
      values: { templateId: created.templateId },
    });
    await publishPracticeGuide({
      clinicId: CLINIC_ID,
      actorUserId: ADMIN_ID,
      guideId: practice.id,
    });
    const before = await getPrisma().practiceGuide.findUniqueOrThrow({
      where: { id: practice.id },
      include: {
        contentRevisions: {
          include: { sections: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
    const publishedSnapshot = before.contentRevisions.find(
      (revision) => revision.status === GuideRevisionStatus.PUBLISHED
    );
    const clinicDraft = before.contentRevisions.find(
      (revision) => revision.version === WORKING_DRAFT_VERSION
    );
    expect(before.pinnedRevisionId).toBe(created.revisionId);
    expect(publishedSnapshot?.sections[0]?.body).toBe(intro.body);
    expect(clinicDraft?.sections[0]?.body).toBe(intro.body);

    const next = await createCanonicalTemplateDraft({
      templateId: created.templateId,
      actorUserId: OPERATOR_ID,
    });
    await saveCanonicalTemplateDraft({
      templateId: created.templateId,
      revisionId: next.revisionId,
      actorUserId: OPERATOR_ID,
      sections: [{ ...intro, body: "Canonical version 2 body." }],
    });
    await publishCanonicalTemplateRevision({
      templateId: created.templateId,
      revisionId: next.revisionId,
      actorUserId: OPERATOR_ID,
      expectedVersion: 2,
    });

    const after = await getPrisma().practiceGuide.findUniqueOrThrow({
      where: { id: practice.id },
      include: {
        contentRevisions: {
          include: { sections: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
    expect(after.pinnedRevisionId).toBe(created.revisionId);
    expect(after.status).toBe(PracticeGuideStatus.PUBLISHED);
    expect(after.contentRevisions).toHaveLength(before.contentRevisions.length);
    expect(
      after.contentRevisions.find(
        (revision) => revision.id === publishedSnapshot?.id
      )?.sections[0]?.body
    ).toBe(intro.body);
    expect(
      after.contentRevisions.find(
        (revision) => revision.version === WORKING_DRAFT_VERSION
      )?.sections[0]?.body
    ).toBe(intro.body);
  });

  it("hides a deactivated template from discovery without changing an existing pin", async () => {
    const created = await createCanonicalTemplate({
      actorUserId: OPERATOR_ID,
      title: "Deactivated source",
      slug: "ctl-active",
      serviceCategory: "DENTAL",
    });
    await saveCanonicalTemplateDraft({
      templateId: created.templateId,
      revisionId: created.revisionId,
      actorUserId: OPERATOR_ID,
      sections: [intro],
    });
    await publishCanonicalTemplateRevision({
      templateId: created.templateId,
      revisionId: created.revisionId,
      actorUserId: OPERATOR_ID,
      expectedVersion: 1,
    });
    const practice = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      actorUserId: ADMIN_ID,
      values: { templateId: created.templateId, publicSlug: "ctl-kept" },
    });
    expect(
      (await listCanonicalGuideTemplates(CLINIC_ID)).templates.some(
        (template) => template.id === created.templateId
      )
    ).toBe(true);

    const deactivated = await deactivateCanonicalTemplate({
      templateId: created.templateId,
      actorUserId: OPERATOR_ID,
    });
    const hidden = await getPrisma().guideTemplate.findUniqueOrThrow({
      where: { id: created.templateId },
    });
    expect(hidden.isActive).toBe(false);
    expect(hidden.deactivatedByUserId).toBe(OPERATOR_ID);
    expect(hidden.deactivatedAt?.toISOString()).toBe(
      deactivated.deactivatedAt.toISOString()
    );
    expect(
      (await listCanonicalGuideTemplates(CLINIC_ID)).templates.some(
        (template) => template.id === created.templateId
      )
    ).toBe(false);
    expect(
      (
        await getPrisma().practiceGuide.findUniqueOrThrow({
          where: { id: practice.id },
        })
      ).pinnedRevisionId
    ).toBe(created.revisionId);

    await reactivateCanonicalTemplate({
      templateId: created.templateId,
      actorUserId: OPERATOR_ID,
    });
    const restored = await getPrisma().guideTemplate.findUniqueOrThrow({
      where: { id: created.templateId },
    });
    expect(restored.isActive).toBe(true);
    expect(restored.deactivatedAt).toBeNull();
    expect(restored.deactivatedByUserId).toBeNull();
    expect(
      (await listCanonicalGuideTemplates(CLINIC_ID)).templates.some(
        (template) => template.id === created.templateId
      )
    ).toBe(true);
  });

  it("leaves the extraction sample untouched and refuses sample lifecycle writes", async () => {
    const prisma = getPrisma();
    const before = await prisma.guideTemplate.findUnique({
      where: { slug: "extraction" },
      include: {
        revisions: {
          orderBy: { version: "asc" },
          include: {
            sections: { orderBy: { sortOrder: "asc" } },
          },
        },
      },
    });

    await expectCanonicalCode(
      createCanonicalTemplate({
        actorUserId: OPERATOR_ID,
        title: "Tooth Extraction",
        slug: "extraction",
        serviceCategory: "DENTAL",
      }),
      "invalid"
    );

    const sample = await prisma.guideTemplate.create({
      data: {
        slug: "ctl-sample",
        title: "Sample fixture",
        serviceCategory: "DENTAL",
        isActive: true,
        isSample: true,
        revisions: {
          create: {
            version: 1,
            status: GuideRevisionStatus.DRAFT,
            sections: {
              create: {
                key: "introduction",
                kind: "INTRODUCTION",
                title: "Keep",
                body: "Sample body stays.",
                sortOrder: 1,
              },
            },
          },
        },
      },
      include: { revisions: true },
    });
    const revisionId = sample.revisions[0]?.id ?? "";
    await expectCanonicalCode(
      updateCanonicalTemplateMetadata({
        actorUserId: OPERATOR_ID,
        templateId: sample.id,
        title: "Converted",
      }),
      "sample"
    );
    await expectCanonicalCode(
      createCanonicalTemplateDraft({
        templateId: sample.id,
        actorUserId: OPERATOR_ID,
      }),
      "sample"
    );
    await expectCanonicalCode(
      saveCanonicalTemplateDraft({
        templateId: sample.id,
        revisionId,
        actorUserId: OPERATOR_ID,
        sections: [intro],
      }),
      "sample"
    );
    await expectCanonicalCode(
      publishCanonicalTemplateRevision({
        templateId: sample.id,
        revisionId,
        actorUserId: OPERATOR_ID,
        expectedVersion: 1,
      }),
      "sample"
    );
    await expectCanonicalCode(
      deactivateCanonicalTemplate({
        templateId: sample.id,
        actorUserId: OPERATOR_ID,
      }),
      "sample"
    );
    await expectCanonicalCode(
      abandonCanonicalTemplateDraft({
        templateId: sample.id,
        revisionId,
        actorUserId: OPERATOR_ID,
      }),
      "sample"
    );

    const afterSample = await prisma.guideTemplate.findUniqueOrThrow({
      where: { id: sample.id },
      include: {
        revisions: { include: { sections: true } },
      },
    });
    expect(afterSample.isSample).toBe(true);
    expect(afterSample.revisions[0]?.sections[0]?.body).toBe(
      "Sample body stays."
    );

    const after = await prisma.guideTemplate.findUnique({
      where: { slug: "extraction" },
      include: {
        revisions: {
          orderBy: { version: "asc" },
          include: {
            sections: { orderBy: { sortOrder: "asc" } },
          },
        },
      },
    });
    expect(after).toEqual(before);
  });

  it("keeps revision history when the acting user is removed", async () => {
    const authorId = "ctl_author";
    await getPrisma().user.create({
      data: {
        id: authorId,
        email: "author@ctl.example.test",
        name: "Temporary author",
        platformRole: "OPERATOR",
      },
    });
    const created = await createCanonicalTemplate({
      actorUserId: authorId,
      title: "Authored",
      slug: "ctl-author",
      serviceCategory: "DENTAL",
    });
    await getPrisma().user.delete({ where: { id: authorId } });
    const revision = await getPrisma().guideTemplateRevision.findUniqueOrThrow({
      where: { id: created.revisionId },
    });
    expect(revision.createdByUserId).toBeNull();
    expect(
      await getPrisma().guideTemplate.findUnique({
        where: { id: created.templateId },
      })
    ).not.toBeNull();
  });

  it("rejects a second draft at the database even when the service check is bypassed", async () => {
    const created = await createCanonicalTemplate({
      actorUserId: OPERATOR_ID,
      title: "Index target",
      slug: "ctl-index",
      serviceCategory: "DENTAL",
    });
    await expect(
      getPrisma().guideTemplateRevision.create({
        data: {
          guideTemplateId: created.templateId,
          version: 9,
          status: GuideRevisionStatus.DRAFT,
        },
      })
    ).rejects.toMatchObject({ code: "P2002" });
    expect(
      await getPrisma().guideTemplateRevision.count({
        where: {
          guideTemplateId: created.templateId,
          status: GuideRevisionStatus.DRAFT,
        },
      })
    ).toBe(1);
  });

  it("lets only one concurrent draft and one concurrent publish succeed", async () => {
    const drafted = await createCanonicalTemplate({
      actorUserId: OPERATOR_ID,
      title: "Race draft",
      slug: "ctl-race-draft",
      serviceCategory: "DENTAL",
    });
    await saveCanonicalTemplateDraft({
      templateId: drafted.templateId,
      revisionId: drafted.revisionId,
      actorUserId: OPERATOR_ID,
      sections: [intro],
    });
    await publishCanonicalTemplateRevision({
      templateId: drafted.templateId,
      revisionId: drafted.revisionId,
      actorUserId: OPERATOR_ID,
      expectedVersion: 1,
    });

    const draftResults = await Promise.allSettled([
      createCanonicalTemplateDraft({
        templateId: drafted.templateId,
        actorUserId: OPERATOR_ID,
      }),
      createCanonicalTemplateDraft({
        templateId: drafted.templateId,
        actorUserId: OPERATOR_ID,
      }),
    ]);
    expect(
      draftResults.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    const draftRejection = draftResults.find(
      (result) => result.status === "rejected"
    );
    expect(draftRejection?.status).toBe("rejected");
    if (draftRejection?.status === "rejected") {
      expect(isCanonicalTemplateError(draftRejection.reason)).toBe(true);
    }
    const versions = await getPrisma().guideTemplateRevision.findMany({
      where: { guideTemplateId: drafted.templateId },
      select: { version: true },
    });
    expect(versions.map((revision) => revision.version).sort()).toEqual([1, 2]);

    const published = await createCanonicalTemplate({
      actorUserId: OPERATOR_ID,
      title: "Race publish",
      slug: "ctl-race-pub",
      serviceCategory: "DENTAL",
    });
    await saveCanonicalTemplateDraft({
      templateId: published.templateId,
      revisionId: published.revisionId,
      actorUserId: OPERATOR_ID,
      sections: [intro],
    });
    const publishResults = await Promise.allSettled([
      publishCanonicalTemplateRevision({
        templateId: published.templateId,
        revisionId: published.revisionId,
        actorUserId: OPERATOR_ID,
        expectedVersion: 1,
      }),
      publishCanonicalTemplateRevision({
        templateId: published.templateId,
        revisionId: published.revisionId,
        actorUserId: OPERATOR_ID,
        expectedVersion: 1,
      }),
    ]);
    expect(
      publishResults.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    const publishRejection = publishResults.find(
      (result) => result.status === "rejected"
    );
    expect(publishRejection?.status).toBe("rejected");
    if (publishRejection?.status === "rejected") {
      expect(isCanonicalTemplateError(publishRejection.reason)).toBe(true);
      if (isCanonicalTemplateError(publishRejection.reason)) {
        expect(publishRejection.reason.code).toBe("immutable");
      }
    }
    expect(
      (
        await getPrisma().guideTemplateRevision.findUniqueOrThrow({
          where: { id: published.revisionId },
        })
      ).status
    ).toBe(GuideRevisionStatus.PUBLISHED);
  });

  it("holds the canonical template lock until the current transaction finishes", async () => {
    const created = await createCanonicalTemplate({
      actorUserId: OPERATOR_ID,
      title: "Lock target",
      slug: "ctl-lock",
      serviceCategory: "DENTAL",
    });
    await saveCanonicalTemplateDraft({
      templateId: created.templateId,
      revisionId: created.revisionId,
      actorUserId: OPERATOR_ID,
      sections: [intro],
    });
    await publishCanonicalTemplateRevision({
      templateId: created.templateId,
      revisionId: created.revisionId,
      actorUserId: OPERATOR_ID,
      expectedVersion: 1,
    });

    const release = deferred();
    const ready = deferred();
    let finished = false;
    const holder = getPrisma().$transaction(
      async (tx) => {
        await lockCanonicalTemplate(tx, created.templateId);
        ready.resolve();
        await release.promise;
      },
      { maxWait: 10_000, timeout: 20_000 }
    );

    try {
      await ready.promise;
      const blocked = createCanonicalTemplateDraft({
        templateId: created.templateId,
        actorUserId: OPERATOR_ID,
      }).then((result) => {
        finished = true;
        return result;
      });
      await waitForCanonicalWaiter(created.templateId);
      expect(finished).toBe(false);
      release.resolve();
      const draft = await blocked;
      expect(draft.version).toBe(2);
      expect(finished).toBe(true);
    } finally {
      release.resolve();
      await holder;
    }
  });
});
