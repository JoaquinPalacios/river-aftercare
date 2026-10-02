import "dotenv/config";

import { readFileSync } from "node:fs";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const getAuthContextMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  notFound: notFoundMock,
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthContext: getAuthContextMock,
  isPlatformOperator: (user: { platformRole?: string } | null | undefined) =>
    user?.platformRole === "OPERATOR",
}));

import CanonicalTemplatePreviewPage from "@/app/(staff)/(operator-preview)/operator/templates/[templateId]/preview/page";
import CanonicalTemplateRevisionPreviewPage from "@/app/(staff)/(operator-preview)/operator/templates/[templateId]/preview/[revisionId]/page";
import OperatorTemplateDetailPage from "@/app/(staff)/(operator)/operator/templates/[templateId]/page";
import { DEMO_AFTERCARE_TENANT_SLUG } from "@/lib/aftercare/demo-tenant";
import { PRODUCT_ISOLOGO_SRC } from "@/lib/branding/product-assets";
import { resolveAftercareTheme } from "@/lib/branding/aftercare-theme";
import { createCanonicalTemplateDraft } from "@/lib/canonical-templates/create-canonical-template-draft";
import { createCanonicalTemplate } from "@/lib/canonical-templates/create-canonical-template";
import {
  CANONICAL_PREVIEW_BRAND_NOTE,
  CANONICAL_PREVIEW_CLINIC_NAME,
  CANONICAL_PREVIEW_SLUG,
  CANONICAL_PREVIEW_THEME_INPUT,
  canonicalPreviewPracticeChrome,
  canonicalTemplatePublishedPreviewPath,
  canonicalTemplateRevisionPreviewPath,
} from "@/lib/canonical-templates/preview-brand";
import { publishCanonicalTemplateRevision } from "@/lib/canonical-templates/publish-canonical-template-revision";
import { saveCanonicalTemplateDraft } from "@/lib/canonical-templates/save-canonical-template-draft";
import { loadOperatorCanonicalTemplate } from "@/lib/operator/canonical-templates/load-operator-canonical-template";
import { getPrisma } from "@/lib/prisma";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const describeDb = hasDatabase ? describe : describe.skip;

const OPERATOR_ID = "ctp_operator";
const ADMIN_ID = "ctp_admin";
const PUBLISHED_BODY = "Published canonical preview sentence alpha";
const DRAFT_BODY = "Draft canonical preview sentence beta";

function navigationError(kind: "redirect" | "notFound", url?: string) {
  const error = new Error(kind === "redirect" ? "NEXT_REDIRECT" : "NOT_FOUND");
  (error as Error & { digest: string }).digest =
    kind === "redirect"
      ? `NEXT_REDIRECT;${url}`
      : "NEXT_HTTP_ERROR_FALLBACK;404";
  return error;
}

function section(body: string) {
  return {
    key: "introduction",
    kind: "INTRODUCTION" as const,
    title: "Preview introduction",
    body,
  };
}

async function cleanup() {
  const prisma = getPrisma();
  await prisma.guideTemplate.deleteMany({
    where: { slug: { startsWith: "ctp-" } },
  });
  await prisma.user.deleteMany({
    where: { email: { endsWith: "@ctp.example.test" } },
  });
}

function asOperator() {
  getAuthContextMock.mockResolvedValue({
    user: {
      id: OPERATOR_ID,
      email: "operator@ctp.example.test",
      name: "River Operator",
      platformRole: "OPERATOR",
    },
    clinicMembership: null,
  });
}

describe("canonical template preview contract", () => {
  it("uses the patient renderer and a neutral River Aftercare demo identity", () => {
    const chrome = canonicalPreviewPracticeChrome();
    const theme = resolveAftercareTheme(CANONICAL_PREVIEW_THEME_INPUT);
    const brand = readFileSync(
      "lib/canonical-templates/preview-brand.ts",
      "utf8"
    );
    const preview = readFileSync(
      "app/(staff)/(operator-preview)/operator/templates/canonical-patient-preview.tsx",
      "utf8"
    );
    const publishedPage = readFileSync(
      "app/(staff)/(operator-preview)/operator/templates/[templateId]/preview/page.tsx",
      "utf8"
    );
    const revisionPage = readFileSync(
      "app/(staff)/(operator-preview)/operator/templates/[templateId]/preview/[revisionId]/page.tsx",
      "utf8"
    );
    const layout = readFileSync(
      "app/(staff)/(operator-preview)/layout.tsx",
      "utf8"
    );
    const actions = readFileSync(
      "app/(staff)/(operator)/operator/templates/actions.ts",
      "utf8"
    );
    const editor = readFileSync(
      "app/(staff)/(operator)/operator/templates/canonical-draft-editor.tsx",
      "utf8"
    );
    const card = readFileSync(
      "app/(staff)/(operator)/operator/templates/template-preview-card.tsx",
      "utf8"
    );
    const styles = readFileSync("app/(staff)/staff.css", "utf8");
    const gridStart = styles.indexOf(".templateOverviewGrid {");
    const gridRule = styles.slice(gridStart, styles.indexOf("}", gridStart));

    expect(chrome.displayName).toBe(CANONICAL_PREVIEW_CLINIC_NAME);
    expect(chrome.displayName).toBe("River Aftercare Demo Clinic");
    expect(chrome.logoSrc).toBe(PRODUCT_ISOLOGO_SRC);
    expect(chrome.showDemoNotice).toBe(false);
    expect(chrome.phoneDisplay).toBeNull();
    expect(CANONICAL_PREVIEW_SLUG).not.toBe(DEMO_AFTERCARE_TENANT_SLUG);
    expect(theme.light["--cg-brand"]).toBe("#3b4bd1");
    expect(theme.dark["--cg-brand"]).toBe("#8ea0ff");
    expect(brand).not.toContain("Riverside");
    expect(brand).not.toContain("demodental");
    expect(preview).toContain("<PatientPage");
    expect(preview).toContain("<GuideDocument");
    expect(preview).toContain('printLabel="Print / Save as PDF"');
    expect(preview).not.toContain("Download PDF");
    expect(publishedPage).toContain("CanonicalPatientPreview");
    expect(revisionPage).toContain("CanonicalPatientPreview");
    expect(preview).toContain("canonicalPreviewPracticeChrome");
    expect(preview).not.toContain("Riverside");
    expect(preview).not.toContain("demodental");
    expect(preview).not.toContain("getPublishedPracticeGuide");
    expect(publishedPage).toContain("requirePlatformOperator");
    expect(publishedPage).toContain("PRIVATE_ROBOTS");
    expect(publishedPage).toContain("isLatestPublished");
    expect(revisionPage).toContain("requirePlatformOperator");
    expect(revisionPage).toContain("PRIVATE_ROBOTS");
    expect(layout).toContain("requirePlatformOperator");
    expect(actions).toContain(
      "redirect(`/operator/templates/${templateId}/draft?notice=published`)"
    );
    expect(editor).toContain("canonicalTemplatePublishedPreviewPath");
    expect(editor).toContain("canonicalTemplateRevisionPreviewPath");
    expect(editor).toContain("CanonicalGuidePreview");
    expect(card).toContain("CopyPreviewLinkButton");
    expect(card).toContain("CANONICAL_PREVIEW_OPERATOR_LABEL");
    expect(card).toContain("CANONICAL_PREVIEW_BRAND_NOTE");
    expect(card).not.toContain("Riverside");
    expect(canonicalTemplatePublishedPreviewPath("template-1")).toBe(
      "/operator/templates/template-1/preview"
    );
    expect(
      canonicalTemplateRevisionPreviewPath("template-1", "revision-2")
    ).toBe("/operator/templates/template-1/preview/revision-2");
    expect(gridRule).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(gridRule).not.toContain("22rem");
    expect(styles).toContain(
      "grid-template-columns: minmax(0, 1fr) minmax(16rem, 22rem);"
    );
    expect(styles).toContain("overflow-wrap: anywhere");
  });
});

describeDb("canonical template patient preview", () => {
  beforeEach(async () => {
    redirectMock.mockImplementation((url: string) => {
      throw navigationError("redirect", url);
    });
    notFoundMock.mockImplementation(() => {
      throw navigationError("notFound");
    });
    await cleanup();
    await getPrisma().user.create({
      data: {
        id: OPERATOR_ID,
        email: "operator@ctp.example.test",
        name: "River Operator",
        platformRole: "OPERATOR",
      },
    });
    await getPrisma().user.create({
      data: {
        id: ADMIN_ID,
        email: "admin@ctp.example.test",
        name: "Clinic Admin",
      },
    });
    asOperator();
  });

  afterAll(async () => {
    if (!hasDatabase) {
      return;
    }
    await cleanup();
    await getPrisma().$disconnect();
  });

  it("previews the latest published revision and keeps draft content on its own route", async () => {
    const created = await createCanonicalTemplate({
      actorUserId: OPERATOR_ID,
      title: "Preview template",
      slug: "ctp-preview",
      serviceCategory: "COSMETIC_AESTHETIC",
    });
    await saveCanonicalTemplateDraft({
      templateId: created.templateId,
      revisionId: created.revisionId,
      actorUserId: OPERATOR_ID,
      sections: [section(PUBLISHED_BODY)],
    });
    await publishCanonicalTemplateRevision({
      templateId: created.templateId,
      revisionId: created.revisionId,
      actorUserId: OPERATOR_ID,
      expectedVersion: 1,
    });
    const published = await loadOperatorCanonicalTemplate(created.templateId);
    const publishedRevision = published?.revisions.find(
      (revision) => revision.isLatestPublished
    );
    expect(published?.openDraft).toBeNull();
    const revisionsBeforeOverview =
      await getPrisma().guideTemplateRevision.count({
        where: { guideTemplateId: created.templateId },
      });
    const overview = renderToStaticMarkup(
      await OperatorTemplateDetailPage({
        params: Promise.resolve({ templateId: created.templateId }),
        searchParams: Promise.resolve({}),
      })
    );
    expect(
      await getPrisma().guideTemplateRevision.count({
        where: { guideTemplateId: created.templateId },
      })
    ).toBe(revisionsBeforeOverview);
    expect(overview).toContain('data-template-edit="create-draft"');
    expect(overview).toContain("Deactivate");
    expect(overview).toContain("Revision 1");
    expect(overview).toContain("Preview revision");
    expect(overview).toContain(
      `data-preview-path="/operator/templates/${created.templateId}/preview"`
    );
    expect(overview).not.toContain("Unpublish");
    expect(overview).not.toContain("Riverside");

    const latest = renderToStaticMarkup(
      await CanonicalTemplatePreviewPage({
        params: Promise.resolve({ templateId: created.templateId }),
      })
    );
    expect(latest).toContain(PUBLISHED_BODY);
    expect(latest).toContain("River Aftercare Demo Clinic");
    expect(latest).toContain(PRODUCT_ISOLOGO_SRC);
    expect(latest).toContain("data-guide-document");
    expect(latest).toContain("Operator preview");
    expect(latest).toContain("Print / Save as PDF");
    expect(latest).toContain(CANONICAL_PREVIEW_BRAND_NOTE);
    expect(latest).toContain("About this guide");
    expect(latest).not.toContain("Riverside");
    expect(latest).not.toContain("demodental");
    expect(latest).not.toContain(DRAFT_BODY);
    expect(latest).not.toContain("operator@ctp.example.test");

    const historical = renderToStaticMarkup(
      await CanonicalTemplateRevisionPreviewPage({
        params: Promise.resolve({
          templateId: created.templateId,
          revisionId: publishedRevision?.id ?? "",
        }),
      })
    );
    expect(historical).toContain(PUBLISHED_BODY);
    expect(historical).toContain("Revision 1 · Published");
    expect(historical).toContain("Print / Save as PDF");

    const next = await createCanonicalTemplateDraft({
      templateId: created.templateId,
      actorUserId: OPERATOR_ID,
    });
    await saveCanonicalTemplateDraft({
      templateId: created.templateId,
      revisionId: next.revisionId,
      actorUserId: OPERATOR_ID,
      sections: [section(DRAFT_BODY)],
    });
    const withDraft = renderToStaticMarkup(
      await CanonicalTemplatePreviewPage({
        params: Promise.resolve({ templateId: created.templateId }),
      })
    );
    expect(withDraft).toContain(PUBLISHED_BODY);
    expect(withDraft).not.toContain(DRAFT_BODY);

    const draftPreview = renderToStaticMarkup(
      await CanonicalTemplateRevisionPreviewPage({
        params: Promise.resolve({
          templateId: created.templateId,
          revisionId: next.revisionId,
        }),
      })
    );
    expect(draftPreview).toContain(DRAFT_BODY);
    expect(draftPreview).toContain("Revision 2 · Draft");
    expect(draftPreview).toContain("Print / Save as PDF");
    expect(draftPreview).not.toContain(PUBLISHED_BODY);

    const overviewWithDraft = renderToStaticMarkup(
      await OperatorTemplateDetailPage({
        params: Promise.resolve({ templateId: created.templateId }),
        searchParams: Promise.resolve({}),
      })
    );
    expect(overviewWithDraft).toContain('data-template-edit="open-draft"');
    expect(overviewWithDraft).toContain(
      `/operator/templates/${created.templateId}/draft`
    );
    expect(overviewWithDraft).not.toContain(
      'data-template-edit="create-draft"'
    );

    await publishCanonicalTemplateRevision({
      templateId: created.templateId,
      revisionId: next.revisionId,
      actorUserId: OPERATOR_ID,
      expectedVersion: 2,
    });
    const afterSecondPublish = renderToStaticMarkup(
      await CanonicalTemplatePreviewPage({
        params: Promise.resolve({ templateId: created.templateId }),
      })
    );
    expect(afterSecondPublish).toContain(DRAFT_BODY);
    expect(afterSecondPublish).not.toContain(PUBLISHED_BODY);
    const firstRevision = renderToStaticMarkup(
      await CanonicalTemplateRevisionPreviewPage({
        params: Promise.resolve({
          templateId: created.templateId,
          revisionId: publishedRevision?.id ?? "",
        }),
      })
    );
    expect(firstRevision).toContain(PUBLISHED_BODY);
    expect(firstRevision).not.toContain(DRAFT_BODY);
  });

  it("refuses anonymous, non-operator, and cross-template preview", async () => {
    const created = await createCanonicalTemplate({
      actorUserId: OPERATOR_ID,
      title: "Guarded preview",
      slug: "ctp-guard",
      serviceCategory: "DENTAL",
    });
    await saveCanonicalTemplateDraft({
      templateId: created.templateId,
      revisionId: created.revisionId,
      actorUserId: OPERATOR_ID,
      sections: [section(PUBLISHED_BODY)],
    });
    await publishCanonicalTemplateRevision({
      templateId: created.templateId,
      revisionId: created.revisionId,
      actorUserId: OPERATOR_ID,
      expectedVersion: 1,
    });
    const other = await createCanonicalTemplate({
      actorUserId: OPERATOR_ID,
      title: "Other preview",
      slug: "ctp-other",
      serviceCategory: "PHYSIOTHERAPY",
    });

    getAuthContextMock.mockResolvedValue({
      user: null,
      clinicMembership: null,
    });
    await expect(
      CanonicalTemplatePreviewPage({
        params: Promise.resolve({ templateId: created.templateId }),
      })
    ).rejects.toMatchObject({ digest: "NEXT_REDIRECT;/login" });

    getAuthContextMock.mockResolvedValue({
      user: {
        id: ADMIN_ID,
        email: "admin@ctp.example.test",
        name: "Clinic Admin",
        platformRole: "NONE",
      },
      clinicMembership: null,
    });
    await expect(
      CanonicalTemplateRevisionPreviewPage({
        params: Promise.resolve({
          templateId: created.templateId,
          revisionId: created.revisionId,
        }),
      })
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

    asOperator();
    await expect(
      CanonicalTemplateRevisionPreviewPage({
        params: Promise.resolve({
          templateId: other.templateId,
          revisionId: created.revisionId,
        }),
      })
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    await expect(
      CanonicalTemplatePreviewPage({
        params: Promise.resolve({ templateId: "missing-template" }),
      })
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it("keeps sample lifecycle actions unavailable and still allows preview", async () => {
    const sample = await getPrisma().guideTemplate.findUnique({
      where: { slug: "extraction" },
      select: { id: true, isSample: true },
    });
    expect(sample?.isSample).toBe(true);
    const html = renderToStaticMarkup(
      await OperatorTemplateDetailPage({
        params: Promise.resolve({ templateId: sample?.id ?? "" }),
        searchParams: Promise.resolve({}),
      })
    );
    expect(html).toContain("Sample");
    expect(html).toContain("Preview patient guide");
    expect(html).toContain("River Aftercare Demo Clinic");
    expect(html).not.toContain("Deactivate");
    expect(html).not.toContain("Reactivate");
    expect(html).not.toContain("Delete template");
    expect(html).not.toContain('data-template-edit="create-draft"');
  });
});
