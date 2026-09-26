import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { MarketingShell } from "@/app/(marketing)/components/marketing-shell";
import {
  MARKETING_NAV_SCROLL_THRESHOLD_PX,
  MARKETING_NAV_TOP_REVEAL_PX,
  nextMarketingNavVisibility,
} from "@/lib/marketing/nav-scroll";

describe("nextMarketingNavVisibility", () => {
  it("stays visible at the top of the page", () => {
    expect(
      nextMarketingNavVisibility({
        hidden: true,
        scrollY: 0,
        anchorY: 400,
        menuOpen: false,
      })
    ).toEqual({ hidden: false, anchorY: 0 });
    expect(
      nextMarketingNavVisibility({
        hidden: false,
        scrollY: MARKETING_NAV_TOP_REVEAL_PX,
        anchorY: 0,
        menuOpen: false,
      }).hidden
    ).toBe(false);
  });

  it("ignores movement inside the dead zone", () => {
    const start = nextMarketingNavVisibility({
      hidden: false,
      scrollY: 200,
      anchorY: 200,
      menuOpen: false,
    });
    const nudge = nextMarketingNavVisibility({
      hidden: start.hidden,
      scrollY: 200 + MARKETING_NAV_SCROLL_THRESHOLD_PX,
      anchorY: start.anchorY,
      menuOpen: false,
    });
    expect(nudge).toEqual({ hidden: false, anchorY: 200 });
  });

  it("hides after a meaningful downward scroll and returns on the way up", () => {
    const hidden = nextMarketingNavVisibility({
      hidden: false,
      scrollY: 200 + MARKETING_NAV_SCROLL_THRESHOLD_PX + 1,
      anchorY: 200,
      menuOpen: false,
    });
    expect(hidden.hidden).toBe(true);

    const stillHidden = nextMarketingNavVisibility({
      hidden: true,
      scrollY: hidden.anchorY - MARKETING_NAV_SCROLL_THRESHOLD_PX,
      anchorY: hidden.anchorY,
      menuOpen: false,
    });
    expect(stillHidden.hidden).toBe(true);

    const shown = nextMarketingNavVisibility({
      hidden: true,
      scrollY: hidden.anchorY - MARKETING_NAV_SCROLL_THRESHOLD_PX - 1,
      anchorY: hidden.anchorY,
      menuOpen: false,
    });
    expect(shown.hidden).toBe(false);
  });

  it("accumulates small scrolls until they become meaningful", () => {
    const first = nextMarketingNavVisibility({
      hidden: false,
      scrollY: 300 + 10,
      anchorY: 300,
      menuOpen: false,
    });
    expect(first.hidden).toBe(false);
    expect(first.anchorY).toBe(300);
    const second = nextMarketingNavVisibility({
      hidden: first.hidden,
      scrollY: 300 + MARKETING_NAV_SCROLL_THRESHOLD_PX + 1,
      anchorY: first.anchorY,
      menuOpen: false,
    });
    expect(second.hidden).toBe(true);
  });

  it("stays visible while a menu is open", () => {
    expect(
      nextMarketingNavVisibility({
        hidden: true,
        scrollY: 800,
        anchorY: 400,
        menuOpen: true,
      })
    ).toEqual({ hidden: false, anchorY: 800 });
  });

  it("treats a negative scroll offset as the top of the page", () => {
    expect(
      nextMarketingNavVisibility({
        hidden: true,
        scrollY: -40,
        anchorY: 120,
        menuOpen: false,
      })
    ).toEqual({ hidden: false, anchorY: 0 });
  });
});

describe("marketing site header", () => {
  it("renders the public header visible, without hiding staff navigation", () => {
    const html = renderToStaticMarkup(
      <MarketingShell
        currentPath="/"
        staffHref="http://app.localhost:3000/login"
      >
        <p>page body</p>
      </MarketingShell>
    );
    const header = readFileSync(
      "app/(marketing)/components/marketing-site-header.tsx",
      "utf8"
    );
    expect(html).toContain('data-nav-hidden="false"');
    expect(html).toContain("Site menu");
    expect(html).toContain("For clinics");
    expect(html).toContain("page body");
    expect(html).not.toContain("opacity:0");
    expect(html).not.toContain("opacity: 0");
    expect(header).toContain("useReducedMotion");
    expect(header).toContain("isMarketingMotionEnabled");
    expect(header).toContain('y: hidden ? "-100%" : "0%"');
    expect(header).toContain("duration: 0");
    expect(header).toContain("onOpenChange={onMobileOpenChange}");
    expect(header).toContain("onOpenChange={onClinicsOpenChange}");
  });
});
