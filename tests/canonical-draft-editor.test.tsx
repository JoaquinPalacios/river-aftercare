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
        />
      );
    });
  }

  it("loads ordinary, timeline, and home-care content and keeps a reviewed draft quiet until it changes", () => {
    render(true);
    expect(container.textContent).toContain("Example introduction");
    expect(container.textContent).toContain("Example timeline instruction");
    expect(container.textContent).toContain("Example home-care item");
    expect(container.textContent).toContain("Review recorded");
    expect(container.textContent).toContain("Example Reviewer");
    expect(container.textContent).toContain("Recorded by River Operator");
    expect(container.textContent).not.toContain(REVIEW_INVALIDATION_WARNING);

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
});
