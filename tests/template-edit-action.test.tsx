/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/app/(staff)/(operator)/operator/templates/actions", () => ({
  createCanonicalTemplateDraftAction: vi.fn(async () => ({})),
}));

import { TemplateEditAction } from "@/app/(staff)/(operator)/operator/templates/template-edit-action";

describe("template overview Edit", () => {
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

  it("opens an existing draft without creating another revision", () => {
    act(() => {
      root.render(<TemplateEditAction templateId="template-1" hasOpenDraft />);
    });
    const link = container.querySelector(
      "[data-template-edit='open-draft']"
    ) as HTMLAnchorElement;
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe(
      "/operator/templates/template-1/draft"
    );
    expect(link.textContent).toBe("Edit");
    expect(container.querySelector("form")).toBeNull();
    expect(
      container.querySelector("[data-template-edit='create-draft']")
    ).toBeNull();
  });

  it("creates the next draft only when Edit is submitted", () => {
    act(() => {
      root.render(
        <TemplateEditAction templateId="template-1" hasOpenDraft={false} />
      );
    });
    const form = container.querySelector(
      "[data-template-edit='create-draft']"
    ) as HTMLFormElement;
    expect(form).toBeTruthy();
    expect(
      (form.querySelector("input[name='templateId']") as HTMLInputElement).value
    ).toBe("template-1");
    expect(form.querySelector("button")?.textContent).toBe("Edit");
    expect(container.querySelector("a")).toBeNull();
  });
});
