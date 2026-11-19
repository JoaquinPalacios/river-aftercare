import { createHash, randomBytes, scryptSync } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  PRIVACY_ACKNOWLEDGEMENT_VERSION,
  TERMS_ACCEPTANCE_VERSION,
} from "@/lib/legal/status";

import { e2ePrisma } from "./helpers/prisma";
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

  test("creates the clinic from the verification link and opens billing setup", async ({
    page,
  }) => {
    const stamp = Date.now().toString(36);
    const email = `reg-e2e-prov-${stamp}@example.test`;
    const slug = `rege2e${stamp}`.slice(0, 32);
    const rawToken = randomBytes(32).toString("base64url");
    await e2ePrisma.clinicRegistrationIntent.create({
      data: registrationIntent({
        email,
        slug,
        rawToken,
        commercialPlan: "ESSENTIAL",
        billingInterval: "MONTHLY",
      }),
    });

    try {
      await page.goto(`${staffUrl("/verify-registration")}#token=${rawToken}`);
      await expect(page).toHaveURL(/\/account\/billing\/setup$/, {
        timeout: 20_000,
      });
      await expect(
        page.getByRole("heading", { name: "Billing setup" })
      ).toBeVisible();
      await expect(page.getByText("Essential", { exact: true })).toBeVisible();
      await expect(page.getByText("A$49 / month")).toBeVisible();
      await expect(page.getByText(/14 days of River Aftercare/)).toBeVisible();
      const help = page.getByRole("link", { name: "Request onboarding help" });
      await expect(help).toBeVisible();
      await expect(help).toHaveAttribute(
        "href",
        /onboarding-stage=billing_setup$/
      );
      expect(await help.getAttribute("href")).not.toMatch(
        /password|token|sk_live|sk_test/i
      );

      await page.goto(staffUrl("/dashboard"));
      await expect(page).toHaveURL(/\/account\/billing\/setup$/);
      await expect(
        page.getByRole("heading", { name: "Billing setup" })
      ).toBeVisible();
    } finally {
      await deleteRegistration(email, slug);
    }
  });

  test("lets the owner choose another address when the slug was taken", async ({
    page,
  }) => {
    const stamp = Date.now().toString(36);
    const email = `reg-e2e-slug-${stamp}@example.test`;
    const taken = `rege2et${stamp}`.slice(0, 32);
    const replacement = `rege2er${stamp}`.slice(0, 32);
    const rawToken = randomBytes(32).toString("base64url");
    await e2ePrisma.clinic.create({
      data: { name: "Taken registration", slug: taken },
    });
    await e2ePrisma.clinicRegistrationIntent.create({
      data: registrationIntent({
        email,
        slug: taken,
        rawToken,
        commercialPlan: "PRACTICE",
        billingInterval: "YEARLY",
      }),
    });

    try {
      await page.goto(`${staffUrl("/verify-registration")}#token=${rawToken}`);
      await expect(
        page.getByText("That tenant slug is already in use.")
      ).toBeVisible();
      await page.getByLabel("Preferred clinic URL").fill(replacement);
      await page.getByRole("button", { name: "Use this address" }).click();
      await expect(page).toHaveURL(/\/account\/billing\/setup$/, {
        timeout: 20_000,
      });
      await expect(page.getByText("Practice", { exact: true })).toBeVisible();
      await expect(page.getByText("A$1,190 / year")).toBeVisible();
      await page.goto(staffUrl("/dashboard"));
      await expect(page).toHaveURL(/\/account\/billing\/setup$/);
    } finally {
      await deleteRegistration(email, taken, replacement);
    }
  });
});

function registrationIntent(input: {
  email: string;
  slug: string;
  rawToken: string;
  commercialPlan: "ESSENTIAL" | "PRACTICE";
  billingInterval: "MONTHLY" | "YEARLY";
}) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync("registration-secret-1", salt, 64).toString("hex");
  return {
    email: input.email,
    ownerName: "Registration Owner",
    passwordHash: `scrypt:${salt}:${hash}`,
    practiceName: "Registration Practice",
    slug: input.slug,
    serviceCategories: ["DENTAL" as const],
    commercialPlan: input.commercialPlan,
    billingInterval: input.billingInterval,
    termsVersion: TERMS_ACCEPTANCE_VERSION,
    privacyVersionAcknowledged: PRIVACY_ACKNOWLEDGEMENT_VERSION,
    tokenHash: createHash("sha256")
      .update(input.rawToken, "utf8")
      .digest("hex"),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };
}

async function deleteRegistration(
  email: string,
  ...slugs: string[]
): Promise<void> {
  await e2ePrisma.session.deleteMany({ where: { user: { email } } });
  await e2ePrisma.clinic.deleteMany({ where: { slug: { in: slugs } } });
  await e2ePrisma.user.deleteMany({ where: { email } });
  await e2ePrisma.clinicRegistrationIntent.deleteMany({ where: { email } });
}
