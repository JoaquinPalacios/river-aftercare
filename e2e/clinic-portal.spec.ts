import { expect, test } from "@playwright/test";

import {
  expectNoSeriousAxeViolations,
  expectNoSeriousAxeViolationsLightAndDark,
  setPortalColorScheme,
} from "./helpers/axe";
import {
  contrastRatio,
  expectNoHorizontalOverflow,
  expectPracticePageDoesNotOverflow,
  expectUsableTapTarget,
  measureHorizontalOverflow,
  relativeLuminance,
} from "./helpers/layout";
import {
  DEMO_TENANT_SLUG,
  marketingUrl,
  staffUrl,
  tenantUrl,
} from "./helpers/origins";
import {
  signInAsLocalAdmin,
  signInAsLocalOperator,
  signInAsLocalStaff,
} from "./helpers/staff-auth";

test.describe("clinic portal", () => {
  test("unauthenticated dashboard and guides redirect to login", async ({
    page,
  }) => {
    for (const pathname of ["/dashboard", "/guides", "/practice"] as const) {
      await page.goto(staffUrl(pathname), { waitUntil: "load" });
      await expect(page).toHaveURL(/\/login/);
      await expect(
        page.getByRole("heading", { name: "Sign in", exact: true })
      ).toBeVisible();
      await expect(page.getByText("River Aftercare").first()).toBeVisible();
      await expect(page.getByText("Care Guide", { exact: true })).toHaveCount(
        0
      );
    }
  });

  test("login and overview show the aftercare portal, not chairside", async ({
    page,
  }) => {
    await page.goto(staffUrl("/login"), { waitUntil: "load" });
    await page.screenshot({
      path: "test-results/artifacts/staff-login-1440.png",
    });
    await expectNoSeriousAxeViolations(page);

    await signInAsLocalAdmin(page);
    await expect(
      page.getByRole("heading", { name: "Riverside Dental Demo" })
    ).toBeVisible();
    await expect(
      page.getByText("Manage your clinic's patient aftercare.")
    ).toBeVisible();
    await expect(
      page.getByText("Published guides", { exact: true })
    ).toBeVisible();
    await expect(page.getByText("Draft guides", { exact: true })).toBeVisible();
    await expect(page.getByText("Clinic setup", { exact: true })).toBeVisible();
    const configured = page
      .locator(".staffStatusPill", { hasText: "Configured" })
      .first();
    await expect(configured).toBeVisible();
    await setPortalColorScheme(page, "light");
    const lightBadge = await configured.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color };
    });
    expect(relativeLuminance(lightBadge.background)).toBeGreaterThan(0.72);
    expect(relativeLuminance(lightBadge.color)).toBeLessThan(0.35);
    expect(
      contrastRatio(lightBadge.background, lightBadge.color)
    ).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({
      path: "test-results/artifacts/phase-2a.5-overview-configured-light.png",
    });
    await setPortalColorScheme(page, "dark");
    const darkBadge = await configured.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color };
    });
    expect(relativeLuminance(darkBadge.background)).toBeLessThan(0.25);
    expect(relativeLuminance(darkBadge.color)).toBeGreaterThan(0.55);
    expect(
      contrastRatio(darkBadge.background, darkBadge.color)
    ).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({
      path: "test-results/artifacts/phase-2a.5-overview-configured-dark.png",
    });
    await setPortalColorScheme(page, "light");
    await expect(
      page.getByRole("link", { name: /View patient site/ }).first()
    ).toHaveAttribute("href", tenantUrl(DEMO_TENANT_SLUG, "/"));
    await expect(page.getByText("In-progress sessions")).toHaveCount(0);
    await expect(page.getByText("Start a new session")).toHaveCount(0);
    await expect(page.getByText("Procedure templates")).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Clinic portal" })
    ).toBeVisible();
    await expect(
      page.getByRole("complementary").getByText("Clinic admin")
    ).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({
      path: "test-results/artifacts/staff-dashboard-1440.png",
      fullPage: true,
    });
    await page.screenshot({
      path: "docs/product/artifacts/phase-2a.2/portal-sidebar-role-1440.png",
    });
    await page.screenshot({
      path: "docs/product/artifacts/phase-2a.2/portal-fixed-sidebar-1440.png",
      fullPage: true,
    });
    await expectNoSeriousAxeViolationsLightAndDark(page);

    await page.setViewportSize({ width: 768, height: 1024 });
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: "test-results/artifacts/staff-dashboard-tablet.png",
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("button", { name: "Clinic portal menu" })
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: "test-results/artifacts/staff-dashboard-mobile.png",
      fullPage: true,
    });
    await expectNoSeriousAxeViolations(page);

    await page.setViewportSize({ width: 360, height: 800 });
    await expectNoHorizontalOverflow(page);
  });

  test("guides lists real clinic guides with working preview links", async ({
    page,
  }) => {
    await signInAsLocalAdmin(page);
    await page.getByRole("link", { name: "Guides" }).click();
    await expect(page).toHaveURL(staffUrl("/guides"));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Guides"
    );
    await expect(
      page.getByText("Tooth Extraction", { exact: true })
    ).toBeVisible();
    await expect(
      page
        .locator("ul.divide-y > li")
        .filter({ hasText: "Tooth Extraction" })
        .locator("p.mt-1")
    ).toContainText("/extraction");
    await expect(
      page.getByText("Published", { exact: true }).first()
    ).toBeVisible();
    await expect(page.getByText("Wisdom Teeth")).toHaveCount(0);
    await expect(page.getByText("Root Canal")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Create guide" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Add guide" })).toHaveCount(
      0
    );
    await expect(
      page.getByRole("link", { name: "Edit" }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Preview" }).first()
    ).toBeVisible();
    await expect(
      page
        .locator("ul.divide-y > li")
        .filter({ hasText: "Tooth Extraction" })
        .getByRole("link", { name: /View patient guide/ })
    ).toHaveAttribute("href", tenantUrl(DEMO_TENANT_SLUG, "/extraction"));
    await expect(page.getByText("Harbor Family Dental")).toHaveCount(0);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({
      path: "test-results/artifacts/staff-guides-1440.png",
      fullPage: true,
    });
    await page.screenshot({
      path: "docs/product/artifacts/phase-2a.2/guides-list-1440.png",
      fullPage: true,
    });
    await expectNoSeriousAxeViolations(page);
  });

  test("parked chairside routes remain directly reachable", async ({
    page,
  }) => {
    await signInAsLocalAdmin(page);
    const procedures = await page.goto(staffUrl("/dashboard/procedures"), {
      waitUntil: "load",
    });
    expect(procedures?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Procedure templates" })
    ).toBeVisible();

    const newSession = await page.goto(staffUrl("/sessions/new"), {
      waitUntil: "load",
    });
    expect(newSession?.status()).toBe(200);
    await expect(page.getByText("Start a new session")).toBeVisible();
  });

  test("password visibility toggle does not submit the form", async ({
    page,
  }) => {
    await page.goto(staffUrl("/login"), { waitUntil: "load" });
    await expect(
      page.getByRole("link", { name: "Back to River Aftercare" })
    ).toHaveAttribute("href", marketingUrl("/"));
    const password = page.locator("#password");
    await password.fill("LocalOnly123!");
    await expect(password).toHaveAttribute("type", "password");
    await page.screenshot({
      path: "test-results/artifacts/staff-login-password-hidden.png",
    });

    await page.getByRole("button", { name: "Show password" }).click();
    await expect(page).toHaveURL(staffUrl("/login"));
    await expect(password).toHaveAttribute("type", "text");
    await expect(
      page.getByRole("button", { name: "Hide password" })
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/staff-login-password-shown.png",
    });
    await expectNoSeriousAxeViolations(page);
  });

  test("admin can open Practice, create-guide, editor, and draft preview", async ({
    page,
  }) => {
    await signInAsLocalAdmin(page);
    await page.getByRole("link", { name: "Practice" }).click();
    await expect(page).toHaveURL(staffUrl("/practice"));
    await expect(
      page.getByRole("heading", { name: "Riverside Dental Demo" })
    ).toBeVisible();
    await expect(
      page.getByLabel("Primary colour", { exact: true })
    ).toBeVisible();
    await expect(page.locator("#primaryColor-picker")).toHaveCount(1);
    await expect(page.getByLabel("Corner radius")).toHaveClass(/staffSelect/);
    await expect(
      page
        .getByRole("button", { name: "Save changes" })
        .filter({ visible: true })
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/staff-practice-1440.png",
      fullPage: true,
    });
    await page.screenshot({
      path: "docs/product/artifacts/phase-2a.2/practice-header-1440.png",
      fullPage: true,
    });
    await page.locator("#primaryColor-picker").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "docs/product/artifacts/phase-2a.2/practice-colour-and-selects-1440.png",
    });
    await expectNoSeriousAxeViolationsLightAndDark(page, {
      // Axe samples the clinic mark behind the overlay file trigger in Dark.
      darkExclude: ".staffFileTrigger",
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: "test-results/artifacts/staff-practice-mobile.png",
      fullPage: true,
    });

    await page.setViewportSize({ width: 360, height: 800 });
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(staffUrl("/guides/new"), { waitUntil: "load" });
    await expect(
      page.getByRole("heading", { name: "Create guide" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Start from a template" })
    ).toBeVisible();
    await expect(page.getByText("Tooth Extraction")).toBeVisible();
    await expect(page.getByText("Wisdom Teeth")).toHaveCount(0);
    await page.screenshot({
      path: "test-results/artifacts/staff-create-guide-1440.png",
      fullPage: true,
    });

    await page.goto(staffUrl("/guides"), { waitUntil: "load" });
    await page.getByRole("link", { name: "Edit" }).first().click();
    await expect(
      page.getByRole("button", { name: "Save draft" }).filter({ visible: true })
    ).toBeVisible();
    await expect(
      page
        .getByRole("button", { name: "Publish guide" })
        .filter({ visible: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cancel" }).filter({ visible: true })
    ).toBeVisible();
    await expect(page.locator("[data-save-state=saved]")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add stage" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Tooth Extraction" }).first()
    ).toBeVisible();
    await expect(page.getByText("Live patient timeline").first()).toBeVisible();
    await expect(page.locator(".staffEditorToolbar")).toBeVisible();
    await expect(page.locator(".staffEditorRailCard")).toHaveCount(0);

    async function expectFourRowTextarea(
      locator: ReturnType<typeof page.getByLabel>,
      label: string
    ) {
      const metrics = await locator.evaluate((element) => {
        const textarea = element as HTMLTextAreaElement;
        const style = getComputedStyle(textarea);
        return {
          rows: textarea.rows,
          height: textarea.clientHeight,
          lineHeight: Number.parseFloat(style.lineHeight),
        };
      });
      expect(metrics.rows, `${label} rows`).toBeGreaterThanOrEqual(4);
      expect(metrics.height, `${label} height`).toBeGreaterThanOrEqual(
        metrics.lineHeight * 4 - 1
      );
    }

    const instructions = page.getByLabel("Instructions").first();
    await expect(instructions).toBeVisible();
    await expectFourRowTextarea(instructions, "timeline instructions");
    await instructions.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "test-results/artifacts/phase-2a.5-editor-timeline-instructions.png",
    });

    const warningGuidance = page
      .locator("section")
      .filter({
        has: page.getByRole("heading", { name: "Warnings / contact" }),
      })
      .getByLabel("Guidance")
      .first();
    await expect(warningGuidance).toBeVisible();
    await expectFourRowTextarea(warningGuidance, "warning/contact guidance");
    await warningGuidance.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "test-results/artifacts/phase-2a.5-editor-warning-guidance.png",
    });

    await expectFourRowTextarea(
      page.getByLabel("Short introduction"),
      "short introduction"
    );

    await page.screenshot({
      path: "test-results/artifacts/staff-guide-editor-1440.png",
      fullPage: true,
    });
    await expectNoSeriousAxeViolationsLightAndDark(page);
    await page.screenshot({
      path: "docs/product/artifacts/phase-2a.2/guide-editor-desktop-1440.png",
      fullPage: true,
    });

    await page.setViewportSize({ width: 768, height: 1024 });
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: "test-results/artifacts/staff-guide-editor-tablet.png",
      fullPage: true,
    });

    await page.setViewportSize({ width: 360, height: 800 });
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: "docs/product/artifacts/phase-2a.2/guide-editor-mobile-360.png",
      fullPage: true,
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("link", { name: "Preview" }).first().click();
    await expect(page).toHaveURL(/\/guides\/.+\/preview/);
    await expect(
      page.getByText("Draft preview", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Tooth Extraction" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Back to Tooth Extraction" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit guide" })).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/staff-guide-preview-toolbar-1440.png",
    });
    await page.getByRole("link", { name: "Back to Tooth Extraction" }).click();
    await expect(page).toHaveURL(/\/guides\/.+\/edit/);
  });

  test("clinic staff cannot mutate guides or open Practice", async ({
    page,
  }) => {
    await signInAsLocalStaff(page);
    await expect(
      page.getByRole("complementary").getByText("Clinic staff")
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Clinic portal" })
        .getByRole("link", {
          name: "Practice",
        })
    ).toHaveCount(0);
    await page.goto(staffUrl("/guides"), { waitUntil: "load" });
    await expect(page.getByRole("link", { name: "Create guide" })).toHaveCount(
      0
    );
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "More actions" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("menuitem", { name: "Unpublish guide" })
    ).toHaveCount(0);
    await page.getByRole("link", { name: "Preview" }).first().click();
    await expect(page).toHaveURL(/\/guides\/.+\/preview/);
    await expect(
      page.getByRole("link", { name: "Back to guides" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit guide" })).toHaveCount(0);
    await page.getByRole("link", { name: "Back to guides" }).click();
    await expect(page).toHaveURL(staffUrl("/guides"));
    const practice = await page.goto(staffUrl("/practice"), {
      waitUntil: "load",
    });
    expect(practice?.status()).toBe(404);
    const operator = await page.goto(staffUrl("/operator/clinics"), {
      waitUntil: "load",
    });
    expect(operator?.status()).toBe(404);
  });

  test("clinic admin cannot open All Clinics", async ({ page }) => {
    await signInAsLocalAdmin(page);
    const operator = await page.goto(staffUrl("/operator/clinics"), {
      waitUntil: "load",
    });
    expect(operator?.status()).toBe(404);
  });
});

test.describe("platform operator", () => {
  test("operator sees All Clinics and clinic detail", async ({ page }) => {
    await page.goto(staffUrl("/operator/clinics"), { waitUntil: "load" });
    await expect(page).toHaveURL(/\/login/);

    await signInAsLocalOperator(page);
    await expect(page).toHaveURL(staffUrl("/operator/clinics"));
    await expect(
      page.getByRole("heading", { name: "All Clinics" })
    ).toBeVisible();
    await expect(
      page.getByRole("complementary").getByText("Platform operator").first()
    ).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(
      page.locator(".staffOperatorStat dt", { hasText: "Total clinics" })
    ).toBeVisible();
    await expect(
      page.locator(".staffOperatorStat dt", { hasText: "Configured clinics" })
    ).toBeVisible();
    await expect(
      page.locator(".staffOperatorStat dt", { hasText: "Published guides" })
    ).toBeVisible();
    await expect(
      page.locator(".staffOperatorStat dt", { hasText: "Needs attention" })
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Platform" })
        .getByRole("link", { name: "Clinics" })
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Platform" })
        .getByRole("link", { name: "SEO & Discovery" })
    ).toBeVisible();
    await expect(page.getByText("Riverside Dental Demo")).toBeVisible();
    await expect(page.getByText("demodental")).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/operator-clinics-1440.png",
      fullPage: true,
    });
    await expectNoSeriousAxeViolationsLightAndDark(page);

    await page.getByRole("link", { name: "Riverside Dental Demo" }).click();
    await expect(
      page.getByRole("heading", { name: "Riverside Dental Demo" })
    ).toBeVisible();
    await expect(page.getByText("demodental")).toBeVisible();
    await expect(page.getByText("Tooth Extraction")).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", {
        name: "All Clinics",
      })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Back to all clinics" })
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/operator-clinic-detail-1440.png",
      fullPage: true,
    });
    await expectNoSeriousAxeViolationsLightAndDark(page);
    await page.getByRole("link", { name: "Back to all clinics" }).click();
    await expect(page).toHaveURL(staffUrl("/operator/clinics"));
  });
});

test.describe("clinic portal UX polish", () => {
  test("guide editor cancel, dirty confirmation, and publish confirmation", async ({
    page,
  }) => {
    await signInAsLocalAdmin(page);
    await page.goto(staffUrl("/guides"), { waitUntil: "load" });
    await page.getByRole("link", { name: "Edit" }).first().click();
    await expect(
      page.getByRole("heading", { name: "Tooth Extraction" }).first()
    ).toBeVisible();
    await expect(page.locator("[data-save-state=saved]")).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({
      path: "test-results/artifacts/staff-guide-editor-clean-1440.png",
      fullPage: true,
    });

    await page
      .getByRole("button", { name: "Cancel" })
      .filter({ visible: true })
      .click();
    await expect(page).toHaveURL(staffUrl("/guides"));
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("link", { name: "Edit" }).first().click();
    const introduction = page.getByLabel("Short introduction");
    await introduction.fill(`${await introduction.inputValue()} `);
    await expect(page.locator("[data-save-state=unsaved]")).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/staff-guide-editor-unsaved-1440.png",
      fullPage: true,
    });

    await page
      .getByRole("button", { name: "Cancel" })
      .filter({ visible: true })
      .click();
    const discardDialog = page.getByRole("dialog", {
      name: "Discard unsaved changes?",
    });
    await expect(discardDialog).toBeVisible();
    await expect(
      discardDialog.getByText("Your latest changes haven't been saved.")
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/staff-guide-editor-cancel-dialog-1440.png",
    });
    await setPortalColorScheme(page, "dark");
    await page.screenshot({
      path: "test-results/artifacts/staff-guide-editor-cancel-dialog-dark-1440.png",
    });
    await setPortalColorScheme(page, "light");
    await discardDialog.getByRole("button", { name: "Keep editing" }).click();
    await expect(discardDialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/guides\/.+\/edit/);
    await expect(page.locator("[data-save-state=unsaved]")).toBeVisible();

    await page
      .getByRole("button", { name: "Cancel" })
      .filter({ visible: true })
      .click();
    await page.getByRole("button", { name: "Discard changes" }).click();
    await expect(page).toHaveURL(staffUrl("/guides"));

    await page.getByRole("link", { name: "Edit" }).first().click();
    await expect(page.locator("[data-save-state=saved]")).toBeVisible();
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
        "Patients using the public guide will see this version."
      )
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/staff-guide-editor-publish-dialog-1440.png",
    });
    await publishDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(publishDialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/guides\/.+\/edit/);
  });

  test("saving a draft marks the editor clean until the next edit", async ({
    page,
  }) => {
    await signInAsLocalAdmin(page);
    await page.goto(staffUrl("/guides/new"), { waitUntil: "load" });
    const slug = `ux-polish-${Date.now()}`;
    await page.getByLabel("Guide title").fill("UX polish draft");
    await page.getByLabel("Public slug").fill(slug);
    await page.getByRole("button", { name: "Create custom guide" }).click();
    await expect(page).toHaveURL(/\/guides\/.+\/edit/);
    await expect(page.locator("[data-save-state=saved]")).toBeVisible();
    await page.getByLabel("Short introduction").fill("Draft only copy.");
    await expect(page.locator("[data-save-state=unsaved]")).toBeVisible();
    await page
      .getByRole("button", { name: "Save draft" })
      .filter({ visible: true })
      .click();
    await expect(page.locator("[data-save-state=saved]")).toBeVisible();
    await expect(
      page.getByText(
        "Draft saved. The public guide is unchanged until you publish."
      )
    ).toBeVisible();
    await page
      .getByLabel("Short introduction")
      .fill("Draft only copy, edited.");
    await expect(page.locator("[data-save-state=unsaved]")).toBeVisible();
  });

  test("portal appearance is a sidebar preference separate from patient theme", async ({
    page,
  }) => {
    await signInAsLocalAdmin(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    const appearance = page.locator("aside").getByRole("button", {
      name: /Appearance, colour theme currently/,
    });
    await expect(appearance).toBeVisible();
    await appearance.click();
    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-mode",
      "dark"
    );
    await page.screenshot({
      path: "test-results/artifacts/staff-sidebar-dark-1440.png",
    });

    await page.reload({ waitUntil: "load" });
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-mode",
      "dark"
    );

    await page
      .locator("aside")
      .getByRole("button", {
        name: /Appearance, colour theme currently/,
      })
      .click();
    await page.getByRole("radio", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-mode",
      "light"
    );
    await page.screenshot({
      path: "test-results/artifacts/staff-sidebar-light-1440.png",
    });

    await page.goto(staffUrl("/practice"), { waitUntil: "load" });
    await expect(page.getByLabel("Default appearance")).toHaveValue("SYSTEM");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Clinic portal menu" }).click();
    await expect(
      page.getByRole("button", { name: /Appearance, colour theme currently/ })
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/staff-mobile-nav-appearance-390.png",
    });
  });

  test("practice page has section hierarchy and save-state copy", async ({
    page,
  }) => {
    await signInAsLocalAdmin(page);
    await page.goto(staffUrl("/practice"), { waitUntil: "load" });
    await expect(
      page.getByRole("heading", { name: "Practice identity" })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Branding" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Contact" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Emergency / urgent help" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Patient presentation" })
    ).toBeVisible();
    await expect(page.locator("[data-save-state=saved]")).toBeVisible();
    await expect(
      page.getByText("Practice logo", { exact: true }).first()
    ).toBeVisible();
    await expect(page.locator("#clinic-logo-file")).toHaveCount(1);
    await expect(page.locator("#clinic-dark-logo-file")).toHaveCount(1);
    await expect(page.locator("#clinic-favicon-file")).toHaveCount(1);
    await expect(page.getByText("Choose replacement")).toBeVisible();
    await expect(
      page.getByText("SVG, PNG, JPEG or WebP", { exact: false }).first()
    ).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(3);
    await expect(page.locator('input[type="color"]')).toHaveCount(3);
    await page.getByLabel("Display name").fill("Riverside Dental Demo ");
    await expect(page.locator("[data-save-state=unsaved]")).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({
      path: "test-results/artifacts/staff-practice-sections-1440.png",
      fullPage: true,
    });
    await page.getByRole("link", { name: "Guides" }).click();
    await expect(
      page.getByRole("dialog", { name: "Discard unsaved changes?" })
    ).toBeVisible();
    await page.getByRole("button", { name: "Discard changes" }).click();
    await expect(page).toHaveURL(staffUrl("/guides"));
  });

  test("new custom guide shows empty live preview", async ({ page }) => {
    await signInAsLocalAdmin(page);
    await page.goto(staffUrl("/guides/new"), { waitUntil: "load" });
    const slug = `empty-preview-${Date.now()}`;
    await page.getByLabel("Guide title").fill("Empty preview draft");
    await page.getByLabel("Public slug").fill(slug);
    await page.getByRole("button", { name: "Create custom guide" }).click();
    await expect(page).toHaveURL(/\/guides\/.+\/edit/);
    await expect(
      page.getByRole("heading", { name: "Patient timeline preview" })
    ).toBeVisible();
    await expect(
      page.getByText("Add a recovery stage to see the patient timeline here.")
    ).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({
      path: "test-results/artifacts/staff-guide-editor-empty-preview-1440.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Cancel" })
      .filter({ visible: true })
      .click();
    await expect(page).toHaveURL(staffUrl("/guides"));
    const row = page.locator("li").filter({ hasText: "Empty preview draft" });
    await row.getByRole("button", { name: "More actions" }).click();
    await row.getByRole("menuitem", { name: "Delete guide" }).click();
    await page
      .getByRole("dialog", { name: "Delete this guide?" })
      .getByRole("button", { name: "Delete guide" })
      .click();
    await expect(page.getByText("Empty preview draft")).toHaveCount(0);
  });

  test("desktop sidebar stays viewport-fixed while the page scrolls", async ({
    page,
  }) => {
    await signInAsLocalAdmin(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(staffUrl("/practice"), { waitUntil: "load" });
    const sidebar = page.locator("aside").first();
    const before = await sidebar.boundingBox();
    await page.locator(".staffAppScroller").evaluate((node) => {
      node.scrollTop = 800;
    });
    const after = await sidebar.boundingBox();
    const windowScrollY = await page.evaluate(() => window.scrollY);
    const scrollerTop = await page
      .locator(".staffAppScroller")
      .evaluate((node) => node.scrollTop);
    expect(before?.y).toBeCloseTo(after?.y ?? -1, 0);
    expect(before?.height).toBeGreaterThan(700);
    expect(windowScrollY).toBe(0);
    expect(scrollerTop).toBeGreaterThan(0);
    await page.screenshot({
      path: "test-results/artifacts/staff-practice-fixed-sidebar-1440.png",
      fullPage: true,
    });
  });

  test("practice page does not overflow horizontally at core viewports", async ({
    page,
  }) => {
    await signInAsLocalAdmin(page);
    await page.goto(staffUrl("/practice"), { waitUntil: "load" });
    const viewports = [
      {
        width: 1728,
        height: 877,
        artifact: "staff-practice-1728-overflow.png",
      },
      {
        width: 1440,
        height: 900,
        artifact: "staff-practice-1440-overflow.png",
      },
      { width: 1280, height: 800, artifact: "staff-practice-1280.png" },
      { width: 1024, height: 768, artifact: "staff-practice-1024.png" },
      { width: 768, height: 1024, artifact: "staff-practice-768.png" },
      { width: 390, height: 844, artifact: "staff-practice-390.png" },
      { width: 360, height: 800, artifact: "staff-practice-360.png" },
    ] as const;

    for (const viewport of viewports) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await expectPracticePageDoesNotOverflow(
        page,
        `${viewport.width}x${viewport.height}`
      );
      if (viewport.width >= 1024) {
        await page
          .getByRole("navigation", { name: "Practice sections" })
          .getByRole("link", { name: "Contact" })
          .click();
        await expectPracticePageDoesNotOverflow(
          page,
          `${viewport.width}x${viewport.height} after section nav`
        );
      }
      await page
        .getByLabel("Display name")
        .fill("Riverside Dental Demo overflow");
      await expectPracticePageDoesNotOverflow(
        page,
        `${viewport.width}x${viewport.height} after edit`
      );
      await page.screenshot({
        path: `test-results/artifacts/${viewport.artifact}`,
        fullPage: true,
      });
    }
  });

  test("sign out occupies the full sidebar utility row", async ({ page }) => {
    await signInAsLocalAdmin(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    const signOut = page.locator("aside").getByRole("button", {
      name: "Sign out",
    });
    await expect(signOut).toBeVisible();
    await expectUsableTapTarget(signOut);
    const row = await signOut.boundingBox();
    const sidebar = await page.locator("aside").first().boundingBox();
    expect(row, "sign out row should be visible").not.toBeNull();
    expect(sidebar, "sidebar should be visible").not.toBeNull();
    expect(row!.width).toBeGreaterThan(180);
    await signOut.hover();
    await page.screenshot({
      path: "test-results/artifacts/staff-sign-out-hover-1440.png",
    });
    await signOut.focus();
    await page.screenshot({
      path: "test-results/artifacts/staff-sign-out-focus-1440.png",
    });
  });

  test("public patient guide has no staff preview chrome", async ({ page }) => {
    await page.goto(tenantUrl(DEMO_TENANT_SLUG, "/extraction"), {
      waitUntil: "load",
    });
    await expect(
      page.getByRole("heading", { name: "Tooth Extraction" })
    ).toBeVisible();
    await expect(page.getByText("Draft preview", { exact: true })).toHaveCount(
      0
    );
    await expect(page.getByRole("link", { name: "Back to guide" })).toHaveCount(
      0
    );
    await expect(page.getByRole("link", { name: "Edit guide" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Back to staff" })).toHaveCount(
      0
    );
    await page.screenshot({
      path: "docs/product/artifacts/phase-2a.2/patient-extraction-1440.png",
      fullPage: true,
    });
  });

  test("timeline accordion is exclusive and live preview follows unsaved titles", async ({
    page,
  }) => {
    await signInAsLocalAdmin(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(staffUrl("/guides"), { waitUntil: "load" });
    await page.getByRole("link", { name: "Edit" }).first().click();

    const stages = page.locator("article[data-stage-key]");
    const firstStage = stages.nth(0);
    const secondStage = stages.nth(1);
    await expect(firstStage).toHaveAttribute("data-expanded", "true");
    await page.screenshot({
      path: "docs/product/artifacts/phase-2a.2/editor-stages-collapsed-1440.png",
      fullPage: true,
    });
    await secondStage.getByRole("button").first().click();
    await expect(firstStage).toHaveAttribute("data-expanded", "false");
    await expect(secondStage).toHaveAttribute("data-expanded", "true");
    await page.screenshot({
      path: "docs/product/artifacts/phase-2a.2/editor-stage-expanded-1440.png",
      fullPage: true,
    });
    await page.screenshot({
      path: "docs/product/artifacts/phase-2a.2/editor-live-preview-rail-1440.png",
    });

    const titleField = secondStage.getByRole("textbox", {
      name: "Title",
      exact: true,
    });
    const original = await titleField.inputValue();
    await titleField.fill("Live preview stage title");
    await expect(
      page.locator("[data-live-preview]").getByText("Live preview stage title")
    ).toBeVisible();
    await titleField.fill(original);

    await page.getByRole("button", { name: "Add stage" }).click();
    const newest = stages.last();
    await expect(newest).toHaveAttribute("data-expanded", "true");
    await expect(
      newest.getByRole("textbox", { name: "Title", exact: true })
    ).toHaveValue("New stage");
    await newest.getByRole("button", { name: "Remove stage" }).click();
  });

  test("admin can delete an unpublished custom draft from the overflow menu", async ({
    page,
  }) => {
    await signInAsLocalAdmin(page);
    await page.goto(staffUrl("/guides/new"), { waitUntil: "load" });
    const slug = `delete-draft-${Date.now()}`;
    await page.getByLabel("Guide title").fill("Delete me draft");
    await page.getByLabel("Public slug").fill(slug);
    await page.getByRole("button", { name: "Create custom guide" }).click();
    await expect(page).toHaveURL(/\/guides\/.+\/edit/);
    await page
      .getByRole("button", { name: "Cancel" })
      .filter({ visible: true })
      .click();
    await expect(page).toHaveURL(staffUrl("/guides"));
    const row = page.locator("li", { hasText: "Delete me draft" });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "More actions" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Delete guide" })
    ).toBeVisible();
    await page.screenshot({
      path: "docs/product/artifacts/phase-2a.2/guides-overflow-menu-1440.png",
    });
    await page.getByRole("menuitem", { name: "Delete guide" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Delete this guide?",
    });
    await expect(dialog).toBeVisible();
    await page.screenshot({
      path: "docs/product/artifacts/phase-2a.2/delete-draft-dialog-1440.png",
    });
    await dialog.getByRole("button", { name: "Delete guide" }).click();
    await expect(page.getByText("Delete me draft")).toHaveCount(0);
  });

  test("admin can delete an unpublished draft from the editor more actions menu", async ({
    page,
  }) => {
    await signInAsLocalAdmin(page);
    await page.goto(staffUrl("/guides/new"), { waitUntil: "load" });
    const slug = `editor-delete-${Date.now()}`;
    await page.getByLabel("Guide title").fill("Editor delete draft");
    await page.getByLabel("Public slug").fill(slug);
    await page.getByRole("button", { name: "Create custom guide" }).click();
    await expect(page).toHaveURL(/\/guides\/.+\/edit/);
    await page
      .locator(".staffEditorToolbarActions")
      .getByRole("button", { name: "More actions" })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Delete guide" })
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/staff-editor-more-actions-delete.png",
    });
    await page.getByRole("menuitem", { name: "Delete guide" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Delete this guide?",
    });
    await expect(dialog).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/staff-editor-delete-draft-dialog.png",
    });
    await dialog.getByRole("button", { name: "Delete guide" }).click();
    await expect(page).toHaveURL(staffUrl("/guides"));
    await expect(page.getByText("Editor delete draft")).toHaveCount(0);
  });

  test("admin can discard draft changes from the editor more actions menu", async ({
    page,
  }) => {
    await signInAsLocalAdmin(page);
    await page.goto(
      staffUrl("/guides/practice_guide_demo_rivers_extraction/edit"),
      { waitUntil: "load" }
    );
    const title = page.getByLabel("Guide title");
    const publishedTitle = "Tooth Extraction";
    await title.fill(`${publishedTitle} draft change`);
    await page
      .getByRole("button", { name: "Save draft" })
      .filter({ visible: true })
      .click();
    await expect(page.getByText("Please review the form")).toHaveCount(0);
    await expect(page.getByText("Draft changes").first()).toBeVisible();
    await expect(page.locator("[data-save-state=saved]")).toBeVisible();
    await page
      .locator(".staffEditorToolbarActions")
      .getByRole("button", { name: "More actions" })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Discard draft changes" })
    ).toBeVisible();
    await page.getByRole("menuitem", { name: "Discard draft changes" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Discard draft changes?",
    });
    await expect(dialog).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/staff-editor-discard-dialog.png",
    });
    await dialog.getByRole("button", { name: "Discard changes" }).click();
    await expect(title).toHaveValue(publishedTitle);
    await expect(page.getByText("Draft changes", { exact: true })).toHaveCount(
      0
    );
    await expect(
      page.locator(".staffEditorToolbarActions").getByRole("button", {
        name: "More actions",
      })
    ).toBeVisible();
    await page
      .locator(".staffEditorToolbarActions")
      .getByRole("button", { name: "More actions" })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Discard draft changes" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("menuitem", { name: "Unpublish guide" })
    ).toBeVisible();
  });

  test("authenticated preview isolates patient appearance from the portal", async ({
    page,
  }) => {
    await signInAsLocalAdmin(page);
    await page.goto(staffUrl("/guides"), { waitUntil: "load" });
    await page.getByRole("link", { name: "Preview" }).first().click();
    await expect(page).toHaveURL(/\/guides\/.+\/preview/);
    const surface = page.locator(".aftercareTheme").first();
    await expect(surface).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Patient preview appearance" })
    ).toBeVisible();

    for (const portal of ["light", "dark"] as const) {
      await setPortalColorScheme(page, portal);
      for (const patient of ["light", "dark"] as const) {
        await page
          .getByRole("combobox", { name: "Patient preview appearance" })
          .selectOption(patient);
        await expect(surface).toHaveAttribute("data-patient-theme", patient);
        await expect(page.locator(".staffPreviewShell")).toHaveAttribute(
          "data-preview-theme",
          patient
        );
        const toolbar = page.locator(".staffPreviewToolbar");
        const toolbarTone = await toolbar.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            colorScheme: style.colorScheme,
            background: style.backgroundColor,
          };
        });
        expect(
          toolbarTone.colorScheme,
          `${portal}/${patient} toolbar`
        ).toContain(patient);
        const toolbarIsDark = relativeLuminance(toolbarTone.background) < 0.4;
        expect(toolbarIsDark, `${portal}/${patient} toolbar tone`).toBe(
          patient === "dark"
        );
        const tokens = await surface.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            surface: style.getPropertyValue("--cg-surface").trim(),
            text: style.getPropertyValue("--cg-text").trim(),
            muted: style.getPropertyValue("--cg-text-muted").trim(),
            border: style.getPropertyValue("--cg-border").trim(),
            warning: style.getPropertyValue("--cg-warning").trim(),
            emergency: style.getPropertyValue("--cg-emergency").trim(),
            brand: style.getPropertyValue("--cg-brand").trim(),
            colorScheme: style.colorScheme,
            background: style.backgroundColor,
            color: style.color,
          };
        });
        expect(tokens.colorScheme, `${portal}/${patient}`).toContain(patient);
        expect(
          contrastRatio(tokens.background, tokens.color),
          `${portal}/${patient} text`
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(tokens.surface || tokens.background, tokens.text),
          `${portal}/${patient} token text`
        ).toBeGreaterThan(3);
        expect(tokens.brand.length).toBeGreaterThan(0);
        expect(tokens.warning.length).toBeGreaterThan(0);
        expect(tokens.emergency.length).toBeGreaterThan(0);
        expect(tokens.muted.length).toBeGreaterThan(0);
        expect(tokens.border.length).toBeGreaterThan(0);
        await page.screenshot({
          path: `test-results/artifacts/staff-preview-portal-${portal}-patient-${patient}.png`,
        });
      }
    }

    await page
      .getByRole("combobox", { name: "Patient preview appearance" })
      .selectOption("clinic");
    await expect(surface).toHaveAttribute("data-patient-theme", "system");
    await expect(page.locator(".staffPreviewShell")).toHaveAttribute(
      "data-preview-theme",
      "system"
    );
    for (const [portal, os] of [
      ["dark", "light"],
      ["light", "dark"],
    ] as const) {
      await page.evaluate((mode) => {
        try {
          window.localStorage.setItem("aftercare-guide-portal-theme", mode);
        } catch {
          // Ignore storage failures in restricted contexts.
        }
        document.documentElement.setAttribute("data-theme-mode", mode);
      }, portal);
      await page.emulateMedia({ colorScheme: os });
      const tokens = await surface.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          colorScheme: style.colorScheme,
          background: style.backgroundColor,
          color: style.color,
        };
      });
      expect(tokens.colorScheme, `portal ${portal} / OS ${os}`).toBeTruthy();
      const backgroundIsDark = relativeLuminance(tokens.background) < 0.4;
      expect(backgroundIsDark, `portal ${portal} / OS ${os} follows OS`).toBe(
        os === "dark"
      );
      const toolbarTone = await page
        .locator(".staffPreviewToolbar")
        .evaluate((element) => {
          const style = getComputedStyle(element);
          return { background: style.backgroundColor };
        });
      const toolbarIsDark = relativeLuminance(toolbarTone.background) < 0.4;
      expect(
        toolbarIsDark,
        `portal ${portal} / OS ${os} toolbar follows OS`
      ).toBe(os === "dark");
      expect(
        contrastRatio(tokens.background, tokens.color),
        `portal ${portal} / OS ${os} text`
      ).toBeGreaterThanOrEqual(4.5);
    }

    await expectNoSeriousAxeViolations(page);
  });
});
