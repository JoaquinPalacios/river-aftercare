import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

import {
  expectCssWithinPhase1Budget,
  expectNoNavigationProgressCss,
  expectNoTailwind,
  expectStaffCssHasTailwind,
  measurePageAssets,
  motionLibraryJs,
  partitionPatientCss,
  patientDemoJs,
  patientSpecificJs,
  patientThemeToggleJs,
  requestedFontFiles,
  sumMetric,
} from "./helpers/assets";
import {
  DEMO_TENANT_SLUG,
  marketingUrl,
  staffUrl,
  tenantUrl,
} from "./helpers/origins";

const HOME = tenantUrl(DEMO_TENANT_SLUG, "/");
const EXTRACTION = tenantUrl(DEMO_TENANT_SLUG, "/extraction");

test.describe("Phase 1 performance and asset contracts", () => {
  test("tenant CSS stays under budget without Tailwind or patient Client Components", async ({
    page,
  }, testInfo) => {
    const fontUrls: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (request.resourceType() === "font" || /\.woff2?(\?|$)/i.test(url)) {
        fontUrls.push(url);
      }
    });

    const home = await measurePageAssets(page, HOME);
    expectNoTailwind(home.css);
    expectNoNavigationProgressCss(home.css);
    expectCssWithinPhase1Budget(home.css);
    const homeParts = partitionPatientCss(home.css);
    expect(homeParts.catalogueFamilies).toEqual([
      "Inter",
      "Lato",
      "Montserrat",
      "Open Sans",
      "Poppins",
      "Roboto",
    ]);
    expect(
      requestedFontFiles(fontUrls).filter((file) =>
        homeParts.catalogueFontFiles.includes(file)
      ),
      "default Geist tenant must not download unused clinic typeface files"
    ).toEqual([]);

    const guide = await measurePageAssets(page, EXTRACTION);
    expectNoTailwind(guide.css);
    expectNoNavigationProgressCss(guide.css);
    expectCssWithinPhase1Budget(guide.css);
    const guideParts = partitionPatientCss(guide.css);
    expect(guideParts.catalogueFamilies).toEqual(homeParts.catalogueFamilies);

    expect(
      patientSpecificJs(home.js)
        .map((asset) => asset.url)
        .sort()
    ).toEqual(
      patientThemeToggleJs(home.js)
        .map((asset) => asset.url)
        .sort()
    );
    expect(patientThemeToggleJs(guide.js).length).toBeGreaterThan(0);
    expect(patientDemoJs(guide.js).length).toBeGreaterThan(0);
    expect(motionLibraryJs(guide.js)).toEqual([]);

    testInfo.attach("phase-1e-performance.json", {
      contentType: "application/json",
      body: JSON.stringify(
        {
          home: {
            cssRequests: home.css.length,
            cssRaw: sumMetric(home.css, "raw"),
            cssGzip: sumMetric(home.css, "gzip"),
            cssBrotli: sumMetric(home.css, "brotli"),
            coreCssRaw: homeParts.coreRaw,
            coreCssGzip: homeParts.coreGzip,
            coreCssBrotli: homeParts.coreBrotli,
            catalogueCssRaw: homeParts.catalogueRaw,
            catalogueFamilies: homeParts.catalogueFamilies,
            requestedFontFiles: requestedFontFiles(fontUrls),
            jsRequests: home.js.length,
            jsRaw: sumMetric(home.js, "raw"),
            jsGzip: sumMetric(home.js, "gzip"),
            jsBrotli: sumMetric(home.js, "brotli"),
            jsUrls: home.js.map((asset) => asset.url),
            patientSpecificJs: patientSpecificJs(home.js).map(
              (asset) => asset.url
            ),
            patientThemeToggleJs: patientThemeToggleJs(home.js).map(
              (asset) => ({
                url: asset.url,
                raw: asset.raw,
                gzip: asset.gzip,
                brotli: asset.brotli,
              })
            ),
          },
          guide: {
            cssRequests: guide.css.length,
            cssRaw: sumMetric(guide.css, "raw"),
            cssGzip: sumMetric(guide.css, "gzip"),
            cssBrotli: sumMetric(guide.css, "brotli"),
            coreCssRaw: guideParts.coreRaw,
            catalogueCssRaw: guideParts.catalogueRaw,
            jsRequests: guide.js.length,
            jsRaw: sumMetric(guide.js, "raw"),
            jsGzip: sumMetric(guide.js, "gzip"),
            jsBrotli: sumMetric(guide.js, "brotli"),
            jsUrls: guide.js.map((asset) => asset.url),
            patientSpecificJs: patientSpecificJs(guide.js).map(
              (asset) => asset.url
            ),
          },
        },
        null,
        2
      ),
    });
  });

  test("demo logo is a small same-origin SVG with explicit dimensions", async ({
    page,
  }) => {
    const logoPath = "public/demo/riverside-mark.svg";
    const fileBytes = readFileSync(logoPath).byteLength;
    expect(fileBytes).toBeLessThan(2048);

    await page.goto(HOME, { waitUntil: "load" });
    const logo = page.locator('img[src="/demo/riverside-mark.svg"]');
    await expect(logo).toHaveAttribute("width", "44");
    await expect(logo).toHaveAttribute("height", "44");
    await expect(logo).toHaveAttribute("alt", "");

    const response = await page.request.get(
      tenantUrl(DEMO_TENANT_SLUG, "/demo/riverside-mark.svg")
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"] ?? "").toMatch(/svg/i);
    const body = await response.body();
    expect(body.byteLength).toBe(fileBytes);
    const cacheControl = response.headers()["cache-control"] ?? "";
    expect(cacheControl).toMatch(/public|max-age|immutable/i);
  });

  test("staff still loads Tailwind while marketing and tenant do not", async ({
    page,
  }) => {
    const staff = await measurePageAssets(page, staffUrl("/"));
    expectStaffCssHasTailwind(staff.css);

    const marketing = await measurePageAssets(page, marketingUrl("/"));
    expectNoTailwind(marketing.css);
    expect(motionLibraryJs(marketing.js).length).toBeGreaterThan(0);

    const tenant = await measurePageAssets(
      page,
      tenantUrl(DEMO_TENANT_SLUG, "/")
    );
    expectNoTailwind(tenant.css);
    expectNoNavigationProgressCss(tenant.css);
    expect(motionLibraryJs(tenant.js)).toEqual([]);
  });
});
