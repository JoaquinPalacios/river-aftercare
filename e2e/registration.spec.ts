import { expect, test } from "@playwright/test";

import { expectNoHorizontalOverflow } from "./helpers/layout";
import { marketingUrl, staffUrl } from "./helpers/origins";

test.describe("self-serve registration", () => {
  test("is not linked from the public marketing site", async ({ page }) => {
    await page.goto(marketingUrl("/"));
    await expect(page.locator('a[href*="/register"]')).toHaveCount(0);
    await page.goto(marketingUrl("/pricing"));
    await expect(page.locator('a[href*="/register"]')).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Request a demo" }).first()
    ).toBeVisible();

    await page.goto(staffUrl("/login"));
    await expect(page.locator('a[href*="/register"]')).toHaveCount(0);

    const hidden = await page.goto(marketingUrl("/register"));
    expect(hidden?.status()).toBe(404);
  });

  test("validates the staff form and keeps assistance free of the password", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(staffUrl("/register"));
    await expect(
      page.getByRole("heading", { name: "Register your practice" })
    ).toBeVisible();
    await expect(page.getByText(/card or Australian bank debit/)).toBeVisible();
    await expect(page.getByText(/14 days of River Aftercare/)).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "Create registration" }).click();
    await expect(page.getByText("Enter the practice name.")).toBeVisible();

    const password = page.locator("#password");
    await password.fill("not-the-contact-secret");
    await page.getByRole("link", { name: "Request onboarding help" }).click();
    await expect(page).toHaveURL(/\/contact#onboarding-stage=registration$/);
    await expect(page.locator("textarea[name='message']")).toHaveValue(
      "Onboarding assistance request. Stage: registration."
    );
    await expect(page.getByText("not-the-contact-secret")).toHaveCount(0);
  });

  test("accepts a registration without returning a token and explains a bad link", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(staffUrl("/register"));
    await expectNoHorizontalOverflow(page);
    await page.getByLabel("Practice name").fill("Harbour Registration");
    await page.getByRole("checkbox", { name: "Dental" }).check();
    await page.getByLabel("Your full name").fill("Harbour Owner");
    await page.getByLabel("Email").fill(`reg-e2e-${Date.now()}@example.test`);
    await page.locator("#password").fill("registration-secret-1");
    await page.locator("#confirmPassword").fill("registration-secret-1");
    await page.getByLabel(/I agree to the/).check();

    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/auth/register") &&
        response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Create registration" }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      message:
        "If that address can be registered, we've sent a verification link.",
    });
    expect(JSON.stringify(body)).not.toMatch(/token|password|scrypt/i);
    await expect(
      page.getByText("If that address can be registered")
    ).toBeVisible();

    await page.goto(staffUrl("/verify-registration#token=not-a-valid-token"));
    await expect(
      page.getByText("This verification link is invalid or has expired.")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Email a new link" })
    ).toBeVisible();
  });
});
