import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "localhost:3000",
      "x-forwarded-proto": "http",
    }),
}));

import MarketingHomePage from "@/app/(marketing)/%5Fmarketing/page";
import MarketingPricingPage from "@/app/(marketing)/%5Fmarketing/pricing/page";

function mkRevealTags(html: string): string[] {
  return (
    html.match(/<(?:div|li|span)[^>]*class="[^"]*mkReveal[^"]*"[^>]*>/g) ?? []
  );
}

describe("marketing reveal server HTML", () => {
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

  it("keeps homepage copy readable without Motion hidden inline styles", async () => {
    const html = renderToStaticMarkup(await MarketingHomePage());
    const reveals = mkRevealTags(html);

    expect(html).toContain("Aftercare that still feels like your clinic.");
    expect(html).toContain("Explore all clinic types");
    expect(reveals.length).toBeGreaterThan(8);
    expect(reveals.every((tag) => tag.includes("data-mk-pending"))).toBe(true);
    expect(reveals.some((tag) => tag.includes("data-mk-card"))).toBe(true);
    expect(reveals.some((tag) => /style=/.test(tag))).toBe(false);
    expect(html).not.toMatch(/opacity:\s*0/);
    expect(html).not.toContain("translateY(14px)");
  });

  it("keeps pricing cards and onboarding copy visible in SSR HTML", async () => {
    const html = renderToStaticMarkup(await MarketingPricingPage());
    const reveals = mkRevealTags(html);

    expect(html).toContain(
      "Where an appropriate River Aftercare template exists, the clinic can use it as a starting point."
    );
    expect(reveals.length).toBeGreaterThan(4);
    expect(reveals.every((tag) => tag.includes("data-mk-pending"))).toBe(true);
    expect(html).not.toMatch(/opacity:\s*0/);
  });
});
