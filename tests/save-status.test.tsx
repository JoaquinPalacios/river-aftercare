/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SAVED_CONFIRMATION_MS,
  SaveStatus,
} from "@/app/(staff)/components/save-status";
import type { FormSaveStatus } from "@/lib/clinic-portal/form-save-status";

describe("transient save confirmation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
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
    vi.useRealTimers();
  });

  async function render(node: ReactNode) {
    await act(async () => {
      root.render(node);
    });
  }

  function status(state: FormSaveStatus) {
    return container.querySelector(`[data-save-state='${state}']`);
  }

  it("does not show Saved until a save finishes", async () => {
    await render(<SaveStatus status="saved" confirmSaved />);
    expect(status("saved")).toBeNull();
    expect(container.textContent).not.toContain("Saved");
  });

  it("shows Saving…, then Saved, then hides Saved", async () => {
    await render(<SaveStatus status="unsaved" confirmSaved />);
    expect(status("unsaved")?.textContent).toBe("Unsaved changes");

    await render(<SaveStatus status="saving" confirmSaved />);
    expect(status("saving")?.textContent).toBe("Saving…");
    expect(status("saved")).toBeNull();

    await render(
      <SaveStatus
        status="saved"
        confirmSaved
        success="Draft saved. The public guide is unchanged until you publish."
      />
    );
    expect(status("saved")?.textContent).toBe("Saved");
    expect(container.textContent).toContain(
      "Draft saved. The public guide is unchanged until you publish."
    );

    act(() => {
      vi.advanceTimersByTime(SAVED_CONFIRMATION_MS - 1);
    });
    expect(status("saved")?.textContent).toBe("Saved");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(status("saved")).toBeNull();
    expect(container.textContent).not.toContain("Saved");
    expect(container.textContent).not.toContain("Draft saved.");
  });

  it("restarts the confirmation when another save succeeds", async () => {
    await render(<SaveStatus status="saving" confirmSaved />);
    await render(<SaveStatus status="saved" confirmSaved />);
    act(() => {
      vi.advanceTimersByTime(SAVED_CONFIRMATION_MS - 500);
    });
    expect(status("saved")).toBeTruthy();

    await render(<SaveStatus status="saving" confirmSaved />);
    await render(<SaveStatus status="saved" confirmSaved />);
    act(() => {
      vi.advanceTimersByTime(SAVED_CONFIRMATION_MS - 1);
    });
    expect(status("saved")?.textContent).toBe("Saved");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(status("saved")).toBeNull();
  });

  it("keeps an error after the save confirmation hides", async () => {
    const error = "The draft could not be saved.";
    await render(<SaveStatus status="saving" confirmSaved />);
    await render(<SaveStatus status="saved" confirmSaved error={error} />);
    expect(container.querySelector("[role='alert']")?.textContent).toBe(error);

    act(() => {
      vi.advanceTimersByTime(SAVED_CONFIRMATION_MS);
    });
    expect(status("saved")).toBeNull();
    expect(container.querySelector("[role='alert']")?.textContent).toBe(error);
  });

  it("keeps Saved visible when the confirmation is not transient", async () => {
    await render(<SaveStatus status="saved" />);
    act(() => {
      vi.advanceTimersByTime(SAVED_CONFIRMATION_MS);
    });
    expect(status("saved")?.textContent).toBe("Saved");
  });
});
