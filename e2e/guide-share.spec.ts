import { expect, test } from "@playwright/test";
import { copyFileSync, readFileSync } from "node:fs";

import { expectNoSeriousAxeViolations } from "./helpers/axe";
import { expectGenericNotFound } from "./helpers/assertions";
import { expectNoHorizontalOverflow } from "./helpers/layout";
import {
  DEMO_TENANT_SLUG,
  staffOrigin,
  staffUrl,
  tenantUrl,
} from "./helpers/origins";
import { signInAsLocalAdmin, signInAsLocalStaff } from "./helpers/staff-auth";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

test.describe("published guide QR sharing", () => {
  test("admin can copy the durable public URL and download SVG/PNG QR", async ({
    page,
  }) => {
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"], {
        origin: staffOrigin(),
      });
    await signInAsLocalAdmin(page);
    await page.goto(staffUrl("/guides"), { waitUntil: "load" });
    const published = page
      .locator("ul.divide-y > li")
      .filter({ hasText: "Tooth Extraction" });
    await expect(
      published.getByRole("button", { name: "Share" })
    ).toBeVisible();
    await published.getByRole("button", { name: "Share" }).click();
    const panel = page.getByRole("dialog", { name: "Share published guide" });
    await expect(panel).toBeVisible();
    const publicUrl = tenantUrl(DEMO_TENANT_SLUG, "/extraction");
    await expect(panel.locator("a.staffShareUrl")).toHaveAttribute(
      "href",
      publicUrl
    );
    await panel.getByRole("button", { name: "Copy link" }).click();
    await expect(panel.getByRole("button", { name: "Copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      publicUrl
    );

    const svgDownload = page.waitForEvent("download");
    await panel.getByRole("link", { name: "Download QR (SVG)" }).click();
    const svg = await svgDownload;
    expect(svg.suggestedFilename()).toBe(
      "river-aftercare-demodental-extraction-qr.svg"
    );
    const svgPath = await svg.path();
    expect(svgPath).toBeTruthy();
    const svgBody = readFileSync(svgPath!, "utf8");
    expect(svgBody).toMatch(/<svg[\s\S]*<\/svg>/);
    expect(svgBody).not.toMatch(/linearGradient|radialGradient/i);
    await page.screenshot({
      path: "test-results/artifacts/guide-share-menu-1440.png",
    });
    await expectNoSeriousAxeViolations(page);
    copyFileSync(svgPath!, "test-results/artifacts/guide-qr-extraction.svg");

    await page.keyboard.press("Escape");
    await published.getByRole("button", { name: "Share" }).click();
    const pngPanel = page.getByRole("dialog", {
      name: "Share published guide",
    });
    await expect(pngPanel).toBeVisible();
    const pngDownloadPromise = page.waitForEvent("download");
    await pngPanel.getByRole("link", { name: "Download QR (PNG)" }).click();
    const png = await pngDownloadPromise;
    expect(png.suggestedFilename()).toBe(
      "river-aftercare-demodental-extraction-qr.png"
    );
    const pngPath = await png.path();
    expect(pngPath).toBeTruthy();
    expect(readFileSync(pngPath!).subarray(0, 8).equals(PNG_SIGNATURE)).toBe(
      true
    );
    copyFileSync(pngPath!, "test-results/artifacts/guide-qr-extraction.png");

    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: "test-results/artifacts/guide-share-menu-390.png",
    });
  });

  test("draft and unpublished guides do not expose Share", async ({ page }) => {
    await signInAsLocalAdmin(page);
    await page.goto(staffUrl("/guides/new"), { waitUntil: "load" });
    const stamp = Date.now();
    const title = `QR draft ${stamp}`;
    const slug = `qr-draft-${stamp}`;
    await page.getByLabel("Guide title").fill(title);
    await page.getByLabel("Public slug").fill(slug);
    await page.getByRole("button", { name: "Create custom guide" }).click();
    await expect(page).toHaveURL(/\/guides\/.+\/edit/);
    await expect(page.getByRole("button", { name: "Share" })).toHaveCount(0);

    await page.goto(staffUrl("/guides"), { waitUntil: "load" });
    const draftRow = page
      .locator("ul.divide-y > li")
      .filter({ hasText: title });
    await expect(draftRow.getByRole("button", { name: "Share" })).toHaveCount(
      0
    );

    await draftRow.getByRole("link", { name: "Edit" }).click();
    await page
      .getByRole("button", { name: "Publish guide" })
      .filter({ visible: true })
      .click();
    await page
      .getByRole("dialog", { name: "Publish this guide?" })
      .getByRole("button", { name: "Publish guide" })
      .click();
    await expect(page.getByRole("button", { name: "Share" })).toBeVisible();
    const publicUrl = tenantUrl(DEMO_TENANT_SLUG, `/${slug}`);
    await page.getByRole("button", { name: "Share" }).click();
    const editorPanel = page.getByRole("dialog", {
      name: "Share published guide",
    });
    await expect(editorPanel.locator("a.staffShareUrl")).toHaveAttribute(
      "href",
      publicUrl
    );

    const firstSvg = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download QR (SVG)" }).click();
    const firstDownload = await firstSvg;
    const firstBody = readFileSync((await firstDownload.path())!, "utf8");

    await page.keyboard.press("Escape");
    await expect(editorPanel).toHaveCount(0);
    await page.getByLabel("Short introduction").fill("Published copy for QR.");
    await expect(page.locator("[data-save-state=unsaved]")).toBeVisible();
    await page
      .getByRole("button", { name: "Save draft" })
      .filter({ visible: true })
      .click();
    await expect(page.locator("[data-save-state=saved]")).toBeVisible();
    await page
      .getByRole("button", { name: "Publish guide" })
      .filter({ visible: true })
      .click();
    await page
      .getByRole("dialog", { name: "Publish this guide?" })
      .getByRole("button", { name: "Publish guide" })
      .click();
    await expect(
      page.getByText("Guide published. Patients now see this version.")
    ).toBeVisible();
    await page.getByRole("button", { name: "Share" }).click();
    await expect(
      page
        .getByRole("dialog", { name: "Share published guide" })
        .locator("a.staffShareUrl")
    ).toHaveAttribute("href", publicUrl);
    const secondSvg = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download QR (SVG)" }).click();
    const secondBody = readFileSync((await (await secondSvg).path())!, "utf8");
    expect(secondBody).toBe(firstBody);
    expect((await page.request.get(publicUrl)).status()).toBe(200);

    await page.keyboard.press("Escape");
    await page
      .locator(".staffEditorToolbarActions")
      .getByRole("button", { name: "Unpublish", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Unpublish this guide?" })
      .getByRole("button", { name: "Unpublish guide" })
      .click();
    await expect(page.getByRole("button", { name: "Share" })).toHaveCount(0);
    const missing = await page.goto(publicUrl, {
      waitUntil: "domcontentloaded",
    });
    expect(missing?.status()).toBe(404);
    await expectGenericNotFound(page);

    await page.goto(staffUrl("/guides"), { waitUntil: "load" });
    const unpublished = page
      .locator("ul.divide-y > li")
      .filter({ hasText: title });
    await expect(
      unpublished.getByRole("button", { name: "Share" })
    ).toHaveCount(0);

    await unpublished.getByRole("link", { name: "Edit" }).click();
    await page
      .getByRole("button", { name: "Publish guide" })
      .filter({ visible: true })
      .click();
    await page
      .getByRole("dialog", { name: "Publish this guide?" })
      .getByRole("button", { name: "Publish guide" })
      .click();
    await expect(page.getByRole("button", { name: "Share" })).toBeVisible();
    expect((await page.request.get(publicUrl)).status()).toBe(200);

    await page
      .locator(".staffEditorToolbarActions")
      .getByRole("button", { name: "Unpublish", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Unpublish this guide?" })
      .getByRole("button", { name: "Unpublish guide" })
      .click();
    await page
      .locator(".staffEditorToolbarActions")
      .getByRole("button", { name: "More actions" })
      .click();
    await page.getByRole("menuitem", { name: "Delete guide" }).click();
    await page
      .getByRole("dialog", { name: "Delete this guide?" })
      .getByRole("button", { name: "Delete guide" })
      .click();
    await expect(page).toHaveURL(staffUrl("/guides"));
    await expect(page.getByText(title)).toHaveCount(0);
  });

  test("clinic staff can share a published guide without mutation controls", async ({
    page,
  }) => {
    await signInAsLocalStaff(page);
    await page.goto(staffUrl("/guides"), { waitUntil: "load" });
    const published = page
      .locator("ul.divide-y > li")
      .filter({ hasText: "Tooth Extraction" });
    await expect(published.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await expect(
      published.getByRole("button", { name: "Share" })
    ).toBeVisible();
    await published.getByRole("button", { name: "Share" }).click();
    await expect(
      page
        .getByRole("dialog", { name: "Share published guide" })
        .locator("a.staffShareUrl")
    ).toHaveAttribute("href", tenantUrl(DEMO_TENANT_SLUG, "/extraction"));
  });
});
