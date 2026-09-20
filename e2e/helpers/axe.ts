import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

export async function setPortalColorScheme(
  page: Page,
  scheme: "light" | "dark"
): Promise<void> {
  await page.emulateMedia({ colorScheme: scheme });
  const appearance = page.locator("aside").getByRole("button", {
    name: /Appearance, colour theme currently/,
  });
  const dialogOpen = (await page.locator("dialog[open]").count()) > 0;
  if (
    !dialogOpen &&
    (await appearance.count()) > 0 &&
    (await appearance.first().isVisible())
  ) {
    const current = await page.locator("html").getAttribute("data-theme-mode");
    if (current !== scheme) {
      await appearance.click();
      await page
        .getByRole("radiogroup", { name: "Colour theme" })
        .getByRole("radio", {
          name: scheme === "dark" ? "Dark" : "Light",
          exact: true,
        })
        .click();
    }
  } else {
    await page.evaluate((mode) => {
      try {
        window.localStorage.setItem("aftercare-guide-portal-theme", mode);
      } catch {
        // Ignore storage failures in restricted contexts.
      }
      document.documentElement.setAttribute("data-theme-mode", mode);
    }, scheme);
  }

  await expect(page.locator("html")).toHaveAttribute("data-theme-mode", scheme);
  await expect
    .poll(async () =>
      page
        .locator("html")
        .evaluate((element) => getComputedStyle(element).colorScheme)
    )
    .toBe(scheme);
  await expect
    .poll(async () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--staff-ink")
          .trim()
      )
    )
    .toBe(scheme === "dark" ? "#f3f4f8" : "#0a0d14");
  await expect
    .poll(async () =>
      page.evaluate((mode) => {
        const current = document.querySelector(
          "aside .staffNavRow[aria-current]"
        );
        if (!(current instanceof HTMLElement)) {
          return true;
        }
        const style = getComputedStyle(current);
        if (mode === "dark") {
          return (
            style.color === "rgb(196, 206, 255)" &&
            style.backgroundColor === "rgb(37, 42, 72)"
          );
        }
        return (
          style.color === "rgb(59, 75, 209)" &&
          style.backgroundColor === "rgb(238, 240, 251)"
        );
      }, scheme)
    )
    .toBe(true);
  await expect
    .poll(async () =>
      page.evaluate((mode) => {
        const parseRgb = (value: string) => {
          const match = value.match(
            /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/
          );
          if (!match) {
            return null;
          }
          return {
            r: Number(match[1]) / 255,
            g: Number(match[2]) / 255,
            b: Number(match[3]) / 255,
          };
        };
        const luminance = (rgb: { r: number; g: number; b: number }) =>
          0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;

        const visible = [
          ...document.querySelectorAll(".staffBtnSecondary"),
        ].filter(
          (element): element is HTMLButtonElement =>
            element instanceof HTMLButtonElement &&
            !element.disabled &&
            element.checkVisibility({
              opacityProperty: true,
              visibilityProperty: true,
              contentVisibilityAuto: true,
            })
        );
        if (visible.length === 0) {
          return true;
        }
        return visible.every((element) => {
          const style = getComputedStyle(element);
          const background = parseRgb(style.backgroundColor);
          const foreground = parseRgb(style.color);
          if (!background || !foreground) {
            return false;
          }
          const backgroundLum = luminance(background);
          const foregroundLum = luminance(foreground);
          const lighter = Math.max(backgroundLum, foregroundLum);
          const darker = Math.min(backgroundLum, foregroundLum);
          const contrast = (lighter + 0.05) / (darker + 0.05);
          const backgroundSettled =
            mode === "dark" ? backgroundLum < 0.3 : backgroundLum > 0.7;
          const foregroundSettled =
            mode === "dark" ? foregroundLum > 0.7 : foregroundLum < 0.3;
          return backgroundSettled && foregroundSettled && contrast >= 4.5;
        });
      }, scheme)
    )
    .toBe(true);
}

export async function expectNoSeriousAxeViolations(
  page: Page,
  options: { exclude?: string | string[] } = {}
): Promise<void> {
  await expect
    .poll(async () => (await page.title()).trim(), { timeout: 10_000 })
    .not.toBe("");

  let builder = new AxeBuilder({ page });
  const exclude = options.exclude;
  if (exclude) {
    for (const selector of Array.isArray(exclude) ? exclude : [exclude]) {
      builder = builder.exclude(selector);
    }
  }
  const results = await builder.analyze();
  const blocking = results.violations.filter(
    (violation) =>
      violation.impact === "critical" || violation.impact === "serious"
  );

  expect(
    blocking,
    blocking
      .map(
        (violation) =>
          `${violation.id} (${violation.impact}): ${violation.help}\n${violation.nodes
            .map(
              (node) => `  ${node.target.join(" ")} — ${node.failureSummary}`
            )
            .join("\n")}`
      )
      .join("\n\n")
  ).toEqual([]);
}

export async function expectNoSeriousAxeViolationsLightAndDark(
  page: Page,
  options: { darkExclude?: string | string[] } = {}
): Promise<void> {
  await setPortalColorScheme(page, "light");
  await expectNoSeriousAxeViolations(page);
  await setPortalColorScheme(page, "dark");
  await expectNoSeriousAxeViolations(page, { exclude: options.darkExclude });
  await setPortalColorScheme(page, "light");
}
