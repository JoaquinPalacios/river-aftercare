/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PermanentDeletionConfirmFields } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/permanent-deletion-confirm-fields";

const CLINIC_NAME = "Test Clinic Prod";

describe("permanent deletion copy control", () => {
  let container: HTMLDivElement;
  let root: Root;
  const writeText = vi.fn<(value: string) => Promise<void>>();

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
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

  function renderFields(confirmation = "") {
    act(() => {
      root.render(
        <PermanentDeletionConfirmFields
          clinicName={CLINIC_NAME}
          confirmation={confirmation}
          onConfirmationChange={() => undefined}
        />
      );
    });
  }

  function copyButtons() {
    return Array.from(container.querySelectorAll("button")).filter(
      (button) => button.getAttribute("aria-label") === "Copy clinic name"
    );
  }

  it("renders the clinic name on a keyboard-focusable control", () => {
    renderFields();
    const [nameButton, iconButton] = copyButtons();
    expect(nameButton).toBeInstanceOf(HTMLButtonElement);
    expect(iconButton).toBeInstanceOf(HTMLButtonElement);
    expect(nameButton?.textContent).toBe(CLINIC_NAME);
    expect(nameButton?.type).toBe("button");
    expect(iconButton?.type).toBe("button");
    expect(nameButton?.tabIndex).toBe(0);
    expect(iconButton?.disabled).toBe(false);
    nameButton?.focus();
    expect(document.activeElement).toBe(nameButton);
    expect(container.textContent).toContain(`Type ${CLINIC_NAME} to confirm`);
    expect(container.textContent).not.toContain("account-slug");
  });

  it("copies the clinic name from the name and the icon", async () => {
    renderFields();
    const [nameButton, iconButton] = copyButtons();
    await act(async () => {
      nameButton?.click();
    });
    await act(async () => {
      iconButton?.click();
    });
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(writeText).toHaveBeenNthCalledWith(1, CLINIC_NAME);
    expect(writeText).toHaveBeenNthCalledWith(2, CLINIC_NAME);
    expect(container.textContent).toContain("Copied");
  });

  it("leaves the confirmation field usable when copying fails", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    renderFields("partial");
    const input = container.querySelector("input");
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input?.disabled).toBe(false);
    expect(input?.value).toBe("partial");
    await act(async () => {
      copyButtons()[0]?.click();
    });
    expect(container.textContent).toContain("Copy unavailable");
    expect(input?.disabled).toBe(false);
    expect(input?.value).toBe("partial");
  });

  it("reports failure when the clipboard does not respond", async () => {
    writeText.mockImplementation(() => new Promise(() => undefined));
    renderFields("partial");
    const input = container.querySelector("input");
    await act(async () => {
      copyButtons()[0]?.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    expect(container.textContent).toContain("Copy unavailable");
    expect(input?.disabled).toBe(false);
    expect(input?.value).toBe("partial");
  });
});
