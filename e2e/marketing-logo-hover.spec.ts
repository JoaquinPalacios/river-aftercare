import { expect, test, type Page } from "@playwright/test";

import { marketingUrl } from "./helpers/origins";

const WIDTHS = [390, 768, 1024, 1440] as const;

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

function logoLink(page: Page) {
  return page
    .getByRole("banner")
    .getByRole("link", { name: "River Aftercare" });
}

async function logoMetrics(page: Page) {
  return logoLink(page).evaluate((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const mark = element.querySelector('img[src*="isologo"]');
    const logos = [
      ...element.querySelectorAll('img[src*="river-aftercare-logo"]'),
    ];
    const symbolLayer =
      logos.find((img) => getComputedStyle(img).clipPath.includes("82%")) ??
      null;
    const wordLayer =
      logos.find((img) => getComputedStyle(img).clipPath === "none") ?? null;
    const name =
      [...element.querySelectorAll("span")].find((span) =>
        span.textContent?.includes("River Aftercare")
      ) ?? null;
    const markStyle = mark ? getComputedStyle(mark) : null;
    const symbolStyle = symbolLayer ? getComputedStyle(symbolLayer) : null;
    const wordStyle = wordLayer ? getComputedStyle(wordLayer) : null;
    const nameStyle = name ? getComputedStyle(name) : null;
    const header = element.closest("header");
    return {
      focusVisible: element.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      width: box.width,
      height: box.height,
      top: box.top,
      left: box.left,
      markFilter: markStyle?.filter ?? "",
      markTransform: markStyle?.transform ?? "",
      logoFilter: symbolStyle?.filter ?? "",
      logoTransform: symbolStyle?.transform ?? "",
      wordFilter: wordStyle?.filter ?? "",
      symbolOpacity: symbolStyle?.opacity ?? "",
      symbolClip: symbolStyle?.clipPath ?? "",
      nameColor: nameStyle?.color ?? "",
      nameDisplay: nameStyle?.display ?? "",
      nameFilter: nameStyle?.filter ?? "",
      markTransition: markStyle?.transitionDuration ?? "",
      logoTransition: symbolStyle?.transitionDuration ?? "",
      headerPosition: header ? getComputedStyle(header).position : "",
      headerHidden: header?.getAttribute("data-nav-hidden") ?? "",
    };
  });
}

test.describe("marketing header logo hover", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`symbol hover is subtle and still in ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(marketingUrl("/"), { waitUntil: "load" });
      await showMarketingScheme(page, scheme);

      for (const width of WIDTHS) {
        await page.setViewportSize({
          width,
          height: width < 800 ? 844 : 900,
        });
        await page.mouse.move(8, 640);
        await expect
          .poll(async () => {
            const metrics = await logoMetrics(page);
            return `${metrics.markFilter}|${metrics.logoFilter}|${metrics.symbolOpacity}`;
          })
          .toBe("none|none|0");
        const before = await logoMetrics(page);
        expect(before.headerPosition, `${width}px header`).toBe("sticky");
        expect(before.headerHidden, `${width}px header`).toBe("false");
        expect(before.markTransform, `${width}px mark`).toBe("none");
        expect(before.logoTransform, `${width}px logo`).toBe("none");
        expect(before.markFilter, `${width}px rest`).toBe("none");
        expect(before.logoFilter, `${width}px rest`).toBe("none");
        expect(before.symbolOpacity, `${width}px rest`).toBe("0");
        expect(before.wordFilter, `${width}px rest`).toBe("none");

        await logoLink(page).hover();
        const hovered = await logoMetrics(page);
        expect(hovered.width, `${width}px width`).toBe(before.width);
        expect(hovered.height, `${width}px height`).toBe(before.height);
        expect(hovered.top, `${width}px top`).toBe(before.top);
        expect(hovered.left, `${width}px left`).toBe(before.left);
        expect(hovered.markTransform, `${width}px mark`).toBe("none");
        expect(hovered.logoTransform, `${width}px logo`).toBe("none");
        expect(hovered.nameColor, `${width}px wordmark`).toBe(before.nameColor);
        expect(hovered.nameFilter, `${width}px wordmark`).toBe("none");
        expect(hovered.wordFilter, `${width}px wordmark layer`).toBe("none");
        expect(hovered.headerPosition, `${width}px header`).toBe("sticky");

        if (scheme === "light") {
          expect(hovered.nameDisplay, `${width}px wordmark`).not.toBe("none");
          expect(hovered.markFilter, `${width}px symbol`).toContain("saturate");
          expect(hovered.logoFilter, `${width}px lockup`).toBe("none");
        } else {
          expect(hovered.nameDisplay, `${width}px wordmark`).toBe("none");
          expect(hovered.logoFilter, `${width}px symbol`).toContain("saturate");
          expect(hovered.symbolOpacity, `${width}px symbol`).toBe("1");
          expect(hovered.symbolClip, `${width}px symbol`).toContain("82%");
        }
      }
    });
  }

  test("keyboard focus stays visible while the symbol hover is active", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await page.keyboard.press("Tab");
    const logo = logoLink(page);
    await expect(logo).toBeFocused();
    await logo.hover();
    const focus = await logoMetrics(page);
    expect(focus.focusVisible).toBe(true);
    expect(focus.outlineStyle).toBe("solid");
    expect(focus.outlineWidth).toBeGreaterThanOrEqual(2);
    expect(focus.markFilter).toContain("saturate");

    await logo.evaluate((element) => {
      if (element instanceof HTMLElement) element.blur();
    });
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
  });

  test("reduced motion keeps the hover state without a filter transition", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await logoLink(page).hover();
    const hovered = await logoMetrics(page);
    expect(hovered.markFilter).toContain("saturate");
    expect(hovered.markTransition).toBe("0s");
    expect(hovered.markTransform).toBe("none");
  });
});

test.describe("marketing header logo hover on a coarse pointer", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
    colorScheme: "dark",
  });

  test("does not apply the symbol hover filter", async ({ page }) => {
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await page.evaluate(() => {
      try {
        window.localStorage.setItem("aftercare-guide-marketing-theme", "dark");
      } catch {
        // Ignore storage failures in restricted contexts.
      }
      document.documentElement.setAttribute("data-theme-mode", "dark");
    });
    await logoLink(page).hover();
    const hovered = await logoMetrics(page);
    expect(hovered.markFilter).toBe("none");
    expect(hovered.logoFilter).toBe("none");
    expect(hovered.wordFilter).toBe("none");
    expect(hovered.symbolOpacity).toBe("0");
    expect(
      await page.evaluate(
        () =>
          window.matchMedia("(hover: hover) and (pointer: fine)").matches ===
          false
      )
    ).toBe(true);
  });
});
