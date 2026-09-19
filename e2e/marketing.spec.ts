import { expect, test, type Page } from "@playwright/test";

import { expectOneH1 } from "./helpers/assertions";
import {
  expectNoHorizontalOverflow,
  relativeLuminance,
} from "./helpers/layout";
import { DEMO_TENANT_SLUG, marketingUrl, tenantUrl } from "./helpers/origins";

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

async function waitForHeroReveal(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        if (
          document.documentElement.getAttribute("data-mk-motion") !== "enhance"
        ) {
          return true;
        }

        const reveals = [
          ...document.querySelectorAll<HTMLElement>(
            '[data-mk-chapter="hero"] .mkReveal'
          ),
        ];
        return (
          reveals.length > 0 &&
          reveals.every((element) => getComputedStyle(element).opacity === "1")
        );
      })
    )
    .toBe(true);
  await waitForPhoneFrame(page);
}

async function showMarketingScheme(
  page: Page,
  scheme: "light" | "dark"
): Promise<void> {
  await page.emulateMedia({ colorScheme: scheme });
  await page.evaluate((mode) => {
    try {
      window.localStorage.setItem("aftercare-guide-marketing-theme", mode);
    } catch {
      // Ignore storage failures in restricted contexts.
    }
    document.documentElement.setAttribute("data-theme-mode", mode);
  }, scheme);
}

test.describe("marketing homepage", () => {
  test("presents the product and links to the demo tenant", async ({
    page,
  }) => {
    const response = await page.goto(marketingUrl("/"), { waitUntil: "load" });
    expect(response?.status()).toBe(200);
    expect(page.url()).toBe(marketingUrl("/"));
    expect(page.url()).not.toContain("/_marketing");
    await expectOneH1(page, "Aftercare that still feels like your clinic.");
    await expect(
      page.getByText("Patient aftercare for clinics and practices").first()
    ).toBeVisible();
    await expect(
      page.getByText(
        "No login, no feed — just the guidance patients need, with the clinic still one tap away."
      )
    ).toBeVisible();
    await expect(
      page
        .getByRole("contentinfo")
        .getByText("River Aftercare", { exact: true })
    ).toBeVisible();
    await page
      .getByRole("heading", {
        name: "From clinic-approved guidance to a page patients keep",
      })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("heading", {
        name: "From clinic-approved guidance to a page patients keep",
      })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Prepare the right guidance" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View the dental demo" }).first()
    ).toHaveAttribute("href", tenantUrl(DEMO_TENANT_SLUG, "/"));
    await expect(
      page.getByRole("heading", { name: "Internal staff workspace" })
    ).toHaveCount(0);
    await page.screenshot({
      path: "test-results/artifacts/marketing-home-desktop.png",
      fullPage: true,
    });
  });

  test("captures light and dark marketing screenshots", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await waitForHeroReveal(page);
    await page.screenshot({
      path: "test-results/artifacts/marketing-home-desktop-light.png",
      fullPage: true,
    });

    await showMarketingScheme(page, "dark");
    await waitForHeroReveal(page);
    await page.screenshot({
      path: "test-results/artifacts/marketing-home-desktop-dark.png",
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await showMarketingScheme(page, "light");
    await waitForHeroReveal(page);
    await page.screenshot({
      path: "test-results/artifacts/marketing-home-mobile-light.png",
      fullPage: true,
    });

    await showMarketingScheme(page, "dark");
    await waitForHeroReveal(page);
    await page.screenshot({
      path: "test-results/artifacts/marketing-home-mobile-dark.png",
      fullPage: true,
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await showMarketingScheme(page, "light");
    await waitForHeroReveal(page);
    await page.screenshot({
      path: "test-results/artifacts/marketing-home-1280-light.png",
      fullPage: true,
    });

    await showMarketingScheme(page, "dark");
    await waitForHeroReveal(page);
    await page.screenshot({
      path: "test-results/artifacts/marketing-home-1280-dark.png",
      fullPage: true,
    });
  });

  test("composes a centered premium hero with a single phone product proof", async ({
    page,
  }) => {
    const shots = [
      { width: 1440, height: 900, scheme: "light" },
      { width: 1440, height: 900, scheme: "dark" },
      { width: 1280, height: 800, scheme: "light" },
      { width: 1280, height: 800, scheme: "dark" },
      { width: 390, height: 844, scheme: "light" },
      { width: 390, height: 844, scheme: "dark" },
      { width: 360, height: 800, scheme: "light" },
    ] as const;

    for (const shot of shots) {
      await page.setViewportSize({ width: shot.width, height: shot.height });
      await page.goto(marketingUrl("/"), { waitUntil: "load" });
      await showMarketingScheme(page, shot.scheme);
      await waitForHeroReveal(page);

      const hero = page.locator('[data-mk-chapter="hero"]');
      const colors = await hero.evaluate((element) => {
        const styles = getComputedStyle(element);
        const canvas =
          styles.backgroundColor === "rgba(0, 0, 0, 0)" ||
          styles.backgroundColor === "transparent"
            ? getComputedStyle(document.body).backgroundColor
            : styles.backgroundColor;
        return { color: styles.color, background: canvas };
      });
      const ink = relativeLuminance(colors.color);
      const canvas = relativeLuminance(colors.background);

      if (shot.scheme === "light") {
        expect(ink, `${shot.scheme} hero ink`).toBeLessThan(0.35);
        expect(canvas, `${shot.scheme} hero canvas`).toBeGreaterThan(0.85);
      } else {
        expect(ink, `${shot.scheme} hero ink`).toBeGreaterThan(0.7);
        expect(canvas, `${shot.scheme} hero canvas`).toBeLessThan(0.15);
      }

      await expect(hero.locator('[class*="deviceProof"]')).not.toHaveAttribute(
        "aria-hidden",
        "true"
      );
      await expect(hero.locator('[class*="deviceStage"]')).not.toHaveAttribute(
        "aria-hidden",
        "true"
      );
      await expect(hero.locator('[class*="phoneShell"]')).toHaveAttribute(
        "aria-hidden",
        "true"
      );
      await expect(
        hero.getByRole("radiogroup", { name: "Recovery view" })
      ).toHaveCount(0);
      await expect(hero.getByRole("radio", { name: "Today" })).toHaveCount(0);
      await expect(hero.locator("#mk-phone-today")).toBeChecked();
      if (shot.width < 1024) {
        await expect(hero.getByText("Patient aftercare view")).toBeVisible();
        await expect(hero.getByText("No app to install")).toBeVisible();
      }
      await expect(hero.locator('[class*="desktopPreview"]')).toHaveCount(0);
      await expect(hero.locator('[class*="phoneBezel"]')).toHaveCount(0);
      await expect(hero.locator('[class*="phoneFrame"]')).toHaveAttribute(
        "src",
        "/marketing/iphone-frame.webp"
      );
      await expect(
        hero.locator('[class*="deviceStage"]').getByText("Coming next")
      ).toBeVisible();
      await expect(
        hero.locator('[class*="deviceStage"]').getByText("Tooth Extraction")
      ).toBeVisible();
      await expect(
        hero
          .locator('[class*="deviceStage"]')
          .getByText("Step-by-step guidance after treatment.")
      ).toHaveCount(0);
      await expect(
        hero.locator('[class*="phoneTodayPane"]').getByText("Immediate care", {
          exact: true,
        })
      ).toBeVisible();
      await expect(
        hero.locator('[class*="phoneTodayPane"]').getByText("Healing check")
      ).toBeVisible();
      await expect(
        hero
          .locator("[data-mk-phone-coming-next]")
          .getByText("Swelling often peaks, then eases.")
      ).toBeVisible();
      await expect(
        hero
          .locator("[data-mk-phone-coming-next]")
          .getByText("Discomfort should continue to settle.")
      ).toBeVisible();
      await expect(
        hero.locator('[class*="deviceStage"]').getByText("Need help?")
      ).toHaveCount(0);
      await expect(
        hero
          .locator('[class*="deviceStage"]')
          .getByText("Questions about your recovery?")
      ).toBeVisible();
      await expect(
        hero
          .locator('[class*="deviceStage"]')
          .getByText("Call Riverside Dental Demo")
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Call Riverside Dental Demo" })
      ).toHaveCount(0);
      await expect(
        hero.locator('[class*="deviceStage"]').getByText(/book/i)
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Tooth Extraction" })
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "Tooth Extraction" })
      ).toHaveCount(0);

      const primary = page
        .getByRole("link", { name: "View the dental demo" })
        .first();
      const primaryBg = await primary.evaluate(
        (element) => getComputedStyle(element).backgroundColor
      );
      expect(primaryBg).not.toMatch(/rgb\(\s*15\s*,\s*118\s*,\s*110/);

      if (shot.width === 1440 && shot.scheme === "light") {
        const desktopRhythm = await page.evaluate(() => {
          const heading = document.getElementById("marketing-hero");
          const section = heading?.closest("section");
          const header = document.querySelector("header");
          const eyebrow = section?.querySelector('[class*="heroEyebrow"]');
          const lower = section?.querySelector('[class*="heroLower"]');
          const phone = section?.querySelector('[class*="phoneShell"]');
          const wave = document.querySelector(".mkWave");
          if (!heading || !section || !header || !eyebrow || !lower || !phone) {
            return null;
          }
          const headerBox = header.getBoundingClientRect();
          const eyebrowBox = eyebrow.getBoundingClientRect();
          const headingBox = heading.getBoundingClientRect();
          const lowerBox = lower.getBoundingClientRect();
          const sectionBox = section.getBoundingClientRect();
          const phoneBox = phone.getBoundingClientRect();
          const waveBox = wave?.getBoundingClientRect();
          return {
            navbarToEyebrow: Math.round(eyebrowBox.top - headerBox.bottom),
            eyebrowToHeading: Math.round(headingBox.top - eyebrowBox.bottom),
            headingToLower: Math.round(lowerBox.top - headingBox.bottom),
            heroHeight: Math.round(sectionBox.height),
            heroBottom: Math.round(sectionBox.bottom),
            viewport: window.innerHeight,
            phoneWidth: Math.round(phoneBox.width),
            phoneBottom: Math.round(phoneBox.bottom),
            phoneTop: Math.round(phoneBox.top),
            waveTop: waveBox ? Math.round(waveBox.top) : 0,
            separatorClearance: waveBox
              ? Math.round(waveBox.top - phoneBox.bottom)
              : 0,
          };
        });

        expect(desktopRhythm).not.toBeNull();
        expect(desktopRhythm!.navbarToEyebrow).toBeGreaterThanOrEqual(72);
        expect(desktopRhythm!.navbarToEyebrow).toBeLessThanOrEqual(110);
        expect(desktopRhythm!.eyebrowToHeading).toBeGreaterThanOrEqual(18);
        expect(desktopRhythm!.eyebrowToHeading).toBeLessThanOrEqual(36);
        expect(desktopRhythm!.headingToLower).toBeGreaterThanOrEqual(52);
        expect(desktopRhythm!.headingToLower).toBeLessThanOrEqual(96);
        expect(desktopRhythm!.phoneWidth).toBeGreaterThanOrEqual(220);
        expect(desktopRhythm!.phoneWidth).toBeLessThanOrEqual(320);
        expect(desktopRhythm!.separatorClearance).toBeGreaterThanOrEqual(16);
        expect(desktopRhythm!.waveTop).toBeLessThan(desktopRhythm!.viewport);
        expect(desktopRhythm!.phoneBottom).toBeLessThan(
          desktopRhythm!.heroBottom - 8
        );
      }

      const phoneCanvas = await hero
        .locator('[class*="phoneScreen"]')
        .evaluate((element) => getComputedStyle(element).backgroundColor);
      const phoneLuminance = relativeLuminance(phoneCanvas);
      if (shot.scheme === "light") {
        expect(phoneCanvas, `${shot.scheme} phone canvas`).toMatch(
          /rgb\(\s*255,\s*255,\s*255/
        );
        expect(
          phoneLuminance,
          `${shot.scheme} phone luminance`
        ).toBeGreaterThan(0.9);
      } else {
        expect(phoneCanvas, `${shot.scheme} phone canvas`).not.toMatch(
          /rgb\(\s*255,\s*255,\s*255/
        );
        expect(phoneLuminance, `${shot.scheme} phone luminance`).toBeLessThan(
          0.15
        );
      }

      await page.screenshot({
        path: `test-results/artifacts/phase-1f9-hero-${shot.width}-${shot.scheme}.png`,
      });
      await expectNoHorizontalOverflow(page);
    }

    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: "light" });
    await page.reload({ waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await waitForHeroReveal(page);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: "test-results/artifacts/phase-1f9-hero-360-light.png",
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.reload({ waitUntil: "load" });
    await waitForHeroReveal(page);
    const composition = await page.evaluate(() => {
      const heading = document.getElementById("marketing-hero");
      const section = heading?.closest("section");
      const header = document.querySelector("header");
      const inner = section?.querySelector('[class*="inner"]');
      const titleBlock = section?.querySelector('[class*="heroTitleBlock"]');
      const eyebrow = section?.querySelector('[class*="heroEyebrow"]');
      const support = section?.querySelector('[class*="heroSupport"]');
      const lower = section?.querySelector('[class*="heroLower"]');
      const stage = section?.querySelector('[class*="deviceStage"]');
      const phone = section?.querySelector('[class*="phoneShell"]');
      const wave = document.querySelector(".mkWave");
      if (
        !heading ||
        !section ||
        !header ||
        !inner ||
        !titleBlock ||
        !eyebrow ||
        !support ||
        !lower ||
        !stage ||
        !phone
      ) {
        return null;
      }

      const headingBox = heading.getBoundingClientRect();
      const sectionBox = section.getBoundingClientRect();
      const headerBox = header.getBoundingClientRect();
      const innerBox = inner.getBoundingClientRect();
      const eyebrowBox = eyebrow.getBoundingClientRect();
      const supportBox = support.getBoundingClientRect();
      const lowerBox = lower.getBoundingClientRect();
      const stageBox = stage.getBoundingClientRect();
      const phoneBox = phone.getBoundingClientRect();
      const innerCenter = innerBox.left + innerBox.width / 2;
      const waveBox = wave?.getBoundingClientRect();
      return {
        headingCentered:
          Math.abs(headingBox.left + headingBox.width / 2 - innerCenter) < 24,
        eyebrowCentered:
          Math.abs(eyebrowBox.left + eyebrowBox.width / 2 - innerCenter) < 24,
        stacked: stageBox.top - supportBox.bottom > 24,
        stageOnRight: stageBox.left > supportBox.right - 8,
        hasGradientStroke: Boolean(wave?.querySelector("linearGradient")),
        hasGlow: Boolean(wave?.querySelector("feGaussianBlur")),
        navbarToEyebrow: Math.round(eyebrowBox.top - headerBox.bottom),
        eyebrowToHeading: Math.round(headingBox.top - eyebrowBox.bottom),
        headingToLower: Math.round(lowerBox.top - headingBox.bottom),
        heroHeight: Math.round(sectionBox.height),
        heroBottom: Math.round(sectionBox.bottom),
        waveBottom: waveBox ? Math.round(waveBox.bottom) : 0,
        separatorFlush: Boolean(
          waveBox && Math.abs(waveBox.bottom - sectionBox.bottom) <= 2
        ),
        separatorInView: Boolean(
          waveBox && waveBox.top < window.innerHeight && waveBox.bottom > 0
        ),
        clipsViewport: sectionBox.bottom > window.innerHeight + 1,
        phoneWidth: Math.round(phoneBox.width),
        phoneBottom: Math.round(phoneBox.bottom),
        separatorClearance: waveBox
          ? Math.round(waveBox.top - phoneBox.bottom)
          : 0,
      };
    });

    expect(composition).not.toBeNull();
    expect(composition!.headingCentered).toBe(true);
    expect(composition!.eyebrowCentered).toBe(true);
    expect(composition!.stacked).toBe(false);
    expect(composition!.stageOnRight).toBe(true);
    expect(composition!.hasGradientStroke).toBe(true);
    expect(composition!.hasGlow).toBe(true);
    expect(composition!.separatorFlush).toBe(true);
    expect(composition!.navbarToEyebrow).toBeGreaterThanOrEqual(64);
    expect(composition!.eyebrowToHeading).toBeGreaterThanOrEqual(16);
    expect(composition!.headingToLower).toBeGreaterThanOrEqual(48);
    expect(composition!.phoneWidth).toBeGreaterThanOrEqual(200);
    expect(composition!.phoneWidth).toBeLessThanOrEqual(320);
    expect(composition!.separatorClearance).toBeGreaterThanOrEqual(12);
    expect(composition!.phoneBottom).toBeLessThan(composition!.heroBottom - 8);
  });

  test("reveals sections on scroll without breaking anchors or overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await page.screenshot({
      path: "test-results/artifacts/marketing-hero-static-light.png",
    });

    await page.locator("#how-it-works").scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("heading", {
        name: "From clinic-approved guidance to a page patients keep",
      })
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/marketing-mid-scroll-light.png",
    });

    await page.locator("#preview").scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("heading", {
        name: "See what patients actually receive",
      })
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/marketing-showcase-light.png",
    });

    await page.locator("#see-it").scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("heading", {
        name: "Bring your aftercare online.",
      })
    ).toBeVisible();
    await expect(page.getByText("Get started")).toBeVisible();
    await expect(page.getByText("Early access")).toHaveCount(0);

    const overflow = await page.evaluate(() => {
      return (
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
      );
    });
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("keeps marketing copy readable when reduced motion is requested", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await expectOneH1(page, "Aftercare that still feels like your clinic.");
    await expect(
      page.getByText("Patient aftercare for clinics and practices").first()
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "From clinic-approved guidance to a page patients keep",
      })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Your clinic stays visible after the appointment.",
      })
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "data-mk-motion",
      "reduce"
    );

    const trigger = page.getByRole("button", { name: /Change colour theme/ });
    await trigger.click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-mode",
      "dark"
    );

    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    await page.reload({ waitUntil: "load" });
    const primary = page
      .getByRole("link", { name: "View the dental demo" })
      .first();
    await primary.hover();
    const reducedHover = await primary.evaluate(
      (element) => getComputedStyle(element).transform
    );
    expect(reducedHover).toBe("none");
  });

  test("marketing CTAs, nav, and theme control expose hover, focus, and active states", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await waitForHeroReveal(page);

    const primary = page
      .getByRole("link", { name: "View the dental demo" })
      .first();
    const secondary = page
      .getByRole("link", { name: "See how it works" })
      .first();
    const theme = page.getByRole("button", { name: /Change colour theme/ });
    const pricing = page
      .getByRole("navigation", { name: "Marketing" })
      .getByRole("link", { name: "Pricing" });

    const restPrimary = await primary.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        transform: styles.transform,
        boxShadow: styles.boxShadow,
        background: styles.backgroundColor,
      };
    });

    await primary.hover();
    await expect
      .poll(async () =>
        primary.evaluate((element) => getComputedStyle(element).backgroundColor)
      )
      .not.toBe(restPrimary.background);
    const hoverPrimary = await primary.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        transform: styles.transform,
        boxShadow: styles.boxShadow,
        background: styles.backgroundColor,
      };
    });
    expect(
      hoverPrimary.transform === "none" ||
        hoverPrimary.transform === "matrix(1, 0, 0, 1, 0, 0)"
    ).toBe(true);
    expect(hoverPrimary.background).not.toBe(restPrimary.background);
    await page.screenshot({
      path: "test-results/artifacts/phase-1f7-primary-hover.png",
    });

    await secondary.hover();
    await expect
      .poll(async () =>
        secondary.evaluate(
          (element) => getComputedStyle(element).backgroundColor
        )
      )
      .not.toBe("rgba(0, 0, 0, 0)");
    const hoverSecondary = await secondary.evaluate(
      (element) => getComputedStyle(element).transform
    );
    expect(
      hoverSecondary === "none" || hoverSecondary === "matrix(1, 0, 0, 1, 0, 0)"
    ).toBe(true);
    await page.screenshot({
      path: "test-results/artifacts/phase-1f13-secondary-hover-hero.png",
    });

    const navRestColor = await pricing.evaluate(
      (element) => getComputedStyle(element).color
    );
    await pricing.hover();
    await expect
      .poll(async () =>
        pricing.evaluate((element) => getComputedStyle(element).color)
      )
      .not.toBe(navRestColor);

    const focusedNames: string[] = [];
    await page.locator("body").click({ position: { x: 8, y: 8 } });
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press("Tab");
      const label = await page.evaluate(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) {
          return "";
        }
        return (
          active.getAttribute("aria-label") ||
          active.textContent?.trim().slice(0, 48) ||
          active.tagName
        );
      });
      if (label) {
        focusedNames.push(label);
      }
      const focusedControl = await page.evaluate(() => {
        const active = document.activeElement;
        return (
          active instanceof HTMLAnchorElement ||
          active instanceof HTMLButtonElement
        );
      });
      if (focusedControl) {
        const outline = await page.evaluate(() => {
          const active = document.activeElement;
          if (!(active instanceof HTMLElement)) {
            return 0;
          }
          return Number.parseFloat(getComputedStyle(active).outlineWidth);
        });
        expect(outline, `focus outline for ${label}`).toBeGreaterThanOrEqual(2);
      }
    }

    expect(focusedNames.join(" ")).toMatch(/Pricing/);
    expect(focusedNames.join(" ")).toMatch(/View the dental demo/);
    expect(focusedNames.join(" ")).toMatch(/See how it works|Change colour/);

    await primary.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    const primaryFocus = await primary.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        outlineWidth: Number.parseFloat(styles.outlineWidth),
        outlineStyle: styles.outlineStyle,
        isActive: document.activeElement === element,
      };
    });
    expect(primaryFocus.isActive).toBe(true);
    expect(primaryFocus.outlineStyle).not.toBe("none");
    expect(primaryFocus.outlineWidth).toBeGreaterThanOrEqual(2);
    await page.screenshot({
      path: "test-results/artifacts/phase-1f7-primary-focus.png",
    });

    await theme.focus();
    const themeFocus = await theme.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).outlineWidth)
    );
    expect(themeFocus).toBeGreaterThanOrEqual(2);
    await page.screenshot({
      path: "test-results/artifacts/phase-1f7-theme-focus.png",
    });
  });

  test("simplifies mobile marketing navigation and keeps desktop anchors", async ({
    page,
  }) => {
    const headerNav = page.getByRole("navigation", { name: "Marketing" });
    const footerNav = page.getByRole("navigation", { name: "Footer" });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await waitForHeroReveal(page);

    await expect(headerNav.getByRole("link", { name: "About" })).toBeVisible();
    await expect(
      headerNav.getByRole("link", { name: "Pricing" })
    ).toBeVisible();
    await expect(
      headerNav.getByRole("link", { name: "Contact" })
    ).toBeVisible();
    await expect(
      headerNav.getByRole("link", { name: "How it works" })
    ).toHaveCount(0);
    await expect(
      headerNav.getByRole("link", { name: "Clinic preview" })
    ).toHaveCount(0);
    await expect(
      headerNav.getByRole("link", { name: "Early access" })
    ).toHaveCount(0);
    await expect(
      headerNav.getByRole("link", { name: "Sign in", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Change colour theme/ })
    ).toBeVisible();

    const desktopBand = page
      .locator('[data-mk-chapter="soft"] > section')
      .first();
    const desktopPadding = await desktopBand.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).paddingTop)
    );
    expect(desktopPadding).toBeGreaterThanOrEqual(96);

    await page
      .locator('[aria-labelledby="why-heading"]')
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "test-results/artifacts/phase-1f9-sections-1440-light.png",
      fullPage: true,
    });

    for (const width of [390, 360] as const) {
      await page.setViewportSize({ width, height: 844 });
      await page.reload({ waitUntil: "load" });
      await page.evaluate(() => window.scrollTo(0, 0));
      await showMarketingScheme(page, "light");
      await waitForHeroReveal(page);

      await expect(
        headerNav.getByRole("link", { name: "How it works" })
      ).toHaveCount(0);
      await expect(
        headerNav.getByRole("link", { name: "Clinic preview" })
      ).toHaveCount(0);
      await expect(
        headerNav.getByRole("link", { name: "Pricing" })
      ).toHaveCount(0);
      await expect(
        headerNav.getByRole("link", { name: "Contact", exact: true })
      ).toHaveCount(0);
      await expect(
        headerNav.getByRole("link", { name: "Early access" })
      ).toHaveCount(0);
      await expect(headerNav.locator('[class*="navAnchor"]')).toHaveCount(0);
      await expect(
        headerNav.getByRole("link", { name: "Sign in", exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: /Change colour theme/ })
      ).toHaveCount(0);
      await expect(
        footerNav.getByRole("link", { name: "How it works" })
      ).toHaveCount(0);
      await expect(
        footerNav.getByRole("link", { name: "Clinic preview" })
      ).toHaveCount(0);
      await expect(
        footerNav.getByRole("link", { name: "Privacy" })
      ).toBeVisible();

      const wordmark = page.getByRole("banner").getByRole("link", {
        name: "River Aftercare",
      });
      await expect(wordmark).toBeVisible();
      const wordmarkBox = await wordmark.evaluate((element) => {
        const styles = getComputedStyle(element);
        return {
          whiteSpace: styles.whiteSpace,
          height: Math.round(element.getBoundingClientRect().height),
          width: Math.round(element.getBoundingClientRect().width),
        };
      });
      expect(wordmarkBox.whiteSpace).toBe("nowrap");
      expect(wordmarkBox.height).toBeLessThanOrEqual(36);

      const staffInHeader = headerNav.getByRole("link", {
        name: "Sign in",
        exact: true,
      });
      await expect(staffInHeader).toHaveCount(0);
      const themeInHeader = page.getByRole("button", {
        name: /Change colour theme/,
      });
      await expect(themeInHeader).toHaveCount(0);

      const focusedNames: string[] = [];
      await page.locator("body").click({ position: { x: 8, y: 8 } });
      for (let index = 0; index < 8; index += 1) {
        await page.keyboard.press("Tab");
        const label = await page.evaluate(() => {
          const active = document.activeElement;
          const headerNav = document.querySelector(
            'nav[aria-label="Marketing"]'
          );
          if (!(active instanceof HTMLElement)) {
            return "";
          }
          const inHeader = Boolean(
            headerNav instanceof HTMLElement && headerNav.contains(active)
          );
          const text =
            active.getAttribute("aria-label") ||
            active.textContent?.trim().slice(0, 48) ||
            "";
          return JSON.stringify({ inHeader, text });
        });
        if (label) {
          focusedNames.push(label);
        }
      }
      const headerLabels = focusedNames
        .map(
          (entry) => JSON.parse(entry) as { inHeader: boolean; text: string }
        )
        .filter((entry) => entry.inHeader)
        .map((entry) => entry.text);
      expect(headerLabels).not.toContain("How it works");
      expect(headerLabels).not.toContain("Clinic preview");
      expect(headerLabels).not.toContain("Early access");
      expect(headerLabels.join(" ")).toMatch(/Site menu/);
      await expect(
        page.getByRole("button", { name: "Site menu" })
      ).toBeVisible();

      await page.screenshot({
        path: `test-results/artifacts/phase-1f9-header-${width}-light.png`,
      });
    }

    const mobileBand = page
      .locator('[data-mk-chapter="soft"] > section')
      .first();
    const mobilePadding = await mobileBand.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).paddingTop)
    );
    expect(mobilePadding).toBeGreaterThanOrEqual(48);
    expect(mobilePadding).toBeLessThanOrEqual(96);

    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .locator('[aria-labelledby="why-heading"]')
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "test-results/artifacts/phase-1f9-sections-390-light.png",
      fullPage: true,
    });
    await expectNoHorizontalOverflow(page);
  });
});
