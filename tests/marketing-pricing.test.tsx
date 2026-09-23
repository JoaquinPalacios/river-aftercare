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
  PLAN_COMPARISON_CONTROL_LABEL,
  PLAN_COMPARISON_PANEL_ID,
  PLAN_COMPARISON_ROWS,
  PLAN_COMPARISON_SUPPORT_FEATURE,
  PLAN_PRICES,
  PRICING_NOTES,
  PRICING_PRIORITY_SUPPORT_LABEL,
  PRICING_SHARING_FEATURE_LABEL,
  PRICING_STANDARD_SUPPORT_LABEL,
  PRICING_TYPOGRAPHY_FEATURE_LABEL,
} from "@/lib/marketing/plans";

const UNSUPPORTED_SUPPORT_COPY = [
  "same-day support",
  "24-hour response",
  "2-hour response",
  "dedicated support",
  "guaranteed turnaround",
  "24/7 support",
  "emergency support",
  "clinical support",
  "phone support",
  "dedicated account management",
  "Premium support",
  "VIP support",
  "Enterprise support",
  "Account manager",
] as const;

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
    const noteGridRule = styles.slice(
      styles.indexOf("  .noteGrid {"),
      styles.indexOf("  .contactFormRow {")
    );
    expect(noteGridRule).toContain(
      "grid-template-columns: repeat(3, minmax(0, 1fr))"
    );
    expect(styles).toContain(".planFootnote");
    expect(styles).toContain(".planCompare");
    expect(styles).toContain(".planCompareTrigger");
    expect(styles).toContain("min-height: 2.75rem");
    const compareCss = styles.slice(
      styles.indexOf(".planCompare {"),
      styles.indexOf(".noteCard,")
    );
    expect(compareCss).not.toContain("overflow-x: auto");
    expect(compareCss).not.toContain("overflow-x: scroll");
    expect(compareCss).toContain("display: block");
    expect(compareCss).toContain("@media (min-width: 64rem)");
    expect(compareCss).toContain("display: table");
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
    expect(html).toContain("All prices are in Australian dollars.");
    expect(html).not.toContain("All prices include GST.");
    expect(html).not.toContain("GST included");
    expect(html).not.toContain("include GST");
    expect(html).not.toContain("includes GST");
    expect(html).not.toContain("plus GST");
    expect(html).not.toMatch(/\bGST\b/);
    expect(html).toContain("2 months free");
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
    expect(html).toContain("Up to 2 clinic team members");
    expect(html).toContain("Up to 5 clinic team members");
    expect(html).not.toContain("active custom");
    expect(html).toContain(
      "Multi-location practice? Talk to us about your setup."
    );
    expect(html).not.toContain("Need a larger guide library? Talk to us.");
    expect(html).not.toContain("Create and adapt clinic aftercare");
    expect(html).not.toContain("Guide and section controls");
    expect(html).not.toContain("Local clinic instructions");
    expect(html).not.toContain("Create and edit your own aftercare guides");
    expect(html).toContain("Edit up to 2 River Aftercare templates");
    expect(html).toContain("Edit up to 30 River Aftercare templates");
    expect(html).toContain("Up to 4 clinic-owned guides in total");
    expect(html).toContain("Up to 40 clinic-owned guides in total");
    expect(html).not.toContain("Add clinic-specific instructions");
    expect(html).not.toContain("Richer branding");
    expect(html).not.toContain("hide River Aftercare attribution");
    expect(html).not.toContain("Shared guides");
    expect(html).toContain(PRICING_TYPOGRAPHY_FEATURE_LABEL);
    expect(html).toContain(PRICING_SHARING_FEATURE_LABEL);
    expect(html).toContain("Durable patient guide URLs");
    expect(html).not.toContain("Permanent guide URLs");
    expect(html).not.toContain("named seats");
    expect(html).not.toContain("per-seat");
    expect(html).not.toContain("extra seat");
    expect(html).not.toContain("users billed separately");
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
    const groupBlock = html.slice(
      html.indexOf('id="plan-group"'),
      html.indexOf('id="pricing-typography-note"')
    );
    const comparisonBlock = html.slice(html.indexOf("data-mk-plan-comparison"));
    expect(essentialBlock).toContain("1 practice / location");
    expect(essentialBlock).toContain("River Aftercare guide templates");
    expect(essentialBlock).toContain(
      "Create and edit up to 2 custom clinic guides"
    );
    expect(essentialBlock).not.toContain(">Up to 2 custom clinic guides<");
    expect(essentialBlock).toContain("Up to 2 clinic team members");
    expect(essentialBlock).toContain(PRICING_TYPOGRAPHY_FEATURE_LABEL);
    expect(essentialBlock).toContain(PRICING_SHARING_FEATURE_LABEL);
    expect(essentialBlock).toContain('<sup aria-hidden="true">*</sup>');
    expect(essentialBlock).toContain('href="#pricing-typography-note"');
    expect(essentialBlock).not.toContain("Permanent guide URLs");
    expect(essentialBlock).not.toContain("QR-ready sharing");
    expect(essentialBlock).not.toContain("Print / Save PDF");
    expect(essentialBlock).not.toContain(
      "Clinic contact and emergency information"
    );
    expect(essentialBlock).not.toContain(
      "Light, Dark and System patient presentation"
    );
    expect(essentialBlock).not.toContain("Branded patient aftercare pages");
    expect(essentialBlock).not.toContain("Patient check-ins");
    expect(essentialBlock).not.toContain("Connected aftercare");
    expect(essentialBlock).not.toContain("Additional locations");
    expect(practiceBlock).toContain("Everything in Essential");
    expect(practiceBlock).toContain("Up to 30 custom clinic guides");
    expect(practiceBlock).toContain("Edit up to 30 River Aftercare templates");
    expect(practiceBlock).toContain("Up to 40 clinic-owned guides in total");
    expect(practiceBlock).toContain("Up to 5 clinic team members");
    expect(practiceBlock).toContain("Assisted setup");
    expect(practiceBlock).toContain(PRICING_PRIORITY_SUPPORT_LABEL);
    expect(practiceBlock).not.toContain(PRICING_STANDARD_SUPPORT_LABEL);
    expect(essentialBlock).not.toContain(PRICING_STANDARD_SUPPORT_LABEL);
    expect(essentialBlock).not.toContain(PRICING_PRIORITY_SUPPORT_LABEL);
    expect(groupBlock).not.toContain(PRICING_STANDARD_SUPPORT_LABEL);
    expect(practiceBlock).not.toContain(
      "Create and edit your own aftercare guides"
    );
    expect(practiceBlock).not.toContain("Add clinic-specific instructions");
    expect(practiceBlock).not.toContain("Create and adapt clinic aftercare");
    expect(practiceBlock).not.toContain("Guide and section controls");
    expect(practiceBlock).not.toContain("Local clinic instructions");
    expect(practiceBlock).not.toContain(PRICING_TYPOGRAPHY_FEATURE_LABEL);
    expect(practiceBlock).toContain(
      "Multi-location practice? Talk to us about your setup."
    );
    expect(practiceBlock).not.toContain("Need a larger guide library");
    expect(practiceBlock).not.toContain("A$59");
    expect(practiceBlock).not.toContain("A$590");
    expect(groupBlock).toContain("Custom pricing");
    expect(groupBlock).not.toContain("A$");
    expect(groupBlock).toContain("Talk to us");
    expect(groupBlock).toContain(
      "For organisations that need coordinated rollout and tailored support across their practices."
    );
    expect(groupBlock).not.toContain("central management");
    expect(groupBlock).toContain("Coordinated rollout across practices");
    expect(groupBlock).toContain("Custom onboarding");
    expect(groupBlock).toContain("Priority support");
    expect(groupBlock).toContain("Tailored account setup");
    expect(groupBlock).not.toContain("central permissions");
    expect(groupBlock).not.toContain("master guide governance");
    expect(html).toContain('data-plan-card="essential"');
    expect(html).toContain('data-plan-card="practice"');
    expect(html).toContain('data-plan-card="group"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(`aria-controls="${PLAN_COMPARISON_PANEL_ID}"`);
    expect(html).toMatch(
      new RegExp(`id="${PLAN_COMPARISON_PANEL_ID}"[^>]*\\bhidden\\b`)
    );
    expect(comparisonBlock).toContain("Custom clinic guides");
    expect(comparisonBlock).toContain("Clinic team members");
    expect(comparisonBlock).toContain("Up to 2");
    expect(comparisonBlock).toContain("Up to 30");
    expect(comparisonBlock).toContain("Up to 5");
    expect(comparisonBlock).toContain("Editable River Aftercare templates");
    expect(comparisonBlock).toContain("Up to 40");
    expect(comparisonBlock).toContain("Print / Save PDF");
    expect(comparisonBlock).toContain("QR sharing");
    expect(comparisonBlock).toContain(
      "Clinic contact and emergency information"
    );
    expect(comparisonBlock).toContain(
      "Light / Dark / System patient presentation"
    );
    expect(comparisonBlock).toContain("Branded patient aftercare pages");
    expect(comparisonBlock).toContain("Durable patient guide URLs");
    expect(comparisonBlock).not.toContain("Permanent guide URLs");
    expect(comparisonBlock).not.toContain("central permissions");
    expect(comparisonBlock).not.toContain("master guide governance");
    expect(comparisonBlock).not.toContain("named-seat");
    expect(comparisonBlock).toContain('data-comparison-row="support"');
    expect(comparisonBlock).not.toContain(
      'data-comparison-row="priority-support"'
    );
    expect(comparisonBlock).toContain(
      `scope="row">${PLAN_COMPARISON_SUPPORT_FEATURE}<`
    );
    expect(comparisonBlock).toContain(PRICING_STANDARD_SUPPORT_LABEL);
    expect(comparisonBlock).toContain(PRICING_PRIORITY_SUPPORT_LABEL);
    for (const copy of UNSUPPORTED_SUPPORT_COPY) {
      expect(html.toLowerCase()).not.toContain(copy.toLowerCase());
    }
    expect(html).not.toMatch(/\bSLA\b/);
    expect(html).not.toContain("self-serve billing");
    expect(html).not.toContain("Stripe");
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
  it("keeps advertised production amounts in one source", () => {
    expect(PLAN_PRICES.essential.monthlyAudInclGst).toBe(79);
    expect(PLAN_PRICES.essential.annualAudInclGst).toBe(790);
    expect(PLAN_PRICES.essential.includedLocations).toBe(1);
    expect(PLAN_PRICES.essential.customGuides).toBe(2);
    expect(PLAN_PRICES.essential.clinicTeamMembers).toBe(2);
    expect(PLAN_PRICES.practice.monthlyAudInclGst).toBe(149);
    expect(PLAN_PRICES.practice.annualAudInclGst).toBe(1490);
    expect(PLAN_PRICES.practice.includedLocations).toBe(1);
    expect(PLAN_PRICES.practice.customGuides).toBe(30);
    expect(PLAN_PRICES.practice.clinicTeamMembers).toBe(5);
    expect(PLAN_PRICES.practice.secondLocation.monthlyAudInclGst).toBe(79);
    expect(PLAN_PRICES.practice.secondLocation.annualAudInclGst).toBe(790);
    expect(PLAN_PRICES.practice.additionalLocation.monthlyAudInclGst).toBe(59);
    expect(PLAN_PRICES.practice.additionalLocation.annualAudInclGst).toBe(590);
    expect(formatAudInclGst(1490)).toBe("A$1,490");
    expect(JSON.stringify(PLAN_PRICES)).not.toContain("298");
    expect(PRICING_NOTES.map((note) => note.title)).toEqual([
      "Annual billing",
      "Assisted onboarding",
      "Current product scope",
    ]);
    expect(JSON.stringify(PRICING_NOTES)).not.toMatch(/GST/i);
  });

  it("describes Essential custom-guide authoring and Practice template adaptation", () => {
    expect([...LAUNCH_PLANS[0].features]).toEqual([
      "1 practice / location",
      "River Aftercare guide templates",
      "Create and edit up to 2 custom clinic guides",
      "Edit up to 2 River Aftercare templates",
      "Up to 4 clinic-owned guides in total",
      "Up to 2 clinic team members",
      "Clinic branding and curated typography",
      "QR sharing, PDF and durable patient guide URLs",
    ]);
    expect(LAUNCH_PLANS[0].features).not.toContain(
      "Up to 2 custom clinic guides"
    );
    expect(LAUNCH_PLANS[0].features).not.toContain(
      PRICING_STANDARD_SUPPORT_LABEL
    );
    expect(LAUNCH_PLANS[0].features).not.toContain(
      PRICING_PRIORITY_SUPPORT_LABEL
    );
    expect([...LAUNCH_PLANS[1].features]).toEqual([
      "Everything in Essential",
      "Up to 30 custom clinic guides",
      "Edit up to 30 River Aftercare templates",
      "Up to 40 clinic-owned guides in total",
      "Up to 5 clinic team members",
      "Assisted setup",
      PRICING_PRIORITY_SUPPORT_LABEL,
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
    expect(LAUNCH_PLANS[2].position).toBe(
      "For organisations that need coordinated rollout and tailored support across their practices."
    );
    expect(LAUNCH_PLANS[2].position).not.toContain("central management");
    expect(LAUNCH_PLANS[0].features).toHaveLength(8);
    expect(LAUNCH_PLANS[1].features).toHaveLength(7);
    expect(LAUNCH_PLANS[2].features).toHaveLength(4);
  });

  it("keeps comparison rows aligned with advertised plan limits", () => {
    const guides = PLAN_COMPARISON_ROWS.find(
      (row) => row.id === "custom-guides"
    );
    const team = PLAN_COMPARISON_ROWS.find(
      (row) => row.id === "clinic-team-members"
    );
    const adapt = PLAN_COMPARISON_ROWS.find(
      (row) => row.id === "adapt-templates"
    );
    const locations = PLAN_COMPARISON_ROWS.find(
      (row) => row.id === "locations"
    );
    const urls = PLAN_COMPARISON_ROWS.find((row) => row.id === "durable-urls");
    const qr = PLAN_COMPARISON_ROWS.find((row) => row.id === "qr-sharing");
    const pdf = PLAN_COMPARISON_ROWS.find((row) => row.id === "print-pdf");
    const contact = PLAN_COMPARISON_ROWS.find(
      (row) => row.id === "clinic-contact"
    );
    const theme = PLAN_COMPARISON_ROWS.find(
      (row) => row.id === "patient-presentation"
    );
    const support = PLAN_COMPARISON_ROWS.find((row) => row.id === "support");
    const groupCopy = PLAN_COMPARISON_ROWS.map((row) => row.group.label).join(
      "\n"
    );

    expect(guides?.essential.label).toBe(
      `Up to ${PLAN_PRICES.essential.customGuides}`
    );
    expect(guides?.practice.label).toBe(
      `Up to ${PLAN_PRICES.practice.customGuides}`
    );
    expect(team?.essential.label).toBe(
      `Up to ${PLAN_PRICES.essential.clinicTeamMembers}`
    );
    expect(team?.practice.label).toBe(
      `Up to ${PLAN_PRICES.practice.clinicTeamMembers}`
    );
    expect(locations?.essential.label).toBe(
      String(PLAN_PRICES.essential.includedLocations)
    );
    expect(locations?.practice.label).toBe(
      String(PLAN_PRICES.practice.includedLocations)
    );
    expect(adapt?.essential).toEqual({
      kind: "text",
      label: `Up to ${PLAN_PRICES.essential.editableTemplates}`,
    });
    expect(adapt?.practice).toEqual({
      kind: "text",
      label: `Up to ${PLAN_PRICES.practice.editableTemplates}`,
    });
    const combined = PLAN_COMPARISON_ROWS.find(
      (row) => row.id === "combined-guides"
    );
    expect(combined?.essential.label).toBe(
      `Up to ${PLAN_PRICES.essential.combinedClinicOwnedGuides}`
    );
    expect(combined?.practice.label).toBe(
      `Up to ${PLAN_PRICES.practice.combinedClinicOwnedGuides}`
    );
    expect(urls?.feature).toBe("Durable patient guide URLs");
    expect(qr?.feature).toBe("QR sharing");
    expect(pdf?.feature).toBe("Print / Save PDF");
    expect(contact?.feature).toBe("Clinic contact and emergency information");
    expect(theme?.feature).toBe("Light / Dark / System patient presentation");
    expect(support?.feature).toBe(PLAN_COMPARISON_SUPPORT_FEATURE);
    expect(support?.essential).toEqual({
      kind: "text",
      label: PRICING_STANDARD_SUPPORT_LABEL,
    });
    expect(support?.practice).toEqual({
      kind: "text",
      label: PRICING_PRIORITY_SUPPORT_LABEL,
    });
    expect(support?.group).toEqual({
      kind: "text",
      label: PRICING_PRIORITY_SUPPORT_LABEL,
    });
    expect(
      PLAN_COMPARISON_ROWS.some((row) => row.id === "priority-support")
    ).toBe(false);
    expect(JSON.stringify(LAUNCH_PLANS)).not.toContain("Permanent guide URLs");
    expect(JSON.stringify(PLAN_COMPARISON_ROWS)).not.toContain(
      "Permanent guide URLs"
    );
    expect(groupCopy).not.toMatch(/central permissions/i);
    expect(groupCopy).not.toMatch(/master guide governance/i);
    expect(groupCopy).not.toMatch(/hierarchy/i);
    expect(groupCopy).not.toMatch(/named-seat|per-seat|seats/i);
  });
});
