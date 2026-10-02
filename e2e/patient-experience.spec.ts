import { expect, test } from "@playwright/test";

import {
  expectNoLoginUi,
  expectOneH1,
  expectPublicTenantUrl,
  tabUntil,
} from "./helpers/assertions";
import {
  expectHeadingDoesNotOverflow,
  expectNoHorizontalOverflow,
  expectUsableTapTarget,
} from "./helpers/layout";
import { DEMO_TENANT_SLUG, tenantUrl } from "./helpers/origins";

const HOME = tenantUrl(DEMO_TENANT_SLUG, "/");
const EXTRACTION = tenantUrl(DEMO_TENANT_SLUG, "/extraction");

test.describe("tenant homepage and guide", () => {
  test("renders the branded demodental homepage without login UI", async ({
    page,
  }, testInfo) => {
    testInfo.annotations.push({
      type: "video",
      description: "Phase 1E homepage smoke",
    });
    const response = await page.goto(HOME, { waitUntil: "load" });

    expect(response?.status()).toBe(200);
    await expectPublicTenantUrl(page, HOME);
    await expect(
      page.getByRole("link", { name: "Riverside Dental Demo", exact: true })
    ).toBeVisible();
    await expectOneH1(page, "Riverside Dental Demo");
    await expect(
      page.getByText("Post-treatment instructions").first()
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Tooth Extraction" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Call Riverside Dental Demo/ })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Book an appointment" })
    ).toHaveCount(0);
    await expect(page.getByText("Powered by River Aftercare")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Change colour theme/ })
    ).toBeVisible();
    await expect(page.getByRole("radio", { name: "System" })).toHaveCount(0);
    await expect(page.getByText("Interactive demo")).toBeVisible();
    await expect(
      page.getByText("Sample content only · Not clinical advice")
    ).toBeVisible();
    await expectNoLoginUi(page);
    await page.screenshot({
      path: "test-results/artifacts/tenant-home-desktop.png",
      fullPage: true,
    });
  });

  test("follows Tooth Extraction to the composed public guide", async ({
    page,
  }) => {
    await page.goto(HOME, { waitUntil: "load" });
    await page.getByRole("link", { name: "Tooth Extraction" }).click();

    await expectPublicTenantUrl(page, EXTRACTION);
    await expectOneH1(page, "Tooth Extraction");
    await expect(page.getByRole("tab", { name: "Today" })).toBeVisible();
    await expect(
      page.getByRole("tabpanel", { name: "Today" }).getByText("Day 1 of 7")
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "What to do today" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Weekend contact" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "When to contact us" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Recovery overview" })
    ).toHaveCount(0);
    await page.getByRole("tab", { name: "Timeline" }).click();
    await expect(
      page
        .getByRole("tabpanel", { name: "Timeline" })
        .getByText("First few hours")
    ).toBeVisible();
    const timeline = page.getByRole("tabpanel", { name: "Timeline" });
    await expect(timeline.getByText("Today / first 24 hours")).toBeVisible();
    await expect(timeline.getByText("Days 2–3", { exact: true })).toBeVisible();
    await expect(timeline.getByText("Days 4–7")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Recovery overview" })
    ).toBeVisible();
    await expect(page.locator("text=Important.")).toHaveCount(1);
    await expect(page.getByText("If you need urgent help")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Call Riverside Dental Demo/ })
    ).toBeVisible();
    await expect(page.getByText("Riverside Dental Demo").first()).toBeVisible();
    await expect(page.getByText("Draft preview", { exact: true })).toHaveCount(
      0
    );
    await expect(page.getByRole("link", { name: "Back to guide" })).toHaveCount(
      0
    );
    await expect(page.getByRole("link", { name: "Edit guide" })).toHaveCount(0);
    await expectNoLoginUi(page);
    await page.screenshot({
      path: "test-results/artifacts/extraction-desktop.png",
      fullPage: true,
    });
  });

  test("keeps native anchors and a sensible keyboard sequence", async ({
    page,
  }) => {
    await page.goto(HOME, { waitUntil: "load" });

    const brand = await tabUntil(
      page,
      (href, text) => href === "/" && text.includes("Riverside Dental Demo")
    );
    expect(brand.href).toBe("/");

    const extraction = await tabUntil(
      page,
      (href, text) =>
        href === "/extraction" && text.includes("Tooth Extraction")
    );
    expect(extraction.href).toBe("/extraction");

    await page.keyboard.press("Enter");
    await expectPublicTenantUrl(page, EXTRACTION);
    await expectOneH1(page, "Tooth Extraction");

    await tabUntil(page, (href) => href === "/");
    await tabUntil(page, (href, text) =>
      Boolean(
        href?.startsWith("tel:") && text.includes("Call Riverside Dental Demo")
      )
    );
    await tabUntil(page, (href, text) =>
      Boolean(
        href?.startsWith("https://") && text.includes("Practice contact page")
      )
    );
  });

  test("exposes noindex metadata and a public hostname title", async ({
    page,
  }) => {
    await page.goto(HOME, { waitUntil: "load" });
    await expect(page).toHaveTitle(
      "Riverside Dental Demo — Post-treatment instructions"
    );
    const homeRobots = await page
      .locator('meta[name="robots"]')
      .getAttribute("content");
    expect(homeRobots).toMatch(/noindex/i);
    expect(homeRobots).not.toMatch(/nofollow/i);

    await page.goto(EXTRACTION, { waitUntil: "load" });
    await expect(page).toHaveTitle(
      "Tooth Extraction Post-treatment | Riverside Dental Demo"
    );
    const guideRobots = await page
      .locator('meta[name="robots"]')
      .getAttribute("content");
    expect(guideRobots).toMatch(/noindex/i);
    const html = await page.content();
    expect(html).not.toContain("/_sites/");
  });
});

test.describe("mobile viewport", () => {
  for (const viewport of [
    { name: "390", width: 390, height: 844 },
    { name: "360", width: 360, height: 800 },
  ] as const) {
    test(`fits the patient pages at ${viewport.name}px`, async ({ page }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      await page.goto(HOME, { waitUntil: "load" });
      await expectNoHorizontalOverflow(page);
      await expectHeadingDoesNotOverflow(page.locator("h1"));
      await expectUsableTapTarget(
        page.getByRole("link", { name: "Tooth Extraction" })
      );
      await expectUsableTapTarget(
        page.getByRole("link", { name: /Call Riverside Dental Demo/ })
      );
      if (viewport.width === 390) {
        await page.screenshot({
          path: "test-results/artifacts/tenant-home-mobile.png",
          fullPage: true,
        });
      }

      await page.goto(EXTRACTION, { waitUntil: "load" });
      await expectNoHorizontalOverflow(page);
      await expectHeadingDoesNotOverflow(page.locator("h1"));
      await expectUsableTapTarget(
        page.getByRole("link", { name: /Call Riverside Dental Demo/ })
      );
      await expect(
        page.locator("section").filter({
          hasText: "Contact Riverside Dental Demo",
        })
      ).toBeVisible();
      const contactOverflow = await page
        .locator("section")
        .filter({ hasText: "Contact Riverside Dental Demo" })
        .evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(contactOverflow).toBeLessThanOrEqual(1);
      if (viewport.width === 390) {
        await page.screenshot({
          path: "test-results/artifacts/extraction-mobile.png",
          fullPage: true,
        });
      }
    });
  }
});

test.describe("tenant light and dark screenshots", () => {
  test("captures home and extraction in both schemes", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(HOME, { waitUntil: "load" });
    const homeBackground = await page.evaluate(() => {
      const pageSurface = document.querySelector("body");
      return pageSurface ? getComputedStyle(pageSurface).backgroundColor : "";
    });
    const rgb = homeBackground.match(/\d+/g)?.map(Number) ?? [];
    expect(rgb[0]).toBeGreaterThanOrEqual(247);
    expect(rgb[1]).toBeGreaterThanOrEqual(247);
    expect(rgb[2]).toBeGreaterThanOrEqual(245);
    await page.screenshot({
      path: "test-results/artifacts/tenant-home-desktop-light.png",
      fullPage: true,
    });
    await page.goto(EXTRACTION, { waitUntil: "load" });
    await page.screenshot({
      path: "test-results/artifacts/extraction-desktop-light.png",
      fullPage: true,
    });

    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(HOME, { waitUntil: "load" });
    await page.screenshot({
      path: "test-results/artifacts/tenant-home-desktop-dark.png",
      fullPage: true,
    });
    await page.goto(EXTRACTION, { waitUntil: "load" });
    await page.screenshot({
      path: "test-results/artifacts/extraction-desktop-dark.png",
      fullPage: true,
    });

    await page.evaluate(() => {
      try {
        window.localStorage.setItem("aftercare-guide-portal-theme", "light");
      } catch {
        // Tenant origin must not read portal storage.
      }
    });
    await page.reload({ waitUntil: "load" });
    const darkAfterPortalKey = await page.evaluate(() => {
      const pageSurface = document.querySelector("body");
      return pageSurface ? getComputedStyle(pageSurface).backgroundColor : "";
    });
    const darkRgb = darkAfterPortalKey.match(/\d+/g)?.map(Number) ?? [];
    expect(darkRgb[0] ?? 255).toBeLessThan(40);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(HOME, { waitUntil: "load" });
    await page.screenshot({
      path: "test-results/artifacts/tenant-home-mobile-light.png",
      fullPage: true,
    });
    await page.goto(EXTRACTION, { waitUntil: "load" });
    await page.screenshot({
      path: "test-results/artifacts/extraction-mobile-light.png",
      fullPage: true,
    });

    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(HOME, { waitUntil: "load" });
    await page.screenshot({
      path: "test-results/artifacts/tenant-home-mobile-dark.png",
      fullPage: true,
    });
    await page.goto(EXTRACTION, { waitUntil: "load" });
    await page.screenshot({
      path: "test-results/artifacts/extraction-mobile-dark.png",
      fullPage: true,
    });
  });

  test("guide cards and inactive tabs use restrained hover", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(HOME, { waitUntil: "load" });
    const card = page.getByRole("link", { name: "Tooth Extraction" });
    const before = await card.evaluate((element) => {
      const styles = getComputedStyle(element);
      return { transform: styles.transform, boxShadow: styles.boxShadow };
    });
    await card.hover();
    await page.screenshot({
      path: "test-results/artifacts/tenant-guide-card-hover-1440.png",
    });
    const after = await card.evaluate((element) => {
      const styles = getComputedStyle(element);
      const after = getComputedStyle(element, "::after");
      return {
        transform: styles.transform,
        boxShadow: styles.boxShadow,
        afterTransform: after.transform,
      };
    });
    expect(
      after.transform === "none" ||
        after.transform === "matrix(1, 0, 0, 1, 0, 0)"
    ).toBe(true);
    expect(before.transform).toBe(after.transform);
    expect(
      after.afterTransform === "none" ||
        after.afterTransform === "matrix(1, 0, 0, 1, 0, 0)"
    ).toBe(true);
    await card.focus();
    await expect(card).toBeFocused();

    await page.goto(EXTRACTION, { waitUntil: "load" });
    const timeline = page.getByRole("tab", { name: "Timeline" });
    const today = page.getByRole("tab", { name: "Today" });
    await expect(today).toHaveAttribute("aria-selected", "true");
    const activeBefore = await today.evaluate(
      (element) => getComputedStyle(element).color
    );
    await today.hover();
    const activeAfter = await today.evaluate(
      (element) => getComputedStyle(element).color
    );
    expect(activeAfter).toBe(activeBefore);

    const inactiveBefore = await timeline.evaluate(
      (element) => getComputedStyle(element).color
    );
    await timeline.hover();
    await page.screenshot({
      path: "test-results/artifacts/tenant-timeline-tab-hover-1440.png",
    });
    const inactiveAfter = await timeline.evaluate((element) => {
      const styles = getComputedStyle(element);
      return { color: styles.color, transform: styles.transform };
    });
    expect(inactiveAfter.color).not.toBe(inactiveBefore);
    expect(
      inactiveAfter.transform === "none" ||
        inactiveAfter.transform === "matrix(1, 0, 0, 1, 0, 0)"
    ).toBe(true);
    await timeline.focus();
    await expect(timeline).toBeFocused();
  });
});
