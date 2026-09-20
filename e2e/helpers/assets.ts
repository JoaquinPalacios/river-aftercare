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

const CLINIC_TYPEFACE_FAMILY =
  /^(Open Sans|Roboto|Montserrat|Lato|Poppins|Inter)( Fallback)?$/i;

export interface PatientCssParts {
  coreBody: string;
  catalogueBody: string;
  coreRaw: number;
  catalogueRaw: number;
  totalRaw: number;
  coreGzip: number;
  catalogueGzip: number;
  coreBrotli: number;
  catalogueBrotli: number;
  catalogueFontFaceCount: number;
  catalogueFamilies: string[];
  catalogueFontFiles: string[];
  geistFontFiles: string[];
}

function fontFamilyFromFace(block: string): string {
  return (
    block
      .match(/font-family:([^;]+);/)?.[1]
      ?.trim()
      .replaceAll(/^"|"$/g, "") ?? ""
  );
}

function fontFilesFromCss(body: string): string[] {
  return [
    ...new Set(
      [...body.matchAll(/url\(([^)]+)\)/g)]
        .map((match) => match[1].replaceAll(/^['"]|['"]$/g, ""))
        .map((url) => url.split("/").pop() ?? url)
        .filter((file) => /\.woff2?(\?|$)/i.test(file))
    ),
  ].sort();
}

function measureCssString(body: string): {
  raw: number;
  gzip: number;
  brotli: number;
} {
  const buffer = Buffer.from(body, "utf8");
  return {
    raw: buffer.byteLength,
    gzip: gzipSync(buffer, { level: 9 }).byteLength,
    brotli: brotliCompressSync(buffer, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength,
  };
}

export function partitionPatientCss(css: AssetMeasurement[]): PatientCssParts {
  const catalogueParts: string[] = [];
  const coreParts: string[] = [];
  const families = new Set<string>();
  let catalogueFontFaceCount = 0;

  for (const asset of css) {
    let core = asset.body;
    const faces = [...asset.body.matchAll(/@font-face\{.*?\}/g)].map(
      (match) => match[0]
    );
    for (const face of faces) {
      const family = fontFamilyFromFace(face);
      if (CLINIC_TYPEFACE_FAMILY.test(family)) {
        catalogueParts.push(face);
        core = core.replace(face, "");
        families.add(family.replace(/ Fallback$/i, ""));
        catalogueFontFaceCount += 1;
      }
    }
    const variableBlocks = [
      ...core.matchAll(/[^{}]*\{[^}]*--font-clinic-[^}]*\}/g),
    ].map((match) => match[0]);
    for (const block of variableBlocks) {
      catalogueParts.push(block);
      core = core.replace(block, "");
    }
    coreParts.push(core);
  }

  const coreBody = coreParts.join("");
  const catalogueBody = catalogueParts.join("");
  const core = measureCssString(coreBody);
  const catalogue = measureCssString(catalogueBody);

  return {
    coreBody,
    catalogueBody,
    coreRaw: core.raw,
    catalogueRaw: catalogue.raw,
    totalRaw: sumMetric(css, "raw"),
    coreGzip: core.gzip,
    catalogueGzip: catalogue.gzip,
    coreBrotli: core.brotli,
    catalogueBrotli: catalogue.brotli,
    catalogueFontFaceCount,
    catalogueFamilies: [...families].sort(),
    catalogueFontFiles: fontFilesFromCss(catalogueBody),
    geistFontFiles: fontFilesFromCss(
      css.map((asset) => asset.body).join("")
    ).filter((file) => !fontFilesFromCss(catalogueBody).includes(file)),
  };
}

export function requestedFontFiles(urls: readonly string[]): string[] {
  return [
    ...new Set(
      urls
        .map((url) => url.split("/").pop()?.split("?")[0] ?? "")
        .filter((file) => /\.woff2?$/i.test(file))
    ),
  ].sort();
}

/**
 * Core patient CSS is Geist, aftercare tokens/interaction, and patient UI.
 * Clinic typeface `@font-face` catalogue is measured separately so adding a
 * curated family does not look like patient-layout bloat, and so unused
 * catalogue CSS cannot hide a real UI-CSS regression.
 *
 * Measured 2026-09-20 on main `a7164f1` production tenant CSS (demodental):
 * core raw 28,445 / catalogue raw 41,965 / total raw 70,410.
 * Core gzip of the concatenated core CSS is under the historical 6,500
 * ceiling; the historical 26,000 raw total no longer describes core UI CSS
 * once Dark-logo rules and the typeface catalogue exist.
 *
 * Headroom is modest. Do not raise these to swallow unrelated CSS.
 */
const CORE_PATIENT_CSS_RAW = 31_000;
const CORE_PATIENT_CSS_GZIP = 6_500;
const CORE_PATIENT_CSS_BROTLI = 6_000;
const TYPEFACE_CATALOGUE_CSS_RAW = 46_000;

export function expectCssWithinPhase1Budget(css: AssetMeasurement[]): void {
  const parts = partitionPatientCss(css);
  const inventory = css
    .map((asset) => `${asset.raw} ${asset.url}`)
    .sort((a, b) => Number(b.split(" ")[0]) - Number(a.split(" ")[0]))
    .join("; ");

  expect(
    parts.coreRaw,
    `core patient CSS raw ${parts.coreRaw} (catalogue ${parts.catalogueRaw}, total ${parts.totalRaw}) from ${inventory}`
  ).toBeLessThanOrEqual(CORE_PATIENT_CSS_RAW);
  expect(
    parts.coreGzip,
    `core patient CSS gzip ${parts.coreGzip}`
  ).toBeLessThanOrEqual(CORE_PATIENT_CSS_GZIP);
  expect(
    parts.coreBrotli,
    `core patient CSS brotli ${parts.coreBrotli}`
  ).toBeLessThanOrEqual(CORE_PATIENT_CSS_BROTLI);
  expect(
    parts.catalogueRaw,
    `typeface catalogue CSS raw ${parts.catalogueRaw} families=${parts.catalogueFamilies.join(",") || "none"} faces=${parts.catalogueFontFaceCount}`
  ).toBeLessThanOrEqual(TYPEFACE_CATALOGUE_CSS_RAW);
}
