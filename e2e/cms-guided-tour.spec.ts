import { expect, test, type Page } from "@playwright/test";

import { signInAsLocalOperator } from "./helpers/staff-auth";
import { staffUrl } from "./helpers/origins";

async function openAssistedClinic(page: Page): Promise<void> {
  await signInAsLocalOperator(page);
  await page
    .getByRole("link", { name: "River Aftercare Demo Clinic" })
    .first()
    .click();
  await page.getByRole("button", { name: "Manage clinic workspace" }).click();
  await expect(page).toHaveURL(staffUrl("/dashboard"));
  await expect(
    page.getByText("Assisting", { exact: true }).first()
  ).toBeVisible();
}

async function tourDialog(page: Page) {
  return page.getByRole("dialog");
}

async function advance(
  page: Page,
  label: "Next" | "Back" | "Done"
): Promise<void> {
  const dialog = await tourDialog(page);
  await dialog.getByRole("button", { name: label, exact: true }).click();
}

test.describe("clinic CMS guided tour", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("explains Patient site → Help while the next page is still loading", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openAssistedClinic(page);
    await page.getByRole("button", { name: "Start tour" }).click();

    const steps = [
      "Overview",
      "Guides",
      "Practice",
      "Sites & Locations",
      "Patient site",
    ];
    for (const title of steps) {
      const dialog = await tourDialog(page);
      await expect(
        dialog.getByRole("heading", { name: title, exact: true })
      ).toBeVisible();
      if (title !== "Patient site") {
        await expect(
          dialog.getByRole("button", { name: "Next", exact: true })
        ).toBeEnabled();
        await advance(page, "Next");
      }
    }

    await expect(page).toHaveURL(staffUrl("/practice/sites"));
    await expect(await tourDialog(page)).toContainText(
      "View patient site opens the published clinic site"
    );

    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const helpFlight =
        url.pathname === "/account/help" &&
        (request.headers().rsc === "1" || url.searchParams.has("_rsc"));
      if (helpFlight) {
        await new Promise((resolve) => setTimeout(resolve, 1800));
      }
      await route.continue();
    });

    await advance(page, "Next");

    const travel = page.locator("[data-cms-tour-motion='travel']");
    await expect(travel).toBeVisible();
    await expect(travel).toContainText("Opening Help & feedback");
    await expect(travel).toContainText(
      "The highlight returns when that page is ready."
    );
    await expect(page).toHaveURL(staffUrl("/practice/sites"));
    await expect(page.locator("[data-cms-tour-spot]")).toHaveCount(0);
    await expect(travel.getByRole("button", { name: "Next" })).toBeDisabled();
    await expect(travel.locator(".staffBtnSpinner")).toHaveCSS(
      "animation-name",
      "none"
    );

    await expect(page).toHaveURL(staffUrl("/account/help"));
    await expect(
      page.getByRole("heading", { name: "Help & feedback", level: 1 })
    ).toBeVisible();
    const help = await tourDialog(page);
    await expect(
      help.getByRole("heading", { name: "Help & feedback", exact: true })
    ).toBeVisible();
    await expect(help).toContainText(
      "Send a problem, a question, or a feature suggestion to River Aftercare."
    );
    await expect(help).toHaveAttribute("data-cms-tour-motion", "shown");
    await expect(page.locator("[data-cms-tour-spot]")).toHaveCount(1);

    await advance(page, "Back");
    await expect(
      (await tourDialog(page)).getByRole("heading", {
        name: "Patient site",
        exact: true,
      })
    ).toBeVisible();
    await expect(await tourDialog(page)).toContainText(
      "View patient site opens the published clinic site"
    );

    await advance(page, "Back");
    await expect(page).toHaveURL(staffUrl("/practice/sites"));
    await expect(await tourDialog(page)).toContainText(
      "A site is a public address for the clinic."
    );
    await expect(await tourDialog(page)).toHaveAttribute(
      "data-cms-tour-step",
      "sites"
    );
  });
});
