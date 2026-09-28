/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(staff)/(operator)/operator/templates/actions", () => ({
  createCanonicalTemplateAction: vi.fn(async () => ({})),
}));

import { CreateTemplateForm } from "@/app/(staff)/(operator)/operator/templates/create-template-form";
import { isReservedDemoCanonicalSlug } from "@/lib/canonical-templates/constants";

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

describe("create template slug", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<CreateTemplateForm />);
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function title() {
    return container.querySelector("#title") as HTMLInputElement;
  }

  function slug() {
    return container.querySelector("#slug") as HTMLInputElement;
  }

  it("generates the slug from the title until the slug is edited", () => {
    setValue(title(), "Tooth Extraction");
    expect(slug().value).toBe("tooth-extraction");
    setValue(title(), "Wisdom Tooth Removal");
    expect(slug().value).toBe("wisdom-tooth-removal");
    expect(container.textContent).not.toContain("Regenerate from title");
  });

  it("keeps a manual slug and can regenerate it from the title", () => {
    setValue(title(), "Tooth Extraction");
    setValue(slug(), "custom-extraction");
    setValue(title(), "Surgical Extraction");
    expect(slug().value).toBe("custom-extraction");

    const regenerate = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Regenerate from title"
    ) as HTMLButtonElement;
    expect(regenerate.type).toBe("button");
    act(() => {
      regenerate.click();
    });
    expect(slug().value).toBe("surgical-extraction");
    setValue(title(), "Tooth Extraction");
    expect(slug().value).toBe("tooth-extraction");
  });

  it("still submits a reserved slug for the backend to reject", () => {
    setValue(title(), "Extraction");
    setValue(slug(), "extraction");
    expect(slug().name).toBe("slug");
    expect(slug().value).toBe("extraction");
    expect(isReservedDemoCanonicalSlug("extraction")).toBe(true);
    expect(isReservedDemoCanonicalSlug("tooth-extraction")).toBe(false);
    const schema = readFileSync("lib/canonical-templates/schemas.ts", "utf8");
    expect(schema).toContain("isReservedDemoCanonicalSlug");
    expect(schema).toContain(
      "The slug extraction is reserved for the demo sample template."
    );
    const metadata = readFileSync(
      "lib/canonical-templates/update-canonical-template-metadata.ts",
      "utf8"
    );
    expect(metadata).toContain(
      "The slug cannot change after the first published revision."
    );
  });
});
