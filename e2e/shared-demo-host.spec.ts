import { expect, test } from "@playwright/test";

import {
  expectGenericNotFound,
  expectOneH1,
  expectPublicTenantUrl,
} from "./helpers/assertions";
import { DEMO_TENANT_SLUG, tenantUrl } from "./helpers/origins";

const SHARED_HOST = "demo";
const HOSTS = [DEMO_TENANT_SLUG, SHARED_HOST] as const;

for (const host of HOSTS) {
  test.describe(`${host} shared demo`, () => {
    test("serves Tooth Extraction with its timeline and preserved first-day heading", async ({
      page,
    }) => {
      const extraction = tenantUrl(host, "/extraction");
      const response = await page.goto(extraction, { waitUntil: "load" });

      expect(response?.status()).toBe(200);
      await expectPublicTenantUrl(page, extraction);
      await expectOneH1(page, "Tooth Extraction");
      await expect(page.getByRole("tab", { name: "Today" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Timeline" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Full guide" })).toBeVisible();
      await page.getByRole("tab", { name: "Full guide" }).click();
      await expect(
        page.getByRole("heading", {
          name: "The first day at Riverside Dental Demo",
        })
      ).toBeVisible();
      await expect(
        page.getByRole("link", {
          name: "River Aftercare Demo Clinic",
          exact: true,
        })
      ).toBeVisible();
      await expect(page.getByRole("link", { name: /^Call / })).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "Practice contact page" })
      ).toHaveCount(0);
      await expect(
        page.getByText(/fictional demonstration clinic/i)
      ).toBeVisible();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        extraction
      );
    });

    test("serves the physiotherapy guide as one document", async ({ page }) => {
      const guide = tenantUrl(host, "/home-exercise-plan");
      const response = await page.goto(guide, { waitUntil: "load" });

      expect(response?.status()).toBe(200);
      await expectPublicTenantUrl(page, guide);
      await expectOneH1(page, "Physiotherapy Home Exercise Plan");
      await expect(page.getByRole("tablist")).toHaveCount(0);
      await expect(page.getByRole("tab", { name: "Timeline" })).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "Print / Save PDF" })
      ).toHaveAttribute("href", "/home-exercise-plan/print");
      await expect(
        page.getByRole("link", {
          name: "River Aftercare Demo Clinic",
          exact: true,
        })
      ).toBeVisible();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        guide
      );
    });

    test("prints each guide from its own published snapshot", async ({
      page,
    }) => {
      const dentalPrint = tenantUrl(host, "/extraction/print");
      const physioPrint = tenantUrl(host, "/home-exercise-plan/print");

      const dental = await page.goto(dentalPrint, { waitUntil: "load" });
      expect(dental?.status()).toBe(200);
      await expect(
        page.getByText("SAMPLE / NOT CLINICAL ADVICE")
      ).toBeVisible();
      await expect(page.getByRole("tab")).toHaveCount(0);
      await expect(
        page.getByRole("heading", {
          name: "The first day at Riverside Dental Demo",
        })
      ).toBeVisible();

      const physio = await page.goto(physioPrint, { waitUntil: "load" });
      expect(physio?.status()).toBe(200);
      await expect(
        page.getByText("SAMPLE / NOT CLINICAL ADVICE")
      ).toBeVisible();
      await expect(page.getByRole("tab")).toHaveCount(0);
      await expect(
        page.getByRole("heading", {
          name: "The first day at Riverside Dental Demo",
        })
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Physiotherapy Home Exercise Plan" })
      ).toBeVisible();
    });
  });
}

test("an unknown hostname does not resolve to the shared demo", async ({
  page,
}) => {
  const response = await page.goto(
    tenantUrl("not-the-shared-demo", "/extraction"),
    { waitUntil: "domcontentloaded" }
  );

  expect(response?.status()).toBe(404);
  await expectGenericNotFound(page);
  await expect(
    page.getByRole("heading", { name: "Tooth Extraction" })
  ).toHaveCount(0);
});

test("the shared hostname does not serve staff sign-in", async ({ page }) => {
  const response = await page.goto(tenantUrl(SHARED_HOST, "/login"), {
    waitUntil: "domcontentloaded",
  });

  expect(response?.status()).toBe(404);
  const body = ((await page.textContent("body")) ?? "").toLowerCase();
  expect(body).not.toContain("staff sign in");
  expect(body).not.toContain("password");
  expect(page.url()).not.toContain("/_sites");
});
