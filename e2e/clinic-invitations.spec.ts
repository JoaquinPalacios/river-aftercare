import { expect, test } from "@playwright/test";

import { expectNoSeriousAxeViolations } from "./helpers/axe";
import { staffUrl } from "./helpers/origins";
import {
  signInAsLocalAdmin,
  signInAsLocalOperator,
} from "./helpers/staff-auth";

test.describe("operator clinic invitations", () => {
  test("operator can open Team and invite a pending user", async ({ page }) => {
    await signInAsLocalOperator(page);
    await page.getByRole("link", { name: "Riverside Dental Demo" }).click();
    await expect(
      page.getByRole("heading", { name: "Riverside Dental Demo" })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
    await page.getByRole("link", { name: "Open team" }).click();
    await expect(page).toHaveURL(/\/operator\/clinics\/.+\/team$/);
    await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
    await expect(
      page.getByText("Manage who can access Riverside Dental Demo.")
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Invite user" })).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Name" })
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Email" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Actions for / })
    ).not.toHaveCount(0);
    await page.getByRole("button", { name: /Actions for / }).first().click();
    await expect(
      page.getByRole("menuitem", { name: "Remove access" })
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("Active").first()).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/operator-team-1440.png",
      fullPage: true,
    });
    await expectNoSeriousAxeViolations(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("link", { name: "Invite user" })).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/operator-team-390.png",
      fullPage: true,
    });

    const clinicTeamUrl = page.url();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole("link", { name: "Invite user" }).click();
    await expect(page).toHaveURL(/\/team\/invite$/);
    await expect(
      page.getByRole("heading", { name: "Invite user" })
    ).toBeVisible();
    await page.getByLabel("Name").fill("Pat Pending");
    const email = `pat.pending.${Date.now()}@example.test`;
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Role").selectOption("STAFF");
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page).toHaveURL(/\/team(?:\?status=invitation-sent)?$/);
    await expect(page.getByText("Invitation sent.")).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText("Pending").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Resend invitation" }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cancel invitation" }).first()
    ).toBeVisible();

    await page.context().clearCookies();
    await page.goto(clinicTeamUrl, { waitUntil: "load" });
    await expect(page).toHaveURL(/\/login/);
  });

  test("clinic admin cannot open operator Team", async ({ page }) => {
    await signInAsLocalOperator(page);
    await page.getByRole("link", { name: "Riverside Dental Demo" }).click();
    await page.getByRole("link", { name: "Open team" }).click();
    const teamUrl = page.url();
    await page.context().clearCookies();
    await signInAsLocalAdmin(page);
    const response = await page.goto(teamUrl, { waitUntil: "load" });
    expect(response?.status()).toBe(404);
  });
});

test.describe("accept invitation page", () => {
  test("staff host shows invalid state without a usable invitation", async ({
    page,
  }) => {
    const missing = await page.goto(staffUrl("/accept-invitation"), {
      waitUntil: "load",
    });
    expect(missing?.status()).toBe(200);
    await expect(
      page.getByRole("heading", {
        name: "Set up your River Aftercare account",
      })
    ).toBeVisible();
    await expect(
      page.getByText("This invitation is invalid or has expired.")
    ).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);

    const token = `${"Aa1-_".repeat(8)}abcde`;
    await page.goto(staffUrl("/login"), { waitUntil: "load" });
    const withToken = await page.goto(
      `${staffUrl("/accept-invitation")}#token=${token}`,
      { waitUntil: "load" }
    );
    expect(withToken?.status()).toBe(200);
    await expect(page.getByText("Checking invitation…")).toHaveCount(0);
    await expect(
      page.getByText("This invitation is invalid or has expired.")
    ).toBeVisible();
    await expect(
      page.getByText(
        "Contact your clinic administrator or River Aftercare for a new invitation."
      )
    ).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page).toHaveURL(/#token=/);
    await page.screenshot({
      path: "test-results/artifacts/accept-invitation-1280.png",
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByText("This invitation is invalid or has expired.")
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/accept-invitation-390.png",
    });
  });

  test("login shows the fixed invitation-ready message", async ({ page }) => {
    const response = await page.goto(staffUrl("/login?invite=success"), {
      waitUntil: "load",
    });
    expect(response?.status()).toBe(200);
    await expect(
      page.getByText("Your account is ready. Sign in with your new password.")
    ).toBeVisible();

    await page.goto(staffUrl("/login?invite=anything-else"), {
      waitUntil: "load",
    });
    await expect(
      page.getByText("Your account is ready. Sign in with your new password.")
    ).toHaveCount(0);
  });
});
