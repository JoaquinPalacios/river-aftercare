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
  loadOverviewBillingNotices: vi.fn(),
}));

import { loadBillingPageContext } from "@/app/(staff)/account/billing/billing-context";
import BillingStatusPage from "@/app/(staff)/account/billing/page";
import { BillingNotice } from "@/app/(staff)/components/billing-notice";
import ClinicOverviewPage from "@/app/(staff)/(clinic-portal)/dashboard/page";
import { requireStaffSession } from "@/lib/auth/require-staff-session";
import { loadOverviewBillingNotices } from "@/lib/billing/notices/load";
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
    vi.mocked(loadOverviewBillingNotices).mockReset();
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

  it("renders the price-change action and a restrained past-due warning", () => {
    const price = renderToStaticMarkup(<BillingNotice notice={priceNotice} />);
    const payment = renderToStaticMarkup(
      <BillingNotice
        notice={{
          id: "payment_issue",
          severity: "past_due",
          title: "Payment needs attention",
          body: "We couldn't collect your latest subscription payment. Please review your billing details to avoid an interruption to your service.",
          actionLabel: "Manage billing",
          actionHref: "/account/billing",
        }}
      />
    );
    const unpaid = renderToStaticMarkup(
      <BillingNotice
        notice={{
          id: "payment_issue",
          severity: "unpaid",
          title: "Payment is unpaid",
          body: "Clinic editing is paused.",
          actionLabel: "Manage billing",
          actionHref: "/account/billing",
        }}
      />
    );

    expect(price).toContain("Review price change");
    expect(price).toContain('href="/account/billing#price-change"');
    expect(price).toContain('role="status"');
    expect(payment).toContain("Payment needs attention");
    expect(payment).toContain("Manage billing");
    expect(payment).toContain('href="/account/billing"');
    expect(payment).toContain("bg-staff-warning-surface");
    expect(payment).toContain("border-staff-warning-line");
    expect(payment).toContain("min-w-0");
    expect(payment).toContain("sm:px-5");
    expect(payment).toContain('role="region"');
    expect(payment).toContain('aria-labelledby="billing-notice-payment_issue"');
    expect(payment).toContain("focus-visible:outline-staff-brand");
    expect(payment).not.toContain("border-l-staff-danger");
    expect(payment).not.toContain("<button");
    expect(payment).not.toContain("Dismiss");
    expect(payment).not.toMatch(/suspend/i);
    expect(unpaid).toContain("border-l-staff-danger");
    expect(unpaid).toContain("Clinic editing is paused.");
    expect(price).not.toContain("bg-staff-warning-surface");
  });

  it("shows a past-due notice ahead of an annual reminder", () => {
    const html = renderToStaticMarkup(
      <>
        <BillingNotice
          notice={{
            id: "payment_issue",
            severity: "past_due",
            title: "Payment needs attention",
            body: "We couldn't collect your latest subscription payment.",
            actionLabel: "Manage billing",
            actionHref: "/account/billing",
          }}
        />
        <BillingNotice notice={annualNotice} />
      </>
    );
    expect(html.indexOf("Payment needs attention")).toBeLessThan(
      html.indexOf("Your Practice subscription renews")
    );
    expect(html).toContain('data-notice="payment_issue"');
    expect(html).toContain('data-notice="annual_renewal"');
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
    vi.mocked(loadOverviewBillingNotices).mockResolvedValue([annualNotice]);

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
    vi.mocked(loadOverviewBillingNotices).mockResolvedValue([]);

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
        paymentRecovery: {
          severity: "past_due" as const,
          title: "Payment needs attention",
          body: "We couldn't collect your latest subscription payment. Please review your billing details to avoid an interruption to your service.",
          planLabel: "Practice",
          intervalLabel: "Monthly" as const,
          stateLabel: "Payment issue",
          outstandingAmountLabel: null,
          failedPaymentLabel: null,
          instructions:
            "Update the payment method in Stripe and review any open invoice there. Opening Stripe does not clear this notice.",
        },
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
    expect(adminHtml).toContain("Payment needs attention");
    expect(adminHtml).toContain('data-payment-recovery="past_due"');
    expect(adminHtml).toContain("Manage billing");
    expect(adminHtml).toContain("w-full");
    expect(adminHtml).toContain("sm:w-auto");
    expect(adminHtml).toContain('role="region"');
    expect(adminHtml).not.toContain("Outstanding");
    expect(adminHtml).not.toContain("Pay invoice");
    expect(adminHtml).not.toContain("Dismiss");
    expect(adminHtml).not.toMatch(/suspend/i);
    expect(adminHtml.indexOf("Payment needs attention")).toBeLessThan(
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
    expect(staffHtml).not.toContain("Payment needs attention");
    expect(staffHtml).not.toContain("data-payment-recovery");
    expect(staffHtml).not.toContain("Manage billing");
    expect(staffHtml).toContain("Practice");
  });

  it("reports when Stripe billing cannot be opened and does not offer a pay button", async () => {
    vi.mocked(loadBillingPageContext).mockResolvedValue({
      userId: "user_admin",
      membership: { role: "ADMIN", source: "membership" },
      contactHref: "/contact",
      termsHref: "/terms",
      privacyHref: "/privacy",
      view: {
        clinicName: "Harbour Dental",
        presentation: {
          kind: "active",
          productAccess: true,
          assistedSetup: false,
          planName: "Practice",
          intervalLabel: "Monthly",
          attention: "past_due",
          attentionMessage:
            "We couldn't collect your latest subscription payment.",
        },
        summary: null,
        billingLabel: "Active",
        planLabel: "Practice",
        intervalLabel: "Monthly",
        paidThroughLabel: null,
        periodLabel: "Next renewal",
        portalEligible: false,
        entitlementStatus: "ACTIVE",
        billingStatus: "PAST_DUE",
        publicGuideRetentionLabel: null,
        scheduledPlanChange: null,
        guideSelection: null,
        identity: null,
        commercialDetail: {
          currentPriceLabel: null,
          periodEndLabel: null,
          nextRenewalLabel: null,
          annualReminder: null,
          priceChange: null,
          paymentRecovery: {
            severity: "past_due",
            title: "Payment needs attention",
            body: "We couldn't collect your latest subscription payment.",
            planLabel: "Practice",
            intervalLabel: "Monthly",
            stateLabel: "Payment issue",
            outstandingAmountLabel: null,
            failedPaymentLabel: null,
            instructions:
              "Update the payment method in Stripe and review any open invoice there.",
          },
        },
      },
    } as unknown as Awaited<ReturnType<typeof loadBillingPageContext>>);

    const html = renderToStaticMarkup(await BillingStatusPage());
    expect(html).toContain("Stripe billing cannot be opened");
    expect(html).not.toContain("Manage billing");
    expect(html).not.toContain("Pay invoice");
    expect(html).not.toContain("Outstanding");
  });
});
