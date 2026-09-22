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

  test("dental demo status module joins the guidance reveal sequence", async ({
    page,
  }) => {
    await openWithReducedMotion(page, "/dental");
    const template = page.getByText("Current dental demo", {
      exact: true,
    });
    const explanation = page.locator('p[class*="verticalNote"]').filter({
      hasText:
        "Riverside Dental Demo uses a Tooth Extraction sample guide to show the current patient experience.",
    });
    await expectRevealAncestor(template);
    await expectRevealAncestor(explanation);
  });

  test("other vertical guidance modules use the same shared reveal wrapping", async ({
    page,
  }) => {
    await openWithReducedMotion(page, "/physiotherapy");
    await expectRevealAncestor(
      page.locator('p[class*="verticalNote"]').filter({
        hasText:
          "Physiotherapy template availability is confirmed during onboarding.",
      })
    );

    await openWithReducedMotion(page, "/chiropractic");
    await expectRevealAncestor(
      page.locator('p[class*="verticalBoundary"]').filter({
        hasText:
          "These are examples of guidance a practice may choose to publish.",
      })
    );
    await expectRevealAncestor(
      page.locator('p[class*="verticalNote"]').filter({
        hasText:
          "Chiropractic template availability is confirmed during onboarding.",
      })
    );

    await openWithReducedMotion(page, "/cosmetic-clinics");
    await expectRevealAncestor(
      page.locator('p[class*="verticalNote"]').filter({
        hasText:
          "Template availability is confirmed during onboarding as the River Aftercare library expands.",
      })
    );
  });

  test("dental live example proof card reveals with the copy group", async ({
    page,
  }) => {
    await page.goto(marketingUrl("/dental"), { waitUntil: "load" });
    const section = page.locator('[aria-labelledby="dental-demo"]');
    await section.scrollIntoViewIfNeeded();
    await expect
      .poll(async () =>
        section.evaluate((root) => {
          const group = root.querySelector("[data-mk-section]");
          const panel = root.querySelector('[class*="verticalProofPanel"]');
          const reveal = panel?.closest(".mkReveal");
          if (!group || !(reveal instanceof HTMLElement)) {
            return false;
          }

          return (
            group.contains(reveal) &&
            getComputedStyle(reveal).opacity === "1" &&
            !reveal.hasAttribute("data-mk-pending")
          );
        })
      )
      .toBe(true);
  });
});
