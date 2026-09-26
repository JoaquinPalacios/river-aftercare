import { expect, test } from "@playwright/test";

import { expectGenericNotFound } from "./helpers/assertions";
import { DEMO_TENANT_SLUG, staffUrl, tenantUrl } from "./helpers/origins";
import { signInAsLocalAdmin, signInAsLocalStaff } from "./helpers/staff-auth";

test.describe("guide delete lifecycle", () => {
  test("admin can delete a draft from the list and editor", async ({
    page,
  }) => {
    await signInAsLocalAdmin(page);
    await page.goto(staffUrl("/guides/new"), { waitUntil: "load" });
    const stamp = Date.now();
    const title = `Delete draft ${stamp}`;
    await page.getByLabel("Guide title").fill(title);
    await page.getByLabel("Public slug").fill(`delete-draft-${stamp}`);
    await page.getByRole("button", { name: "Create custom guide" }).click();
    await expect(page).toHaveURL(/\/guides\/.+\/edit/);

    await page
      .locator(".staffEditorToolbarActions")
      .getByRole("button", { name: "More actions" })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Delete guide" })
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Unpublish guide" })
    ).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Delete guide" }).click();
    await page
      .getByRole("dialog", { name: "Delete this guide?" })
      .getByRole("button", { name: "Delete guide" })
      .click();
    await expect(page).toHaveURL(staffUrl("/guides"));
    await expect(page.getByText(title)).toHaveCount(0);
  });

  test("published guides must be unpublished before delete, then delete 404s the public URL", async ({
    page,
  }) => {
    await signInAsLocalAdmin(page);
    await page.goto(staffUrl("/guides/new"), { waitUntil: "load" });
    const stamp = Date.now();
    const title = `Delete after unpublish ${stamp}`;
    const slug = `delete-unpublish-${stamp}`;
    await page.getByLabel("Guide title").fill(title);
    await page.getByLabel("Public slug").fill(slug);
    await page.getByRole("button", { name: "Create custom guide" }).click();
    await expect(page).toHaveURL(/\/guides\/.+\/edit/);
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

    const toolbar = page.locator(".staffEditorToolbarActions");
    await expect(
      toolbar.getByRole("button", { name: "Unpublish", exact: true })
    ).toBeVisible();
    await expect(
      toolbar.getByRole("button", { name: "More actions" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("menuitem", { name: "Delete guide" })
    ).toHaveCount(0);
    await toolbar
      .getByRole("button", { name: "Unpublish", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Unpublish this guide?" })
      .getByRole("button", { name: "Unpublish guide" })
      .click();
    await expect(
      page.getByText("Unpublished", { exact: true }).first()
    ).toBeVisible();

    const publicUrl = tenantUrl(DEMO_TENANT_SLUG, `/${slug}`);
    const missingBeforeDelete = await page.request.get(publicUrl);
    expect(missingBeforeDelete.status()).toBe(404);

    await page
      .locator(".staffEditorToolbarActions")
      .getByRole("button", { name: "More actions" })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Unpublish guide" })
    ).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Delete guide" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete this guide?" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(
        "This guide is unpublished. Deleting it will permanently remove the clinic guide and its saved history. The patient URL is already unavailable."
      )
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/phase-2a.5-delete-unpublished-confirm.png",
    });
    await dialog.getByRole("button", { name: "Delete guide" }).click();
    await expect(page).toHaveURL(staffUrl("/guides"));
    await expect(page.getByText(title)).toHaveCount(0);

    const missing = await page.goto(publicUrl, {
      waitUntil: "domcontentloaded",
    });
    expect(missing?.status()).toBe(404);
    await expectGenericNotFound(page);
  });

  test("clinic staff cannot delete guides", async ({ page }) => {
    await signInAsLocalStaff(page);
    await page.goto(staffUrl("/guides"), { waitUntil: "load" });
    await expect(
      page.getByRole("button", { name: "More actions" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("menuitem", { name: "Delete guide" })
    ).toHaveCount(0);
  });
});
