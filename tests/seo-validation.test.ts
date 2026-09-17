import { describe, expect, it } from "vitest";

import {
  parseSameAsUrls,
  validatePlatformSeoInput,
} from "@/lib/seo/validation";

const validPage = {
  path: "/" as const,
  seoTitle: "River Aftercare — Branded patient aftercare",
  metaDescription: "Branded aftercare pages for clinics.",
  ogTitle: null,
  ogDescription: null,
  ogImagePath: null,
  index: true,
  follow: true,
};

function baseInput() {
  return {
    siteName: "River Aftercare",
    defaultDescription: "Branded aftercare pages for clinics.",
    organizationName: "River Aftercare",
    organizationDescription:
      "River Aftercare is a branded aftercare platform for healthcare practices.",
    publicContactEmail: null,
    defaultOgImagePath: null,
    sameAsUrls: [] as string[],
    pages: [
      validPage,
      { ...validPage, path: "/pricing" as const, seoTitle: "Pricing" },
      { ...validPage, path: "/contact" as const, seoTitle: "Contact" },
      { ...validPage, path: "/about" as const, seoTitle: "About" },
    ],
  };
}

describe("SEO validation", () => {
  it("accepts titles slightly over typical snippet length", () => {
    const input = baseInput();
    input.pages[0] = {
      ...validPage,
      seoTitle: "A".repeat(61),
    };
    const result = validatePlatformSeoInput(input);
    expect(result.value).toBeDefined();
    expect(result.issues).toEqual([]);
  });

  it("rejects HTML, scripts, and javascript URLs", () => {
    const html = validatePlatformSeoInput({
      ...baseInput(),
      siteName: "<b>River</b>",
    });
    expect(html.issues.some((issue) => issue.field === "siteName")).toBe(true);

    const script = validatePlatformSeoInput({
      ...baseInput(),
      defaultDescription: "<script>alert(1)</script>Hello",
    });
    expect(script.issues.length).toBeGreaterThan(0);

    const javascriptUrl = validatePlatformSeoInput({
      ...baseInput(),
      sameAsUrls: ["javascript:alert(1)"],
    });
    expect(javascriptUrl.issues.length).toBeGreaterThan(0);
  });

  it("rejects data URLs and remote image URLs for OG images", () => {
    const dataUrl = validatePlatformSeoInput({
      ...baseInput(),
      defaultOgImagePath: "data:image/png;base64,abc",
    });
    expect(
      dataUrl.issues.some((issue) => issue.field === "defaultOgImagePath")
    ).toBe(true);

    const remote = validatePlatformSeoInput({
      ...baseInput(),
      defaultOgImagePath: "https://evil.example/og.png",
    });
    expect(
      remote.issues.some((issue) => issue.field === "defaultOgImagePath")
    ).toBe(true);
  });

  it("accepts a same-origin image path and https sameAs URLs", () => {
    const result = validatePlatformSeoInput({
      ...baseInput(),
      defaultOgImagePath: "/brand/river-aftercare-og.png",
      sameAsUrls: parseSameAsUrls("https://www.linkedin.com/company/example"),
      publicContactEmail: "hello@example.test",
    });
    expect(result.issues).toEqual([]);
    expect(result.value?.identity.sameAsUrls).toEqual([
      "https://www.linkedin.com/company/example",
    ]);
  });

  it("accepts a managed platform SEO public path", () => {
    const result = validatePlatformSeoInput({
      ...baseInput(),
      defaultOgImagePath:
        "/platform/seo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png",
    });
    expect(result.issues).toEqual([]);
    expect(result.value?.identity.defaultOgImagePath).toBe(
      "/platform/seo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png"
    );
  });
});
