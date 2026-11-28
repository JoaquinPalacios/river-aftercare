import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(staff)/account/billing/actions", () => ({
  continueToSecurePaymentAction: async () => ({}),
  confirmDowngradeGuideSelectionAction: async () => ({}),
  openCustomerPortalAction: async () => ({}),
}));

vi.mock("@/app/(staff)/account/billing/billing-context", () => ({
  loadBillingPageContext: vi.fn(),
}));

import { loadBillingPageContext } from "@/app/(staff)/account/billing/billing-context";
import BillingCompletePage from "@/app/(staff)/account/billing/complete/page";
import BillingStatusPage from "@/app/(staff)/account/billing/page";
import { BillingSetupForm } from "@/app/(staff)/account/billing/setup/billing-setup-form";
import { CATALOGUE_TRIAL_DISCLOSURE } from "@/lib/billing/trial";

const trialView = {
  clinicName: "Harbour Dental",
  presentation: {
    kind: "active" as const,
    productAccess: true as const,
    assistedSetup: false,
    planName: "Essential",
    intervalLabel: "Monthly",
    attention: null,
    attentionMessage: null,
    trial: {
      phase: "in_trial" as const,
      endsAt: new Date("2026-11-15T00:00:00.000Z"),
      message:
        "Your free trial includes full access until 15 November 2026. The first subscription charge of A$49 per month is scheduled for that date. That price continues for each following billing period unless you cancel from Billing before the trial ends.",
    },
  },
  summary: null,
  billingLabel: "Free trial",
  planLabel: "Essential",
  intervalLabel: "Monthly",
  paidThroughLabel: "15 November 2026",
  periodLabel: "Trial ends",
  catalogueTrialDisclosure: true,
  portalEligible: true,
  entitlementStatus: "ACTIVE",
  billingStatus: "TRIALING",
  publicGuideRetentionLabel: null,
  scheduledPlanChange: null,
  commercialDetail: {
    currentPriceLabel: "A$49 per month",
    annualReminder: null,
    priceChange: null,
  },
  guideSelection: null,
  selfServeDowngrade: null,
  identity: null,
  complimentary: null,
  negotiatedOffer: null,
};

describe("catalogue trial billing copy", () => {
  it("shows a free trial on the billing page and does not call it a renewal", async () => {
    vi.mocked(loadBillingPageContext).mockResolvedValue({
      userId: "user_1",
      membership: { role: "ADMIN", source: "membership" },
      contactHref: "/contact",
      termsHref: "/terms",
      privacyHref: "/privacy",
      view: trialView,
    } as unknown as Awaited<ReturnType<typeof loadBillingPageContext>>);

    const html = renderToStaticMarkup(await BillingStatusPage());
    expect(html).toContain("Free trial");
    expect(html).toContain("Trial ends");
    expect(html).toContain("15 November 2026");
    expect(html).toContain("first subscription charge of A$49 per month");
    expect(html).not.toContain("You will not be charged");
    expect(html).not.toContain("Next renewal");
    expect(html).not.toContain("Paid through");
  });

  it("says the trial has started on the Checkout return page", async () => {
    vi.mocked(loadBillingPageContext).mockResolvedValue({
      userId: "user_1",
      membership: { role: "ADMIN", source: "membership" },
      contactHref: "/contact",
      termsHref: "/terms",
      privacyHref: "/privacy",
      view: trialView,
    } as unknown as Awaited<ReturnType<typeof loadBillingPageContext>>);

    const html = renderToStaticMarkup(await BillingCompletePage());
    expect(html).toContain("Your River Aftercare free trial has started.");
    expect(html).toContain("Go to dashboard");
    expect(html).not.toContain("Your River Aftercare subscription is active.");
    expect(html).not.toContain("You will not be charged");
  });

  it("discloses the trial on catalogue setup and not on a negotiated offer", () => {
    const defaults = {
      legalEntityName: "Harbour Dental Pty Ltd",
      tradingName: "Harbour Dental",
      billingContactName: "Ada Admin",
      billingEmail: "accounts@example.com",
      addressLine1: "10 River Street",
      addressLine2: "",
      city: "Tweed Heads",
      region: "NSW",
      postalCode: "2486",
      country: "AU",
      businessNumberKind: "none" as const,
      abn: "",
      acn: "",
    };
    const catalogue = renderToStaticMarkup(
      <BillingSetupForm
        clinicName="Harbour Dental"
        planName="Essential"
        priceLabel="A$49 per month"
        annualNote={null}
        contactHref="/contact"
        termsHref="/terms"
        privacyHref="/privacy"
        regions={[{ value: "NSW", label: "New South Wales" }]}
        defaults={defaults}
        cancelMessage={null}
        trialNote={CATALOGUE_TRIAL_DISCLOSURE}
      />
    );
    expect(catalogue).toContain("14 days of River Aftercare");
    expect(catalogue).toContain("card or Australian bank debit");
    expect(catalogue).toContain('name="termsAccepted"');
    expect(catalogue).not.toContain("coupon");

    const negotiated = renderToStaticMarkup(
      <BillingSetupForm
        clinicName="Harbour Dental"
        planName="Essential"
        priceLabel="A$40 per month"
        annualNote={null}
        contactHref="/contact"
        termsHref="/terms"
        privacyHref="/privacy"
        regions={[{ value: "NSW", label: "New South Wales" }]}
        defaults={defaults}
        cancelMessage={null}
        trialNote={CATALOGUE_TRIAL_DISCLOSURE}
        negotiatedTerms={{
          terms: "Negotiated price.",
          policyLabel: "This price stays until a later written change.",
        }}
      />
    );
    expect(negotiated).not.toContain("14 days of River Aftercare");
    expect(negotiated).toContain('name="acceptNegotiatedTerms"');
  });

  it("keeps the terms links and drops the duplicate checkbox after registration", () => {
    const html = renderToStaticMarkup(
      <BillingSetupForm
        clinicName="Harbour Dental"
        planName="Essential"
        priceLabel="A$49 per month"
        annualNote={null}
        contactHref="/contact"
        termsHref="/terms"
        privacyHref="/privacy"
        regions={[{ value: "NSW", label: "New South Wales" }]}
        defaults={{
          legalEntityName: "",
          tradingName: "Harbour Dental",
          billingContactName: "River Owner",
          billingEmail: "owner@example.com",
          addressLine1: "",
          addressLine2: "",
          city: "",
          region: "",
          postalCode: "",
          country: "AU",
          businessNumberKind: "none",
          abn: "",
          acn: "",
        }}
        cancelMessage={null}
        trialNote={CATALOGUE_TRIAL_DISCLOSURE}
        priorTermsAcceptance={{ source: "REGISTRATION" }}
      />
    );

    expect(html).toContain("when you registered this clinic");
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    expect(html).not.toContain('name="termsAccepted"');
    expect(html).toContain("Continue to secure payment");
    expect(html).toContain("14 days of River Aftercare");
    expect(html).toContain('value="River Owner"');
    expect(html).toContain('value="owner@example.com"');
    expect(html).toMatch(/name="legalEntityName"[^>]*value=""/);
  });
});
