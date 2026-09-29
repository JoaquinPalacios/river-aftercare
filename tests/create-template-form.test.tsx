/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(staff)/(operator)/operator/templates/actions", () => ({
  createCanonicalTemplateAction: vi.fn(async () => ({})),
}));

import { CreateTemplateForm } from "@/app/(staff)/(operator)/operator/templates/create-template-form";

describe("create template form", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
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
});
