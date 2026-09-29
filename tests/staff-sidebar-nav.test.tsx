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
    const clinicsLink = platform.querySelector(
      'a[href="/operator/clinics"]'
    ) as HTMLAnchorElement;
    expect(clinicsLink.getAttribute("aria-current")).toBe("page");
    expect(clinicsLink.getAttribute("data-tooltip")).toBe("Clinics");
    expect(clinicsLink.querySelector('[data-nav-icon="clinics"]')).toBeTruthy();
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
    const clinics = operatorAside.querySelector(
      'a[href="/operator/clinics"]'
    ) as HTMLAnchorElement;
    expect(clinics.getAttribute("data-tooltip")).toBe("Clinics");
    expect(clinics.querySelector(".staffNavLabel")?.textContent).toBe(
      "Clinics"
    );
    const clinicsIcon = clinics.querySelector(
      '[data-nav-icon="clinics"]'
    ) as SVGElement;
    expect(clinicsIcon).toBeTruthy();
    expect(clinicsIcon.getAttribute("aria-hidden")).toBe("true");
    expect(clinicsIcon.innerHTML).toContain("M9.33 14v-2");
    expect(clinicsIcon.innerHTML).not.toContain("M2.8 13.2");
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

  it("shows collapsed sidebar tooltips outside the rail", async () => {
    localStorage.setItem("river-aftercare-staff-sidebar", "collapsed");
    nav.pathname = "/operator/templates";
    await act(async () => {
      root.render(
        <OperatorAccountChrome userLabel="River Operator">
          <p>Operator content</p>
        </OperatorAccountChrome>
      );
    });

    const aside = container.querySelector(
      "aside.staffAppSidebar"
    ) as HTMLElement;
    expect(aside.getAttribute("data-collapsed")).toBe("true");
    const clinics = aside.querySelector(
      'a[href="/operator/clinics"]'
    ) as HTMLAnchorElement;
    const templates = aside.querySelector(
      'a[href="/operator/templates"]'
    ) as HTMLAnchorElement;
    const seo = aside.querySelector(
      'a[href="/operator/seo"]'
    ) as HTMLAnchorElement;
    expect(templates.getAttribute("aria-current")).toBe("page");
    expect(clinics.querySelector(".staffNavLabel")?.textContent).toBe(
      "Clinics"
    );
    expect(templates.querySelector(".staffNavLabel")?.textContent).toBe(
      "Templates"
    );
    expect(seo.querySelector(".staffNavLabel")?.textContent).toBe(
      "SEO & Discovery"
    );

    clinics.getBoundingClientRect = () =>
      ({
        top: 120,
        right: 76,
        bottom: 164,
        left: 12,
        width: 64,
        height: 44,
        x: 12,
        y: 120,
        toJSON() {
          return {};
        },
      }) as DOMRect;

    await act(async () => {
      clinics.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    const hovered = document.body.querySelector(
      ".staffSidebarTooltip"
    ) as HTMLElement;
    expect(hovered).not.toBeNull();
    expect(hovered.textContent).toBe("Clinics");
    expect(hovered.getAttribute("role")).toBe("tooltip");
    expect(aside.contains(hovered)).toBe(false);
    expect(hovered.parentElement).toBe(document.body);
    expect(hovered.style.left).toBe("84px");
    expect(hovered.style.top).toBe("142px");

    await act(async () => {
      clinics.dispatchEvent(
        new MouseEvent("mouseout", {
          bubbles: true,
          relatedTarget: document.body,
        })
      );
    });
    expect(document.body.querySelector(".staffSidebarTooltip")).toBeNull();

    await act(async () => {
      seo.focus();
    });
    expect(
      document.body.querySelector(".staffSidebarTooltip")?.textContent
    ).toBe("SEO & Discovery");
    expect(seo.getAttribute("aria-current")).toBeNull();

    await act(async () => {
      seo.blur();
    });
    expect(document.body.querySelector(".staffSidebarTooltip")).toBeNull();

    const toggle = aside.querySelector(
      ".staffSidebarToggle"
    ) as HTMLButtonElement;
    await act(async () => {
      toggle.click();
    });
    expect(aside.getAttribute("data-collapsed")).toBe("false");
    expect(templates.getAttribute("aria-current")).toBe("page");
    await act(async () => {
      templates.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      templates.focus();
    });
    expect(document.body.querySelector(".staffSidebarTooltip")).toBeNull();
    expect(templates.querySelector(".staffNavLabel")?.textContent).toBe(
      "Templates"
    );

    const css = readFileSync("app/(staff)/staff.css", "utf8");
    expect(css).toContain(".staffSidebarTooltip");
    expect(css).toContain("position: fixed");
    expect(css).toContain("background: var(--staff-ink)");
    expect(css).toContain("color: var(--staff-panel)");
    expect(css).toContain("overflow-x: clip");
    expect(css).toContain("width: 4.75rem");
    expect(css).toContain(".staffSidebarToggle");
    expect(css).toContain("width: 100%");
    expect(css).toContain(".ptlChooserFlyout");
    expect(css).toContain("position: fixed");
    expect(css).toContain(
      '.staffAppSidebar[data-collapsed="true"] .staffSidebarTools'
    );
    expect(css).not.toContain("[data-tooltip]:hover::after");
    expect(css).not.toContain(".ptlChooser {\n    position: absolute");
  });

  it("opens collapsed Appearance in a portaled menu and stores the theme", async () => {
    localStorage.setItem("river-aftercare-staff-sidebar", "collapsed");
    await act(async () => {
      root.render(
        <OperatorAccountChrome userLabel="River Operator">
          <p>Operator content</p>
        </OperatorAccountChrome>
      );
    });

    const aside = container.querySelector(
      "aside.staffAppSidebar"
    ) as HTMLElement;
    expect(aside.getAttribute("data-collapsed")).toBe("true");
    const appearance = aside.querySelector(
      'button[data-tooltip="Appearance"]'
    ) as HTMLButtonElement;
    expect(appearance).not.toBeNull();
    expect(appearance.getAttribute("aria-label")).toContain("Appearance");
    appearance.getBoundingClientRect = () =>
      ({
        top: 240,
        right: 76,
        bottom: 284,
        left: 12,
        width: 64,
        height: 44,
        x: 12,
        y: 240,
        toJSON() {
          return {};
        },
      }) as DOMRect;

    await act(async () => {
      appearance.click();
    });

    const menu = document.body.querySelector(
      '[role="radiogroup"]'
    ) as HTMLElement;
    expect(menu).not.toBeNull();
    expect(menu.className).toContain("ptlChooserFlyout");
    expect(aside.contains(menu)).toBe(false);
    expect(menu.parentElement).toBe(document.body);
    expect(menu.style.left).toBe("84px");
    expect(menu.getAttribute("aria-label")).toBe("Colour theme");

    const dark = [...menu.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Dark")
    ) as HTMLButtonElement;
    await act(async () => {
      dark.click();
    });
    expect(localStorage.getItem("aftercare-guide-portal-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme-mode")).toBe(
      "dark"
    );
    expect(document.body.querySelector('[role="radiogroup"]')).toBeNull();

    await act(async () => {
      appearance.click();
    });
    const reopened = document.body.querySelector(
      '[role="radiogroup"]'
    ) as HTMLElement;
    const system = [...reopened.querySelectorAll('[role="radio"]')].find(
      (button) => button.textContent?.includes("System")
    ) as HTMLButtonElement;
    await act(async () => {
      system.click();
    });
    expect(localStorage.getItem("aftercare-guide-portal-theme")).toBe("system");
    expect(document.documentElement.getAttribute("data-theme-mode")).toBe(
      "system"
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
