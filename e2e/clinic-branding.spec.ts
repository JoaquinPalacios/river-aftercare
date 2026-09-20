import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

import { pngBytes } from "../tests/helpers/og-image-bytes";
import { e2ePrisma } from "./helpers/prisma";
import {
  DEMO_TENANT_SLUG,
  marketingUrl,
  staffUrl,
  tenantUrl,
} from "./helpers/origins";
import { signInAsLocalAdmin } from "./helpers/staff-auth";

const DEMO_CLINIC_ID = "clinic_demo_rivers";
const ARTIFACT_DIR = "docs/product/artifacts/clinic-branding";
const FAVICON_PNG = Buffer.from(pngBytes(32, 32));
const DARK_LOGO_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8cfc00000000300010005fed4ef0000000049454e44ae426082",
  "hex"
);

const ORIGINAL = {
  primaryColor: "#0f766e",
  accentColor: "#f59e0b",
  darkPrimaryColor: null as string | null,
  darkAccentColor: null as string | null,
  useCustomDarkBranding: false,
  darkLogoUrl: null as string | null,
  faviconUrl: null as string | null,
  logoUrl: "/demo/riverside-mark.svg",
};

async function restoreDemoBranding(): Promise<void> {
  await e2ePrisma.clinicProfile.update({
    where: { clinicId: DEMO_CLINIC_ID },
    data: ORIGINAL,
  });
}

test.describe("clinic Dark branding and favicon", () => {
  test.describe.configure({ mode: "serial" });

  test.afterEach(async () => {
    await restoreDemoBranding();
  });

  test.afterAll(async () => {
    await restoreDemoBranding();
    await e2ePrisma.$disconnect();
  });

  test("practice editor previews Light/Dark and uploads a favicon", async ({
    page,
  }) => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    mkdirSync("test-results/artifacts", { recursive: true });

    await signInAsLocalAdmin(page);
    await page.goto(staffUrl("/practice"), { waitUntil: "load" });
    await page.emulateMedia({ colorScheme: "dark" });
    await page
      .getByRole("heading", { name: "Branding" })
      .scrollIntoViewIfNeeded();
    await expect(page.getByText("Use custom Dark branding")).toBeVisible();
    await expect(
      page.getByRole("radiogroup", { name: "Preview appearance" })
    ).toBeVisible();
    await page.screenshot({
      path: `${ARTIFACT_DIR}/branding-light-settings-dark-ui.png`,
      fullPage: true,
    });

    await page
      .getByRole("radiogroup", { name: "Preview appearance" })
      .getByRole("radio", { name: "Light", exact: true })
      .click();
    await expect(page.getByText("Sample recovery heading")).toBeVisible();
    await page.screenshot({
      path: `${ARTIFACT_DIR}/branding-light-preview.png`,
      fullPage: true,
    });

    await page.getByLabel("Use custom Dark branding").check();
    await page.locator("#darkPrimaryColor").fill("#22d3ee");
    await page.locator("#darkAccentColor").fill("#fde68a");
    await expect(page.locator('input[type="color"]')).toHaveCount(5);
    await page.screenshot({
      path: `${ARTIFACT_DIR}/branding-dark-settings-dark-ui.png`,
      fullPage: true,
    });
    await page
      .getByRole("radiogroup", { name: "Preview appearance" })
      .getByRole("radio", { name: "Dark", exact: true })
      .click();
    await page.screenshot({
      path: `${ARTIFACT_DIR}/branding-custom-dark-preview.png`,
      fullPage: true,
    });

    await page.setInputFiles("#clinic-favicon-file", {
      name: "clinic-favicon.png",
      mimeType: "image/png",
      buffer: FAVICON_PNG,
    });
    await page.getByRole("button", { name: "Upload favicon" }).click();
    await expect(page.getByText("Favicon updated.")).toBeVisible();
    await page.screenshot({
      path: `${ARTIFACT_DIR}/branding-favicon-upload.png`,
      fullPage: true,
    });
  });

  test("patient pages keep current Dark fallback until custom branding is saved", async ({
    page,
  }) => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(tenantUrl(DEMO_TENANT_SLUG, "/extraction"), {
      waitUntil: "load",
    });
    await expect(page.locator(".aftercareTheme")).toBeVisible();
    await page.screenshot({
      path: `${ARTIFACT_DIR}/patient-standard-light.png`,
      fullPage: true,
    });

    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload({ waitUntil: "load" });
    await expect(page.locator(".aftercareTheme")).toBeVisible();
    await page.screenshot({
      path: `${ARTIFACT_DIR}/patient-standard-dark-fallback.png`,
      fullPage: true,
    });
  });

  test("custom Dark palette, Dark logo, and clinic favicon apply on patient guides only", async ({
    page,
  }) => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    await e2ePrisma.clinicProfile.update({
      where: { clinicId: DEMO_CLINIC_ID },
      data: {
        useCustomDarkBranding: true,
        darkPrimaryColor: "#22d3ee",
        darkAccentColor: "#fde68a",
      },
    });

    await signInAsLocalAdmin(page);
    await page.goto(staffUrl("/practice"), { waitUntil: "load" });
    await page.setInputFiles("#clinic-dark-logo-file", {
      name: "dark-logo.png",
      mimeType: "image/png",
      buffer: DARK_LOGO_PNG,
    });
    await page.getByRole("button", { name: "Upload Dark logo" }).click();
    await expect(page.getByText("Dark logo updated.")).toBeVisible();
    await page.setInputFiles("#clinic-favicon-file", {
      name: "clinic-favicon.png",
      mimeType: "image/png",
      buffer: FAVICON_PNG,
    });
    await page.getByRole("button", { name: "Upload favicon" }).click();
    await expect(page.getByText("Favicon updated.")).toBeVisible();

    const profile = await e2ePrisma.clinicProfile.findUnique({
      where: { clinicId: DEMO_CLINIC_ID },
      select: { faviconUrl: true, darkLogoUrl: true },
    });
    expect(profile?.faviconUrl).toMatch(
      /^clinics\/clinic_demo_rivers\/branding\/.+\.png$/
    );
    const faviconPath = `/clinic-branding/clinic_demo_rivers/${profile?.faviconUrl?.split("/").pop()}`;

    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(tenantUrl(DEMO_TENANT_SLUG, "/extraction"), {
      waitUntil: "load",
    });
    await expect(page.locator(".aftercareTheme")).toBeVisible();
    const html = await page.content();
    expect(html).toContain("--cg-brand:#22d3ee");
    expect(html).toContain(faviconPath);
    await page.screenshot({
      path: `${ARTIFACT_DIR}/patient-custom-dark.png`,
      fullPage: true,
    });
    await page.screenshot({
      path: `${ARTIFACT_DIR}/patient-custom-dark-logo.png`,
      fullPage: true,
    });
    await page.screenshot({
      path: `${ARTIFACT_DIR}/patient-clinic-favicon.png`,
    });

    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    const marketing = await page.content();
    expect(marketing).not.toContain(faviconPath);
    expect(marketing).toContain("/favicons/favicon-32x32.png");

    await page.goto(staffUrl("/dashboard"), { waitUntil: "load" });
    const staff = await page.content();
    expect(staff).not.toContain(faviconPath);
  });
});
