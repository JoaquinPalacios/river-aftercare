import { expect, test, type Page } from "@playwright/test";

import {
  signInAsLocalOperator,
  signInAsLocalStaff,
} from "./helpers/staff-auth";
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
    page.getByRole("status").getByText("Assisting", { exact: true })
  ).toBeVisible();
}

function tourDialog(page: Page) {
  return page.getByRole("dialog");
}

async function advance(
  page: Page,
  label: "Next" | "Back" | "Done" | "Skip tour" | "Close"
) {
  const dialog = tourDialog(page);
  if (label !== "Close") {
    await expect(dialog).toHaveAttribute("data-cms-tour-motion", "shown");
  }
  const button = dialog.getByRole("button", { name: label, exact: true });
  // One DOM click. Playwright's action retry will click again when the card
  // moves to the next step, which walks the rest of the tour in one call.
  await button.evaluate((node: HTMLButtonElement) => node.click());
}

async function expectStep(page: Page, title: string): Promise<void> {
  const dialog = tourDialog(page);
  await expect(
    dialog.getByRole("heading", { name: title, exact: true })
  ).toBeVisible();
  await expect(dialog).toHaveAttribute("data-cms-tour-motion", "shown");
}

async function completePageTour(page: Page, titles: readonly string[]) {
  await page.getByRole("button", { name: "Tour this page" }).click();
  for (const title of titles) {
    await expectStep(page, title);
    if (title !== titles.at(-1)) {
      await advance(page, "Next");
    }
  }
  await advance(page, "Done");
  await advance(page, "Close");
  await expect(
    page.getByRole("button", { name: "Tour this page" })
  ).toHaveCount(0);
}

test.describe("clinic CMS guided tour", () => {
  test.describe("desktop", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("keeps the workspace introduction and page tours on one page", async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openAssistedClinic(page);
      await page.getByRole("button", { name: "Start tour" }).click();

      const navigation = [
        "Overview",
        "Guides",
        "Practice",
        "Sites & Locations",
        "Patient site",
        "Help & feedback",
      ];
      for (const [index, title] of navigation.entries()) {
        await expectStep(page, title);
        await expect(page).toHaveURL(staffUrl("/dashboard"));
        if (index < navigation.length - 1) {
          await advance(page, "Next");
          await expect(page).toHaveURL(staffUrl("/dashboard"));
        }
      }

      await advance(page, "Back");
      await expectStep(page, "Patient site");
      await expect(page).toHaveURL(staffUrl("/dashboard"));
      await advance(page, "Next");
      await advance(page, "Done");
      await expect(tourDialog(page)).toContainText("You're set");
      await advance(page, "Close");
      await expect(page).toHaveURL(staffUrl("/dashboard"));
      await expect(
        page.getByRole("button", { name: "Start tour" })
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Replay workspace tour" })
      ).toHaveCount(0);

      await completePageTour(page, [
        "Guide summary",
        "Clinic setup",
        "View patient site",
      ]);
      await expect(page).toHaveURL(staffUrl("/dashboard"));

      await page.getByRole("link", { name: "Guides", exact: true }).click();
      await expect(page).toHaveURL(staffUrl("/guides"));
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Tour this page" })
      ).toBeVisible();

      await page.getByRole("button", { name: "Tour this page" }).click();
      await expectStep(page, "Guide library");
      await page.goto(staffUrl("/practice"));
      await expect(page).toHaveURL(staffUrl("/practice"));
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.goto(staffUrl("/guides"));
      await expect(
        page.getByRole("button", { name: "Tour this page" })
      ).toBeVisible();
      await completePageTour(page, [
        "Guide library",
        "Search",
        "Create guide",
        "Guide list",
      ]);

      await page.getByRole("link", { name: "Practice", exact: true }).click();
      await expect(page).toHaveURL(staffUrl("/practice"));
      await expect(
        page.getByRole("button", { name: "Tour this page" })
      ).toBeVisible();
      await page.getByRole("button", { name: "Tour this page" }).click();
      await expectStep(page, "Members");
      await advance(page, "Skip tour");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Tour this page" })
      ).toHaveCount(0);

      await page.getByRole("link", { name: "Sites & Locations" }).click();
      await expect(page).toHaveURL(staffUrl("/practice/sites"));
      await completePageTour(page, [
        "Sites and locations",
        "Capacity",
        "Site list",
      ]);

      await page.getByRole("link", { name: "Guides", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Tour this page" })
      ).toHaveCount(0);
      await page.getByRole("link", { name: "Practice", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Tour this page" })
      ).toHaveCount(0);

      await page.getByRole("link", { name: "Help & feedback" }).click();
      await expect(page).toHaveURL(/\/account\/help/);
      await expect(
        page.getByRole("button", { name: "Start tour" })
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Replay workspace tour" })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Show page tours again" })
      ).toBeVisible();
      await completePageTour(page, ["Guided tours", "Your message"]);
      await expect(
        page.getByRole("button", { name: "Replay workspace tour" })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Show page tours again" })
      ).toBeVisible();

      await page.getByRole("link", { name: "Overview", exact: true }).click();
      await expect(page).toHaveURL(staffUrl("/dashboard"));
      await expect(
        page.getByRole("button", { name: "Tour this page" })
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Start tour" })
      ).toHaveCount(0);

      await page.getByRole("link", { name: "Help & feedback" }).click();
      await page.getByRole("button", { name: "Show page tours again" }).click();

      await page.getByRole("link", { name: "Guides", exact: true }).click();
      await expect(page).toHaveURL(staffUrl("/guides"));
      await page.getByRole("button", { name: "Tour this page" }).click();
      await expectStep(page, "Guide library");
      await advance(page, "Skip tour");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Tour this page" })
      ).toHaveCount(0);

      await page.getByRole("link", { name: "Practice", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Tour this page" })
      ).toBeVisible();
      await page.getByRole("link", { name: "Overview", exact: true }).click();
      await expect(page).toHaveURL(staffUrl("/dashboard"));
      await expect(
        page.getByRole("button", { name: "Tour this page" })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Start tour" })
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Replay workspace tour" })
      ).toHaveCount(0);
    });
  });

  test.describe("mobile navigation", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("walks the workspace introduction inside the open menu", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openAssistedClinic(page);
      await page.getByRole("button", { name: "Start tour" }).click();

      const menu = page.getByRole("button", { name: "Clinic portal menu" });
      await expect(menu).toHaveAttribute("aria-expanded", "true");
      await expectStep(page, "Overview");
      await expect(page).toHaveURL(staffUrl("/dashboard"));

      await advance(page, "Next");
      await expectStep(page, "Guides");
      await expect(page).toHaveURL(staffUrl("/dashboard"));
      await expect(menu).toHaveAttribute("aria-expanded", "true");

      await advance(page, "Skip tour");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page).toHaveURL(staffUrl("/dashboard"));
    });
  });

  test("hides Practice from clinic staff", async ({ page }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await signInAsLocalStaff(page);
    await expect(
      page.getByRole("link", { name: "Practice", exact: true })
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Start tour" }).click();
    const seen: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      const dialog = tourDialog(page);
      await expect(dialog).toHaveAttribute("data-cms-tour-motion", "shown");
      seen.push(
        (await dialog.getByRole("heading").first().textContent())?.trim() ?? ""
      );
      await expect(page).toHaveURL(staffUrl("/dashboard"));
      const done = dialog.getByRole("button", { name: "Done", exact: true });
      if (await done.isVisible()) {
        await done.evaluate((node: HTMLButtonElement) => node.click());
        break;
      }
      await advance(page, "Next");
    }
    expect(seen).not.toContain("Practice");
    expect(seen[0]).toBe("Overview");
    expect(seen).toContain("Guides");
    expect(seen).toContain("Sites & Locations");
    expect(seen.at(-1)).toBe("Help & feedback");
    await expect(page).toHaveURL(staffUrl("/dashboard"));
  });
});
