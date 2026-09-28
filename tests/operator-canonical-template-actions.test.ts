import "dotenv/config";

import { GuideRevisionStatus } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const getAuthContextMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  notFound: notFoundMock,
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthContext: getAuthContextMock,
  isPlatformOperator: (user: { platformRole?: string } | null | undefined) =>
    user?.platformRole === "OPERATOR",
}));

import {
  abandonCanonicalTemplateDraftAction,
  createCanonicalTemplateAction,
  createCanonicalTemplateDraftAction,
  deactivateCanonicalTemplateAction,
  publishCanonicalTemplateRevisionAction,
  reactivateCanonicalTemplateAction,
  recordCanonicalTemplateReviewAction,
  saveCanonicalTemplateDraftAction,
  updateCanonicalTemplateMetadataAction,
} from "@/app/(staff)/(operator)/operator/templates/actions";
import OperatorTemplatesPage from "@/app/(staff)/(operator)/operator/templates/page";
import NewCanonicalTemplatePage from "@/app/(staff)/(operator)/operator/templates/new/page";
import OperatorTemplateDetailPage from "@/app/(staff)/(operator)/operator/templates/[templateId]/page";
import OperatorTemplateDraftPage from "@/app/(staff)/(operator)/operator/templates/[templateId]/draft/page";
import { canonicalEditorContentSignature } from "@/lib/aftercare/canonical-editor-content";
import { createPracticeGuideFromTemplate } from "@/lib/clinic-portal/create-practice-guide";
import { listCanonicalGuideTemplates } from "@/lib/clinic-portal/list-canonical-templates";
import { ensurePrimarySiteForClinic } from "@/lib/clinics/primary-site-location.mjs";
import { assignPrimarySiteServiceCategories } from "@/lib/clinics/site-service-categories";
import { loadOperatorCanonicalTemplate } from "@/lib/operator/canonical-templates/load-operator-canonical-template";
import { listOperatorCanonicalTemplates } from "@/lib/operator/canonical-templates/list-operator-canonical-templates";
import { getPrisma } from "@/lib/prisma";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const describeDb = hasDatabase ? describe : describe.skip;

const OPERATOR_ID = "otm_operator";
const ADMIN_ID = "otm_admin";
const CLINIC_ID = "otm_clinic";

function navigationError(kind: "redirect" | "notFound", url?: string) {
  const error = new Error(kind === "redirect" ? "NEXT_REDIRECT" : "NOT_FOUND");
  (error as Error & { digest: string }).digest =
    kind === "redirect"
      ? `NEXT_REDIRECT;${url}`
      : "NEXT_HTTP_ERROR_FALLBACK;404";
  return error;
}

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

function exampleSections(order: {
  stages: string[];
  instructions: string[];
  introduction?: string;
}) {
  return [
    {
      key: "intro",
      kind: "INTRODUCTION",
      title: "Example introduction",
      body: order.introduction ?? "Example introduction",
    },
    ...order.stages.map((key, index) => ({
      key,
      kind: "RECOVERY_TIMELINE",
      title: "Example timeline instruction",
      body: "Example timeline instruction",
      periodLabel: key,
      startDay: index * 2,
      endDay: index * 2 + 1,
    })),
    {
      key: "plan",
      kind: "HOME_CARE_PLAN",
      title: "Home care plan",
      body: "",
      homeCareInstructions: order.instructions.map((key, index) => ({
        key,
        title: "Example home-care item",
        body: null,
        frequencyCount: index === 0 ? 1 : 3,
        frequencyPeriod: index === 0 ? "DAY" : "WEEK",
        timingLabel: index === 0 ? "Evening" : null,
        durationValue: index === 0 ? 7 : 4,
        durationUnit: index === 0 ? "DAYS" : "WEEKS",
      })),
    },
  ];
}

async function cleanup() {
  const prisma = getPrisma();
  await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
  await prisma.clinic.deleteMany({ where: { id: CLINIC_ID } });
  await prisma.guideTemplate.deleteMany({
    where: { slug: { startsWith: "otm-" } },
  });
  await prisma.user.deleteMany({
    where: { email: { endsWith: "@otm.example.test" } },
  });
}

async function seedActors() {
  const prisma = getPrisma();
  await prisma.user.create({
    data: {
      id: OPERATOR_ID,
      email: "operator@otm.example.test",
      name: "River Operator",
      platformRole: "OPERATOR",
    },
  });
  await prisma.user.create({
    data: {
      id: ADMIN_ID,
      email: "admin@otm.example.test",
      name: "Clinic Admin",
    },
  });
  await prisma.clinic.create({
    data: {
      id: CLINIC_ID,
      name: "Operator Template Clinic",
      slug: "otm-clinic",
      memberships: { create: { userId: ADMIN_ID, role: "ADMIN" } },
    },
  });
  await ensurePrimarySiteForClinic(prisma, CLINIC_ID);
  await assignPrimarySiteServiceCategories(prisma, CLINIC_ID, ["DENTAL"]);
}

function asOperator() {
  getAuthContextMock.mockResolvedValue({
    user: {
      id: OPERATOR_ID,
      email: "operator@otm.example.test",
      name: "River Operator",
      platformRole: "OPERATOR",
    },
    clinicMembership: null,
  });
}

function asClinicAdmin() {
  getAuthContextMock.mockResolvedValue({
    user: {
      id: ADMIN_ID,
      email: "admin@otm.example.test",
      name: "Clinic Admin",
      platformRole: "NONE",
    },
    clinicMembership: {
      membershipId: "otm_membership",
      role: "ADMIN",
      clinic: { id: CLINIC_ID, name: "Operator Template Clinic" },
    },
  });
}

async function redirectUrl(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    expect(digest.startsWith("NEXT_REDIRECT;")).toBe(true);
    return digest.slice("NEXT_REDIRECT;".length);
  }
  throw new Error("Expected a redirect.");
}

describeDb("operator canonical template actions", () => {
  beforeEach(async () => {
    redirectMock.mockImplementation((url: string) => {
      throw navigationError("redirect", url);
    });
    notFoundMock.mockImplementation(() => {
      throw navigationError("notFound");
    });
    await cleanup();
    await seedActors();
    asOperator();
  });

  afterAll(async () => {
    if (!hasDatabase) {
      return;
    }
    await cleanup();
    await getPrisma().$disconnect();
  });

  it("refuses template pages and mutations to a non-Operator", async () => {
    asClinicAdmin();
    await expect(
      OperatorTemplatesPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow(/NOT_FOUND/);
    await expect(NewCanonicalTemplatePage()).rejects.toThrow(/NOT_FOUND/);
    await expect(
      OperatorTemplateDetailPage({
        params: Promise.resolve({ templateId: "missing" }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow(/NOT_FOUND/);
    await expect(
      OperatorTemplateDraftPage({
        params: Promise.resolve({ templateId: "missing" }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow(/NOT_FOUND/);
    await expect(
      createCanonicalTemplateAction(
        {},
        form({
          title: "Example template",
          slug: "otm-blocked",
          serviceCategory: "DENTAL",
        })
      )
    ).rejects.toThrow(/NOT_FOUND/);
    await expect(
      saveCanonicalTemplateDraftAction(
        {},
        form({ templateId: "missing", revisionId: "missing", sections: "[]" })
      )
    ).rejects.toThrow(/NOT_FOUND/);
    await expect(
      recordCanonicalTemplateReviewAction(
        {},
        form({
          templateId: "missing",
          revisionId: "missing",
          reviewerName: "Example Reviewer",
        })
      )
    ).rejects.toThrow(/NOT_FOUND/);
    await expect(
      publishCanonicalTemplateRevisionAction(
        {},
        form({
          templateId: "missing",
          revisionId: "missing",
          expectedVersion: "1",
        })
      )
    ).rejects.toThrow(/NOT_FOUND/);
    await expect(
      deactivateCanonicalTemplateAction({}, form({ templateId: "missing" }))
    ).rejects.toThrow(/NOT_FOUND/);
    expect(notFoundMock).toHaveBeenCalled();
    expect(
      await getPrisma().guideTemplate.findUnique({
        where: { slug: "otm-blocked" },
      })
    ).toBeNull();
  });

  it("creates, edits, reviews, publishes, and revises a synthetic template", async () => {
    await expect(
      createCanonicalTemplateAction(
        {},
        form({
          title: "Example template",
          slug: "otm-example",
          serviceCategory: "",
        })
      )
    ).resolves.toMatchObject({
      fieldErrors: { serviceCategory: "Choose a service category." },
    });

    const reserved = await createCanonicalTemplateAction(
      {},
      form({
        title: "Example template",
        slug: "extraction",
        serviceCategory: "DENTAL",
      })
    );
    expect(reserved.fieldErrors?.slug).toMatch(/reserved/i);

    const createdUrl = await redirectUrl(
      createCanonicalTemplateAction(
        {},
        form({
          title: "Example template",
          slug: "otm-example",
          serviceCategory: "DENTAL",
        })
      )
    );
    const templateId = createdUrl.split("/")[3];
    expect(createdUrl).toBe(`/operator/templates/${templateId}/draft`);

    const renamed = await updateCanonicalTemplateMetadataAction(
      {},
      form({
        templateId: templateId ?? "",
        title: "Example template renamed",
        slug: "otm-renamed",
        serviceCategory: "PHYSIOTHERAPY",
      })
    );
    expect(renamed.ok).toBe(true);
    const backToDental = await updateCanonicalTemplateMetadataAction(
      {},
      form({
        templateId: templateId ?? "",
        title: "Example template renamed",
        slug: "otm-renamed",
        serviceCategory: "DENTAL",
      })
    );
    expect(backToDental.ok).toBe(true);

    const draft = await loadOperatorCanonicalTemplate(templateId ?? "");
    expect(draft?.serviceCategoryLabel).toBe("Dental");
    expect(draft?.slug).toBe("otm-renamed");
    expect(draft?.isSample).toBe(false);
    expect(draft?.metadataLocked).toBe(false);
    expect(draft?.openDraft?.version).toBe(1);
    expect(draft?.openDraft?.reviewed).toBe(false);

    const firstSave = await saveCanonicalTemplateDraftAction(
      {},
      form({
        templateId: templateId ?? "",
        revisionId: draft?.openDraft?.id ?? "",
        sections: JSON.stringify(
          exampleSections({
            stages: ["earlier", "later"],
            instructions: ["daily", "weekly"],
          })
        ),
      })
    );
    expect(firstSave).toMatchObject({ ok: true, reviewCleared: false });

    const saved = await loadOperatorCanonicalTemplate(templateId ?? "");
    expect(saved?.openDraft?.sections.map((section) => section.key)).toEqual([
      "intro",
      "earlier",
      "later",
      "plan",
    ]);
    expect(
      saved?.openDraft?.sections
        .find((section) => section.kind === "HOME_CARE_PLAN")
        ?.homeCareInstructions.map((item) => item.key)
    ).toEqual(["daily", "weekly"]);
    expect(
      canonicalEditorContentSignature(saved?.openDraft?.sections ?? [])
    ).toBe(saved?.openDraft?.savedContentSignature);

    const reordered = await saveCanonicalTemplateDraftAction(
      {},
      form({
        templateId: templateId ?? "",
        revisionId: saved?.openDraft?.id ?? "",
        sections: JSON.stringify(
          exampleSections({
            stages: ["later", "earlier"],
            instructions: ["weekly", "daily"],
          })
        ),
      })
    );
    expect(reordered.reviewCleared).toBe(false);
    const ordered = await loadOperatorCanonicalTemplate(templateId ?? "");
    expect(
      ordered?.openDraft?.sections
        .filter((section) => section.kind === "RECOVERY_TIMELINE")
        .map((section) => section.key)
    ).toEqual(["later", "earlier"]);
    expect(
      ordered?.openDraft?.sections
        .find((section) => section.kind === "HOME_CARE_PLAN")
        ?.homeCareInstructions.map((item) => item.key)
    ).toEqual(["weekly", "daily"]);

    const missingReviewer = await recordCanonicalTemplateReviewAction(
      {},
      form({
        templateId: templateId ?? "",
        revisionId: ordered?.openDraft?.id ?? "",
        reviewerName: " ",
        reviewerCredential: "",
        reviewNote: "",
      })
    );
    expect(missingReviewer.fieldErrors?.reviewerName).toMatch(/name/i);

    const reviewed = await recordCanonicalTemplateReviewAction(
      {},
      form({
        templateId: templateId ?? "",
        revisionId: ordered?.openDraft?.id ?? "",
        reviewerName: "Example Reviewer",
        reviewerCredential: "",
        reviewNote: "",
      })
    );
    expect(reviewed.ok).toBe(true);
    const reviewedRow =
      await getPrisma().guideTemplateRevision.findUniqueOrThrow({
        where: { id: ordered?.openDraft?.id ?? "" },
      });
    expect(reviewedRow.reviewerName).toBe("Example Reviewer");
    expect(reviewedRow.reviewerCredential).toBeNull();
    expect(reviewedRow.reviewRecordedByUserId).toBe(OPERATOR_ID);

    const cleared = await saveCanonicalTemplateDraftAction(
      {},
      form({
        templateId: templateId ?? "",
        revisionId: ordered?.openDraft?.id ?? "",
        sections: JSON.stringify(
          exampleSections({
            stages: ["later", "earlier"],
            instructions: ["weekly", "daily"],
            introduction: "Example introduction revised",
          })
        ),
      })
    );
    expect(cleared.reviewCleared).toBe(true);
    const unreviewed = await loadOperatorCanonicalTemplate(templateId ?? "");
    expect(unreviewed?.openDraft?.reviewed).toBe(false);

    const blockedPublish = await publishCanonicalTemplateRevisionAction(
      {},
      form({
        templateId: templateId ?? "",
        revisionId: unreviewed?.openDraft?.id ?? "",
        expectedVersion: "1",
      })
    );
    expect(blockedPublish.error).toMatch(/review/i);

    await recordCanonicalTemplateReviewAction(
      {},
      form({
        templateId: templateId ?? "",
        revisionId: unreviewed?.openDraft?.id ?? "",
        reviewerName: "Example Reviewer",
        reviewerCredential: "Example credential",
        reviewNote: "Example note",
      })
    );
    const publishedUrl = await redirectUrl(
      publishCanonicalTemplateRevisionAction(
        {},
        form({
          templateId: templateId ?? "",
          revisionId: unreviewed?.openDraft?.id ?? "",
          expectedVersion: "1",
        })
      )
    );
    expect(publishedUrl).toContain("notice=published");
    const published = await loadOperatorCanonicalTemplate(templateId ?? "");
    expect(published?.openDraft).toBeNull();
    expect(published?.metadataLocked).toBe(true);
    expect(published?.revisions[0]).toMatchObject({
      version: 1,
      status: GuideRevisionStatus.PUBLISHED,
      publisherLabel: "River Operator",
      reviewerName: "Example Reviewer",
      reviewerCredential: "Example credential",
    });

    const slugLocked = await updateCanonicalTemplateMetadataAction(
      {},
      form({
        templateId: templateId ?? "",
        title: "Example template renamed",
        slug: "otm-after-publish",
        serviceCategory: "PHYSIOTHERAPY",
      })
    );
    expect(slugLocked.error).toMatch(/slug cannot change/i);
    const categoryLocked = await updateCanonicalTemplateMetadataAction(
      {},
      form({
        templateId: templateId ?? "",
        title: "Example template renamed",
        serviceCategory: "PHYSIOTHERAPY",
      })
    );
    expect(categoryLocked.error).toMatch(/service category cannot change/i);
    const titleSaved = await updateCanonicalTemplateMetadataAction(
      {},
      form({
        templateId: templateId ?? "",
        title: "Example template published",
      })
    );
    expect(titleSaved.ok).toBe(true);

    const practice = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      actorUserId: ADMIN_ID,
      values: { templateId: templateId ?? "" },
    });
    const pinnedBefore = await getPrisma().practiceGuide.findUniqueOrThrow({
      where: { id: practice.id },
      select: { pinnedRevisionId: true },
    });

    const nextUrl = await redirectUrl(
      createCanonicalTemplateDraftAction(
        {},
        form({ templateId: templateId ?? "" })
      )
    );
    expect(nextUrl).toContain("notice=revision-opened");
    const next = await loadOperatorCanonicalTemplate(templateId ?? "");
    expect(next?.openDraft?.version).toBe(2);
    expect(next?.openDraft?.reviewed).toBe(false);
    expect(next?.openDraft?.reviewerName).toBeNull();
    expect(next?.openDraft?.sections.map((section) => section.key)).toEqual(
      published?.revisions[0]?.sections.map((section) => section.key)
    );

    const existsUrl = await redirectUrl(
      createCanonicalTemplateDraftAction(
        {},
        form({ templateId: templateId ?? "" })
      )
    );
    expect(existsUrl).toContain("notice=draft-exists");
    expect(
      await getPrisma().guideTemplateRevision.count({
        where: {
          guideTemplateId: templateId,
          status: GuideRevisionStatus.DRAFT,
        },
      })
    ).toBe(1);

    await recordCanonicalTemplateReviewAction(
      {},
      form({
        templateId: templateId ?? "",
        revisionId: next?.openDraft?.id ?? "",
        reviewerName: "Example Reviewer",
      })
    );
    await redirectUrl(
      publishCanonicalTemplateRevisionAction(
        {},
        form({
          templateId: templateId ?? "",
          revisionId: next?.openDraft?.id ?? "",
          expectedVersion: "2",
        })
      )
    );
    const pinnedAfter = await getPrisma().practiceGuide.findUniqueOrThrow({
      where: { id: practice.id },
      select: { pinnedRevisionId: true },
    });
    expect(pinnedAfter.pinnedRevisionId).toBe(pinnedBefore.pinnedRevisionId);

    expect(
      (await listCanonicalGuideTemplates(CLINIC_ID)).templates.some(
        (template) => template.id === templateId
      )
    ).toBe(true);
    await redirectUrl(
      deactivateCanonicalTemplateAction(
        {},
        form({ templateId: templateId ?? "" })
      )
    );
    const inactive = await loadOperatorCanonicalTemplate(templateId ?? "");
    expect(inactive?.isActive).toBe(false);
    expect(inactive?.deactivatedByLabel).toBe("River Operator");
    expect(inactive?.deactivatedAtLabel).toBeTruthy();
    expect(
      (await listCanonicalGuideTemplates(CLINIC_ID)).templates.some(
        (template) => template.id === templateId
      )
    ).toBe(false);
    await redirectUrl(
      reactivateCanonicalTemplateAction(
        {},
        form({ templateId: templateId ?? "" })
      )
    );
    expect(
      (await listCanonicalGuideTemplates(CLINIC_ID)).templates.some(
        (template) => template.id === templateId
      )
    ).toBe(true);

    const listed = await listOperatorCanonicalTemplates();
    const row = listed.find((template) => template.id === templateId);
    expect(row).toMatchObject({
      serviceCategoryLabel: "Dental",
      isActive: true,
      isSample: false,
      latestPublishedVersion: 2,
      draft: null,
    });
    const sample = listed.find((template) => template.slug === "extraction");
    expect(sample?.isSample).toBe(true);
    expect(sample?.serviceCategoryLabel).toBe("Dental");
    expect(sample?.draft?.reviewed ?? false).toBe(false);
    const sampleBefore = await getPrisma().guideTemplate.findUniqueOrThrow({
      where: { slug: "extraction" },
      include: { revisions: true },
    });
    const sampleResult = await deactivateCanonicalTemplateAction(
      {},
      form({ templateId: sampleBefore.id })
    );
    expect(sampleResult.error).toMatch(/sample/i);
    const sampleAfter = await getPrisma().guideTemplate.findUniqueOrThrow({
      where: { slug: "extraction" },
      include: { revisions: true },
    });
    expect(sampleAfter.isSample).toBe(true);
    expect(sampleAfter.isActive).toBe(sampleBefore.isActive);
    expect(
      sampleAfter.revisions.map((revision) => revision.reviewerName)
    ).toEqual(sampleBefore.revisions.map((revision) => revision.reviewerName));
  });

  it("removes an unpublished template when its only draft is abandoned", async () => {
    const url = await redirectUrl(
      createCanonicalTemplateAction(
        {},
        form({
          title: "Example draft only",
          slug: "otm-draft-only",
          serviceCategory: "CHIROPRACTIC",
        })
      )
    );
    const templateId = url.split("/")[3] ?? "";
    const loaded = await loadOperatorCanonicalTemplate(templateId);
    const abandoned = await redirectUrl(
      abandonCanonicalTemplateDraftAction(
        {},
        form({
          templateId,
          revisionId: loaded?.openDraft?.id ?? "",
        })
      )
    );
    expect(abandoned).toContain("notice=template-removed");
    expect(
      await getPrisma().guideTemplate.findUnique({ where: { id: templateId } })
    ).toBeNull();
  });
});
