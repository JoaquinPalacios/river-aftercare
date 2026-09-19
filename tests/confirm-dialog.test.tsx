/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";

describe("staff confirm dialog pending UX", () => {
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

  function confirmButton() {
    return Array.from(container.querySelectorAll("button")).find((button) =>
      /Remove access|Removing|Save role|Saving/.test(button.textContent ?? "")
    ) as HTMLButtonElement;
  }

  function cancelButton() {
    return Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Cancel"
    ) as HTMLButtonElement;
  }

  it("shows a flex spinner, disables controls, and ignores duplicate confirms", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    await act(async () => {
      root.render(
        <ConfirmDialog
          open
          title="Remove access?"
          description="They will lose access."
          cancelLabel="Cancel"
          confirmLabel="Remove access"
          pendingLabel="Removing…"
          pendingStatus="Removing clinic access. Please wait."
          confirmTone="danger"
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      );
    });

    await act(async () => {
      confirmButton().click();
      confirmButton().click();
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const confirm = confirmButton();
    expect(confirm.textContent).toContain("Removing…");
    expect(confirm.querySelector(".staffLoginSpinner")).not.toBeNull();
    expect(confirm.className).toContain("staffLoginSubmit");
    expect(confirm.disabled).toBe(true);
    expect(confirm.getAttribute("aria-busy")).toBe("true");
    expect(cancelButton().disabled).toBe(true);
    expect(container.querySelector("dialog")?.getAttribute("aria-busy")).toBe(
      "true"
    );
    expect(container.querySelector("[role='status']")?.textContent).toBe(
      "Removing clinic access. Please wait."
    );

    await act(async () => {
      cancelButton().click();
    });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("disables Save until the selected value would change", async () => {
    const onConfirm = vi.fn();

    await act(async () => {
      root.render(
        <ConfirmDialog
          open
          title="Change role"
          description="Choose the access level for Jane."
          cancelLabel="Cancel"
          confirmLabel="Save role"
          pendingLabel="Saving…"
          confirmTone="primary"
          confirmDisabled
          onCancel={() => undefined}
          onConfirm={onConfirm}
        />
      );
    });

    const save = confirmButton();
    expect(save.disabled).toBe(true);
    await act(async () => {
      save.click();
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
