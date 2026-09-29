/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/app/(staff)/(operator)/operator/templates/actions", () => ({
  saveCanonicalTemplateDraftAction: vi.fn(async () => ({})),
  publishCanonicalTemplateRevisionAction: vi.fn(async () => ({})),
  recordCanonicalTemplateReviewAction: vi.fn(async () => ({})),
  abandonCanonicalTemplateDraftAction: vi.fn(async () => ({})),
  createCanonicalTemplateDraftAction: vi.fn(async () => ({})),
  deactivateCanonicalTemplateAction: vi.fn(async () => ({})),
  reactivateCanonicalTemplateAction: vi.fn(async () => ({})),
}));

import { CanonicalDraftEditor } from "@/app/(staff)/(operator)/operator/templates/canonical-draft-editor";
import { canonicalEditorContentSignature } from "@/lib/aftercare/canonical-editor-content";
import { REVIEW_INVALIDATION_WARNING } from "@/lib/aftercare/canonical-editor-content";
import type { EditorSection } from "@/app/(staff)/(clinic-portal)/guides/timeline-accordion";

const sections: EditorSection[] = [
  {
    key: "intro",
    kind: "INTRODUCTION",
    title: "Example introduction",
    body: "Example introduction",
    periodLabel: "",
    startDay: "",
    endDay: "",
    homeCareInstructions: [],
  },
  {
    key: "stage",
    kind: "RECOVERY_TIMELINE",
    title: "Example timeline instruction",
    body: "Example timeline instruction",
    periodLabel: "Example period",
    startDay: "0",
    endDay: "1",
    homeCareInstructions: [],
  },
  {
    key: "plan",
    kind: "HOME_CARE_PLAN",
    title: "Home care plan",
    body: "",
    periodLabel: "",
    startDay: "",
    endDay: "",
    homeCareInstructions: [
      {
        key: "item",
        title: "Example home-care item",
        body: "",
        frequencyCount: "1",
        frequencyPeriod: "DAY",
        timingLabel: "Evening",
        durationValue: "7",
        durationUnit: "DAYS",
      },
    ],
  },
];

describe("canonical draft editor", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    HTMLElement.prototype.scrollIntoView = () => undefined;
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function render(
    reviewed: boolean,
    signature = canonicalEditorContentSignature(sections)
  ) {
    act(() => {
      root.render(
        <CanonicalDraftEditor
          templateId="template"
          templateTitle="Tooth Extraction"
          revisionId="revision"
          version={1}
          reviewed={reviewed}
          reviewSummary={
            reviewed
              ? {
                  reviewerName: "Example Reviewer",
                  reviewerCredential: "Example credential",
                  reviewNote: "Example note",
                  reviewedAtLabel: "27 Sept 2026, 12:00",
                  recordedByLabel: "River Operator",
                }
              : null
          }
          savedContentSignature={signature}
          initialSections={sections}
          isActive
          neverPublished={false}
          reviewerName={reviewed ? "Example Reviewer" : ""}
          reviewerCredential={reviewed ? "Example credential" : ""}
          reviewNote={reviewed ? "Example note" : ""}
        />
      );
    });
  }

  it("loads ordinary, timeline, and home-care content and keeps a reviewed draft quiet until it changes", () => {
    render(true);
    expect(container.textContent).toContain("Example introduction");
    expect(container.textContent).toContain("Example timeline instruction");
    expect(
      (container.querySelector("#item-title") as HTMLInputElement).value
    ).toBe("Example home-care item");
    expect(container.textContent).toContain("Review recorded");
    expect(container.textContent).toContain("Example Reviewer");
    expect(container.textContent).toContain("Recorded by River Operator");
    expect(container.textContent).not.toContain(REVIEW_INVALIDATION_WARNING);

    const intro = container.querySelector(
      '[data-section-key="intro"] button[aria-expanded]'
    ) as HTMLButtonElement;
    act(() => {
      intro.click();
    });
    const title = container.querySelector("#intro-title") as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    act(() => {
      setValue?.call(title, "Example introduction revised");
      title.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(container.textContent).toContain(REVIEW_INVALIDATION_WARNING);
    expect(container.textContent).toContain("Review recorded");
    expect(container.textContent).toContain("Unsaved changes");
  });

  it("asks for review before publication when the draft is unreviewed", () => {
    render(false);
    const publish = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Publish revision")
    );
    expect(publish?.hasAttribute("disabled")).toBe(true);
    expect(container.textContent).toContain(
      "Record a complete review before publishing this revision."
    );
    expect(container.textContent).toContain("Not reviewed");
  });

  it("keeps save in the sticky toolbar and warns before clearing a review", () => {
    render(true);
    const toolbar = container.querySelector(
      "[data-canonical-toolbar]"
    ) as HTMLElement;
    const reviewField = container.querySelector(
      "#reviewerName"
    ) as HTMLInputElement;
    const publish = [...toolbar.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Publish revision")
    ) as HTMLButtonElement;
    expect(publish.disabled).toBe(false);
    expect(toolbar.textContent).toContain("Templates");
    expect(toolbar.textContent).toContain("Tooth Extraction");
    expect(toolbar.textContent).toContain("Draft v1");
    expect(toolbar.querySelector('a[href="/operator/templates"]')).toBeTruthy();
    expect(
      toolbar.querySelector('a[href="/operator/templates/template"]')
    ).toBeTruthy();
    expect(toolbar.querySelector('[aria-label="More actions"]')).toBeTruthy();
    expect(toolbar.textContent).toContain("Abandon draft");
    expect(toolbar.textContent).toContain("Deactivate");
    expect(
      container.querySelector("#canonical-record-review")!.contains(reviewField)
    ).toBe(true);

    const intro = container.querySelector(
      '[data-section-key="intro"] button[aria-expanded]'
    ) as HTMLButtonElement;
    act(() => {
      intro.click();
    });
    const title = container.querySelector("#intro-title") as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    act(() => {
      setValue?.call(title, "Example introduction revised");
      title.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const saves = [...toolbar.querySelectorAll("button")].filter((button) =>
      button.textContent?.includes("Save draft")
    );
    expect(saves).toHaveLength(1);
    for (const save of saves) {
      expect(save.getAttribute("aria-describedby")).toBe(
        "draft-review-invalidation"
      );
      act(() => {
        save.click();
      });
      expect(container.textContent).toContain(
        "Save changes to reviewed content?"
      );
      expect(container.textContent).toContain(REVIEW_INVALIDATION_WARNING);
      const keep = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Keep editing"
      ) as HTMLButtonElement;
      act(() => {
        keep.click();
      });
      expect(container.textContent).not.toContain(
        "Save changes to reviewed content?"
      );
    }
  });

  it("keeps new section placeholders out of the saved payload", () => {
    render(false);
    const add = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Add section")
    ) as HTMLButtonElement;
    act(() => {
      add.click();
    });
    const hidden = container.querySelector(
      'input[name="sections"]'
    ) as HTMLInputElement;
    const payload = JSON.parse(hidden.value) as Array<{
      title: string;
      body: string;
    }>;
    const added = payload.at(-1);
    expect(added?.title).toBe("");
    expect(added?.body).toBe("");
    expect(hidden.value).not.toContain("Example section title");
    expect(hidden.value).not.toContain("Enter guidance...");
    const title = container.querySelector(
      "article:last-of-type input[id$='-title']"
    ) as HTMLInputElement;
    expect(title.value).toBe("");
    expect(title.placeholder).toBe("Example section title");
  });

  it("asks for review before the publish control when the draft is unreviewed", () => {
    render(false);
    const reviewHeading = [...container.querySelectorAll("h2")].find(
      (heading) => heading.textContent === "Record review"
    );
    const publishHeading = [...container.querySelectorAll("h2")].find(
      (heading) => heading.textContent === "Publish revision"
    );
    expect(reviewHeading).toBeTruthy();
    expect(publishHeading).toBeTruthy();
    expect(
      reviewHeading!.compareDocumentPosition(publishHeading!) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    const publish = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Publish revision")
    );
    expect(publish?.hasAttribute("disabled")).toBe(true);
  });

  it("represents every block in the outline and opens the selected stage", () => {
    render(false);
    const rail = container.querySelector(
      ".canonicalOutlineRail"
    ) as HTMLElement;
    expect(rail.textContent).toContain("Example introduction");
    expect(rail.textContent).toContain("Example period");
    expect(rail.textContent).toContain("Example timeline instruction");
    expect(rail.textContent).toContain("Home care plan");
    const stage = rail.querySelector(
      '[data-outline-key="stage"]'
    ) as HTMLButtonElement;
    act(() => {
      stage.click();
    });
    const article = container.querySelector(
      '[data-section-key="stage"]'
    ) as HTMLElement;
    expect(article.getAttribute("data-expanded")).toBe("true");
    expect(article.getAttribute("data-block-family")).toBe("timeline");
    const plan = container.querySelector(
      '[data-section-key="plan"]'
    ) as HTMLElement;
    expect(plan.getAttribute("data-block-family")).toBe("home-care");
    expect(plan.querySelector(".canonicalBlockBadge")?.textContent).toBe(
      "Home care"
    );
  });
});
