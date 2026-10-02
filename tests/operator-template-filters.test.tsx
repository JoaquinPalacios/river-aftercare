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
  useRouter: () => ({
    push,
    replace,
  }),
}));

vi.mock("@/app/(staff)/(operator)/operator/templates/actions", () => ({
  applyCanonicalTemplateBulkAction: vi.fn(async () => ({ ok: true })),
}));

import {
  TemplateBulkTable,
  type TemplateBulkTableRow,
} from "@/app/(staff)/(operator)/operator/templates/template-bulk-table";
import {
  OPERATOR_TEMPLATES_TABLE_ID,
  operatorTemplatesFilterKey,
  operatorTemplatesListHref,
  type OperatorTemplateTableState,
} from "@/lib/operator/canonical-templates/template-table-state";

const filteredState: OperatorTemplateTableState = {
  category: "DENTAL",
  activity: "active",
  publication: "published",
  q: "crown",
  sort: "service",
  direction: "desc",
  pageSize: 10,
  pageSizeExplicit: true,
  requestedPage: 3,
};

function row(id: string, title: string): TemplateBulkTableRow {
  return {
    id,
    title,
    slug: id,
    href: `/operator/templates/${id}/draft`,
    serviceCategory: "DENTAL",
    serviceCategoryLabel: "Dental",
    isActive: true,
    isSample: false,
    latestPublishedVersion: 1,
    draft: null,
  };
}

describe("operator template filter controls", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    push.mockClear();
    replace.mockClear();
    window.localStorage.clear();
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

  function render(
    state: OperatorTemplateTableState,
    page = state.requestedPage ?? 1
  ) {
    act(() => {
      root.render(
        <TemplateBulkTable
          templates={[row("alpha", "Alpha guide"), row("beta", "Beta guide")]}
          state={state}
          page={page}
          total={40}
          filterKey={operatorTemplatesFilterKey(state, page)}
        />
      );
    });
  }

  function select(id: string) {
    return container.querySelector(`#${id}`) as HTMLSelectElement;
  }

  function button(label: string) {
    return [...container.querySelectorAll("button")].find(
      (item) => item.textContent === label
    ) as HTMLButtonElement | undefined;
  }

  function checkbox(label: string) {
    return container.querySelector(
      `input[aria-label="${label}"]`
    ) as HTMLInputElement;
  }

  it("hides Clear filters until a dropdown or applied filter leaves the default", () => {
    render({
      ...filteredState,
      category: "",
      activity: "",
      publication: "",
      requestedPage: 1,
    });
    expect(button("Clear filters")).toBeUndefined();
    expect(button("Apply filters")).toBeTruthy();
    expect(select("category").value).toBe("");
    expect(select("activity").value).toBe("");
    expect(select("publication").value).toBe("");

    act(() => {
      select("category").value = "PHYSIOTHERAPY";
      select("category").dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(push).not.toHaveBeenCalled();
    expect(select("category").value).toBe("PHYSIOTHERAPY");
    expect(button("Clear filters")).toBeTruthy();
    expect(button("Clear filters")?.className).toContain("staffBtnQuiet");
    expect(button("Clear filters")?.className).not.toContain("staffBtnDanger");
    expect(button("Apply filters")?.className).toContain("staffBtnSecondary");
  });

  it("applies the pending dropdowns without changing the Apply action", () => {
    render({
      ...filteredState,
      category: "",
      activity: "",
      publication: "",
      q: "crown",
      requestedPage: 1,
    });
    act(() => {
      select("activity").value = "inactive";
      select("activity").dispatchEvent(new Event("change", { bubbles: true }));
      select("publication").value = "draft";
      select("publication").dispatchEvent(
        new Event("change", { bubbles: true })
      );
    });
    expect(push).not.toHaveBeenCalled();
    act(() => {
      button("Apply filters")?.click();
    });
    expect(push).toHaveBeenCalledWith(
      operatorTemplatesListHref({
        ...filteredState,
        category: "",
        activity: "inactive",
        publication: "draft",
        q: "crown",
        page: 1,
      })
    );
  });

  it("clears applied and pending filters immediately and keeps search, sort, and presentation", () => {
    window.localStorage.setItem(
      `river-aftercare:table:${OPERATOR_TEMPLATES_TABLE_ID}`,
      JSON.stringify({
        pageSize: 10,
        wrapText: true,
        density: "compact",
        hiddenColumnIds: ["preview"],
      })
    );
    render(filteredState, 3);
    expect(button("Clear filters")).toBeTruthy();
    expect(select("category").value).toBe("DENTAL");
    expect(select("activity").value).toBe("active");
    expect(select("publication").value).toBe("published");
    expect(
      (container.querySelector("input[type='search']") as HTMLInputElement)
        .value
    ).toBe("crown");

    act(() => {
      checkbox("Select Alpha guide").click();
    });
    expect(container.textContent).toContain("1 template selected");

    act(() => {
      select("category").value = "CHIROPRACTIC";
      select("category").dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(select("category").value).toBe("CHIROPRACTIC");

    act(() => {
      button("Clear filters")?.click();
    });
    expect(select("category").value).toBe("");
    expect(select("activity").value).toBe("");
    expect(select("publication").value).toBe("");
    expect(checkbox("Select Alpha guide").checked).toBe(false);
    expect(container.textContent).not.toContain("template selected");
    expect(
      (container.querySelector("input[type='search']") as HTMLInputElement)
        .value
    ).toBe("crown");
    expect(push).toHaveBeenCalledWith(
      operatorTemplatesListHref({
        ...filteredState,
        category: "",
        activity: "",
        publication: "",
        page: 1,
      })
    );
    expect(push.mock.calls[0]?.[0]).not.toContain("category=");
    expect(push.mock.calls[0]?.[0]).not.toContain("page=");
    expect(push.mock.calls[0]?.[0]).toContain("q=crown");
    expect(push.mock.calls[0]?.[0]).toContain("sort=service");
    expect(push.mock.calls[0]?.[0]).toContain("direction=desc");
    expect(push.mock.calls[0]?.[0]).toContain("pageSize=10");

    const stored = window.localStorage.getItem(
      `river-aftercare:table:${OPERATOR_TEMPLATES_TABLE_ID}`
    );
    expect(stored).toContain('"wrapText":true');
    expect(stored).toContain('"density":"compact"');
    expect(stored).toContain("preview");
  });

  it("follows Back and Forward by matching the dropdowns to the URL filters", () => {
    render(filteredState, 3);
    expect(select("category").value).toBe("DENTAL");
    act(() => {
      select("activity").value = "inactive";
      select("activity").dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(select("activity").value).toBe("inactive");

    render(
      {
        ...filteredState,
        category: "",
        activity: "",
        publication: "draft",
      },
      1
    );
    expect(select("category").value).toBe("");
    expect(select("activity").value).toBe("");
    expect(select("publication").value).toBe("draft");
    expect(button("Clear filters")).toBeTruthy();

    render(
      {
        ...filteredState,
        category: "",
        activity: "",
        publication: "",
        q: "crown",
      },
      1
    );
    expect(select("category").value).toBe("");
    expect(select("activity").value).toBe("");
    expect(select("publication").value).toBe("");
    expect(button("Clear filters")).toBeUndefined();
    expect(
      (container.querySelector("input[type='search']") as HTMLInputElement)
        .value
    ).toBe("crown");
  });

  it("keeps Clear filters on the operator table and does not add a list query", () => {
    const table = readFileSync(
      "app/(staff)/(operator)/operator/templates/template-bulk-table.tsx",
      "utf8"
    );
    const page = readFileSync(
      "app/(staff)/(operator)/operator/templates/page.tsx",
      "utf8"
    );
    const guides = readFileSync(
      "app/(staff)/(clinic-portal)/guides/clinic-guides-table.tsx",
      "utf8"
    );
    const styles = readFileSync("app/(staff)/staff.css", "utf8");
    expect(table).toContain("Clear filters");
    expect(table).toContain("staffTableFilterFields");
    expect(table).toContain("staffTableFilterActions");
    expect(table).not.toContain("getPrisma");
    expect(page.match(/await queryOperatorCanonicalTemplates/g)).toHaveLength(
      1
    );
    expect(guides).not.toContain("Clear filters");
    expect(guides).not.toContain("staffTableFilters");
    expect(styles).toContain(".staffTableFilterFields");
    expect(styles).toContain("align-items: flex-end");
    expect(styles).toContain("margin-left: auto");
    const narrow = styles.slice(styles.indexOf("@media (max-width: 960px)"));
    expect(narrow).toContain(".staffTableFilterFields");
    expect(narrow).toContain("grid-template-columns: 1fr");
  });
});
