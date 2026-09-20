import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "demodental.localhost:3000",
      "x-forwarded-proto": "http",
    }),
}));

import {
  AFTERCARE_ROBOTS,
  aftercarePageMetadata,
  clinicFaviconMetadata,
  clinicThemeColorViewport,
  publicTenantCanonicalUrl,
} from "@/lib/aftercare/tenant-metadata";
import {
  PRODUCT_FAVICON_32_SRC,
  PRODUCT_FAVICON_ICO_SRC,
} from "@/lib/branding/product-assets";
import { PRODUCT_ICON_HREFS } from "@/lib/seo/icons";

describe("tenant metadata helpers", () => {
  it("builds a public hostname canonical URL", async () => {
    await expect(publicTenantCanonicalUrl("/")).resolves.toBe(
      "http://demodental.localhost:3000/"
    );
    await expect(publicTenantCanonicalUrl("/extraction")).resolves.toBe(
      "http://demodental.localhost:3000/extraction"
    );
  });

  it("never emits an internal /_sites canonical URL", async () => {
    await expect(
      publicTenantCanonicalUrl("/_sites/demodental/extraction")
    ).resolves.toBeUndefined();
    expect(AFTERCARE_ROBOTS).toEqual({ index: false, follow: true });
  });

  it("uses the clinic favicon URL when configured and the River pack otherwise", () => {
    const clinic = clinicFaviconMetadata(
      "clinics/clinic_a/branding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png"
    );
    const fallback = clinicFaviconMetadata(null);
    const clinicJson = JSON.stringify(clinic);
    const fallbackJson = JSON.stringify(fallback);

    expect(clinicJson).toContain(
      "/clinic-branding/clinic_a/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png"
    );
    expect(clinicJson).not.toContain("clinic_b");
    expect(clinicJson).not.toContain("/favicon.ico");
    for (const href of PRODUCT_ICON_HREFS) {
      expect(clinicJson).not.toContain(href);
    }
    expect(clinicJson).toContain("apple");
    expect(fallbackJson).toContain(PRODUCT_FAVICON_32_SRC);
    expect(fallbackJson).toContain(PRODUCT_FAVICON_ICO_SRC);

    const replaced = clinicFaviconMetadata(
      "clinics/clinic_a/branding/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png"
    );
    expect(JSON.stringify(replaced)).toContain(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png"
    );
    expect(JSON.stringify(replaced)).not.toContain(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png"
    );
  });

  it("adds clinic theme-color and favicon to patient page metadata", () => {
    const metadata = aftercarePageMetadata({
      title: "Tooth Extraction Aftercare | Harbor",
      description: "Aftercare instructions from Harbor.",
      faviconUrl:
        "clinics/clinic_a/branding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png",
      theme: {
        primaryColor: "#0f766e",
        accentColor: "#f59e0b",
        darkPrimaryColor: "#22d3ee",
        darkAccentColor: "#fde68a",
        useCustomDarkBranding: true,
        themeMode: "SYSTEM",
      },
    });
    expect(JSON.stringify(metadata.icons)).toContain(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png"
    );
    expect(
      clinicThemeColorViewport({
        primaryColor: "#0f766e",
        accentColor: "#f59e0b",
        darkPrimaryColor: "#22d3ee",
        darkAccentColor: "#fde68a",
        useCustomDarkBranding: true,
        themeMode: "SYSTEM",
      }).themeColor
    ).toEqual([
      { media: "(prefers-color-scheme: light)", color: "#0f766e" },
      { media: "(prefers-color-scheme: dark)", color: "#22d3ee" },
    ]);
  });
});
