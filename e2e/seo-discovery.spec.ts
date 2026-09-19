import { expect, test } from "@playwright/test";

import {
  expectNoSeriousAxeViolations,
  expectNoSeriousAxeViolationsLightAndDark,
  setPortalColorScheme,
} from "./helpers/axe";
import { marketingUrl, staffUrl } from "./helpers/origins";
import {
  signInAsLocalAdmin,
  signInAsLocalOperator,
  signInAsLocalStaff,
} from "./helpers/staff-auth";

const HEADER_VIEWPORTS = [
  { width: 1440, height: 900, label: "1440" },
  { width: 1280, height: 800, label: "1280" },
  { width: 1024, height: 768, label: "1024" },
  { width: 768, height: 1024, label: "768" },
  { width: 390, height: 844, label: "390" },
  { width: 360, height: 800, label: "360" },
] as const;

test.describe("Phase 2B SEO and discovery", () => {
  test("marketing header uses 1.625rem logo height and 1rem desktop nav", async ({
    page,
  }) => {
    for (const viewport of HEADER_VIEWPORTS) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto(marketingUrl("/"), { waitUntil: "load" });
      const metrics = await page.evaluate(() => {
        const rem = parseFloat(
          getComputedStyle(document.documentElement).fontSize
        );
        const header = document.querySelector("header");
        const images = [...(header?.querySelectorAll('a[href="/"] img') ?? [])];
        const logo =
          images.find((img) => getComputedStyle(img).display !== "none") ??
          images[0];
        const navLink = header?.querySelector('nav a[href="/pricing"]');
        const headerHeight = header ? header.getBoundingClientRect().height : 0;
        return {
          rem,
          logoHeight: logo ? parseFloat(getComputedStyle(logo).height) : 0,
          navFontSize: navLink
            ? parseFloat(getComputedStyle(navLink).fontSize)
            : 0,
          navVisible: navLink
            ? getComputedStyle(navLink).display !== "none"
            : false,
          headerHeight,
        };
      });
      expect(metrics.logoHeight).toBeCloseTo(1.625 * metrics.rem, 1);
      expect(metrics.headerHeight).toBeGreaterThan(metrics.logoHeight);
      if (viewport.width >= 768) {
        expect(metrics.navVisible).toBe(true);
        expect(metrics.navFontSize).toBeCloseTo(1 * metrics.rem, 1);
      }
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({
      path: "test-results/artifacts/phase-2b-marketing-header-desktop.png",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/artifacts/phase-2b-marketing-header-mobile.png",
    });
  });

  test("public marketing pages emit factual JSON-LD and about is indexable", async ({
    page,
  }) => {
    const home = await page.goto(marketingUrl("/"), {
      waitUntil: "domcontentloaded",
    });
    expect(home?.status()).toBe(200);
    await page.screenshot({
      path: "test-results/artifacts/phase-2b-homepage.png",
      fullPage: true,
    });
    const homeLd = await page
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent();
    expect(homeLd).toBeTruthy();
    const homeGraph = JSON.parse(homeLd!);
    const types = JSON.stringify(homeGraph);
    expect(types).toContain("WebSite");
    expect(types).toContain("Organization");
    expect(types).not.toContain('"Offer"');
    expect(types).not.toContain("aggregateRating");
    await expect(page.locator("h1")).toHaveCount(1);

    await page.goto(marketingUrl("/about"), { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { level: 1, name: /part of the care/i })
    ).toBeVisible();
    expect(
      await page.locator('meta[name="robots"]').getAttribute("content")
    ).not.toMatch(/noindex/i);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/about\/?$/
    );
    await page.screenshot({
      path: "test-results/artifacts/phase-2b-about.png",
      fullPage: true,
    });

    await page.goto(marketingUrl("/pricing"), {
      waitUntil: "domcontentloaded",
    });
    await page.screenshot({
      path: "test-results/artifacts/phase-2b-pricing.png",
      fullPage: true,
    });
    const pricingLd = await page
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent();
    expect(pricingLd).toBeTruthy();
    const pricingGraph = JSON.parse(pricingLd!);
    const application = pricingGraph["@graph"].find(
      (node: { "@type"?: string }) => node["@type"] === "SoftwareApplication"
    );
    const offers = application?.offers as Array<{
      name?: string;
      price?: string;
      priceCurrency?: string;
      priceSpecification?: { valueAddedTaxIncluded?: boolean };
    }>;
    expect(offers?.map((offer) => offer.name)).toEqual([
      "Essential monthly",
      "Essential yearly",
      "Practice monthly",
      "Practice yearly",
    ]);
    expect(offers?.map((offer) => offer.price)).toEqual([
      "79",
      "790",
      "149",
      "1490",
    ]);
    expect(offers?.every((offer) => offer.priceCurrency === "AUD")).toBe(true);
    expect(
      offers?.every(
        (offer) => offer.priceSpecification?.valueAddedTaxIncluded === true
      )
    ).toBe(true);
    expect(pricingLd).not.toContain("298");
    expect(offers?.some((offer) => String(offer.name).includes("Group"))).toBe(
      false
    );

    await page.goto(marketingUrl("/contact"), {
      waitUntil: "domcontentloaded",
    });
    await page.screenshot({
      path: "test-results/artifacts/phase-2b-contact.png",
      fullPage: true,
    });

    const llms = await page.goto(marketingUrl("/llms.txt"), {
      waitUntil: "domcontentloaded",
    });
    expect(llms?.status()).toBe(200);
    expect(llms?.headers()["content-type"] ?? "").toMatch(/text\/plain/);
    const llmsBody = (await llms?.text()) ?? "";
    expect(llmsBody).toContain("# River Aftercare");
    expect(llmsBody).toContain("/pricing");
    expect(llmsBody).toContain("/about");
    expect(llmsBody).toContain("/privacy");
    expect(llmsBody).toContain("/terms");
    expect(llmsBody).toContain("/clinics");
    expect(llmsBody).toContain("/dental");
    expect(llmsBody).toContain("/physiotherapy");
    expect(llmsBody).not.toContain("/operator");
    expect(llmsBody).not.toContain("/login");

    const sitemap = await page.goto(marketingUrl("/sitemap.xml"), {
      waitUntil: "domcontentloaded",
    });
    const sitemapBody = (await sitemap?.text()) ?? "";
    expect(sitemapBody).toContain("/about");
    expect(sitemapBody).toContain("/privacy");
    expect(sitemapBody).toContain("/terms");
    expect(sitemapBody).toContain("/clinics");
    expect(sitemapBody).toContain("/dental");
    expect(sitemapBody).toContain("/physiotherapy");
    expect(sitemapBody).toContain("/chiropractic");
    expect(sitemapBody).toContain("/cosmetic-clinics");
    expect(sitemapBody).not.toContain("demodental");
    expect(sitemapBody).not.toContain("/operator");
  });

  test("about remains accessible in light and dark", async ({ page }) => {
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({
        colorScheme,
        reducedMotion: "reduce",
      });
      await page.goto(marketingUrl("/about"), { waitUntil: "load" });
      await page.evaluate((mode) => {
        try {
          window.localStorage.setItem("aftercare-guide-marketing-theme", mode);
        } catch {
          // Ignore storage failures in restricted contexts.
        }
        document.documentElement.setAttribute("data-theme-mode", mode);
        document.documentElement.setAttribute("data-mk-motion", "reduce");
      }, colorScheme);
      await expect(page.locator("h1")).toHaveCount(1);
      await expectNoSeriousAxeViolations(page, {
        exclude: ["[data-mk-pending]", "[data-mk-pending] *"],
      });
    }
  });

  test("clinic staff cannot open SEO & Discovery", async ({ page }) => {
    await signInAsLocalStaff(page);
    const response = await page.goto(staffUrl("/operator/seo"), {
      waitUntil: "load",
    });
    expect(response?.status()).toBe(404);
  });

  test("clinic admin cannot open SEO & Discovery", async ({ page }) => {
    await signInAsLocalAdmin(page);
    const response = await page.goto(staffUrl("/operator/seo"), {
      waitUntil: "load",
    });
    expect(response?.status()).toBe(404);
  });

  test("operator can manage SEO & Discovery", async ({ page }) => {
    await signInAsLocalOperator(page);
    await page
      .getByRole("navigation", { name: "Platform" })
      .getByRole("link", { name: "SEO & Discovery" })
      .click();
    await expect(page).toHaveURL(staffUrl("/operator/seo"));
    expect(
      await page.locator('meta[name="robots"]').getAttribute("content")
    ).toMatch(/noindex/i);
    await expect(
      page.getByRole("heading", { name: "SEO & Discovery" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Site identity" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Marketing pages" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Diagnostics" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Structured data" })
    ).toBeVisible();
    await expect(page.getByText("/clinics", { exact: true })).toBeVisible();
    await expect(page.getByText("/dental", { exact: true })).toBeVisible();
    await expect(
      page.getByText("/physiotherapy", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText("/chiropractic", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText("/cosmetic-clinics", { exact: true })
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Site name" })).toHaveValue(
      "River Aftercare"
    );
    await expect(page.getByLabel("Default description")).toBeVisible();
    await expect(page.getByText("Default social sharing image")).toBeVisible();
    await expect(
      page.getByText("Used when a page does not have its own social image.")
    ).toBeVisible();
    await expect(page.getByText("Choose image")).toBeVisible();
    await expect(page.getByText("Needs attention").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Copy JSON-LD/i })
    ).toBeVisible();
    const jsonPreview = page.locator("pre");
    await expect(jsonPreview).toContainText("Organization");
    await expect(jsonPreview).toContainText("WebSite");
    await expect(jsonPreview).not.toContainText("<script");

    await setPortalColorScheme(page, "light");
    await page.screenshot({
      path: "test-results/artifacts/phase-2b-operator-seo-light.png",
      fullPage: true,
    });
    await setPortalColorScheme(page, "dark");
    await page.screenshot({
      path: "test-results/artifacts/phase-2b-operator-seo-dark.png",
      fullPage: true,
    });
    await expectNoSeriousAxeViolationsLightAndDark(page);
  });
});
