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
  abandonCanonicalTemplateDraftAction: vi.fn(async () => ({})),
  createCanonicalTemplateDraftAction: vi.fn(async () => ({})),
  deactivateCanonicalTemplateAction: vi.fn(async () => ({})),
  reactivateCanonicalTemplateAction: vi.fn(async () => ({})),
}));

import { CanonicalDraftEditor } from "@/app/(staff)/(operator)/operator/templates/canonical-draft-editor";
import { canonicalEditorContentSignature } from "@/lib/aftercare/canonical-editor-content";
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

  function render(signature = canonicalEditorContentSignature(sections)) {
    act(() => {
      root.render(
        <CanonicalDraftEditor
          templateId="template"
          templateTitle="Tooth Extraction"
          revisionId="revision"
          version={1}
          savedContentSignature={signature}
          initialSections={sections}
          isActive
          neverPublished={false}
        />
      );
    });
  }

  it("loads ordinary, timeline, and home-care content and marks unsaved edits", () => {
    render();
    expect(container.textContent).toContain("Example introduction");
    expect(container.textContent).toContain("Example timeline instruction");
    expect(
      (container.querySelector("#item-title") as HTMLInputElement).value
    ).toBe("Example home-care item");
    expect(container.textContent).not.toContain("Review recorded");
    expect(container.textContent).not.toContain("Not reviewed");
    expect(container.textContent).not.toContain("Record review");

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

    expect(container.textContent).toContain("Unsaved changes");
    expect(container.textContent).not.toContain(
      "invalidate the recorded review"
    );
  });

  it("offers Publish for a draft that has no review metadata", () => {
    render();
    const publish = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Publish"
    );
    expect(publish?.hasAttribute("disabled")).toBe(false);
    expect(container.textContent).not.toContain(
      "Record a complete review before publishing this revision."
    );
    expect(container.textContent).not.toContain("Not reviewed");
    act(() => {
      publish?.click();
    });
    expect(container.textContent).toContain("Publish this revision?");
    expect(container.textContent).toContain("becomes immutable");
  });

  it("keeps Save and Publish in the sticky toolbar", () => {
    render();
    const toolbar = container.querySelector(
      "[data-canonical-toolbar]"
    ) as HTMLElement;
    const publish = [...toolbar.querySelectorAll("button")].find(
      (button) => button.textContent === "Publish"
    ) as HTMLButtonElement;
    expect(publish.disabled).toBe(false);
    expect(toolbar.textContent).toContain("Templates");
    expect(toolbar.textContent).toContain("Tooth Extraction");
    expect(toolbar.textContent).not.toContain("Draft v");
    expect(toolbar.querySelector('[aria-current="page"]')?.textContent).toBe(
      "Draft"
    );
    expect(
      toolbar.querySelector('.staffStatusPill[data-tone="draft"]')?.textContent
    ).toBe("Draft");
    expect(toolbar.querySelector('a[href="/operator/templates"]')).toBeTruthy();
    expect(
      toolbar.querySelector('a[href="/operator/templates/template"]')
    ).toBeTruthy();
    expect(toolbar.querySelector('[aria-label="More actions"]')).toBeTruthy();
    expect(toolbar.textContent).toContain("Abandon draft");
    expect(toolbar.textContent).toContain("Deactivate");
    expect(container.querySelector("#reviewerName")).toBeNull();
    expect(container.querySelector("#canonical-record-review")).toBeNull();

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

    const saves = [...toolbar.querySelectorAll("button")].filter(
      (button) => button.textContent === "Save"
    );
    expect(saves).toHaveLength(1);
    expect(saves[0]?.getAttribute("aria-describedby")).toBeNull();
    expect(container.textContent).not.toContain(
      "Save changes to reviewed content?"
    );
  });

  it("keeps new section placeholders out of the saved payload", () => {
    render();
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

  it("keeps Publish in the toolbar without a review step", () => {
    render();
    expect(
      [...container.querySelectorAll("h2")].some(
        (heading) => heading.textContent === "Record review"
      )
    ).toBe(false);
    const toolbar = container.querySelector(
      "[data-canonical-toolbar]"
    ) as HTMLElement;
    const publish = [...toolbar.querySelectorAll("button")].find(
      (button) => button.textContent === "Publish"
    );
    expect(publish?.hasAttribute("disabled")).toBe(false);
  });

  it("keeps a collapsed instruction in the save payload", () => {
    render();
    const instruction = container.querySelector(
      '[data-instruction-key="item"]'
    ) as HTMLElement;
    const toggle = instruction.querySelector(
      "button[aria-expanded]"
    ) as HTMLButtonElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    act(() => {
      toggle.click();
    });
    const title = container.querySelector("#item-title") as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    act(() => {
      setValue?.call(title, "Collapsed exercise");
      title.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      toggle.click();
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(
      (container.querySelector("#item-title") as HTMLInputElement).value
    ).toBe("Collapsed exercise");
    const hidden = container.querySelector(
      'input[name="sections"]'
    ) as HTMLInputElement;
    const payload = JSON.parse(hidden.value) as Array<{
      kind: string;
      homeCareInstructions: Array<{
        title: string;
        frequencyCount: number | null;
        timingLabel: string | null;
        durationValue: number | null;
      }>;
    }>;
    const plan = payload.find((section) => section.kind === "HOME_CARE_PLAN");
    expect(plan?.homeCareInstructions[0]).toMatchObject({
      title: "Collapsed exercise",
      frequencyCount: 1,
      timingLabel: "Evening",
      durationValue: 7,
    });
  });

  it("represents every block in the outline and opens the selected stage", () => {
    render();
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
