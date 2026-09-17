import { describe, expect, it } from "vitest";

import { DEFAULT_PLATFORM_SEO } from "@/lib/seo/defaults";
import { buildLlmsTxt, shouldPublishLlmsFull } from "@/lib/seo/llms-txt";
import { buildMarketingSitemap } from "@/lib/seo/sitemap";

describe("llms.txt", () => {
  it("lists only public marketing resources", () => {
    const body = buildLlmsTxt({
      identity: DEFAULT_PLATFORM_SEO,
      origin: "https://example.test",
    });
    expect(body).toContain("# River Aftercare");
    expect(body).toContain("clinic or practice");
    expect(body).not.toContain("when a dental practice wants");
    expect(body).toContain(
      "patient aftercare platform for clinics and practices"
    );
    expect(body).toContain("https://example.test/");
    expect(body).toContain("https://example.test/pricing");
    expect(body).toContain("https://example.test/contact");
    expect(body).toContain("https://example.test/about");
    expect(body).toContain("https://example.test/privacy");
    expect(body).toContain("https://example.test/terms");
    expect(body).toContain("https://example.test/clinics");
    expect(body).toContain("https://example.test/dental");
    expect(body).toContain("https://example.test/physiotherapy");
    expect(body).toContain("https://example.test/chiropractic");
    expect(body).toContain("https://example.test/cosmetic-clinics");
    expect(body).toContain("post-treatment instructions");
    expect(body).toContain("recovery, home-care");
    expect(body).toContain("home-care and post-appointment");
    expect(body).toContain("post-treatment aftercare");
    expect(body).toContain("Not an exercise-tracking app.");
    expect(body).toContain("treatment-based clinics and practices");
    expect(body).not.toContain("Wisdom Teeth");
    expect(body).not.toContain("/operator");
    expect(body).not.toContain("/login");
    expect(body).not.toContain("/dashboard");
    expect(body).not.toContain("certified");
    expect(shouldPublishLlmsFull(4)).toBe(false);
    expect(shouldPublishLlmsFull(6)).toBe(false);
    expect(shouldPublishLlmsFull(8)).toBe(true);
  });
});

describe("marketing sitemap builder", () => {
  it("includes marketing routes from the canonical SEO path list", () => {
    const entries = buildMarketingSitemap({
      origin: "http://localhost",
    });
    expect(entries.map((entry) => entry.url)).toEqual([
      "http://localhost/",
      "http://localhost/pricing",
      "http://localhost/contact",
      "http://localhost/about",
      "http://localhost/privacy",
      "http://localhost/terms",
      "http://localhost/clinics",
      "http://localhost/dental",
      "http://localhost/physiotherapy",
      "http://localhost/chiropractic",
      "http://localhost/cosmetic-clinics",
    ]);
    expect(new Set(entries.map((entry) => entry.url)).size).toBe(
      entries.length
    );
  });
});
