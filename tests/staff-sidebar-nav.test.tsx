/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/app/(staff)/(operator)/operator/support-actions", () => ({
  stopOperatorClinicSupportAction: async () => undefined,
}));

import { OperatorPlatformNav } from "@/app/(staff)/(operator)/components/operator-platform-nav";
import { OperatorAccountChrome } from "@/app/(staff)/components/operator-account-chrome";
import { PortalChrome } from "@/app/(staff)/components/portal-chrome";
import { StaffAccountPanel } from "@/app/(staff)/components/staff-account-panel";

function currentHrefs(root: ParentNode): string[] {
  return [...root.querySelectorAll('a[aria-current="page"]')].map(
    (link) => link.getAttribute("href") ?? ""
  );
}

describe("staff sidebar navigation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    nav.pathname = "/dashboard";
    localStorage.clear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  async function renderClinic(pathname: string) {
    nav.pathname = pathname;
    await act(async () => {
      root.render(
        <PortalChrome
          displayName="Riverside Dental Demo"
          userLabel="Ada Admin"
          roleLabel="Clinic admin"
          patientSiteHref={null}
          canManagePractice
          showProductNav
          billingHref="/account/billing"
        >
          <p>Clinic content</p>
        </PortalChrome>
      );
    });
  }

  function clinicNav(): HTMLElement {
    const navEl = container.querySelector(
      'aside nav[aria-label="Clinic portal"]'
    );
    expect(navEl).not.toBeNull();
    return navEl as HTMLElement;
  }

  it("marks only the matching clinic section, including nested guides", async () => {
    await renderClinic("/guides/new");
    const navEl = clinicNav();
    const links = [...navEl.querySelectorAll("a.staffNavRow")];

    expect(links.map((link) => link.tagName)).toEqual(["A", "A", "A", "A"]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/dashboard",
      "/guides",
      "/practice",
      "/practice/sites",
    ]);
    expect(currentHrefs(navEl)).toEqual(["/guides"]);
    expect(navEl.querySelector(".staffBtnSpinner")).toBeNull();
    expect(navEl.textContent).not.toContain("Loading");

    await renderClinic("/guides/guide_1");
    expect(currentHrefs(clinicNav())).toEqual(["/guides"]);

    await renderClinic("/dashboard");
    expect(currentHrefs(clinicNav())).toEqual(["/dashboard"]);

    await renderClinic("/practice");
    expect(currentHrefs(clinicNav())).toEqual(["/practice"]);

    await renderClinic("/practice/sites");
    expect(currentHrefs(clinicNav())).toEqual(["/practice/sites"]);

    await renderClinic("/practice/sites/site_1");
    expect(currentHrefs(clinicNav())).toEqual(["/practice/sites"]);
  });

  it("does not mark an unrelated clinic route as current", async () => {
    await renderClinic("/dashboard/extra");
    expect(currentHrefs(clinicNav())).toEqual([]);
  });

  it("keeps operator sections current only for their own nested routes", async () => {
    nav.pathname = "/operator/clinics/clinic_1/team";
    await act(async () => {
      root.render(<OperatorPlatformNav />);
    });

    const platform = container.querySelector(
      'nav[aria-label="Platform"]'
    ) as HTMLElement;
    const links = [...platform.querySelectorAll("a.staffNavRow")];
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/operator/clinics",
      "/operator/templates",
      "/operator/seo",
    ]);
    expect(currentHrefs(platform)).toEqual(["/operator/clinics"]);
    expect(platform.querySelector(".staffBtnSpinner")).toBeNull();

    nav.pathname = "/operator/seo";
    await act(async () => {
      root.render(<OperatorPlatformNav />);
    });
    expect(
      currentHrefs(
        container.querySelector('nav[aria-label="Platform"]') as HTMLElement
      )
    ).toEqual(["/operator/seo"]);

    nav.pathname = "/operator/templates/template_1/draft";
    await act(async () => {
      root.render(<OperatorPlatformNav />);
    });
    expect(
      currentHrefs(
        container.querySelector('nav[aria-label="Platform"]') as HTMLElement
      )
    ).toEqual(["/operator/templates"]);
  });

  it("keeps Account and Billing from both being current", async () => {
    nav.pathname = "/account/billing/setup";
    await act(async () => {
      root.render(
        <StaffAccountPanel
          userLabel="Ada Admin"
          roleLabel="Clinic admin"
          billingHref="/account/billing"
        />
      );
    });

    expect(currentHrefs(container)).toEqual(["/account/billing"]);

    nav.pathname = "/account/security";
    await act(async () => {
      root.render(
        <StaffAccountPanel
          userLabel="Ada Admin"
          roleLabel="Clinic admin"
          billingHref="/account/billing"
        />
      );
    });
    expect(currentHrefs(container)).toEqual(["/account"]);
  });

  it("collapses the desktop sidebar to icons and remembers the choice", async () => {
    await renderClinic("/guides");
    const aside = container.querySelector(
      "aside.staffAppSidebar"
    ) as HTMLElement;
    const toggle = aside.querySelector(
      ".staffSidebarToggle"
    ) as HTMLButtonElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe(aside.id);
    expect(aside.getAttribute("data-collapsed")).toBe("false");
    expect(aside.querySelector('[data-nav-icon="guides"]')).toBeTruthy();
    const guides = aside.querySelector(
      'a[href="/guides"]'
    ) as HTMLAnchorElement;
    expect(guides.getAttribute("aria-current")).toBe("page");
    expect(guides.getAttribute("data-tooltip")).toBe("Guides");
    expect(guides.querySelector(".staffNavLabel")?.textContent).toBe("Guides");

    await act(async () => {
      toggle.click();
    });
    expect(aside.getAttribute("data-collapsed")).toBe("true");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.querySelector(".staffNavLabel")?.textContent).toBe(
      "Expand sidebar"
    );
    expect(localStorage.getItem("river-aftercare-staff-sidebar")).toBe(
      "collapsed"
    );
    expect(guides.getAttribute("aria-current")).toBe("page");

    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await renderClinic("/guides");
    const restored = container.querySelector(
      "aside.staffAppSidebar"
    ) as HTMLElement;
    expect(restored.getAttribute("data-collapsed")).toBe("true");

    nav.pathname = "/operator/templates";
    await act(async () => {
      root.render(
        <OperatorAccountChrome userLabel="River Operator">
          <p>Operator content</p>
        </OperatorAccountChrome>
      );
    });
    const operatorAside = container.querySelector(
      "aside.staffAppSidebar"
    ) as HTMLElement;
    expect(operatorAside.getAttribute("data-collapsed")).toBe("true");
    const templates = operatorAside.querySelector(
      'a[href="/operator/templates"]'
    ) as HTMLAnchorElement;
    expect(templates.getAttribute("aria-current")).toBe("page");
    expect(templates.getAttribute("data-tooltip")).toBe("Templates");
    expect(
      operatorAside.querySelector('[data-nav-icon="templates"]')
    ).toBeTruthy();
    const expand = operatorAside.querySelector(
      ".staffSidebarToggle"
    ) as HTMLButtonElement;
    await act(async () => {
      expand.click();
    });
    expect(operatorAside.getAttribute("data-collapsed")).toBe("false");
    expect(localStorage.getItem("river-aftercare-staff-sidebar")).toBe(
      "expanded"
    );
  });

  it("does not add a navigation spinner to sidebar primitives", () => {
    const files = [
      "app/(staff)/components/portal-chrome.tsx",
      "app/(staff)/components/staff-account-panel.tsx",
      "app/(staff)/(operator)/components/operator-platform-nav.tsx",
      "app/(staff)/components/operator-account-chrome.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("staffBtnSpinner");
      expect(source, file).not.toContain("Loading...");
    }
  });
});
