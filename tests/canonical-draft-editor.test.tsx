/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push, refresh } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push }),
}));

vi.mock("@/app/(staff)/(operator)/operator/templates/actions", () => ({
  saveCanonicalTemplateDraftAction: vi.fn(async () => ({})),
  publishCanonicalTemplateRevisionAction: vi.fn(async () => ({})),
  abandonCanonicalTemplateDraftAction: vi.fn(async () => ({})),
  createCanonicalTemplateDraftAction: vi.fn(async () => ({})),
  deactivateCanonicalTemplateAction: vi.fn(async () => ({})),
  reactivateCanonicalTemplateAction: vi.fn(async () => ({})),
  updateLiveDemoAction: vi.fn(async () => ({})),
}));

import { CanonicalDraftEditor } from "@/app/(staff)/(operator)/operator/templates/canonical-draft-editor";
import { saveCanonicalTemplateDraftAction } from "@/app/(staff)/(operator)/operator/templates/actions";
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
    push.mockReset();
    refresh.mockReset();
    vi.mocked(saveCanonicalTemplateDraftAction).mockReset();
    vi.mocked(saveCanonicalTemplateDraftAction).mockResolvedValue({});
    window.history.replaceState({}, "", "/operator/templates/template/draft");
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

  it("shows published content read-only until Edit creates the next revision", () => {
    act(() => {
      root.render(
        <CanonicalDraftEditor
          mode="published"
          templateId="template"
          templateTitle="Physiotherapy Home Exercise Plan"
          initialSections={sections}
          isActive
        />
      );
    });
    const workspace = container.querySelector(
      "[data-template-workspace='published']"
    );
    expect(workspace).toBeTruthy();
    expect(container.textContent).toContain("Published");
    expect(container.textContent).toContain("Published content");
    expect(container.textContent).toContain(
      "Creates a new editable revision. The published version remains unchanged until you publish the new draft."
    );
    expect(container.textContent).not.toContain("Save");
    expect(container.querySelector("#canonical-draft-form")).toBeNull();
    expect(container.querySelector('input[name="sections"]')).toBeNull();
    const pills = [
      ...container.querySelectorAll(
        "[data-canonical-toolbar] .staffStatusPill"
      ),
    ].map((pill) => pill.textContent);
    expect(pills).toEqual(["Production", "Published"]);
    expect(
      container.querySelector("a[href='/operator/templates/template']")
        ?.textContent
    ).toBe("Details");

    const intro = container.querySelector(
      '[data-section-key="intro"] button[aria-expanded]'
    ) as HTMLButtonElement;
    act(() => {
      intro.click();
    });
    const title = container.querySelector("#intro-title") as HTMLInputElement;
    expect(title.disabled).toBe(true);
    expect(title.value).toBe("Example introduction");
    expect(
      container.querySelector(
        "#create-published-revision-form input[name='templateId']"
      )
    ).toHaveProperty("value", "template");
    const edit = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Edit"
    ) as HTMLButtonElement;
    expect(edit.getAttribute("form")).toBe("create-published-revision-form");
    expect(edit.className).toContain("staffBtnPrimary");
    expect(container.textContent).not.toContain("Revision ");
    expect(container.textContent).not.toContain("Save changes before leaving?");
    const templates = container.querySelector(
      'a[href="/operator/templates"]'
    ) as HTMLAnchorElement;
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    act(() => {
      templates.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
  });

  it("guards dirty draft navigation without treating disclosures as edits", async () => {
    render();
    const intro = container.querySelector(
      '[data-section-key="intro"] button[aria-expanded]'
    ) as HTMLButtonElement;
    const instruction = container.querySelector(
      ".homeCareInstructionToggle"
    ) as HTMLButtonElement;
    const schedule = container.querySelector(
      ".homeCareScheduleToggle"
    ) as HTMLButtonElement;
    expect(schedule.getAttribute("aria-expanded")).toBe("true");
    act(() => {
      intro.click();
      instruction.click();
      schedule.click();
    });
    expect(instruction.getAttribute("aria-expanded")).toBe("true");
    expect(schedule.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector('[data-tone="warning"]')).toBeNull();
    expect(unloadBlocked()).toBe(false);

    const templates = container.querySelector(
      'a[href="/operator/templates"]'
    ) as HTMLAnchorElement;
    const cleanClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    act(() => {
      templates.dispatchEvent(cleanClick);
    });
    expect(cleanClick.defaultPrevented).toBe(false);
    expect(leaveDialog()?.hasAttribute("open")).toBe(false);

    setField("#item-timing", "Morning");
    expect(container.querySelector('[data-tone="warning"]')?.textContent).toBe(
      "Unsaved changes"
    );
    const publishWhileDirty = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Publish"
    ) as HTMLButtonElement;
    expect(publishWhileDirty.disabled).toBe(true);

    setField("#intro-title", "Example introduction revised");
    expect(container.querySelector('[data-tone="warning"]')?.textContent).toBe(
      "Unsaved changes"
    );
    expect(container.textContent).toContain(
      "Save the current draft before publishing."
    );
    const publish = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Publish"
    ) as HTMLButtonElement;
    expect(publish.disabled).toBe(true);
    act(() => {
      publish.click();
    });
    const publishDialog = [...container.querySelectorAll("dialog")].find(
      (dialog) => dialog.textContent?.includes("Publish this revision?")
    );
    expect(publishDialog?.hasAttribute("open")).toBe(false);
    expect(unloadBlocked()).toBe(true);

    const blocked = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    act(() => {
      templates.dispatchEvent(blocked);
    });
    expect(blocked.defaultPrevented).toBe(true);
    expect(leaveDialog()?.hasAttribute("open")).toBe(true);

    act(() => {
      dialogButton("Stay").click();
    });
    expect(leaveDialog()?.hasAttribute("open")).toBe(false);
    expect(
      (container.querySelector("#intro-title") as HTMLInputElement).value
    ).toBe("Example introduction revised");

    act(() => {
      templates.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })
      );
    });
    act(() => {
      dialogButton("Leave without saving").click();
    });
    expect(push).toHaveBeenCalledWith("/operator/templates");
    expect(saveCanonicalTemplateDraftAction).not.toHaveBeenCalled();
    expect(
      (container.querySelector("#intro-title") as HTMLInputElement).value
    ).toBe("Example introduction revised");
  });

  it("saves before leaving and stays when that save fails", async () => {
    render();
    const intro = container.querySelector(
      '[data-section-key="intro"] button[aria-expanded]'
    ) as HTMLButtonElement;
    act(() => {
      intro.click();
    });
    setField("#intro-title", "Example introduction revised");
    const templates = container.querySelector(
      'a[href="/operator/templates"]'
    ) as HTMLAnchorElement;
    vi.mocked(saveCanonicalTemplateDraftAction).mockResolvedValue({
      error: "Could not save this draft.",
    });
    act(() => {
      templates.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })
      );
    });
    await act(async () => {
      dialogButton("Save and leave").click();
    });
    expect(saveCanonicalTemplateDraftAction).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Could not save this draft.");
    expect(leaveDialog()?.hasAttribute("open")).toBe(false);
    expect(
      (container.querySelector("#intro-title") as HTMLInputElement).value
    ).toBe("Example introduction revised");

    const save = [
      ...(
        container.querySelector("[data-canonical-toolbar]") as HTMLElement
      ).querySelectorAll("button"),
    ].find((button) => button.textContent === "Save") as HTMLButtonElement;
    vi.mocked(saveCanonicalTemplateDraftAction).mockImplementation(
      async () => ({
        ok: true,
      })
    );
    await act(async () => {
      save.click();
    });
    expect(container.querySelector('[data-tone="warning"]')).toBeNull();
    expect(unloadBlocked()).toBe(false);

    setField("#intro-title", "Example introduction revised again");
    expect(container.querySelector('[data-tone="warning"]')?.textContent).toBe(
      "Unsaved changes"
    );
    expect(unloadBlocked()).toBe(true);

    act(() => {
      templates.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })
      );
    });
    await act(async () => {
      dialogButton("Save and leave").click();
    });
    expect(push).toHaveBeenCalledWith("/operator/templates");
    expect(container.querySelector('[data-tone="warning"]')).toBeNull();
  });
});

function leaveDialog() {
  return [...document.querySelectorAll("dialog")].find((dialog) =>
    dialog.textContent?.includes("Save changes before leaving?")
  );
}

function dialogButton(label: string) {
  return [...(leaveDialog()?.querySelectorAll("button") ?? [])].find(
    (button) => button.textContent === label
  ) as HTMLButtonElement;
}

function setField(selector: string, value: string) {
  const field = document.querySelector(selector) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  act(() => {
    setter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function unloadBlocked() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
