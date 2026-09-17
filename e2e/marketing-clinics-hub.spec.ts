import { expect, test } from "@playwright/test";

import { expectOneH1 } from "./helpers/assertions";
import { expectNoSeriousAxeViolations } from "./helpers/axe";
import { expectNoHorizontalOverflow } from "./helpers/layout";
import { marketingUrl } from "./helpers/origins";

test.describe("clinics overview hub", () => {
  test("/clinics is indexable with hub copy, metadata, and WebPage JSON-LD", async ({
    page,
  }) => {
    const response = await page.goto(marketingUrl("/clinics"), {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);
    expect(page.url()).toBe(marketingUrl("/clinics"));
    await expectOneH1(
      page,
      "Aftercare built around the way your clinic works."
    );
    await expect(page).toHaveTitle(
      "Patient Aftercare Software for Clinics & Practices | River Aftercare"
    );

    const robots =
      (await page.locator('meta[name="robots"]').getAttribute("content")) ?? "";
    expect(robots).toMatch(/index/i);
    expect(robots).not.toMatch(/noindex/i);
    expect(robots).toMatch(/follow/i);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/clinics\/?$/
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "Explore River Aftercare for dental, physiotherapy, chiropractic and cosmetic clinics. One branded aftercare platform, adapted to different care workflows."
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "Patient aftercare for different kinds of clinics"
    );
    await expect(
      page.locator('meta[property="og:description"]')
    ).toHaveAttribute(
      "content",
      "See how River Aftercare adapts branded patient guidance to dental, physiotherapy, chiropractic and cosmetic clinic workflows."
    );

    await expect(
      page.getByRole("link", { name: /Dental practices/ })
    ).toHaveAttribute("href", "/dental");
    await expect(
      page.getByRole("link", { name: /Physiotherapy clinics/ })
    ).toHaveAttribute("href", "/physiotherapy");
    await expect(
      page.getByRole("link", { name: /Chiropractic practices/ })
    ).toHaveAttribute("href", "/chiropractic");
    await expect(
      page.getByRole("link", { name: /Cosmetic & aesthetic clinics/ })
    ).toHaveAttribute("href", "/cosmetic-clinics");
    await expect(
      page.getByRole("heading", {
        name: "What stays consistent across every clinic",
      })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Don't see your clinic type?" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Request a demo" }).first()
    ).toHaveAttribute("href", "/contact");

    const jsonLd = await page
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent();
    expect(jsonLd).toContain('"WebPage"');
    expect(jsonLd).toContain("/clinics#webpage");
    expect(jsonLd).toContain("SoftwareApplication");
    expect(jsonLd).not.toContain("MedicalWebPage");
    expect(jsonLd).not.toContain("MedicalOrganization");
    expect(jsonLd).not.toContain("FAQPage");
  });

  test("desktop and mobile For clinics menus put Overview first", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/clinics"), { waitUntil: "load" });
    const header = page.getByRole("navigation", { name: "Marketing" });
    await header.getByRole("button", { name: "For clinics" }).click();
    const desktopLinks = header.getByRole("link");
    await expect(desktopLinks.nth(0)).toHaveAttribute("href", "/clinics");
    await expect(desktopLinks.nth(0)).toHaveText("Overview");
    await expect(desktopLinks.nth(1)).toHaveAttribute("href", "/dental");
    await page.keyboard.press("Escape");

    const footer = page.getByRole("contentinfo");
    await expect(
      footer.getByRole("link", { name: "Overview" })
    ).toHaveAttribute("href", "/clinics");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(marketingUrl("/clinics"), { waitUntil: "load" });
    await page.getByRole("button", { name: "Site menu" }).click();
    const mobileOverview = header.getByRole("link", { name: "Overview" });
    await expect(mobileOverview).toHaveAttribute("href", "/clinics");
    await expect(mobileOverview).toHaveAttribute("aria-current", "page");
  });

  test("hub stays accessible and does not overflow at core widths", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 390, height: 844 },
    ] as const) {
      await page.setViewportSize(viewport);
      await page.goto(marketingUrl("/clinics"), { waitUntil: "load" });
      await expectNoHorizontalOverflow(page);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await expectNoSeriousAxeViolations(page, {
      exclude: ["[data-mk-pending]", "[data-mk-pending] *"],
    });
  });
});
