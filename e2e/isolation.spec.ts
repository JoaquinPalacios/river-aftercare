import { expect, test } from "@playwright/test";

import { expectGenericNotFound } from "./helpers/assertions";
import { HARBOR } from "./fixtures/harbor";
import {
  DEMO_TENANT_SLUG,
  HARBOR_TENANT_SLUG,
  UNKNOWN_TENANT_SLUG,
  marketingUrl,
  staffUrl,
  tenantUrl,
} from "./helpers/origins";

test.describe("tenant isolation and unpublished content", () => {
  test("unknown tenant returns generic 404 without leaking other tenants", async ({
    page,
  }) => {
    const response = await page.goto(tenantUrl(UNKNOWN_TENANT_SLUG, "/"), {
      waitUntil: "domcontentloaded",
    });

    expect(response?.status()).toBe(404);
    await expectGenericNotFound(page);
    await expect(
      page.getByRole("heading", { name: "Aftercare guides" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "Riverside Dental Demo",
        exact: true,
      })
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Tooth Extraction" })
    ).toHaveCount(0);
  });

  test("tenant B never shows tenant A brand, phone, override, or addition", async ({
    page,
  }) => {
    const response = await page.goto(tenantUrl(HARBOR_TENANT_SLUG, "/"), {
      waitUntil: "load",
    });

    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("link", { name: HARBOR.displayName, exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Tooth Extraction" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: new RegExp(`Call ${HARBOR.displayName}`) })
    ).toBeVisible();

    await expect(
      page.getByRole("link", { name: "Riverside Dental Demo", exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /Call Riverside Dental Demo/ })
    ).toHaveCount(0);
    await expect(page.getByText("Powered by River Aftercare")).toHaveCount(0);
    await expect(
      page.locator('img[src="/demo/riverside-mark.svg"]')
    ).toHaveCount(0);
    const homeBrand = await page
      .locator(".aftercareTheme")
      .evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--cg-brand").trim()
      );
    expect(homeBrand).toContain(HARBOR.primaryColor);
    expect(homeBrand).not.toContain("#0f766e");

    await page.getByRole("link", { name: "Tooth Extraction" }).click();
    await expect(page).toHaveURL(tenantUrl(HARBOR_TENANT_SLUG, "/extraction"));
    await expect(
      page.getByRole("heading", { name: HARBOR.overrideTitle })
    ).toBeVisible();
    await expect(page.getByText(HARBOR.overrideBody)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: HARBOR.additionTitle })
    ).toBeVisible();
    await expect(page.getByText(HARBOR.additionBody)).toBeVisible();

    await expect(
      page.getByRole("link", { name: "Riverside Dental Demo", exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "The first day at Riverside Dental Demo",
      })
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Weekend contact (Riverside demo)" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /Call Riverside Dental Demo/ })
    ).toHaveCount(0);
    await expect(page.getByText("Powered by River Aftercare")).toHaveCount(0);
    await expect(
      page.locator('img[src="/demo/riverside-mark.svg"]')
    ).toHaveCount(0);
  });

  test("draft, disabled, and pinned-draft guides are not publicly reachable", async ({
    page,
  }) => {
    for (const slug of [
      "draft-guide",
      "disabled-guide",
      "pinned-draft",
    ] as const) {
      const response = await page.goto(
        tenantUrl(HARBOR_TENANT_SLUG, `/${slug}`),
        {
          waitUntil: "domcontentloaded",
        }
      );
      expect(response?.status(), slug).toBe(404);
      await expectGenericNotFound(page);
      await expect(
        page.getByRole("heading", { name: "Harbor Draft Guide" })
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Harbor Disabled Guide" })
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Harbor Pinned Draft Revision" })
      ).toHaveCount(0);
    }

    await page.goto(tenantUrl(HARBOR_TENANT_SLUG, "/"), { waitUntil: "load" });
    await expect(
      page.getByRole("link", { name: "Tooth Extraction" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Harbor Draft Guide" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Harbor Disabled Guide" })
    ).toHaveCount(0);
  });
});

test.describe("staff isolation", () => {
  test("tenant hosts do not expose staff or chairside routes", async ({
    page,
  }) => {
    for (const pathname of [
      "/login",
      "/dashboard",
      "/guides",
      "/display/token-like-value",
    ] as const) {
      const response = await page.goto(tenantUrl(DEMO_TENANT_SLUG, pathname), {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status(), pathname).toBe(404);
      const body = ((await page.textContent("body")) ?? "").toLowerCase();
      expect(body).not.toContain("staff sign in");
      expect(body).not.toContain("internal staff workspace");
      expect(body).not.toContain("dashboard");
      expect(body).not.toContain("patient display");
      expect(body).not.toContain("riverside dental demo");
    }
  });

  test("staff host remains available for landing and login", async ({
    page,
  }) => {
    const home = await page.goto(staffUrl("/"), { waitUntil: "load" });
    expect(home?.status()).toBe(200);
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: "Sign in", exact: true })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Clinic portal" })
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Staff sign in" })).toHaveCount(
      0
    );

    const login = await page.goto(staffUrl("/login"), { waitUntil: "load" });
    expect(login?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Sign in", exact: true })
    ).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();

    const dashboard = await page.goto(staffUrl("/dashboard"), {
      waitUntil: "load",
    });
    expect(dashboard?.url()).toContain("/login");

    const guides = await page.goto(staffUrl("/guides"), {
      waitUntil: "load",
    });
    expect(guides?.url()).toContain("/login");

    const newSession = await page.goto(staffUrl("/sessions/new"), {
      waitUntil: "load",
    });
    expect(newSession?.url()).toContain("/login");

    const display = await page.goto(staffUrl("/display/token-like-value"), {
      waitUntil: "load",
    });
    expect(display?.status()).toBe(200);
    await expect(
      page.getByText("This display is not available right now.")
    ).toBeVisible();
  });

  test("direct internal /_sites and /_marketing paths stay blocked", async ({
    page,
  }) => {
    const direct = await page.goto(staffUrl("/_sites/demodental/extraction"), {
      waitUntil: "domcontentloaded",
    });
    expect(direct?.status()).toBe(404);

    const encoded = await page.goto(
      staffUrl("/%5Fsites/demodental/extraction"),
      { waitUntil: "domcontentloaded" }
    );
    expect(encoded?.status()).toBe(404);

    const marketing = await page.goto(staffUrl("/_marketing"), {
      waitUntil: "domcontentloaded",
    });
    expect(marketing?.status()).toBe(404);
  });
});

test.describe("public marketing host", () => {
  test("root domain serves the marketing homepage instead of staff", async ({
    page,
  }) => {
    const home = await page.goto(marketingUrl("/"), { waitUntil: "load" });
    expect(home?.status()).toBe(200);
    await expect(
      page.getByRole("heading", {
        name: "Aftercare that still feels like your clinic.",
      })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View the dental demo" }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Internal staff workspace" })
    ).toHaveCount(0);
    expect(page.url()).not.toContain("/_marketing");
  });

  test("root domain blocks staff routes", async ({ page }) => {
    for (const pathname of ["/login", "/dashboard"] as const) {
      const response = await page.goto(marketingUrl(pathname), {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status(), pathname).toBe(404);
      await expect(
        page.getByRole("heading", { name: "Sign in", exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Staff sign in" })
      ).toHaveCount(0);
    }
  });
});
