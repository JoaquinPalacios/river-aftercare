import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { PRODUCT_NAME } from "@/lib/branding/product-name";
import {
  GUIDE_QR_BACKGROUND,
  GUIDE_QR_ERROR_CORRECTION,
  GUIDE_QR_FOREGROUND,
  GUIDE_QR_MARGIN_MODULES,
  guideQrDownloadPath,
  guideQrFilename,
  parseGuideQrFormat,
  sanitizeQrFilenamePart,
} from "@/lib/clinic-portal/guide-qr";
import {
  renderGuideQrPng,
  renderGuideQrSvg,
} from "@/lib/clinic-portal/render-guide-qr";
import { clinicPatientSiteUrl } from "@/lib/clinic-portal/patient-site-url";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe("published guide QR", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  beforeEach(() => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
  });

  afterEach(() => {
    if (previousRoot === undefined) {
      delete process.env.CARE_GUIDE_ROOT_DOMAIN;
    } else {
      process.env.CARE_GUIDE_ROOT_DOMAIN = previousRoot;
    }
  });
  it("builds filenames from product, clinic, and public slugs without ids", () => {
    expect(sanitizeQrFilenamePart(PRODUCT_NAME)).toBe("river-aftercare");
    expect(
      guideQrFilename({
        clinicSlug: "demodental",
        publicSlug: "extraction",
        format: "svg",
      })
    ).toBe("river-aftercare-demodental-extraction-qr.svg");
    expect(
      guideQrFilename({
        clinicSlug: "Riverside Dental!",
        publicSlug: "tooth extraction",
        format: "png",
      })
    ).toBe("river-aftercare-riverside-dental-tooth-extraction-qr.png");
    expect(
      guideQrFilename({
        clinicSlug: "demodental",
        publicSlug: "extraction",
        format: "png",
      })
    ).not.toMatch(/[A-Z]/);
    expect(
      guideQrFilename({
        clinicSlug: "demodental",
        publicSlug: "extraction",
        format: "svg",
      })
    ).not.toContain("cuid");
  });

  it("reuses the canonical patient URL resolver for localhost and production hosts", () => {
    expect(
      clinicPatientSiteUrl({
        requestHost: "app.localhost:3000",
        clinicSlug: "demodental",
        protocol: "http",
        pathname: "/extraction",
      })
    ).toBe("http://demodental.localhost:3000/extraction");

    process.env.CARE_GUIDE_ROOT_DOMAIN = "example.com";
    expect(
      clinicPatientSiteUrl({
        requestHost: "app.example.com",
        clinicSlug: "demodental",
        protocol: "https",
        pathname: "/extraction",
      })
    ).toBe("https://demodental.example.com/extraction");
  });

  it("parses download formats and staff QR paths", () => {
    expect(parseGuideQrFormat("svg")).toBe("svg");
    expect(parseGuideQrFormat("png")).toBe("png");
    expect(parseGuideQrFormat("pdf")).toBeNull();
    expect(guideQrDownloadPath("guide_1", "svg")).toBe(
      "/guides/guide_1/qr?format=svg"
    );
  });

  it("renders deterministic high-contrast SVG and PNG without decorative fills", async () => {
    const url = "http://demodental.localhost:3000/extraction";
    const svg = await renderGuideQrSvg(url);
    const again = await renderGuideQrSvg(url);
    const other = await renderGuideQrSvg(
      "http://demodental.localhost:3000/other"
    );

    expect(svg).toBe(again);
    expect(svg).not.toBe(other);
    expect(svg).toMatch(/<svg[\s\S]*<\/svg>/);
    expect(svg.toLowerCase()).toContain(GUIDE_QR_FOREGROUND);
    expect(svg.toLowerCase()).toContain(GUIDE_QR_BACKGROUND);
    expect(svg).not.toMatch(/linearGradient|radialGradient|clinic brand/i);
    expect(GUIDE_QR_MARGIN_MODULES).toBe(4);
    expect(GUIDE_QR_ERROR_CORRECTION).toBe("H");

    const png = await renderGuideQrPng(url);
    const pngAgain = await renderGuideQrPng(url);
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(png.equals(pngAgain)).toBe(true);
    expect(png.equals(await renderGuideQrPng("http://example.com/other"))).toBe(
      false
    );
  });

  it("keeps QR generation on the staff download route, not the patient page", () => {
    const patientPage = readFileSync(
      "app/(aftercare)/%5Fsites/[tenant]/[guideSlug]/page.tsx",
      "utf8"
    );
    const shareMenu = readFileSync(
      "app/(staff)/(clinic-portal)/guides/guide-share-menu.tsx",
      "utf8"
    );
    const rowActions = readFileSync(
      "app/(staff)/(clinic-portal)/guides/guide-row-actions.tsx",
      "utf8"
    );
    const shareLoader = readFileSync(
      "lib/clinic-portal/published-guide-share.ts",
      "utf8"
    );
    const route = readFileSync(
      "app/(staff)/(clinic-portal)/guides/[guideId]/qr/route.ts",
      "utf8"
    );

    expect(patientPage).not.toContain("GuideShareMenu");
    expect(patientPage).not.toContain("renderGuideQr");
    expect(shareMenu).toContain("Copy link");
    expect(shareMenu).toContain("Download QR (SVG)");
    expect(shareMenu).toContain("Download QR (PNG)");
    expect(shareMenu).toContain("publicUrl");
    expect(rowActions).toContain("GuideShareMenu");
    expect(rowActions).toContain("isPublishedPublic && previewHref");
    expect(shareLoader).toContain("clinicPatientSiteUrl");
    expect(shareLoader).toContain("PUBLIC_PRACTICE_GUIDE_WHERE");
    expect(shareLoader).toContain("placementPublicPath");
    expect(
      readFileSync("lib/clinic-portal/placement-path.ts", "utf8")
    ).toContain("return `/${input.publicSlug}`");
    expect(shareLoader).toContain("clinicSite");
    expect(route).toContain("loadPublishedGuideShareTarget");
    expect(route).not.toContain("/preview");
    expect(route).not.toContain("pinnedRevision");
    expect(readFileSync("lib/clinic-portal/guide-qr.ts", "utf8")).not.toContain(
      'from "qrcode"'
    );
    expect(
      readFileSync("lib/clinic-portal/render-guide-qr.ts", "utf8")
    ).toContain('import "server-only"');
    expect(rowActions).not.toContain("renderGuideQr");
  });
});
