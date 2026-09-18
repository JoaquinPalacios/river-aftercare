import { expect, test, type Page } from "@playwright/test";

import { expectOneH1 } from "./helpers/assertions";
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
  }, scheme);
}

async function waitForPhoneFrame(page: Page): Promise<void> {
  const frame = page.locator('[class*="phoneFrame"]');
  await expect(frame).toHaveCount(1);
  await expect
    .poll(async () =>
      frame.evaluate((element) => {
        return (
          element instanceof HTMLImageElement &&
          element.complete &&
          element.naturalWidth > 0
        );
      })
    )
    .toBe(true);
}

test.describe("premium marketing UX", () => {
  test("desktop For clinics disclosure is keyboard accessible", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    const header = page.getByRole("navigation", { name: "Marketing" });
    const trigger = header.getByRole("button", { name: "For clinics" });
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(header.getByRole("link", { name: "Overview" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Dental" })).toBeVisible();
    await header.getByRole("link", { name: "Overview" }).focus();
    await expect(header.getByRole("link", { name: "Overview" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.locator("body").click({ position: { x: 24, y: 240 } });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("mobile Theme control stays reachable on short viewports", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 390, height: 667 },
      { width: 375, height: 667 },
      { width: 360, height: 640 },
      { width: 320, height: 568 },
    ] as const) {
      await page.setViewportSize(viewport);
      await page.goto(marketingUrl("/"), { waitUntil: "load" });
      await page.getByRole("button", { name: "Site menu" }).click();
      const theme = page.getByRole("radiogroup", { name: "Theme" });
      await expect(theme).toBeVisible();
      const box = await theme.boundingBox();
      expect(
        box,
        `Theme visible at ${viewport.width}x${viewport.height}`
      ).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
      await expect(page.getByRole("radio", { name: "Dark" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Escape");
    }
  });

  test("FAQ first, middle, and last rows open, close, and keep focus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/dental"), { waitUntil: "load" });

    const items = page.locator("details");
    await expect(items).toHaveCount(5);
    const first = items.nth(0);
    const middle = items.nth(2);
    const last = items.nth(4);

    for (const item of [first, middle, last]) {
      const summary = item.locator("summary");
      await summary.scrollIntoViewIfNeeded();
      await summary.hover();
      const overflow = await item.evaluate((element) => {
        const styles = getComputedStyle(element);
        const parent = element.parentElement
          ? getComputedStyle(element.parentElement)
          : null;
        return {
          itemOverflow: styles.overflow,
          parentOverflow: parent?.overflow ?? "",
        };
      });
      expect(overflow.parentOverflow).not.toBe("hidden");
      await summary.focus();
      await expect(summary).toBeFocused();
      const before = await item.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { height: box.height, top: box.top };
      });
      await page.keyboard.press("Enter");
      await expect(item).toHaveJSProperty("open", true);
      await expect(summary).toBeFocused();
      const afterOpen = await item.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { top: box.top };
      });
      expect(Math.abs(afterOpen.top - before.top)).toBeLessThan(8);
      await page.keyboard.press("Enter");
      await expect(item).toHaveJSProperty("open", false);
      await expect(summary).toBeFocused();
    }
  });

  test("about page uses editorial modules and the standard demo CTA", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/about"), { waitUntil: "load" });
    await expectOneH1(page, "Aftercare should feel like part of the care.");
    await expect(page.getByText("No patient app")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Dental", exact: true })
    ).toHaveAttribute("href", "/dental");
    await expect(
      page.getByText("Other appropriate allied health")
    ).toBeVisible();
    await expect(page.getByText("Not currently")).toBeVisible();
    await expect(page.getByText("Live clinical monitoring")).toBeVisible();
    await expect(page.getByText("Product scope")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Request a demo" }).first()
    ).toHaveAttribute("href", "/contact");
    await expect(
      page.getByRole("link", { name: "View pricing" }).first()
    ).toHaveAttribute("href", "/pricing");
    await expect(
      page.getByRole("link", { name: "Talk to us about a demo" })
    ).toHaveCount(0);
  });

  test("captures premium UX visual QA artifacts", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await waitForPhoneFrame(page);
    await page.locator('[data-mk-patient-surface="phone"]').screenshot({
      path: "test-results/artifacts/home-phone-desktop-light.png",
    });
    await page
      .getByRole("heading", { name: "One platform, many clinic identities" })
      .scrollIntoViewIfNeeded();
    await page
      .getByRole("heading", { name: "One platform, many clinic identities" })
      .locator("xpath=ancestor::section[1]")
      .screenshot({
        path: "test-results/artifacts/home-brand-flexibility-light.png",
      });
    await page
      .getByRole("navigation", { name: "Marketing" })
      .screenshot({ path: "test-results/artifacts/nav-desktop-light.png" });
    await page
      .getByRole("navigation", { name: "Marketing" })
      .getByRole("button", { name: "For clinics" })
      .click();
    await page.screenshot({
      path: "test-results/artifacts/nav-dropdown-light.png",
    });
    await page.keyboard.press("Escape");

    await showMarketingScheme(page, "dark");
    await waitForPhoneFrame(page);
    await page.locator('[data-mk-patient-surface="phone"]').screenshot({
      path: "test-results/artifacts/home-phone-desktop-dark.png",
    });
    await page
      .getByRole("heading", { name: "One platform, many clinic identities" })
      .locator("xpath=ancestor::section[1]")
      .screenshot({
        path: "test-results/artifacts/home-brand-flexibility-dark.png",
      });
    await page
      .getByRole("navigation", { name: "Marketing" })
      .screenshot({ path: "test-results/artifacts/nav-desktop-dark.png" });
    await page
      .getByRole("navigation", { name: "Marketing" })
      .getByRole("button", { name: "For clinics" })
      .click();
    await page.screenshot({
      path: "test-results/artifacts/nav-dropdown-dark.png",
    });
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 390, height: 844 });
    await showMarketingScheme(page, "light");
    await waitForPhoneFrame(page);
    await page.locator('[data-mk-patient-surface="phone"]').screenshot({
      path: "test-results/artifacts/home-phone-mobile-light.png",
    });
    await page.getByRole("button", { name: "Site menu" }).click();
    await page
      .locator("[class*='navMenuPanel']")
      .screenshot({ path: "test-results/artifacts/nav-mobile-light.png" });
    await page.keyboard.press("Escape");
    await showMarketingScheme(page, "dark");
    await waitForPhoneFrame(page);
    await page.locator('[data-mk-patient-surface="phone"]').screenshot({
      path: "test-results/artifacts/home-phone-mobile-dark.png",
    });
    await page.getByRole("button", { name: "Site menu" }).click();
    await page
      .locator("[class*='navMenuPanel']")
      .screenshot({ path: "test-results/artifacts/nav-mobile-dark.png" });
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 390, height: 667 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await page.getByRole("button", { name: "Site menu" }).click();
    await page.screenshot({
      path: "test-results/artifacts/nav-mobile-short-height.png",
    });
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/clinics"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    const dentalCard = page.getByRole("link", { name: /Dental practices/ });
    await dentalCard.scrollIntoViewIfNeeded();
    await page.locator("[class*='clinicsHubGrid']").screenshot({
      path: "test-results/artifacts/clinics-cards-default-light.png",
    });
    await dentalCard.hover();
    await page.locator("[class*='clinicsHubGrid']").screenshot({
      path: "test-results/artifacts/clinics-cards-hover-light.png",
    });
    await page
      .getByRole("heading", {
        name: "What stays consistent across every clinic",
      })
      .locator("xpath=ancestor::section[1]")
      .screenshot({
        path: "test-results/artifacts/clinics-shared-foundation-light.png",
      });
    await showMarketingScheme(page, "dark");
    await page.locator("[class*='clinicsHubGrid']").screenshot({
      path: "test-results/artifacts/clinics-cards-default-dark.png",
    });
    await dentalCard.hover();
    await page.locator("[class*='clinicsHubGrid']").screenshot({
      path: "test-results/artifacts/clinics-cards-hover-dark.png",
    });
    await page
      .getByRole("heading", {
        name: "What stays consistent across every clinic",
      })
      .locator("xpath=ancestor::section[1]")
      .screenshot({
        path: "test-results/artifacts/clinics-shared-foundation-dark.png",
      });

    await page.goto(marketingUrl("/dental"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await page.getByRole("link", { name: "View the dental demo" }).screenshot({
      path: "test-results/artifacts/dental-secondary-cta-light.png",
    });
    await page
      .getByRole("heading", {
        name: "One branded place for post-treatment guidance",
      })
      .locator("xpath=ancestor::section[1]")
      .screenshot({
        path: "test-results/artifacts/dental-section-spacing.png",
      });
    const faqFirst = page.locator("details").first();
    const faqLast = page.locator("details").last();
    await faqFirst.locator("summary").click();
    await faqFirst.screenshot({
      path: "test-results/artifacts/faq-first-open.png",
    });
    await faqLast.locator("summary").click();
    await faqLast.screenshot({
      path: "test-results/artifacts/faq-last-open.png",
    });
    await faqLast.locator("summary").focus();
    await page.screenshot({ path: "test-results/artifacts/faq-focus.png" });
    await showMarketingScheme(page, "dark");
    await page.getByRole("link", { name: "View the dental demo" }).screenshot({
      path: "test-results/artifacts/dental-secondary-cta-dark.png",
    });

    await page.goto(marketingUrl("/about"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await page.screenshot({
      path: "test-results/artifacts/about-full-light-1440.png",
      fullPage: true,
    });
    await showMarketingScheme(page, "dark");
    await page.screenshot({
      path: "test-results/artifacts/about-full-dark-1440.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1024, height: 768 });
    await showMarketingScheme(page, "light");
    await page.screenshot({
      path: "test-results/artifacts/about-1024.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/artifacts/about-390.png",
      fullPage: true,
    });
  });
});
