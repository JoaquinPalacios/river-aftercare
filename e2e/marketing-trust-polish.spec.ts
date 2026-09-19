import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousAxeViolations } from "./helpers/axe";
import { expectOneH1 } from "./helpers/assertions";
import { expectNoHorizontalOverflow } from "./helpers/layout";
import { marketingUrl, staffUrl } from "./helpers/origins";
import { readPrimaryCtaStyles } from "./helpers/primary-cta-styles";

const VIEWPORTS = [
  { width: 1440, height: 900, label: "1440" },
  { width: 1280, height: 800, label: "1280" },
  { width: 1024, height: 768, label: "1024" },
  { width: 768, height: 1024, label: "768" },
  { width: 390, height: 844, label: "390" },
  { width: 360, height: 800, label: "360" },
] as const;

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

test.describe("marketing + trust polish", () => {
  test("privacy and terms are published with noindex,follow metadata", async ({
    page,
  }) => {
    const privacy = await page.goto(marketingUrl("/privacy"), {
      waitUntil: "load",
    });
    expect(privacy?.status()).toBe(200);
    expect(page.url()).not.toContain("/_marketing");
    await expectOneH1(page, "Privacy Policy");
    await expect(page.getByRole("note")).toHaveCount(0);
    await expect(
      page.getByText("Pedro Joaquin Palacios", { exact: false }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "admin@riveraftercare.com.au" }).first()
    ).toHaveAttribute("href", "mailto:admin@riveraftercare.com.au");
    await expect(page.locator("time")).toHaveAttribute(
      "dateTime",
      "2026-09-19"
    );
    expect(
      await page.locator('meta[name="robots"]').getAttribute("content")
    ).toMatch(/noindex/i);
    expect(
      await page.locator('meta[name="robots"]').getAttribute("content")
    ).not.toMatch(/nofollow/i);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/privacy\/?$/
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      /Privacy/
    );
    await expectNoSeriousAxeViolations(page);

    const terms = await page.goto(marketingUrl("/terms"), {
      waitUntil: "load",
    });
    expect(terms?.status()).toBe(200);
    await expectOneH1(page, "Terms & Conditions");
    await expect(page.getByRole("note")).toHaveCount(0);
    await expect(
      page.getByText("Pedro Joaquin Palacios", { exact: false }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "admin@riveraftercare.com.au" }).first()
    ).toHaveAttribute("href", "mailto:admin@riveraftercare.com.au");
    await expect(page.locator("time")).toHaveAttribute(
      "dateTime",
      "2026-09-19"
    );
    expect(
      await page.locator('meta[name="robots"]').getAttribute("content")
    ).toMatch(/noindex/i);
    expect(
      await page.locator('meta[name="robots"]').getAttribute("content")
    ).not.toMatch(/nofollow/i);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/terms\/?$/
    );
    await expectNoSeriousAxeViolations(page);
  });

  test("login back link returns to the marketing apex", async ({ page }) => {
    const response = await page.goto(staffUrl("/login"), { waitUntil: "load" });
    expect(response?.status()).toBe(200);
    const back = page.getByRole("link", { name: "Back to River Aftercare" });
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("href", marketingUrl("/"));
    await page.screenshot({
      path: "test-results/artifacts/trust-login-back-link.png",
    });
    await expectNoSeriousAxeViolations(page);
    await back.click();
    await expect(page).toHaveURL(marketingUrl("/"));
    await expectOneH1(page, "Aftercare that still feels like your clinic.");
  });

  test("contact submit uses the canonical primary button treatment", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    const canonical = page
      .getByRole("link", { name: "View the dental demo" })
      .first();
    await expect(canonical).toBeVisible();
    await page.mouse.move(0, 0);
    const restCanonical = await readPrimaryCtaStyles(canonical);
    await canonical.hover();
    const hoverCanonical = await readPrimaryCtaStyles(canonical);
    await canonical.focus();
    const focusCanonical = await readPrimaryCtaStyles(canonical);
    await canonical.screenshot({
      path: "test-results/artifacts/trust-homepage-primary-cta.png",
    });

    await page.goto(marketingUrl("/contact"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    const submit = page.getByRole("button", { name: "Send enquiry" });
    await expect(submit).toBeVisible();
    await page.mouse.move(0, 0);
    const rest = await readPrimaryCtaStyles(submit);
    expect(await submit.getAttribute("class")).toMatch(/button/);
    expect(await submit.getAttribute("class")).toMatch(/primary/);
    expect(rest).toEqual(restCanonical);

    await submit.screenshot({
      path: "test-results/artifacts/trust-contact-submit-normal.png",
    });
    await submit.hover();
    expect(await readPrimaryCtaStyles(submit)).toEqual(hoverCanonical);
    await submit.screenshot({
      path: "test-results/artifacts/trust-contact-submit-hover.png",
    });
    await submit.focus();
    expect(await readPrimaryCtaStyles(submit)).toEqual(focusCanonical);
    await submit.screenshot({
      path: "test-results/artifacts/trust-contact-submit-focus.png",
    });
  });

  test("captures numbered lists, mockups, legal pages, and footer", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");

    await page.locator('[aria-labelledby="problem-heading"]').screenshot({
      path: "test-results/artifacts/trust-numbered-problem-1440.png",
    });
    const phoneScreen = page.locator('[class*="phoneScreen"]').first();
    const lightPhone = await phoneScreen.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    );
    expect(lightPhone).toMatch(/rgb\(\s*255,\s*255,\s*255/);
    await page.locator('[class*="deviceStage"]').screenshot({
      path: "test-results/artifacts/trust-phone-1440-light.png",
    });
    await page.locator('[data-mk-patient-surface="phone"]').screenshot({
      path: "test-results/artifacts/trust-patient-view-1440-light.png",
    });
    await page.locator("footer").screenshot({
      path: "test-results/artifacts/trust-footer-1440.png",
    });

    await showMarketingScheme(page, "dark");
    const darkPhone = await phoneScreen.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    );
    expect(darkPhone).not.toMatch(/rgb\(\s*255,\s*255,\s*255/);
    await page.locator('[class*="deviceStage"]').screenshot({
      path: "test-results/artifacts/trust-phone-1440-dark.png",
    });
    await page.locator('[data-mk-patient-surface="phone"]').screenshot({
      path: "test-results/artifacts/trust-patient-view-1440-dark.png",
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await showMarketingScheme(page, "light");
    await page.locator('[aria-labelledby="problem-heading"]').screenshot({
      path: "test-results/artifacts/trust-numbered-problem-390.png",
    });
    await page.locator("footer").screenshot({
      path: "test-results/artifacts/trust-footer-390.png",
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/pricing"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await page.locator('[aria-labelledby="onboarding-heading"]').screenshot({
      path: "test-results/artifacts/trust-onboarding-1440.png",
    });
    await page.locator('[aria-labelledby="notes-heading"]').screenshot({
      path: "test-results/artifacts/trust-pricing-notes-1440.png",
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[aria-labelledby="onboarding-heading"]').screenshot({
      path: "test-results/artifacts/trust-onboarding-390.png",
    });
    await page.locator('[aria-labelledby="notes-heading"]').screenshot({
      path: "test-results/artifacts/trust-pricing-notes-390.png",
    });

    for (const scheme of ["light", "dark"] as const) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(marketingUrl("/privacy"), { waitUntil: "load" });
      await showMarketingScheme(page, scheme);
      await page.screenshot({
        path: `test-results/artifacts/trust-privacy-1440-${scheme}.png`,
        fullPage: true,
      });
      await page.goto(marketingUrl("/terms"), { waitUntil: "load" });
      await showMarketingScheme(page, scheme);
      await page.screenshot({
        path: `test-results/artifacts/trust-terms-1440-${scheme}.png`,
        fullPage: true,
      });
    }
  });

  test("about, legal, and public nav follow the inner-page spacing contract", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/contact"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    const contactPad = await page
      .locator('[data-mk-chapter="soft"] > :first-child')
      .evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).paddingTop)
      );

    await page.goto(marketingUrl("/about"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await expectOneH1(page, "Aftercare should feel like part of the care.");
    const aboutPad = await page
      .locator('[data-mk-chapter="soft"]')
      .first()
      .locator(":scope > :first-child")
      .evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).paddingTop)
      );
    expect(aboutPad).toBe(contactPad);
    const notChapterPad = await page
      .locator('[data-mk-chapter="soft"]')
      .nth(1)
      .locator(":scope > :first-child")
      .evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).paddingTop)
      );
    expect(notChapterPad).toBeGreaterThanOrEqual(64);
    await page.screenshot({
      path: "test-results/artifacts/public-about-1440.png",
      fullPage: true,
    });
    await page.getByRole("navigation", { name: "Marketing" }).screenshot({
      path: "test-results/artifacts/public-header-1440.png",
    });
    await page.locator("footer").scrollIntoViewIfNeeded();
    await page.locator("footer").screenshot({
      path: "test-results/artifacts/public-footer-1440.png",
    });
    await expectNoSeriousAxeViolations(page);
    await showMarketingScheme(page, "dark");
    await expectNoSeriousAxeViolations(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await showMarketingScheme(page, "light");
    await page.screenshot({
      path: "test-results/artifacts/public-about-390.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Site menu" }).click();
    await page.getByRole("navigation", { name: "Marketing" }).screenshot({
      path: "test-results/artifacts/public-header-390.png",
    });
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 1440, height: 900 });
    for (const pathname of ["/privacy", "/terms"] as const) {
      await page.goto(marketingUrl(pathname), { waitUntil: "load" });
      await showMarketingScheme(page, "light");
      const legalPad = await page
        .locator('[data-mk-chapter="soft"] > :first-child')
        .evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).paddingTop)
        );
      expect(legalPad).toBe(contactPad);
      const measure = await page
        .locator('[class*="legalCopy"]')
        .first()
        .evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).maxWidth)
        );
      expect(measure).toBe(42 * 16);
      await page
        .locator('[data-mk-page-hero="legal"]')
        .evaluate((element) => element.scrollIntoView());
      await expect(page.locator('[class*="legalBanner"]')).toHaveCount(0);
      await page.locator('[class*="legalUpdated"]').screenshot({
        path: `test-results/artifacts/public-${pathname.slice(1)}-updated-1440.png`,
      });
      await expectNoSeriousAxeViolations(page);
      await showMarketingScheme(page, "dark");
      await expectNoSeriousAxeViolations(page);
    }

    await page.goto(marketingUrl("/contact"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await expectNoSeriousAxeViolations(page);
    await showMarketingScheme(page, "dark");
    await expectNoSeriousAxeViolations(page);
  });

  test("marketing trust surfaces do not overflow across launch viewports", async ({
    page,
  }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      for (const pathname of [
        "/",
        "/about",
        "/pricing",
        "/contact",
        "/privacy",
        "/terms",
      ] as const) {
        await page.goto(marketingUrl(pathname), { waitUntil: "load" });
        await showMarketingScheme(page, "light");
        await expectNoHorizontalOverflow(page);
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(staffUrl("/login"), { waitUntil: "load" });
    await expectNoHorizontalOverflow(page);
  });
});
