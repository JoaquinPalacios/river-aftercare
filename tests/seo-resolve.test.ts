import { describe, expect, it } from "vitest";

import { DEFAULT_PLATFORM_SEO } from "@/lib/seo/defaults";
import { marketingDocumentTitle } from "@/lib/seo/document-title";
import { isDedicatedOgImageConfigured } from "@/lib/seo/og-policy";
import {
  marketingSeoToMetadata,
  resolveMarketingSeo,
  resolveSocialMetadata,
  brandCountInTitle,
} from "@/lib/seo/resolve-marketing-seo";

describe("marketing SEO resolution", () => {
  it("falls back to product defaults when no settings row exists", () => {
    const home = resolveMarketingSeo({
      path: "/",
      origin: "https://example.test",
    });
    expect(home.title).toBe(
      "Patient Aftercare Software for Clinics | River Aftercare"
    );
    expect(home.title).not.toMatch(/River Aftercare.+\s—\sRiver Aftercare/);
    expect(home.seoTitle).toBe(home.title);
    expect(home.canonicalUrl).toBe("https://example.test/");
    expect(home.robots).toEqual({ index: true, follow: true });
    expect(home.identity.sameAsUrls).toEqual([]);
    expect(home.identity.publicContactEmail).toBeNull();
  });

  it("does not append the site name when the SEO title already includes it", () => {
    const pricing = resolveMarketingSeo({
      path: "/pricing",
      origin: "https://example.test",
    });
    const contact = resolveMarketingSeo({
      path: "/contact",
      origin: "https://example.test",
    });
    const about = resolveMarketingSeo({
      path: "/about",
      origin: "https://example.test",
    });

    expect(pricing.title).toBe(
      "Patient Aftercare Software Pricing | River Aftercare"
    );
    expect(contact.title).toBe("Book a Demo | River Aftercare");
    expect(about.title).toBe(
      "About River Aftercare | Digital Patient Aftercare"
    );
    expect(pricing.title).not.toContain("— River Aftercare");
    expect(contact.title).not.toContain("— River Aftercare");
    expect(about.title).not.toContain("— River Aftercare");
  });

  it("appends the site name only when the SEO title does not already include it", () => {
    expect(marketingDocumentTitle("Privacy Policy", "River Aftercare")).toBe(
      "Privacy Policy — River Aftercare"
    );
    expect(
      marketingDocumentTitle(
        "Patient Aftercare Software for Clinics | River Aftercare",
        "River Aftercare"
      )
    ).toBe("Patient Aftercare Software for Clinics | River Aftercare");

    const privacy = resolveMarketingSeo({
      path: "/privacy",
      origin: "https://example.test",
    });
    expect(privacy.seoTitle).toBe("Privacy Policy");
    expect(privacy.title).toBe("Privacy Policy — River Aftercare");
    expect(privacy.robots).toEqual({ index: false, follow: true });
  });

  it("emits absolute document titles so a layout template cannot double the brand", () => {
    const home = marketingSeoToMetadata(
      resolveMarketingSeo({ path: "/", origin: "https://example.test" })
    );
    const pricing = marketingSeoToMetadata(
      resolveMarketingSeo({ path: "/pricing", origin: "https://example.test" })
    );

    expect(home.title).toEqual({
      absolute: "Patient Aftercare Software for Clinics | River Aftercare",
    });
    expect(pricing.title).toEqual({
      absolute: "Patient Aftercare Software Pricing | River Aftercare",
    });
  });

  it("keeps OG title distinct from the SEO document title when an override exists", () => {
    const home = resolveMarketingSeo({
      path: "/",
      origin: "https://example.test",
    });
    const metadata = marketingSeoToMetadata(home);

    expect(home.title).toBe(
      "Patient Aftercare Software for Clinics | River Aftercare"
    );
    expect(home.social.title).toBe(
      "Aftercare that still feels like your clinic"
    );
    expect(home.social.source).toBe("page-og");
    expect(metadata.openGraph?.title).toBe(
      "Aftercare that still feels like your clinic"
    );
    expect(metadata.openGraph?.title).not.toBe(
      typeof metadata.title === "object" &&
        metadata.title &&
        "absolute" in metadata.title
        ? metadata.title.absolute
        : metadata.title
    );
  });

  it("uses page OG overrides, then page SEO, then platform defaults", () => {
    const pageOg = resolveSocialMetadata({
      page: {
        path: "/pricing",
        seoTitle: "Pricing",
        metaDescription: "Page description",
        ogTitle: "Share title",
        ogDescription: "Share description",
        ogImagePath: "/brand/custom-og.png",
        index: true,
        follow: true,
        updatedAt: null,
      },
      identity: {
        ...DEFAULT_PLATFORM_SEO,
        defaultOgImagePath: "/brand/platform-og.png",
      },
      resolvedTitle: "Pricing — River Aftercare",
      resolvedDescription: "Page description",
    });
    expect(pageOg).toEqual({
      title: "Share title",
      description: "Share description",
      imagePath: "/brand/custom-og.png",
      source: "page-og",
    });

    const pageSeo = resolveSocialMetadata({
      page: {
        path: "/pricing",
        seoTitle: "Pricing",
        metaDescription: "Page description",
        ogTitle: null,
        ogDescription: null,
        ogImagePath: null,
        index: true,
        follow: true,
        updatedAt: null,
      },
      identity: {
        ...DEFAULT_PLATFORM_SEO,
        defaultOgImagePath: "/brand/platform-og.png",
      },
      resolvedTitle: "Pricing — River Aftercare",
      resolvedDescription: "Page description",
    });
    expect(pageSeo.source).toBe("page-seo");
    expect(pageSeo.imagePath).toBe("/brand/platform-og.png");
  });

  it("does not emit a malformed image tag when no OG image exists", () => {
    const metadata = marketingSeoToMetadata(
      resolveMarketingSeo({
        path: "/contact",
        origin: "https://example.test",
      })
    );
    expect(metadata.openGraph?.images).toBeUndefined();
    expect(metadata.twitter).toMatchObject({ card: "summary" });
    expect(JSON.stringify(metadata)).not.toContain('"images":[]');
    expect(metadata.alternates?.canonical).toBe("https://example.test/contact");
  });

  it("keeps a single River Aftercare brand reference on vertical titles", () => {
    const dental = resolveMarketingSeo({
      path: "/dental",
      origin: "https://example.test",
    });
    expect(dental.absoluteTitle).toBe(true);
    expect(dental.title).toBe(
      "Dental Aftercare Software for Practices | River Aftercare"
    );
    expect(dental.title).not.toContain("River Aftercare — River Aftercare");
    expect(brandCountInTitle(dental.title, "River Aftercare")).toBe(1);

    const metadata = marketingSeoToMetadata(dental);
    expect(metadata.title).toEqual({
      absolute: "Dental Aftercare Software for Practices | River Aftercare",
    });
    expect(metadata.description).toBe(
      "Publish branded dental post-treatment instructions patients can revisit by link or QR code. No patient app or login required."
    );
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.alternates?.canonical).toBe("https://example.test/dental");
    expect(metadata.openGraph).toMatchObject({
      title: "Dental Aftercare Software for Practices | River Aftercare",
      description:
        "Publish branded dental post-treatment instructions patients can revisit by link or QR code. No patient app or login required.",
    });
  });

  it("does not treat the product logo as a dedicated OG image", () => {
    expect(
      isDedicatedOgImageConfigured("/brand/river-aftercare-logo.svg")
    ).toBe(false);
    expect(
      isDedicatedOgImageConfigured("/brand/river-aftercare-isologo.svg")
    ).toBe(false);
    expect(isDedicatedOgImageConfigured("/brand/river-aftercare-og.png")).toBe(
      true
    );
    expect(
      isDedicatedOgImageConfigured(
        "/platform/seo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png"
      )
    ).toBe(true);
  });

  it("resolves an uploaded global default into Open Graph and Twitter metadata", () => {
    process.env.CLINIC_ASSET_PUBLIC_ORIGIN = "https://assets.example.test";
    try {
      const stored = "/platform/seo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";
      const home = resolveMarketingSeo({
        path: "/contact",
        origin: "https://example.test",
        platform: {
          ...DEFAULT_PLATFORM_SEO,
          defaultOgImagePath: stored,
        },
      });
      const metadata = marketingSeoToMetadata(home);
      expect(home.social.imagePath).toBe(stored);
      expect(metadata.openGraph?.images).toEqual([
        {
          url: "https://assets.example.test/platform/seo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png",
        },
      ]);
      expect(metadata.twitter).toMatchObject({
        card: "summary_large_image",
        images: [
          "https://assets.example.test/platform/seo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png",
        ],
      });
      expect(metadata.alternates?.canonical).toBe(
        "https://example.test/contact"
      );
      expect(metadata.robots).toEqual({ index: true, follow: true });
    } finally {
      delete process.env.CLINIC_ASSET_PUBLIC_ORIGIN;
    }
  });

  it("keeps a page-specific social image override ahead of the uploaded default", () => {
    process.env.CLINIC_ASSET_PUBLIC_ORIGIN = "https://assets.example.test";
    try {
      const resolved = resolveMarketingSeo({
        path: "/pricing",
        origin: "https://example.test",
        platform: {
          ...DEFAULT_PLATFORM_SEO,
          defaultOgImagePath:
            "/platform/seo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png",
        },
        page: {
          path: "/pricing",
          seoTitle: "Pricing",
          metaDescription: "Page description",
          ogTitle: "Share title",
          ogDescription: "Share description",
          ogImagePath: "/brand/custom-og.png",
          index: true,
          follow: true,
          updatedAt: null,
        },
      });
      const metadata = marketingSeoToMetadata(resolved);
      expect(resolved.social.imagePath).toBe("/brand/custom-og.png");
      expect(metadata.openGraph?.images).toEqual([
        { url: "/brand/custom-og.png" },
      ]);
    } finally {
      delete process.env.CLINIC_ASSET_PUBLIC_ORIGIN;
    }
  });
});
