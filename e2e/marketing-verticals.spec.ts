import { expect, test } from "@playwright/test";

import { expectOneH1 } from "./helpers/assertions";
import { expectNoSeriousAxeViolations } from "./helpers/axe";
import { expectNoHorizontalOverflow } from "./helpers/layout";
import { marketingUrl, tenantUrl, DEMO_TENANT_SLUG } from "./helpers/origins";

const VERTICALS = [
  {
    path: "/dental",
    h1: "Make post-treatment instructions part of your dental experience.",
    title: "Dental Aftercare Software for Practices | River Aftercare",
    description:
      "Give patients clear, clinic-branded post-treatment instructions they can reopen after dental treatment by link or QR code, with no app or patient login.",
    ogTitle: "Aftercare that still feels like your dental practice",
    unique: "leave the chair",
    absent: ["Riverside Physio", "exercise-adherence tracker"],
  },
  {
    path: "/physiotherapy",
    h1: "Keep recovery guidance clear between appointments.",
    title: "Physiotherapy Patient Aftercare Software | River Aftercare",
    description:
      "Share branded recovery, home-care and written exercise guidance patients can reopen between physiotherapy appointments by link or QR code.",
    ogTitle: "Recovery guidance that still feels like your clinic",
    unique: "not for tracking whether a patient completes",
    absent: ["Riverside Dental Demo", "leave the chair"],
  },
  {
    path: "/chiropractic",
    h1: "Give patients clearer guidance between chiropractic visits.",
    title: "Chiropractic Patient Aftercare Software | River Aftercare",
    description:
      "Publish branded home-care and post-appointment guidance patients can reopen between chiropractic visits by link or QR code, with no app or login.",
    ogTitle: "Between-visit guidance that still feels like your practice",
    unique: "publishing technology",
    absent: ["spinal alignment", "Riverside Dental Demo"],
  },
  {
    path: "/cosmetic-clinics",
    h1: "Make post-treatment aftercare feel as considered as the treatment.",
    title: "Cosmetic Clinic Aftercare Software | River Aftercare",
    description:
      "Give clients clear, clinic-branded post-treatment aftercare they can reopen after cosmetic and aesthetic treatments by link or QR code.",
    ogTitle: "Post-treatment aftercare that stays under your clinic brand",
    unique: "does not provide live clinical monitoring",
    absent: ["injectables", "Riverside Dental Demo"],
  },
] as const;

test.describe("clinic vertical acquisition pages", () => {
  for (const vertical of VERTICALS) {
    test(`${vertical.path} is indexable with unique copy and WebPage JSON-LD`, async ({
      page,
    }) => {
      const response = await page.goto(marketingUrl(vertical.path), {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      expect(page.url()).toBe(marketingUrl(vertical.path));
      expect(page.url()).not.toContain("/_marketing");
      await expectOneH1(page, vertical.h1);
      await expect(page).toHaveTitle(vertical.title);
      expect(page.url()).not.toMatch(/River Aftercare — River Aftercare/);

      const robots =
        (await page.locator('meta[name="robots"]').getAttribute("content")) ??
        "";
      expect(robots).toMatch(/index/i);
      expect(robots).not.toMatch(/noindex/i);
      expect(robots).toMatch(/follow/i);

      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        new RegExp(`${vertical.path}/?$`)
      );
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        "content",
        vertical.description
      );
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
        "content",
        vertical.ogTitle
      );
      await expect(
        page.locator('meta[property="og:description"]')
      ).toHaveAttribute("content", /./);

      const jsonLd = await page
        .locator('script[type="application/ld+json"]')
        .first()
        .textContent();
      expect(jsonLd).toBeTruthy();
      const graph = JSON.parse(jsonLd!);
      const types = JSON.stringify(graph);
      expect(types).toContain("WebPage");
      expect(types).toContain("Organization");
      expect(types).toContain("WebSite");
      expect(types).toContain("SoftwareApplication");
      expect(types).toContain(`${vertical.path}#webpage`);
      expect(types).toContain("/#application");
      expect(types).not.toContain("FAQPage");
      expect(types).not.toContain("MedicalWebPage");
      expect(types).not.toContain("aggregateRating");
      expect(types).not.toContain('"Offer"');
      expect(types).not.toMatch(/River Aftercare — River Aftercare/);

      expect(await page.content()).toContain(vertical.unique);
      for (const phrase of vertical.absent) {
        await expect(page.getByText(phrase)).toHaveCount(0);
      }

      await expect(
        page
          .getByRole("navigation", { name: "Marketing" })
          .getByRole("button", {
            name: "For clinics",
          })
      ).toBeVisible();
      await expect(
        page.getByRole("contentinfo").getByRole("link", { name: "Dental" })
      ).toHaveAttribute("href", "/dental");
      await expect(
        page.getByRole("link", { name: "Request a demo" }).first()
      ).toHaveAttribute("href", "/contact");
      await expect(
        page.getByRole("link", { name: "Pricing" }).first()
      ).toHaveAttribute("href", "/pricing");
    });
  }

  test("vertical FAQ accordions are keyboard accessible and independent", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(marketingUrl("/dental"), { waitUntil: "load" });

    const firstQuestion = "Do patients need to download an app?";
    const secondQuestion = "Do patients need an account?";
    const firstAnswer =
      "No. River Aftercare patient pages open in the browser from a link or QR code.";
    const secondAnswer =
      "No. The current public guide experience does not require a patient login.";

    const first = page.locator("summary").filter({
      hasText: firstQuestion,
    });
    const second = page.locator("summary").filter({
      hasText: secondQuestion,
    });
    const firstDetails = page.locator("details").filter({ has: first });
    const secondDetails = page.locator("details").filter({ has: second });
    await first.scrollIntoViewIfNeeded();
    await expect(first).toBeVisible();
    await expect(page.locator("details")).toHaveCount(5);
    await expect(firstDetails).toHaveJSProperty("open", false);
    await expect(page.getByText(firstAnswer)).toBeHidden();

    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(firstDetails).toHaveJSProperty("open", true);
    await expect(page.getByText(firstAnswer)).toBeVisible();
    await expect(first).toBeFocused();

    await page.keyboard.press("Space");
    await expect(firstDetails).toHaveJSProperty("open", false);
    await expect(page.getByText(firstAnswer)).toBeHidden();
    await expect(first).toBeFocused();

    await page.keyboard.press("Enter");
    await second.focus();
    await expect(second).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(secondDetails).toHaveJSProperty("open", true);
    await expect(page.getByText(secondAnswer)).toBeVisible();
    await expect(firstDetails).toHaveJSProperty("open", true);
    await expect(page.getByText(firstAnswer)).toBeVisible();
    await expect(second).toBeFocused();

    await expectNoSeriousAxeViolations(page, {
      exclude: ["[data-mk-pending]", "[data-mk-pending] *"],
    });
  });

  const FAQ_COPY = [
    {
      path: "/dental",
      heading: "Questions dental practices ask",
      questions: [
        "Do patients need to download an app?",
        "Do patients need an account?",
        "Can our practice change the instructions?",
        "Does River Aftercare replace our practice-management system?",
        "What dental templates are available?",
      ],
      answer:
        "Riverside Dental Demo currently uses a Tooth Extraction sample template.",
    },
    {
      path: "/physiotherapy",
      heading: "Questions physiotherapy clinics ask",
      questions: [
        "Is River Aftercare a home exercise programme app?",
        "Do patients need another app?",
        "Can our clinic use its own recovery guidance?",
        "Does it store patient health records?",
        "Are physiotherapy templates already available?",
      ],
      answer:
        "Physiotherapy template availability is confirmed during onboarding. Where no suitable River Aftercare template exists, the clinic can publish its own approved guidance.",
    },
    {
      path: "/chiropractic",
      heading: "Questions chiropractic practices ask",
      questions: [
        "Do patients need an app?",
        "Can our practice publish its own instructions?",
        "Does River Aftercare provide chiropractic treatment advice?",
        "Does it replace our practice-management software?",
        "Is there already a chiropractic template library?",
      ],
      answer:
        "No pre-built chiropractic template library is currently being advertised.",
    },
    {
      path: "/cosmetic-clinics",
      heading: "Questions cosmetic and aesthetic clinics ask",
      questions: [
        "Do patients or clients need to install an app?",
        "Can our clinic use its own aftercare instructions?",
        "Does River Aftercare monitor patients after treatment?",
        "Does River Aftercare replace our clinic-management software?",
        "Are cosmetic treatment templates already available?",
      ],
      answer:
        "it does not provide live clinical monitoring or emergency triage",
    },
  ] as const;

  for (const vertical of FAQ_COPY) {
    test(`${vertical.path} renders five visible FAQ controls with answers in the HTML`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(marketingUrl(vertical.path), {
        waitUntil: "load",
      });
      await expect(
        page.getByRole("heading", { name: vertical.heading })
      ).toBeVisible();
      await expect(page.locator("details")).toHaveCount(5);

      for (const question of vertical.questions) {
        const control = page.locator("summary").filter({ hasText: question });
        await control.scrollIntoViewIfNeeded();
        await expect(control).toBeVisible();
        await expect(
          page.locator("details").filter({ has: control })
        ).toHaveJSProperty("open", false);
      }

      const html = await page.content();
      expect(html).toContain(vertical.answer);

      const firstControl = page.locator("summary").filter({
        hasText: vertical.questions[0],
      });
      const firstDetails = page
        .locator("details")
        .filter({ has: firstControl });
      await firstControl.click();
      await expect(firstDetails).toHaveJSProperty("open", true);
      await expectNoSeriousAxeViolations(page, {
        exclude: ["[data-mk-pending]", "[data-mk-pending] *"],
      });
    });
  }

  test("dental demo CTA uses the real Riverside tenant", async ({ page }) => {
    await page.goto(marketingUrl("/dental"), { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("link", { name: "View the dental demo" })
    ).toHaveAttribute("href", tenantUrl(DEMO_TENANT_SLUG, "/"));
    await expect(
      page.getByRole("link", { name: "Open Riverside Dental Demo" })
    ).toHaveAttribute("href", tenantUrl(DEMO_TENANT_SLUG, "/"));
  });

  test("homepage and footer discover the four clinic pages", async ({
    page,
  }) => {
    await page.goto(marketingUrl("/"), { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", {
        name: "One aftercare platform. Different clinic workflows.",
      })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Dental practices/ })
    ).toHaveAttribute("href", "/dental");
    await expect(
      page.getByRole("link", { name: /Physiotherapy clinics/ })
    ).toHaveAttribute("href", "/physiotherapy");
    await expect(
      page.getByRole("link", { name: /Chiropractic practices/ })
    ).toHaveAttribute("href", "/chiropractic");
    await expect(
      page.getByRole("link", { name: /Cosmetic & aesthetic clinics/ })
    ).toHaveAttribute("href", "/cosmetic-clinics");

    await page
      .getByRole("navigation", { name: "Marketing" })
      .getByRole("button", { name: "For clinics" })
      .click();
    await expect(
      page.getByRole("link", { name: "Dental" }).first()
    ).toBeVisible();
    await page.getByRole("link", { name: "Physiotherapy" }).first().click();
    await expect(page).toHaveURL(marketingUrl("/physiotherapy"));
    await expectOneH1(
      page,
      "Keep recovery guidance clear between appointments."
    );
  });

  test("desktop and mobile navigation expose clinic links", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/about"), { waitUntil: "load" });
    const header = page.getByRole("navigation", { name: "Marketing" });
    await header.getByRole("button", { name: "For clinics" }).click();
    await expect(header.getByRole("link", { name: "Dental" })).toBeVisible();
    await expect(
      header.getByRole("link", { name: "Cosmetic & aesthetic" })
    ).toHaveAttribute("href", "/cosmetic-clinics");
    await page.keyboard.press("Escape");
    await expect(header.getByRole("link", { name: "Dental" })).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(marketingUrl("/dental"), { waitUntil: "load" });
    await page.getByRole("button", { name: "Site menu" }).click();
    const mobileDental = header.getByRole("link", { name: "Dental" });
    await expect(mobileDental).toHaveAttribute("aria-current", "page");
    await header.getByRole("link", { name: "Chiropractic" }).click();
    await expect(page).toHaveURL(marketingUrl("/chiropractic"));
  });

  test("sitemap lists each clinic page once and tenants stay unpublished", async ({
    page,
  }) => {
    const sitemap = await page.goto(marketingUrl("/sitemap.xml"), {
      waitUntil: "domcontentloaded",
    });
    const body = (await sitemap?.text()) ?? "";
    for (const path of [
      "/dental",
      "/physiotherapy",
      "/chiropractic",
      "/cosmetic-clinics",
    ]) {
      expect(body.split(path).length - 1).toBe(1);
    }
    expect(body).not.toContain("/_marketing");
    expect(body).not.toContain("demodental");
    expect(body).not.toContain("/operator");
  });

  test("tenant hosts do not serve marketing clinic pages", async ({ page }) => {
    const response = await page.goto(tenantUrl(DEMO_TENANT_SLUG, "/dental"), {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(404);
  });

  test("dental page remains accessible", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(marketingUrl("/dental"), { waitUntil: "load" });
    await expectNoSeriousAxeViolations(page, {
      exclude: ["[data-mk-pending]", "[data-mk-pending] *"],
    });
  });

  test("closing CTA is conversion-focused and footer owns navigation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/dental"), { waitUntil: "load" });

    const cta = page.locator('[aria-labelledby="dental-cta"]');
    await expect(
      cta.getByRole("link", { name: "Request a demo" })
    ).toHaveAttribute("href", "/contact");
    await expect(
      cta.getByRole("link", { name: "View pricing" })
    ).toHaveAttribute("href", "/pricing");
    await expect(cta.getByRole("link", { name: "About" })).toHaveCount(0);
    await expect(cta.getByText("About River Aftercare")).toHaveCount(0);

    const footer = page.getByRole("contentinfo");
    await expect(footer.getByText("Account", { exact: true })).toHaveCount(0);
    await expect(footer.getByRole("heading", { name: "Account" })).toHaveCount(
      0
    );
    await expect(footer.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(footer.getByRole("link", { name: "Contact" })).toHaveAttribute(
      "href",
      "/contact"
    );
    await expect(footer.getByRole("link", { name: "Dental" })).toHaveAttribute(
      "href",
      "/dental"
    );
  });

  test("vertical pages keep a split hero, process rail, and no overflow", async ({
    page,
  }) => {
    const viewports = [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 390, height: 844 },
    ] as const;

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto(marketingUrl("/physiotherapy"), {
        waitUntil: "load",
      });
      await expect(page.locator("[data-mk-vertical-hero]")).toHaveCount(1);
      await expect(page.getByText("Clinic approved")).toBeVisible();
      await expect(page.locator("#workflow")).toBeVisible();
      await expectNoHorizontalOverflow(page);

      const metrics = await page
        .locator("[data-mk-vertical-hero]")
        .evaluate((hero) => {
          const grid = hero.querySelector("[data-mk-section]");
          const copy = grid?.children[0];
          const panel = hero.querySelector("aside");
          const pathway = hero.querySelector("ol");
          const lastStep = pathway?.querySelector("li:last-child");
          if (!copy || !panel || !pathway || !lastStep) {
            return null;
          }

          const copyBox = copy.getBoundingClientRect();
          const panelBox = panel.getBoundingClientRect();
          const pathwayBox = pathway.getBoundingClientRect();
          const lastStepBox = lastStep.getBoundingClientRect();

          return {
            copyHeight: copyBox.height,
            panelHeight: panelBox.height,
            unusedBelowPathway: panelBox.height - pathwayBox.height,
            unusedBelowLastStep: panelBox.bottom - lastStepBox.bottom,
          };
        });

      expect(metrics).not.toBeNull();
      expect(metrics!.unusedBelowPathway).toBeLessThan(80);
      expect(metrics!.unusedBelowLastStep).toBeGreaterThan(10);
      expect(metrics!.unusedBelowLastStep).toBeLessThan(48);
      if (viewport.width >= 1024) {
        expect(metrics!.panelHeight).toBeLessThan(metrics!.copyHeight);
      }
    }
  });

  test("captures vertical landing artifacts for design review", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
    const paths = [
      "/dental",
      "/physiotherapy",
      "/chiropractic",
      "/cosmetic-clinics",
    ] as const;
    const viewports = [
      { name: "1440", width: 1440, height: 900 },
      { name: "1728", width: 1728, height: 1117 },
      { name: "1024", width: 1024, height: 768 },
      { name: "390", width: 390, height: 844 },
    ] as const;

    for (const path of paths) {
      const slug = path.slice(1);
      const themeId = slug === "cosmetic-clinics" ? "cosmetic" : slug;
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(marketingUrl(path), { waitUntil: "load" });
      await page.screenshot({
        path: `test-results/artifacts/vertical-qa/${slug}-1440-full.png`,
        fullPage: true,
      });
      await page.locator("[data-mk-vertical-hero]").screenshot({
        path: `test-results/artifacts/vertical-qa/${slug}-1440-hero.png`,
      });
      await page.locator(`[aria-labelledby="${themeId}-problem"]`).screenshot({
        path: `test-results/artifacts/vertical-qa/${slug}-1440-problem.png`,
      });
      await page.locator("#workflow").screenshot({
        path: `test-results/artifacts/vertical-qa/${slug}-1440-workflow.png`,
      });
      await page.locator(`[aria-labelledby="${themeId}-faq"]`).screenshot({
        path: `test-results/artifacts/vertical-qa/${slug}-1440-faq.png`,
      });
      await page.locator(`[aria-labelledby="${themeId}-cta"]`).screenshot({
        path: `test-results/artifacts/vertical-qa/${slug}-1440-cta.png`,
      });
    }

    for (const viewport of viewports) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto(marketingUrl("/dental"), { waitUntil: "load" });
      await page.screenshot({
        path: `test-results/artifacts/vertical-qa/dental-${viewport.name}.png`,
        fullPage: true,
      });
      await expectNoHorizontalOverflow(page);
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await page.locator("header").screenshot({
      path: "test-results/artifacts/vertical-qa/shared-nav-1440.png",
    });
    await page.locator("footer").screenshot({
      path: "test-results/artifacts/vertical-qa/shared-footer-1440.png",
    });
  });
});
