/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

vi.mock("@/app/(staff)/(operator)/operator/templates/actions", () => ({
  createCanonicalTemplateAction: vi.fn(async () => ({})),
}));

import { CreateTemplateForm } from "@/app/(staff)/(operator)/operator/templates/create-template-form";
import { createCanonicalTemplateAction } from "@/app/(staff)/(operator)/operator/templates/actions";

describe("create template form", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
    };
    push.mockReset();
    vi.mocked(createCanonicalTemplateAction).mockReset();
    vi.mocked(createCanonicalTemplateAction).mockResolvedValue({});
    window.history.replaceState({}, "", "/operator/templates/new");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<CreateTemplateForm />);
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function submitButton() {
    return [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Create template"
    ) as HTMLButtonElement;
  }

  function setValue(
    element: HTMLInputElement | HTMLSelectElement,
    value: string
  ) {
    const prototype =
      element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    act(() => {
      setter?.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  it("keeps Create template disabled until title, slug, and category are valid", () => {
    const button = submitButton();
    expect(button.disabled).toBe(true);
    expect(button.className).toContain("staffBtn");
    expect(button.className).toContain("staffBtnPrimary");
    const css = readFileSync("app/(staff)/staff.css", "utf8");
    const disabled = css.slice(
      css.indexOf(".staffBtn:disabled {"),
      css.indexOf(".staffLoginSubmit {")
    );
    expect(disabled).toContain("cursor: not-allowed");
    expect(disabled).toContain("opacity: 0.6");
    expect(css).toContain(".staffBtnPrimary:hover:not(:disabled)");

    setValue(
      container.querySelector("#title") as HTMLInputElement,
      "Shoulder mobility"
    );
    expect(submitButton().disabled).toBe(true);
    setValue(
      container.querySelector("#slug") as HTMLInputElement,
      "extraction"
    );
    setValue(
      container.querySelector("#serviceCategory") as HTMLSelectElement,
      "PHYSIOTHERAPY"
    );
    expect(submitButton().disabled).toBe(true);

    setValue(
      container.querySelector("#slug") as HTMLInputElement,
      "shoulder-mobility"
    );
    expect(submitButton().disabled).toBe(false);
  });

  it("blocks an incomplete template and creates a valid one before leaving", async () => {
    const link = document.createElement("a");
    link.href = "/operator/templates";
    link.textContent = "Templates";
    document.body.append(link);

    act(() => {
      setValue(
        container.querySelector("#title") as HTMLInputElement,
        "Shoulder"
      );
    });
    const blocked = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    act(() => {
      link.dispatchEvent(blocked);
    });
    expect(blocked.defaultPrevented).toBe(true);
    const saveAndLeave = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Save and leave"
    ) as HTMLButtonElement;
    expect(saveAndLeave.disabled).toBe(true);
    expect(container.textContent).toContain(
      "Complete the required fields before saving."
    );

    act(() => {
      (
        [...container.querySelectorAll("button")].find(
          (button) => button.textContent === "Stay"
        ) as HTMLButtonElement
      ).click();
    });
    expect((container.querySelector("#title") as HTMLInputElement).value).toBe(
      "Shoulder"
    );

    setValue(
      container.querySelector("#title") as HTMLInputElement,
      "Shoulder mobility"
    );
    setValue(
      container.querySelector("#slug") as HTMLInputElement,
      "shoulder-mobility"
    );
    setValue(
      container.querySelector("#serviceCategory") as HTMLSelectElement,
      "PHYSIOTHERAPY"
    );
    act(() => {
      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })
      );
    });
    const enabled = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Save and leave"
    ) as HTMLButtonElement;
    expect(enabled.disabled).toBe(false);
    await act(async () => {
      enabled.click();
    });
    expect(createCanonicalTemplateAction).toHaveBeenCalled();
    const formData = vi.mocked(createCanonicalTemplateAction).mock
      .calls[0]?.[1] as FormData;
    expect(formData.get("title")).toBe("Shoulder mobility");
    expect(formData.get("slug")).toBe("shoulder-mobility");
    expect(formData.get("next")).toBe("/operator/templates");
    link.remove();
  });

  it("creates a valid template from browser Back when there is no link destination", async () => {
    setValue(
      container.querySelector("#title") as HTMLInputElement,
      "Shoulder mobility"
    );
    setValue(
      container.querySelector("#slug") as HTMLInputElement,
      "shoulder-mobility"
    );
    setValue(
      container.querySelector("#serviceCategory") as HTMLSelectElement,
      "PHYSIOTHERAPY"
    );
    act(() => {
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: window.history.state })
      );
    });
    const saveAndLeave = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Save and leave"
    ) as HTMLButtonElement;
    expect(saveAndLeave.disabled).toBe(false);
    await act(async () => {
      saveAndLeave.click();
    });
    expect(createCanonicalTemplateAction).toHaveBeenCalled();
    const formData = vi.mocked(createCanonicalTemplateAction).mock
      .calls[0]?.[1] as FormData;
    expect(formData.get("next")).toBe("");
  });
});
