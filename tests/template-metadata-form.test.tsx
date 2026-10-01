/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

vi.mock("@/app/(staff)/(operator)/operator/templates/actions", () => ({
  updateCanonicalTemplateMetadataAction: vi.fn(async () => ({})),
}));

import { TemplateMetadataForm } from "@/app/(staff)/(operator)/operator/templates/template-metadata-form";
import { updateCanonicalTemplateMetadataAction } from "@/app/(staff)/(operator)/operator/templates/actions";

describe("template metadata unsaved changes", () => {
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
    push.mockReset();
    vi.mocked(updateCanonicalTemplateMetadataAction).mockReset();
    vi.mocked(updateCanonicalTemplateMetadataAction).mockResolvedValue({});
    window.history.replaceState({}, "", "/operator/templates/template");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <TemplateMetadataForm
          templateId="template"
          title="Shoulder mobility"
          slug="shoulder-mobility"
          serviceCategory="PHYSIOTHERAPY"
          metadataLocked={false}
        />
      );
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function title() {
    return container.querySelector("#template-title") as HTMLInputElement;
  }

  function setTitle(value: string) {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    act(() => {
      setter?.call(title(), value);
      title().dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function leaveDialog() {
    return [...container.querySelectorAll("dialog")].find((dialog) =>
      dialog.textContent?.includes("Save changes before leaving?")
    );
  }

  it("saves details through the existing action and can leave without writing", async () => {
    const link = document.createElement("a");
    link.href = "/operator/templates";
    document.body.append(link);
    const clean = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    act(() => {
      link.dispatchEvent(clean);
    });
    expect(clean.defaultPrevented).toBe(false);

    setTitle("Shoulder mobility revised");
    vi.mocked(updateCanonicalTemplateMetadataAction).mockImplementation(
      async () => ({ ok: true })
    );
    act(() => {
      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })
      );
    });
    await act(async () => {
      (
        [...container.querySelectorAll("button")].find(
          (button) => button.textContent === "Save and leave"
        ) as HTMLButtonElement
      ).click();
    });
    expect(updateCanonicalTemplateMetadataAction).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/operator/templates");
    link.remove();
  });

  it("leaves without saving the metadata form", () => {
    const link = document.createElement("a");
    link.href = "/operator/clinics";
    link.addEventListener("click", (event) => {
      if (!event.defaultPrevented) {
        event.preventDefault();
      }
    });
    document.body.append(link);
    setTitle("Shoulder mobility revised");
    act(() => {
      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })
      );
    });
    act(() => {
      (
        [...container.querySelectorAll("button")].find(
          (button) => button.textContent === "Leave without saving"
        ) as HTMLButtonElement
      ).click();
    });
    expect(updateCanonicalTemplateMetadataAction).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/operator/clinics");
    expect(title().value).toBe("Shoulder mobility revised");
    link.remove();
  });

  it("shows slug and service as text after publication and keeps title editable", () => {
    act(() => {
      root.render(
        <TemplateMetadataForm
          templateId="template"
          title="Shoulder mobility"
          slug="shoulder-mobility"
          serviceCategory="PHYSIOTHERAPY"
          metadataLocked
        />
      );
    });
    expect(container.querySelector('input[name="slug"]')).toBeNull();
    expect(container.querySelector("select")).toBeNull();
    expect(container.querySelector("#template-title")).toBeTruthy();
    expect(container.textContent).toContain("shoulder-mobility");
    expect(container.textContent).toContain("Physiotherapy");
    expect(container.textContent).toContain(
      "Slug and service category stay fixed after the first publication."
    );
  });
});
