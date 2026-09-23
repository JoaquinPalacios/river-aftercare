import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { commercialOfferSummary } from "@/lib/billing/offer-display";

describe("billing setup UI", () => {
  it("uses canonical plan prices and annual saving language", () => {
    expect(commercialOfferSummary("ESSENTIAL", "MONTHLY").priceLabel).toBe(
      "A$79 / month"
    );
    expect(commercialOfferSummary("ESSENTIAL", "YEARLY")).toMatchObject({
      priceLabel: "A$790 / year",
      annualNote: "2 months free",
    });
    expect(commercialOfferSummary("PRACTICE", "MONTHLY").priceLabel).toBe(
      "A$149 / month"
    );
    expect(commercialOfferSummary("PRACTICE", "YEARLY")).toMatchObject({
      priceLabel: "A$1,490 / year",
      annualNote: "2 months free",
    });
  });

  it("keeps the Terms checkbox unchecked and links the legal pages", () => {
    const form = readFileSync(
      "app/(staff)/account/billing/setup/billing-setup-form.tsx",
      "utf8"
    );
    expect(form).toContain("No ABN?");
    expect(form).toContain("Use ABN instead");
    expect(form).toContain("I agree to the");
    expect(form).toContain("Terms & Conditions");
    expect(form).toContain("Privacy Policy");
    expect(form).toContain("termsHref");
    expect(form).toContain("privacyHref");
    expect(form).toContain('name="termsAccepted"');
    expect(form).not.toContain("defaultChecked");
    expect(form).not.toContain("checked={true}");
    expect(form).toContain("Continue to secure payment");
    expect(form).toContain("Contact River Aftercare");
    expect(form).not.toContain("@/lib/billing");
  });

  it("gives the billing setup page 4rem of shell bottom padding", () => {
    const page = readFileSync(
      "app/(staff)/account/billing/setup/page.tsx",
      "utf8"
    );
    const css = readFileSync("app/(staff)/staff.css", "utf8");
    expect(page).toContain("staffBillingSetup");
    expect(css).toContain(".staffAppContent:has(.staffBillingSetup)");
    expect(css).toMatch(
      /\.staffAppContent:has\(\.staffBillingSetup\)\s*\{[^}]*padding-bottom:\s*4rem;/
    );
    expect(css).toMatch(/\.staffAppContent\s*\{[^}]*padding:\s*2rem 1rem;/);
  });

  it("does not add Buy now to public pricing", () => {
    const pricing = readFileSync(
      "app/(marketing)/%5Fmarketing/pricing/page.tsx",
      "utf8"
    );
    expect(pricing.toLowerCase()).not.toContain("buy now");
  });
});
