/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@/app/(staff)/(operator)/operator/clinics/[clinicId]/allowance-actions",
  () => ({
    updateAllowanceExtrasAction: vi.fn(),
  })
);

import { AllowanceExtrasForm } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/allowance-extras-form";

function setInputValue(element: HTMLInputElement, value: string) {
  const descriptor =
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value") ??
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("operator allowance extras form", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
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

  async function renderForm() {
    await act(async () => {
      root.render(
        <AllowanceExtrasForm
          clinicId="clinic_practice"
          planName="Practice"
          team={{ used: 4, base: 5, extra: 0 }}
          customGuides={{ used: 30, base: 30, extra: 0 }}
          adaptedTemplates={{ used: 10, base: 30, extra: 0 }}
          combinedGuides={{ used: 40, base: 40 }}
        />
      );
    });
  }

  it("rejects arbitrary extra text and keeps the combined allowance read-only", async () => {
    await renderForm();
    const custom = container.querySelector(
      "#extraCustomGuides"
    ) as HTMLInputElement;
    expect(custom.type).toBe("number");
    expect(custom.min).toBe("0");
    expect(custom.step).toBe("1");
    expect(custom.inputMode).toBe("numeric");

    await act(async () => {
      setInputValue(custom, "0dfdij");
    });

    expect(container.textContent).toContain(
      "Enter a whole number of zero or more."
    );
    expect(container.textContent).toContain(
      "Effective allowance is not calculated until this is a whole number of zero or more."
    );
    expect(container.textContent).not.toContain("Effective allowance: —");
    expect(container.textContent).toContain("Included combined allowance: 40");
    expect(container.textContent).toContain("Current combined usage: 40");
    const save = container.querySelector(
      'button[type="submit"]'
    ) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(
      container.querySelector('input[name="extraCombinedGuides"]')
    ).toBeNull();
  });

  it("calculates the combined allowance from the two guide extras", async () => {
    await renderForm();
    const custom = container.querySelector(
      "#extraCustomGuides"
    ) as HTMLInputElement;
    const adapted = container.querySelector(
      "#extraTemplateAdaptations"
    ) as HTMLInputElement;
    await act(async () => {
      setInputValue(custom, "2");
      setInputValue(adapted, "3");
    });
    expect(container.textContent).toContain(
      "Extras from guide allowances: 2 + 3"
    );
    expect(container.textContent).toContain("Effective combined allowance: 45");
    expect(container.textContent).toContain("Effective allowance: 32");
    expect(container.textContent).toContain("Effective allowance: 33");
    const save = container.querySelector(
      'button[type="submit"]'
    ) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
  });
});
