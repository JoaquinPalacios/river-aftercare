import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { marketingUrl, staffUrl } from "./helpers/origins";

const ARTIFACT_DIR = "test-results/artifacts/reveal-auth-qa";

function artifactPath(name: string) {
  const path = `${ARTIFACT_DIR}/${name}`;
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

async function openAuthTheme(
  page: Page,
  pathname: "/login" | "/forgot-password",
  mode: "light" | "dark"
) {
  await page.goto(staffUrl(pathname), { waitUntil: "load" });
  await page.evaluate((preference) => {
    window.localStorage.setItem("aftercare-guide-portal-theme", preference);
  }, mode);
  await page.reload({ waitUntil: "load" });
  await expect(page.locator("html")).toHaveAttribute("data-theme-mode", mode);
}

async function showSection(page: Page, heading: string) {
  const section = page.getByRole("heading", { name: heading }).first();
  await section.scrollIntoViewIfNeeded();
  await expect(section).toBeVisible();
}

test.describe("reveal and auth visual QA", () => {
  test("homepage workflows concluding reveal", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showSection(
      page,
      "One aftercare platform. Different clinic workflows."
    );
    const link = page.getByRole("link", { name: "Explore all clinic types →" });
    await expect(link).toBeVisible();
    await page.screenshot({
      path: artifactPath("homepage-workflows-reveal.png"),
      fullPage: false,
    });
  });

  test("pricing onboarding concluding reveal", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/pricing"), { waitUntil: "load" });
    await showSection(page, "Start with trusted guidance, then make it yours");
    await expect(
      page.getByText(
        "Where an appropriate River Aftercare template exists, the clinic can use it as a starting point."
      )
    ).toBeVisible();
    await page.screenshot({
      path: artifactPath("pricing-onboarding-reveal.png"),
      fullPage: false,
    });
  });

  test("dental demo status reveal", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/dental"), { waitUntil: "load" });
    await showSection(
      page,
      "Start with an available guide, or bring your own clinic-approved aftercare."
    );
    await expect(page.getByText("Current dental demo")).toBeVisible();
    await page.screenshot({
      path: artifactPath("dental-template-reveal.png"),
      fullPage: false,
    });
  });

  test("login light and dark at 1440 and 390", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openAuthTheme(page, "/login", "light");
    await page.screenshot({ path: artifactPath("login-light-1440.png") });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: artifactPath("login-light-390.png") });

    await page.setViewportSize({ width: 1440, height: 900 });
    await openAuthTheme(page, "/login", "dark");
    await page.screenshot({ path: artifactPath("login-dark-1440.png") });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: artifactPath("login-dark-390.png") });
  });

  test("forgot-password light and dark", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openAuthTheme(page, "/forgot-password", "light");
    await page.screenshot({ path: artifactPath("forgot-password-light.png") });

    await openAuthTheme(page, "/forgot-password", "dark");
    await page.screenshot({ path: artifactPath("forgot-password-dark.png") });
  });

  test("marketing dark to login dark", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await page.getByRole("button", { name: /Change colour theme/ }).click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-mode",
      "dark"
    );
    await page.screenshot({
      path: artifactPath("marketing-dark-before-login.png"),
    });
    await page.getByRole("link", { name: "Sign in" }).first().click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-mode",
      "dark"
    );
    await page.screenshot({
      path: artifactPath("marketing-dark-to-login-dark.png"),
    });
  });

  test("marketing light to login light against a dark OS", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await page.getByRole("button", { name: /Change colour theme/ }).click();
    await page.getByRole("menuitemradio", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-mode",
      "light"
    );
    await page.screenshot({
      path: artifactPath("marketing-light-before-login.png"),
    });
    await page.getByRole("link", { name: "Sign in" }).first().click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-mode",
      "light"
    );
    await page.screenshot({
      path: artifactPath("marketing-light-to-login-light.png"),
    });
  });
});
