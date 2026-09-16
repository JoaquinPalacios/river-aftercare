import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "localhost:3000",
      "x-forwarded-proto": "http",
    }),
}));

import MarketingAboutPage from "@/app/(marketing)/%5Fmarketing/about/page";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

const marketingCss = readFileSync(
  "app/(marketing)/marketing.module.css",
  "utf8"
);

describe("marketing about page", () => {
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

  it("uses the inner-page heading and section spacing contract", async () => {
    const html = renderToStaticMarkup(await MarketingAboutPage());

    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain(
      `${PRODUCT_NAME} is a patient aftercare platform for clinics and practices.`
    );
    expect(html).toContain("Aftercare should feel like part of the care.");
    expect(html).toContain('data-mk-page-hero="about"');
    expect(html).toContain("headingBlock");
    expect(html).toContain("headingFollow");
    expect(html).toContain("What it is");
    expect(html).toContain("Who it is for");
    expect(html).toContain("Clinic ownership");
    expect(html).toContain("What it is not");
    expect(html).toContain(
      "A branded home for the guidance patients need afterwards"
    );
    expect(html).toContain("Built for treatment-based practices");
    expect(html).toContain("Your clinic remains responsible for the care");
    expect(html).not.toContain("The first vertical is dental");
    expect(html).not.toContain("mobile-first aftercare pages");
    expect(html).toContain("not currently live clinical monitoring");
    expect(html).toContain("patient CRM");
    expect(html).toContain("messaging platform");
    expect(html).toContain("Talk to us about a demo");
    expect((html.match(/class="[^"]*band/g) ?? []).length).toBe(1);
    expect(html).not.toContain("/_marketing");
    expect(marketingCss).toContain(".headingBlock .copy + .copy");
    expect(marketingCss).toContain("margin-top: var(--mk-heading-intro-gap)");
    expect(marketingCss).toContain("margin-top: var(--mk-heading-content-gap)");
    expect(marketingCss).toContain(".marketingSoft > .band:first-child");
    expect(marketingCss).toContain("padding-top: var(--mk-chapter-pad-y)");
  });
});
