import { expect, test } from "@playwright/test";

import { expectNoSeriousAxeViolations } from "./helpers/axe";
import { expectGenericNotFound } from "./helpers/assertions";
import {
  DEMO_TENANT_SLUG,
  marketingUrl,
  staffUrl,
  tenantUrl,
} from "./helpers/origins";

const MISSING = "/this-does-not-exist";
const FORBIDDEN = [
  "prisma",
  "p2022",
  "postgresql",
  "neon",
  "vercel",
  "digest",
  "stack trace",
];

async function expectSafeFailureCopy(page: import("@playwright/test").Page) {
  const body = ((await page.textContent("body")) ?? "").toLowerCase();
  for (const term of FORBIDDEN) {
    expect(body, term).not.toContain(term);
  }
}

test.describe("host-aware 404 and health", () => {
  test("marketing 404 is branded and keyboard-accessible", async ({ page }) => {
    const response = await page.goto(marketingUrl(MISSING), {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Page not found" })
    ).toBeVisible();
    await expect(
      page.getByText(
        "The page you're looking for doesn't exist or may have moved."
      )
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Go home" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Contact us" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Sign in", exact: true })
    ).toHaveCount(0);
    await expectSafeFailureCopy(page);
    await expectNoSeriousAxeViolations(page);
  });

  test("staff 404 uses the staff visual language without leaking tenants", async ({
    page,
  }) => {
    const response = await page.goto(staffUrl(MISSING), {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Page not found" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Back to dashboard" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Riverside Dental Demo" })
    ).toHaveCount(0);
    await expectSafeFailureCopy(page);
    await expectNoSeriousAxeViolations(page);
  });

  test("tenant 404 stays patient-safe and does not expose staff routes", async ({
    page,
  }) => {
    const response = await page.goto(tenantUrl(DEMO_TENANT_SLUG, MISSING), {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(404);
    await expectGenericNotFound(page);
    await expect(
      page.getByRole("link", { name: "Back to aftercare guides" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Back to dashboard" })
    ).toHaveCount(0);
    await expectSafeFailureCopy(page);
    await expectNoSeriousAxeViolations(page);
  });

  test("unknown tenant 404 does not offer a clinic home link", async ({
    page,
  }) => {
    const response = await page.goto(tenantUrl("unknown", MISSING), {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(404);
    await expectGenericNotFound(page);
    await expect(
      page.getByRole("link", { name: "Back to aftercare guides" })
    ).toHaveCount(0);
  });

  test("health is only available on the staff host", async ({ request }) => {
    const healthy = await request.get(staffUrl("/api/health"));
    expect(healthy.status()).toBe(200);
    expect(await healthy.json()).toEqual({ status: "ok" });
    expect(healthy.headers()["cache-control"]).toBe("no-store");

    const marketing = await request.get(marketingUrl("/api/health"));
    expect(marketing.status()).toBe(404);

    const tenant = await request.get(
      tenantUrl(DEMO_TENANT_SLUG, "/api/health")
    );
    expect(tenant.status()).toBe(404);
  });
});

test.describe("host-aware 404 on a phone viewport", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("marketing, staff, and tenant 404s remain readable", async ({
    page,
  }) => {
    const marketing = await page.goto(marketingUrl(MISSING), {
      waitUntil: "domcontentloaded",
    });
    expect(marketing?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Page not found" })
    ).toBeVisible();

    const staff = await page.goto(staffUrl(MISSING), {
      waitUntil: "domcontentloaded",
    });
    expect(staff?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Page not found" })
    ).toBeVisible();

    const tenant = await page.goto(tenantUrl(DEMO_TENANT_SLUG, MISSING), {
      waitUntil: "domcontentloaded",
    });
    expect(tenant?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Page not found" })
    ).toBeVisible();
  });
});
