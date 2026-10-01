/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());
const bulkAction = vi.hoisted(() => vi.fn(async () => ({ ok: true })));

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

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    replace,
  }),
}));

vi.mock("@/app/(staff)/(operator)/operator/templates/actions", () => ({
  applyCanonicalTemplateBulkAction: () => bulkAction(),
}));

import {
  TemplateBulkTable,
  templateTablePreviewHref,
  type TemplateBulkTableRow,
} from "@/app/(staff)/(operator)/operator/templates/template-bulk-table";
import { CLINIC_GUIDE_COLUMNS } from "@/lib/clinic-portal/guide-table-columns";
import { OPERATOR_TEMPLATE_COLUMNS } from "@/lib/operator/canonical-templates/template-table-columns";
import {
  operatorTemplatesListHref,
  type OperatorTemplateTableState,
} from "@/lib/operator/canonical-templates/template-table-state";
import { sanitizeTablePreferences } from "@/lib/staff/table-controls";

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
    draft: null,
    ...overrides,
  };
}

const published = row({
  id: "crown",
  title: "Dental Crown",
  latestPublishedVersion: 3,
});
const publishedWithDraft = row({
  id: "implant",
  title: "Dental Implant",
  latestPublishedVersion: 2,
  draft: { id: "implant-draft", version: 4 },
});
const neverPublished = row({
  id: "draft-only",
  title: "Unfinished Guide",
  draft: { id: "draft-only-revision", version: 1 },
});
const inactivePublished = row({
  id: "paused",
  title: "Paused Crown",
  isActive: false,
  latestPublishedVersion: 1,
});
const sample = row({
  id: "sample",
  title: "Tooth Extraction",
  slug: "extraction",
  href: "/operator/templates/sample",
  isSample: true,
  latestPublishedVersion: 1,
});

const filteredState: OperatorTemplateTableState = {
  category: "DENTAL",
  activity: "active",
  publication: "published",
  q: "crown",
  sort: "service",
  direction: "desc",
  pageSize: 10,
  pageSizeExplicit: true,
  requestedPage: 2,
};

describe("template table preview", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    push.mockClear();
    replace.mockClear();
    bulkAction.mockClear();
    window.localStorage.clear();
    vi.spyOn(window, "open").mockImplementation(() => null);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  function render(
    templates: TemplateBulkTableRow[],
    props: {
      state?: OperatorTemplateTableState;
      page?: number;
      total?: number;
    } = {}
  ) {
    act(() => {
      root.render(
        <TemplateBulkTable
          templates={templates}
          state={props.state}
          page={props.page}
          total={props.total ?? templates.length}
        />
      );
    });
  }

  function previewLink(title: string) {
    return container.querySelector(
      `a[aria-label="Preview ${title} in a new tab"]`
    ) as HTMLAnchorElement | null;
  }

  function checkbox(label: string) {
    return container.querySelector(
      `input[aria-label="${label}"]`
    ) as HTMLInputElement;
  }

  function settingsCheckbox(label: string) {
    const match = [
      ...container.querySelectorAll(".staffTableSettingsCheck"),
    ].find((element) => element.textContent?.trim().startsWith(label));
    return match?.querySelector("input") as HTMLInputElement;
  }

  function columnHeaders() {
    return [...container.querySelectorAll("table th")].map(
      (header) => header.textContent
    );
  }

  function bodyRow(title: string) {
    return [...container.querySelectorAll("tbody tr")].find((rowElement) =>
      rowElement.textContent?.includes(title)
    );
  }

  it("links only the latest published preview and keeps drafts off that route", () => {
    expect(templateTablePreviewHref(published)).toBe(
      "/operator/templates/crown/preview"
    );
    expect(templateTablePreviewHref(publishedWithDraft)).toBe(
      "/operator/templates/implant/preview"
    );
    expect(templateTablePreviewHref(inactivePublished)).toBe(
      "/operator/templates/paused/preview"
    );
    expect(templateTablePreviewHref(sample)).toBe(
      "/operator/templates/sample/preview"
    );
    expect(templateTablePreviewHref(neverPublished)).toBeNull();

    render([
      published,
      publishedWithDraft,
      neverPublished,
      inactivePublished,
      sample,
    ]);

    for (const [title, id] of [
      ["Dental Crown", "crown"],
      ["Dental Implant", "implant"],
      ["Paused Crown", "paused"],
      ["Tooth Extraction", "sample"],
    ] as const) {
      const link = previewLink(title);
      expect(link, title).toBeTruthy();
      expect(link?.tagName).toBe("A");
      expect(link?.getAttribute("href")).toBe(
        `/operator/templates/${id}/preview`
      );
      expect(link?.getAttribute("target")).toBe("_blank");
      expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link?.className).toContain("staffBtn");
      expect(link?.className).toContain("staffTemplatePreviewLink");
      expect(
        link?.querySelector(".staffTemplatePreviewLabel")?.textContent
      ).toBe("Preview");
      expect(link?.querySelector("svg")).toBeTruthy();
      expect(link?.getAttribute("href")).not.toContain("implant-draft");
      expect(link?.getAttribute("href")).not.toContain("/preview/");
    }

    const implant = previewLink("Dental Implant");
    expect(implant?.getAttribute("href")).toBe(
      "/operator/templates/implant/preview"
    );
    expect(implant?.closest("tr")?.getAttribute("data-active")).toBe("true");
    const paused = bodyRow("Paused Crown");
    expect(paused?.getAttribute("data-active")).toBe("false");
    expect(paused?.querySelector("a[target='_blank']")).toBe(
      previewLink("Paused Crown")
    );
    const unfinished = bodyRow("Unfinished Guide");
    expect(unfinished?.textContent).toContain(
      "Preview unavailable for Unfinished Guide"
    );
    expect(unfinished?.querySelector("a[target='_blank']")).toBeNull();
    expect(unfinished?.querySelector("[aria-hidden='true']")?.textContent).toBe(
      "—"
    );
    expect(container.textContent).not.toContain(
      "/operator/templates/draft-only/preview"
    );

    const headers = columnHeaders();
    expect(headers.at(-1)).toBe("Preview");
    const previewHeader =
      container.querySelectorAll("table th")[headers.length - 1];
    expect(previewHeader?.querySelector("a")).toBeNull();
    expect(previewHeader?.getAttribute("aria-sort")).toBeNull();
  });

  it("keeps the title workspace link and the selection checkbox independent of Preview", () => {
    render([publishedWithDraft, neverPublished]);
    const implantPreview = previewLink("Dental Implant");
    const title = container.querySelector(
      "a.staffOperatorRowLink"
    ) as HTMLAnchorElement;
    const titleClicks = vi.fn();
    const rowClicks = vi.fn();
    title.addEventListener("click", titleClicks);
    title.closest("tr")?.addEventListener("click", rowClicks);

    expect(title.getAttribute("href")).toBe(
      "/operator/templates/implant/draft"
    );
    expect(checkbox("Select Dental Implant").checked).toBe(false);

    act(() => {
      checkbox("Select Dental Implant").click();
    });
    expect(checkbox("Select Dental Implant").checked).toBe(true);
    expect(checkbox("Select Unfinished Guide").checked).toBe(false);

    act(() => {
      implantPreview?.click();
    });
    expect(checkbox("Select Dental Implant").checked).toBe(true);
    expect(titleClicks).not.toHaveBeenCalled();
    const previewClick = rowClicks.mock.calls.at(-1)?.[0] as MouseEvent;
    expect(
      (previewClick.target as Element).closest("a.staffTemplatePreviewLink")
    ).toBe(implantPreview);
    expect(
      (previewClick.target as Element).closest("a.staffOperatorRowLink")
    ).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
    expect(bulkAction).not.toHaveBeenCalled();

    act(() => {
      checkbox("Select Dental Implant").click();
    });
    expect(checkbox("Select Dental Implant").checked).toBe(false);
    act(() => {
      implantPreview?.click();
    });
    expect(checkbox("Select Dental Implant").checked).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("leaves filters, pagination, scroll, and table settings intact", () => {
    render([published, publishedWithDraft], {
      state: filteredState,
      page: 2,
      total: 24,
    });
    const previousHref = operatorTemplatesListHref({
      ...filteredState,
      page: 1,
    });
    const nextHref = operatorTemplatesListHref({ ...filteredState, page: 3 });
    expect(container.querySelector("a[rel='prev']")?.getAttribute("href")).toBe(
      previousHref
    );
    expect(container.querySelector("a[rel='next']")?.getAttribute("href")).toBe(
      nextHref
    );
    expect(
      (container.querySelector("input[type='search']") as HTMLInputElement)
        .value
    ).toBe("crown");
    expect(
      (container.querySelector("#category") as HTMLSelectElement).value
    ).toBe("DENTAL");

    const scroller = container.querySelector(
      ".staffDataTableScroll"
    ) as HTMLElement;
    let scrollLeft = 24;
    let scrollTop = 8;
    Object.defineProperty(scroller, "scrollLeft", {
      configurable: true,
      get: () => scrollLeft,
      set: (value: number) => {
        scrollLeft = value;
      },
    });
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });

    const previewSettings = settingsCheckbox("Preview");
    expect(previewSettings.disabled).toBe(false);
    expect(previewSettings.checked).toBe(true);
    expect(settingsCheckbox("Template").disabled).toBe(true);
    expect(columnHeaders()).toContain("Preview");

    act(() => {
      previewLink("Dental Crown")?.click();
    });
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(scroller.scrollLeft).toBe(24);
    expect(scroller.scrollTop).toBe(8);
    expect(container.querySelector("a[rel='next']")?.getAttribute("href")).toBe(
      nextHref
    );
    expect(
      (container.querySelector("input[type='search']") as HTMLInputElement)
        .value
    ).toBe("crown");
    expect(
      (container.querySelector("#category") as HTMLSelectElement).value
    ).toBe("DENTAL");
    expect(checkbox("Select Dental Crown").checked).toBe(false);

    act(() => {
      previewSettings.click();
    });
    expect(columnHeaders()).not.toContain("Preview");
    expect(previewLink("Dental Crown")).toBeNull();
    expect(container.querySelector("a[rel='next']")?.getAttribute("href")).toBe(
      nextHref
    );
    expect(push).not.toHaveBeenCalled();
    expect(
      container.querySelector("a.staffOperatorRowLink")?.getAttribute("href")
    ).toBe("/operator/templates/crown/draft");

    act(() => {
      settingsCheckbox("Preview").click();
    });
    expect(previewLink("Dental Crown")?.getAttribute("href")).toBe(
      "/operator/templates/crown/preview"
    );
    expect(container.querySelector("a[rel='next']")?.getAttribute("href")).toBe(
      nextHref
    );
  });

  it("is keyboard reachable and does not cancel the browser link action", () => {
    render([published, sample]);
    const link = previewLink("Dental Crown");
    if (!link) {
      throw new Error("Expected the Dental Crown preview link.");
    }
    expect(link.tabIndex).toBe(0);
    const title = container.querySelector(
      "a.staffOperatorRowLink"
    ) as HTMLAnchorElement;
    expect(
      link.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_PRECEDING
    ).toBeTruthy();

    act(() => {
      link?.focus();
    });
    expect(document.activeElement).toBe(link);

    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    link?.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    expect(checkbox("Select Dental Crown").checked).toBe(false);
    expect(push).not.toHaveBeenCalled();

    const sampleLink = previewLink("Tooth Extraction");
    act(() => {
      sampleLink?.focus();
    });
    expect(document.activeElement).toBe(sampleLink);
    expect(sampleLink?.getAttribute("href")).toBe(
      "/operator/templates/sample/preview"
    );
  });

  it("keeps Preview on the operator table only, above the row-title overlay", () => {
    expect(OPERATOR_TEMPLATE_COLUMNS.map((column) => column.id)).toContain(
      "preview"
    );
    const previewColumn = OPERATOR_TEMPLATE_COLUMNS.find(
      (column) => column.id === "preview"
    );
    expect(previewColumn).toMatchObject({
      label: "Preview",
      required: false,
      defaultVisible: true,
      sortable: false,
    });
    expect(
      sanitizeTablePreferences(
        { hiddenColumnIds: ["preview", "template", "status"] },
        OPERATOR_TEMPLATE_COLUMNS
      ).hiddenColumnIds
    ).toEqual(["preview"]);
    expect(CLINIC_GUIDE_COLUMNS.map((column) => column.id)).not.toContain(
      "preview"
    );

    const table = readFileSync(
      "app/(staff)/(operator)/operator/templates/template-bulk-table.tsx",
      "utf8"
    );
    const guides = readFileSync(
      "app/(staff)/(clinic-portal)/guides/clinic-guides-table.tsx",
      "utf8"
    );
    const styles = readFileSync("app/(staff)/staff.css", "utf8");
    expect(table).not.toContain("window.open");
    expect(table).not.toContain("createCanonicalTemplateDraft");
    expect(guides).not.toContain("staffTemplatePreview");
    expect(guides).not.toContain("OPERATOR_TEMPLATE_COLUMNS");

    const previewCell = styles.slice(
      styles.indexOf(".staffDataTable td.staffTemplatePreviewCol {")
    );
    const previewCellRule = previewCell.slice(0, previewCell.indexOf("}"));
    expect(previewCellRule).toContain("position: relative");
    expect(previewCellRule).toContain("z-index: 1");
    expect(styles).toContain("@media (max-width: 720px)");
    expect(styles).toContain(".staffTemplatePreviewLabel");
    const tableRuleStart = styles.indexOf(".staffDataTable {");
    const tableRule = styles.slice(
      tableRuleStart,
      styles.indexOf("}", tableRuleStart)
    );
    expect(tableRule).toContain("min-width: 48rem");
    const scrollRuleStart = styles.indexOf(".staffDataTableScroll {");
    const scrollRule = styles.slice(
      scrollRuleStart,
      styles.indexOf("}", scrollRuleStart)
    );
    expect(scrollRule).toContain("min-width: 48rem");
    const linkRule = styles.slice(
      styles.indexOf(".staffTemplatePreviewLink {"),
      styles.indexOf(".staffTemplatePreviewLink {") + 400
    );
    expect(linkRule).toContain("z-index: 1");
    expect(styles).toContain(".staffBtn:focus-visible");
  });
});
