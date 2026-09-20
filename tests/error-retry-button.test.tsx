/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorRetryButton } from "@/app/components/error-retry-button";
import { TRY_AGAIN_LABEL, TRYING_AGAIN_LABEL } from "@/lib/errors/copy";

describe("ErrorRetryButton", () => {
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

  it("shows pending feedback while retry is in flight and remains keyboard accessible", async () => {
    let resolveRetry: (() => void) | undefined;
    const retry = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        })
    );

    await act(async () => {
      root.render(<ErrorRetryButton onRetry={retry} />);
    });

    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.textContent).toBe(TRY_AGAIN_LABEL);
    expect(button.tabIndex).not.toBe(-1);
    expect(button.getAttribute("type")).toBe("button");

    await act(async () => {
      button.click();
    });

    expect(retry).toHaveBeenCalledOnce();
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe(TRYING_AGAIN_LABEL);

    await act(async () => {
      resolveRetry?.();
    });

    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe(TRY_AGAIN_LABEL);
  });
});
