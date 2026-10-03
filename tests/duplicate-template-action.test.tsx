/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actionImpl = vi.hoisted(() => vi.fn());

vi.mock("@/app/(staff)/(operator)/operator/templates/actions", () => ({
  duplicateCanonicalTemplateAction: (state: unknown, formData: FormData) =>
    actionImpl(state, formData),
}));

import { DuplicateTemplateAction } from "@/app/(staff)/(operator)/operator/templates/duplicate-template-action";
import { suggestGuideSlug } from "@/lib/clinics/slug-suggestion";
import { suggestDuplicateTemplateTitle } from "@/lib/canonical-templates/duplicate-template-messages";

function setValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("duplicate template confirmation", () => {
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
    actionImpl.mockReset();
    actionImpl.mockResolvedValue({});
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

  function renderAction(
    published: boolean,
    activeSamples: {
      id: string;
      title: string;
      serviceCategory: "PHYSIOTHERAPY";
    }[] = []
  ) {
    act(() => {
      root.render(
        <DuplicateTemplateAction
          sourceTemplateId="source-template"
          sourceTitle="Physiotherapy Home Exercise Plan"
          serviceCategory="PHYSIOTHERAPY"
          serviceCategoryLabel="Physiotherapy"
          published={published}
          activeSamples={activeSamples}
        />
      );
    });
  }

  function openButton() {
    return [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Duplicate template"
    ) as HTMLButtonElement;
  }

  function dialog() {
    return container.querySelector("dialog") as HTMLDialogElement | null;
  }

  it("explains why an unpublished template cannot be duplicated", () => {
    renderAction(false);
    const button = openButton();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-describedby")).toBeTruthy();
    expect(container.textContent).toContain(
      "Publish this template before duplicating it. Duplication copies the latest published revision."
    );
    expect(dialog()).toBeNull();
  });

  it("confirms title, slug, category, and classification before creating a draft", async () => {
    renderAction(true);
    const opener = openButton();
    expect(opener.getAttribute("aria-haspopup")).toBe("dialog");
    await act(async () => {
      opener.click();
    });
    const confirmation = dialog();
    expect(confirmation?.hasAttribute("open")).toBe(true);
    expect(confirmation?.textContent).toContain(
      "This creates a new draft from the latest published revision."
    );
    expect(confirmation?.querySelector("select")).toBeNull();
    expect(confirmation?.textContent).toContain("Physiotherapy");
    expect(confirmation?.textContent).toContain(
      "Duplication stays in this service category."
    );
    const title = confirmation?.querySelector(
      'input[name="title"]'
    ) as HTMLInputElement;
    const slug = confirmation?.querySelector(
      'input[name="slug"]'
    ) as HTMLInputElement;
    const category = confirmation?.querySelector(
      'input[name="serviceCategory"]'
    ) as HTMLInputElement;
    expect(document.activeElement).toBe(title);
    expect(title.value).toBe(
      suggestDuplicateTemplateTitle("Physiotherapy Home Exercise Plan")
    );
    expect(slug.value).toBe(suggestGuideSlug(title.value));
    expect(category.value).toBe("PHYSIOTHERAPY");
    expect(category.type).toBe("hidden");
    expect(
      (
        confirmation?.querySelector(
          'input[name="classification"][value="PRODUCTION"]'
        ) as HTMLInputElement
      ).checked
    ).toBe(true);
    const submit = [...(confirmation?.querySelectorAll("button") ?? [])].find(
      (button) => button.getAttribute("type") === "submit"
    ) as HTMLButtonElement;
    const cancel = [...(confirmation?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Cancel"
    ) as HTMLButtonElement;
    expect(submit.textContent).toBe("Duplicate template");
    expect(submit.disabled).toBe(false);
    expect(cancel.getAttribute("type")).toBe("button");

    setValue(slug, "home-exercise-plan");
    expect(slug.value).toBe("home-exercise-plan");
    const regenerate = [
      ...(confirmation?.querySelectorAll("button") ?? []),
    ].find(
      (button) => button.textContent === "Regenerate from title"
    ) as HTMLButtonElement;
    await act(async () => {
      regenerate.click();
    });
    expect(
      (confirmation?.querySelector('input[name="slug"]') as HTMLInputElement)
        .value
    ).not.toBe("home-exercise-plan");

    confirmation?.dispatchEvent(
      new Event("cancel", { bubbles: true, cancelable: true })
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(dialog()?.hasAttribute("open")).toBe(false);
  });

  it("blocks an unavailable sample classification and prevents a second submit", async () => {
    renderAction(true, [
      {
        id: "existing-sample",
        title: "Physiotherapy Home Exercise Plan",
        serviceCategory: "PHYSIOTHERAPY",
      },
    ]);
    await act(async () => {
      openButton().click();
    });
    const confirmation = dialog() as HTMLDialogElement;
    const sample = confirmation.querySelector(
      'input[name="classification"][value="SAMPLE"]'
    ) as HTMLInputElement;
    await act(async () => {
      sample.click();
      sample.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(confirmation.textContent).toContain(
      "Physiotherapy already has an active sample: Physiotherapy Home Exercise Plan."
    );
    const submit = [...confirmation.querySelectorAll("button")].find(
      (button) => button.getAttribute("type") === "submit"
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(submit.getAttribute("aria-describedby")).toBe(
      "classification-sample-slot"
    );

    await act(async () => {
      sample.click();
    });
    const production = confirmation.querySelector(
      'input[name="classification"][value="PRODUCTION"]'
    ) as HTMLInputElement;
    await act(async () => {
      production.click();
      production.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const gate = deferred<Record<string, string>>();
    actionImpl.mockImplementation(() =>
      gate.promise.then(() => ({
        error: "That slug is already used.",
        fieldErrors: { slug: "That slug is already used." },
      }))
    );
    const form = confirmation.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });
    expect(actionImpl).toHaveBeenCalledTimes(1);
    const pendingSubmit = [...confirmation.querySelectorAll("button")].find(
      (button) => button.getAttribute("type") === "submit"
    ) as HTMLButtonElement;
    expect(pendingSubmit.textContent).toContain("Duplicating…");
    expect(pendingSubmit.disabled).toBe(true);
    expect(pendingSubmit.querySelector(".staffLoginSpinner")).not.toBeNull();
    expect(confirmation.getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      form.requestSubmit();
    });
    expect(actionImpl).toHaveBeenCalledTimes(1);
    const submitted = actionImpl.mock.calls[0]?.[1] as FormData;
    expect(submitted.get("sourceTemplateId")).toBe("source-template");
    expect(submitted.get("serviceCategory")).toBe("PHYSIOTHERAPY");
    expect(submitted.get("classification")).toBe("PRODUCTION");

    await act(async () => {
      gate.resolve({});
    });
    expect(confirmation.textContent).toContain("That slug is already used.");
    expect(confirmation.querySelector('[role="alert"]')).not.toBeNull();
    const restored = [...confirmation.querySelectorAll("button")].find(
      (button) => button.getAttribute("type") === "submit"
    ) as HTMLButtonElement;
    expect(restored.disabled).toBe(false);
    expect(restored.textContent).toBe("Duplicate template");
  });

  it("keeps the confirmation dialog inside the viewport on a narrow screen", () => {
    const css = readFileSync("app/(staff)/staff.css", "utf8");
    expect(css).toContain(".staffBtnPrimary:disabled");
    expect(css).toContain(".templateDuplicateDialog");
    expect(css).toContain("width: min(32rem, calc(100vw - 2rem))");
    expect(css).toContain("max-height: calc(100dvh - 2rem)");
    expect(css).toContain("overflow: auto");
    expect(css).toMatch(
      /@media \(max-width: 40rem\) \{[\s\S]*\.templateDuplicateDialog \.staffDialogActions \{[\s\S]*flex-direction: column;/
    );
  });
});
