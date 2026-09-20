import { expect, test } from "@playwright/test";

import { DEMO_TENANT_SLUG, staffUrl, tenantUrl } from "./helpers/origins";
import {
  signInAsLocalAdmin,
  signInAsLocalOperator,
  signInAsLocalStaff,
} from "./helpers/staff-auth";

test.describe("clinic publish attestation and demo sample governance", () => {
  test("demodental publish dialog has no practice attestation and does not show reviewer identity", async ({
    page,
  }) => {
    await signInAsLocalAdmin(page);
    await page.goto(staffUrl("/guides/new"), { waitUntil: "load" });
    const stamp = Date.now();
    const title = `Demo attestation ${stamp}`;
    const slug = `demo-attest-${stamp}`;
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
    await expect(
      publishDialog.getByText(
        "I confirm this content has been reviewed and approved by the practice for publication to its patients."
      )
    ).toHaveCount(0);
    await publishDialog.getByRole("button", { name: "Publish guide" }).click();
    await expect(
      page.getByText("Published", { exact: true }).first()
    ).toBeVisible();
    await expect(page.getByText("Clinical review confirmed by")).toHaveCount(0);

    const publicUrl = tenantUrl(DEMO_TENANT_SLUG, `/${slug}`);
    await page.goto(publicUrl, { waitUntil: "load" });
    await expect(page.getByText("Interactive demo")).toBeVisible();
    await expect(page.getByText("Sample content only")).toBeVisible();
    await expect(page.getByText("Not clinical advice")).toBeVisible();
    await expect(page.getByText("Clinical review confirmed by")).toHaveCount(0);
    await expect(page.locator("text=reviewedBy")).toHaveCount(0);
    await expect(page.locator("text=MedicalWebPage")).toHaveCount(0);
  });

  test("clinic staff cannot publish or attest", async ({ page }) => {
    await signInAsLocalStaff(page);
    await page.goto(staffUrl("/guides"), { waitUntil: "load" });
    await page.getByRole("link", { name: "Edit" }).first().click();
    await expect(
      page.getByRole("button", { name: "Publish guide" })
    ).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("operator cannot create a clinic that claims demodental", async ({
    page,
  }) => {
    await signInAsLocalOperator(page);
    await page.goto(staffUrl("/operator/clinics/new"), { waitUntil: "load" });
    await page.getByLabel("Practice name").fill("Should Not Claim Demo");
    await page.getByLabel("Tenant slug").fill("demodental");
    await page.getByRole("button", { name: "Create clinic" }).click();
    await expect(
      page.getByText("That hostname is reserved for the interactive demo.")
    ).toBeVisible();
    await expect(page).toHaveURL(staffUrl("/operator/clinics/new"));
  });
});
