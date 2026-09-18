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
  await expect(page.locator('[class*="phoneTitle"]')).toHaveText(
    "Tooth Extraction"
  );
  await expect(page.locator('[class*="phoneBrand"]')).toContainText(
    "Riverside Dental Demo"
  );
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

  test("mobile clinic rows keep independent hover and current surfaces", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(marketingUrl("/physiotherapy"), { waitUntil: "load" });
    await page.getByRole("button", { name: "Site menu" }).click();

    const nav = page.getByRole("navigation", { name: "Marketing" });
    const clinicList = nav.getByRole("list", { name: "For clinics" });
    const gap = await clinicList.evaluate((element) => {
      const style = getComputedStyle(element);
      return Number.parseFloat(style.rowGap || style.gap);
    });
    expect(gap).toBeGreaterThanOrEqual(5);
    expect(gap).toBeLessThan(10);

    const dental = nav.getByRole("link", { name: "Dental", exact: true });
    const physio = nav.getByRole("link", {
      name: "Physiotherapy",
      exact: true,
    });
    const chiro = nav.getByRole("link", { name: "Chiropractic", exact: true });
    const cosmetic = nav.getByRole("link", {
      name: "Cosmetic & aesthetic",
      exact: true,
    });

    await expect(physio).toHaveAttribute("aria-current", "page");
    await expect(dental).not.toHaveAttribute("aria-current", "page");
    await expect(chiro).not.toHaveAttribute("aria-current", "page");

    const boxes = [];
    for (const row of [dental, physio, chiro, cosmetic]) {
      const box = await row.boundingBox();
      expect(box, "clinic row should be visible").not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      boxes.push(box!);
    }

    for (let index = 0; index < boxes.length - 1; index += 1) {
      const space =
        boxes[index + 1]!.y - (boxes[index]!.y + boxes[index]!.height);
      expect(space).toBeGreaterThanOrEqual(4);
      expect(space).toBeLessThan(12);
    }

    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(chiro).toBeFocused();
    const focusVisible = await chiro.evaluate((element) =>
      element.matches(":focus-visible")
    );
    expect(focusVisible).toBe(true);
  });

  test("short-height mobile menu keeps every destination reachable", async ({
    page,
  }) => {
    const labels = [
      "Overview",
      "Dental",
      "Physiotherapy",
      "Chiropractic",
      "Cosmetic & aesthetic",
      "About",
      "Pricing",
      "Contact",
      "Sign in",
    ] as const;

    for (const viewport of [
      { width: 390, height: 667 },
      { width: 375, height: 667 },
      { width: 360, height: 640 },
      { width: 320, height: 568 },
    ] as const) {
      await page.setViewportSize(viewport);
      await page.goto(marketingUrl("/"), { waitUntil: "load" });
      await page.getByRole("button", { name: "Site menu" }).click();
      const nav = page.getByRole("navigation", { name: "Marketing" });
      const panel = page.locator("[class*='navMenuPanel']");

      const canScroll = await panel.evaluate((element) => {
        return element.scrollHeight - element.clientHeight > 1;
      });
      if (canScroll) {
        await panel.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
      }

      for (const label of labels) {
        const link = nav.getByRole("link", { name: label, exact: true });
        await link.scrollIntoViewIfNeeded();
        await expect(
          link,
          `${label} at ${viewport.width}x${viewport.height}`
        ).toBeVisible();
      }

      const theme = page.getByRole("radiogroup", { name: "Theme" });
      await theme.scrollIntoViewIfNeeded();
      await expect(theme).toBeVisible();
      const themeBox = await theme.boundingBox();
      expect(themeBox).not.toBeNull();
      expect(themeBox!.y).toBeGreaterThanOrEqual(0);
      expect(themeBox!.y + themeBox!.height).toBeLessThanOrEqual(
        viewport.height + 1
      );
      await page.keyboard.press("Escape");
    }
  });

  test("desktop For clinics rows stay compact with independent surfaces", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/physiotherapy"), { waitUntil: "load" });
    const header = page.getByRole("navigation", { name: "Marketing" });
    await header.getByRole("button", { name: "For clinics" }).click();

    const panel = page.locator("[class*='navClinicsPanel']");
    await expect(panel).toBeVisible();
    const panelBox = await panel.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(panelBox!.height).toBeLessThan(360);

    const listGap = await panel.locator("ul").evaluate((element) => {
      const style = getComputedStyle(element);
      return Number.parseFloat(style.rowGap || style.gap);
    });
    expect(listGap).toBeGreaterThan(1);
    expect(listGap).toBeLessThan(6);

    const dental = header.getByRole("link", { name: "Dental", exact: true });
    const physio = header.getByRole("link", {
      name: "Physiotherapy",
      exact: true,
    });
    await expect(physio).toHaveAttribute("aria-current", "page");

    const dentalBox = await dental.boundingBox();
    const physioBox = await physio.boundingBox();
    expect(dentalBox).not.toBeNull();
    expect(physioBox).not.toBeNull();
    const space = physioBox!.y - (dentalBox!.y + dentalBox!.height);
    expect(space).toBeGreaterThanOrEqual(2);
    expect(space).toBeLessThan(10);

    await dental.hover();
    const hoverBg = await dental.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    );
    expect(hoverBg).not.toBe("rgba(0, 0, 0, 0)");

    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(physio).toBeFocused();
    const focusVisible = await physio.evaluate((element) =>
      element.matches(":focus-visible")
    );
    expect(focusVisible).toBe(true);
  });

  test("stacked hero CTAs fill the content column on mobile only", async ({
    page,
  }) => {
    async function measureHeroActions() {
      const group = page.locator("[data-mk-hero-actions]").first();
      await expect(group).toBeVisible();
      return group.evaluate((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const children = [...element.children].map((child) => {
          const box = child.getBoundingClientRect();
          return { width: box.width, top: box.top };
        });
        return {
          width: rect.width,
          flexDirection: style.flexDirection,
          children,
          viewportWidth: window.innerWidth,
        };
      });
    }

    for (const path of ["/", "/clinics", "/dental"] as const) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(marketingUrl(path), { waitUntil: "load" });
      const mobile = await measureHeroActions();
      expect(mobile.children.length).toBe(2);
      expect(mobile.flexDirection).toBe("column");
      expect(
        Math.abs(mobile.children[0]!.width - mobile.children[1]!.width)
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(mobile.children[0]!.width - mobile.width)
      ).toBeLessThanOrEqual(2);
      expect(mobile.width).toBeLessThan(mobile.viewportWidth - 24);
      expect(mobile.width).toBeGreaterThan(mobile.viewportWidth * 0.7);
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    const desktop = await measureHeroActions();
    expect(desktop.flexDirection).toBe("row");
    expect(desktop.children[0]!.width).toBeLessThan(desktop.width - 24);
    expect(desktop.children[1]!.width).toBeLessThan(desktop.width - 24);
    expect(
      Math.abs(desktop.children[0]!.top - desktop.children[1]!.top)
    ).toBeLessThanOrEqual(2);
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
      expect(overflow.itemOverflow).toBe("hidden");
      await summary.focus();
      await expect(summary).toBeFocused();
      const before = await item.evaluate((element) =>
        element instanceof HTMLElement ? element.offsetTop : 0
      );
      await page.keyboard.press("Enter");
      await expect(item).toHaveJSProperty("open", true);
      await expect(summary).toBeFocused();
      const afterOpen = await item.evaluate((element) =>
        element instanceof HTMLElement ? element.offsetTop : 0
      );
      expect(Math.abs(afterOpen - before)).toBeLessThan(8);
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
      page.getByRole("navigation", { name: "Clinic types" }).getByRole("link", {
        name: "Dental",
        exact: true,
      })
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

  test("homepage phone Coming next uses sample stages without clipping", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: "reduce" });

    for (const viewport of [
      { width: 1728, height: 900 },
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
      { width: 430, height: 932 },
      { width: 390, height: 844 },
      { width: 375, height: 812 },
    ] as const) {
      await page.setViewportSize(viewport);
      await page.goto(marketingUrl("/"), { waitUntil: "load" });
      await showMarketingScheme(page, "light");
      await waitForPhoneFrame(page);

      await expect(page.locator("#mk-phone-today")).toBeChecked();
      const comingNext = page.locator("[data-mk-phone-coming-next]");
      await expect(comingNext.getByText("Early recovery")).toBeVisible();
      await expect(comingNext.getByText("Healing check")).toBeVisible();
      await expect(
        comingNext.getByText("Swelling often peaks, then eases.")
      ).toBeVisible();
      await expect(
        comingNext.getByText("Discomfort should continue to settle.")
      ).toBeVisible();
      await expect(
        comingNext.getByText("Days 2–3 — Early recovery")
      ).toHaveCount(0);

      const layout = await page.evaluate(() => {
        const screen = document.querySelector("[class*='phoneScreen']");
        const coming = document.querySelector("[data-mk-phone-coming-next]");
        const help = document.querySelector("[class*='phoneHelp']");
        if (
          !(screen instanceof HTMLElement) ||
          !(coming instanceof HTMLElement) ||
          !(help instanceof HTMLElement)
        ) {
          return null;
        }
        const screenBox = screen.getBoundingClientRect();
        const comingBox = coming.getBoundingClientRect();
        const helpBox = help.getBoundingClientRect();
        const healing = coming.querySelector(
          "[data-mk-phone-coming-next-stage='days-4-7']"
        );
        const healingBox = healing?.getBoundingClientRect();
        const main = screen.querySelector("[class*='phoneMain']");
        const helpLabel = help.querySelector("[class*='phoneHelpLabel']");
        const helpLabelBox = helpLabel?.getBoundingClientRect();
        return {
          screenOverflowY: screen.scrollHeight - screen.clientHeight,
          screenOverflowX: screen.scrollWidth - screen.clientWidth,
          mainOverflowY:
            main instanceof HTMLElement
              ? main.scrollHeight - main.clientHeight
              : -1,
          gap: helpBox.top - comingBox.bottom,
          labelGap: helpLabelBox ? helpLabelBox.top - comingBox.bottom : null,
          helpTop: helpBox.top,
          helpBottom: helpBox.bottom,
          screenBottom: screenBox.bottom,
          healingBottom: healingBox?.bottom ?? null,
        };
      });
      expect(layout, `${viewport.width} phone layout`).not.toBeNull();
      expect(
        layout!.screenOverflowX,
        `${viewport.width} phone x overflow`
      ).toBeLessThanOrEqual(1);
      expect(
        layout!.screenOverflowY,
        `${viewport.width} phone y overflow`
      ).toBeLessThanOrEqual(1);
      expect(
        layout!.mainOverflowY,
        `${viewport.width} phone main y overflow`
      ).toBeLessThanOrEqual(8);
      expect(layout!.gap, `${viewport.width} contact gap`).toBeGreaterThan(-2);
      expect(
        layout!.labelGap,
        `${viewport.width} contact label gap`
      ).toBeGreaterThan(6);
      expect(layout!.helpBottom).toBeLessThanOrEqual(layout!.screenBottom + 1);
      expect(
        layout!.healingBottom,
        `${viewport.width} healing stage`
      ).not.toBeNull();
      expect(layout!.healingBottom!).toBeLessThan(layout!.helpTop + 2);

      await page.locator('label[for="mk-phone-timeline"]').click();
      await expect(page.locator("#mk-phone-timeline")).toBeChecked();
      const timelineOverflow = await page.evaluate(() => {
        const screen = document.querySelector("[class*='phoneScreen']");
        if (!(screen instanceof HTMLElement)) {
          return null;
        }
        return {
          y: screen.scrollHeight - screen.clientHeight,
          x: screen.scrollWidth - screen.clientWidth,
        };
      });
      expect(timelineOverflow).not.toBeNull();
      expect(timelineOverflow!.x).toBeLessThanOrEqual(1);
      expect(timelineOverflow!.y).toBeLessThanOrEqual(1);
      await expectNoHorizontalOverflow(page);
    }
  });

  test("captures mobile nav spacing and stacked hero CTA artifacts", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await page
      .getByRole("navigation", { name: "Marketing" })
      .getByRole("button", { name: "For clinics" })
      .click();
    await page.locator("[class*='navClinicsPanel']").screenshot({
      path: "test-results/artifacts/desktop-dropdown-light.png",
    });
    await page.keyboard.press("Escape");
    await page.locator("[aria-labelledby='marketing-hero']").screenshot({
      path: "test-results/artifacts/home-desktop-hero-ctas-intrinsic.png",
    });

    await showMarketingScheme(page, "dark");
    await page
      .getByRole("navigation", { name: "Marketing" })
      .getByRole("button", { name: "For clinics" })
      .click();
    await page.locator("[class*='navClinicsPanel']").screenshot({
      path: "test-results/artifacts/desktop-dropdown-dark.png",
    });
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 390, height: 844 });
    await showMarketingScheme(page, "dark");
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await page.locator("[aria-labelledby='marketing-hero']").screenshot({
      path: "test-results/artifacts/home-mobile-hero-390-dark.png",
    });
    await page.getByRole("button", { name: "Site menu" }).click();
    await page.locator("[class*='navMenuPanel']").screenshot({
      path: "test-results/artifacts/mobile-nav-dark-390x844.png",
    });
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(
      page
        .getByRole("navigation", { name: "Marketing" })
        .getByRole("link", { name: "Chiropractic", exact: true })
    ).toBeFocused();
    await page.locator("[class*='navMenuPanel']").screenshot({
      path: "test-results/artifacts/mobile-nav-chiro-focus.png",
    });
    await page.keyboard.press("Escape");

    await showMarketingScheme(page, "light");
    await page.locator("[aria-labelledby='marketing-hero']").screenshot({
      path: "test-results/artifacts/home-mobile-hero-390-light.png",
    });
    await page.getByRole("button", { name: "Site menu" }).click();
    await page.locator("[class*='navMenuPanel']").screenshot({
      path: "test-results/artifacts/mobile-nav-light-390x844.png",
    });
    await page.keyboard.press("Escape");

    await showMarketingScheme(page, "dark");
    await page.setViewportSize({ width: 390, height: 667 });
    await page.getByRole("button", { name: "Site menu" }).click();
    await page.locator("[class*='navMenuPanel']").screenshot({
      path: "test-results/artifacts/mobile-nav-dark-390x667.png",
    });
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 320, height: 568 });
    await page.getByRole("button", { name: "Site menu" }).click();
    await page.locator("[class*='navMenuPanel']").screenshot({
      path: "test-results/artifacts/mobile-nav-dark-320x568.png",
    });
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(marketingUrl("/physiotherapy"), { waitUntil: "load" });
    await page.locator("[data-mk-vertical-hero]").screenshot({
      path: "test-results/artifacts/physio-mobile-hero-390-dark.png",
    });
    await page.getByRole("button", { name: "Site menu" }).click();
    await page.locator("[class*='navMenuPanel']").screenshot({
      path: "test-results/artifacts/mobile-nav-physio-active.png",
    });
    await page.keyboard.press("Escape");

    await page.goto(marketingUrl("/dental"), { waitUntil: "load" });
    await page.locator("[data-mk-vertical-hero]").screenshot({
      path: "test-results/artifacts/dental-mobile-hero-390-dark.png",
    });

    await page.goto(marketingUrl("/clinics"), { waitUntil: "load" });
    await page.locator("[aria-labelledby='clinics-hero']").screenshot({
      path: "test-results/artifacts/clinics-mobile-hero-390-dark.png",
    });
  });

  test("captures premium UX visual QA artifacts", async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await waitForPhoneFrame(page);
    const phone = page.locator('[class*="phoneShell"]');
    await expect(phone).toHaveAttribute("aria-hidden", "true");
    const phoneSelect = await phone.evaluate(
      (element) => getComputedStyle(element).userSelect
    );
    expect(phoneSelect).toBe("none");
    await phone.screenshot({
      path: "test-results/artifacts/home-phone-desktop-light.png",
    });
    await phone.screenshot({
      path: "test-results/artifacts/homepage-phone-light-1440.png",
    });
    await page.locator("[data-mk-phone-coming-next]").screenshot({
      path: "test-results/artifacts/homepage-phone-detail-after.png",
    });
    await page.locator('label[for="mk-phone-timeline"]').click();
    await expect(page.locator("#mk-phone-timeline")).toBeChecked();
    await page.locator('[class*="phoneTimelinePane"]').screenshot({
      path: "test-results/artifacts/timeline-preview-detail.png",
    });
    await page.locator('label[for="mk-phone-today"]').click();
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
    await page.locator('[class*="phoneShell"]').screenshot({
      path: "test-results/artifacts/home-phone-desktop-dark.png",
    });
    await page.locator('[class*="phoneShell"]').screenshot({
      path: "test-results/artifacts/homepage-phone-mockup-dark-1440.png",
    });
    await page.locator('[class*="phoneShell"]').screenshot({
      path: "test-results/artifacts/homepage-phone-dark-1440.png",
    });
    await page.locator("[data-mk-phone-coming-next]").screenshot({
      path: "test-results/artifacts/homepage-phone-mockup-dark-detail.png",
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
    await page.locator('[class*="phoneShell"]').screenshot({
      path: "test-results/artifacts/home-phone-mobile-light.png",
    });
    await page.locator('[class*="phoneShell"]').screenshot({
      path: "test-results/artifacts/homepage-phone-light-390.png",
    });
    await page.getByRole("button", { name: "Site menu" }).click();
    await page
      .locator("[class*='navMenuPanel']")
      .screenshot({ path: "test-results/artifacts/nav-mobile-light.png" });
    await page.keyboard.press("Escape");
    await showMarketingScheme(page, "dark");
    await waitForPhoneFrame(page);
    await page.locator('[class*="phoneShell"]').screenshot({
      path: "test-results/artifacts/home-phone-mobile-dark.png",
    });
    await page.locator('[class*="phoneShell"]').screenshot({
      path: "test-results/artifacts/homepage-phone-mockup-390.png",
    });
    await page.locator('[class*="phoneShell"]').screenshot({
      path: "test-results/artifacts/homepage-phone-dark-390.png",
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
    await page
      .getByRole("heading", {
        name: "Different kinds of care. The same need for clarity afterwards.",
      })
      .locator("xpath=ancestor::section[1]")
      .screenshot({
        path: "test-results/artifacts/clinics-one-platform-light-1440.png",
      });
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
    await page
      .getByRole("heading", {
        name: "Different kinds of care. The same need for clarity afterwards.",
      })
      .locator("xpath=ancestor::section[1]")
      .screenshot({
        path: "test-results/artifacts/clinics-one-platform-dark-1440.png",
      });
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
    const faqAccordion = page
      .locator('details[data-faq-position="first"]')
      .locator("xpath=..");
    await faqAccordion.screenshot({
      path: "test-results/artifacts/faq-light-open-close-states.png",
    });
    await showMarketingScheme(page, "dark");
    await faqAccordion.screenshot({
      path: "test-results/artifacts/faq-dark-open-close-states.png",
    });
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

  test("keeps independent link underlines, about list gap, and a centred contact panel", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");

    const headerAbout = page
      .getByRole("navigation", { name: "Marketing" })
      .getByRole("link", { name: "About" });
    await headerAbout.hover();
    const navUnderline = await headerAbout.evaluate(
      (element) => getComputedStyle(element, "::after").bottom
    );
    expect(Number.parseFloat(navUnderline)).toBeGreaterThan(6);

    const inlineLink = page.getByRole("link", {
      name: "Explore all clinic types →",
    });
    await inlineLink.scrollIntoViewIfNeeded();
    await inlineLink.hover();
    const inlineUnderline = await inlineLink.evaluate(
      (element) => getComputedStyle(element, "::after").bottom
    );
    expect(Number.parseFloat(inlineUnderline)).toBeCloseTo(-2, 0);
    await inlineLink.screenshot({
      path: "test-results/artifacts/link-underline-inline.png",
    });
    await inlineLink.screenshot({
      path: "test-results/artifacts/inline-link-underline-example.png",
    });

    await headerAbout.hover();
    await page.getByRole("navigation", { name: "Marketing" }).screenshot({
      path: "test-results/artifacts/nav-underline.png",
    });
    await page.getByRole("navigation", { name: "Marketing" }).screenshot({
      path: "test-results/artifacts/nav-underline-example.png",
    });

    const footerAbout = page
      .getByRole("navigation", { name: "Footer" })
      .getByRole("link", { name: "About" });
    await footerAbout.scrollIntoViewIfNeeded();
    await footerAbout.hover();
    const footerUnderline = await footerAbout.evaluate(
      (element) => getComputedStyle(element, "::after").bottom
    );
    expect(footerUnderline).toBe("0px");
    await page.getByRole("contentinfo").screenshot({
      path: "test-results/artifacts/footer-underline.png",
    });

    await page.goto(marketingUrl("/about"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    const clinicList = page.getByRole("navigation", { name: "Clinic types" });
    await clinicList.scrollIntoViewIfNeeded();
    const rowGap = await clinicList.locator("ul").evaluate((element) => {
      const value = getComputedStyle(element).rowGap;
      return Number.parseFloat(value);
    });
    expect(rowGap).toBeGreaterThanOrEqual(8);
    expect(rowGap).toBeLessThanOrEqual(14);
    await expect(
      clinicList.getByRole("link", { name: "Dental", exact: true })
    ).toBeVisible();
    await expect(
      clinicList.getByText("Other appropriate allied health")
    ).toBeVisible();
    await expect(
      clinicList.getByRole("link", { name: "Other appropriate allied health" })
    ).toHaveCount(0);
    await clinicList.screenshot({
      path: "test-results/artifacts/about-clinic-list-light-1440.png",
    });
    await page.screenshot({
      path: "test-results/artifacts/about-light-1440.png",
      fullPage: true,
    });
    await showMarketingScheme(page, "dark");
    await clinicList.screenshot({
      path: "test-results/artifacts/about-clinic-list-dark-1440.png",
    });
    await page.screenshot({
      path: "test-results/artifacts/about-dark-1440.png",
      fullPage: true,
    });

    await page.goto(marketingUrl("/pricing"), { waitUntil: "load" });
    const plannedGap = await page
      .locator('[class*="laterList"]')
      .evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).marginTop)
      );
    expect(plannedGap).toBeGreaterThanOrEqual(20);
    expect(plannedGap).toBeLessThanOrEqual(28);
    await showMarketingScheme(page, "light");
    await page
      .getByRole("heading", { name: "What these prices do and do not include" })
      .locator("xpath=ancestor::section[1]")
      .screenshot({
        path: "test-results/artifacts/pricing-commercial-notes-light-1440.png",
      });
    await page
      .getByRole("heading", { name: "Planned, not in active plans" })
      .locator("xpath=ancestor::section[1]")
      .screenshot({
        path: "test-results/artifacts/pricing-planned-light-1440.png",
      });
    await showMarketingScheme(page, "dark");
    await page
      .getByRole("heading", { name: "What these prices do and do not include" })
      .locator("xpath=ancestor::section[1]")
      .screenshot({
        path: "test-results/artifacts/pricing-commercial-notes-dark-1440.png",
      });
    await page
      .getByRole("heading", { name: "Planned, not in active plans" })
      .locator("xpath=ancestor::section[1]")
      .screenshot({
        path: "test-results/artifacts/pricing-planned-dark-1440.png",
      });

    await page.goto(marketingUrl("/contact"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    const form = page.locator("form");
    await expect(form).toBeVisible();
    const desktopForm = await form.evaluate((element) => {
      const styles = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        width: rect.width,
        left: rect.left,
        right: window.innerWidth - rect.right,
        paddingTop: Number.parseFloat(styles.paddingTop),
        textAlign: styles.textAlign,
      };
    });
    expect(desktopForm.textAlign).toBe("left");
    expect(desktopForm.paddingTop).toBeGreaterThanOrEqual(24);
    expect(Math.abs(desktopForm.left - desktopForm.right)).toBeLessThan(24);
    expect(desktopForm.width).toBeGreaterThan(700);
    await expect(page.getByLabel("Full name")).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/contact-light-1440.png",
      fullPage: true,
    });
    await showMarketingScheme(page, "dark");
    await page.screenshot({
      path: "test-results/artifacts/contact-dark-1440.png",
      fullPage: true,
    });

    await page.goto(marketingUrl("/dental"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await expect(
      page.getByRole("heading", {
        name: "One branded place for post-treatment guidance",
      })
    ).toBeVisible();
    const solutionSection = page
      .getByRole("heading", {
        name: "One branded place for post-treatment guidance",
      })
      .locator("xpath=ancestor::section[1]");
    await expect(solutionSection.locator('[class*="eyebrow"]')).toHaveCount(0);
    const workflowSection = page
      .getByRole("heading", {
        name: "From approved instructions to a page patients can keep",
      })
      .locator("xpath=ancestor::section[1]");
    await expect(workflowSection.locator('[class*="eyebrow"]')).toHaveCount(0);
    await expect(page.getByText("After the appointment")).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/dental-section-rhythm.png",
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(marketingUrl("/clinics"), { waitUntil: "load" });
    await showMarketingScheme(page, "dark");
    await page
      .getByRole("heading", {
        name: "Different kinds of care. The same need for clarity afterwards.",
      })
      .locator("xpath=ancestor::section[1]")
      .screenshot({
        path: "test-results/artifacts/clinics-one-platform-390.png",
      });

    await page.goto(marketingUrl("/about"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await page.getByRole("navigation", { name: "Clinic types" }).screenshot({
      path: "test-results/artifacts/about-clinic-list-390.png",
    });
    await page.screenshot({
      path: "test-results/artifacts/about-390.png",
      fullPage: true,
    });
    await expectNoHorizontalOverflow(page);

    await page.goto(marketingUrl("/pricing"), { waitUntil: "load" });
    await page
      .getByRole("heading", { name: "Planned, not in active plans" })
      .locator("xpath=ancestor::section[1]")
      .screenshot({
        path: "test-results/artifacts/pricing-planned-390.png",
      });
    await expectNoHorizontalOverflow(page);

    await page.goto(marketingUrl("/contact"), { waitUntil: "load" });
    const mobileForm = await page.locator("form").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const inner = element.closest('[class*="inner"]');
      const innerRect = inner?.getBoundingClientRect();
      return {
        width: rect.width,
        innerWidth: innerRect?.width ?? 0,
        left: rect.left,
      };
    });
    expect(mobileForm.innerWidth).toBeGreaterThan(0);
    expect(mobileForm.width).toBeGreaterThan(mobileForm.innerWidth - 8);
    expect(mobileForm.left).toBeGreaterThanOrEqual(12);
    await page.screenshot({
      path: "test-results/artifacts/contact-390.png",
      fullPage: true,
    });
    await expectNoHorizontalOverflow(page);

    for (const path of ["/about", "/pricing", "/contact", "/dental"] as const) {
      await page.goto(marketingUrl(path), { waitUntil: "load" });
      for (const viewport of [
        { width: 1728, height: 900 },
        { width: 1440, height: 900 },
        { width: 1024, height: 768 },
        { width: 768, height: 1024 },
        { width: 390, height: 844 },
      ] as const) {
        await page.setViewportSize(viewport);
        await expectNoHorizontalOverflow(page);
      }
    }
  });
});
