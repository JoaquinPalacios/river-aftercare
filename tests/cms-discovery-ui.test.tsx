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

const targetBox = { left: 24 };

function rect(width = 160, height = 44, left = 24): DOMRect {
  return {
    x: left,
    y: 80,
    top: 80,
    left,
    right: left + width,
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
    targetBox.left = 24;
    originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      const className = this.getAttribute("class") ?? "";
      if (this.getAttribute("data-cms-discovery") === "guide-summary") {
        return rect(160, 44, targetBox.left);
      }
      if (
        this.hasAttribute("data-cms-discovery") ||
        className.includes("cmsTourCard") ||
        className.includes("cmsTourSpot")
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
    expect(nav.pushed).toEqual(["/guides"]);
    expect(document.querySelector("[data-cms-tour-spot]")).toBeNull();

    const library = document.createElement("section");
    library.setAttribute("data-cms-discovery", "guides-library");
    library.textContent = "Guide library";
    document.body.append(library);
    await renderDiscovery(context(), "/guides");

    expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe("guides");
    expect(tourStep()?.getAttribute("data-cms-tour-placement")).toBe("target");
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
    expect(
      sessionStorage.getItem("river-aftercare:cms-discovery-active:user_ada")
    ).toContain('"stepIndex":1');
    expect(tourStep()?.getAttribute("data-cms-tour-motion")).toBe("travel");
    expect(document.querySelector("[data-cms-tour-spot]")).toBeNull();

    await act(async () => {
      root.unmount();
    });
    const library = document.createElement("section");
    library.setAttribute("data-cms-discovery", "guides-library");
    library.textContent = "Guide library";
    document.body.append(library);
    root = createRoot(container);
    await renderDiscovery(context(), "/guides");

    expect(welcome()).toBeNull();
    expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe("guides");
    expect(tourStep()?.textContent).toContain("2 of 2");
    expect(tourStep()?.getAttribute("data-cms-tour-motion")).toBe("shown");
    expect(tourStep()?.getAttribute("data-cms-tour-placement")).toBe("target");
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

    expect(nav.pushed).toEqual(["/guides"]);
    expect(tourStep()?.getAttribute("data-cms-tour-motion")).toBe("travel");
    expect(tourStep()?.textContent).toContain("Opening Guides");
    expect(tourStep()?.textContent).not.toContain(
      "This is your clinic snapshot."
    );
    expect(document.querySelector("[data-cms-tour-spot]")).toBeNull();
    expect(document.querySelector("[data-cms-tour-layer]")).not.toBeNull();

    const library = document.createElement("section");
    library.setAttribute("data-cms-discovery", "guides-library");
    library.textContent = "Guide library";
    document.body.append(library);
    await renderDiscovery(context(), "/guides");

    expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe("guides");
    expect(tourStep()?.getAttribute("data-cms-tour-motion")).toBe("shown");
    expect(tourStep()?.style.opacity).not.toBe("0");
    expect(
      document
        .querySelector("[data-cms-tour-spot]")
        ?.getAttribute("data-cms-tour-motion")
    ).toBe("shown");
    expect(tourStep()?.getAttribute("data-cms-tour-placement")).toBe("target");
  });

  it("follows a target that moves after the spotlight is shown", async () => {
    await renderDiscovery();
    await act(async () => {
      welcome()?.querySelector("button")?.click();
    });

    const before = tourStep()?.style.left;
    expect(before).toBeTruthy();
    targetBox.left = 420;

    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    });

    expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe("overview");
    expect(tourStep()?.style.left).not.toBe(before);
    expect(tourStep()?.style.opacity).not.toBe("0");
    expect(document.querySelector("[data-cms-tour-spot]")).not.toBeNull();
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
    expect(tourStep()?.style.opacity).not.toBe("0");
    expect(tourStep()?.textContent).toContain("The next control is already");
    expect(nav.pushed).toEqual([]);
  });

  it("explains a route change without waiting for the spotlight to fade", async () => {
    await renderDiscovery();
    await act(async () => {
      welcome()?.querySelector("button")?.click();
    });

    const original = window.getComputedStyle.bind(window);
    window.getComputedStyle = ((element: Element, pseudo?: string | null) => {
      const style = original(element, pseudo);
      return new Proxy(style, {
        get(target, prop, receiver) {
          if (prop === "transitionDuration") {
            return "300ms";
          }
          if (prop === "animationDuration") {
            return "0s";
          }
          const value = Reflect.get(target, prop, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    }) as typeof window.getComputedStyle;

    try {
      await act(async () => {
        [...(tourStep()?.querySelectorAll("button") ?? [])]
          .find((button) => button.textContent === "Next")
          ?.click();
      });

      expect(nav.pushed).toEqual(["/guides"]);
      expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe("guides");
      expect(tourStep()?.getAttribute("data-cms-tour-motion")).toBe("travel");
      expect(tourStep()?.getAttribute("aria-busy")).toBe("true");
      expect(tourStep()?.textContent).toContain("Opening Guides");
      expect(tourStep()?.textContent).toContain(
        "The highlight returns when that page is ready."
      );
      expect(tourStep()?.textContent).not.toContain(
        "This is your clinic snapshot."
      );
      expect(document.querySelector("[data-cms-tour-spot]")).toBeNull();
      expect(
        [...(tourStep()?.querySelectorAll("button") ?? [])].find(
          (button) => button.textContent === "Next"
        )?.disabled
      ).toBe(true);

      await act(async () => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
        );
      });
      expect(nav.pushed).toEqual(["/guides"]);
      expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe("guides");
      expect(tourStep()?.getAttribute("data-cms-tour-motion")).toBe("travel");
    } finally {
      window.getComputedStyle = original;
    }
  });

  it("keeps an explanation on Sites & Locations while Help & feedback opens", async () => {
    const routeTour: CmsDiscoveryExperience = {
      id: "cms-introduction",
      version: 1,
      kind: "tour",
      offer: "welcome",
      title: "Workspace tour",
      body: "A short tour of this workspace.",
      audience: { roles: ["ADMIN"], requires: ["productNav"] },
      steps: [
        {
          id: "patient-site",
          title: "Patient site",
          body: "View patient site opens the published clinic site in a new tab.",
          target: "nav-patient-site",
        },
        {
          id: "help",
          title: "Help & feedback",
          body: "Send a problem, a question, or a feature suggestion.",
          target: "help-replay",
          fallbackTarget: "nav-help",
          path: "/account/help",
          pathMatch: "exact",
        },
      ],
    };
    sessionStorage.setItem(
      "river-aftercare:cms-discovery-active:user_ada",
      JSON.stringify({ id: "cms-introduction", stepIndex: 0 })
    );
    const patientSite = document.createElement("a");
    patientSite.setAttribute("data-cms-discovery", "nav-patient-site");
    patientSite.textContent = "View patient site";
    document.body.append(patientSite);

    await renderDiscovery(context(), "/practice/sites", [routeTour]);
    expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe("patient-site");
    expect(tourStep()?.getAttribute("data-cms-tour-motion")).toBe("shown");

    const original = window.getComputedStyle.bind(window);
    window.getComputedStyle = ((element: Element, pseudo?: string | null) => {
      const style = original(element, pseudo);
      return new Proxy(style, {
        get(target, prop, receiver) {
          if (prop === "transitionDuration") {
            return "300ms";
          }
          if (prop === "animationDuration") {
            return "0s";
          }
          const value = Reflect.get(target, prop, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    }) as typeof window.getComputedStyle;

    try {
      await act(async () => {
        [...(tourStep()?.querySelectorAll("button") ?? [])]
          .find((button) => button.textContent === "Next")
          ?.click();
      });

      expect(nav.pathname).toBe("/practice/sites");
      expect(nav.pushed).toEqual(["/account/help"]);
      expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe("help");
      expect(tourStep()?.getAttribute("data-cms-tour-motion")).toBe("travel");
      expect(tourStep()?.textContent).toContain("Opening Help & feedback");
      expect(tourStep()?.textContent).not.toContain(
        "View patient site opens the published clinic site"
      );
      expect(document.querySelector("[data-cms-tour-spot]")).toBeNull();
      expect(
        [...(tourStep()?.querySelectorAll("button") ?? [])].find(
          (button) => button.textContent === "Next"
        )?.disabled
      ).toBe(true);

      window.getComputedStyle = original;
      await renderDiscovery(context(), "/account/help", [routeTour]);
      expect(nav.pathname).toBe("/account/help");
      expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe("help");
      expect(tourStep()?.getAttribute("data-cms-tour-motion")).toBe("shown");
      expect(tourStep()?.getAttribute("data-cms-tour-placement")).toBe(
        "target"
      );
      expect(tourStep()?.textContent).toContain(
        "Send a problem, a question, or a feature suggestion."
      );
      expect(document.querySelector("[data-cms-tour-spot]")).not.toBeNull();

      await act(async () => {
        [...(tourStep()?.querySelectorAll("button") ?? [])]
          .find((button) => button.textContent === "Back")
          ?.click();
      });
      expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe(
        "patient-site"
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 450));
      });
      expect(tourStep()?.getAttribute("data-cms-tour-motion")).toBe("shown");

      await renderDiscovery(context(), "/practice/sites", [routeTour]);
      await act(async () => {
        [...(tourStep()?.querySelectorAll("button") ?? [])]
          .find((button) => button.textContent === "Next")
          ?.click();
      });
      expect(nav.pathname).toBe("/practice/sites");
      expect(nav.pushed).toEqual(["/account/help", "/account/help"]);
      expect(tourStep()?.getAttribute("data-cms-tour-motion")).toBe("travel");
      expect(tourStep()?.textContent).toContain("Opening Help & feedback");
    } finally {
      window.getComputedStyle = original;
    }
  });

  it("does not highlight the nav fallback while the next page target is missing", async () => {
    await renderDiscovery();
    await act(async () => {
      welcome()?.querySelector("button")?.click();
    });
    await act(async () => {
      [...(tourStep()?.querySelectorAll("button") ?? [])]
        .find((button) => button.textContent === "Next")
        ?.click();
    });

    expect(nav.pushed).toEqual(["/guides"]);
    expect(tourStep()?.getAttribute("data-cms-tour-motion")).toBe("travel");
    expect(document.querySelector("[data-cms-tour-spot]")).toBeNull();

    await renderDiscovery(context(), "/guides");
    expect(tourStep()?.getAttribute("data-cms-tour-motion")).toBe("travel");
    expect(tourStep()?.getAttribute("data-cms-tour-placement")).toBe("pending");
    expect(document.querySelector("[data-cms-tour-spot]")).toBeNull();

    const library = document.createElement("section");
    library.setAttribute("data-cms-discovery", "guides-library");
    library.textContent = "Guide library";
    await act(async () => {
      document.body.append(library);
    });

    expect(tourStep()?.getAttribute("data-cms-tour-step")).toBe("guides");
    expect(tourStep()?.getAttribute("data-cms-tour-placement")).toBe("target");
    expect(tourStep()?.getAttribute("data-cms-tour-motion")).toBe("shown");
  });

  it("keeps the spotlight when the target box collapses", async () => {
    await renderDiscovery();
    await act(async () => {
      welcome()?.querySelector("button")?.click();
    });
    const summary = container.querySelector(
      "[data-cms-discovery='guide-summary']"
    ) as HTMLElement;
    const spot = document.querySelector("[data-cms-tour-spot]") as HTMLElement;
    const top = spot.style.top;
    const left = spot.style.left;
    expect(top).not.toBe("");
    expect(top).not.toBe("0px");

    summary.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        toJSON() {
          return {};
        },
      }) as DOMRect;

    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
      await new Promise((resolve) => {
        requestAnimationFrame(() => resolve(undefined));
      });
    });

    const settled = document.querySelector(
      "[data-cms-tour-spot]"
    ) as HTMLElement;
    expect(settled).not.toBeNull();
    expect(settled.style.top).toBe(top);
    expect(settled.style.left).toBe(left);
  });

  it("ignores a second step request while a route change is leaving", async () => {
    const routeTour: CmsDiscoveryExperience = {
      id: "cms-introduction",
      version: 1,
      kind: "tour",
      offer: "welcome",
      title: "Welcome",
      body: "Look around.",
      audience: { roles: ["ADMIN"], requires: ["productNav"] },
      steps: [
        {
          id: "overview",
          title: "Overview",
          body: "Snapshot.",
          target: "guide-summary",
          path: "/dashboard",
        },
        {
          id: "guides",
          title: "Guides",
          body: "Library.",
          target: "guides-library",
          fallbackTarget: "nav-guides",
          path: "/guides",
        },
        {
          id: "practice",
          title: "Practice",
          body: "Settings.",
          target: "practice-settings",
          path: "/practice",
        },
      ],
    };
    await renderDiscovery(context(), "/dashboard", [routeTour]);
    await act(async () => {
      welcome()?.querySelector("button")?.click();
    });

    const next = () =>
      [...(tourStep()?.querySelectorAll("button") ?? [])].find(
        (button) => button.textContent === "Next"
      );

    await act(async () => {
      next()?.click();
      next()?.click();
    });

    expect(nav.pushed).toEqual(["/guides"]);
    expect(tourStep()?.getAttribute("data-cms-tour-motion")).toBe("travel");
    expect(document.querySelector("[data-cms-tour-spot]")).toBeNull();

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(tourStep()).toBeNull();
    expect(document.querySelector("[data-cms-tour-layer]")).toBeNull();
    expect(
      sessionStorage.getItem("river-aftercare:cms-discovery-active:user_ada")
    ).toBeNull();
    expect(nav.pushed).toEqual(["/guides"]);
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

  it("shows the mobile menu card when screen metrics include browser chrome", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width: 767px"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const previousInnerWidth = window.innerWidth;
    const previousInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 740,
    });
    Object.defineProperty(window, "screenX", { configurable: true, value: 40 });
    Object.defineProperty(window, "screenY", { configurable: true, value: 40 });
    Object.defineProperty(window, "outerWidth", {
      configurable: true,
      value: 508,
    });
    Object.defineProperty(window, "outerHeight", {
      configurable: true,
      value: 825,
    });
    Object.defineProperty(window.screen, "availWidth", {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(window.screen, "availHeight", {
      configurable: true,
      value: 740,
    });
    HTMLElement.prototype.getBoundingClientRect = function () {
      const className = this.getAttribute("class") ?? "";
      if (className.includes("cmsTourCard")) {
        return rect(343, 317, 16);
      }
      if (this.hasAttribute("data-cms-discovery")) {
        return {
          ...rect(320, 48, 16),
          y: 180,
          top: 180,
          bottom: 228,
        } as DOMRect;
      }
      return originalRect.call(this);
    };
    const menu = document.createElement("div");
    menu.setAttribute("data-cms-discovery-menu", "true");
    menu.setAttribute("inert", "");
    const link = document.createElement("span");
    link.setAttribute("data-cms-discovery", "nav-patient-site");
    link.textContent = "View patient site";
    menu.append(link);
    Object.assign(menu, {
      showPopover: () => {
        menu.removeAttribute("inert");
      },
      hidePopover: vi.fn(),
    });
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
      await new Promise((resolve) => {
        requestAnimationFrame(() => resolve(undefined));
      });
    });

    expect(tourStep()?.getAttribute("data-cms-tour-ready")).toBe("true");
    expect(tourStep()?.getAttribute("style") ?? "").not.toContain("width:");
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: previousInnerWidth,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: previousInnerHeight,
    });
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
