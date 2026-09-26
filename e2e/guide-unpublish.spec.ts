import { expect, test } from "@playwright/test";

import { expectGenericNotFound } from "./helpers/assertions";
import { DEMO_TENANT_SLUG, staffUrl, tenantUrl } from "./helpers/origins";
import { signInAsLocalAdmin, signInAsLocalStaff } from "./helpers/staff-auth";

test.describe("published guide unpublish lifecycle", () => {
  test("admin can unpublish, public URL 404s, and republish restores it", async ({
    page,
  }) => {
    await signInAsLocalAdmin(page);
    await page.goto(staffUrl("/guides/new"), { waitUntil: "load" });
    const stamp = Date.now();
    const title = `Unpublish lifecycle ${stamp}`;
    const slug = `unpublish-${stamp}`;
    await page.getByLabel("Guide title").fill(title);
    await page.getByLabel("Public slug").fill(slug);
    await page.getByRole("button", { name: "Create custom guide" }).click();
    await expect(page).toHaveURL(/\/guides\/.+\/edit/);

    await page
      .getByRole("button", { name: "Publish guide" })
      .filter({ visible: true })
      .click();
    const publishDialog = page.getByRole("dialog", {
      name: "Publish this guide?",
    });
    await expect(publishDialog).toBeVisible();
    await publishDialog.getByRole("button", { name: "Publish guide" }).click();
    await expect(
      page.getByText("Published", { exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /View patient guide/ })
    ).toBeVisible();

    const publicUrl = tenantUrl(DEMO_TENANT_SLUG, `/${slug}`);
    const live = await page.request.get(publicUrl);
    expect(live.status()).toBe(200);

    const toolbar = page.locator(".staffEditorToolbarActions");
    const unpublish = toolbar.getByRole("button", {
      name: "Unpublish",
      exact: true,
    });
    await expect(unpublish).toBeVisible();
    await expect(
      toolbar.getByRole("button", { name: "More actions" })
    ).toHaveCount(0);
    await page.screenshot({
      path: "test-results/artifacts/phase-2a.5-unpublish-toolbar.png",
    });
    await unpublish.click();
    const unpublishDialog = page.getByRole("dialog", {
      name: "Unpublish this guide?",
    });
    await expect(unpublishDialog).toBeVisible();
    await expect(
      unpublishDialog.getByText(
        "Patients using the current public link will no longer be able to open this guide until it is published again."
      )
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/phase-2a.5-unpublish-confirm.png",
    });
    await unpublishDialog
      .getByRole("button", { name: "Unpublish guide" })
      .click();

    await expect(page).toHaveURL(/\/guides\/.+\/edit/);
    await expect(
      page.getByText("Unpublished", { exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /View patient guide/ })
    ).toHaveCount(0);

    const missing = await page.goto(publicUrl, {
      waitUntil: "domcontentloaded",
    });
    expect(missing?.status()).toBe(404);
    await expectGenericNotFound(page);
    await page.screenshot({
      path: "test-results/artifacts/phase-2a.5-unpublish-public-404.png",
    });

    await page.goto(staffUrl("/guides"), { waitUntil: "load" });
    const row = page.locator("ul.divide-y > li").filter({ hasText: title });
    await expect(row.getByText("Unpublished", { exact: true })).toHaveCount(1);
    await page.screenshot({
      path: "test-results/artifacts/phase-2a.5-unpublish-guides-status.png",
    });

    await row.getByRole("link", { name: "Edit" }).click();
    await page
      .getByRole("button", { name: "Publish guide" })
      .filter({ visible: true })
      .click();
    await page
      .getByRole("dialog", { name: "Publish this guide?" })
      .getByRole("button", { name: "Publish guide" })
      .click();
    await expect(
      page.getByText("Published", { exact: true }).first()
    ).toBeVisible();

    const restored = await page.goto(publicUrl, { waitUntil: "load" });
    expect(restored?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/phase-2a.5-unpublish-republish.png",
    });

    await page.goto(staffUrl("/guides"), { waitUntil: "load" });
    await row.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Unpublish guide" }).click();
    await page
      .getByRole("dialog", { name: "Unpublish this guide?" })
      .getByRole("button", { name: "Unpublish guide" })
      .click();
    await expect(row.getByText("Unpublished", { exact: true })).toHaveCount(1);
  });

  test("clinic staff cannot unpublish", async ({ page }) => {
    await signInAsLocalStaff(page);
    await page.goto(staffUrl("/guides"), { waitUntil: "load" });
    await expect(
      page.getByRole("button", { name: "More actions" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("menuitem", { name: "Unpublish guide" })
    ).toHaveCount(0);
  });
});
