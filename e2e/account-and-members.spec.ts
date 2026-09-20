import { expect, test } from "@playwright/test";

import { expectNoSeriousAxeViolations } from "./helpers/axe";
import { setPortalColorScheme } from "./helpers/axe";
import { staffUrl } from "./helpers/origins";
import {
  signInAsLocalAdmin,
  signInAsLocalOperator,
} from "./helpers/staff-auth";

test.describe("account settings and clinic members", () => {
  test("admin can open account profile and practice members", async ({
    page,
  }) => {
    await signInAsLocalAdmin(page);
    await page
      .locator(".staffAppSidebar")
      .getByRole("link", { name: "Account" })
      .click();
    await expect(page).toHaveURL(staffUrl("/account"));
    await expect(
      page.getByRole("heading", { name: "Account", exact: true })
    ).toBeVisible();
    await expect(page.getByLabel("Name")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Current password").first()).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "New password", exact: true })
    ).toBeVisible();
    await expect(page.getByLabel("Confirm new password")).toBeVisible();
    await expectNoSeriousAxeViolations(page);

    await page
      .locator(".staffAppSidebar")
      .getByRole("link", { name: "Practice" })
      .click();
    await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
    await expect(page.getByText("Active").first()).toBeVisible();
  });

  test("operator can open a clinic workspace and team status controls", async ({
    page,
  }) => {
    await signInAsLocalOperator(page);
    await page
      .getByRole("link", { name: "Riverside Dental Demo" })
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: "Manage clinic workspace" })
    ).toBeVisible();
    await page.getByRole("link", { name: "Open team" }).click();
    await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
    await expect(page.getByText("Active").first()).toBeVisible();
  });
});
