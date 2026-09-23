/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const confirmMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(staff)/account/billing/actions", () => ({
  confirmDowngradeGuideSelectionAction: (
    previous: unknown,
    formData: FormData
  ) => confirmMock(previous, formData),
  openCustomerPortalAction: async () => ({}),
}));

import { DowngradeGuideSelectionForm } from "@/app/(staff)/account/billing/downgrade-guide-selection-form";
import type { ClinicGuideSelectionPanel } from "@/lib/entitlements/downgrade-selection";

const LIMITS = { custom: 2, adapted: 2, combined: 4 };

function guide(
  id: string,
  kind: "custom" | "adapted",
  title: string
): ClinicGuideSelectionPanel["guides"][number] {
  return {
    id,
    title,
    kind,
    kindLabel: kind === "custom" ? "Custom guide" : "Edited River template",
    publicationLabel: "Published",
    updatedLabel: "1 October 2026",
  };
}

function panel(selectedIds: string[] = []): ClinicGuideSelectionPanel {
  return {
    status: "awaiting",
    limits: LIMITS,
    selectedIds,
    guides: [
      guide("c1", "custom", "Custom one"),
      guide("c2", "custom", "Custom two"),
      guide("c3", "custom", "Custom three"),
      guide("e1", "adapted", "Edited one"),
      guide("e2", "adapted", "Edited two"),
      guide("e3", "adapted", "Edited three"),
    ],
  };
}

describe("downgrade guide selection form", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    confirmMock.mockReset();
    confirmMock.mockResolvedValue({});
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

  async function renderForm(value: ClinicGuideSelectionPanel = panel()) {
    await act(async () => {
      root.render(<DowngradeGuideSelectionForm panel={value} canConfirm />);
    });
  }

  function box(id: string) {
    return container.querySelector(`input[value="${id}"]`) as HTMLInputElement;
  }

  async function toggle(id: string) {
    const input = box(id);
    await act(async () => {
      input.click();
    });
  }

  function confirmButton() {
    return container.querySelector(
      'button[type="submit"]'
    ) as HTMLButtonElement;
  }

  it("disables further custom guides at the custom limit and leaves edited templates available", async () => {
    await renderForm();
    await toggle("c1");
    await toggle("c2");

    expect(box("c1").disabled).toBe(false);
    expect(box("c1").checked).toBe(true);
    expect(box("c2").disabled).toBe(false);
    expect(box("c3").disabled).toBe(true);
    expect(box("c3").checked).toBe(false);
    expect(box("e1").disabled).toBe(false);
    expect(container.textContent).toContain("Custom guide limit reached");
    expect(container.textContent).toContain("Custom guides 2 of 2 selected");
    expect(confirmButton().disabled).toBe(false);
  });

  it("enables custom guides again after one is deselected", async () => {
    await renderForm();
    await toggle("c1");
    await toggle("c2");
    expect(box("c3").disabled).toBe(true);

    await toggle("c2");

    expect(box("c2").checked).toBe(false);
    expect(box("c3").disabled).toBe(false);
    expect(container.textContent).not.toContain("Custom guide limit reached");
    expect(confirmButton().disabled).toBe(false);
  });

  it("disables further edited templates at the editable limit and leaves a custom place", async () => {
    await renderForm();
    await toggle("e1");
    await toggle("e2");

    expect(box("e1").disabled).toBe(false);
    expect(box("e2").disabled).toBe(false);
    expect(box("e3").disabled).toBe(true);
    expect(box("e3").checked).toBe(false);
    expect(box("c1").disabled).toBe(false);
    expect(container.textContent).toContain(
      "Editable River template limit reached"
    );
    expect(confirmButton().disabled).toBe(false);
  });

  it("disables every remaining guide when the combined limit is reached", async () => {
    await renderForm();
    await toggle("c1");
    await toggle("c2");
    await toggle("e1");
    await toggle("e2");

    expect(box("c3").disabled).toBe(true);
    expect(box("e3").disabled).toBe(true);
    expect(box("c1").disabled).toBe(false);
    expect(box("e1").disabled).toBe(false);
    expect(container.textContent).toContain("Guide limit reached");
    expect(container.textContent).toContain(
      "Total clinic-owned guides 4 of 4 selected"
    );
    expect(confirmButton().disabled).toBe(false);
  });

  it("keeps a selected guide enabled at the limit so it can be unchecked", async () => {
    await renderForm();
    await toggle("c1");
    await toggle("c2");
    await toggle("e1");
    await toggle("e2");

    await toggle("c1");

    expect(box("c1").checked).toBe(false);
    expect(box("c1").disabled).toBe(false);
    expect(box("c3").disabled).toBe(false);
    expect(box("e3").disabled).toBe(true);
  });

  it("renders a server allowance error without replacing domain validation", async () => {
    confirmMock.mockResolvedValue({
      error: "That selection is above the Essential guide allowance.",
    });
    await renderForm();
    expect(confirmButton().disabled).toBe(false);

    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(container.textContent).toContain(
      "That selection is above the Essential guide allowance."
    );
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(confirmMock).toHaveBeenCalledTimes(1);
  });

  it("allows confirm for a valid partial selection and for none", async () => {
    await renderForm();
    expect(confirmButton().disabled).toBe(false);
    expect(confirmButton().textContent).toBe("Confirm guide selection");

    await toggle("c1");
    expect(box("c1").checked).toBe(true);
    expect(confirmButton().disabled).toBe(false);
    expect(container.textContent).not.toContain(
      "That selection is above the Essential guide allowance."
    );
  });
});
