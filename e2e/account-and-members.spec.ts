import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { expect, test } from "@playwright/test";

import { expectNoSeriousAxeViolations } from "./helpers/axe";
import { setPortalColorScheme } from "./helpers/axe";
import { staffUrl } from "./helpers/origins";
import {
  localAdminCredentials,
  signInAsLocalAdmin,
  signInAsLocalOperator,
} from "./helpers/staff-auth";

const ARTIFACT_DIR = "/opt/cursor/artifacts";

function artifactPath(name: string) {
  const path = `${ARTIFACT_DIR}/${name}`;
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

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

  test("admin email change stays pending until confirmation", async ({
    page,
  }) => {
    const credentials = localAdminCredentials();
    expect(credentials).not.toBeNull();
    await signInAsLocalAdmin(page);
    await page
      .locator(".staffAppSidebar")
      .getByRole("link", { name: "Account" })
      .click();
    const pendingEmail = `pending-qa-${Date.now()}@example.test`;
    await page.getByLabel("Email").fill(pendingEmail);
    await page
      .getByLabel("Current password")
      .first()
      .fill(credentials!.password);
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByTestId("pending-email-verification")).toBeVisible();
    await expect(page.getByTestId("pending-email-verification")).toContainText(
      pendingEmail
    );
    await page.screenshot({
      path: artifactPath("account-email-pending-verification.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Cancel pending change" }).click();
    await expect(page.getByTestId("pending-email-verification")).toHaveCount(0);
    await expect(page.getByLabel("Email")).toHaveValue(credentials!.email);
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

  test("operator support context stays visible and exit clears it", async ({
    page,
  }) => {
    await signInAsLocalOperator(page);
    await page
      .getByRole("link", { name: "Riverside Dental Demo" })
      .first()
      .click();
    await page.getByRole("button", { name: "Manage clinic workspace" }).click();
    await expect(page).toHaveURL(staffUrl("/dashboard"));
    await expect(
      page.getByText("Assisting", { exact: true }).first()
    ).toBeVisible();
    await expect(page.locator(".staffOperatorAssistClinic")).toContainText(
      /Riverside/i
    );
    await expect(
      page.getByRole("button", { name: "Exit support" })
    ).toBeVisible();

    await page
      .locator(".staffAppSidebar")
      .getByRole("link", { name: "Practice" })
      .click();
    await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Exit support" })
    ).toBeVisible();
    await expect(page.locator(".staffOperatorAssistClinic")).toBeVisible();

    await setPortalColorScheme(page, "dark");
    await page.screenshot({
      path: artifactPath("operator-support-context-dark.png"),
      fullPage: true,
    });
    await setPortalColorScheme(page, "light");
    await page.screenshot({
      path: artifactPath("operator-support-context-light.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: artifactPath("operator-support-context-390.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.getByRole("button", { name: "Exit support" }).click();
    await expect(page).toHaveURL(staffUrl("/operator/clinics"));
    await expect(
      page.getByRole("button", { name: "Exit support" })
    ).toHaveCount(0);
    await page.screenshot({
      path: artifactPath("operator-after-exit-support.png"),
      fullPage: true,
    });

    await page.goto(staffUrl("/practice"), { waitUntil: "load" });
    await expect(page).toHaveURL(staffUrl("/operator/clinics"));
    await page.goBack();
    await page.goto(staffUrl("/guides"), { waitUntil: "load" });
    await expect(page).toHaveURL(staffUrl("/operator/clinics"));
  });
});
