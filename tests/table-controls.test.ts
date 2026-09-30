import { describe, expect, it } from "vitest";

import {
  clinicGuideSortHref,
  clinicGuidesListHref,
  parseClinicGuideTableState,
} from "@/lib/clinic-portal/guide-table-state";
import { CLINIC_GUIDE_COLUMNS } from "@/lib/clinic-portal/guide-table-columns";
import {
  operatorTemplatesListHref,
  operatorTemplateSortHref,
  parseOperatorTemplateTableState,
} from "@/lib/operator/canonical-templates/template-table-state";
import { OPERATOR_TEMPLATE_COLUMNS } from "@/lib/operator/canonical-templates/template-table-columns";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  paginationItems,
  parseRequestedPage,
  parseTablePageSize,
  resolveTablePage,
  sanitizeTablePreferences,
  tableRangeLabel,
  tableSettingsPanelFrame,
  TABLE_PAGE_SIZES,
  TABLE_SETTINGS_DESKTOP_MAX_REM,
} from "@/lib/staff/table-controls";

describe("table controls", () => {
  it("uses 25 as the default page size and only allows 10, 25, 50, and 100", () => {
    expect(DEFAULT_TABLE_PAGE_SIZE).toBe(25);
    expect(TABLE_PAGE_SIZES).toEqual([10, 25, 50, 100]);
    expect(parseTablePageSize(undefined)).toBeNull();
    expect(parseTablePageSize("25")).toBe(25);
    expect(parseTablePageSize("10")).toBe(10);
    expect(parseTablePageSize("100")).toBe(100);
    expect(parseTablePageSize("0")).toBeNull();
    expect(parseTablePageSize("all")).toBeNull();
    expect(parseTablePageSize("15")).toBeNull();
  });

  it("resolves invalid and out-of-range pages without using them as offsets", () => {
    expect(parseRequestedPage(undefined)).toBe(1);
    expect(parseRequestedPage("2")).toBe(2);
    expect(parseRequestedPage("0")).toBeNull();
    expect(parseRequestedPage("-3")).toBeNull();
    expect(parseRequestedPage("nope")).toBeNull();
    expect(resolveTablePage(null, 40, 25)).toEqual({
      page: 1,
      totalPages: 2,
      redirect: true,
    });
    expect(resolveTablePage(9, 40, 25)).toEqual({
      page: 2,
      totalPages: 2,
      redirect: true,
    });
    expect(resolveTablePage(2, 40, 25)).toEqual({
      page: 2,
      totalPages: 2,
      redirect: false,
    });
    expect(resolveTablePage(5, 0, 25)).toEqual({
      page: 1,
      totalPages: 0,
      redirect: true,
    });
    expect(resolveTablePage(1, 0, 25).redirect).toBe(false);
  });

  it("labels the filtered range and abbreviates long page lists", () => {
    expect(tableRangeLabel(1, 25, 87)).toBe("Showing 1–25 of 87");
    expect(tableRangeLabel(2, 25, 87)).toBe("Showing 26–50 of 87");
    expect(paginationItems(1, 4)).toEqual([1, 2, 3, 4]);
    expect(paginationItems(5, 18)).toEqual([1, "gap", 4, 5, 6, "gap", 18]);
    expect(paginationItems(1, 18)).toEqual([1, 2, "gap", 18]);
    expect(paginationItems(18, 18)).toEqual([1, "gap", 17, 18]);
  });

  it("resets the page when search, filters, sort, or page size change", () => {
    const state = parseOperatorTemplateTableState({
      category: "DENTAL",
      activity: "active",
      q: "implant",
      sort: "template",
      direction: "asc",
      page: "2",
      pageSize: "25",
    });
    expect(operatorTemplatesListHref({ ...state, page: 2 })).toBe(
      "/operator/templates?category=DENTAL&activity=active&q=implant&page=2"
    );
    expect(operatorTemplatesListHref({ ...state, q: "crown", page: 1 })).toBe(
      "/operator/templates?category=DENTAL&activity=active&q=crown"
    );
    expect(operatorTemplateSortHref(state, "service")).toBe(
      "/operator/templates?category=DENTAL&activity=active&q=implant&sort=service&direction=asc"
    );
    expect(operatorTemplatesListHref({ ...state, pageSize: 10, page: 1 })).toBe(
      "/operator/templates?category=DENTAL&activity=active&q=implant&pageSize=10"
    );
    expect(operatorTemplateSortHref(state, "template")).toContain(
      "direction=desc"
    );
    expect(operatorTemplateSortHref(state, "template")).not.toContain("page=");
  });

  it("keeps clinic guide search and sort in the URL and drops the default page", () => {
    const state = parseClinicGuideTableState({
      q: "implant",
      sort: "guide",
      direction: "asc",
      page: "3",
    });
    expect(clinicGuidesListHref({ ...state, page: 3 })).toBe(
      "/guides?q=implant&page=3"
    );
    expect(clinicGuideSortHref(state, "updated")).toBe(
      "/guides?q=implant&sort=updated&direction=desc"
    );
    expect(clinicGuidesListHref({ ...state, q: "", page: 1 })).toBe("/guides");
  });

  it("refuses to hide required columns and restores defaults", () => {
    const stored = sanitizeTablePreferences(
      {
        pageSize: 50,
        wrapText: false,
        density: "compact",
        hiddenColumnIds: ["template", "status", "service", "not-a-column"],
      },
      OPERATOR_TEMPLATE_COLUMNS
    );
    expect(stored.pageSize).toBe(50);
    expect(stored.wrapText).toBe(false);
    expect(stored.density).toBe("compact");
    expect(stored.hiddenColumnIds).toEqual(["service"]);
    expect(
      sanitizeTablePreferences(
        { hiddenColumnIds: ["guide", "status", "source"] },
        CLINIC_GUIDE_COLUMNS
      ).hiddenColumnIds
    ).toEqual(["source"]);
    expect(
      sanitizeTablePreferences(null, OPERATOR_TEMPLATE_COLUMNS)
    ).toMatchObject({
      pageSize: 25,
      wrapText: true,
      density: "comfortable",
      hiddenColumnIds: [],
    });
  });

  it("sizes the shared settings panel for desktop and shifts it inside the viewport", () => {
    const rem = 16;
    const desktop = tableSettingsPanelFrame({
      viewportWidth: 1440,
      viewportHeight: 900,
      rem,
      buttonRight: 1400,
      buttonBottom: 120,
      narrow: false,
    });
    expect(TABLE_SETTINGS_DESKTOP_MAX_REM * rem).toBe(672);
    expect(desktop.placement).toBe("popover");
    expect(desktop.width).toBe("672px");
    expect(Number.parseFloat(desktop.left)).toBeGreaterThanOrEqual(8);
    expect(Number.parseFloat(desktop.left) + 672).toBeLessThanOrEqual(1440);

    const mid = tableSettingsPanelFrame({
      viewportWidth: 1024,
      viewportHeight: 800,
      rem,
      buttonRight: 980,
      buttonBottom: 80,
      narrow: false,
    });
    expect(mid.width).toBe("672px");
    expect(Number.parseFloat(mid.left) + 672).toBeLessThanOrEqual(1024);

    const tablet = tableSettingsPanelFrame({
      viewportWidth: 800,
      viewportHeight: 700,
      rem,
      buttonRight: 760,
      buttonBottom: 80,
      narrow: false,
    });
    expect(tablet.width).toBe("672px");

    const sheet = tableSettingsPanelFrame({
      viewportWidth: 390,
      viewportHeight: 800,
      rem,
      buttonRight: 360,
      buttonBottom: 80,
      narrow: true,
    });
    expect(sheet).toMatchObject({
      placement: "sheet",
      width: "auto",
      left: "0.75rem",
      right: "0.75rem",
      top: "auto",
    });
  });
});
