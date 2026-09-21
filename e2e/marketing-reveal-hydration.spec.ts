import { expect, test, type Page } from "@playwright/test";

import { marketingUrl } from "./helpers/origins";

const MARKETING_PATHS = ["/", "/clinics", "/pricing", "/about", "/dental"];

function collectHydrationErrors(page: Page): string[] {
  const hydration: string[] = [];
  const note = (text: string) => {
    if (
      /hydrat(e|ion) mismatch|didn't match the client properties|A tree hydrated/i.test(
        text
      )
    ) {
      hydration.push(text);
    }
  };
  page.on("console", (message) => note(message.text()));
  page.on("pageerror", (error) => note(String(error)));
  return hydration;
}

async function expectHeroRevealed(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const motion = document.documentElement.getAttribute("data-mk-motion");
        const reveals = [
          ...document.querySelectorAll<HTMLElement>(
            '[data-mk-chapter="hero"] .mkReveal, [data-mk-page-hero] .mkReveal'
          ),
        ];
        if (reveals.length === 0) {
          return false;
        }
        if (motion !== "enhance") {
          return reveals.every(
            (node) => getComputedStyle(node).opacity === "1"
          );
        }
        return reveals.every(
          (node) =>
            getComputedStyle(node).opacity === "1" &&
            !node.hasAttribute("data-mk-pending")
        );
      })
    )
    .toBe(true);
}

test.describe("marketing reveal hydration", () => {
  test("SSR HTML is readable and does not hide copy with inline opacity", async ({
    request,
  }) => {
    const response = await request.get(marketingUrl("/"));
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain("Aftercare that still feels like your clinic.");
    expect(html).toContain("data-mk-pending");
    expect(html).not.toMatch(
      /class="[^"]*mkReveal[^"]*"[^>]*style="[^"]*opacity:\s*0/
    );
    expect(html).not.toContain("translateY(14px)");
  });

  test("normal-motion pages hydrate without React mismatch and still reveal", async ({
    page,
  }) => {
    const hydration = collectHydrationErrors(page);

    for (const pathname of MARKETING_PATHS) {
      await page.goto(marketingUrl(pathname), { waitUntil: "load" });
      await expect(page.locator("h1").first()).toBeVisible();
      await expectHeroRevealed(page);
    }

    expect(hydration).toEqual([]);
  });

  test("reduced-motion pages stay visible without entrance translation", async ({
    page,
  }) => {
    const hydration = collectHydrationErrors(page);
    await page.emulateMedia({ reducedMotion: "reduce" });

    for (const pathname of ["/", "/pricing", "/dental"]) {
      await page.goto(marketingUrl(pathname), { waitUntil: "load" });
      await expect(page.locator("h1").first()).toBeVisible();
      await expect
        .poll(async () =>
          page.evaluate(() => {
            const reveals = [
              ...document.querySelectorAll<HTMLElement>(".mkReveal"),
            ];
            if (reveals.length === 0) {
              return false;
            }
            return reveals.every((node) => {
              const style = getComputedStyle(node);
              return (
                style.opacity === "1" &&
                (style.transform === "none" ||
                  style.transform === "matrix(1, 0, 0, 1, 0, 0)")
              );
            });
          })
        )
        .toBe(true);
    }

    expect(hydration).toEqual([]);
  });

  test("content remains available when JavaScript is disabled", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await expect(
      page.getByRole("heading", {
        name: "Aftercare that still feels like your clinic.",
      })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Explore all clinic types →" })
    ).toBeVisible();
    await context.close();
  });
});
