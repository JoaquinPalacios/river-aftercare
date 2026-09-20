import { expect, test, type Locator, type Page } from "@playwright/test";

import { marketingUrl } from "./helpers/origins";

async function expectRevealAncestor(locator: Locator) {
  await expect
    .poll(async () =>
      locator.evaluate((element) => Boolean(element.closest(".mkReveal")))
    )
    .toBe(true);
}

async function expectVisibleWithReduce(page: Page, locator: Locator) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-mk-motion", "reduce");
  });
  await expect(locator).toBeVisible();
  await expect
    .poll(async () =>
      locator.evaluate((element) => {
        const reveal = element.closest(".mkReveal");
        if (!(reveal instanceof HTMLElement)) {
          return false;
        }
        return getComputedStyle(reveal).opacity === "1";
      })
    )
    .toBe(true);
}

test.describe("marketing reveal sequence consistency", () => {
  test("homepage Explore all clinic types is the workflow concluding reveal", async ({
    page,
  }) => {
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    const link = page.getByRole("link", { name: "Explore all clinic types →" });
    await expect(link).toHaveAttribute("href", "/clinics");
    await expectRevealAncestor(link);
    await expectVisibleWithReduce(page, link);
  });

  test("pricing onboarding note is the final onboarding reveal item", async ({
    page,
  }) => {
    await page.goto(marketingUrl("/pricing"), { waitUntil: "load" });
    const note = page.getByText(
      "Where an appropriate River Aftercare template exists, the clinic can use it as a starting point."
    );
    await expectRevealAncestor(note);
    await expectVisibleWithReduce(page, note);
  });

  test("dental starting template module joins the guidance reveal sequence", async ({
    page,
  }) => {
    await page.goto(marketingUrl("/dental"), { waitUntil: "load" });
    const template = page.getByText("Current starting template");
    const explanation = page.getByText(
      "Riverside Dental Demo currently uses a Tooth Extraction sample template."
    );
    await expectRevealAncestor(template);
    await expectRevealAncestor(explanation);
    await expectVisibleWithReduce(page, template);
    await expectVisibleWithReduce(page, explanation);
  });

  test("other vertical guidance modules use the same shared reveal wrapping", async ({
    page,
  }) => {
    await page.goto(marketingUrl("/physiotherapy"), { waitUntil: "load" });
    await expectRevealAncestor(
      page.getByText(
        "Physiotherapy template availability is confirmed during onboarding."
      )
    );

    await page.goto(marketingUrl("/chiropractic"), { waitUntil: "load" });
    await expectRevealAncestor(
      page.getByText(
        "These are examples of guidance a practice may choose to publish, not a pre-built chiropractic template library."
      )
    );

    await page.goto(marketingUrl("/cosmetic-clinics"), { waitUntil: "load" });
    await expectRevealAncestor(
      page.getByText(
        "Template availability is confirmed during onboarding as the River Aftercare library expands."
      )
    );
  });
});
