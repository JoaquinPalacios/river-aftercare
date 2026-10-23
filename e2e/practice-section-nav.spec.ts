import { expect, test, type Page } from "@playwright/test";

import {
  PRACTICE_SECTION_NAV,
  practiceSectionScrollTop,
  selectPracticeSection,
  type PracticeSectionId,
} from "@/app/(staff)/(clinic-portal)/practice/practice-section-nav";

import { expectNoHorizontalOverflow } from "./helpers/layout";
import { staffUrl } from "./helpers/origins";
import { signInAsLocalAdmin } from "./helpers/staff-auth";

const DESKTOP_VIEWPORTS = [
  { width: 1728, height: 1117 },
  { width: 1440, height: 900 },
  { width: 1440, height: 700 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
] as const;

async function openPractice(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await signInAsLocalAdmin(page);
  await page.goto(staffUrl("/practice"), { waitUntil: "load" });
  await expect(
    page.getByRole("heading", { name: "Practice identity" })
  ).toBeVisible();
  return errors;
}

async function activeLabel(page: Page): Promise<string> {
  return (
    await page
      .locator('[aria-label="Practice sections"] [aria-current="true"]')
      .innerText()
  ).trim();
}

async function waitForSection(
  page: Page,
  id: PracticeSectionId,
  label: string
): Promise<void> {
  await expectActive(page, label);
  await expect
    .poll(async () => {
      const reading = await readScroller(page);
      const sectionTop =
        reading.sections.find((item) => item.id === id)?.top ?? 0;
      const target = practiceSectionScrollTop({
        sectionTop,
        activationOffset: reading.offset,
        maxScroll: reading.maxScroll,
      });
      return Math.abs(reading.scrollTop - target);
    })
    .toBeLessThan(3);
}

async function expectActive(page: Page, label: string): Promise<void> {
  await expect
    .poll(async () => activeLabel(page), { timeout: 5_000 })
    .toBe(label);
  await expect(
    page.locator('[aria-label="Practice sections"] [aria-current="true"]')
  ).toHaveCount(1);
}

async function expectDesktopShellStable(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const metrics = await page.evaluate(() => {
    const shell = document.querySelector(".staffAppShell");
    const rect = shell?.getBoundingClientRect();
    return {
      scrollY: window.scrollY,
      shellY: rect?.y ?? 99,
      shellHeight: rect?.height ?? 0,
    };
  });
  expect(metrics.scrollY).toBe(0);
  expect(metrics.shellY).toBeGreaterThan(-2);
  expect(metrics.shellY).toBeLessThan(3);
  expect(metrics.shellHeight).toBeGreaterThan((viewport?.height ?? 0) - 4);
}

async function readScroller(page: Page): Promise<{
  scrollTop: number;
  maxScroll: number;
  clientHeight: number;
  scrollHeight: number;
  offset: number;
  active: string;
  sections: { id: PracticeSectionId; top: number; label: string }[];
}> {
  return page.evaluate(
    (nav) => {
      const scroller = document.querySelector(".staffAppScroller");
      if (!(scroller instanceof HTMLElement)) {
        throw new Error("Practice scroll container is missing");
      }
      const scrollerRect = scroller.getBoundingClientRect();
      const sections = nav.map((section) => {
        const element = document.getElementById(section.id);
        if (!(element instanceof HTMLElement)) {
          throw new Error(`Missing section ${section.id}`);
        }
        return {
          id: section.id,
          label: section.label,
          top:
            element.getBoundingClientRect().top -
            scrollerRect.top +
            scroller.scrollTop,
        };
      });
      const first = document.getElementById(nav[0].id);
      const offset =
        first instanceof HTMLElement
          ? Number.parseFloat(getComputedStyle(first).scrollMarginTop) || 0
          : 0;
      return {
        scrollTop: scroller.scrollTop,
        maxScroll: scroller.scrollHeight - scroller.clientHeight,
        clientHeight: scroller.clientHeight,
        scrollHeight: scroller.scrollHeight,
        offset,
        active:
          document
            .querySelector(
              '[aria-label="Practice sections"] [aria-current="true"]'
            )
            ?.textContent?.trim() ?? "",
        sections,
      };
    },
    PRACTICE_SECTION_NAV.map((section) => ({ ...section }))
  );
}

async function setScrollTop(page: Page, top: number): Promise<void> {
  await page.locator(".staffAppScroller").evaluate((node, value) => {
    node.scrollTop = value;
  }, top);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
}

function labelFor(id: PracticeSectionId): string {
  return PRACTICE_SECTION_NAV.find((section) => section.id === id)?.label ?? id;
}

test.describe("practice section navigation", () => {
  for (const viewport of DESKTOP_VIEWPORTS) {
    test(`tracks scrolling and clicks at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      const errors = await openPractice(page);
      const heightBefore = (await readScroller(page)).scrollHeight;

      await setScrollTop(page, 0);
      await expectActive(page, "Identity");
      await expectDesktopShellStable(page);

      const samples = 16;
      for (let step = 0; step <= samples; step += 1) {
        const before = await readScroller(page);
        await setScrollTop(page, (before.maxScroll * step) / samples);
        const reading = await readScroller(page);
        const expected = selectPracticeSection({
          scrollTop: reading.scrollTop,
          maxScroll: reading.maxScroll,
          activationOffset: reading.offset,
          sections: reading.sections,
        });
        expect(expected).not.toBeNull();
        await expectActive(page, labelFor(expected!));
        await expectDesktopShellStable(page);
      }
      await expectActive(page, "Presentation");

      for (let step = samples; step >= 0; step -= 1) {
        const before = await readScroller(page);
        await setScrollTop(page, (before.maxScroll * step) / samples);
        const reading = await readScroller(page);
        const expected = selectPracticeSection({
          scrollTop: reading.scrollTop,
          maxScroll: reading.maxScroll,
          activationOffset: reading.offset,
          sections: reading.sections,
        });
        await expectActive(page, labelFor(expected!));
      }

      await expectActive(page, "Identity");
      await setScrollTop(page, 0);
      await expectActive(page, "Identity");

      const nav = page.getByRole("navigation", { name: "Practice sections" });
      for (const ratio of [0, 0.45, 1]) {
        const before = await readScroller(page);
        await setScrollTop(page, before.maxScroll * ratio);
        for (const section of PRACTICE_SECTION_NAV) {
          await nav
            .getByRole("link", { name: section.label, exact: true })
            .click();
          await expectActive(page, section.label);
          await expect
            .poll(async () => {
              const reading = await readScroller(page);
              const sectionTop =
                reading.sections.find((item) => item.id === section.id)?.top ??
                0;
              const target = practiceSectionScrollTop({
                sectionTop,
                activationOffset: reading.offset,
                maxScroll: reading.maxScroll,
              });
              return Math.abs(reading.scrollTop - target);
            })
            .toBeLessThan(3);
          await expectDesktopShellStable(page);
          const visible = await page.evaluate((id) => {
            const scroller = document.querySelector(".staffAppScroller");
            const element = document.getElementById(id);
            if (
              !(scroller instanceof HTMLElement) ||
              !(element instanceof HTMLElement)
            ) {
              return null;
            }
            const root = scroller.getBoundingClientRect();
            const rect = element.getBoundingClientRect();
            const offset =
              Number.parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
            const max = scroller.scrollHeight - scroller.clientHeight;
            const contentTop = rect.top - root.top + scroller.scrollTop;
            return {
              top: rect.top - root.top,
              bottom: rect.bottom - root.top,
              height: root.height,
              offset,
              canAlign: contentTop - offset <= max + 1,
            };
          }, section.id);
          expect(visible).not.toBeNull();
          expect(visible!.top).toBeLessThan(visible!.height);
          expect(visible!.bottom).toBeGreaterThan(0);
          if (visible!.canAlign) {
            expect(Math.abs(visible!.top - visible!.offset)).toBeLessThan(8);
          }
        }
      }

      await setScrollTop(page, 0);
      await nav
        .getByRole("link", { name: "Presentation", exact: true })
        .click();
      await waitForSection(page, "practice-presentation", "Presentation");
      await expect(
        page.getByRole("heading", { name: "Patient presentation" })
      ).toBeInViewport();
      await expectDesktopShellStable(page);

      const atBottom = await readScroller(page);
      await setScrollTop(page, Math.max(0, atBottom.scrollTop - 240));
      const nudged = await readScroller(page);
      const nudgedExpected = selectPracticeSection({
        scrollTop: nudged.scrollTop,
        maxScroll: nudged.maxScroll,
        activationOffset: nudged.offset,
        sections: nudged.sections,
      });
      await expectActive(page, labelFor(nudgedExpected!));

      await setScrollTop(page, nudged.maxScroll);
      await expectActive(page, "Presentation");
      await nav.getByRole("link", { name: "Identity", exact: true }).click();
      await waitForSection(page, "practice-identity", "Identity");
      await expect(
        page.getByRole("heading", { name: "Practice identity" })
      ).toBeInViewport();
      await expectDesktopShellStable(page);

      for (let count = 0; count < 3; count += 1) {
        await nav.getByRole("link", { name: "Identity", exact: true }).click();
        await nav
          .getByRole("link", { name: "Presentation", exact: true })
          .click();
      }
      await waitForSection(page, "practice-presentation", "Presentation");
      await expectDesktopShellStable(page);
      await nav.getByRole("link", { name: "Emergency", exact: true }).click();
      await nav.getByRole("link", { name: "Branding", exact: true }).click();
      await nav.getByRole("link", { name: "Contact", exact: true }).click();
      await nav.getByRole("link", { name: "Identity", exact: true }).click();
      await waitForSection(page, "practice-identity", "Identity");
      await expectDesktopShellStable(page);

      const heightAfter = (await readScroller(page)).scrollHeight;
      expect(Math.abs(heightAfter - heightBefore)).toBeLessThan(80);
      await expectNoHorizontalOverflow(page);
      expect(errors).toEqual([]);
    });
  }

  test("wheel scrolling updates the active section and returns control after a click", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = await openPractice(page);
    const scroller = page.locator(".staffAppScroller");
    const box = await scroller.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width * 0.7, box!.y + 220);
    for (let step = 0; step < 18; step += 1) {
      await page.mouse.wheel(0, 500);
    }
    await expect
      .poll(async () => scroller.evaluate((node) => node.scrollTop))
      .toBeGreaterThan(400);
    await expect.poll(async () => activeLabel(page)).not.toBe("Identity");
    await expectDesktopShellStable(page);

    const max = await scroller.evaluate(
      (node) => node.scrollHeight - node.clientHeight
    );
    await setScrollTop(page, max);
    await expectActive(page, "Presentation");

    for (let step = 0; step < 24; step += 1) {
      await page.mouse.wheel(0, -500);
    }
    await expect
      .poll(async () => scroller.evaluate((node) => node.scrollTop))
      .toBeLessThan(80);
    await expectActive(page, "Identity");
    await expectDesktopShellStable(page);
    expect(errors).toEqual([]);
  });

  test("preserves form state, sticky save, and dynamic branding height", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = await openPractice(page);
    const displayName = page.getByLabel("Display name");
    await displayName.fill("Riverside section nav");
    await expect(page.locator("[data-save-state='unsaved']")).toBeVisible();

    const nav = page.getByRole("navigation", { name: "Practice sections" });
    await nav.getByRole("link", { name: "Branding", exact: true }).click();
    await waitForSection(page, "practice-branding", "Branding");
    const darkBranding = page.getByRole("checkbox", {
      name: "Use custom Dark branding",
    });
    await darkBranding.evaluate((node) => {
      const scroller = document.querySelector(".staffAppScroller");
      if (
        !(scroller instanceof HTMLElement) ||
        !(node instanceof HTMLElement)
      ) {
        return;
      }
      const top =
        node.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop;
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      scroller.scrollTop = Math.min(max, Math.max(0, top - 200));
    });
    await darkBranding.check();
    await expect(page.locator("#darkPrimaryColor")).toBeAttached();
    await expect(displayName).toHaveValue("Riverside section nav");

    const max = await page
      .locator(".staffAppScroller")
      .evaluate((node) => node.scrollHeight - node.clientHeight);
    await setScrollTop(page, max);
    await expectActive(page, "Presentation");
    await expect(
      page.locator(".staffPracticeSave").getByRole("button", {
        name: "Save changes",
      })
    ).toBeVisible();
    await expect(
      page.locator("nav[aria-label='Practice sections']")
    ).toBeVisible();

    await nav.getByRole("link", { name: "Identity", exact: true }).click();
    await waitForSection(page, "practice-identity", "Identity");
    await expect(displayName).toHaveValue("Riverside section nav");
    await expect(darkBranding).toBeChecked();
    await expect(page.locator("[data-save-state='unsaved']")).toBeVisible();
    await expectDesktopShellStable(page);

    await darkBranding.evaluate((node) => {
      const scroller = document.querySelector(".staffAppScroller");
      if (
        !(scroller instanceof HTMLElement) ||
        !(node instanceof HTMLElement)
      ) {
        return;
      }
      const top =
        node.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop;
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      scroller.scrollTop = Math.min(max, Math.max(0, top - 200));
    });
    await darkBranding.uncheck();
    await expect(page.locator("#darkPrimaryColor")).toHaveCount(0);
    const nextMax = await page
      .locator(".staffAppScroller")
      .evaluate((node) => node.scrollHeight - node.clientHeight);
    await setScrollTop(page, nextMax);
    await expectActive(page, "Presentation");
    await expect(displayName).toHaveValue("Riverside section nav");
    await expectDesktopShellStable(page);
    expect(errors).toEqual([]);
  });

  test("keeps the narrow and mobile practice page intact", async ({ page }) => {
    const errors = await openPractice(page);

    await page.setViewportSize({ width: 800, height: 900 });
    await expect(
      page.getByRole("navigation", { name: "Practice sections" })
    ).toHaveCount(0);
    const displayName = page.getByLabel("Display name");
    await displayName.fill("Narrow practice");
    const scroller = page.locator(".staffAppScroller");
    await scroller.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await expect.poll(async () => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(
      page.getByRole("heading", { name: "Patient presentation" })
    ).toBeInViewport();
    await expect(displayName).toHaveValue("Narrow practice");
    const shell = await page.locator(".staffAppShell").boundingBox();
    expect(shell?.y ?? 99).toBeGreaterThan(-2);
    expect(shell?.y ?? 99).toBeLessThan(3);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("navigation", { name: "Practice sections" })
    ).toHaveCount(0);
    await displayName.fill("Mobile practice");
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await expect(
      page.getByRole("heading", { name: "Patient presentation" })
    ).toBeInViewport();
    const gap = await page.evaluate(() => {
      const section = document.getElementById("practice-presentation");
      if (!(section instanceof HTMLElement)) {
        return 9999;
      }
      return (
        document.documentElement.scrollHeight -
        (section.getBoundingClientRect().bottom + window.scrollY)
      );
    });
    expect(gap).toBeGreaterThan(-4);
    expect(gap).toBeLessThan(280);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(displayName).toHaveValue("Mobile practice");
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });

  test("scrolls without animation when reduced motion is requested", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors = await openPractice(page);
    const started = Date.now();
    await page
      .getByRole("navigation", { name: "Practice sections" })
      .getByRole("link", { name: "Presentation", exact: true })
      .click();
    await expectActive(page, "Presentation");
    expect(Date.now() - started).toBeLessThan(1_500);
    await expectDesktopShellStable(page);
    await page
      .getByRole("navigation", { name: "Practice sections" })
      .getByRole("link", { name: "Identity", exact: true })
      .click();
    await expectActive(page, "Identity");
    expect(errors).toEqual([]);
  });
});
