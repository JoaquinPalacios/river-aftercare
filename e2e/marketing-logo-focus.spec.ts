import { expect, test, type Page } from "@playwright/test";

import { marketingUrl } from "./helpers/origins";

const WIDTHS = [390, 768, 1024, 1280, 1440] as const;

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

function logoLink(page: Page) {
  return page
    .getByRole("banner")
    .getByRole("link", { name: "River Aftercare" });
}

test.describe("about practice cards and header logo focus", () => {
  test("practice-card gap is 12px at every reviewed width", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
      await page.goto(marketingUrl("/about"), { waitUntil: "load" });
      await showMarketingScheme(page, width === 768 ? "dark" : "light");

      const metrics = await page
        .getByRole("navigation", { name: "Clinic types" })
        .locator("ul")
        .evaluate((element) => {
          const style = getComputedStyle(element);
          const items = [...element.children].map((child) => {
            const box = child.getBoundingClientRect();
            return {
              left: box.left,
              top: box.top,
              height: box.height,
              width: box.width,
            };
          });
          return {
            gap: style.gap,
            items,
            overflow:
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          };
        });

      expect(metrics.gap, `${width}px gap`).toBe("12px");
      expect(metrics.items, `${width}px cards`).toHaveLength(5);
      expect(metrics.overflow, `${width}px overflow`).toBeLessThanOrEqual(1);
      const left = metrics.items[0]?.left ?? 0;
      for (const item of metrics.items) {
        expect(Math.abs(item.left - left), `${width}px alignment`).toBeLessThan(
          1
        );
        expect(item.width, `${width}px width`).toBeGreaterThan(0);
      }
      for (let index = 0; index < metrics.items.length - 1; index += 1) {
        const current = metrics.items[index]!;
        const next = metrics.items[index + 1]!;
        const space = next.top - (current.top + current.height);
        expect(space, `${width}px card spacing`).toBeGreaterThan(11);
        expect(space, `${width}px card spacing`).toBeLessThan(13);
      }
    }
  });

  for (const scheme of ["light", "dark"] as const) {
    for (const width of [390, 1440] as const) {
      test(`logo keyboard focus is a rounded outline in ${scheme} at ${width}px`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
        await page.goto(marketingUrl("/about"), { waitUntil: "load" });
        await showMarketingScheme(page, scheme);
        const logo = logoLink(page);
        const before = await logo.boundingBox();
        expect(before).not.toBeNull();

        await page.keyboard.press("Tab");
        await expect(logo).toBeFocused();
        const focus = await logo.evaluate((element) => {
          const style = getComputedStyle(element);
          const header = element.closest("header");
          const headerStyle = header ? getComputedStyle(header) : null;
          const box = element.getBoundingClientRect();
          return {
            focusVisible: element.matches(":focus-visible"),
            outlineStyle: style.outlineStyle,
            outlineWidth: Number.parseFloat(style.outlineWidth),
            outlineOffset: Number.parseFloat(style.outlineOffset),
            borderRadius: Number.parseFloat(style.borderRadius),
            boxShadow: style.boxShadow,
            name: element.getAttribute("aria-label"),
            href: element.getAttribute("href"),
            top: box.top,
            height: box.height,
            width: box.width,
            headerOverflow: headerStyle?.overflow ?? "",
            headerHidden: header?.getAttribute("data-nav-hidden") ?? "",
          };
        });

        expect(focus.focusVisible).toBe(true);
        expect(focus.name).toBe("River Aftercare");
        expect(focus.href).toBe("/");
        expect(focus.outlineStyle).toBe("solid");
        expect(focus.outlineWidth).toBeGreaterThanOrEqual(2);
        expect(focus.outlineOffset).toBeGreaterThanOrEqual(3);
        expect(focus.outlineOffset).toBeLessThanOrEqual(4);
        expect(focus.borderRadius).toBeGreaterThan(2);
        expect(focus.borderRadius).toBeLessThan(focus.height / 2);
        expect(focus.boxShadow).toBe("none");
        expect(focus.headerHidden).toBe("false");
        expect(focus.headerOverflow).not.toBe("hidden");
        expect(focus.top).toBeGreaterThan(8);
        expect(Math.abs((before?.width ?? 0) - focus.width)).toBeLessThan(1);
        expect(Math.abs((before?.height ?? 0) - focus.height)).toBeLessThan(1);

        await page.keyboard.press("Tab");
        await expect(logo).not.toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(logo).toBeFocused();
        const stillVisible = await logo.evaluate((element) =>
          element.matches(":focus-visible")
        );
        expect(stillVisible).toBe(true);

        await page.evaluate(() => {
          document.addEventListener(
            "click",
            (event) => {
              event.preventDefault();
              event.stopPropagation();
            },
            { capture: true, once: true }
          );
        });
        await logo.click();
        await expect(logo).toBeFocused();
        const pointerFocus = await logo.evaluate((element) =>
          element.matches(":focus-visible")
        );
        expect(pointerFocus).toBe(false);

        await page.keyboard.press("Enter");
        await expect(page).toHaveURL((url) => url.pathname === "/");
        const homeLogo = logoLink(page);
        await expect(homeLogo).toBeVisible();
        const homeRing = await homeLogo.evaluate((element) =>
          element.matches(":focus-visible")
        );
        expect(homeRing).toBe(false);
      });
    }
  }

  test("logo focus stays visible when the sticky header is revealed after scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(marketingUrl("/about"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await expect
      .poll(async () => {
        await page.mouse.wheel(0, 400);
        return page.locator("header").getAttribute("data-nav-hidden");
      })
      .toBe("true");

    await page.keyboard.press("Tab");
    const logo = logoLink(page);
    await expect(logo).toBeFocused();
    await expect
      .poll(async () => page.locator("header").getAttribute("data-nav-hidden"))
      .toBe("false");
    const placed = await logo.evaluate((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      const header = element.closest("header")?.getBoundingClientRect();
      return {
        focusVisible: element.matches(":focus-visible"),
        outlineWidth: Number.parseFloat(style.outlineWidth),
        top: box.top,
        bottom: box.bottom,
        headerTop: header?.top ?? -1,
        headerBottom: header?.bottom ?? -1,
      };
    });
    expect(placed.focusVisible).toBe(true);
    expect(placed.outlineWidth).toBeGreaterThanOrEqual(2);
    expect(placed.headerTop).toBeGreaterThanOrEqual(0);
    expect(placed.top).toBeGreaterThan(placed.headerTop);
    expect(placed.bottom).toBeLessThan(placed.headerBottom);
  });

  test("logo focus stays clear of the open mobile menu", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(marketingUrl("/about"), { waitUntil: "load" });
    await showMarketingScheme(page, "dark");
    await page.getByRole("button", { name: "Site menu" }).click();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    const logo = logoLink(page);
    await expect(logo).toBeFocused();
    const placement = await logo.evaluate((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      const panel = document.querySelector("[class*='navMenuPanel']");
      const panelBox =
        panel instanceof HTMLElement ? panel.getBoundingClientRect() : null;
      const offset = Number.parseFloat(style.outlineOffset);
      const width = Number.parseFloat(style.outlineWidth);
      return {
        focusVisible: element.matches(":focus-visible"),
        outlineStyle: style.outlineStyle,
        ringBottom: box.bottom + offset + width,
        panelTop: panelBox?.top ?? null,
      };
    });
    expect(placement.focusVisible).toBe(true);
    expect(placement.outlineStyle).toBe("solid");
    expect(placement.panelTop).not.toBeNull();
    expect(placement.ringBottom).toBeLessThan(placement.panelTop ?? 0);
  });

  test("logo focus outline remains in forced colours", async ({ page }) => {
    await page.emulateMedia({
      forcedColors: "active",
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(marketingUrl("/about"), { waitUntil: "load" });
    await page.keyboard.press("Tab");
    const logo = logoLink(page);
    await expect(logo).toBeFocused();
    const focus = await logo.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        forced: window.matchMedia("(forced-colors: active)").matches,
        focusVisible: element.matches(":focus-visible"),
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
        borderRadius: Number.parseFloat(style.borderRadius),
      };
    });
    expect(focus.forced).toBe(true);
    expect(focus.focusVisible).toBe(true);
    expect(focus.outlineStyle).not.toBe("none");
    expect(focus.outlineWidth).toBeGreaterThanOrEqual(2);
    expect(focus.borderRadius).toBeGreaterThan(0);
  });
});
