/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ManageClinicWorkspaceButton } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/manage-clinic-workspace-button";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("ManageClinicWorkspaceButton", () => {
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

  it("shows the spinner without dropping the idle label, then restores", async () => {
    const pending = deferred<void>();
    let calls = 0;
    await act(async () => {
      root.render(
        <form
          action={() => {
            calls += 1;
            return pending.promise;
          }}
        >
          <ManageClinicWorkspaceButton />
        </form>
      );
    });

    const button = () => container.querySelector("button");
    expect(button()?.getAttribute("aria-label")).toBe(
      "Manage clinic workspace"
    );
    expect(button()?.textContent).toContain("Manage clinic workspace");
    expect(button()?.disabled).toBe(false);
    expect(container.querySelector(".staffBtnSpinner")).toBeNull();

    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(calls).toBe(1);
    expect(button()?.disabled).toBe(true);
    expect(button()?.getAttribute("aria-busy")).toBe("true");
    expect(button()?.getAttribute("aria-label")).toBe(
      "Opening clinic workspace"
    );
    expect(button()?.textContent).toContain("Manage clinic workspace");
    expect(button()?.textContent).toContain("Opening");
    expect(container.querySelector(".staffBtnSpinner")).not.toBeNull();
    expect(
      container.querySelector(".staffBtnSpinner")?.getAttribute("aria-hidden")
    ).toBe("true");

    await act(async () => {
      button()?.click();
    });
    expect(calls).toBe(1);

    await act(async () => {
      pending.resolve();
    });
    expect(button()?.disabled).toBe(false);
    expect(button()?.getAttribute("aria-label")).toBe(
      "Manage clinic workspace"
    );
    expect(container.querySelector(".staffBtnSpinner")).toBeNull();
    expect(button()?.textContent).not.toContain("Opening");
  });
});
