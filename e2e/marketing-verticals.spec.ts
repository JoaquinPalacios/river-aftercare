import { expect, test } from "@playwright/test";

import { expectOneH1 } from "./helpers/assertions";
import { expectNoSeriousAxeViolations } from "./helpers/axe";
import { marketingUrl, tenantUrl, DEMO_TENANT_SLUG } from "./helpers/origins";

const VERTICALS = [
  {
    path: "/dental",
    h1: "Make post-treatment instructions part of your dental experience.",
    title: "Dental Aftercare Software for Practices | River Aftercare",
    description:
      "Give patients clear, clinic-branded post-treatment instructions they can reopen after dental treatment by link or QR code, with no app or patient login.",
    ogTitle: "Aftercare that still feels like your dental practice",
    unique: "leave the chair",
    absent: ["Riverside Physio", "exercise-adherence tracker"],
  },
  {
    path: "/physiotherapy",
    h1: "Keep recovery guidance clear between appointments.",
    title: "Physiotherapy Patient Aftercare Software | River Aftercare",
    description:
      "Share branded recovery, home-care and written exercise guidance patients can reopen between physiotherapy appointments by link or QR code.",
    ogTitle: "Recovery guidance that still feels like your clinic",
    unique: "not for tracking whether a patient completes",
    absent: ["Riverside Dental Demo", "leave the chair"],
  },
  {
    path: "/chiropractic",
    h1: "Give patients clearer guidance between chiropractic visits.",
    title: "Chiropractic Patient Aftercare Software | River Aftercare",
    description:
      "Publish branded home-care and post-appointment guidance patients can reopen between chiropractic visits by link or QR code, with no app or login.",
    ogTitle: "Between-visit guidance that still feels like your practice",
    unique: "publishing technology",
    absent: ["spinal alignment", "Riverside Dental Demo"],
  },
  {
    path: "/cosmetic-clinics",
    h1: "Make post-treatment aftercare feel as considered as the treatment.",
    title: "Cosmetic Clinic Aftercare Software | River Aftercare",
    description:
      "Give clients clear, clinic-branded post-treatment aftercare they can reopen after cosmetic and aesthetic treatments by link or QR code.",
    ogTitle: "Post-treatment aftercare that stays under your clinic brand",
    unique: "does not provide live clinical monitoring",
    absent: ["injectables", "Riverside Dental Demo"],
  },
] as const;

test.describe("clinic vertical acquisition pages", () => {
  for (const vertical of VERTICALS) {
    test(`${vertical.path} is indexable with unique copy and WebPage JSON-LD`, async ({
      page,
    }) => {
      const response = await page.goto(marketingUrl(vertical.path), {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      expect(page.url()).toBe(marketingUrl(vertical.path));
      expect(page.url()).not.toContain("/_marketing");
      await expectOneH1(page, vertical.h1);
      await expect(page).toHaveTitle(vertical.title);
      expect(page.url()).not.toMatch(/River Aftercare — River Aftercare/);

      const robots =
        (await page.locator('meta[name="robots"]').getAttribute("content")) ??
        "";
      expect(robots).toMatch(/index/i);
      expect(robots).not.toMatch(/noindex/i);
      expect(robots).toMatch(/follow/i);

      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        new RegExp(`${vertical.path}/?$`)
      );
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        "content",
        vertical.description
      );
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
        "content",
        vertical.ogTitle
      );
      await expect(
        page.locator('meta[property="og:description"]')
      ).toHaveAttribute("content", /./);

      const jsonLd = await page
        .locator('script[type="application/ld+json"]')
        .first()
        .textContent();
      expect(jsonLd).toBeTruthy();
      const graph = JSON.parse(jsonLd!);
      const types = JSON.stringify(graph);
      expect(types).toContain("WebPage");
      expect(types).toContain("Organization");
      expect(types).toContain("WebSite");
      expect(types).toContain("SoftwareApplication");
      expect(types).toContain(`${vertical.path}#webpage`);
      expect(types).toContain("/#application");
      expect(types).not.toContain("FAQPage");
      expect(types).not.toContain("MedicalWebPage");
      expect(types).not.toContain("aggregateRating");
      expect(types).not.toContain('"Offer"');
      expect(types).not.toMatch(/River Aftercare — River Aftercare/);

      await expect(page.getByText(vertical.unique).first()).toBeVisible();
      for (const phrase of vertical.absent) {
        await expect(page.getByText(phrase)).toHaveCount(0);
      }

      await expect(
        page
          .getByRole("navigation", { name: "Marketing" })
          .getByRole("button", {
            name: "For clinics",
          })
      ).toBeVisible();
      await expect(
        page.getByRole("contentinfo").getByRole("link", { name: "Dental" })
      ).toHaveAttribute("href", "/dental");
      await expect(
        page.getByRole("link", { name: "Request a demo" }).first()
      ).toHaveAttribute("href", "/contact");
      await expect(
        page.getByRole("link", { name: "Pricing" }).first()
      ).toHaveAttribute("href", "/pricing");
    });
  }

  test("dental demo CTA uses the real Riverside tenant", async ({ page }) => {
    await page.goto(marketingUrl("/dental"), { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("link", { name: "View the dental demo" })
    ).toHaveAttribute("href", tenantUrl(DEMO_TENANT_SLUG, "/"));
    await expect(
      page.getByRole("link", { name: "Open Riverside Dental Demo" })
    ).toHaveAttribute("href", tenantUrl(DEMO_TENANT_SLUG, "/"));
  });

  test("homepage and footer discover the four clinic pages", async ({
    page,
  }) => {
    await page.goto(marketingUrl("/"), { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", {
        name: "One aftercare platform. Different clinic workflows.",
      })
    ).toBeVisible();
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

    await page
      .getByRole("navigation", { name: "Marketing" })
      .getByRole("button", { name: "For clinics" })
      .click();
    await expect(
      page.getByRole("link", { name: "Dental" }).first()
    ).toBeVisible();
    await page.getByRole("link", { name: "Physiotherapy" }).first().click();
    await expect(page).toHaveURL(marketingUrl("/physiotherapy"));
    await expectOneH1(
      page,
      "Keep recovery guidance clear between appointments."
    );
  });

  test("desktop and mobile navigation expose clinic links", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/about"), { waitUntil: "load" });
    const header = page.getByRole("navigation", { name: "Marketing" });
    await header.getByRole("button", { name: "For clinics" }).click();
    await expect(header.getByRole("link", { name: "Dental" })).toBeVisible();
    await expect(
      header.getByRole("link", { name: "Cosmetic & aesthetic" })
    ).toHaveAttribute("href", "/cosmetic-clinics");
    await page.keyboard.press("Escape");
    await expect(header.getByRole("link", { name: "Dental" })).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(marketingUrl("/dental"), { waitUntil: "load" });
    await page.getByRole("button", { name: "Site menu" }).click();
    const mobileDental = header.getByRole("link", { name: "Dental" });
    await expect(mobileDental).toHaveAttribute("aria-current", "page");
    await header.getByRole("link", { name: "Chiropractic" }).click();
    await expect(page).toHaveURL(marketingUrl("/chiropractic"));
  });

  test("sitemap lists each clinic page once and tenants stay unpublished", async ({
    page,
  }) => {
    const sitemap = await page.goto(marketingUrl("/sitemap.xml"), {
      waitUntil: "domcontentloaded",
    });
    const body = (await sitemap?.text()) ?? "";
    for (const path of [
      "/dental",
      "/physiotherapy",
      "/chiropractic",
      "/cosmetic-clinics",
    ]) {
      expect(body.split(path).length - 1).toBe(1);
    }
    expect(body).not.toContain("/_marketing");
    expect(body).not.toContain("demodental");
    expect(body).not.toContain("/operator");
  });

  test("tenant hosts do not serve marketing clinic pages", async ({ page }) => {
    const response = await page.goto(tenantUrl(DEMO_TENANT_SLUG, "/dental"), {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(404);
  });

  test("dental page remains accessible", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(marketingUrl("/dental"), { waitUntil: "load" });
    await expectNoSeriousAxeViolations(page, {
      exclude: ["[data-mk-pending]", "[data-mk-pending] *"],
    });
  });
});
