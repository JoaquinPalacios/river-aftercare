import { expect, test, type Page } from "@playwright/test";

import { expectOneH1 } from "./helpers/assertions";
import { expectNoSeriousAxeViolations } from "./helpers/axe";
import { expectNoHorizontalOverflow } from "./helpers/layout";
import { marketingUrl } from "./helpers/origins";

async function showMarketingScheme(
  page: Page,
  scheme: "light" | "dark"
): Promise<void> {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await page.evaluate((mode) => {
    try {
      window.localStorage.setItem("aftercare-guide-marketing-theme", mode);
    } catch {
      // Ignore storage failures in restricted contexts.
    }
    document.documentElement.setAttribute("data-theme-mode", mode);
    document.documentElement.setAttribute("data-mk-motion", "reduce");
  }, scheme);
}

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
      "Patient Aftercare for Treatment-Based Clinics | River Aftercare"
    );
    await expect(
      page.getByText(
        "River Aftercare is patient aftercare software for treatment-based clinics. Publish clear, branded guidance patients can return to after appointments, procedures and between visits."
      )
    ).toBeVisible();

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
      "See how River Aftercare helps dental, physiotherapy, chiropractic and cosmetic clinics publish branded aftercare patients can revisit by link or QR code."
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "Patient aftercare for treatment-based clinics"
    );
    await expect(
      page.locator('meta[property="og:description"]')
    ).toHaveAttribute(
      "content",
      "See how River Aftercare helps dental, physiotherapy, chiropractic and cosmetic clinics publish branded aftercare patients can revisit by link or QR code."
    );

    await expect(
      page.getByRole("heading", {
        name: "Different kinds of care. The same need for clear aftercare.",
      })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Explore dental aftercare/ })
    ).toHaveAttribute("href", "/dental");
    await expect(
      page.getByRole("link", { name: /Explore physiotherapy aftercare/ })
    ).toHaveAttribute("href", "/physiotherapy");
    await expect(
      page.getByRole("link", { name: /Explore chiropractic aftercare/ })
    ).toHaveAttribute("href", "/chiropractic");
    await expect(
      page.getByRole("link", { name: /Explore cosmetic & aesthetic aftercare/ })
    ).toHaveAttribute("href", "/cosmetic-clinics");
    await expect(
      page.getByRole("heading", {
        name: "What stays consistent across every clinic",
      })
    ).toBeVisible();
    await expect(
      page.getByText(
        "Your logo, colours, terminology and contact details remain part of the patient experience."
      )
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Another treatment-based practice?" })
    ).toBeVisible();
    await expect(page.getByText("A good fit when")).toBeVisible();
    await expect(
      page.getByText("Guidance continues after the appointment")
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Tell us about your clinic" })
    ).toHaveAttribute("href", "/contact");
    await expect(
      page.getByRole("link", { name: "Explore clinic types" })
    ).toHaveAttribute("href", "#clinic-types");
    await expect(
      page.getByRole("link", { name: "Request a demo" }).first()
    ).toHaveAttribute("href", "/contact");
    await expect(
      page.getByRole("link", { name: "View pricing" })
    ).toHaveAttribute("href", "/pricing");

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
      { width: 768, height: 1024 },
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

  test("desktop editorial columns, mobile stack, and visual QA", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/clinics"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");

    const platformSection = page.locator(
      '[aria-labelledby="clinics-platform"]'
    );
    const desktopLayout = await page.evaluate(() => {
      const intro = document.querySelector(
        "[class*='clinicsHubPlatformIntro']"
      );
      const body = document.querySelector("[class*='clinicsHubPlatformBody']");
      if (!(intro instanceof HTMLElement) || !(body instanceof HTMLElement)) {
        return null;
      }
      const introBox = intro.getBoundingClientRect();
      const bodyBox = body.getBoundingClientRect();
      return {
        sideBySide:
          Math.abs(introBox.top - bodyBox.top) < 48 &&
          bodyBox.left > introBox.right - 1,
        introTop: introBox.top,
        bodyTop: bodyBox.top,
        bodyLeft: bodyBox.left,
        introRight: introBox.right,
      };
    });
    expect(desktopLayout).toBeTruthy();
    expect(desktopLayout?.sideBySide).toBe(true);

    const otherPanel = page.locator("[class*='clinicsHubOther']").first();
    const widths = await page.evaluate(() => {
      const panel = document.querySelector("[class*='clinicsHubOther']");
      const container = document.querySelector(
        '[aria-labelledby="clinics-other"] [class*="inner"]'
      );
      if (
        !(panel instanceof HTMLElement) ||
        !(container instanceof HTMLElement)
      ) {
        return { panel: 0, container: 0 };
      }
      return {
        panel: panel.getBoundingClientRect().width,
        container: container.getBoundingClientRect().width,
      };
    });
    expect(widths.panel).toBeGreaterThan(widths.container * 0.9);

    const heading = page.getByRole("heading", {
      name: "Another treatment-based practice?",
    });
    const body = page.getByText(
      "If your clinic sends patients home with guidance they may need to revisit, River Aftercare may fit your workflow."
    );
    const headingBox = await heading.boundingBox();
    const bodyBox = await body.boundingBox();
    expect(headingBox).toBeTruthy();
    expect(bodyBox).toBeTruthy();
    const headingBodyGap =
      (bodyBox?.y ?? 0) - ((headingBox?.y ?? 0) + (headingBox?.height ?? 0));
    expect(headingBodyGap).toBeGreaterThanOrEqual(12);
    expect(headingBodyGap).toBeLessThanOrEqual(28);

    await page.screenshot({
      path: "test-results/artifacts/clinics-full-light-1440.png",
      fullPage: true,
    });
    await platformSection.screenshot({
      path: "test-results/artifacts/clinics-one-platform-light.png",
    });
    await otherPanel.screenshot({
      path: "test-results/artifacts/clinics-beyond-light.png",
    });

    await showMarketingScheme(page, "dark");
    await page.screenshot({
      path: "test-results/artifacts/clinics-full-dark-1440.png",
      fullPage: true,
    });
    await platformSection.screenshot({
      path: "test-results/artifacts/clinics-one-platform-dark.png",
    });
    await otherPanel.screenshot({
      path: "test-results/artifacts/clinics-beyond-dark.png",
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(marketingUrl("/clinics"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    const mobileLayout = await page.evaluate(() => {
      const intro = document.querySelector(
        "[class*='clinicsHubPlatformIntro']"
      );
      const body = document.querySelector("[class*='clinicsHubPlatformBody']");
      if (!(intro instanceof HTMLElement) || !(body instanceof HTMLElement)) {
        return null;
      }
      const introBox = intro.getBoundingClientRect();
      const bodyBox = body.getBoundingClientRect();
      return {
        stacked: bodyBox.top >= introBox.bottom - 1,
      };
    });
    expect(mobileLayout?.stacked).toBe(true);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: "test-results/artifacts/clinics-full-light-390.png",
      fullPage: true,
    });
    await showMarketingScheme(page, "dark");
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: "test-results/artifacts/clinics-full-dark-390.png",
      fullPage: true,
    });
  });
});
