/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
  pathname: "/dashboard",
  pushed: [] as string[],
}));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({
    push: (href: string) => {
      nav.pushed.push(href);
    },
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

import { CmsDiscoveryRoot } from "@/app/(staff)/components/cms-discovery/cms-discovery-root";
import { CmsOverviewTourEntry } from "@/app/(staff)/components/cms-discovery/overview-tour-entry";
import { CmsTourReplay } from "@/app/(staff)/components/cms-discovery/replay-tour";
import {
  findVisibleDiscoveryTarget,
  revealDiscoveryMenu,
} from "@/lib/cms-discovery/dom";
import { requestCmsDiscoveryNavigation } from "@/lib/cms-discovery/navigation";
import type {
  CmsDiscoveryContext,
  CmsDiscoveryExperience,
} from "@/lib/cms-discovery/types";

const experiences: CmsDiscoveryExperience[] = [
  {
    id: "cms-introduction",
    version: 1,
    kind: "tour",
    offer: "welcome",
    title: "Welcome to River Aftercare",
    body: "A short tour shows how this workspace is organised.",
    audience: { roles: ["ADMIN", "STAFF"], requires: ["productNav"] },
    steps: [
      {
        id: "overview",
        title: "Overview",
        body: "This is your clinic snapshot.",
        target: "guide-summary",
        fallbackTarget: "nav-overview",
      },
      {
        id: "guides",
        title: "Guides",
        body: "Guides are the aftercare pages patients open.",
        target: "guides-library",
        fallbackTarget: "nav-guides",
        path: "/guides",
      },
    ],
  },
  {
    id: "share-menu",
    version: 1,
    kind: "announcement",
    title: "Share a guide",
    body: "Copy the patient link from the guide list.",
    audience: { roles: ["ADMIN"], requires: ["productNav"] },
    showMeTourId: "share-menu-tour",
  },
  {
    id: "share-menu-tour",
    version: 1,
    kind: "tour",
    offer: "manual",
    title: "Share a guide",
    body: "The share menu is on the guide row.",
    audience: { roles: ["ADMIN"], requires: ["productNav"] },
    steps: [
      {
        id: "share",
        title: "Share",
        body: "Open the share menu on a guide.",
        target: "missing-share",
      },
    ],
  },
];

function context(
  overrides: Partial<CmsDiscoveryContext> = {}
): CmsDiscoveryContext {
  return {
    userId: "user_ada",
    clinicId: "clinic_ada",
    role: "ADMIN",
    assisting: false,
    requirements: {
      productNav: true,
      canManagePractice: true,
      hasPatientSite: true,
      assistedOnboarding: false,
    },
    ...overrides,
  };
}

function rect(width = 160, height = 44): DOMRect {
  return {
    x: 24,
    y: 80,
    top: 80,
    left: 24,
    right: 24 + width,
    bottom: 80 + height,
    width,
    height,
    toJSON() {
      return {};
    },
  } as DOMRect;
}

describe("CMS discovery UI", () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalRect: typeof HTMLElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    nav.pathname = "/dashboard";
    nav.pushed = [];
    localStorage.clear();
    sessionStorage.clear();
    originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (
        this.hasAttribute("data-cms-discovery") ||
        this.classList.contains("cmsTourCard") ||
        this.classList.contains("cmsTourSpot")
      ) {
        return rect();
      }
      return originalRect.call(this);
    };
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.replaceChildren();
    HTMLElement.prototype.getBoundingClientRect = originalRect;
  });

  async function renderDiscovery(
    value = context(),
    pathname = "/dashboard",
    items: readonly CmsDiscoveryExperience[] = experiences
  ) {
    nav.pathname = pathname;
    await act(async () => {
      root.render(
        <CmsDiscoveryRoot context={value} experiences={items}>
          <CmsOverviewTourEntry />
          <section data-cms-discovery="guide-summary">Guide summary</section>
          <span data-cms-discovery="nav-overview">Overview</span>
          <span data-cms-discovery="nav-guides">Guides</span>
          <CmsTourReplay />
        </CmsDiscoveryRoot>
      );
    });
  }

  function welcome(): HTMLElement | null {
    return container.querySelector("[data-cms-discovery-card='welcome']");
  }

  function tourStep(): HTMLElement | null {
    return document.querySelector("[data-cms-tour-step]");
  }

  it("offers the welcome card, then highlights the current page", async () => {
    await renderDiscovery();

    expect(welcome()?.textContent).toContain("Welcome to River Aftercare");
    expect(welcome()?.textContent).toContain("Start tour");
    expect(welcome()?.textContent).toContain("Skip introduction");

    await act(async () => {
      welcome()?.querySelector("button")?.click();
    });

    const step = tourStep();
    expect(step?.getAttribute("data-cms-tour-step")).toBe("overview");
    expect(step?.getAttribute("data-cms-tour-placement")).toBe("target");
    expect(step?.textContent).toContain("1 of 2");
    expect(step?.textContent).toContain("This is your clinic snapshot.");
    expect(document.querySelector("[data-cms-tour-spot]")).not.toBeNull();
    expect(step?.getAttribute("role")).toBe("dialog");
    expect(step?.getAttribute("aria-modal")).toBe("true");
    const back = [...(step?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Back"
    );
    expect(back?.disabled).toBe(true);
  });

  it("moves forward and back, then completes", async () => {
    await renderDiscovery();
    await act(async () => {
      welcome()?.querySelector("button")?.click();
    });

    const next = () =>
      [...(tourStep()?.querySelectorAll("button") ?? [])].find(
        (button) =>
          button.textContent === "Next" || button.textContent === "Done"
      );

    await act(async () => {
      next()?.click();
    });
    expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe("guides");
    expect(nav.pushed).toEqual(["/guides"]);
    expect(tourStep()?.textContent).toContain("2 of 2");

    await act(async () => {
      [...(tourStep()?.querySelectorAll("button") ?? [])]
        .find((button) => button.textContent === "Back")
        ?.click();
    });
    expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe("overview");

    await act(async () => {
      next()?.click();
    });
    await act(async () => {
      next()?.click();
    });

    expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe("complete");
    expect(tourStep()?.textContent).toContain("You're set");
    expect(
      localStorage.getItem("river-aftercare:cms-discovery:user_ada")
    ).toContain('"status":"completed"');

    await act(async () => {
      tourStep()?.querySelector("button")?.click();
    });
    expect(tourStep()).toBeNull();
    expect(welcome()).toBeNull();
  });

  it("resumes the open step when the shell remounts", async () => {
    await renderDiscovery();
    await act(async () => {
      welcome()?.querySelector("button")?.click();
    });
    await act(async () => {
      [...(tourStep()?.querySelectorAll("button") ?? [])]
        .find((button) => button.textContent === "Next")
        ?.click();
    });
    expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe("guides");

    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await renderDiscovery(context(), "/guides");

    expect(welcome()).toBeNull();
    expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe("guides");
    expect(tourStep()?.textContent).toContain("2 of 2");
    expect(tourStep()?.getAttribute("data-cms-tour-motion")).not.toBe("route");
  });

  it("keeps the spotlight off the previous page until the next route is ready", async () => {
    await renderDiscovery();
    await act(async () => {
      welcome()?.querySelector("button")?.click();
    });
    await act(async () => {
      [...(tourStep()?.querySelectorAll("button") ?? [])]
        .find((button) => button.textContent === "Next")
        ?.click();
    });

    expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe("guides");
    expect(tourStep()?.getAttribute("data-cms-tour-motion")).toBe("route");
    expect(tourStep()?.style.opacity).toBe("0");
    expect(
      document
        .querySelector("[data-cms-tour-spot]")
        ?.getAttribute("data-cms-tour-motion")
    ).toBe("route");
    expect(nav.pushed).toEqual(["/guides"]);

    const library = document.createElement("section");
    library.setAttribute("data-cms-discovery", "guides-library");
    library.textContent = "Guide library";
    document.body.append(library);
    await renderDiscovery(context(), "/guides");

    expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe("guides");
    expect(tourStep()?.getAttribute("data-cms-tour-motion")).toBe("reveal");
    expect(
      document
        .querySelector("[data-cms-tour-spot]")
        ?.getAttribute("data-cms-tour-motion")
    ).toBe("reveal");
  });

  it("glides the spotlight between two targets on the same page", async () => {
    await renderDiscovery(context(), "/dashboard", [
      {
        id: "cms-introduction",
        version: 1,
        kind: "tour",
        offer: "welcome",
        title: "Welcome to River Aftercare",
        body: "A short tour shows how this workspace is organised.",
        audience: { roles: ["ADMIN"], requires: ["productNav"] },
        steps: [
          {
            id: "overview",
            title: "Overview",
            body: "This is your clinic snapshot.",
            target: "guide-summary",
            path: "/dashboard",
            pathMatch: "exact",
          },
          {
            id: "nearby",
            title: "Nearby",
            body: "The next control is already on this page.",
            target: "nav-guides",
            path: "/dashboard",
            pathMatch: "exact",
          },
        ],
      },
    ]);
    await act(async () => {
      welcome()?.querySelector("button")?.click();
    });
    await act(async () => {
      [...(tourStep()?.querySelectorAll("button") ?? [])]
        .find((button) => button.textContent === "Next")
        ?.click();
    });

    expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe("nearby");
    expect(tourStep()?.getAttribute("data-cms-tour-motion")).toBe("move");
    expect(nav.pushed).toEqual([]);
  });

  it("dismisses the welcome card for this user and keeps another user's card", async () => {
    await renderDiscovery();
    await act(async () => {
      [...(welcome()?.querySelectorAll("button") ?? [])]
        .find((button) => button.textContent === "Skip introduction")
        ?.click();
    });

    expect(welcome()).toBeNull();
    expect(
      localStorage.getItem("river-aftercare:cms-discovery:user_ada")
    ).toContain('"status":"dismissed"');

    await renderDiscovery(context({ userId: "user_staff" }));
    expect(welcome()).not.toBeNull();
  });

  it("skips from the keyboard and can be replayed from Help", async () => {
    await renderDiscovery();
    await act(async () => {
      welcome()?.querySelector("button")?.click();
    });
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });

    expect(tourStep()).toBeNull();
    expect(
      localStorage.getItem("river-aftercare:cms-discovery:user_ada")
    ).toContain('"status":"skipped"');
    expect(welcome()).toBeNull();

    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Replay tour")
        ?.click();
    });
    expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe("overview");
  });

  it("shows the explanation when the target is missing", async () => {
    await renderDiscovery(context(), "/dashboard", [
      {
        id: "cms-introduction",
        version: 1,
        kind: "tour",
        offer: "welcome",
        title: "Welcome",
        body: "Look around.",
        audience: { roles: ["ADMIN"], requires: ["productNav"] },
        steps: [
          {
            id: "missing",
            title: "Somewhere else",
            body: "This control is not on the page.",
            target: "not-on-the-page",
          },
        ],
      },
    ]);
    await act(async () => {
      welcome()?.querySelector("button")?.click();
    });

    expect(tourStep()?.getAttribute("data-cms-tour-placement")).toBe(
      "fallback"
    );
    expect(tourStep()?.textContent).toContain(
      "This control is not on the page."
    );
    expect(document.querySelector("[data-cms-tour-spot]")).toBeNull();
  });

  it("does not cover the guide editor", async () => {
    await renderDiscovery(context(), "/guides/guide_1/edit");
    expect(welcome()).toBeNull();
  });

  it("keeps the overview prompt until the introduction is settled", async () => {
    await renderDiscovery(context(), "/guides");

    expect(welcome()).toBeNull();
    expect(
      localStorage.getItem("river-aftercare:cms-discovery:user_ada")
    ).toBeNull();
    expect(container.querySelector("[data-cms-overview-replay]")).toBeNull();

    await renderDiscovery();

    expect(welcome()?.textContent).toContain("Start tour");
    expect(
      localStorage.getItem("river-aftercare:cms-discovery:user_ada")
    ).toBeNull();
  });

  it("keeps a quiet overview replay after the introduction is settled", async () => {
    await renderDiscovery();
    await act(async () => {
      [...(welcome()?.querySelectorAll("button") ?? [])]
        .find((button) => button.textContent === "Skip introduction")
        ?.click();
    });

    expect(welcome()).toBeNull();
    const replay = container.querySelector<HTMLButtonElement>(
      "[data-cms-overview-replay]"
    );
    expect(replay?.textContent).toBe("Replay workspace tour");

    await act(async () => {
      replay?.click();
    });
    expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe("overview");
  });

  it("offers an assisting operator a separate welcome for each clinic", async () => {
    localStorage.setItem(
      "river-aftercare:cms-discovery:user_ada",
      JSON.stringify({
        schema: 1,
        experiences: {
          "cms-introduction": { version: 1, status: "dismissed" },
        },
      })
    );

    await renderDiscovery(context({ assisting: true, clinicId: "clinic_a" }));
    expect(welcome()?.textContent).toContain("Skip introduction");
    expect(container.textContent).toContain("Replay tour");

    await act(async () => {
      [...(welcome()?.querySelectorAll("button") ?? [])]
        .find((button) => button.textContent === "Skip introduction")
        ?.click();
    });

    expect(welcome()).toBeNull();
    expect(
      localStorage.getItem("river-aftercare:cms-discovery:user_ada:clinic_a")
    ).toContain('"status":"dismissed"');
    expect(
      localStorage.getItem("river-aftercare:cms-discovery:user_ada")
    ).toContain('"status":"dismissed"');

    await renderDiscovery(context({ assisting: true, clinicId: "clinic_b" }));
    expect(welcome()?.textContent).toContain("Start tour");
    expect(
      localStorage.getItem("river-aftercare:cms-discovery:user_ada:clinic_b")
    ).toBeNull();
  });

  it("shows one announcement after the welcome is settled", async () => {
    localStorage.setItem(
      "river-aftercare:cms-discovery:user_ada",
      JSON.stringify({
        schema: 1,
        experiences: {
          "cms-introduction": { version: 1, status: "completed" },
        },
      })
    );
    await renderDiscovery();

    const card = container.querySelector(
      "[data-cms-discovery-card='announcement']"
    );
    expect(welcome()).toBeNull();
    expect(card?.textContent).toContain("Share a guide");
    expect(card?.textContent).toContain("Show me");

    await act(async () => {
      [...(card?.querySelectorAll("button") ?? [])]
        .find((button) => button.textContent === "Dismiss")
        ?.click();
    });
    expect(
      container.querySelector("[data-cms-discovery-card='announcement']")
    ).toBeNull();
    expect(
      localStorage.getItem("river-aftercare:cms-discovery:user_ada")
    ).toContain('"share-menu"');
  });

  it("starts the linked tour from Show me", async () => {
    localStorage.setItem(
      "river-aftercare:cms-discovery:user_ada",
      JSON.stringify({
        schema: 1,
        experiences: {
          "cms-introduction": { version: 1, status: "dismissed" },
        },
      })
    );
    await renderDiscovery();
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Show me")
        ?.click();
    });

    expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe("share");
    expect(tourStep()?.getAttribute("data-cms-tour-placement")).toBe(
      "fallback"
    );
  });

  it("waits for the unsaved-changes confirmation instead of pushing a route", async () => {
    const marker = document.createElement("p");
    marker.setAttribute("data-save-state", "unsaved");
    document.body.appendChild(marker);
    const clicks: string[] = [];
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      clicks.push(this.getAttribute("href") ?? "");
    };

    try {
      expect(
        requestCmsDiscoveryNavigation("/guides", {
          push: (href) => nav.pushed.push(href),
        })
      ).toBe("guarded");
      expect(nav.pushed).toEqual([]);
      expect(clicks).toEqual(["/guides"]);
      expect(
        requestCmsDiscoveryNavigation("https://evil.test", {
          push: (href) => nav.pushed.push(href),
        })
      ).toBe("ignored");
    } finally {
      HTMLAnchorElement.prototype.click = original;
      marker.remove();
    }
  });

  it("ignores a hidden duplicate and uses the visible target", () => {
    const hidden = document.createElement("a");
    hidden.setAttribute("data-cms-discovery", "nav-guides");
    hidden.setAttribute("hidden", "");
    hidden.textContent = "Hidden guides";
    const visible = document.createElement("a");
    visible.setAttribute("data-cms-discovery", "nav-guides");
    visible.textContent = "Guides";
    document.body.append(hidden, visible);

    expect(findVisibleDiscoveryTarget("nav-guides")).toBe(visible);
    expect(findVisibleDiscoveryTarget("not a selector")).toBeNull();
  });

  it("leaves the mobile menu closed when the page target is visible", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width: 767px"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const menu = document.createElement("div");
    menu.setAttribute("data-cms-discovery-menu", "true");
    menu.setAttribute("inert", "");
    const hiddenNav = document.createElement("span");
    hiddenNav.setAttribute("data-cms-discovery", "nav-overview");
    hiddenNav.textContent = "Overview";
    menu.append(hiddenNav);
    const showPopover = vi.fn(() => {
      menu.removeAttribute("inert");
    });
    Object.assign(menu, { showPopover, hidePopover: vi.fn() });
    document.body.append(menu);

    await renderDiscovery();
    await act(async () => {
      welcome()?.querySelector("button")?.click();
    });

    expect(showPopover).not.toHaveBeenCalled();
    expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe("overview");
    expect(menu.contains(tourStep())).toBe(false);
  });

  it("draws a menu-only step inside the open mobile menu", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width: 767px"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const menu = document.createElement("div");
    menu.setAttribute("data-cms-discovery-menu", "true");
    menu.setAttribute("inert", "");
    const link = document.createElement("span");
    link.setAttribute("data-cms-discovery", "nav-patient-site");
    link.textContent = "View patient site";
    menu.append(link);
    const showPopover = vi.fn(() => {
      menu.removeAttribute("inert");
    });
    Object.assign(menu, { showPopover, hidePopover: vi.fn() });
    document.body.append(menu);

    const menuTour: CmsDiscoveryExperience = {
      id: "cms-introduction",
      version: 1,
      kind: "tour",
      offer: "welcome",
      title: "Welcome to River Aftercare",
      body: "A short tour shows how this workspace is organised.",
      audience: { roles: ["ADMIN", "STAFF"], requires: ["productNav"] },
      steps: [
        {
          id: "patient-site",
          title: "Patient site",
          body: "View patient site opens the published clinic site.",
          target: "nav-patient-site",
        },
      ],
    };

    await act(async () => {
      root.render(
        <CmsDiscoveryRoot context={context()} experiences={[menuTour]}>
          <CmsOverviewTourEntry />
          <CmsTourReplay />
        </CmsDiscoveryRoot>
      );
    });
    await act(async () => {
      welcome()?.querySelector("button")?.click();
    });

    expect(showPopover).toHaveBeenCalled();
    expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe("patient-site");
    expect(tourStep()?.getAttribute("data-cms-tour-placement")).toBe("menu");
    expect(menu.contains(tourStep())).toBe(true);
    expect(link.classList.contains("cmsTourTarget")).toBe(true);
  });

  it("waits until the mobile menu finishes opening before drawing the card", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width: 767px"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const menu = document.createElement("div");
    menu.setAttribute("data-cms-discovery-menu", "true");
    menu.setAttribute("inert", "");
    const link = document.createElement("span");
    link.setAttribute("data-cms-discovery", "nav-patient-site");
    link.textContent = "View patient site";
    menu.append(link);
    const showPopover = vi.fn(() => {
      queueMicrotask(() => {
        menu.removeAttribute("inert");
      });
    });
    Object.assign(menu, { showPopover, hidePopover: vi.fn() });
    document.body.append(menu);

    const menuTour: CmsDiscoveryExperience = {
      id: "cms-introduction",
      version: 1,
      kind: "tour",
      offer: "welcome",
      title: "Welcome to River Aftercare",
      body: "A short tour shows how this workspace is organised.",
      audience: { roles: ["ADMIN", "STAFF"], requires: ["productNav"] },
      steps: [
        {
          id: "patient-site",
          title: "Patient site",
          body: "View patient site opens the published clinic site.",
          target: "nav-patient-site",
        },
      ],
    };

    await act(async () => {
      root.render(
        <CmsDiscoveryRoot context={context()} experiences={[menuTour]}>
          <CmsOverviewTourEntry />
          <CmsTourReplay />
        </CmsDiscoveryRoot>
      );
    });
    await act(async () => {
      welcome()?.querySelector("button")?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(showPopover).toHaveBeenCalled();
    expect(menu.contains(tourStep())).toBe(true);
    expect(link.classList.contains("cmsTourTarget")).toBe(true);
  });

  it("opens the closed mobile menu so a nav target can be highlighted", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width: 767px"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const menu = document.createElement("div");
    menu.setAttribute("data-cms-discovery-menu", "true");
    menu.setAttribute("inert", "");
    const showPopover = vi.fn(() => {
      menu.removeAttribute("inert");
    });
    Object.assign(menu, { showPopover });
    document.body.append(menu);

    revealDiscoveryMenu();

    expect(showPopover).toHaveBeenCalledOnce();
    expect(menu.dataset.cmsDiscoveryOpened).toBe("true");
  });
});
