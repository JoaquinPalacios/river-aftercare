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
