import { expect, test, type Locator } from "@playwright/test";

import {
  expectNoSeriousAxeViolations,
  setPortalColorScheme,
} from "./helpers/axe";
import { contrastRatio, relativeLuminance } from "./helpers/layout";
import { staffUrl } from "./helpers/origins";
import { signInAsLocalAdmin } from "./helpers/staff-auth";

async function surfaceMetrics(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      colorScheme: style.colorScheme,
      background: style.backgroundColor,
      color: style.color,
      noticeSurface: style.getPropertyValue("--cg-notice-surface").trim(),
      noticeText: style.getPropertyValue("--cg-notice-text").trim(),
      noticeBorder: style.getPropertyValue("--cg-notice-border").trim(),
    };
  });
}

async function expectSurfaceTone(
  locator: Locator,
  tone: "light" | "dark",
  label: string
) {
  await expect
    .poll(
      async () => {
        const metrics = await surfaceMetrics(locator);
        const luminance = relativeLuminance(metrics.background);
        if (luminance < 0) {
          return false;
        }
        return tone === "dark" ? luminance < 0.35 : luminance > 0.7;
      },
      { timeout: 10_000 }
    )
    .toBe(true);

  const metrics = await surfaceMetrics(locator);
  const luminance = relativeLuminance(metrics.background);
  if (tone === "dark") {
    expect(luminance, `${label} luminance ${metrics.background}`).toBeLessThan(
      0.35
    );
    expect(metrics.colorScheme, label).toMatch(/dark/i);
  } else {
    expect(
      luminance,
      `${label} luminance ${metrics.background}`
    ).toBeGreaterThan(0.7);
    expect(metrics.colorScheme, label).not.toBe("dark");
  }
}

test.describe("authenticated patient preview theme", () => {
  test("defaults to Follow portal and keeps Clinic default as an explicit choice", async ({
    page,
  }) => {
    await signInAsLocalAdmin(page);
    await page.goto(staffUrl("/guides"), { waitUntil: "load" });
    await page
      .getByRole("row", { name: /Tooth Extraction/ })
      .getByRole("link", { name: "Preview" })
      .click();
    await expect(page).toHaveURL(/\/guides\/.+\/preview/);

    const appearance = page.getByLabel("Patient preview appearance");
    const patient = page.locator(".aftercareTheme");
    const toolbar = page.locator(".staffPreviewToolbar");
    const demoNotice = page.getByRole("status");
    const demoTitle = demoNotice.getByText("Interactive demo");
    const demoCopy = demoNotice.getByText(
      "Sample content only · Not clinical advice · Changes aren't saved"
    );

    await expect(
      page.getByRole("link", { name: "Back to Tooth Extraction" })
    ).toBeVisible();

    await setPortalColorScheme(page, "light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(appearance).toHaveValue("portal");
    await expect(appearance.locator("option[value='portal']")).toHaveText(
      "Follow portal (Light)"
    );
    await expect(appearance.locator("option[value='clinic']")).toHaveText(
      "Clinic default (System)"
    );
    await expect(page.locator(".staffPreviewShell")).toHaveAttribute(
      "data-preview-theme",
      "light"
    );
    await expect(patient).toHaveAttribute("data-patient-theme", "light");
    await expectSurfaceTone(patient, "light", "follow portal light patient");
    await expectSurfaceTone(toolbar, "light", "follow portal light toolbar");
    await expectSurfaceTone(
      demoNotice,
      "light",
      "follow portal light demo notice"
    );
    const lightNotice = await surfaceMetrics(demoNotice);
    const lightTitle = await demoTitle.evaluate(
      (element) => getComputedStyle(element).color
    );
    const lightCopy = await demoCopy.evaluate(
      (element) => getComputedStyle(element).color
    );
    expect(lightNotice.noticeSurface).toBe("#eef3f4");
    expect(lightNotice.noticeText).toBe("#1c2430");
    expect(
      contrastRatio(lightNotice.background, lightTitle)
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(lightNotice.background, lightCopy)
    ).toBeGreaterThanOrEqual(4.5);
    await expectNoSeriousAxeViolations(page);
    await page.screenshot({
      path: "test-results/artifacts/phase-2a.5-preview-follow-portal-light.png",
    });

    await setPortalColorScheme(page, "dark");
    await expect(appearance.locator("option[value='portal']")).toHaveText(
      "Follow portal (Dark)"
    );
    await expect(page.locator(".staffPreviewShell")).toHaveAttribute(
      "data-preview-theme",
      "dark"
    );
    await expect(patient).toHaveAttribute("data-patient-theme", "dark");
    await expectSurfaceTone(patient, "dark", "follow portal dark patient");
    await expectSurfaceTone(toolbar, "dark", "follow portal dark toolbar");
    await expectSurfaceTone(
      demoNotice,
      "dark",
      "follow portal dark demo notice"
    );
    const darkNotice = await surfaceMetrics(demoNotice);
    const darkTitle = await demoTitle.evaluate(
      (element) => getComputedStyle(element).color
    );
    const darkCopy = await demoCopy.evaluate(
      (element) => getComputedStyle(element).color
    );
    expect(darkNotice.noticeSurface).toBe("#1a222c");
    expect(darkNotice.noticeText).toBe("#e8ebe6");
    expect(
      contrastRatio(darkNotice.background, darkTitle)
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(darkNotice.background, darkCopy)
    ).toBeGreaterThanOrEqual(4.5);
    const darkToolbarNav = await toolbar
      .getByRole("link", { name: "Back to Tooth Extraction" })
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return { color: style.color, background: style.backgroundColor };
      });
    const darkToolbar = await surfaceMetrics(toolbar);
    expect(
      contrastRatio(darkToolbar.background, darkToolbarNav.color)
    ).toBeGreaterThanOrEqual(4.5);
    await expectNoSeriousAxeViolations(page);
    await page.screenshot({
      path: "test-results/artifacts/phase-2a.5-preview-follow-portal-dark.png",
    });

    await setPortalColorScheme(page, "light");
    await appearance.selectOption("clinic");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator(".staffPreviewShell")).toHaveAttribute(
      "data-preview-theme",
      "system"
    );
    await expect(patient).toHaveAttribute("data-patient-theme", "system");
    await expectSurfaceTone(
      patient,
      "dark",
      "clinic default system OS dark patient"
    );
    await expectSurfaceTone(
      toolbar,
      "dark",
      "clinic default system OS dark toolbar"
    );
    await expectSurfaceTone(
      demoNotice,
      "dark",
      "clinic default system OS dark demo notice"
    );
    await page.screenshot({
      path: "test-results/artifacts/phase-2a.5-preview-clinic-default-system-os-dark.png",
    });

    await page.emulateMedia({ colorScheme: "light" });
    await expectSurfaceTone(
      patient,
      "light",
      "clinic default system OS light patient"
    );
    await expectSurfaceTone(
      toolbar,
      "light",
      "clinic default system OS light toolbar"
    );
    await page.screenshot({
      path: "test-results/artifacts/phase-2a.5-preview-clinic-default-system-os-light.png",
    });

    await appearance.selectOption("light");
    await expect(page.locator(".staffPreviewShell")).toHaveAttribute(
      "data-preview-theme",
      "light"
    );
    await expect(patient).toHaveAttribute("data-patient-theme", "light");
    await expectSurfaceTone(patient, "light", "explicit light patient");
    await expectSurfaceTone(toolbar, "light", "explicit light toolbar");
    await page.screenshot({
      path: "test-results/artifacts/phase-2a.5-preview-explicit-light.png",
    });

    await setPortalColorScheme(page, "dark");
    await appearance.selectOption("light");
    await expect(page.locator(".staffPreviewShell")).toHaveAttribute(
      "data-preview-theme",
      "light"
    );
    await expect(patient).toHaveAttribute("data-patient-theme", "light");
    await expectSurfaceTone(
      patient,
      "light",
      "portal dark / explicit light patient"
    );
    await expectSurfaceTone(
      toolbar,
      "light",
      "portal dark / explicit light toolbar"
    );
    await expectSurfaceTone(
      demoNotice,
      "light",
      "portal dark / explicit light demo notice"
    );
    await page.screenshot({
      path: "test-results/artifacts/phase-2a.5-preview-portal-dark-explicit-light.png",
    });

    await setPortalColorScheme(page, "light");
    await appearance.selectOption("dark");
    await expect(page.locator(".staffPreviewShell")).toHaveAttribute(
      "data-preview-theme",
      "dark"
    );
    await expect(patient).toHaveAttribute("data-patient-theme", "dark");
    await expectSurfaceTone(
      patient,
      "dark",
      "portal light / explicit dark patient"
    );
    await expectSurfaceTone(
      toolbar,
      "dark",
      "portal light / explicit dark toolbar"
    );
    await expectSurfaceTone(
      demoNotice,
      "dark",
      "portal light / explicit dark demo notice"
    );
    await page.screenshot({
      path: "test-results/artifacts/phase-2a.5-preview-explicit-dark.png",
    });
  });

  test("editor live preview defaults to Follow portal", async ({ page }) => {
    await signInAsLocalAdmin(page);
    await page.goto(staffUrl("/guides"), { waitUntil: "load" });
    await page.getByRole("link", { name: "Edit" }).first().click();
    await expect(page).toHaveURL(/\/guides\/.+\/edit/);
    const appearance = page
      .locator("[data-live-preview]")
      .getByLabel("Patient preview appearance");
    await setPortalColorScheme(page, "light");
    await expect(appearance).toHaveValue("portal");
    await expect(appearance.locator("option[value='portal']")).toHaveText(
      "Follow portal (Light)"
    );
  });
});
