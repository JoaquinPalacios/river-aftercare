import { expect, test } from "@playwright/test";

import {
  DEMO_TENANT_SLUG,
  HARBOR_TENANT_SLUG,
  marketingUrl,
  tenantUrl,
} from "./helpers/origins";

test.describe("compact theme control", () => {
  test("opens a System / Light / Dark menu from an icon on marketing", async ({
    page,
  }) => {
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    const trigger = page.getByRole("button", { name: /Change colour theme/ });
    await expect(trigger).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Marketing" }).getByRole("radio")
    ).toHaveCount(0);
    await expect(
      page.getByRole("menuitemradio", { name: "System" })
    ).toHaveCount(0);

    await trigger.click();
    await expect(
      page.getByRole("menuitemradio", { name: "System" })
    ).toBeVisible();
    await expect(
      page.getByRole("menuitemradio", { name: "Light" })
    ).toBeVisible();
    await expect(
      page.getByRole("menuitemradio", { name: "Dark" })
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/marketing-theme-menu.png",
    });

    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-mode",
      "dark"
    );
    await expect(page.getByRole("menuitemradio", { name: "Dark" })).toHaveCount(
      0
    );

    await page.reload({ waitUntil: "load" });
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-mode",
      "dark"
    );

    const triggerAfterReload = page.getByRole("button", {
      name: /Change colour theme/,
    });
    await triggerAfterReload.click();
    await expect(
      page.getByRole("menuitemradio", { name: "Dark" })
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitemradio", { name: "Dark" })).toHaveCount(
      0
    );
  });

  test("uses the same compact control on the demo tenant when enabled", async ({
    page,
  }) => {
    await page.goto(tenantUrl(DEMO_TENANT_SLUG, "/"), { waitUntil: "load" });
    const trigger = page.getByRole("button", { name: /Change colour theme/ });
    await expect(trigger).toBeVisible();
    await trigger.click();
    await page.getByRole("menuitemradio", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-mode",
      "light"
    );
  });

  test("does not render the tenant control when the clinic disables it", async ({
    page,
  }) => {
    await page.goto(tenantUrl(HARBOR_TENANT_SLUG, "/"), { waitUntil: "load" });
    await expect(
      page.getByRole("button", { name: /Change colour theme/ })
    ).toHaveCount(0);
  });
});
