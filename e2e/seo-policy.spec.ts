import { expect, test } from "@playwright/test";

import {
  DEMO_TENANT_SLUG,
  marketingUrl,
  staffUrl,
  tenantUrl,
} from "./helpers/origins";
import { signInAsLocalAdmin } from "./helpers/staff-auth";

async function robotsContent(page: {
  locator: (selector: string) => {
    getAttribute: (name: string) => Promise<string | null>;
  };
}): Promise<string> {
  return (
    (await page.locator('meta[name="robots"]').getAttribute("content")) ?? ""
  );
}

test.describe("launch SEO surfaces", () => {
  test("marketing pages are indexable with canonical and Open Graph tags", async ({
    page,
  }) => {
    await page.goto(marketingUrl("/"), { waitUntil: "domcontentloaded" });
    expect(await robotsContent(page)).toMatch(/index/i);
    expect(await robotsContent(page)).not.toMatch(/noindex/i);
    await expect(page).toHaveTitle(
      "Patient Aftercare Software for Clinics | River Aftercare"
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /https?:\/\/[^/]+\/?$/
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "Aftercare that still feels like your clinic"
    );
    const jsonLd = await page
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent();
    expect(jsonLd).toContain("WebSite");
    expect(jsonLd).toContain("Organization");
    expect(jsonLd).not.toContain('"Offer"');
    expect(jsonLd).toContain(
      "Patient Aftercare Software for Clinics | River Aftercare"
    );
    expect(jsonLd).not.toContain(
      '"name":"Aftercare that still feels like your clinic"'
    );
    await expect(
      page.locator('link[rel="icon"][sizes="32x32"]')
    ).toHaveAttribute("href", /favicon-32x32\.png/);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      "href",
      /apple/
    );
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      /site\.webmanifest/
    );

    await page.goto(marketingUrl("/pricing"), {
      waitUntil: "domcontentloaded",
    });
    expect(await robotsContent(page)).not.toMatch(/noindex/i);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/pricing\/?$/
    );

    const sitemap = await page.goto(marketingUrl("/sitemap.xml"), {
      waitUntil: "domcontentloaded",
    });
    const sitemapBody = (await sitemap?.text()) ?? "";
    expect(sitemapBody).toContain("/pricing");
    expect(sitemapBody).toContain("/contact");
    expect(sitemapBody).toContain("/about");
    expect(sitemapBody).toContain("/privacy");
    expect(sitemapBody).toContain("/terms");
    expect(sitemapBody).toContain("/dental");
    expect(sitemapBody).not.toContain("/dashboard");
    expect(sitemapBody).not.toContain("/operator");
    expect(sitemapBody).not.toContain("/_sites");
    expect(sitemapBody).not.toContain("demodental");

    await page.goto(marketingUrl("/privacy"), {
      waitUntil: "domcontentloaded",
    });
    expect(await robotsContent(page)).toMatch(/noindex/i);
    expect(await robotsContent(page)).not.toMatch(/nofollow/i);
    await page.goto(marketingUrl("/terms"), { waitUntil: "domcontentloaded" });
    expect(await robotsContent(page)).toMatch(/noindex/i);
    expect(await robotsContent(page)).not.toMatch(/nofollow/i);
  });

  test("staff portal and authenticated preview stay noindex", async ({
    page,
  }) => {
    await signInAsLocalAdmin(page);
    expect(await robotsContent(page)).toMatch(/noindex/i);
    expect(await robotsContent(page)).toMatch(/nofollow/i);

    await page.goto(staffUrl("/guides"), { waitUntil: "load" });
    expect(await robotsContent(page)).toMatch(/noindex/i);
    const previewHref = await page
      .getByRole("link", { name: "Preview" })
      .first()
      .getAttribute("href");
    expect(previewHref).toBeTruthy();
    await page.goto(staffUrl(previewHref!), { waitUntil: "load" });
    expect(await robotsContent(page)).toMatch(/noindex/i);
    expect(page.url()).toContain("/preview");
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  });

  test("tenant guides stay noindex with public canonical metadata", async ({
    page,
  }) => {
    await page.goto(tenantUrl(DEMO_TENANT_SLUG, "/extraction"), {
      waitUntil: "load",
    });
    const robots = await robotsContent(page);
    expect(robots).toMatch(/noindex/i);
    expect(robots).not.toMatch(/nofollow/i);
    await expect(page).toHaveTitle(
      "Tooth Extraction Post-treatment | Riverside Dental Demo"
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      tenantUrl(DEMO_TENANT_SLUG, "/extraction")
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "Tooth Extraction Post-treatment | Riverside Dental Demo"
    );
  });
});
