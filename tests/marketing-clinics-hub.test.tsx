import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "localhost:3000",
      "x-forwarded-proto": "http",
    }),
}));

import MarketingClinicsPage from "@/app/(marketing)/%5Fmarketing/clinics/page";
import {
  CLINICS_HUB_CARDS,
  CLINICS_HUB_COPY,
} from "@/lib/marketing/clinics-hub";
import { DEFAULT_MARKETING_PAGE_SEO } from "@/lib/seo/defaults";
import { resolveMarketingSeo } from "@/lib/seo/resolve-marketing-seo";
import { MARKETING_SEO_PATHS } from "@/lib/seo/types";

describe("clinics overview hub", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  beforeEach(() => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
  });

  afterEach(() => {
    if (previousRoot === undefined) {
      delete process.env.CARE_GUIDE_ROOT_DOMAIN;
    } else {
      process.env.CARE_GUIDE_ROOT_DOMAIN = previousRoot;
    }
  });

  it("renders one H1, four vertical cards, shared foundation, and a demo CTA", async () => {
    const html = renderToStaticMarkup(await MarketingClinicsPage());

    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain(CLINICS_HUB_COPY.hero.h1);
    expect(html).toContain("For clinics &amp; practices");
    expect(html).toContain("Dental practices");
    expect(html).toContain("Physiotherapy clinics");
    expect(html).toContain("Chiropractic practices");
    expect(html).toContain("Cosmetic &amp; aesthetic clinics");
    expect(html).toContain('href="/dental"');
    expect(html).toContain('href="/physiotherapy"');
    expect(html).toContain('href="/chiropractic"');
    expect(html).toContain('href="/cosmetic-clinics"');
    expect(html).toContain("Explore dental aftercare");
    expect(html).toContain("What stays consistent across every clinic");
    expect(html).toContain("Shared foundation");
    expect(html).toContain("headingBlock");
    expect(html).toContain("clinicsHubPlatform");
    expect(html).toContain("clinicsHubFoundation");
    expect(html).toContain("Clinic controlled");
    expect(html).toContain("Don&#x27;t see your clinic type?");
    expect(html).toContain("Talk to us");
    expect(html).toContain("Request a demo");
    expect(html).toContain("heroActions");
    expect(html).toContain('data-mk-hero-actions=""');
    expect(html).toContain('href="/contact"');
    expect(html).toContain("View pricing");
    expect(html).toContain('href="/pricing"');
    expect(html).not.toContain("template library");
    expect(html).not.toContain("live demo for every");
    expect(html).not.toContain("integration");
    expect(html).not.toContain("Services");
    expect(CLINICS_HUB_CARDS).toHaveLength(4);
  });

  it("uses the approved SEO title, description, canonical, robots, and OG copy", () => {
    const resolved = resolveMarketingSeo({
      path: "/clinics",
      origin: "https://riveraftercare.com.au",
    });
    const defaults = DEFAULT_MARKETING_PAGE_SEO["/clinics"];

    expect(
      MARKETING_SEO_PATHS.filter((path) => path === "/clinics")
    ).toHaveLength(1);
    expect(resolved.title).toBe(defaults.seoTitle);
    expect(resolved.description).toBe(defaults.metaDescription);
    expect(resolved.canonicalUrl).toBe("https://riveraftercare.com.au/clinics");
    expect(resolved.robots).toEqual({ index: true, follow: true });
    expect(resolved.social.title).toBe(defaults.ogTitle);
    expect(resolved.social.description).toBe(defaults.ogDescription);
  });

  it("keeps For clinics as the directory label and Overview as the hub entry", () => {
    const shell = readFileSync(
      "app/(marketing)/components/marketing-shell.tsx",
      "utf8"
    );
    const nav = readFileSync(
      "app/(marketing)/components/marketing-clinics-nav.tsx",
      "utf8"
    );
    const hub = readFileSync(
      "app/(marketing)/components/marketing-clinics-hub.tsx",
      "utf8"
    );

    expect(nav).toContain("For clinics");
    expect(nav).toContain("clinicDirectoryNavItems");
    expect(shell).toContain("clinicDirectoryNavItems");
    expect(shell).not.toContain("Services");
    expect(hub).not.toContain("Services");
    expect(hub).toContain('currentPath="/clinics"');
    const discoveryAt = hub.indexOf('id="clinic-types"');
    expect(discoveryAt).toBeGreaterThan(-1);
    expect(hub.lastIndexOf("marketingShowcase", discoveryAt)).toBeGreaterThan(
      hub.lastIndexOf("marketingSoft", discoveryAt)
    );
    expect(
      hub.lastIndexOf('data-mk-chapter="showcase"', discoveryAt)
    ).toBeGreaterThan(-1);
  });
});
