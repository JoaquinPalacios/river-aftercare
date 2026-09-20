import { expect, test, type Page } from "@playwright/test";

import { setPortalColorScheme } from "./helpers/axe";
import {
  localAdminCredentials,
  signInAsLocalAdmin,
} from "./helpers/staff-auth";
import { marketingUrl, staffUrl } from "./helpers/origins";

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

async function delayRouteFlights(page: Page, ms = 450): Promise<void> {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const headers = request.headers();
    const isFlight =
      request.method() === "GET" &&
      (headers.rsc === "1" ||
        headers["next-router-prefetch"] !== undefined ||
        request.url().includes("_rsc="));
    if (isFlight) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
    await route.continue();
  });
}

function progress(page: Page) {
  return page.locator("[data-navigation-progress]");
}

function marketingNav(page: Page) {
  return page.getByRole("navigation", { name: "Marketing" });
}

function mobileNavPanel(page: Page) {
  return page.locator("[class*='navMenuPanel']");
}

async function clickMobileNavLink(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Site menu" }).click();
  await mobileNavPanel(page).getByRole("link", { name }).click();
}

async function clickSyntheticLink(
  page: Page,
  href: string,
  preventDefault = true
): Promise<void> {
  await page.evaluate(
    ({ nextHref, shouldPreventDefault }) => {
      const anchor = document.createElement("a");
      anchor.href = nextHref;
      anchor.textContent = "Synthetic";
      document.body.append(anchor);
      if (shouldPreventDefault) {
        anchor.addEventListener(
          "click",
          (event) => {
            event.preventDefault();
          },
          { once: true }
        );
      }
      anchor.click();
      anchor.remove();
    },
    { nextHref: href, shouldPreventDefault: preventDefault }
  );
}

async function progressTokens(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-navigation-progress]");
    if (!(root instanceof HTMLElement)) {
      throw new Error("missing progress");
    }

    const probe = document.createElement("span");
    root.append(probe);
    const read = (token: string) => {
      probe.style.color = `var(${token})`;
      return getComputedStyle(probe).color;
    };
    const start = read("--progress-start");
    const mid = read("--progress-mid");
    const end = read("--progress-end");
    probe.remove();
    const styles = getComputedStyle(root);
    return {
      start,
      mid,
      end,
      height: styles.height,
      top: styles.top,
      position: styles.position,
      zIndex: styles.zIndex,
    };
  });
}

test.describe("navigation progress", () => {
  test("mounts a hidden master-brand bar on marketing and staff", async ({
    page,
  }) => {
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await expect(progress(page)).toHaveCount(1);
    await expect(progress(page)).toHaveAttribute("aria-hidden", "true");
    await expect(progress(page)).toHaveAttribute("data-phase", "idle");
    await expect(progress(page)).toHaveAttribute("data-visible", "false");
    await expect(progress(page)).toHaveCSS("pointer-events", "none");

    await page.goto(staffUrl("/login"), { waitUntil: "load" });
    await expect(progress(page)).toHaveCount(1);
    await expect(progress(page)).toHaveAttribute("data-phase", "idle");
  });

  test("starts on an internal marketing link and completes at the destination", async ({
    page,
  }) => {
    await delayRouteFlights(page);
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "dark");

    const about = marketingNav(page).getByRole("link", { name: "About" });
    await about.click();

    await expect
      .poll(async () => progress(page).getAttribute("data-visible"))
      .toBe("true");
    await page.screenshot({
      path: "test-results/artifacts/progress-home-to-about-dark.png",
    });

    await expect(page).toHaveURL(marketingUrl("/about"));
    await expect
      .poll(async () => progress(page).getAttribute("data-phase"))
      .toBe("idle");
    await expect(progress(page)).toHaveAttribute("data-visible", "false");
  });

  test("fast prefetched navigations never show the bar", async ({ page }) => {
    await page.goto(marketingUrl("/"), { waitUntil: "load" });

    const about = marketingNav(page).getByRole("link", { name: "About" });
    await Promise.all([page.waitForURL(marketingUrl("/about")), about.click()]);

    await expect(progress(page)).toHaveAttribute("data-visible", "false");
    await expect(progress(page)).toHaveAttribute("data-phase", "idle");

    await Promise.all([
      page.waitForURL(marketingUrl("/pricing")),
      marketingNav(page).getByRole("link", { name: "Pricing" }).click(),
    ]);
    await expect(progress(page)).toHaveAttribute("data-visible", "false");
  });

  test("destination stays interactive while a slow navigation completes", async ({
    page,
  }) => {
    await delayRouteFlights(page, 500);
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await marketingNav(page).getByRole("link", { name: "About" }).click();
    await expect(page).toHaveURL(marketingUrl("/about"));
    await marketingNav(page).getByRole("link", { name: "Pricing" }).click();
    await expect(page).toHaveURL(marketingUrl("/pricing"));
  });

  test("back and forward observe history without remaining stuck", async ({
    page,
  }) => {
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await marketingNav(page).getByRole("link", { name: "About" }).click();
    await expect(page).toHaveURL(marketingUrl("/about"));
    await page.goBack();
    await expect(page).toHaveURL(marketingUrl("/"));
    await expect
      .poll(async () => progress(page).getAttribute("data-phase"))
      .toBe("idle");
    await page.goForward();
    await expect(page).toHaveURL(marketingUrl("/about"));
    await expect
      .poll(async () => progress(page).getAttribute("data-phase"))
      .toBe("idle");
  });

  test("does not start for same-route, hash, or cross-origin staff sign-in", async ({
    page,
  }) => {
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await page
      .getByRole("banner")
      .getByRole("link", { name: "River Aftercare" })
      .click();
    await expect(progress(page)).toHaveAttribute("data-phase", "idle");

    const signIn = marketingNav(page)
      .getByRole("link", { name: "Sign in", exact: true })
      .filter({ visible: true });
    await expect(signIn).toHaveAttribute("href", staffUrl("/login"));
    await signIn.click({ noWaitAfter: true });
    await expect(progress(page)).toHaveAttribute("data-phase", "idle");
    await expect(page).toHaveURL(staffUrl("/login"));
    await expect(progress(page)).toHaveAttribute("data-phase", "idle");

    await page.goto(marketingUrl("/about"), { waitUntil: "load" });
    await clickSyntheticLink(page, "#content", false);
    await expect(progress(page)).toHaveAttribute("data-phase", "idle");

    await clickSyntheticLink(page, "https://example.com/docs");
    await expect(progress(page)).toHaveAttribute("data-phase", "idle");
    await clickSyntheticLink(page, "mailto:hello@example.test");
    await expect(progress(page)).toHaveAttribute("data-phase", "idle");
    expect(new URL(page.url()).pathname).toBe("/about");
  });

  test("theme switching does not start route progress", async ({ page }) => {
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    const trigger = page.getByRole("button", { name: /Change colour theme/ });
    await trigger.click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-mode",
      "dark"
    );
    await expect(progress(page)).toHaveAttribute("data-phase", "idle");
  });

  test("resolves Light and Dark master tokens without vertical accents", async ({
    page,
  }) => {
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    const light = await progressTokens(page);
    expect(light.position).toBe("fixed");
    expect(light.top).toBe("0px");
    expect(Number.parseFloat(light.height)).toBeLessThanOrEqual(3);
    expect(light.zIndex).toBe("40");
    expect(light.start.toLowerCase()).toMatch(/#3b4bd1|rgb\(59, 75, 209\)/);
    expect(light.end.toLowerCase()).toMatch(/#146f88|rgb\(20, 111, 136\)/);

    await showMarketingScheme(page, "dark");
    const dark = await progressTokens(page);
    expect(dark.start.toLowerCase()).toMatch(/#7c8cff|rgb\(124, 140, 255\)/);
    expect(dark.mid.toLowerCase()).toMatch(/#a6b8ff|rgb\(166, 184, 255\)/);
    expect(dark.end.toLowerCase()).toMatch(/#7ec8e6|rgb\(126, 200, 230\)/);
  });

  test("uses the loader for clinic vertical navigation and light pricing", async ({
    page,
  }) => {
    await delayRouteFlights(page, 500);

    await page.goto(marketingUrl("/clinics"), { waitUntil: "load" });
    await showMarketingScheme(page, "dark");
    await page.setViewportSize({ width: 1280, height: 800 });
    await marketingNav(page)
      .getByRole("button", { name: "For clinics" })
      .click();
    await marketingNav(page).getByRole("link", { name: "Dental" }).click();
    await expect
      .poll(async () => progress(page).getAttribute("data-visible"))
      .toBe("true");
    await page.screenshot({
      path: "test-results/artifacts/progress-clinics-to-dental-dark.png",
    });
    await expect(page).toHaveURL(marketingUrl("/dental"));

    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await marketingNav(page).getByRole("link", { name: "Pricing" }).click();
    await expect
      .poll(async () => progress(page).getAttribute("data-visible"))
      .toBe("true");
    await page.screenshot({
      path: "test-results/artifacts/progress-home-to-pricing-light.png",
    });
    await expect(page).toHaveURL(marketingUrl("/pricing"));
  });

  test("stays visible above the mobile header in both themes", async ({
    page,
  }) => {
    await delayRouteFlights(page, 500);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "dark");
    await clickMobileNavLink(page, "About");
    await expect
      .poll(async () => progress(page).getAttribute("data-visible"))
      .toBe("true");
    const darkBox = await progress(page).boundingBox();
    expect(darkBox?.y).toBe(0);
    await page.screenshot({
      path: "test-results/artifacts/progress-mobile-dark-390.png",
    });
    await expect(page).toHaveURL(marketingUrl("/about"));

    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await clickMobileNavLink(page, "Pricing");
    await expect
      .poll(async () => progress(page).getAttribute("data-visible"))
      .toBe("true");
    await page.screenshot({
      path: "test-results/artifacts/progress-mobile-light-390.png",
    });
  });

  test("uses the same River loader on authenticated staff routes", async ({
    page,
  }) => {
    await signInAsLocalAdmin(page);
    await delayRouteFlights(page, 500);
    await setPortalColorScheme(page, "dark");
    await page
      .locator(".staffAppSidebar")
      .getByRole("link", { name: "Guides" })
      .click();
    await expect
      .poll(async () => progress(page).getAttribute("data-visible"))
      .toBe("true");
    const dark = await progressTokens(page);
    expect(dark.start.toLowerCase()).toMatch(/#7c8cff|rgb\(124, 140, 255\)/);
    await page.screenshot({
      path: "test-results/artifacts/progress-dashboard-dark.png",
    });
    await expect(page).toHaveURL(staffUrl("/guides"));

    await page.goto(staffUrl("/dashboard"), { waitUntil: "load" });
    await setPortalColorScheme(page, "light");
    await page
      .locator(".staffAppSidebar")
      .getByRole("link", { name: "Account" })
      .click();
    await expect
      .poll(async () => progress(page).getAttribute("data-visible"))
      .toBe("true");
    const light = await progressTokens(page);
    expect(light.start.toLowerCase()).toMatch(/#3b4bd1|rgb\(59, 75, 209\)/);
    expect(light.end.toLowerCase()).toMatch(/#146f88|rgb\(20, 111, 136\)/);
    await page.screenshot({
      path: "test-results/artifacts/progress-dashboard-light.png",
    });
    await expect(page).toHaveURL(staffUrl("/account"));
  });

  test("keeps login pending local and only starts route progress after success", async ({
    page,
  }) => {
    const credentials = localAdminCredentials();
    expect(credentials).not.toBeNull();

    await page.goto(staffUrl("/login"), { waitUntil: "load" });
    await page.getByLabel("Email").fill("nobody@example.test");
    await page.getByLabel("Password", { exact: true }).fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("#login-form-error")).toContainText(
      "Invalid email or password."
    );
    await expect(progress(page)).toHaveAttribute("data-phase", "idle");
    await expect(page).toHaveURL(staffUrl("/login"));

    await page.goto(staffUrl("/login"), { waitUntil: "load" });
    await page.route("**/api/auth/login", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.continue();
    });
    await delayRouteFlights(page, 500);
    await page.getByLabel("Email").fill(credentials!.email);
    await page
      .getByLabel("Password", { exact: true })
      .fill(credentials!.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByRole("button", { name: "Signing in…" })
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/login-pending.png",
    });
    await expect
      .poll(async () => progress(page).getAttribute("data-visible"))
      .toBe("true");
    await page.screenshot({
      path: "test-results/artifacts/login-redirect-progress.png",
    });
    await expect(page).not.toHaveURL(/\/login$/);
    await expect
      .poll(async () => progress(page).getAttribute("data-phase"))
      .toBe("idle");
  });

  test("reduced motion still exposes a visible bar without stepped width motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await delayRouteFlights(page, 500);
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await marketingNav(page).getByRole("link", { name: "About" }).click();
    await expect
      .poll(async () => progress(page).getAttribute("data-visible"))
      .toBe("true");
    const duration = await page
      .locator(".navigationProgressBar")
      .evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(duration === "0s" || duration === "0ms").toBe(true);
    await expect(page).toHaveURL(marketingUrl("/about"));
  });
});
