/** @vitest-environment jsdom */

import { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

import Link from "next/link";

import { UnsavedChangesDialog } from "@/app/(staff)/components/unsaved-changes-dialog";
import { useUnsavedChangesGuard } from "@/app/(staff)/components/use-unsaved-changes-guard";

function Harness({
  canSave = true,
  onSave,
}: {
  canSave?: boolean;
  onSave?: () => void;
}) {
  const [value, setValue] = useState("");
  const dirty = value !== "";
  const guard = useUnsavedChangesGuard(dirty);
  return (
    <form>
      <label htmlFor="title">Title</label>
      <input
        id="title"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <Link href="/operator/templates">Templates</Link>
      <UnsavedChangesDialog
        open={guard.open}
        canSave={canSave}
        saveDisabledReason="Complete the required fields before saving."
        onStay={guard.keepEditing}
        onLeave={guard.discard}
        onSave={() => onSave?.()}
      />
    </form>
  );
}

describe("unsaved changes guard", () => {
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
    window.history.replaceState({}, "", "/operator/templates/new");
    push.mockReset();
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

  function input() {
    return container.querySelector("#title") as HTMLInputElement;
  }

  function type(value: string) {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    act(() => {
      setter?.call(input(), value);
      input().dispatchEvent(new Event("input", { bubbles: true }));
      input().dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function templatesLink() {
    return container.querySelector(
      'a[href="/operator/templates"]'
    ) as HTMLAnchorElement;
  }

  function clickLink() {
    const link = templatesLink();
    let blocked = false;
    const silence = (event: Event) => {
      blocked = event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener("click", silence, true);
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    act(() => {
      link.dispatchEvent(event);
    });
    document.removeEventListener("click", silence, true);
    return blocked;
  }

  function dialog() {
    return container.querySelector("dialog");
  }

  function button(label: string) {
    return [...container.querySelectorAll("button")].find(
      (item) => item.textContent === label
    ) as HTMLButtonElement;
  }

  function unloadBlocked() {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it("lets a clean form navigate and registers beforeunload only while dirty", () => {
    act(() => {
      root.render(<Harness />);
    });
    expect(clickLink()).toBe(false);
    expect(dialog()?.hasAttribute("open")).toBe(false);
    expect(unloadBlocked()).toBe(false);
    expect(push).not.toHaveBeenCalled();

    type("Shoulder mobility");
    expect(unloadBlocked()).toBe(true);

    type("");
    expect(unloadBlocked()).toBe(false);
  });

  it("opens the confirmation for in-app navigation and keeps or discards the edit", () => {
    act(() => {
      root.render(<Harness />);
    });
    type("Shoulder mobility");
    expect(clickLink()).toBe(true);
    const confirmation = dialog();
    expect(confirmation?.hasAttribute("open")).toBe(true);
    expect(confirmation?.getAttribute("aria-labelledby")).toBeTruthy();
    expect(confirmation?.getAttribute("aria-describedby")).toBeTruthy();
    expect(button("Save and leave").className).toContain("staffBtnPrimary");
    expect(button("Leave without saving").className).toContain(
      "staffBtnSecondary"
    );
    expect(button("Leave without saving").className).not.toContain(
      "staffBtnDanger"
    );

    act(() => {
      button("Stay").click();
    });
    expect(dialog()?.hasAttribute("open")).toBe(false);
    expect(input().value).toBe("Shoulder mobility");
    expect(push).not.toHaveBeenCalled();

    clickLink();
    act(() => {
      button("Leave without saving").click();
    });
    expect(push).toHaveBeenCalledWith("/operator/templates");
    expect(input().value).toBe("Shoulder mobility");
  });

  it("disables Save and leave when the form cannot be saved", () => {
    act(() => {
      root.render(<Harness canSave={false} />);
    });
    type("Shoulder");
    clickLink();
    expect(button("Save and leave").disabled).toBe(true);
    expect(container.textContent).toContain(
      "Complete the required fields before saving."
    );
    expect(button("Leave without saving").disabled).toBe(false);
    expect(button("Stay").disabled).toBe(false);
  });

  it("treats browser Back as a same-page prompt", () => {
    act(() => {
      root.render(<Harness />);
    });
    window.history.replaceState({}, "", "/operator/templates");
    window.history.pushState({}, "", "/operator/templates/new");
    type("Shoulder mobility");
    expect(window.history.state).toMatchObject({ riverStaffUnsaved: true });

    act(() => {
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: window.history.state })
      );
    });

    expect(window.location.pathname).toBe("/operator/templates/new");
    expect(dialog()?.hasAttribute("open")).toBe(true);
    expect(button("Stay")).toBeTruthy();
    expect(button("Leave without saving")).toBeTruthy();
    expect(button("Save and leave")).toBeTruthy();
  });
});
