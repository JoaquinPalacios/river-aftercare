import { expect, test, type Page } from "@playwright/test";

import { expectNoHorizontalOverflow } from "./helpers/layout";
import { marketingUrl } from "./helpers/origins";

async function showMarketingScheme(
  page: Page,
  scheme: "light" | "dark"
): Promise<void> {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await page.evaluate((mode) => {
    document.documentElement.setAttribute("data-theme-mode", mode);
    document.documentElement.setAttribute("data-mk-motion", "reduce");
  }, scheme);
}

async function bandBox(page: Page, labelledBy: string) {
  return page
    .locator(`[aria-labelledby="${labelledBy}"]`)
    .evaluate((element) => {
      const styles = getComputedStyle(element);
      const inner = element.querySelector('[class*="inner"]') ?? element;
      const next = element.nextElementSibling;
      const nextInner =
        next instanceof HTMLElement
          ? (next.querySelector('[class*="inner"]') ?? next)
          : null;
      const contentGap =
        nextInner instanceof HTMLElement
          ? nextInner.getBoundingClientRect().top -
            inner.getBoundingClientRect().bottom
          : null;
      return {
        paddingTop: Number.parseFloat(styles.paddingTop),
        paddingBottom: Number.parseFloat(styles.paddingBottom),
        marginTop: Number.parseFloat(styles.marginTop),
        marginBottom: Number.parseFloat(styles.marginBottom),
        nextPaddingTop:
          next instanceof HTMLElement
            ? Number.parseFloat(getComputedStyle(next).paddingTop)
            : null,
        contentGap,
      };
    });
}

test.describe("marketing content spacing", () => {
  test("desktop rhythm, homepage exception, and protected CTA", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");

    const problem = await bandBox(page, "problem-heading");
    const brand = await bandBox(page, "brand-heading");
    const clinicTypes = await bandBox(page, "clinic-types-heading");
    const closing = await bandBox(page, "closing-heading");

    expect(problem.paddingTop).toBeCloseTo(128, 0);
    expect(problem.contentGap).toBeCloseTo(128, 0);
    expect(problem.nextPaddingTop).toBe(0);
    expect(brand.paddingTop).toBe(0);
    expect(brand.paddingBottom).toBeCloseTo(112, 0);
    expect(clinicTypes.paddingTop).toBeCloseTo(112, 0);
    expect(clinicTypes.paddingBottom).toBeCloseTo(112, 0);
    expect(closing.paddingTop).toBeCloseTo(96, 0);
    expect(closing.paddingBottom).toBeCloseTo(40, 0);

    await page.goto(marketingUrl("/pricing"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    const plans = await bandBox(page, "plans-heading");
    const onboarding = await bandBox(page, "onboarding-heading");
    const notes = await bandBox(page, "notes-heading");
    const pricingHero = await page
      .locator('[data-mk-page-hero="pricing"]')
      .evaluate((element) => {
        const inner = element.querySelector('[class*="pageHeroInner"]');
        return {
          paddingTop: Number.parseFloat(getComputedStyle(element).paddingTop),
          innerBottom:
            inner instanceof HTMLElement
              ? Number.parseFloat(getComputedStyle(inner).paddingBottom)
              : null,
        };
      });

    expect(pricingHero.paddingTop).toBeGreaterThan(64);
    expect(pricingHero.innerBottom).toBeCloseTo(64, 0);
    expect(plans.paddingTop).toBeCloseTo(112, 0);
    expect(plans.contentGap).toBeCloseTo(112, 0);
    expect(plans.nextPaddingTop).toBe(0);
    expect(onboarding.paddingBottom).toBeCloseTo(112, 0);
    expect(notes.paddingTop).toBeCloseTo(112, 0);
    expect(notes.paddingBottom).toBeCloseTo(112, 0);
    expect((await bandBox(page, "pricing-closing")).paddingTop).toBeCloseTo(
      96,
      0
    );

    await page.goto(marketingUrl("/about"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    const editorialGap = await page.evaluate(() => {
      const sections = [
        ...document.querySelectorAll('[class*="aboutEditorial"]'),
      ];
      if (sections.length < 2) return null;
      return (
        sections[1].getBoundingClientRect().top -
        sections[0].getBoundingClientRect().bottom
      );
    });
    expect(editorialGap).toBeCloseTo(112, 0);
    const ownership = await bandBox(page, "about-ownership");
    expect(ownership.paddingTop).toBeCloseTo(112, 0);
    expect(ownership.paddingBottom).toBeCloseTo(112, 0);

    await page.goto(marketingUrl("/clinics"), { waitUntil: "load" });
    await showMarketingScheme(page, "dark");
    const foundation = await bandBox(page, "clinics-foundation");
    expect(foundation.paddingTop).toBeCloseTo(112, 0);
    expect(foundation.contentGap).toBeCloseTo(112, 0);
    expect(foundation.nextPaddingTop).toBe(0);
    const discoveryBg = await page
      .locator("#clinic-types")
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    const foundationBg = await page
      .locator('[aria-labelledby="clinics-foundation"]')
      .evaluate((element) => {
        const parent = element.parentElement;
        return parent ? getComputedStyle(parent).backgroundColor : "";
      });
    expect(discoveryBg).not.toBe(foundationBg);

    await page.goto(marketingUrl("/dental"), { waitUntil: "load" });
    await showMarketingScheme(page, "dark");
    const dentalBands = await page.evaluate(() =>
      [...document.querySelectorAll("main > section")]
        .filter(
          (section) =>
            !section.hasAttribute("data-mk-vertical-hero") &&
            !section.closest('[data-mk-chapter="closing"]')
        )
        .map((section) => {
          const styles = getComputedStyle(section);
          return {
            background: styles.backgroundColor,
            paddingTop: Number.parseFloat(styles.paddingTop),
            paddingBottom: Number.parseFloat(styles.paddingBottom),
          };
        })
    );
    expect(dentalBands.length).toBeGreaterThan(3);
    expect(
      new Set(dentalBands.map((band) => band.background)).size
    ).toBeGreaterThan(1);
    for (const band of dentalBands) {
      expect(band.paddingTop).toBeCloseTo(112, 0);
      expect(band.paddingBottom).toBeCloseTo(112, 0);
    }
    expect((await bandBox(page, "dental-cta")).paddingTop).toBeCloseTo(96, 0);
    await expectNoHorizontalOverflow(page);
  });

  test("mobile edges, first-after-hero precedence, and CTA top", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");

    const problem = await bandBox(page, "problem-heading");
    const brand = await bandBox(page, "brand-heading");
    const clinicTypes = await bandBox(page, "clinic-types-heading");
    expect(problem.paddingTop).toBeCloseTo(56, 0);
    expect(problem.contentGap).toBeCloseTo(56, 0);
    expect(brand.paddingTop).toBe(0);
    expect(brand.paddingBottom).toBeCloseTo(64, 0);
    expect(clinicTypes.paddingTop).toBeCloseTo(56, 0);
    expect(clinicTypes.paddingBottom).toBeCloseTo(56, 0);
    expect((await bandBox(page, "closing-heading")).paddingTop).toBeCloseTo(
      64,
      0
    );

    await page.goto(marketingUrl("/clinics"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    const heroTop = await page
      .locator("[data-mk-clinics-hub]")
      .evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).paddingTop)
      );
    expect(heroTop).toBeCloseTo(48, 0);
    const platform = await bandBox(page, "clinics-platform");
    const foundation = await bandBox(page, "clinics-foundation");
    const other = await bandBox(page, "clinics-other");
    expect(platform.paddingTop).toBeCloseTo(56, 0);
    expect(platform.paddingBottom).toBeCloseTo(56, 0);
    expect(foundation.paddingTop).toBeCloseTo(64, 0);
    expect(foundation.contentGap).toBeCloseTo(56, 0);
    expect(other.paddingBottom).toBeCloseTo(64, 0);
    expect((await bandBox(page, "clinics-cta")).paddingTop).toBeCloseTo(64, 0);

    await page.goto(marketingUrl("/about"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    const aboutHero = await page
      .locator('[data-mk-page-hero="about"]')
      .evaluate((element) => {
        const inner = element.querySelector('[class*="pageHeroInner"]');
        return {
          paddingTop: Number.parseFloat(getComputedStyle(element).paddingTop),
          innerBottom:
            inner instanceof HTMLElement
              ? Number.parseFloat(getComputedStyle(inner).paddingBottom)
              : null,
        };
      });
    expect(aboutHero.paddingTop).toBeCloseTo(48, 0);
    expect(aboutHero.innerBottom).toBeGreaterThan(60);
    expect(aboutHero.innerBottom).toBeLessThan(64);
    const editorialGap = await page.evaluate(() => {
      const sections = [
        ...document.querySelectorAll('[class*="aboutEditorial"]'),
      ];
      return (
        sections[1].getBoundingClientRect().top -
        sections[0].getBoundingClientRect().bottom
      );
    });
    expect(editorialGap).toBeCloseTo(56, 0);
    await expectNoHorizontalOverflow(page);
  });

  test("tablet keeps the previous chapter scale", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    const problem = await bandBox(page, "problem-heading");
    const brand = await bandBox(page, "brand-heading");
    expect(problem.paddingTop).toBeCloseTo(96, 0);
    expect(problem.contentGap).toBeCloseTo(128, 0);
    expect(brand.paddingBottom).toBeCloseTo(96, 0);
    expect((await bandBox(page, "closing-heading")).paddingTop).toBeCloseTo(
      96,
      0
    );
  });
});
