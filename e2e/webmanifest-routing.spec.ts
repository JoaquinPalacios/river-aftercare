import { expect, test } from "@playwright/test";

import {
  PRODUCT_ANDROID_CHROME_192_SRC,
  PRODUCT_ANDROID_CHROME_512_SRC,
  PRODUCT_WEB_MANIFEST_SRC,
} from "@/lib/branding/product-assets";
import { PRODUCT_ICON_HREFS } from "@/lib/seo/icons";
import { hasRiverWebManifest, isRiverPackHref } from "./helpers/head-icons";
import {
  DEMO_TENANT_SLUG,
  marketingUrl,
  staffUrl,
  tenantUrl,
} from "./helpers/origins";

const MANIFEST_PATH = PRODUCT_WEB_MANIFEST_SRC;
const RIVER_PACK_PATHS = [...PRODUCT_ICON_HREFS];

function originFor(
  kind: "marketing" | "staff" | "tenant"
): (path: string) => string {
  if (kind === "marketing") {
    return marketingUrl;
  }
  if (kind === "staff") {
    return staffUrl;
  }
  return (path: string) => tenantUrl(DEMO_TENANT_SLUG, path);
}

function assertNoHostnameRewrite(headers: Record<string, string>): void {
  expect(headers["x-middleware-rewrite"] ?? "").not.toContain("/_marketing/");
  expect(headers["x-middleware-rewrite"] ?? "").not.toContain("/_sites/");
  expect(headers["x-nextjs-rewrite"] ?? "").not.toContain("/_marketing/");
  expect(headers["x-nextjs-rewrite"] ?? "").not.toContain("/_sites/");
  expect(headers["x-matched-path"] ?? "").not.toContain("/_marketing/");
  expect(headers["x-matched-path"] ?? "").not.toContain("/_sites/");
}

test.describe("webmanifest static asset routing", () => {
  for (const host of ["marketing", "staff", "tenant"] as const) {
    test(`${host} host serves the shared River web manifest`, async ({
      request,
    }) => {
      const url = originFor(host)(MANIFEST_PATH);
      const head = await request.fetch(url, { method: "HEAD" });
      expect(head.status(), `HEAD ${url}`).toBe(200);
      expect(head.headers()["content-type"] ?? "").toMatch(
        /application\/manifest\+json/
      );
      assertNoHostnameRewrite(head.headers());

      const response = await request.get(url);
      expect(response.status(), url).toBe(200);
      expect(response.headers()["content-type"] ?? "").toMatch(
        /application\/manifest\+json/
      );
      assertNoHostnameRewrite(response.headers());

      const manifest = (await response.json()) as {
        name: string;
        short_name: string;
        icons: { src: string }[];
      };
      expect(manifest.name).toBe("River Aftercare");
      expect(manifest.short_name).toBe("River Aftercare");
      expect(manifest.icons.map((icon) => icon.src)).toEqual([
        PRODUCT_ANDROID_CHROME_192_SRC,
        PRODUCT_ANDROID_CHROME_512_SRC,
      ]);

      for (const icon of manifest.icons) {
        const iconResponse = await request.get(originFor(host)(icon.src));
        expect(iconResponse.status(), icon.src).toBe(200);
      }
    });
  }

  test("River favicon pack and root favicon.ico contract stay unchanged", async ({
    request,
  }) => {
    for (const host of ["marketing", "staff", "tenant"] as const) {
      for (const path of RIVER_PACK_PATHS) {
        const response = await request.get(originFor(host)(path));
        expect(response.status(), `${host} ${path}`).toBe(200);
      }

      const rootIco = await request.get(originFor(host)("/favicon.ico"));
      expect(rootIco.status(), `${host} /favicon.ico`).toBe(404);
    }
  });

  test("tenant hostname routing still serves the demo patient guide", async ({
    page,
  }) => {
    const response = await page.goto(
      tenantUrl(DEMO_TENANT_SLUG, "/extraction"),
      {
        waitUntil: "load",
      }
    );
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Tooth Extraction" })
    ).toBeVisible();
    expect(page.url()).not.toContain("/_sites");
    expect(hasRiverWebManifest(await page.content())).toBe(true);
  });

  test("clinic branding route is not intercepted by hostname catch-alls", async ({
    request,
  }) => {
    const response = await request.get(
      tenantUrl(
        DEMO_TENANT_SLUG,
        "/clinic-branding/clinic_demo_rivers/not-a-real-favicon.png"
      )
    );
    expect(response.status()).toBe(404);
    assertNoHostnameRewrite(response.headers());
  });

  test("marketing homepage still emits the River pack and a reachable manifest", async ({
    page,
  }) => {
    const response = await page.goto(marketingUrl("/"), { waitUntil: "load" });
    expect(response?.status()).toBe(200);
    const html = await page.content();
    expect(html).toMatch(/rel=["']manifest["'][^>]*site\.webmanifest/i);
    expect(
      [...html.matchAll(/rel=["'][^"']*icon[^"']*["']/gi)].length
    ).toBeGreaterThan(0);
    const iconHrefs = [
      ...html.matchAll(/<link\b[^>]*\brel=["'][^"']*icon[^"']*["'][^>]*>/gi),
    ]
      .map((match) => match[0].match(/\bhref=["']([^"']+)["']/i)?.[1] ?? "")
      .filter(Boolean);
    expect(iconHrefs.some((href) => isRiverPackHref(href))).toBe(true);

    const manifest = await page.request.get(marketingUrl(MANIFEST_PATH));
    expect(manifest.status()).toBe(200);
  });

  test("Chromium network for marketing home and patient guide has no manifest 404", async ({
    page,
  }) => {
    const manifestFailures: string[] = [];
    const rewriteHeaders: string[] = [];
    const faviconFailures: string[] = [];
    const assetConsole: string[] = [];

    page.on("response", (response) => {
      const url = response.url();
      const headers = response.headers();
      const rewrite =
        headers["x-middleware-rewrite"] ??
        headers["x-nextjs-rewrite"] ??
        headers["x-matched-path"] ??
        "";
      if (url.includes("site.webmanifest") && rewrite) {
        rewriteHeaders.push(`${url} ${rewrite}`);
      }
      if (url.includes("site.webmanifest") && response.status() >= 400) {
        manifestFailures.push(`${response.status()} ${url}`);
      }
      if (
        (url.includes("/favicons/") || url.endsWith("/favicon.ico")) &&
        url.includes("site.webmanifest") === false &&
        response.status() >= 400 &&
        !url.endsWith("/favicon.ico")
      ) {
        faviconFailures.push(`${response.status()} ${url}`);
      }
    });
    page.on("console", (message) => {
      if (message.type() !== "error") {
        return;
      }
      const text = message.text();
      if (/webmanifest|favicon/i.test(text)) {
        assetConsole.push(text);
      }
    });

    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await page.goto(tenantUrl(DEMO_TENANT_SLUG, "/extraction"), {
      waitUntil: "load",
    });

    expect(manifestFailures).toEqual([]);
    expect(rewriteHeaders).toEqual([]);
    expect(faviconFailures).toEqual([]);
    expect(assetConsole).toEqual([]);
  });
});
