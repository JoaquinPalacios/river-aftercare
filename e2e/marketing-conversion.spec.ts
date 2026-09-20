import { mkdirSync, writeFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { expectNoSeriousAxeViolations } from "./helpers/axe";
import { expectGenericNotFound, expectOneH1 } from "./helpers/assertions";
import { expectNoHorizontalOverflow } from "./helpers/layout";
import { measurePageAssets, expectNoTailwind } from "./helpers/assets";
import { PRICING_METADATA } from "@/lib/marketing/metadata";

import {
  DEMO_TENANT_SLUG,
  marketingUrl,
  staffUrl,
  tenantUrl,
} from "./helpers/origins";

async function showMarketingScheme(
  page: import("@playwright/test").Page,
  scheme: "light" | "dark"
): Promise<void> {
  await page.emulateMedia({ colorScheme: scheme });
  await page.evaluate((mode) => {
    try {
      window.localStorage.setItem("aftercare-guide-marketing-theme", mode);
    } catch {
      // Ignore storage failures in restricted contexts.
    }
    document.documentElement.setAttribute("data-theme-mode", mode);
  }, scheme);
}

test.describe("marketing conversion routes", () => {
  test("pricing and contact resolve on the platform host", async ({ page }) => {
    const pricing = await page.goto(marketingUrl("/pricing"), {
      waitUntil: "load",
    });
    expect(pricing?.status()).toBe(200);
    expect(page.url()).toBe(marketingUrl("/pricing"));
    expect(page.url()).not.toContain("/_marketing");
    await expectOneH1(page, "Simple plans for branded patient aftercare.");
    await expect(
      page.getByRole("heading", {
        name: "Choose the plan that fits your practice",
      })
    ).toBeVisible();
    await expect(page.getByText("Connected aftercare plans")).toHaveCount(0);
    await expect(page.getByText("Connected recovery plans")).toHaveCount(0);
    await expect(page.getByText("A$79", { exact: true })).toBeVisible();
    await expect(page.getByText("A$149", { exact: true })).toBeVisible();
    await expect(page.getByText("A$790/year — 2 months free")).toBeVisible();
    await expect(page.getByText("A$1,490/year — 2 months free")).toBeVisible();
    await expect(
      page.getByText("Multi-location practice? Talk to us about your setup.")
    ).toBeVisible();
    await expect(
      page.getByText("Need a larger guide library? Talk to us.")
    ).toHaveCount(0);
    await expect(
      page.getByText("Create and adapt clinic aftercare")
    ).toHaveCount(0);
    await expect(page.getByText("Guide and section controls")).toHaveCount(0);
    await expect(page.getByText("Local clinic instructions")).toHaveCount(0);
    await expect(
      page.getByText("Create and edit up to 2 custom clinic guides")
    ).toBeVisible();
    await expect(
      page.getByText("Up to 2 custom clinic guides", { exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByText("Create and edit your own aftercare guides")
    ).toHaveCount(0);
    await expect(page.getByText("Everything in Essential")).toBeVisible();
    await expect(page.getByText("Up to 30 custom clinic guides")).toBeVisible();
    await expect(
      page.getByText("Adapt River Aftercare templates to suit your clinic")
    ).toBeVisible();
    const essentialCard = page.getByRole("article", {
      name: "Essential",
      exact: true,
    });
    const practiceCard = page.getByRole("article", {
      name: "Practice",
      exact: true,
    });
    const groupCard = page.getByRole("article", { name: "Group", exact: true });
    await expect(
      practiceCard.getByText("Assisted setup", { exact: true })
    ).toBeVisible();
    await expect(
      essentialCard.getByText("Assisted setup", { exact: true })
    ).toHaveCount(0);
    await expect(
      groupCard.getByText("Assisted setup", { exact: true })
    ).toHaveCount(0);
    await expect(practiceCard.getByText("Priority support")).toBeVisible();
    await expect(groupCard.getByText("Priority support")).toBeVisible();
    await expect(essentialCard.getByText("Standard support")).toHaveCount(0);
    await expect(essentialCard.getByText("Priority support")).toHaveCount(0);
    await expect(page.getByText("Up to 2 clinic team members")).toBeVisible();
    await expect(page.getByText("Up to 5 clinic team members")).toBeVisible();
    await expect(
      page.getByText("Add clinic-specific instructions")
    ).toHaveCount(0);
    await expect(
      page.getByText("Clinic branding and curated typography")
    ).toBeVisible();
    await expect(
      page.getByText(
        "* Choose from six curated professional typefaces. Need another? Ask us — additional options can be reviewed subject to availability."
      )
    ).toBeVisible();
    await expect(page.getByText("Custom pricing")).toBeVisible();
    await expect(page.getByText("Recommended")).toBeVisible();
    await expect(page.getByText("Coming after launch")).toHaveCount(0);
    await expect(
      page.getByText("All prices are in Australian dollars.")
    ).toBeVisible();
    await expect(page.getByText("All prices include GST.")).toHaveCount(0);
    await expect(page.getByText("GST included")).toHaveCount(0);
    await expect(page.getByText("Second location:")).toHaveCount(0);
    await expect(page.getByText("A$59")).toHaveCount(0);
    await expect(page.getByText("A$590")).toHaveCount(0);
    await expect(page.getByText("active custom")).toHaveCount(0);
    await expect(page.getByText("working pricing")).toHaveCount(0);
    await expect(page.getByText("provisional")).toHaveCount(0);
    await expect(
      page.locator('[class*="planFeatures"]', { hasText: "Patient check-ins" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Request a demo" }).first()
    ).toHaveAttribute("href", "/contact");
    await expect(page.locator('[data-mk-page-hero="pricing"]')).toHaveCount(1);
    await expect(page.locator(".mkPageWaveInnerPage")).toHaveCount(1);

    const contact = await page.goto(marketingUrl("/contact"), {
      waitUntil: "load",
    });
    expect(contact?.status()).toBe(200);
    expect(page.url()).toBe(marketingUrl("/contact"));
    await expectOneH1(page, "See how River Aftercare could fit your clinic.");
    await expect(
      page.getByRole("heading", { name: "Request a demo" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View the dental demo" })
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: "See pricing" })).toHaveCount(
      0
    );
    await expect(page.locator('[data-mk-page-hero="contact"]')).toHaveCount(1);
    await expect(page.locator(".mkPageWaveInnerPage")).toHaveCount(1);
    await expect(page.locator("form")).toHaveCount(1);
    await expect(page.getByLabel("Full name")).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Practice / clinic name")).toBeVisible();
    await expect(page.getByLabel("Number of locations")).toHaveCount(0);
    await expect(page.getByLabel("Phone (optional)")).toBeVisible();
    await expect(
      page.getByLabel("Anything you'd like us to know? (optional)")
    ).toBeVisible();
    await expect(
      page.getByText(
        "Do not include patient, medical or sensitive health information."
      )
    ).toBeVisible();
    await expect(page.getByText("Who it's for")).toHaveCount(0);
    await expect(
      page.getByText("Thanks — your message has been sent.")
    ).toHaveCount(0);

    const robots = await page.goto(marketingUrl("/robots.txt"), {
      waitUntil: "domcontentloaded",
    });
    expect(robots?.status()).toBe(200);
    const robotsBody = await robots?.text();
    expect(robotsBody).toContain("Allow: /pricing");
    expect(robotsBody).toContain("Disallow: /_marketing");
    expect(robotsBody).toContain("Disallow: /_sites");
    expect(robotsBody).toContain("Disallow: /operator");
    expect(robotsBody).toContain("Disallow: /guides");

    const sitemap = await page.goto(marketingUrl("/sitemap.xml"), {
      waitUntil: "domcontentloaded",
    });
    expect(sitemap?.status()).toBe(200);
    const sitemapBody = await sitemap?.text();
    expect(sitemapBody).toContain("/pricing");
    expect(sitemapBody).toContain("/contact");
    expect(sitemapBody).toContain("/dental");
    expect(sitemapBody).not.toContain("/_marketing");
    expect(sitemapBody).not.toContain("/_sites");
    expect(sitemapBody).not.toContain("/dashboard");
    expect(sitemapBody).not.toContain("/operator");
  });

  test("pricing cards keep copy hierarchy across viewports", async ({
    page,
  }) => {
    await page.goto(marketingUrl("/pricing"), { waitUntil: "load" });

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ] as const) {
      await page.setViewportSize(viewport);
      await expect(page.getByText("Recommended")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Practice", exact: true })
      ).toBeVisible();
      await expect(
        page.getByText("Create and edit up to 2 custom clinic guides")
      ).toBeVisible();
      await expect(
        page.getByText("Up to 2 custom clinic guides", { exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByText("Create and edit your own aftercare guides")
      ).toHaveCount(0);
      await expect(page.getByText("Everything in Essential")).toBeVisible();
      await expect(
        page.getByText("Up to 30 custom clinic guides")
      ).toBeVisible();
      await expect(
        page.getByText("Adapt River Aftercare templates to suit your clinic")
      ).toBeVisible();
      await expect(
        page
          .getByRole("article", { name: "Practice", exact: true })
          .getByText("Assisted setup", { exact: true })
      ).toBeVisible();
      await expect(
        page
          .getByRole("article", { name: "Essential", exact: true })
          .getByText("Assisted setup", { exact: true })
      ).toHaveCount(0);
      await expect(
        page
          .locator('[data-plan-card="practice"]')
          .getByText("Priority support")
      ).toBeVisible();
      await expect(
        page.locator('[data-plan-card="group"]').getByText("Priority support")
      ).toBeVisible();
      await expect(
        page
          .locator('[data-plan-card="essential"]')
          .getByText("Standard support")
      ).toHaveCount(0);
      await expect(page.getByText("Up to 2 clinic team members")).toBeVisible();
      await expect(page.getByText("Up to 5 clinic team members")).toBeVisible();
      await expect(
        page.getByText("Add clinic-specific instructions")
      ).toHaveCount(0);
      await expect(
        page.getByText("Need a larger guide library? Talk to us.")
      ).toHaveCount(0);
      const footnote = page.locator("#pricing-typography-note");
      await expect(footnote).toBeVisible();
      const footnoteStyle = await footnote.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
        };
      });
      expect(footnoteStyle.fontSize).toBe("16px");
      expect(Number.parseInt(footnoteStyle.fontWeight, 10)).toBe(400);
      await expectNoHorizontalOverflow(page);
    }
  });

  test("plan comparison stays collapsed and expands below the pricing cards", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(marketingUrl("/pricing"), { waitUntil: "load" });
    const control = page.getByRole("button", {
      name: "Compare all plan features",
    });
    const panel = page.locator("#plan-comparison-panel");
    const essentialCard = page.locator('[data-plan-card="essential"]');
    const practiceCard = page.locator('[data-plan-card="practice"]');

    await expect(control).toBeVisible();
    await expect(control).toHaveAttribute("aria-expanded", "false");
    await expect(control).toHaveAttribute(
      "aria-controls",
      "plan-comparison-panel"
    );
    await expect(panel).toBeHidden();
    await expect(page.getByText("Permanent guide URLs")).toHaveCount(0);
    await expect(
      essentialCard.getByText("QR sharing, PDF and durable patient guide URLs")
    ).toBeVisible();
    await expect(essentialCard.getByText("Print / Save PDF")).toHaveCount(0);
    await expect(essentialCard.getByText("QR-ready sharing")).toHaveCount(0);

    const essentialHeightClosed = await essentialCard.evaluate(
      (element) => element.getBoundingClientRect().height
    );
    const practiceHeightClosed = await practiceCard.evaluate(
      (element) => element.getBoundingClientRect().height
    );
    const ctaOffset = async (
      card: import("@playwright/test").Locator
    ): Promise<number> =>
      card.evaluate((element) => {
        const cta = element.querySelector("a");
        if (!(cta instanceof HTMLElement)) {
          return Number.NaN;
        }
        return (
          cta.getBoundingClientRect().top - element.getBoundingClientRect().top
        );
      });
    const essentialCtaOffsetClosed = await ctaOffset(essentialCard);
    const practiceCtaOffsetClosed = await ctaOffset(practiceCard);

    await control.click();
    await expect(control).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/pricing-comparison-open-1440.png",
      fullPage: true,
    });
    await expect(panel.getByText("Custom clinic guides")).toBeVisible();
    await expect(
      panel.locator(
        '[data-comparison-row="custom-guides"] [data-plan="essential"]'
      )
    ).toContainText("Up to 2");
    await expect(
      panel.locator(
        '[data-comparison-row="custom-guides"] [data-plan="practice"]'
      )
    ).toContainText("Up to 30");
    await expect(
      panel.locator(
        '[data-comparison-row="clinic-team-members"] [data-plan="essential"]'
      )
    ).toContainText("Up to 2");
    await expect(
      panel.locator(
        '[data-comparison-row="clinic-team-members"] [data-plan="practice"]'
      )
    ).toContainText("Up to 5");
    await expect(
      panel.locator(
        '[data-comparison-row="adapt-templates"] [data-plan="essential"]'
      )
    ).toContainText("Not included");
    await expect(
      panel.locator(
        '[data-comparison-row="adapt-templates"] [data-plan="practice"]'
      )
    ).toContainText("Included");
    await expect(panel.getByText("Durable patient guide URLs")).toBeVisible();
    await expect(panel.getByText("QR sharing")).toBeVisible();
    await expect(panel.getByText("Print / Save PDF")).toBeVisible();
    await expect(
      panel.getByText("Clinic contact and emergency information")
    ).toBeVisible();
    await expect(
      panel.getByText("Light / Dark / System patient presentation")
    ).toBeVisible();
    const supportRow = panel.locator('[data-comparison-row="support"]');
    await expect(supportRow.getByRole("rowheader")).toHaveText("Support");
    await expect(supportRow.locator('[data-plan="essential"]')).toContainText(
      "Standard support"
    );
    await expect(supportRow.locator('[data-plan="practice"]')).toContainText(
      "Priority support"
    );
    await expect(supportRow.locator('[data-plan="group"]')).toContainText(
      "Priority support"
    );
    await expect(supportRow.locator("svg")).toHaveCount(0);
    await expect(
      panel.locator('[data-comparison-row="priority-support"]')
    ).toHaveCount(0);
    await expect(panel.getByText("central permissions")).toHaveCount(0);
    await expect(panel.getByText("master guide governance")).toHaveCount(0);

    const essentialHeightOpen = await essentialCard.evaluate(
      (element) => element.getBoundingClientRect().height
    );
    const practiceHeightOpen = await practiceCard.evaluate(
      (element) => element.getBoundingClientRect().height
    );
    expect(essentialHeightOpen).toBe(essentialHeightClosed);
    expect(practiceHeightOpen).toBe(practiceHeightClosed);
    const essentialCtaOffsetOpen = await ctaOffset(essentialCard);
    const practiceCtaOffsetOpen = await ctaOffset(practiceCard);
    expect(essentialCtaOffsetOpen).toBe(essentialCtaOffsetClosed);
    expect(practiceCtaOffsetOpen).toBe(practiceCtaOffsetClosed);

    await control.press("Enter");
    await expect(control).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ] as const) {
      await page.setViewportSize(viewport);
      await control.click();
      await expect(panel).toBeVisible();
      const controlBox = await control.boundingBox();
      expect(controlBox, "comparison control should be visible").not.toBeNull();
      expect(controlBox!.height).toBeGreaterThanOrEqual(44);
      if (viewport.width >= 1024) {
        await expect(panel.locator("thead")).toBeVisible();
        await expect(
          panel.locator('[data-plan-label="Essential"]').first()
        ).toBeHidden();
      } else {
        await expect(
          panel.locator('[data-plan-label="Essential"]').first()
        ).toBeVisible();
        await expect(
          panel.locator('[data-plan-label="Practice"]').first()
        ).toBeVisible();
        await expect(
          panel.locator('[data-plan-label="Group"]').first()
        ).toBeVisible();
      }
      await expectNoHorizontalOverflow(page);
      await expect(
        panel.locator('[data-comparison-row="support"] [data-plan="essential"]')
      ).toContainText("Standard support");
      await expect(
        panel.locator('[data-comparison-row="support"] [data-plan="practice"]')
      ).toContainText("Priority support");
      await expect(
        panel.locator('[data-comparison-row="support"] [data-plan="group"]')
      ).toContainText("Priority support");
      await page.screenshot({
        path: `test-results/artifacts/pricing-comparison-open-${viewport.width}.png`,
        fullPage: true,
      });
      await control.click();
      await expect(panel).toBeHidden();
    }
  });

  test("desktop nav includes pricing, contact, staff, and theme", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    const headerNav = page.getByRole("navigation", { name: "Marketing" });
    const footerNav = page.getByRole("navigation", { name: "Footer" });

    await expect(headerNav.getByRole("link", { name: "About" })).toBeVisible();
    await expect(
      headerNav.getByRole("link", { name: "Pricing" })
    ).toBeVisible();
    await expect(
      headerNav.getByRole("link", { name: "Contact" })
    ).toBeVisible();
    await expect(
      headerNav.getByRole("button", { name: "For clinics" })
    ).toBeVisible();
    await expect(
      headerNav.getByRole("link", { name: "How it works" })
    ).toHaveCount(0);
    await expect(
      headerNav.getByRole("link", { name: "Clinic preview" })
    ).toHaveCount(0);
    await expect(
      headerNav.getByRole("link", { name: "Sign in", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Change colour theme/ })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /site menu/i })).toBeHidden();

    await expect(footerNav.getByRole("link", { name: "About" })).toBeVisible();
    await expect(
      footerNav.getByRole("link", { name: "Pricing" })
    ).toBeVisible();
    await expect(
      footerNav.getByRole("link", { name: "Contact" })
    ).toBeVisible();
    await expect(footerNav.getByRole("link", { name: "Dental" })).toBeVisible();
    await expect(
      footerNav.getByRole("link", { name: "Physiotherapy" })
    ).toBeVisible();
    await expect(
      footerNav.getByRole("link", { name: "Privacy" })
    ).toBeVisible();
    await expect(footerNav.getByRole("link", { name: "Terms" })).toBeVisible();
    await expect(
      footerNav.getByRole("link", { name: "Sign in", exact: true })
    ).toBeVisible();
    await expect(
      footerNav.getByRole("link", { name: "How it works" })
    ).toHaveCount(0);
    await expect(
      footerNav.getByRole("link", { name: "Clinic preview" })
    ).toHaveCount(0);
    await expect(
      footerNav.getByRole("link", { name: "Early access" })
    ).toHaveCount(0);
  });

  test("mobile menu exposes real pricing and contact routes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    const headerNav = page.getByRole("navigation", { name: "Marketing" });

    await expect(
      headerNav.getByRole("link", { name: "River Aftercare" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("banner").getByRole("link", { name: "River Aftercare" })
    ).toBeVisible();
    await expect(
      headerNav.getByRole("link", { name: "Sign in", exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Change colour theme/ })
    ).toHaveCount(0);
    await expect(headerNav.getByRole("link", { name: "Pricing" })).toHaveCount(
      0
    );

    const menu = page.getByRole("button", { name: "Site menu" });
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(headerNav.getByRole("link", { name: "Dental" })).toBeVisible();
    await expect(
      headerNav.getByRole("link", { name: "Physiotherapy" })
    ).toBeVisible();
    await expect(headerNav.getByRole("link", { name: "About" })).toBeVisible();
    await expect(
      headerNav.getByRole("link", { name: "Pricing" })
    ).toBeVisible();
    await expect(
      headerNav.getByRole("link", { name: "Contact" })
    ).toBeVisible();
    await expect(
      headerNav.getByRole("link", { name: "Sign in", exact: true })
    ).toBeVisible();
    await expect(
      headerNav.getByRole("radiogroup", { name: "Theme" })
    ).toBeVisible();
    await expect(
      headerNav.getByRole("link", { name: "How it works" })
    ).toHaveCount(0);
    await expect(
      headerNav.getByRole("link", { name: "Clinic preview" })
    ).toHaveCount(0);

    await headerNav.getByRole("link", { name: "Pricing" }).click();
    await expect(page).toHaveURL(marketingUrl("/pricing"));
    await expectOneH1(page, "Simple plans for branded patient aftercare.");

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(marketingUrl("/contact"), { waitUntil: "load" });
    const contactMenu = page.getByRole("button", { name: "Site menu" });
    await contactMenu.click();
    await expect(
      page.getByRole("link", { name: "Contact", exact: true }).first()
    ).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await expect(contactMenu).toHaveAttribute("aria-expanded", "false");
    await expectNoHorizontalOverflow(page);
  });

  test("mobile menu does not pre-select About on pointer open", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");

    const menu = page.getByRole("button", { name: "Site menu" });
    const headerNav = page.getByRole("navigation", { name: "Marketing" });
    const firstLink = headerNav.getByRole("link", { name: "Overview" });
    const about = headerNav.getByRole("link", { name: "About" });

    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(firstLink).toBeVisible();
    await expect(about).toBeVisible();
    await expect(firstLink).not.toBeFocused();
    await expect(about).not.toBeFocused();
    const pointerOutline = await firstLink.evaluate(
      (element) => getComputedStyle(element).outlineStyle
    );
    expect(pointerOutline).toBe("none");
    await page.screenshot({
      path: "test-results/artifacts/marketing-mobile-nav-pointer-390-light.png",
    });

    await page.keyboard.press("Tab");
    await expect(firstLink).toBeFocused();
    const keyboardOutline = await firstLink.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).outlineWidth)
    );
    expect(keyboardOutline).toBeGreaterThanOrEqual(2);

    await page.keyboard.press("Escape");
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await menu.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(firstLink).toBeFocused();
    const enterOutline = await firstLink.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).outlineWidth)
    );
    expect(enterOutline).toBeGreaterThanOrEqual(2);
    await page.screenshot({
      path: "test-results/artifacts/marketing-mobile-nav-keyboard-390-light.png",
    });
  });

  test("homepage conversion CTAs resolve", async ({ page }) => {
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await expect(
      page.getByRole("link", { name: "View the dental demo" }).first()
    ).toHaveAttribute("href", tenantUrl(DEMO_TENANT_SLUG, "/"));
    await expect(
      page.getByRole("link", { name: "See how it works" })
    ).toHaveAttribute("href", "#how-it-works");
    await expect(
      page.getByRole("link", { name: "Request a demo" }).first()
    ).toHaveAttribute("href", "/contact");

    await page.getByRole("link", { name: "Request a demo" }).first().click();
    await expect(page).toHaveURL(marketingUrl("/contact"));
    await page.getByRole("link", { name: "Pricing" }).first().click();
    await expect(page).toHaveURL(marketingUrl("/pricing"));
    await page.getByRole("link", { name: "Request a demo" }).first().click();
    await expect(page).toHaveURL(marketingUrl("/contact"));
  });

  test("contact form validates inline and delivers through the server mailer", async ({
    page,
  }) => {
    await page.goto(marketingUrl("/contact"), { waitUntil: "load" });
    await page.getByRole("button", { name: "Send enquiry" }).click();
    await expect(page.getByText("Enter your full name.")).toBeVisible();
    await expect(page.getByText("Enter your email.")).toBeVisible();
    await expect(
      page.getByText("Enter your practice or clinic name.")
    ).toBeVisible();
    await expect(page.getByText("Choose the number of locations.")).toHaveCount(
      0
    );
    await expect(page.getByText("Work email")).toHaveCount(0);
    await expect(
      page.getByText("Thanks — your message has been sent.")
    ).toHaveCount(0);
    await page.locator("form").screenshot({
      path: "test-results/artifacts/contact-form-validation-1440.png",
    });

    await page.getByLabel("Full name").fill("Alex Rivera");
    await page
      .getByLabel("Email", { exact: true })
      .fill("alex@clinic.example.test");
    await page.getByLabel("Practice / clinic name").fill("Harbour Dental");
    await page.getByLabel("Phone (optional)").fill("0400 000 000");
    await page
      .getByLabel("Anything you'd like us to know? (optional)")
      .fill("Two rooms, one hygiene chair.");
    await page.getByRole("button", { name: "Send enquiry" }).click();

    await expect(page.getByRole("status")).toContainText(
      "Thanks — your message has been sent."
    );
    await expect(
      page.getByText("We'll reply to the email address you provided.")
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Homepage" })).toHaveAttribute(
      "href",
      "/"
    );
    await expect(
      page.getByRole("link", { name: "Dental demo" })
    ).toHaveAttribute("href", tenantUrl(DEMO_TENANT_SLUG, "/"));
    await expect(
      page.getByRole("link", { name: "Pricing" }).last()
    ).toHaveAttribute("href", "/pricing");
    await page.getByRole("status").screenshot({
      path: "test-results/artifacts/contact-form-success-1440.png",
    });
  });

  test("tenant and staff hosts do not serve platform sales pages", async ({
    page,
  }) => {
    for (const pathname of ["/pricing", "/contact"] as const) {
      const tenant = await page.goto(tenantUrl(DEMO_TENANT_SLUG, pathname), {
        waitUntil: "domcontentloaded",
      });
      expect(tenant?.status(), `tenant ${pathname}`).toBe(404);
      await expectGenericNotFound(page);
      await expect(page.getByText("A$79")).toHaveCount(0);
      await expect(page.getByText("Request a demo")).toHaveCount(0);

      const staff = await page.goto(staffUrl(pathname), {
        waitUntil: "domcontentloaded",
      });
      expect(staff?.status(), `staff ${pathname}`).toBe(404);
      await expect(
        page.getByRole("heading", { name: "Internal staff workspace" })
      ).toHaveCount(0);
    }

    const appHome = await page.goto(staffUrl("/"), { waitUntil: "load" });
    expect(appHome?.status()).toBe(200);
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: "Sign in", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Clinic portal" })
    ).toHaveCount(0);
  });

  test("metadata titles match the public routes", async ({ page }) => {
    await page.goto(marketingUrl("/"), { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(
      "Patient Aftercare Software for Clinics | River Aftercare"
    );

    await page.goto(marketingUrl("/pricing"), {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveTitle(PRICING_METADATA.title);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      PRICING_METADATA.description
    );

    await page.goto(marketingUrl("/contact"), {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveTitle("Book a Demo | River Aftercare");
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`pricing and contact have no serious axe violations in ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({
        colorScheme,
        reducedMotion: "reduce",
      });
      for (const pathname of [
        "/",
        "/pricing",
        "/contact",
        "/about",
        "/privacy",
        "/terms",
      ] as const) {
        await page.goto(marketingUrl(pathname), { waitUntil: "load" });
        await showMarketingScheme(page, colorScheme);
        await page.evaluate(() => {
          document.documentElement.setAttribute("data-mk-motion", "reduce");
        });
        await expect(page.locator("h1")).toHaveCount(1);
        await expectNoSeriousAxeViolations(page, {
          exclude: ["[data-mk-pending]", "[data-mk-pending] *"],
        });
      }

      await page.setViewportSize({ width: 390, height: 844 });
      for (const pathname of [
        "/pricing",
        "/contact",
        "/about",
        "/privacy",
        "/terms",
      ] as const) {
        await page.goto(marketingUrl(pathname), { waitUntil: "load" });
        await showMarketingScheme(page, colorScheme);
        await page.evaluate(() => {
          document.documentElement.setAttribute("data-mk-motion", "reduce");
        });
        await expectNoSeriousAxeViolations(page, {
          exclude: ["[data-mk-pending]", "[data-mk-pending] *"],
        });
      }
    });
  }

  test("captures conversion page artifacts", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });

    for (const [pathname, name] of [
      ["/pricing", "pricing"],
      ["/contact", "contact"],
    ] as const) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(marketingUrl(pathname), { waitUntil: "load" });
      await showMarketingScheme(page, "light");
      await page.screenshot({
        path: `test-results/artifacts/${name}-1440-light.png`,
        fullPage: true,
      });
      await page.locator("[data-mk-page-hero]").screenshot({
        path: `test-results/artifacts/${name}-hero-1440-light.png`,
      });
      await showMarketingScheme(page, "dark");
      await page.screenshot({
        path: `test-results/artifacts/${name}-1440-dark.png`,
        fullPage: true,
      });

      await page.setViewportSize({ width: 390, height: 844 });
      await showMarketingScheme(page, "light");
      await page.screenshot({
        path: `test-results/artifacts/${name}-390-light.png`,
        fullPage: true,
      });
      await showMarketingScheme(page, "dark");
      await page.screenshot({
        path: `test-results/artifacts/${name}-390-dark.png`,
        fullPage: true,
      });
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/pricing"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await page.locator('[aria-labelledby="plans-heading"]').screenshot({
      path: "test-results/artifacts/pricing-plans-1440-light.png",
    });
    await page.locator('[aria-labelledby="onboarding-heading"]').screenshot({
      path: "test-results/artifacts/pricing-onboarding-1440-light.png",
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await page.locator("header").screenshot({
      path: "test-results/artifacts/marketing-nav-1440.png",
    });
    await page.locator("footer").screenshot({
      path: "test-results/artifacts/marketing-footer-1440.png",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("header").screenshot({
      path: "test-results/artifacts/marketing-nav-390.png",
    });
    await page.locator("footer").screenshot({
      path: "test-results/artifacts/marketing-footer-390.png",
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(marketingUrl("/pricing"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await page.locator("[data-mk-page-hero]").screenshot({
      path: "test-results/artifacts/pricing-hero-1280-light.png",
    });
    await page.goto(marketingUrl("/contact"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await page.locator("[data-mk-page-hero]").screenshot({
      path: "test-results/artifacts/contact-hero-1280-light.png",
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/contact"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    const submit = page.getByRole("button", { name: "Send enquiry" });
    await submit.scrollIntoViewIfNeeded();
    await submit.screenshot({
      path: "test-results/artifacts/contact-primary-default-1440.png",
    });
    await submit.hover();
    await submit.screenshot({
      path: "test-results/artifacts/contact-primary-hover-1440.png",
    });
    await submit.focus();
    await submit.screenshot({
      path: "test-results/artifacts/contact-primary-focus-1440.png",
    });
  });

  test("pricing and contact stay server-first without Tailwind", async ({
    page,
  }, testInfo) => {
    const home = await measurePageAssets(page, marketingUrl("/"));
    const pricingPage = await page.context().newPage();
    const pricing = await measurePageAssets(
      pricingPage,
      marketingUrl("/pricing")
    );
    await pricingPage.close();
    const contactPage = await page.context().newPage();
    const contact = await measurePageAssets(
      contactPage,
      marketingUrl("/contact")
    );
    await contactPage.close();
    expectNoTailwind(home.css);
    expectNoTailwind(pricing.css);
    expectNoTailwind(contact.css);
    expect(home.css.length).toBeGreaterThan(0);
    expect(pricing.css.length).toBeGreaterThan(0);
    expect(contact.css.length).toBeGreaterThan(0);

    const summarise = (
      measured: Awaited<ReturnType<typeof measurePageAssets>>
    ) => ({
      cssRaw: measured.css.reduce((sum, asset) => sum + asset.raw, 0),
      cssGzip: measured.css.reduce((sum, asset) => sum + asset.gzip, 0),
      cssBrotli: measured.css.reduce((sum, asset) => sum + asset.brotli, 0),
      jsRaw: measured.js.reduce((sum, asset) => sum + asset.raw, 0),
      jsGzip: measured.js.reduce((sum, asset) => sum + asset.gzip, 0),
      jsBrotli: measured.js.reduce((sum, asset) => sum + asset.brotli, 0),
      cssUrls: measured.css.map((asset) => ({
        url: asset.url,
        raw: asset.raw,
        gzip: asset.gzip,
        brotli: asset.brotli,
      })),
      jsUrls: measured.js.map((asset) => ({
        url: asset.url,
        raw: asset.raw,
        gzip: asset.gzip,
        brotli: asset.brotli,
      })),
    });

    const payload = {
      home: summarise(home),
      pricing: summarise(pricing),
      contact: summarise(contact),
    };
    mkdirSync("test-results/artifacts", { recursive: true });
    writeFileSync(
      "test-results/artifacts/marketing-conversion-performance.json",
      JSON.stringify(payload, null, 2)
    );
    testInfo.attach("marketing-conversion-performance.json", {
      contentType: "application/json",
      body: JSON.stringify(payload, null, 2),
    });
  });

  test("mobile menu rows are full-width and include theme", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    const menu = page.getByRole("button", { name: "Site menu" });
    await menu.click();

    const pricing = page
      .getByRole("navigation", { name: "Marketing" })
      .getByRole("link", { name: "Pricing" });
    const box = await pricing.boundingBox();
    expect(box, "Pricing row should be visible").not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(280);

    await pricing.hover();
    const hoverBg = await pricing.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    );
    expect(hoverBg).not.toBe("rgba(0, 0, 0, 0)");

    const firstClinicLink = page
      .getByRole("navigation", { name: "Marketing" })
      .getByRole("link", { name: "Overview" });
    await page.keyboard.press("Tab");
    await expect(firstClinicLink).toBeFocused();
    const outline = await firstClinicLink.evaluate(
      (element) => getComputedStyle(element).outlineStyle
    );
    expect(outline).not.toBe("none");

    const theme = page.getByRole("radiogroup", { name: "Theme" });
    await expect(theme).toBeVisible();
    await expect(page.getByRole("radio", { name: "Light" })).toBeVisible();
    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-mode",
      "dark"
    );
    await page.screenshot({
      path: "test-results/artifacts/marketing-mobile-menu-open-390.png",
    });
    await page.keyboard.press("Escape");
    await page.screenshot({
      path: "test-results/artifacts/marketing-mobile-nav-closed-390.png",
    });
  });

  test("onboarding numbers align to the first line of wrapping copy", async ({
    page,
  }) => {
    for (const width of [1440, 1280, 390, 360] as const) {
      await page.setViewportSize({
        width,
        height: width >= 1280 ? 900 : 844,
      });
      await page.goto(marketingUrl("/pricing"), { waitUntil: "load" });
      const item = page
        .locator("ol")
        .filter({
          hasText:
            "Choose an available River Aftercare guide or provide clinic-approved aftercare content.",
        })
        .locator("li")
        .first();
      const alignment = await item.evaluate((element) => {
        const number = element.querySelector("span");
        const text = element.querySelector("p");
        if (
          !(number instanceof HTMLElement) ||
          !(text instanceof HTMLElement)
        ) {
          return null;
        }
        const range = document.createRange();
        range.setStart(text, 0);
        range.setEnd(text, 1);
        const firstLine = range.getClientRects()[0];
        const numberBox = number.getBoundingClientRect();
        if (!firstLine) {
          return null;
        }
        return {
          numberCenter: numberBox.top + numberBox.height / 2,
          firstLineCenter: firstLine.top + firstLine.height / 2,
          alignItems: getComputedStyle(element).alignItems,
        };
      });
      expect(alignment?.alignItems).toBe("start");
      expect(
        Math.abs(
          (alignment?.numberCenter ?? 0) - (alignment?.firstLineCenter ?? 0)
        )
      ).toBeLessThanOrEqual(6);
      if (width === 1440) {
        await item.screenshot({
          path: "test-results/artifacts/onboarding-numbers-1440.png",
        });
      }
      if (width === 390) {
        await item.screenshot({
          path: "test-results/artifacts/onboarding-numbers-390.png",
        });
      }
    }
  });
});
