/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());

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
  useRouter: () => ({ push, replace }),
}));

vi.mock("@/app/(staff)/(operator)/operator/templates/actions", () => ({
  applyCanonicalTemplateBulkAction: async () => ({}),
}));

vi.mock("@/app/(staff)/(clinic-portal)/guides/guide-row-actions", () => ({
  GuideRowActions: () => null,
}));

import { TablePagination } from "@/app/(staff)/components/table-controls/table-pagination";
import {
  TemplateBulkTable,
  type TemplateBulkTableRow,
} from "@/app/(staff)/(operator)/operator/templates/template-bulk-table";
import { ClinicGuidesTable } from "@/app/(staff)/(clinic-portal)/guides/clinic-guides-table";
import { OPERATOR_TEMPLATES_TABLE_ID } from "@/lib/operator/canonical-templates/template-table-state";
import { CLINIC_GUIDES_TABLE_ID } from "@/lib/clinic-portal/guide-table-state";
import { tablePreferenceStorageKey } from "@/lib/staff/table-controls";

function row(id: string, title: string): TemplateBulkTableRow {
  return {
    id,
    title,
    slug: id,
    href: `/operator/templates/${id}`,
    serviceCategory: "DENTAL",
    serviceCategoryLabel: "Dental",
    isActive: true,
    isSample: false,
    latestPublishedVersion: null,
    draft: { id: `${id}-draft`, version: 1 },
  };
}

describe("table control UI", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    push.mockClear();
    replace.mockClear();
    window.localStorage.clear();
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("disables previous on the first page and next on the last page", () => {
    act(() => {
      root.render(
        <TablePagination
          page={1}
          pageSize={25}
          total={83}
          hrefForPage={(page) => `/operator/templates?page=${page}`}
        />
      );
    });
    expect(container.textContent).toContain("Showing 1–25 of 83");
    const previous = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Previous")
    ) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);
    expect(container.querySelector("[aria-current='page']")?.textContent).toBe(
      "1"
    );
    expect(container.querySelector("a[rel='next']")?.getAttribute("href")).toBe(
      "/operator/templates?page=2"
    );

    act(() => {
      root.render(
        <TablePagination
          page={4}
          pageSize={25}
          total={83}
          hrefForPage={(page) => `/operator/templates?page=${page}`}
        />
      );
    });
    const next = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Next")
    ) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    expect(container.querySelector("[aria-current='page']")?.textContent).toBe(
      "4"
    );
  });

  it("does not render pagination when there are no rows", () => {
    act(() => {
      root.render(
        <TablePagination
          page={1}
          pageSize={25}
          total={0}
          hrefForPage={() => "/operator/templates"}
        />
      );
    });
    expect(container.textContent).toBe("");
  });

  it("restores presentation preferences and keeps required columns", async () => {
    window.localStorage.setItem(
      tablePreferenceStorageKey(OPERATOR_TEMPLATES_TABLE_ID),
      JSON.stringify({
        pageSize: 25,
        wrapText: false,
        density: "compact",
        hiddenColumnIds: ["service", "template", "status"],
      })
    );
    const templates = [row("alpha", "Alpha draft"), row("beta", "Beta draft")];
    await act(async () => {
      root.render(<TemplateBulkTable templates={templates} />);
    });
    const table = container.querySelector("table");
    expect(table?.getAttribute("data-wrap")).toBe("off");
    expect(table?.getAttribute("data-density")).toBe("compact");
    const headers = [...container.querySelectorAll("th")].map(
      (header) => header.textContent
    );
    expect(headers.join(" ")).toContain("Template");
    expect(headers.join(" ")).toContain("Status");
    expect(headers.join(" ")).not.toContain("Service");
    const locked = [
      ...container.querySelectorAll("input[type='checkbox'][disabled]"),
    ];
    expect(locked.length).toBeGreaterThanOrEqual(2);
    expect(locked.every((input) => (input as HTMLInputElement).checked)).toBe(
      true
    );

    const reset = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Reset to defaults"
    ) as HTMLButtonElement;
    await act(async () => {
      reset.click();
    });
    expect(table?.getAttribute("data-wrap")).toBe("on");
    expect(table?.getAttribute("data-density")).toBe("comfortable");
    expect(
      [...container.querySelectorAll("th")].some((header) =>
        header.textContent?.includes("Service")
      )
    ).toBe(true);
    const stored = JSON.parse(
      window.localStorage.getItem(
        tablePreferenceStorageKey(OPERATOR_TEMPLATES_TABLE_ID)
      ) ?? "{}"
    );
    expect(stored.wrapText).toBe(true);
    expect(stored.density).toBe("comfortable");
    expect(stored.hiddenColumnIds).toEqual([]);
  });

  it("selects only the rendered page and clears that selection when the page changes", () => {
    const firstPage = [row("alpha", "Alpha draft"), row("beta", "Beta draft")];
    act(() => {
      root.render(
        <TemplateBulkTable templates={firstPage} filterKey="page-1" />
      );
    });
    const selectAll = container.querySelector(
      "input[aria-label='Select all rows on this page']"
    ) as HTMLInputElement;
    act(() => {
      selectAll.click();
    });
    expect(container.textContent).toContain("2 templates selected");
    act(() => {
      root.render(
        <TemplateBulkTable
          templates={[row("gamma", "Gamma draft")]}
          filterKey="page-2"
        />
      );
    });
    expect(container.textContent).not.toContain("template selected");
    expect(
      (
        container.querySelector(
          "input[aria-label='Select Gamma draft']"
        ) as HTMLInputElement
      ).checked
    ).toBe(false);
  });

  it("debounces search into the URL and returns to page 1", async () => {
    await act(async () => {
      root.render(
        <TemplateBulkTable templates={[row("alpha", "Alpha draft")]} />
      );
    });
    const input = container.querySelector(
      "input[type='search']"
    ) as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;
      setter?.call(input, "implant");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(push).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(push).toHaveBeenCalledWith("/operator/templates?q=implant");
  });

  it("persists clinic guide column preferences separately", async () => {
    window.localStorage.setItem(
      tablePreferenceStorageKey(CLINIC_GUIDES_TABLE_ID),
      JSON.stringify({
        pageSize: 10,
        wrapText: true,
        density: "comfortable",
        hiddenColumnIds: ["source", "guide"],
      })
    );
    await act(async () => {
      root.render(
        <ClinicGuidesTable
          page={1}
          total={1}
          state={{
            q: "",
            sort: "guide",
            direction: "asc",
            pageSize: 25,
            pageSizeExplicit: true,
            requestedPage: 1,
          }}
          guides={[
            {
              id: "guide-1",
              title: "Dental Implant Placement",
              publicSlug: "implant",
              sourceLabel: "Custom guide",
              updatedLabel: "1 Sep 2026",
              lifecycle: "published",
              canManage: true,
              isPublishedPublic: false,
              previewHref: null,
              destructiveAction: null,
              canUnpublish: true,
            },
          ]}
        />
      );
    });
    const headers = [...container.querySelectorAll("th")].map((header) =>
      header.textContent?.replace(/, sorted.*/, "")
    );
    expect(headers.join(" ")).toContain("Guide");
    expect(headers.join(" ")).toContain("Status");
    expect(headers.join(" ")).not.toContain("Source");
    expect(container.textContent).toContain("Dental Implant Placement");
    expect(
      container.querySelector("[aria-label='Table settings']")
    ).toBeTruthy();
    expect(container.querySelector("input[type='search']")).toBeTruthy();
    expect(container.querySelector(".staffTableSettingsBody")).toBeTruthy();
    expect(container.querySelector(".staffTableSettingsPrimary")).toBeTruthy();
    expect(
      container.querySelector(".staffTableSettingsColumnsPane")
    ).toBeTruthy();
    const settingsChecks = [
      ...container.querySelectorAll(".staffTableSettingsCheck input"),
    ] as HTMLInputElement[];
    expect(settingsChecks.length).toBeGreaterThan(0);
    expect(
      settingsChecks.every(
        (input) => !input.classList.contains("staffOperatorSelect")
      )
    ).toBe(true);
  });

  it("restores the 1rem selection checkbox and widens shared table settings", () => {
    const styles = readFileSync("app/(staff)/staff.css", "utf8");
    const selection = styles.slice(
      styles.indexOf(".staffDataTable .staffOperatorSelect {")
    );
    const selectionRule = selection.slice(0, selection.indexOf("}"));
    expect(selectionRule).toContain("width: 1rem");
    expect(selectionRule).toContain("height: 1rem");
    expect(styles).not.toMatch(
      /\.staffDataTable \.staffOperatorSelect \{[^}]*1\.5rem/
    );
    expect(styles).toContain(".staffTableSelectHit");
    expect(styles).toContain(
      ".staffDataTable .staffOperatorSelect:focus-visible"
    );
    expect(styles).toMatch(
      /\.staffTableSettingsCheck input \{[^}]*width: 1rem;[^}]*height: 1rem;/
    );
    expect(styles).toContain("width: min(42rem, calc(100vw - 2rem))");
    expect(styles).toContain(
      '.staffTableSettings[data-placement="popover"] .staffTableSettingsBody'
    );
    expect(styles).toContain('.staffTableSettings[data-placement="sheet"]');
    expect(styles).toContain("grid-template-columns:");

    act(() => {
      root.render(
        <TemplateBulkTable templates={[row("alpha", "Alpha draft")]} />
      );
    });
    expect(container.querySelector(".staffTableSettingsBody")).toBeTruthy();
    expect(
      container.querySelector(".staffTableSelectHit .staffOperatorSelect")
    ).toBeTruthy();
  });
});
