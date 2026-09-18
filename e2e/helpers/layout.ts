import { expect, type Locator, type Page } from "@playwright/test";

import { expectNoPortalShellOverflow } from "./portal-shell";

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const hasStaffShell = await page.locator(".staffAppShell").count();
  if (hasStaffShell > 0) {
    await expectNoPortalShellOverflow(page, "current", page.url());
    return;
  }

  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const main = document.querySelector("main");
    return {
      rootScrollWidth: root.scrollWidth,
      rootClientWidth: root.clientWidth,
      mainScrollWidth: main?.scrollWidth ?? 0,
      mainClientWidth: main?.clientWidth ?? 0,
    };
  });

  expect(metrics.rootScrollWidth).toBeLessThanOrEqual(
    metrics.rootClientWidth + 1
  );
  if (metrics.mainClientWidth > 0) {
    expect(metrics.mainScrollWidth).toBeLessThanOrEqual(
      metrics.mainClientWidth + 1
    );
  }
}

export async function measureHorizontalOverflow(page: Page): Promise<{
  scrollWidth: number;
  clientWidth: number;
}> {
  return page.evaluate(() => {
    const main =
      document.querySelector(".staffAppScroller") ??
      document.querySelector(".staffAppContent") ??
      document.querySelector(".staffPortalMain");
    const root = document.documentElement;
    const target = main ?? root;
    return {
      scrollWidth: target.scrollWidth,
      clientWidth: target.clientWidth,
    };
  });
}

export async function expectUsableTapTarget(locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, "tap target should be visible").not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
}

export async function expectHeadingDoesNotOverflow(
  locator: Locator
): Promise<void> {
  const overflow = await locator.evaluate((element) => {
    return element.scrollWidth - element.clientWidth;
  });

  expect(overflow).toBeLessThanOrEqual(1);
}

export async function measurePracticeOverflow(page: Page): Promise<{
  rootScrollWidth: number;
  rootClientWidth: number;
  mainScrollWidth: number;
  mainClientWidth: number;
  scrollerScrollWidth: number;
  scrollerClientWidth: number;
  overflowing: Array<{
    tag: string;
    className: string;
    id: string;
    rectRight: number;
    containerRight: number;
    width: number;
    minWidth: string;
    parentDisplay: string;
  }>;
}> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const main = document.querySelector(".staffAppContent");
    const scroller = document.querySelector(".staffAppScroller");
    const container = scroller ?? main ?? root;
    const containerRight = container.getBoundingClientRect().right;
    const overflowing: Array<{
      tag: string;
      className: string;
      id: string;
      rectRight: number;
      containerRight: number;
      width: number;
      minWidth: string;
      parentDisplay: string;
    }> = [];

    for (const element of document.querySelectorAll("body *")) {
      if (!(element instanceof HTMLElement)) {
        continue;
      }
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") {
        continue;
      }
      if (style.position === "fixed") {
        continue;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        continue;
      }
      if (rect.right > containerRight + 1) {
        overflowing.push({
          tag: element.tagName.toLowerCase(),
          className: element.className.toString().slice(0, 120),
          id: element.id,
          rectRight: Math.round(rect.right * 10) / 10,
          containerRight: Math.round(containerRight * 10) / 10,
          width: Math.round(rect.width * 10) / 10,
          minWidth: style.minWidth,
          parentDisplay: element.parentElement
            ? getComputedStyle(element.parentElement).display
            : "",
        });
      }
    }

    return {
      rootScrollWidth: root.scrollWidth,
      rootClientWidth: root.clientWidth,
      mainScrollWidth: main?.scrollWidth ?? 0,
      mainClientWidth: main?.clientWidth ?? 0,
      scrollerScrollWidth: scroller?.scrollWidth ?? 0,
      scrollerClientWidth: scroller?.clientWidth ?? 0,
      overflowing: overflowing.slice(0, 25),
    };
  });
}

export async function expectPracticePageDoesNotOverflow(
  page: Page,
  viewportLabel: string
): Promise<void> {
  await expectNoPortalShellOverflow(page, viewportLabel, "/practice");
}

export function relativeLuminance(rgb: string): number {
  const value = rgb.trim();
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const parsed = Number.parseInt(hex[1], 16);
    return (
      (0.2126 * ((parsed >> 16) & 255) +
        0.7152 * ((parsed >> 8) & 255) +
        0.0722 * (parsed & 255)) /
      255
    );
  }

  const rgbMatch = value.match(
    /rgba?\(\s*([\d.]+)[,\s/]+([\d.]+)[,\s/]+([\d.]+)/
  );
  if (rgbMatch) {
    const [red, green, blue] = rgbMatch
      .slice(1)
      .map((channel) => Number(channel) / 255);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }

  const srgbMatch = value.match(
    /color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i
  );
  if (srgbMatch) {
    const [red, green, blue] = srgbMatch.slice(1).map(Number);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }

  return -1;
}

export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  if (a < 0 || b < 0) {
    return 0;
  }
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}
