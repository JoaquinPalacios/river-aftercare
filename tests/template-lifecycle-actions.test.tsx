/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(staff)/(operator)/operator/templates/actions", () => ({
  abandonCanonicalTemplateDraftAction: vi.fn(async () => ({})),
  createCanonicalTemplateDraftAction: vi.fn(async () => ({})),
  deactivateCanonicalTemplateAction: vi.fn(async () => ({})),
  reactivateCanonicalTemplateAction: vi.fn(async () => ({})),
}));

import { TemplateLifecycleActions } from "@/app/(staff)/(operator)/operator/templates/template-lifecycle-actions";

describe("abandon draft dialog", () => {
  let container: HTMLDivElement;
  let root: Root;
  let requestSubmit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
    };
    requestSubmit = vi
      .spyOn(HTMLFormElement.prototype, "requestSubmit")
      .mockImplementation(() => undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <TemplateLifecycleActions
          templateId="template"
          draftId="draft"
          neverPublished
          isActive
          canCreateRevision={false}
        />
      );
    });
  });

  afterEach(() => {
    requestSubmit.mockRestore();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function openDelete() {
    const open = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Delete template"
    ) as HTMLButtonElement;
    act(() => {
      open.click();
    });
  }

  it("keeps the unpublished template when the secondary action is chosen", () => {
    expect(container.textContent).not.toContain("Abandon draft");
    openDelete();
    const dialog = [...container.querySelectorAll("dialog")].find((item) =>
      item.textContent?.includes("Delete this template?")
    ) as HTMLDialogElement;
    expect(dialog.textContent).toContain(
      "permanently removes the template and its unpublished draft"
    );
    const actions = dialog.querySelector(".staffDialogActionsBalanced");
    expect(actions).toBeTruthy();
    const keep = [...dialog.querySelectorAll("button")].find(
      (button) => button.textContent === "Cancel"
    ) as HTMLButtonElement;
    const remove = [...dialog.querySelectorAll("button")].find(
      (button) => button.textContent === "Delete template"
    ) as HTMLButtonElement;
    expect(keep.className).toContain("staffBtnSecondary");
    expect(remove.className).toContain("staffBtnDanger");
    act(() => {
      keep.click();
    });
    expect(requestSubmit).not.toHaveBeenCalled();
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("submits the existing abandon action for a never-published template", () => {
    openDelete();
    const dialog = [...container.querySelectorAll("dialog")].find((item) =>
      item.textContent?.includes("Delete this template?")
    ) as HTMLDialogElement;
    const remove = [...dialog.querySelectorAll("button")].find(
      (button) => button.textContent === "Delete template"
    ) as HTMLButtonElement;
    act(() => {
      remove.click();
    });
    expect(requestSubmit).toHaveBeenCalledTimes(1);
    expect(requestSubmit.mock.instances[0]).toBe(
      container.querySelector("#abandon-draft-form")
    );
  });

  it("abandons only the later draft of a published template", () => {
    act(() => {
      root.render(
        <TemplateLifecycleActions
          templateId="template"
          draftId="draft-v2"
          neverPublished={false}
          isActive
          canCreateRevision={false}
          presentation="menu"
        />
      );
    });
    expect(container.textContent).not.toContain("Delete template");
    const open = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Abandon draft"
    ) as HTMLButtonElement;
    act(() => {
      open.click();
    });
    const dialog = [...container.querySelectorAll("dialog")].find((item) =>
      item.textContent?.includes("Abandon this draft?")
    ) as HTMLDialogElement;
    expect(dialog.textContent).toContain("Only this draft is removed");
    const abandon = [...dialog.querySelectorAll("button")].find(
      (button) => button.textContent === "Abandon draft"
    ) as HTMLButtonElement;
    act(() => {
      abandon.click();
    });
    expect(requestSubmit.mock.instances.at(-1)).toBe(
      container.querySelector("#abandon-draft-form")
    );
  });

  it("uses equal-width actions that stack on a narrow viewport", () => {
    const css = readFileSync("app/(staff)/staff.css", "utf8");
    const block = css.slice(
      css.indexOf(".staffDialogActionsBalanced {"),
      css.indexOf(".staffSectionOrder {")
    );
    expect(block).toContain("flex: 1 1 0");
    expect(block).toContain("min-height: 2.75rem");
    expect(block).toContain("flex-direction: column");
    expect(block).toContain("max-width: 40rem");
  });
});
