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

import MarketingPricingPage from "@/app/(marketing)/%5Fmarketing/pricing/page";
import { LAUNCH_PLANS } from "@/lib/marketing/plans";

describe("marketing pricing page", () => {
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

  it("publishes working launch plans without post-launch check-ins", async () => {
    const html = renderToStaticMarkup(await MarketingPricingPage());

    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("Simple plans for branded patient aftercare.");
    expect(html).toContain('data-mk-page-hero="pricing"');
    expect(html).toContain("mkPageWaveInnerPage");
    expect(html).not.toContain("mkPageWavePricing");
    expect(html).toContain("headingBlock");
    expect(html).toContain("headingFollow");
    expect(html).toContain("laterList");
    expect(html.indexOf("laterList")).toBeGreaterThan(
      html.indexOf("Coming after launch")
    );

    const styles = readFileSync("app/(marketing)/marketing.module.css", "utf8");
    const tokens = readFileSync("app/(marketing)/marketing.css", "utf8");
    expect(tokens).toContain(
      "--mk-intro-content-gap: clamp(1.25rem, 2vw, 1.5rem)"
    );
    expect(styles).toContain(".laterList.headingFollow");
    expect(styles).toContain("margin-top: var(--mk-intro-content-gap)");
    expect(html).toContain("A$79");
    expect(html).toContain("A$149");
    expect(html).toContain("Custom pricing");
    expect(html).toContain("Recommended");
    expect(html).toContain(LAUNCH_PLANS[0].name);
    expect(html).toContain(LAUNCH_PLANS[1].name);
    expect(html).toContain(LAUNCH_PLANS[2].name);
    expect(html).toContain("Available River Aftercare guide templates");
    expect(html).toContain("Print / Save PDF");
    expect(html).not.toContain("Curated dental guide library");
    expect(html).not.toContain("Broader dental template library");
    expect(html).toContain("Coming after launch");
    expect(html).toContain("Patient check-ins");
    expect(html).toContain("Choose the plan that fits your practice");
    expect(html).not.toContain("Choose the shape that matches your practice");
    expect(html).toContain("Connected aftercare plans");
    expect(html).not.toContain("Connected recovery plans");
    expect(html).toContain("Assisted onboarding is available");
    expect(html).toContain("Start with approved guidance, then make it yours");
    expect(html).toContain("Where a River Aftercare template exists");
    expect(html).toContain("template library is still expanding");
    expect(html).toContain("numberedStepIndex");
    expect(html).toContain("numberedStepRule");
    expect(html).not.toContain("Wisdom Teeth");
    expect(html).not.toContain("Dental Implant");
    expect(html).not.toContain("Periodontal Deep Cleaning");
    expect(html).not.toContain("Root Canal");
    expect(html).not.toContain("storyIndex");
    expect(html).not.toContain("frictionIndex");
    expect(html).not.toContain("A$249");
    expect(html).not.toContain("A$499");
    expect(html).not.toContain("pay for 10 months");
    expect(html).toContain('href="/contact"');
    expect(html).not.toContain("analytics dashboard");
    expect(html).not.toContain("SMS");
    expect(html).not.toContain("custom domain");
    expect(html).toContain("or PMS integrations");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("/_marketing");
    expect(html).not.toContain("/_sites");
    expect(html).not.toContain("Riverside Dental Demo —");

    const essentialBlock = html.slice(
      html.indexOf('id="plan-essential"'),
      html.indexOf('id="plan-practice"')
    );
    expect(essentialBlock).not.toContain("Patient check-ins");
    expect(essentialBlock).not.toContain("Connected aftercare");
    expect(essentialBlock).not.toContain("Connected recovery");
  });
});
