import { gzipSync, brotliCompressSync, constants } from "node:zlib";

import { expect, type Page, type Response } from "@playwright/test";

export interface AssetMeasurement {
  url: string;
  raw: number;
  gzip: number;
  brotli: number;
  body: string;
}

function measureBuffer(url: string, body: Buffer): AssetMeasurement {
  return {
    url,
    raw: body.byteLength,
    gzip: gzipSync(body, { level: 9 }).byteLength,
    brotli: brotliCompressSync(body, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength,
    body: body.toString("utf8"),
  };
}

function isCss(response: Response): boolean {
  const type = response.request().resourceType();
  const contentType = response.headers()["content-type"] ?? "";
  return type === "stylesheet" || contentType.includes("text/css");
}

function isJs(response: Response): boolean {
  const type = response.request().resourceType();
  const contentType = response.headers()["content-type"] ?? "";
  return (
    type === "script" ||
    contentType.includes("javascript") ||
    contentType.includes("ecmascript")
  );
}

export async function measurePageAssets(
  page: Page,
  url: string
): Promise<{ css: AssetMeasurement[]; js: AssetMeasurement[] }> {
  const cssBodies = new Map<string, Buffer>();
  const jsBodies = new Map<string, Buffer>();

  const onResponse = async (response: Response) => {
    if (!response.ok()) {
      return;
    }

    try {
      const body = await response.body();
      if (isCss(response)) {
        cssBodies.set(response.url(), body);
      } else if (isJs(response)) {
        jsBodies.set(response.url(), body);
      }
    } catch {
      // Ignore bodies that cannot be read (redirects, opaque).
    }
  };

  page.on("response", onResponse);

  try {
    await page.goto(url, { waitUntil: "load" });
    const extraScriptUrls = await page.evaluate(() =>
      [...document.querySelectorAll("script[src]")].map(
        (script) => (script as HTMLScriptElement).src
      )
    );
    for (const src of extraScriptUrls) {
      if (jsBodies.has(src)) {
        continue;
      }
      try {
        const response = await page.request.get(src);
        if (response.ok()) {
          jsBodies.set(src, Buffer.from(await response.body()));
        }
      } catch {
        // Ignore scripts that cannot be re-fetched.
      }
    }
  } finally {
    page.off("response", onResponse);
  }

  return {
    css: [...cssBodies.entries()].map(([assetUrl, body]) =>
      measureBuffer(assetUrl, body)
    ),
    js: [...jsBodies.entries()].map(([assetUrl, body]) =>
      measureBuffer(assetUrl, body)
    ),
  };
}

export function sumMetric(
  assets: AssetMeasurement[],
  key: "raw" | "gzip" | "brotli"
): number {
  return assets.reduce((total, asset) => total + asset[key], 0);
}

export function patientSpecificJs(
  assets: AssetMeasurement[]
): AssetMeasurement[] {
  return assets.filter((asset) => {
    const url = decodeURIComponent(asset.url);
    const body = asset.body;
    return (
      url.includes("app/(aftercare)") ||
      url.includes("app/%28aftercare%29") ||
      /patient[-.]/i.test(url) ||
      body.includes("data-demo-view") ||
      body.includes("Print / Save PDF") ||
      body.includes("Change colour theme") ||
      body.includes("ptcBtn")
    );
  });
}

export function patientThemeToggleJs(
  assets: AssetMeasurement[]
): AssetMeasurement[] {
  return assets.filter((asset) => {
    const url = decodeURIComponent(asset.url);
    const body = asset.body;
    return (
      /patient-theme-control|theme-preference/i.test(url) ||
      body.includes("Change colour theme") ||
      body.includes("ptcBtn")
    );
  });
}

export function patientDemoJs(assets: AssetMeasurement[]): AssetMeasurement[] {
  return assets.filter((asset) => {
    const url = decodeURIComponent(asset.url);
    const body = asset.body;
    return (
      /patient-demo-experience|print-trigger/i.test(url) ||
      body.includes("data-demo-view") ||
      body.includes("Print / Save PDF")
    );
  });
}

export function motionLibraryJs(
  assets: AssetMeasurement[]
): AssetMeasurement[] {
  return assets.filter((asset) => {
    const url = decodeURIComponent(asset.url);
    const body = asset.body;
    return (
      /marketing-experience|marketing-motion-features|motion\/react|react-m/i.test(
        url
      ) ||
      body.includes("staggerChildren") ||
      body.includes("whileInView") ||
      body.includes("useInView") ||
      body.includes("LazyMotion") ||
      body.includes("data-mk-pending") ||
      body.includes("domAnimation")
    );
  });
}

export function expectCssWithinPhase1Budget(css: AssetMeasurement[]): void {
  const raw = sumMetric(css, "raw");
  const gzip = sumMetric(css, "gzip");
  const brotli = sumMetric(css, "brotli");

  // Geist @font-face plus the shared interaction contract live in the patient
  // document. Gzip/brotli remain the tighter ceilings.
  expect(raw, `CSS raw ${raw}`).toBeLessThanOrEqual(26_000);
  expect(gzip, `CSS gzip ${gzip}`).toBeLessThanOrEqual(6_500);
  expect(brotli, `CSS brotli ${brotli}`).toBeLessThanOrEqual(6_000);
}

export function expectNoTailwind(css: AssetMeasurement[]): void {
  for (const asset of css) {
    expect(asset.body, asset.url).not.toContain("--tw-");
    expect(asset.body, asset.url).not.toContain('@import "tailwindcss"');
    expect(asset.body, asset.url).not.toContain("practice-brand-proof");
  }
}

export function expectNoNavigationProgressCss(css: AssetMeasurement[]): void {
  for (const asset of css) {
    expect(asset.body, asset.url).not.toContain("navigationProgress");
    expect(asset.body, asset.url).not.toContain("--progress-start");
  }
}

export function expectStaffCssHasTailwind(css: AssetMeasurement[]): void {
  const combined = css.map((asset) => asset.body).join("\n");
  expect(combined).toContain("--tw-");
}
