import { expect, test, type Page } from "@playwright/test";

import {
  DEMO_TENANT_SLUG,
  marketingUrl,
  staffUrl,
  tenantUrl,
} from "./helpers/origins";
import { signInAsLocalAdmin } from "./helpers/staff-auth";

async function primaryFontFamily(page: Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => getComputedStyle(element).fontFamily);
}

test.describe("product typography", () => {
  test.describe.configure({ mode: "serial" });

  test("does not request Google Fonts on marketing or patient pages", async ({
    page,
  }) => {
    const googleFontRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (
        url.includes("fonts.googleapis.com") ||
        url.includes("fonts.gstatic.com")
      ) {
        googleFontRequests.push(url);
      }
    });

    await page.goto(marketingUrl("/pricing"), { waitUntil: "load" });
    await page.goto(tenantUrl(DEMO_TENANT_SLUG, "/extraction"), {
      waitUntil: "load",
    });

    expect(googleFontRequests).toEqual([]);
  });

  test("marketing, staff, patient, and print resolve Geist as the primary family", async ({
    page,
  }) => {
    const failedFontResponses: string[] = [];
    page.on("response", (response) => {
      const url = response.url();
      if (/\.woff2(\?|$)/i.test(url) && response.status() >= 400) {
        failedFontResponses.push(`${response.status()} ${url}`);
      }
    });

    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await expect
      .poll(async () => primaryFontFamily(page, "h1"))
      .toMatch(/geist/i);
    await page.screenshot({
      path: "test-results/artifacts/phase-2a.5-font-marketing.png",
    });

    await page.goto(staffUrl("/login"), { waitUntil: "load" });
    await expect
      .poll(async () => primaryFontFamily(page, "h1"))
      .toMatch(/geist/i);

    await signInAsLocalAdmin(page);
    await expect
      .poll(async () => primaryFontFamily(page, "h1"))
      .toMatch(/geist/i);
    await page.screenshot({
      path: "test-results/artifacts/phase-2a.5-font-staff.png",
    });

    await page.goto(tenantUrl(DEMO_TENANT_SLUG, "/extraction"), {
      waitUntil: "load",
    });
    await expect
      .poll(async () => primaryFontFamily(page, "h1"))
      .toMatch(/geist/i);
    await page.screenshot({
      path: "test-results/artifacts/phase-2a.5-font-patient.png",
    });

    await page.goto(tenantUrl(DEMO_TENANT_SLUG, "/extraction/print"), {
      waitUntil: "load",
    });
    await page.emulateMedia({ media: "print" });
    await expect
      .poll(async () => primaryFontFamily(page, "h1"))
      .toMatch(/geist/i);
    expect(failedFontResponses).toEqual([]);
  });

  test("practice settings expose curated patient typefaces and apply Inter on tenant pages only", async ({
    page,
  }) => {
    const googleFontRequests: string[] = [];
    const failedFontResponses: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (
        url.includes("fonts.googleapis.com") ||
        url.includes("fonts.gstatic.com")
      ) {
        googleFontRequests.push(url);
      }
    });
    page.on("response", (response) => {
      const url = response.url();
      if (/\.woff2(\?|$)/i.test(url) && response.status() >= 400) {
        failedFontResponses.push(`${response.status()} ${url}`);
      }
    });

    await signInAsLocalAdmin(page);
    await page.goto(staffUrl("/practice"), { waitUntil: "load" });
    const typeface = page.locator("#typeface");
    await expect(typeface.locator("option")).toHaveText([
      "River Aftercare default",
      "Open Sans",
      "Roboto",
      "Montserrat",
      "Lato",
      "Poppins",
      "Inter",
    ]);

    try {
      await typeface.selectOption("OPEN_SANS");
      await page
        .getByRole("button", { name: "Save changes" })
        .filter({ visible: true })
        .click();
      await expect(page.locator("[data-save-state=saved]")).toBeVisible();
      await page.goto(tenantUrl(DEMO_TENANT_SLUG, "/extraction"), {
        waitUntil: "load",
      });
      await expect
        .poll(async () => primaryFontFamily(page, "h1"))
        .toMatch(/open\s*sans/i);

      await page.goto(staffUrl("/practice"), { waitUntil: "load" });
      await page.locator("#typeface").selectOption("INTER");
      await page
        .getByRole("button", { name: "Save changes" })
        .filter({ visible: true })
        .click();
      await expect(page.locator("[data-save-state=saved]")).toBeVisible();
      await page.goto(tenantUrl(DEMO_TENANT_SLUG, "/extraction"), {
        waitUntil: "load",
      });
      await expect
        .poll(async () => primaryFontFamily(page, "h1"))
        .toMatch(/inter/i);

      await page.goto(marketingUrl("/pricing"), { waitUntil: "load" });
      await expect
        .poll(async () => primaryFontFamily(page, "h1"))
        .toMatch(/geist/i);
      expect(googleFontRequests).toEqual([]);
      expect(failedFontResponses).toEqual([]);
    } finally {
      await page.goto(staffUrl("/practice"), { waitUntil: "load" });
      await page.locator("#typeface").selectOption("");
      await page
        .getByRole("button", { name: "Save changes" })
        .filter({ visible: true })
        .click();
      await expect(page.locator("[data-save-state=saved]")).toBeVisible();
    }
  });
});
