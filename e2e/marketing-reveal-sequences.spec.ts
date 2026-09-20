import { expect, test, type Locator, type Page } from "@playwright/test";

import { marketingUrl } from "./helpers/origins";

async function expectRevealAncestor(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect
    .poll(async () =>
      locator.evaluate((element) => Boolean(element.closest(".mkReveal")))
    )
    .toBe(true);
}

async function openWithReducedMotion(page: Page, pathname: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(marketingUrl(pathname), { waitUntil: "load" });
}

test.describe("marketing reveal sequence consistency", () => {
  test("homepage Explore all clinic types is the workflow concluding reveal", async ({
    page,
  }) => {
    await openWithReducedMotion(page, "/");
    const link = page.getByRole("link", { name: "Explore all clinic types →" });
    await expect(link).toHaveAttribute("href", "/clinics");
    await expectRevealAncestor(link);
  });

  test("pricing onboarding note is the final onboarding reveal item", async ({
    page,
  }) => {
    await openWithReducedMotion(page, "/pricing");
    const note = page.getByText(
      "Where an appropriate River Aftercare template exists, the clinic can use it as a starting point."
    );
    await expectRevealAncestor(note);
  });

  test("dental starting template module joins the guidance reveal sequence", async ({
    page,
  }) => {
    await openWithReducedMotion(page, "/dental");
    const template = page
      .locator('[class*="verticalStatus"]')
      .filter({ hasText: "Current starting template" });
    const explanation = page.locator('[class*="verticalNote"]').filter({
      hasText:
        "Riverside Dental Demo currently uses a Tooth Extraction sample template.",
    });
    await expectRevealAncestor(template);
    await expectRevealAncestor(explanation);
  });

  test("other vertical guidance modules use the same shared reveal wrapping", async ({
    page,
  }) => {
    await openWithReducedMotion(page, "/physiotherapy");
    await expectRevealAncestor(
      page.locator('[class*="verticalNote"]').filter({
        hasText:
          "Physiotherapy template availability is confirmed during onboarding.",
      })
    );

    await openWithReducedMotion(page, "/chiropractic");
    await expectRevealAncestor(
      page.locator('[class*="verticalBoundary"]').filter({
        hasText:
          "These are examples of guidance a practice may choose to publish, not a pre-built chiropractic template library.",
      })
    );

    await openWithReducedMotion(page, "/cosmetic-clinics");
    await expectRevealAncestor(
      page.locator('[class*="verticalNote"]').filter({
        hasText:
          "Template availability is confirmed during onboarding as the River Aftercare library expands.",
      })
    );
  });
});
