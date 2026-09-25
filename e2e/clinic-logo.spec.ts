import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

import { e2ePrisma } from "./helpers/prisma";
import { syncE2eClinicBranding } from "./helpers/sync-clinic-branding";
import { DEMO_TENANT_SLUG, staffUrl, tenantUrl } from "./helpers/origins";
import {
  acquireDemoBrandingLock,
  releaseDemoBrandingLock,
} from "./helpers/demo-branding-lock";
import { signInAsLocalAdmin, signInAsLocalStaff } from "./helpers/staff-auth";

const DEMO_CLINIC_ID = "clinic_demo_rivers";
const DEMO_LOGO = "/demo/riverside-mark.svg";
const ARTIFACT_DIR = "docs/product/artifacts/r2-clinic-assets";

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8cfc00000000300010005fed4ef0000000049454e44ae426082",
  "hex"
);

const SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#155e75"/></svg>`
);

async function restoreDemoLogo(): Promise<void> {
  await syncE2eClinicBranding(DEMO_CLINIC_ID, { logoUrl: DEMO_LOGO });
}

test.describe("clinic logo upload", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    await acquireDemoBrandingLock();
  });

  test.afterEach(async () => {
    await restoreDemoLogo();
  });

  test.afterAll(async () => {
    await restoreDemoLogo();
    await releaseDemoBrandingLock();
    await e2ePrisma.$disconnect();
  });

  test("ADMIN can upload, replace, and remove a logo", async ({ page }) => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    mkdirSync("test-results/artifacts", { recursive: true });

    await syncE2eClinicBranding(DEMO_CLINIC_ID, { logoUrl: null });

    await signInAsLocalAdmin(page);
    await page.goto(staffUrl("/practice"), { waitUntil: "load" });
    const logoControl = page.getByRole("group", { name: "Practice logo" });
    await expect(page.getByText("Choose logo")).toBeVisible();
    await expect(page.getByText("No logo configured.")).toHaveCount(0);
    await page.screenshot({
      path: `${ARTIFACT_DIR}/practice-no-logo.png`,
      fullPage: true,
    });

    await page.setInputFiles("#clinic-logo-file", {
      name: "clinic-mark.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await expect(page.getByText("clinic-mark.png")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Upload logo" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await page.screenshot({
      path: `${ARTIFACT_DIR}/practice-upload-selected.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Upload logo" }).click();
    await expect(logoControl.getByRole("status")).toHaveText(
      "Practice logo updated."
    );
    const uploaded = page.locator("img.staffLogoPreview");
    await expect(uploaded).toHaveAttribute(
      "src",
      /\/clinic-branding\/clinic_demo_rivers\/.+\.png$/
    );
    await page.screenshot({
      path: `${ARTIFACT_DIR}/practice-uploaded-png.png`,
      fullPage: true,
    });
    await page.screenshot({
      path: "test-results/artifacts/practice-logo-uploaded.png",
      fullPage: true,
    });

    await page.goto(tenantUrl(DEMO_TENANT_SLUG, "/"), { waitUntil: "load" });
    await expect(page.locator("header img").first()).toHaveAttribute(
      "src",
      /\/clinic-branding\/clinic_demo_rivers\/.+\.png$/
    );
    await page.screenshot({
      path: `${ARTIFACT_DIR}/patient-home-uploaded-logo.png`,
      fullPage: true,
    });

    await page.goto(tenantUrl(DEMO_TENANT_SLUG, "/extraction"), {
      waitUntil: "load",
    });
    await expect(page.locator("header img").first()).toHaveAttribute(
      "src",
      /\/clinic-branding\/clinic_demo_rivers\/.+\.png$/
    );
    await page.screenshot({
      path: `${ARTIFACT_DIR}/patient-guide-uploaded-logo.png`,
      fullPage: true,
    });

    await page.goto(staffUrl("/practice"), { waitUntil: "load" });
    await expect(page.getByText("Choose replacement")).toBeVisible();
    await page.setInputFiles("#clinic-logo-file", {
      name: "clinic-mark.svg",
      mimeType: "image/svg+xml",
      buffer: SVG,
    });
    await expect(page.getByText("clinic-mark.svg")).toBeVisible();
    await page.getByRole("button", { name: "Upload replacement" }).click();
    await expect(logoControl.getByRole("status")).toHaveText(
      "Practice logo updated."
    );
    await expect(page.locator("img.staffLogoPreview")).toHaveAttribute(
      "src",
      /\/clinic-branding\/clinic_demo_rivers\/.+\.svg$/
    );
    await page.screenshot({
      path: `${ARTIFACT_DIR}/practice-replaced-svg.png`,
      fullPage: true,
    });

    await page.getByRole("button", { name: "Remove logo" }).click();
    await expect(
      page.getByRole("dialog", { name: "Remove practice logo?" })
    ).toBeVisible();
    await expect(
      page.getByText(
        "The patient aftercare site will fall back to the practice name and default presentation."
      )
    ).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Remove logo" })
      .click();
    await expect(page.getByText("Choose logo")).toBeVisible();
    await expect(logoControl.getByRole("status")).toHaveText(
      "Practice logo removed."
    );
    await expect(page.getByRole("button", { name: "Upload logo" })).toHaveCount(
      0
    );
    await page.screenshot({
      path: `${ARTIFACT_DIR}/practice-removed.png`,
      fullPage: true,
    });

    await page.setInputFiles("#clinic-logo-file", {
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not an image"),
    });
    await page.getByRole("button", { name: "Upload logo" }).click();
    await expect(logoControl.getByRole("alert")).toBeVisible();
    await page.screenshot({
      path: `${ARTIFACT_DIR}/practice-validation-error.png`,
      fullPage: true,
    });
  });
});

test.describe("clinic logo STAFF restriction", () => {
  test("STAFF cannot open Practice to upload a logo", async ({ page }) => {
    await signInAsLocalStaff(page);
    const response = await page.goto(staffUrl("/practice"), {
      waitUntil: "load",
    });
    expect(response?.status()).toBe(404);
  });
});
