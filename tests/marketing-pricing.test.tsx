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
import {
  formatAudInclGst,
  LAUNCH_PLANS,
  PLAN_PRICES,
} from "@/lib/marketing/plans";

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

  it("publishes production launch plans without roadmap or provisional copy", async () => {
    const html = renderToStaticMarkup(await MarketingPricingPage());

    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("Simple plans for branded patient aftercare.");
    expect(html).toContain('data-mk-page-hero="pricing"');
    expect(html).toContain("mkPageWaveInnerPage");
    expect(html).not.toContain("mkPageWavePricing");
    expect(html).toContain("headingBlock");
    expect(html).toContain("headingFollow");
    expect(html).toContain("noteCard");
    expect(html).toContain("Clear pricing, assisted setup");
    expect(html).toContain("What these prices include");
    expect(html).not.toContain("laterList");
    expect(html).not.toContain("Coming after launch");
    expect(html).not.toContain("Commercial notes");
    expect(html).not.toContain("working pricing");
    expect(html).not.toContain("Working Australian pricing");
    expect(html).not.toContain("provisional");
    expect(html).not.toContain("still being finalised");
    expect(html).not.toContain("self-serve billing");
    expect(html).not.toContain("coming soon");

    const styles = readFileSync("app/(marketing)/marketing.module.css", "utf8");
    const tokens = readFileSync("app/(marketing)/marketing.css", "utf8");
    expect(tokens).toContain(
      "--mk-intro-content-gap: clamp(1.25rem, 2vw, 1.5rem)"
    );
    expect(styles).toContain(".noteCard");
    expect(styles).toContain(".planFootnote");
    const planFeaturesRule = styles.slice(
      styles.indexOf(".planFeatures {"),
      styles.indexOf(".planFeatures li")
    );
    expect(planFeaturesRule).toContain("align-content: start");
    expect(planFeaturesRule).toContain("gap: 1rem");
    expect(planFeaturesRule).toContain("flex: none");
    expect(planFeaturesRule).not.toContain("flex: 1");
    expect(planFeaturesRule).not.toContain("space-between");
    expect(planFeaturesRule).not.toContain("space-around");
    expect(planFeaturesRule).not.toContain("space-evenly");
    const planCtaRule = styles.slice(
      styles.indexOf(".planCta {"),
      styles.indexOf(".planFootnoteRef {")
    );
    expect(planCtaRule).toContain("margin-top: auto");
    expect(styles).toContain("font-size: 1rem");
    expect(styles).toContain("inset 0 1px 0");
    expect(styles).toContain(
      "color-mix(in srgb, var(--mk-brand) 20%, var(--mk-card-line))"
    );

    expect(html).toContain(
      formatAudInclGst(PLAN_PRICES.essential.monthlyAudInclGst)
    );
    expect(html).toContain(
      formatAudInclGst(PLAN_PRICES.essential.annualAudInclGst)
    );
    expect(html).toContain(
      formatAudInclGst(PLAN_PRICES.practice.monthlyAudInclGst)
    );
    expect(html).toContain(
      formatAudInclGst(PLAN_PRICES.practice.annualAudInclGst)
    );
    expect(html).not.toContain("Second location:");
    expect(html).not.toContain("Third and subsequent");
    expect(html).not.toContain(
      formatAudInclGst(
        PLAN_PRICES.practice.additionalLocation.monthlyAudInclGst
      )
    );
    expect(html).not.toContain(
      formatAudInclGst(PLAN_PRICES.practice.additionalLocation.annualAudInclGst)
    );
    expect(html).toContain("All prices include GST.");
    expect(html).toContain("12 months for the price of 10");
    expect(html).toContain("Custom pricing");
    expect(html).toContain("Recommended");
    expect(html).toContain(LAUNCH_PLANS[0].name);
    expect(html).toContain(LAUNCH_PLANS[1].name);
    expect(html).toContain(LAUNCH_PLANS[2].name);
    expect(html).toContain("River Aftercare guide templates");
    expect(html).toContain("Print / Save PDF");
    expect(html).toContain("Create and edit up to 2 custom clinic guides");
    expect(html).not.toContain(">Up to 2 custom clinic guides<");
    expect(html).toContain("Up to 30 custom clinic guides");
    expect(html).not.toContain("active custom");
    expect(html).toContain(
      "Multi-location practice? Talk to us about your setup."
    );
    expect(html).not.toContain("Need a larger guide library? Talk to us.");
    expect(html).not.toContain("Create and adapt clinic aftercare");
    expect(html).not.toContain("Guide and section controls");
    expect(html).not.toContain("Local clinic instructions");
    expect(html).not.toContain("Create and edit your own aftercare guides");
    expect(html).toContain(
      "Adapt River Aftercare templates to suit your clinic"
    );
    expect(html).not.toContain("Add clinic-specific instructions");
    expect(html).not.toContain("Richer branding");
    expect(html).not.toContain("hide River Aftercare attribution");
    expect(html).not.toContain("Shared guides");
    expect(html).toContain("Logo, colours and curated typography");
    expect(html).toContain('id="pricing-typography-note"');
    expect(html).toContain("planFootnote");
    expect(html).toContain("planFootnoteRef");
    expect(html).toContain(
      "* Choose from six curated professional typefaces. Need another? Ask us — additional options can be reviewed subject to availability."
    );
    expect(html).not.toContain("Choose from a curated set of professional");
    expect(html).not.toContain("Open Sans");
    expect(html).not.toContain("Montserrat");
    expect(html).not.toContain("Poppins");
    expect(html).not.toContain("Curated dental guide library");
    expect(html).not.toContain("Broader dental template library");
    expect(html).not.toContain("Patient check-ins");
    expect(html).not.toContain("Choose the shape that matches your practice");
    expect(html).toContain("Choose the plan that fits your practice");
    expect(html).not.toContain("Connected aftercare plans");
    expect(html).not.toContain("Connected recovery plans");
    expect(html).toContain("Start with trusted guidance, then make it yours");
    expect(html).toContain("Clinics remain responsible for approving");
    expect(html).toContain("numberedStepIndex");
    expect(html).toContain("numberedStepRule");
    expect(html).toContain("numberedStepTitle");
    expect(html).not.toContain("Wisdom Teeth");
    expect(html).not.toContain("Dental Implant");
    expect(html).not.toContain("Periodontal Deep Cleaning");
    expect(html).not.toContain("Root Canal");
    expect(html).not.toContain("storyIndex");
    expect(html).not.toContain("frictionIndex");
    expect(html).not.toContain("A$249");
    expect(html).not.toContain("A$499");
    expect(html).not.toContain("A$298");
    expect(html).not.toContain("298");
    expect(html).not.toContain("pay for 10 months");
    expect(html).toContain('href="/contact"');
    expect(html).not.toContain("analytics dashboard");
    expect(html).not.toContain("SMS");
    expect(html).not.toContain("custom domain");
    expect(html).toContain(
      "monitoring, persisted patient check-ins, CRM, messaging, or PMS integrations"
    );
    expect(html).toContain("or PMS integrations");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("/_marketing");
    expect(html).not.toContain("/_sites");
    expect(html).not.toContain("Riverside Dental Demo —");

    const essentialBlock = html.slice(
      html.indexOf('id="plan-essential"'),
      html.indexOf('id="plan-practice"')
    );
    const practiceBlock = html.slice(
      html.indexOf('id="plan-practice"'),
      html.indexOf('id="plan-group"')
    );
    const groupBlock = html.slice(html.indexOf('id="plan-group"'));
    expect(essentialBlock).toContain("1 practice / location");
    expect(essentialBlock).toContain(
      "Create and edit up to 2 custom clinic guides"
    );
    expect(essentialBlock).not.toContain(">Up to 2 custom clinic guides<");
    expect(essentialBlock).toContain("Logo, colours and curated typography");
    expect(essentialBlock).toContain('<sup aria-hidden="true">*</sup>');
    expect(essentialBlock).toContain('href="#pricing-typography-note"');
    expect(essentialBlock).not.toContain("Patient check-ins");
    expect(essentialBlock).not.toContain("Connected aftercare");
    expect(essentialBlock).not.toContain("Additional locations");
    expect(practiceBlock).toContain("Everything in Essential");
    expect(practiceBlock).toContain("Up to 30 custom clinic guides");
    expect(practiceBlock).toContain(
      "Adapt River Aftercare templates to suit your clinic"
    );
    expect(practiceBlock).toContain("Assisted setup");
    expect(practiceBlock).not.toContain(
      "Create and edit your own aftercare guides"
    );
    expect(practiceBlock).not.toContain("Add clinic-specific instructions");
    expect(practiceBlock).not.toContain("Create and adapt clinic aftercare");
    expect(practiceBlock).not.toContain("Guide and section controls");
    expect(practiceBlock).not.toContain("Local clinic instructions");
    expect(practiceBlock).not.toContain("Logo, colours and curated typography");
    expect(practiceBlock).toContain(
      "Multi-location practice? Talk to us about your setup."
    );
    expect(practiceBlock).not.toContain("Need a larger guide library");
    expect(practiceBlock).not.toContain("A$59");
    expect(practiceBlock).not.toContain("A$590");
    expect(groupBlock).toContain("Custom pricing");
    expect(groupBlock).not.toContain("A$");
    expect(groupBlock).toContain("Talk to us");
  });

  it("includes the onboarding product-truth note as the final reveal item", async () => {
    const html = renderToStaticMarkup(await MarketingPricingPage());
    const marker =
      "Where an appropriate River Aftercare template exists, the clinic can use it as a starting point.";
    const at = html.indexOf(marker);
    expect(at).toBeGreaterThan(-1);
    const around = html.slice(Math.max(0, at - 280), at);
    expect(around).toContain("mkReveal");
    expect(html).toContain("data-mk-numbered-steps");
    expect(html.indexOf("data-mk-numbered-steps")).toBeLessThan(at);
  });
});

describe("canonical plan prices", () => {
  it("keeps GST-inclusive production amounts in one source", () => {
    expect(PLAN_PRICES.essential.monthlyAudInclGst).toBe(79);
    expect(PLAN_PRICES.essential.annualAudInclGst).toBe(790);
    expect(PLAN_PRICES.essential.includedLocations).toBe(1);
    expect(PLAN_PRICES.essential.customGuides).toBe(2);
    expect(PLAN_PRICES.practice.monthlyAudInclGst).toBe(149);
    expect(PLAN_PRICES.practice.annualAudInclGst).toBe(1490);
    expect(PLAN_PRICES.practice.includedLocations).toBe(1);
    expect(PLAN_PRICES.practice.customGuides).toBe(30);
    expect(PLAN_PRICES.practice.secondLocation.monthlyAudInclGst).toBe(79);
    expect(PLAN_PRICES.practice.secondLocation.annualAudInclGst).toBe(790);
    expect(PLAN_PRICES.practice.additionalLocation.monthlyAudInclGst).toBe(59);
    expect(PLAN_PRICES.practice.additionalLocation.annualAudInclGst).toBe(590);
    expect(formatAudInclGst(1490)).toBe("A$1,490");
    expect(JSON.stringify(PLAN_PRICES)).not.toContain("298");
  });

  it("describes Essential custom-guide authoring and Practice template adaptation", () => {
    expect([...LAUNCH_PLANS[0].features]).toEqual([
      "1 practice / location",
      "River Aftercare guide templates",
      "Create and edit up to 2 custom clinic guides",
      "Branded patient aftercare pages",
      "Logo, colours and curated typography",
      "Permanent guide URLs",
      "QR-ready sharing",
      "Print / Save PDF",
      "Clinic contact and emergency information",
      "Light, Dark and System patient presentation",
    ]);
    expect(LAUNCH_PLANS[0].features).not.toContain(
      "Up to 2 custom clinic guides"
    );
    expect([...LAUNCH_PLANS[1].features]).toEqual([
      "Everything in Essential",
      "Up to 30 custom clinic guides",
      "Adapt River Aftercare templates to suit your clinic",
      "Assisted setup",
    ]);
    expect(LAUNCH_PLANS[1].features).not.toContain(
      "Create and edit your own aftercare guides"
    );
    expect(LAUNCH_PLANS[1].features).not.toContain(
      "Add clinic-specific instructions"
    );
    expect(LAUNCH_PLANS[1].features).not.toContain(
      "Guide and section controls"
    );
    expect([...LAUNCH_PLANS[2].features]).toEqual([
      "Coordinated rollout across practices",
      "Custom onboarding",
      "Priority support",
      "Tailored account setup",
    ]);
  });
});
