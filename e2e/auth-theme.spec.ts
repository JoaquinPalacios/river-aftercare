import { expect, test, type Page } from "@playwright/test";

import { marketingUrl, staffUrl } from "./helpers/origins";

const DARK_CANVAS = "rgb(12, 14, 20)";
const LIGHT_CANVAS = "rgb(244, 245, 248)";
const DARK_PANEL = "rgb(21, 24, 34)";
const LIGHT_PANEL = "rgb(255, 255, 255)";
const DARK_INK = "rgb(243, 244, 248)";
const LIGHT_INK = "rgb(10, 13, 20)";

async function readAuthSurfaces(page: Page) {
  return page.evaluate(() => {
    const pageEl = document.querySelector(".staffAuthPage");
    const card = document.querySelector(".staffAuthCard");
    const title = document.querySelector(".staffAuthCard h1");
    const input = document.querySelector(".staffLoginField");
    const button = document.querySelector(".staffBtnPrimary");
    const link = document.querySelector(
      ".staffBackLink, .staffAuthCard a[href]"
    );
    if (
      !(pageEl instanceof HTMLElement) ||
      !(card instanceof HTMLElement) ||
      !(title instanceof HTMLElement)
    ) {
      return null;
    }
    return {
      mode: document.documentElement.getAttribute("data-theme-mode"),
      scheme: getComputedStyle(document.documentElement).colorScheme,
      page: getComputedStyle(pageEl).backgroundColor,
      card: getComputedStyle(card).backgroundColor,
      text: getComputedStyle(title).color,
      input:
        input instanceof HTMLElement
          ? getComputedStyle(input).backgroundColor
          : null,
      button:
        button instanceof HTMLElement
          ? getComputedStyle(button).backgroundColor
          : null,
      link: link instanceof HTMLElement ? getComputedStyle(link).color : null,
    };
  });
}

async function chooseMarketingTheme(page: Page, name: "Dark" | "Light") {
  await page.getByRole("button", { name: /Change colour theme/ }).click();
  await page.getByRole("menuitemradio", { name }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-mode",
    name.toLowerCase()
  );
}

async function signInFromMarketing(page: Page) {
  const signIn = page.getByRole("link", { name: "Sign in" }).first();
  await expect(signIn).toHaveAttribute("href", /[?&]ui-theme=/);
  await signIn.click();
  await expect(page).toHaveURL(/\/login/);
}

test.describe("auth light and dark theming", () => {
  test("system plus dark OS renders dark auth without an explicit store", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(staffUrl("/login"), { waitUntil: "load" });
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-mode",
      "system"
    );
    const surfaces = await readAuthSurfaces(page);
    expect(surfaces?.page).toBe(DARK_CANVAS);
    expect(surfaces?.card).toBe(DARK_PANEL);
    expect(surfaces?.text).toBe(DARK_INK);
    expect(surfaces?.input).toBe(DARK_CANVAS);
    expect(surfaces?.button).toBe("rgb(59, 75, 209)");
  });

  test("system plus light OS renders light auth", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(staffUrl("/login"), { waitUntil: "load" });
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-mode",
      "system"
    );
    const surfaces = await readAuthSurfaces(page);
    expect(surfaces?.page).toBe(LIGHT_CANVAS);
    expect(surfaces?.card).toBe(LIGHT_PANEL);
    expect(surfaces?.text).toBe(LIGHT_INK);
    expect(surfaces?.input).toBe(LIGHT_PANEL);
  });

  test("explicit dark stays dark against a light OS", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.addInitScript(() => {
      window.localStorage.setItem("aftercare-guide-portal-theme", "dark");
    });
    await page.goto(staffUrl("/login"), { waitUntil: "load" });
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-mode",
      "dark"
    );
    const surfaces = await readAuthSurfaces(page);
    expect(surfaces?.page).toBe(DARK_CANVAS);
    expect(surfaces?.card).toBe(DARK_PANEL);
    expect(surfaces?.text).toBe(DARK_INK);
  });

  test("explicit light stays light against a dark OS", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(() => {
      window.localStorage.setItem("aftercare-guide-portal-theme", "light");
    });
    await page.goto(staffUrl("/login"), { waitUntil: "load" });
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-mode",
      "light"
    );
    const surfaces = await readAuthSurfaces(page);
    expect(surfaces?.page).toBe(LIGHT_CANVAS);
    expect(surfaces?.card).toBe(LIGHT_PANEL);
    expect(surfaces?.text).toBe(LIGHT_INK);
  });

  test("marketing dark survives navigation to sign in", async ({ page }) => {
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await chooseMarketingTheme(page, "Dark");

    await signInFromMarketing(page);
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-mode",
      "dark"
    );
    const surfaces = await readAuthSurfaces(page);
    expect(surfaces?.page).toBe(DARK_CANVAS);
    expect(surfaces?.card).toBe(DARK_PANEL);
  });

  test("marketing light survives navigation to sign in", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await chooseMarketingTheme(page, "Light");

    await signInFromMarketing(page);
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-mode",
      "light"
    );
    const surfaces = await readAuthSurfaces(page);
    expect(surfaces?.page).toBe(LIGHT_CANVAS);
  });

  test("hard reload of login keeps the stored dark preference", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("aftercare-guide-portal-theme", "dark");
    });
    await page.goto(staffUrl("/login"), { waitUntil: "load" });
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-mode",
      "dark"
    );
    await page.reload({ waitUntil: "load" });
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-mode",
      "dark"
    );
    const surfaces = await readAuthSurfaces(page);
    expect(surfaces?.page).toBe(DARK_CANVAS);
    expect(surfaces?.card).toBe(DARK_PANEL);
  });

  test("forgot-password inherits the same theme behaviour", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(staffUrl("/forgot-password"), { waitUntil: "load" });
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-mode",
      "system"
    );
    const surfaces = await readAuthSurfaces(page);
    expect(surfaces?.page).toBe(DARK_CANVAS);
    expect(surfaces?.card).toBe(DARK_PANEL);
    expect(surfaces?.text).toBe(DARK_INK);
    expect(surfaces?.input).toBe(DARK_CANVAS);

    await page.evaluate(() => {
      window.localStorage.setItem("aftercare-guide-portal-theme", "light");
    });
    await page.reload({ waitUntil: "load" });
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-mode",
      "light"
    );
    const lightSurfaces = await readAuthSurfaces(page);
    expect(lightSurfaces?.page).toBe(LIGHT_CANVAS);
    expect(lightSurfaces?.card).toBe(LIGHT_PANEL);
  });
});
