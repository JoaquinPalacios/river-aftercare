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

import {
  DowngradeGuideSelectionForm,
  GUIDE_SELECTION_SAVED_MESSAGE,
} from "@/app/(staff)/account/billing/downgrade-guide-selection-form";
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
    expect(container.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(container.textContent).not.toContain(
      "Will stay active on Essential"
    );

    await toggle("c1");
    expect(box("c1").checked).toBe(true);
    expect(confirmButton().disabled).toBe(false);
    expect(container.textContent).not.toContain(
      "That selection is above the Essential guide allowance."
    );
  });

  it("shows the saved keep-set after confirmation and hides the checkbox form", async () => {
    confirmMock.mockResolvedValue({ accepted: true });
    await renderForm();
    await toggle("c1");
    await toggle("c2");
    await toggle("e1");

    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(container.textContent).toContain("Guide selection confirmed");
    expect(container.textContent).toContain(GUIDE_SELECTION_SAVED_MESSAGE);
    expect(container.textContent.match(/Guide selection complete/g)).toBeNull();
    expect(container.textContent).toContain("Will stay active on Essential");
    expect(container.textContent).toContain("Custom one");
    expect(container.textContent).toContain("Custom two");
    expect(container.textContent).toContain("Edited one");
    expect(container.textContent).toContain("Will be retained for 60 days");
    expect(container.textContent).toContain("Custom three");
    expect(container.textContent).toContain("Edited two");
    expect(container.textContent).toContain(
      "These guides will remain available on Practice until Essential begins."
    );
    expect(container.textContent).not.toContain("Retained guides");
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container.textContent).toContain("Edit guide selection");
    expect(container.textContent).toContain("Custom guides 2 of 2 selected");
    expect(container.textContent).toContain(
      "Editable River templates 1 of 2 selected"
    );
    expect(container.textContent).toContain(
      "Total clinic-owned guides 3 of 4 selected"
    );
  });

  it("reloads a persisted confirmed selection instead of an empty form", async () => {
    await renderForm({
      ...panel(["c1", "c2", "e1"]),
      status: "confirmed",
    });

    expect(container.textContent).toContain("Guide selection confirmed");
    expect(container.textContent).toContain("Custom one");
    expect(container.textContent).toContain("Custom two");
    expect(container.textContent).toContain("Edited one");
    expect(container.textContent).toContain("Will be retained for 60 days");
    expect(container.textContent).toContain("Custom three");
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container.textContent).not.toContain("Guide selection complete");
    expect(container.textContent).toContain("Custom guides 2 of 2 selected");
  });

  it("opens the saved keep-set for editing", async () => {
    await renderForm({
      ...panel(["c1", "c2", "e1"]),
      status: "confirmed",
    });

    const edit = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Edit guide selection"
    ) as HTMLButtonElement;
    await act(async () => {
      edit.click();
    });

    expect(box("c1").checked).toBe(true);
    expect(box("c2").checked).toBe(true);
    expect(box("e1").checked).toBe(true);
    expect(box("c3").checked).toBe(false);
    expect(box("e2").checked).toBe(false);
    expect(box("c1").disabled).toBe(false);
    expect(box("c3").disabled).toBe(true);
    expect(box("e2").disabled).toBe(false);
    expect(container.textContent).toContain("Custom guides 2 of 2 selected");
    expect(container.textContent).toContain(
      "Editable River templates 1 of 2 selected"
    );
    expect(confirmButton().textContent).toBe("Update guide selection");
  });

  it("returns to the confirmed summary after a successful update", async () => {
    confirmMock.mockResolvedValue({ accepted: true });
    await renderForm({
      ...panel(["c1", "c2", "e1"]),
      status: "confirmed",
    });
    const edit = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Edit guide selection"
    ) as HTMLButtonElement;
    await act(async () => {
      edit.click();
    });
    await toggle("e1");
    await toggle("e2");

    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container.textContent).toContain("Guide selection confirmed");
    expect(container.textContent).toContain("Edited two");
    expect(container.textContent).not.toContain("Update guide selection");
    const retained = container.textContent ?? "";
    const retainedAt = retained.indexOf("Will be retained for 60 days");
    expect(retainedAt).toBeGreaterThan(-1);
    expect(retained.slice(retainedAt)).toContain("Edited one");
    expect(retained.slice(0, retainedAt)).toContain("Edited two");
  });

  it("keeps edit mode open when an update is rejected", async () => {
    confirmMock.mockResolvedValue({
      error: "That selection is above the Essential guide allowance.",
    });
    await renderForm({
      ...panel(["c1", "e1"]),
      status: "confirmed",
    });
    const edit = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Edit guide selection"
    ) as HTMLButtonElement;
    await act(async () => {
      edit.click();
    });
    await toggle("c2");

    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(box("c1").checked).toBe(true);
    expect(box("c2").checked).toBe(true);
    expect(box("e1").checked).toBe(true);
    expect(confirmButton().textContent).toBe("Update guide selection");
    expect(container.textContent).toContain(
      "That selection is above the Essential guide allowance."
    );
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain(
      "Will stay active on Essential"
    );
  });
});
