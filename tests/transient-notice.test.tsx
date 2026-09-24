/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TransientNotice } from "@/app/(staff)/components/transient-notice";

describe("TransientNotice", () => {
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

  async function render(node: ReactNode) {
    await act(async () => {
      root.render(node);
    });
  }

  it("exposes a keyboard-focusable close button that does not submit", async () => {
    await render(<TransientNotice variant="success">Saved.</TransientNotice>);
    const button = container.querySelector("button");
    expect(button?.tagName).toBe("BUTTON");
    expect(button?.getAttribute("type")).toBe("button");
    expect(button?.getAttribute("aria-label")).toBe("Dismiss notification");
    expect(button?.className).toContain("staffBtn");
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Saved."
    );
  });

  it("uses an alert for errors and status for warnings", async () => {
    await render(
      <TransientNotice variant="error">Could not save.</TransientNotice>
    );
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await render(
      <TransientNotice variant="warning">Check the date.</TransientNotice>
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Check the date."
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("hides the current notice and shows a later one", async () => {
    const onDismiss = vi.fn();
    await render(
      <TransientNotice variant="success" noticeKey="1" onDismiss={onDismiss}>
        First
      </TransientNotice>
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      button.click();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("First");

    await render(
      <TransientNotice variant="success" noticeKey="1" onDismiss={onDismiss}>
        First
      </TransientNotice>
    );
    expect(container.textContent).not.toContain("First");

    await render(
      <TransientNotice variant="error" noticeKey="2">
        Second
      </TransientNotice>
    );
    expect(container.textContent).toContain("Second");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
});
