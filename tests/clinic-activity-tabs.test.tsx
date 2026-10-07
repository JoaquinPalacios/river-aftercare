import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ClinicActivityTabs,
  operatorClinicListActivity,
} from "@/app/(staff)/(operator)/operator/clinics/clinic-activity-tabs";
import type { OperatorClinicActivity } from "@/lib/operator/list-operator-clinics";

function activityLinks(activity: OperatorClinicActivity) {
  const html = renderToStaticMarkup(<ClinicActivityTabs activity={activity} />);
  const nav =
    html.match(
      /<nav[^>]*aria-label="Clinic activity"[^>]*>[\s\S]*?<\/nav>/
    )?.[0] ?? "";
  return [...nav.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((match) => {
    const attrs = match[1] ?? "";
    return {
      href: attrs.match(/href="([^"]*)"/)?.[1] ?? "",
      current: attrs.match(/aria-current="([^"]*)"/)?.[1] ?? null,
      className: attrs.match(/class="([^"]*)"/)?.[1] ?? "",
      label: (match[2] ?? "").replace(/<[^>]+>/g, "").trim(),
    };
  });
}

describe("clinic activity tabs", () => {
  it("selects Active on the active route", () => {
    expect(operatorClinicListActivity(undefined)).toBe("active");
    const links = activityLinks("active");
    expect(links.map((link) => link.label)).toEqual([
      "Active",
      "Inactive",
      "Deleted",
    ]);
    expect(links.find((link) => link.current === "page")).toMatchObject({
      label: "Active",
      href: "/operator/clinics",
    });
    expect(links.filter((link) => link.current === "page")).toHaveLength(1);
  });

  it("selects Inactive on the inactive route", () => {
    expect(operatorClinicListActivity("inactive")).toBe("inactive");
    const links = activityLinks("inactive");
    expect(links.find((link) => link.current === "page")).toMatchObject({
      label: "Inactive",
      href: "/operator/clinics?activity=inactive",
    });
    expect(links.filter((link) => link.current === "page")).toHaveLength(1);
    expect(links.find((link) => link.label === "Active")?.current).toBeNull();
    expect(links.find((link) => link.label === "Deleted")?.current).toBeNull();
  });

  it("selects Deleted on the permanently deleted route", () => {
    expect(operatorClinicListActivity("retired")).toBe("retired");
    const links = activityLinks("retired");
    expect(links.find((link) => link.label === "Deleted")).toMatchObject({
      href: "/operator/clinics?activity=retired",
      current: "page",
      className: "staffActivityTab",
    });
    expect(links.filter((link) => link.current === "page")).toHaveLength(1);
    expect(links.map((link) => link.label)).not.toContain("Retired");
  });

  it("keeps the list filter named retired and the visible tab named Deleted", () => {
    expect(operatorClinicListActivity("deleted")).toBe("active");
    const page = readFileSync(
      "app/(staff)/(operator)/operator/clinics/page.tsx",
      "utf8"
    );
    expect(page).toContain("operatorClinicListActivity(params.activity)");
    expect(page).toContain("<ClinicActivityTabs activity={activity} />");
    expect(page).not.toMatch(/>\s*Retired\s*</);
    const css = readFileSync("app/(staff)/staff.css", "utf8");
    const styles = css.slice(
      css.indexOf(".staffActivityTabs"),
      css.indexOf(".staffOperatorSummary")
    );
    expect(styles).toContain(".staffActivityTab:hover");
    expect(styles).toContain("border-color: var(--staff-line)");
    expect(styles).toContain("background: var(--staff-panel)");
    expect(styles).toContain("color: var(--staff-ink)");
    expect(styles).toContain(".staffActivityTab:focus-visible");
    expect(styles).toContain(
      "outline: var(--interaction-focus-width) solid var(--staff-brand)"
    );
    expect(styles).toContain("outline-offset: var(--interaction-focus-offset)");
    expect(styles).toContain('.staffActivityTab[aria-current="page"]');
    expect(styles).toContain("font-weight: 650");
    expect(styles).toContain("color: var(--staff-muted)");
  });
});
