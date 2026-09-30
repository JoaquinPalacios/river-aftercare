import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  filterOperatorTemplates,
  operatorTemplateHref,
} from "@/lib/operator/canonical-templates/list-operator-canonical-templates";
import type { OperatorTemplateListItem } from "@/lib/operator/canonical-templates/list-operator-canonical-templates";

const pages = [
  "app/(staff)/(operator)/operator/templates/page.tsx",
  "app/(staff)/(operator)/operator/templates/new/page.tsx",
  "app/(staff)/(operator)/operator/templates/[templateId]/page.tsx",
  "app/(staff)/(operator)/operator/templates/[templateId]/draft/page.tsx",
];

const actions = readFileSync(
  "app/(staff)/(operator)/operator/templates/actions.ts",
  "utf8"
);

function item(
  overrides: Partial<OperatorTemplateListItem> &
    Pick<OperatorTemplateListItem, "id" | "title">
): OperatorTemplateListItem {
  return {
    slug: "example",
    serviceCategory: "DENTAL",
    serviceCategoryLabel: "Dental",
    isActive: true,
    isSample: false,
    latestPublishedVersion: null,
    draft: null,
    ...overrides,
  };
}

describe("operator template manager UI contract", () => {
  it("guards every template page and action with the existing Operator check", () => {
    for (const page of pages) {
      expect(readFileSync(page, "utf8"), page).toContain(
        "requirePlatformOperator"
      );
    }
    expect(actions).toContain("requirePlatformOperator");
    expect(actions.match(/await requirePlatformOperator\(\)/g)?.length).toBe(9);
  });

  it("calls lifecycle services instead of writing template rows itself", () => {
    expect(actions).toContain("createCanonicalTemplate");
    expect(actions).toContain("updateCanonicalTemplateMetadata");
    expect(actions).toContain("saveCanonicalTemplateDraft");
    expect(actions).not.toContain("recordCanonicalTemplateReview");
    expect(actions).toContain("publishCanonicalTemplateRevision");
    expect(actions).toContain("createCanonicalTemplateDraft");
    expect(actions).toContain("abandonCanonicalTemplateDraft");
    expect(actions).toContain("deactivateCanonicalTemplate");
    expect(actions).toContain("reactivateCanonicalTemplate");
    expect(actions).toContain("publishCanonicalTemplates");
    expect(actions).toContain("deactivateCanonicalTemplates");
    expect(actions).toContain("reactivateCanonicalTemplates");
    expect(actions).toContain("deleteNeverPublishedCanonicalTemplates");
    expect(actions).not.toMatch(/Unpublish/);
    expect(actions).not.toContain("guideTemplate.create");
    expect(actions).not.toContain("guideTemplate.update");
    expect(actions).not.toContain("isSample");
  });

  it("keeps the clinic guide editor out of the canonical draft screen", () => {
    const editor = readFileSync(
      "app/(staff)/(operator)/operator/templates/canonical-draft-editor.tsx",
      "utf8"
    );
    const draft = readFileSync(
      "app/(staff)/(operator)/operator/templates/[templateId]/draft/page.tsx",
      "utf8"
    );
    const toolbar = readFileSync(
      "app/(staff)/components/canonical-editor-toolbar.tsx",
      "utf8"
    );
    const preview = readFileSync(
      "app/(staff)/components/canonical-guide-preview.tsx",
      "utf8"
    );
    expect(editor).toContain("OrderedGuideSectionsEditor");
    expect(editor).toContain("CanonicalGuidePreview");
    expect(preview).toContain("GuideDocument");
    expect(preview).toContain("AFTERCARE_THEME_SCOPE");
    expect(preview).toContain("DEFAULT_AFTERCARE_THEME");
    expect(preview).toContain('data-patient-theme="portal"');
    expect(preview).toContain("not a");
    expect(preview).toContain("clinic-branded");
    expect(editor).not.toContain("GuideEditor");
    expect(editor).not.toContain("PRACTICE_REVIEW_ATTESTATION_LABEL");
    expect(editor).not.toContain("REVIEW_INVALIDATION_WARNING");
    expect(editor).not.toContain("Record review");
    expect(editor).not.toContain("Not reviewed");
    expect(editor).not.toContain("Publish revision");
    expect(draft).not.toContain("GuideEditor");
    expect(toolbar).toContain('saving ? "Saving…" : "Save"');
    expect(toolbar).toContain('publishing ? "Publishing…" : "Publish"');
    expect(toolbar).not.toContain("Save draft");
    expect(toolbar).not.toContain("Publish revision");
    expect(editor).toContain('confirmLabel="Publish"');
    expect(editor).toContain("becomes immutable");
  });

  it("labels the sample and does not offer production conversion", () => {
    const list = readFileSync(
      "app/(staff)/(operator)/operator/templates/page.tsx",
      "utf8"
    );
    const detail = readFileSync(
      "app/(staff)/(operator)/operator/templates/[templateId]/page.tsx",
      "utf8"
    );
    const create = readFileSync(
      "app/(staff)/(operator)/operator/templates/create-template-form.tsx",
      "utf8"
    );
    const nav = readFileSync(
      "app/(staff)/(operator)/components/operator-platform-nav.tsx",
      "utf8"
    );
    expect(list).toContain("TemplateBulkTable");
    const bulkTable = readFileSync(
      "app/(staff)/(operator)/operator/templates/template-bulk-table.tsx",
      "utf8"
    );
    expect(bulkTable).toContain("TemplateOriginBadge");
    expect(bulkTable).toContain("Select all rows on this page");
    expect(bulkTable).not.toMatch(/Unpublish/);
    expect(list).toContain("Create template");
    expect(list).toContain(
      "staffBtn staffBtnPrimary w-full whitespace-nowrap sm:w-auto sm:shrink-0"
    );
    expect(list).toContain("min-w-0 flex-1");
    expect(detail).toContain("Sample");
    expect(detail).toContain("isSample");
    expect(detail).not.toContain('name="isSample"');
    expect(create).not.toContain("isSample");
    expect(create).toContain("SERVICE_CATEGORY_LABELS");
    const labels = readFileSync("lib/aftercare/service-category.ts", "utf8");
    expect(labels).toContain('DENTAL: "Dental"');
    expect(labels).toContain('PHYSIOTHERAPY: "Physiotherapy"');
    expect(labels).toContain('CHIROPRACTIC: "Chiropractic"');
    expect(labels).toContain('COSMETIC_AESTHETIC: "Cosmetic & Aesthetic"');
    expect(detail).not.toContain("Record review");
    expect(detail).not.toContain("Not reviewed");
    expect(detail).not.toContain("Review recorded");
    expect(list).toContain("operatorTemplateHref");
    expect(list.replace(/\s+/g, " ")).toContain(
      "Save keeps a draft. Publish releases it."
    );
    const createPage = readFileSync(
      "app/(staff)/(operator)/operator/templates/new/page.tsx",
      "utf8"
    );
    const lifecycle = readFileSync(
      "app/(staff)/(operator)/operator/templates/template-lifecycle-actions.tsx",
      "utf8"
    );
    const notices = readFileSync(
      "lib/operator/canonical-templates/notices.ts",
      "utf8"
    );
    for (const source of [list, detail, createPage, lifecycle, notices]) {
      expect(source).not.toContain("Not reviewed");
      expect(source).not.toContain("Review evidence");
      expect(source).not.toContain("review come later");
    }
    expect(notices).toContain(
      "The template and its unpublished draft were permanently removed."
    );
    expect(nav).toContain('href: "/operator/templates", label: "Templates"');
  });

  it("opens a production draft directly and keeps sample rows on the detail page", () => {
    expect(
      operatorTemplateHref(
        item({
          id: "drafting",
          title: "Open draft",
          draft: { id: "draft-1", version: 1 },
        })
      )
    ).toBe("/operator/templates/drafting/draft");
    expect(
      operatorTemplateHref(
        item({
          id: "published",
          title: "Published only",
          latestPublishedVersion: 2,
        })
      )
    ).toBe("/operator/templates/published");
    expect(
      operatorTemplateHref(
        item({
          id: "sample",
          title: "Tooth Extraction",
          slug: "extraction",
          isSample: true,
          latestPublishedVersion: 1,
          draft: { id: "draft-2", version: 2 },
        })
      )
    ).toBe("/operator/templates/sample");
  });

  it("filters production and sample rows without collapsing their states", () => {
    const templates = [
      item({
        id: "production",
        title: "Example template",
        serviceCategory: "PHYSIOTHERAPY",
        serviceCategoryLabel: "Physiotherapy",
        latestPublishedVersion: 1,
        draft: { id: "draft-2", version: 2 },
      }),
      item({
        id: "sample",
        title: "Tooth Extraction",
        slug: "extraction",
        isSample: true,
        latestPublishedVersion: 1,
      }),
      item({
        id: "inactive",
        title: "Paused example",
        isActive: false,
        serviceCategory: "DENTAL",
        serviceCategoryLabel: "Dental",
      }),
    ];

    expect(
      filterOperatorTemplates(templates, { serviceCategory: "DENTAL" }).map(
        (template) => template.id
      )
    ).toEqual(["sample", "inactive"]);
    expect(
      filterOperatorTemplates(templates, { activity: "inactive" }).map(
        (template) => template.id
      )
    ).toEqual(["inactive"]);
    expect(
      filterOperatorTemplates(templates, { publication: "draft" }).map(
        (template) => template.id
      )
    ).toEqual(["production"]);
    expect(templates[0]?.serviceCategoryLabel).toBe("Physiotherapy");
    expect(templates[1]?.isSample).toBe(true);
    expect(templates[0]?.latestPublishedVersion).toBe(1);
    expect(templates[0]?.draft).toEqual({ id: "draft-2", version: 2 });
  });

  it("shows current template status without version labels and keeps revision history numbered", () => {
    const list = readFileSync(
      "app/(staff)/(operator)/operator/templates/template-bulk-table.tsx",
      "utf8"
    );
    const badges = readFileSync(
      "app/(staff)/(operator)/operator/templates/template-badges.tsx",
      "utf8"
    );
    const detail = readFileSync(
      "app/(staff)/(operator)/operator/templates/[templateId]/page.tsx",
      "utf8"
    );
    const draft = readFileSync(
      "app/(staff)/(operator)/operator/templates/[templateId]/draft/page.tsx",
      "utf8"
    );
    const toolbar = readFileSync(
      "app/(staff)/components/canonical-editor-toolbar.tsx",
      "utf8"
    );
    const editor = readFileSync(
      "app/(staff)/(operator)/operator/templates/canonical-draft-editor.tsx",
      "utf8"
    );
    const styles = readFileSync("app/(staff)/staff.css", "utf8");
    const pillStart = styles.indexOf(".staffStatusPill {");
    const pillRule = styles.slice(pillStart, styles.indexOf("}", pillStart));

    expect(list).toContain("Published");
    expect(list).not.toContain("v{template.latestPublishedVersion} Published");
    expect(badges).toContain("Draft");
    expect(badges).not.toContain("Draft v");
    expect(detail).toContain('"Published"');
    expect(detail).toMatch(/>\s*Draft\s*</);
    expect(detail).toContain("Revision {revision.version}");
    expect(detail).not.toContain("Draft v");
    expect(detail).not.toContain("v${");
    expect(draft).toContain('{ label: "Draft" }');
    expect(draft).toContain("{template.title}");
    expect(draft).toMatch(/>\s*Draft\s*</);
    expect(draft).not.toContain("Draft v");
    expect(toolbar).toContain('{ label: "Draft" }');
    expect(toolbar).toMatch(/>\s*Draft\s*</);
    expect(toolbar).not.toContain("Draft v");
    expect(editor).toContain('name="expectedVersion"');
    expect(editor).toContain("value={String(version)}");
    expect(pillRule).toContain("display: inline-flex");
    expect(pillRule).toContain("white-space: nowrap");
    expect(pillRule).toContain("width: fit-content");
  });
});
