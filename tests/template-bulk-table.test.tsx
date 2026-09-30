/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bulkAction = vi.fn(async (_previous: unknown, _formData: FormData) => ({
  ok: true,
  message: "2 templates published.",
}));

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
  applyCanonicalTemplateBulkAction: (previous: unknown, formData: FormData) =>
    bulkAction(previous, formData),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

import {
  TemplateBulkTable,
  type TemplateBulkTableRow,
} from "@/app/(staff)/(operator)/operator/templates/template-bulk-table";

function row(
  overrides: Partial<TemplateBulkTableRow> &
    Pick<TemplateBulkTableRow, "id" | "title">
): TemplateBulkTableRow {
  return {
    slug: overrides.id,
    href: `/operator/templates/${overrides.id}/draft`,
    serviceCategoryLabel: "Dental",
    isActive: true,
    isSample: false,
    latestPublishedVersion: null,
    draft: { id: `${overrides.id}-draft`, version: 1 },
    ...overrides,
  };
}

const draft = row({ id: "alpha", title: "Alpha draft" });
const second = row({ id: "beta", title: "Beta draft" });
const sample = row({
  id: "sample",
  title: "Tooth Extraction",
  slug: "extraction",
  href: "/operator/templates/sample",
  isSample: true,
  latestPublishedVersion: 1,
});
const published = row({
  id: "published",
  title: "Published example",
  href: "/operator/templates/published",
  latestPublishedVersion: 1,
  draft: { id: "published-draft", version: 2 },
});

describe("template bulk table", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    bulkAction.mockClear();
    window.localStorage.clear();
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
    };
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

  function render(templates: TemplateBulkTableRow[], filterKey = "all") {
    act(() => {
      root.render(
        <TemplateBulkTable templates={templates} filterKey={filterKey} />
      );
    });
  }

  function checkbox(label: string) {
    return container.querySelector(
      `input[aria-label="${label}"]`
    ) as HTMLInputElement;
  }

  it("shows current Published and Draft status without revision numbers", () => {
    const empty = row({
      id: "empty",
      title: "No revisions",
      latestPublishedVersion: null,
      draft: null,
      isActive: false,
    });
    render([draft, published, sample, empty]);
    const pills = [...container.querySelectorAll(".staffStatusPill")].map(
      (pill) => pill.textContent
    );
    expect(pills).toContain("Published");
    expect(pills).toContain("Draft");
    expect(pills).toContain("Production");
    expect(pills).toContain("Sample");
    expect(pills).toContain("Active");
    expect(pills).toContain("Inactive");
    expect(pills.some((label) => /v\d/.test(label ?? ""))).toBe(false);
    expect(container.textContent).toContain("None");
    expect(container.textContent).not.toContain("v1 Published");
    expect(container.textContent).not.toContain("Draft v1");
    expect(container.textContent).not.toContain("Draft v2");
  });

  it("keeps selection checkboxes at the original size with a larger hit target", () => {
    render([draft, second]);
    const rowBox = checkbox("Select Alpha draft");
    const headerBox = checkbox("Select all rows on this page");
    expect(rowBox.className).toContain("staffOperatorSelect");
    expect(headerBox.className).toContain("staffOperatorSelect");
    expect(rowBox.parentElement?.className).toContain("staffTableSelectHit");
    expect(headerBox.parentElement?.className).toContain("staffTableSelectHit");
    expect(rowBox.closest("td")).toBeTruthy();
    expect(headerBox.closest("th")).toBeTruthy();
    expect(rowBox.checked).toBe(false);
    expect(headerBox.indeterminate).toBe(false);

    act(() => {
      rowBox.click();
    });
    expect(checkbox("Select Alpha draft").checked).toBe(true);
    expect(checkbox("Select Beta draft").checked).toBe(false);
    expect(checkbox("Select all rows on this page").checked).toBe(false);
    expect(checkbox("Select all rows on this page").indeterminate).toBe(true);
  });

  it("selects one row and all rows on the current page without changing title links", () => {
    render([draft, second]);
    const link = container.querySelector(
      'a[href="/operator/templates/alpha/draft"]'
    );
    expect(link?.textContent).toBe("Alpha draft");
    expect(container.textContent).not.toContain("template selected");

    act(() => {
      checkbox("Select Alpha draft").click();
    });
    expect(checkbox("Select Alpha draft").checked).toBe(true);
    expect(checkbox("Select Beta draft").checked).toBe(false);
    expect(container.textContent).toContain("1 template selected");

    act(() => {
      checkbox("Select all rows on this page").click();
    });
    expect(checkbox("Select Alpha draft").checked).toBe(true);
    expect(checkbox("Select Beta draft").checked).toBe(true);
    expect(container.textContent).toContain("2 templates selected");

    act(() => {
      checkbox("Select all rows on this page").click();
    });
    expect(checkbox("Select Alpha draft").checked).toBe(false);
    expect(checkbox("Select Beta draft").checked).toBe(false);
  });

  it("clears selection when the visible filter changes", () => {
    render([draft, second], "dental");
    act(() => {
      checkbox("Select all rows on this page").click();
    });
    expect(container.textContent).toContain("2 templates selected");
    render([draft], "physio");
    expect(checkbox("Select Alpha draft").checked).toBe(false);
    expect(container.textContent).not.toContain("template selected");
  });

  it("disables production actions for a sample and explains mixed selection", () => {
    render([draft, sample, published]);
    act(() => {
      checkbox("Select Tooth Extraction").click();
    });
    const publish = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Publish"
    ) as HTMLButtonElement;
    const remove = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Delete"
    ) as HTMLButtonElement;
    expect(publish.disabled).toBe(true);
    expect(remove.disabled).toBe(true);
    expect(container.textContent).toContain("is a sample");
    expect(container.textContent).not.toContain("Unpublish");

    act(() => {
      checkbox("Select Alpha draft").click();
      checkbox("Select Published example").click();
    });
    expect(container.textContent).toContain(
      "Delete unavailable — 1 selected template is a sample and 1 selected template has a published revision."
    );
    expect(publish.disabled).toBe(true);
  });

  it("confirms publish with names and clears the selection after success", async () => {
    render([draft, second]);
    act(() => {
      checkbox("Select all rows on this page").click();
    });
    const open = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Publish"
    ) as HTMLButtonElement;
    expect(open.disabled).toBe(false);
    act(() => {
      open.click();
    });
    const dialog = container.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.textContent).toContain("Publish 2 templates?");
    expect(dialog.textContent).toContain(
      "Each selected draft will become an immutable published revision."
    );
    expect(dialog.textContent).toContain("Alpha draft");
    expect(dialog.textContent).toContain("Beta draft");
    const confirm = [...dialog.querySelectorAll("button")].find(
      (button) => button.textContent === "Publish"
    ) as HTMLButtonElement;
    await act(async () => {
      confirm.click();
    });
    expect(bulkAction).toHaveBeenCalled();
    const formData = bulkAction.mock.calls[0]?.[1];
    expect(formData).toBeInstanceOf(FormData);
    if (!(formData instanceof FormData)) {
      throw new Error("Expected the bulk action form data.");
    }
    expect(formData.get("operation")).toBe("publish");
    expect(JSON.parse(String(formData.get("templates")))).toEqual([
      {
        templateId: "alpha",
        revisionId: "alpha-draft",
        expectedVersion: 1,
      },
      {
        templateId: "beta",
        revisionId: "beta-draft",
        expectedVersion: 1,
      },
    ]);
    expect(container.textContent).toContain("2 templates published.");
    expect(checkbox("Select Alpha draft").checked).toBe(false);
    expect(checkbox("Select Beta draft").checked).toBe(false);
  });
});
