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

  it("keeps the brand-led H1 and new clinic-fit supporting copy", async () => {
    const html = renderToStaticMarkup(await MarketingClinicsPage());

    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("Aftercare built around the way your clinic works.");
    expect(html).toContain(CLINICS_HUB_COPY.hero.body);
    expect(html).toContain(
      "patient aftercare software for treatment-based clinics"
    );
    expect(html).toContain("For clinics &amp; practices");
    expect(html).toContain("Request a demo");
    expect(html).toContain("Explore clinic types");
    expect(html).toContain('href="/contact"');
    expect(html).toContain('href="#clinic-types"');
    expect(html).toContain("Branded patient aftercare");
    expect(html).toContain("Link or QR · No patient app or login");
    expect(html).not.toContain("Branded patient guidance");
    expect(html).not.toContain("PMS");
    expect(html).not.toContain("template library");
    expect(html).not.toContain("live demo for every");
    expect(html).not.toContain("integration");
    expect(html).not.toContain("Services");
  });

  it("renders one platform copy, four vertical cards, shared foundation, and qualification", async () => {
    const html = renderToStaticMarkup(await MarketingClinicsPage());

    expect(html).toContain(
      "Different kinds of care. The same need for clear aftercare."
    );
    expect(html).toContain(CLINICS_HUB_COPY.platform.body);
    expect(html).toContain("clinicsHubPlatform");
    expect(html).toContain("clinicsHubPlatformIntro");
    expect(html).toContain("clinicsHubPlatformBody");
    expect(html).toContain("Dental practices");
    expect(html).toContain("Physiotherapy clinics");
    expect(html).toContain("Chiropractic practices");
    expect(html).toContain("Cosmetic &amp; aesthetic clinics");
    expect(html).toContain('href="/dental"');
    expect(html).toContain('href="/physiotherapy"');
    expect(html).toContain('href="/chiropractic"');
    expect(html).toContain('href="/cosmetic-clinics"');
    expect(html).toContain("Explore dental aftercare");
    expect(html).toContain("Explore physiotherapy aftercare");
    expect(html).toContain("Explore chiropractic aftercare");
    expect(html).toContain("Explore cosmetic &amp; aesthetic aftercare");
    expect(html).toContain("What stays consistent across every clinic");
    expect(html).toContain("Shared foundation");
    expect(html).toContain("headingBlock");
    expect(html).toContain("clinicsHubFoundation");
    expect(html).toContain("Clinic controlled");
    expect(html).toContain(
      "Your logo, colours, terminology and contact details remain part of the patient experience."
    );
    expect(html).not.toContain("favicon");
    expect(html).not.toContain("Dark logo");
    expect(html).toContain("Another treatment-based practice?");
    expect(html).toContain("A good fit when");
    expect(html).toContain("Guidance continues after the appointment");
    expect(html).toContain(
      "Your clinic wants to keep its own brand and terminology"
    );
    expect(html).toContain(
      "Patients need a simple way to revisit guidance without an account"
    );
    expect(html).toContain("Tell us about your clinic");
    expect(html).toContain("clinicsHubOtherFit");
    expect(html).not.toContain("Don&#x27;t see your clinic type?");
    expect(html).not.toContain("Talk to us");
    expect(html).toContain("heroActions");
    expect(html).toContain('data-mk-hero-actions=""');
    expect(html).toContain("View pricing");
    expect(html).toContain('href="/pricing"');
    expect(CLINICS_HUB_CARDS).toHaveLength(4);
    expect(CLINICS_HUB_CARDS.map((card) => card.path)).toEqual([
      "/dental",
      "/physiotherapy",
      "/chiropractic",
      "/cosmetic-clinics",
    ]);
  });

  it("uses the approved SEO title, description, canonical, robots, and OG copy", () => {
    const resolved = resolveMarketingSeo({
      path: "/clinics",
      origin: "https://riveraftercare.com.au",
    });
    const defaults = DEFAULT_MARKETING_PAGE_SEO["/clinics"];
    const home = DEFAULT_MARKETING_PAGE_SEO["/"];

    expect(
      MARKETING_SEO_PATHS.filter((path) => path === "/clinics")
    ).toHaveLength(1);
    expect(defaults.seoTitle).toBe(
      "Patient Aftercare for Treatment-Based Clinics | River Aftercare"
    );
    expect(defaults.metaDescription).toBe(
      "See how River Aftercare helps dental, physiotherapy, chiropractic and cosmetic clinics publish branded aftercare patients can revisit by link or QR code."
    );
    expect(defaults.seoTitle).not.toBe(home.seoTitle);
    expect(defaults.metaDescription).not.toBe(home.metaDescription);
    expect(resolved.title).toBe(defaults.seoTitle);
    expect(resolved.description).toBe(defaults.metaDescription);
    expect(resolved.canonicalUrl).toBe("https://riveraftercare.com.au/clinics");
    expect(resolved.robots).toEqual({ index: true, follow: true });
    expect(resolved.social.title).toBe(defaults.ogTitle);
    expect(resolved.social.description).toBe(defaults.ogDescription);
    expect(defaults.lastModified).toBe("2026-09-21");
  });

  it("uses shared editorial grid tokens for One Platform and Beyond These Four", () => {
    const styles = readFileSync("app/(marketing)/marketing.module.css", "utf8");

    expect(styles).toContain(".clinicsHubPlatform > [data-mk-section]");
    expect(styles).toContain(
      "grid-template-columns: minmax(0, 1.35fr) minmax(16rem, 1fr)"
    );
    expect(styles).toContain("column-gap: 2.75rem");
    expect(styles).toContain(".clinicsHubOther > [data-mk-section]");
    expect(styles).toContain('"intro fit"');
    expect(styles).toContain("var(--mk-heading-intro-gap)");
    expect(styles).toContain(".clinicsHubOtherFitList");
    expect(styles).not.toMatch(/\.clinicsHubOther\s*\{[^}]*max-width:\s*40rem/);
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
    expect(hub).toContain("MarketingRevealGroup");
    expect(hub).toContain("clinicsHubOtherFit");
    expect(hub).not.toContain("word-by-word");
  });
});
