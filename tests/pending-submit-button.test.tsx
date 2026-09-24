/** @vitest-environment jsdom */

import { act, useActionState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PendingSubmitButton } from "@/app/(staff)/components/pending-submit-button";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function Harness({
  action,
}: {
  action: (previous: null, formData: FormData) => Promise<null>;
}) {
  const [, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} aria-busy={pending || undefined}>
      <PendingSubmitButton
        label="Review downgrade"
        pendingLabel="Preparing…"
        className="staffBtn staffBtnPrimary h-11"
      />
    </form>
  );
}

describe("PendingSubmitButton", () => {
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

  function activeLabel() {
    const button = container.querySelector("button");
    return button?.querySelector("[data-active='true']")?.textContent;
  }

  it("renders the idle label without an animated spinner", async () => {
    await act(async () => {
      root.render(<Harness action={async () => null} />);
    });
    const button = container.querySelector("button");
    expect(activeLabel()).toBe("Review downgrade");
    expect(button?.disabled).toBe(false);
    expect(container.querySelector(".staffBtnSpinner")).toBeNull();
    expect(container.querySelector(".staffBtnSpinnerSlot")).not.toBeNull();
  });

  it("renders the spinner and pending label only while the action is running", async () => {
    const pending = deferred<null>();
    await act(async () => {
      root.render(
        <Harness
          action={() => {
            return pending.promise;
          }}
        />
      );
    });
    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });
    const button = container.querySelector("button");
    expect(activeLabel()).toBe("Preparing…");
    expect(button?.disabled).toBe(true);
    expect(button?.querySelector(".staffBtnSpinner")).not.toBeNull();
    expect(container.querySelector(".staffBtnSpinnerSlot")).toBeNull();
    expect(form.getAttribute("aria-busy")).toBe("true");

    await act(async () => {
      pending.resolve(null);
    });
    expect(activeLabel()).toBe("Review downgrade");
    expect(container.querySelector("button")?.disabled).toBe(false);
    expect(container.querySelector(".staffBtnSpinner")).toBeNull();
  });
});
