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
  publicTenantCanonicalUrl,
} from "@/lib/aftercare/tenant-metadata";
import { PRODUCT_FAVICON_32_SRC } from "@/lib/branding/product-assets";

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
    const icons = Array.isArray(clinic.icons)
      ? clinic.icons
      : clinic.icons &&
          typeof clinic.icons === "object" &&
          "icon" in clinic.icons
        ? clinic.icons.icon
        : [];
    const urls = JSON.stringify(clinic);
    expect(urls).toContain(
      "/clinic-branding/clinic_a/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png"
    );
    expect(urls).not.toContain("clinic_b");
    expect(JSON.stringify(fallback)).toContain(PRODUCT_FAVICON_32_SRC);

    const replaced = clinicFaviconMetadata(
      "clinics/clinic_a/branding/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png"
    );
    expect(JSON.stringify(replaced)).toContain(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png"
    );
    expect(JSON.stringify(replaced)).not.toContain(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png"
    );
    expect(icons).toBeTruthy();
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
    expect(metadata.themeColor).toEqual([
      { media: "(prefers-color-scheme: light)", color: "#0f766e" },
      { media: "(prefers-color-scheme: dark)", color: "#22d3ee" },
    ]);
  });
});
