import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { REVIEW_INVALIDATION_WARNING } from "@/lib/aftercare/canonical-editor-content";
import { filterOperatorTemplates } from "@/lib/operator/canonical-templates/list-operator-canonical-templates";
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
    expect(actions).toContain("recordCanonicalTemplateReview");
    expect(actions).toContain("publishCanonicalTemplateRevision");
    expect(actions).toContain("createCanonicalTemplateDraft");
    expect(actions).toContain("abandonCanonicalTemplateDraft");
    expect(actions).toContain("deactivateCanonicalTemplate");
    expect(actions).toContain("reactivateCanonicalTemplate");
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
    expect(draft).not.toContain("GuideEditor");
    expect(editor).toContain("REVIEW_INVALIDATION_WARNING");
    expect(editor).toContain("Publish revision");
    expect(editor).toContain("becomes immutable");
    expect(REVIEW_INVALIDATION_WARNING).toBe(
      "Changing reviewed content will invalidate the recorded review. The revision will need to be reviewed again before publication."
    );
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
    const review = readFileSync(
      "app/(staff)/(operator)/operator/templates/record-review-form.tsx",
      "utf8"
    );
    const nav = readFileSync(
      "app/(staff)/(operator)/components/operator-platform-nav.tsx",
      "utf8"
    );
    expect(list).toContain("TemplateOriginBadge");
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
    expect(review).toContain("Record review");
    expect(review).toContain("Replace review evidence");
    expect(review).not.toContain("reviewRecordedByUserId");
    expect(review).not.toContain("Approve");
    expect(nav).toContain('href: "/operator/templates", label: "Templates"');
  });

  it("filters production and sample rows without collapsing their states", () => {
    const templates = [
      item({
        id: "production",
        title: "Example template",
        serviceCategory: "PHYSIOTHERAPY",
        serviceCategoryLabel: "Physiotherapy",
        latestPublishedVersion: 1,
        draft: { version: 2, reviewed: true },
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
    expect(templates[0]?.draft).toEqual({ version: 2, reviewed: true });
  });
});
