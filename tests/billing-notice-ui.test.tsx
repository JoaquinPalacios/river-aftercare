import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(staff)/account/billing/actions", () => ({
  confirmDowngradeGuideSelectionAction: async () => ({}),
  openCustomerPortalAction: async () => ({}),
}));

vi.mock("@/app/(staff)/account/billing/billing-context", () => ({
  loadBillingPageContext: vi.fn(),
}));

vi.mock("@/lib/auth/require-staff-session", () => ({
  requireStaffSession: vi.fn(),
}));

vi.mock("@/lib/clinic-portal/get-clinic-portal", () => ({
  getClinicPortalOverview: vi.fn(),
}));

vi.mock("@/lib/billing/notices/load", () => ({
  loadOverviewBillingNotice: vi.fn(),
}));

import { loadBillingPageContext } from "@/app/(staff)/account/billing/billing-context";
import BillingStatusPage from "@/app/(staff)/account/billing/page";
import { BillingNotice } from "@/app/(staff)/components/billing-notice";
import ClinicOverviewPage from "@/app/(staff)/(clinic-portal)/dashboard/page";
import { requireStaffSession } from "@/lib/auth/require-staff-session";
import { loadOverviewBillingNotice } from "@/lib/billing/notices/load";
import { getClinicPortalOverview } from "@/lib/clinic-portal/get-clinic-portal";

const annualNotice = {
  id: "annual_renewal" as const,
  title: "Your Practice subscription renews on 1 December 2026.",
  body: "Your next payment is A$1,490. Review your billing details or manage your subscription before renewal.",
  actionLabel: "View billing",
  actionHref: "/account/billing",
};

const priceNotice = {
  id: "price_increase" as const,
  title:
    "Your Practice subscription will change from A$149 to A$169 per month on 1 December 2026.",
  body: "You can cancel before this change takes effect. There is no cancellation penalty.",
  actionLabel: "Review price change",
  actionHref: "/account/billing#price-change",
};

describe("billing notice presentation", () => {
  beforeEach(() => {
    vi.mocked(loadBillingPageContext).mockReset();
    vi.mocked(requireStaffSession).mockReset();
    vi.mocked(getClinicPortalOverview).mockReset();
    vi.mocked(loadOverviewBillingNotice).mockReset();
  });

  it("renders a compact responsive annual notice without a dismiss control", () => {
    const html = renderToStaticMarkup(<BillingNotice notice={annualNotice} />);

    expect(html).toContain('data-notice="annual_renewal"');
    expect(html).toContain('role="status"');
    expect(html).toContain("min-w-0");
    expect(html).toContain("sm:px-5");
    expect(html).toContain(
      "Your Practice subscription renews on 1 December 2026."
    );
    expect(html).toContain('href="/account/billing"');
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Dismiss");
  });

  it("renders the price-change action and gives payment issues a distinct edge", () => {
    const price = renderToStaticMarkup(<BillingNotice notice={priceNotice} />);
    const payment = renderToStaticMarkup(
      <BillingNotice
        notice={{
          id: "payment_issue",
          title: "There’s a payment issue.",
          body: "Update the payment method.",
          actionLabel: "View billing",
          actionHref: "/account/billing",
        }}
      />
    );

    expect(price).toContain("Review price change");
    expect(price).toContain('href="/account/billing#price-change"');
    expect(payment).toContain("border-l-staff-danger");
    expect(payment).toContain('data-notice="payment_issue"');
    expect(price).not.toContain("border-l-staff-danger");
  });

  it("shows the overview notice to an administrator and withholds it from staff", async () => {
    vi.mocked(getClinicPortalOverview).mockResolvedValue({
      clinicId: "clinic_1",
      clinicName: "Harbour Dental",
      displayName: "Harbour Dental",
      slug: "harbour",
      patientSiteHref: null,
      publishedGuideCount: 2,
      draftGuideCount: 1,
      setup: [],
    });
    vi.mocked(requireStaffSession).mockResolvedValue({
      user: { id: "user_admin" },
      clinicMembership: {
        clinic: { id: "clinic_1" },
        role: "ADMIN",
        source: "membership",
      },
    } as Awaited<ReturnType<typeof requireStaffSession>>);
    vi.mocked(loadOverviewBillingNotice).mockResolvedValue(annualNotice);

    const adminHtml = renderToStaticMarkup(await ClinicOverviewPage());
    expect(adminHtml).toContain(
      "Your Practice subscription renews on 1 December 2026."
    );
    expect(adminHtml).toContain("Published guides");
    expect(adminHtml.indexOf("data-notice")).toBeLessThan(
      adminHtml.indexOf("Published guides")
    );

    vi.mocked(requireStaffSession).mockResolvedValue({
      user: { id: "user_staff" },
      clinicMembership: {
        clinic: { id: "clinic_1" },
        role: "STAFF",
        source: "membership",
      },
    } as Awaited<ReturnType<typeof requireStaffSession>>);
    vi.mocked(loadOverviewBillingNotice).mockResolvedValue(null);

    const staffHtml = renderToStaticMarkup(await ClinicOverviewPage());
    expect(staffHtml).not.toContain("A$1,490");
    expect(staffHtml).not.toContain("data-notice");
    expect(staffHtml).toContain("Published guides");
  });

  it("keeps the billing-page price change visible and hides commercial detail from staff", async () => {
    const view = {
      clinicName: "Harbour Dental",
      presentation: {
        kind: "active",
        productAccess: true,
        assistedSetup: false,
        planName: "Practice",
        intervalLabel: "Monthly",
        attention: "past_due",
        attentionMessage: "There is a payment issue.",
      },
      summary: null,
      billingLabel: "Active",
      planLabel: "Practice",
      intervalLabel: "Monthly",
      paidThroughLabel: "1 December 2026",
      periodLabel: "Next renewal",
      portalEligible: true,
      entitlementStatus: "ACTIVE",
      billingStatus: "PAST_DUE",
      publicGuideRetentionLabel: null,
      scheduledPlanChange: null,
      guideSelection: null,
      identity: null,
      commercialDetail: {
        currentPriceLabel: "A$149 per month",
        periodEndLabel: "1 December 2026",
        nextRenewalLabel: "1 December 2026",
        annualReminder: null,
        priceChange: {
          title: priceNotice.title,
          body: priceNotice.body,
          affectedLabel: "Practice",
          currentPriceLabel: "A$149 per month",
          newPriceLabel: "A$169 per month",
          effectiveLabel: "1 December 2026",
          intervalLabel: "Monthly",
          actionHref: "/account/billing#price-change",
        },
      },
    };

    vi.mocked(loadBillingPageContext).mockResolvedValue({
      userId: "user_admin",
      membership: { role: "ADMIN", source: "membership" },
      contactHref: "/contact",
      termsHref: "/terms",
      privacyHref: "/privacy",
      view,
    } as unknown as Awaited<ReturnType<typeof loadBillingPageContext>>);

    const adminHtml = renderToStaticMarkup(await BillingStatusPage());
    expect(adminHtml).toContain("A$149 per month");
    expect(adminHtml).toContain('id="price-change"');
    expect(adminHtml).toContain("Payment issue");
    expect(adminHtml).toContain("There is a payment issue.");
    expect(adminHtml).not.toContain("Dismiss");
    expect(adminHtml.indexOf("Payment issue")).toBeLessThan(
      adminHtml.indexOf('id="price-change"')
    );

    vi.mocked(loadBillingPageContext).mockResolvedValue({
      userId: "user_staff",
      membership: { role: "STAFF", source: "membership" },
      contactHref: "/contact",
      termsHref: "/terms",
      privacyHref: "/privacy",
      view,
    } as unknown as Awaited<ReturnType<typeof loadBillingPageContext>>);

    const staffHtml = renderToStaticMarkup(await BillingStatusPage());
    expect(staffHtml).not.toContain("A$149");
    expect(staffHtml).not.toContain("A$169");
    expect(staffHtml).not.toContain('id="price-change"');
    expect(staffHtml).not.toContain("Payment issue");
    expect(staffHtml).not.toContain("There is a payment issue.");
    expect(staffHtml).toContain("Practice");
  });
});
