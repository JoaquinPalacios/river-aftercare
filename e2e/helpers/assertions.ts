import { expect, type Page } from "@playwright/test";

import { PRODUCT_LOGO_SRC } from "../../lib/branding/product-assets";
import { PRODUCT_MARKETING_ORIGIN } from "../../lib/branding/product-name";
import {
  AFTERCARE_UNAVAILABLE_BODY,
  AFTERCARE_UNAVAILABLE_HEADING,
  AFTERCARE_UNAVAILABLE_HOME_LABEL,
} from "../../lib/aftercare/unavailable-copy";

export async function expectGenericNotFound(page: Page): Promise<void> {
  expect(page.url()).not.toContain("/_sites");
  await expect(
    page.getByRole("heading", { name: AFTERCARE_UNAVAILABLE_HEADING })
  ).toBeVisible();
  await expect(page.getByText(AFTERCARE_UNAVAILABLE_BODY)).toBeVisible();
  await expect(page.locator(`img[src="${PRODUCT_LOGO_SRC}"]`)).toBeVisible();
  await expect(
    page.getByRole("link", { name: AFTERCARE_UNAVAILABLE_HOME_LABEL })
  ).toHaveAttribute("href", PRODUCT_MARKETING_ORIGIN);
  await expect(page.getByRole("heading", { name: "Not found" })).toHaveCount(0);
  await expect(
    page.getByText("This aftercare page is not available.")
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Riverside Dental Demo", exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Harbor Family Dental", exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Staff sign in" })
  ).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  const body = ((await page.textContent("main")) ?? "").toLowerCase();
  expect(body).not.toContain("unpublished");
  expect(body).not.toContain("removed");
  expect(body).not.toContain("does not exist");
  expect(body).not.toContain("unknown tenant");
}

export async function expectPublicTenantUrl(
  page: Page,
  expected: string
): Promise<void> {
  await expect(page).toHaveURL(expected);
  expect(page.url()).not.toContain("/_sites");
  const html = await page.content();
  expect(html).not.toContain("/_sites/");
}

export async function expectNoLoginUi(page: Page): Promise<void> {
  const html = await page.content();
  expect(html.toLowerCase()).not.toContain("staff sign in");
  expect(html.toLowerCase()).not.toContain("staff sign-in");
  expect(page.locator('input[type="password"]')).toHaveCount(0);
  expect(page.getByRole("heading", { name: "Staff sign in" })).toHaveCount(0);
  expect(
    page.locator('form[action*="login"], form[action*="auth"]')
  ).toHaveCount(0);
}

export async function expectOneH1(page: Page, text: string): Promise<void> {
  const headings = page.locator("h1");
  await expect(headings).toHaveCount(1);
  await expect(headings).toHaveText(text);
}

export async function tabUntil(
  page: Page,
  match: (href: string | null, text: string) => boolean,
  limit = 20
): Promise<{ href: string | null; text: string }> {
  for (let index = 0; index < limit; index += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element) {
        return { href: null, text: "", tag: "", outline: "" };
      }

      const href =
        element instanceof HTMLAnchorElement
          ? element.getAttribute("href")
          : null;
      const styles = getComputedStyle(element);
      return {
        href,
        text: (element.innerText || element.textContent || "").trim(),
        tag: element.tagName.toLowerCase(),
        outline: `${styles.outlineStyle} ${styles.outlineWidth} ${styles.outlineColor}`,
      };
    });

    if (match(focused.href, focused.text)) {
      expect(focused.outline).not.toMatch(/^none 0px/);
      expect(focused.outline).not.toContain("outline: none");
      return focused;
    }
  }

  throw new Error("Focusable control was not reached by tabbing.");
}
