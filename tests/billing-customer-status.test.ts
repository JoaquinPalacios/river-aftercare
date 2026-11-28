import { BillingStatus, EntitlementStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { billingSetupFormDefaults } from "@/lib/billing/billing-setup-defaults";
import {
  activeTrialAccessMessage,
  cancelledTrialAccessMessage,
  customerBillingPeriodLabel,
  customerBillingStatusLabel,
  customerBillingStatusTone,
  paymentConfirmationHeading,
  presentBillingReturn,
  type BillingReturnPresentation,
} from "@/lib/billing/billing-presentation";

const NOW = new Date("2026-11-28T00:00:00.000Z");
const TRIAL_END = new Date("2026-12-12T00:00:00.000Z");
const PAID_END = new Date("2027-01-12T00:00:00.000Z");

function labelFor(
  presentation: BillingReturnPresentation,
  showCommercialDetail = true,
  billingLabel = "Active"
) {
  return customerBillingStatusLabel({
    presentation,
    complimentaryLabel: null,
    showCommercialDetail,
    billingLabel,
  });
}

describe("customer billing status", () => {
  it("names an open trial, its first charge, and the recurring price", () => {
    const presentation = presentBillingReturn({
      entitlementStatus: EntitlementStatus.ACTIVE,
      billingStatus: BillingStatus.TRIALING,
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
      checkoutStarted: true,
      stripeSubscriptionId: "sub_trial",
      paidThrough: null,
      trialEndsAt: TRIAL_END,
      now: NOW,
      recurringPriceLabel: "A$49 per month",
    });

    expect(labelFor(presentation)).toBe("Free trial");
    expect(
      customerBillingStatusTone({ label: "Free trial", presentation })
    ).toBe("success");
    expect(presentation.kind).toBe("active");
    if (presentation.kind !== "active") {
      return;
    }
    expect(presentation.trial?.message).toBe(
      activeTrialAccessMessage({
        endsAt: TRIAL_END,
        recurringPriceLabel: "A$49 per month",
      })
    );
    expect(presentation.trial?.message).toContain("12 December 2026");
    expect(presentation.trial?.message).toContain("A$49 per month");
    expect(presentation.trial?.message).toContain("first subscription charge");
    expect(presentation.trial?.message).not.toContain(
      "You will not be charged"
    );
    expect(presentation.trial?.message).not.toContain("has been cancelled");
    expect(presentation.attentionMessage).toBeNull();
    expect(
      customerBillingPeriodLabel({
        presentation,
        cancelAtPeriodEnd: false,
        complimentary: false,
      })
    ).toBe("Trial ends");
    expect(paymentConfirmationHeading(presentation)).toBe(
      "Your River Aftercare free trial has started."
    );
  });

  it("describes a cancelled trial that still has access", () => {
    const presentation = presentBillingReturn({
      entitlementStatus: EntitlementStatus.ACTIVE,
      billingStatus: BillingStatus.TRIALING,
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
      checkoutStarted: true,
      stripeSubscriptionId: "sub_trial",
      cancelAtPeriodEnd: true,
      paidThrough: null,
      trialEndsAt: TRIAL_END,
      now: NOW,
      recurringPriceLabel: "A$49 per month",
    });

    expect(labelFor(presentation)).toBe("Trial cancelled");
    expect(
      customerBillingStatusTone({ label: "Trial cancelled", presentation })
    ).toBe("warning");
    expect(presentation.kind).toBe("active");
    if (presentation.kind !== "active") {
      return;
    }
    expect(presentation.attentionMessage).toBe(
      cancelledTrialAccessMessage(TRIAL_END)
    );
    expect(presentation.attentionMessage).toContain("You will not be charged.");
    expect(presentation.trial?.message).toBeNull();
    expect(presentation.attentionMessage).not.toContain(
      "first subscription charge"
    );
    expect(
      customerBillingPeriodLabel({
        presentation,
        cancelAtPeriodEnd: true,
        complimentary: false,
      })
    ).toBe("Access until");
    expect(paymentConfirmationHeading(presentation)).toBe(
      "Your free trial has been cancelled."
    );
  });

  it("keeps active, scheduled, past-due, unpaid, and ended labels distinct", () => {
    const active = presentBillingReturn({
      entitlementStatus: EntitlementStatus.ACTIVE,
      billingStatus: BillingStatus.ACTIVE,
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
      checkoutStarted: true,
      stripeSubscriptionId: "sub_paid",
      paidThrough: PAID_END,
      currentPeriodEnd: PAID_END,
      now: NOW,
    });
    expect(labelFor(active)).toBe("Active");
    expect(
      customerBillingStatusTone({ label: "Active", presentation: active })
    ).toBe("success");
    expect(
      customerBillingPeriodLabel({
        presentation: active,
        cancelAtPeriodEnd: false,
        complimentary: false,
      })
    ).toBe("Next renewal");

    const scheduled = presentBillingReturn({
      entitlementStatus: EntitlementStatus.ACTIVE,
      billingStatus: BillingStatus.CANCEL_AT_PERIOD_END,
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
      checkoutStarted: true,
      stripeSubscriptionId: "sub_paid",
      cancelAtPeriodEnd: true,
      paidThrough: PAID_END,
      currentPeriodEnd: PAID_END,
      now: NOW,
    });
    expect(labelFor(scheduled)).toBe("Cancellation scheduled");
    expect(
      customerBillingStatusTone({
        label: "Cancellation scheduled",
        presentation: scheduled,
      })
    ).toBe("warning");
    expect(scheduled.kind).toBe("active");
    if (scheduled.kind === "active") {
      expect(scheduled.attentionMessage).toContain("12 January 2027");
      expect(scheduled.attentionMessage).toContain(
        "future recurring charges will stop"
      );
      expect(scheduled.attentionMessage).not.toContain(
        "You will not be charged"
      );
      expect(scheduled.trial).toBeNull();
    }
    expect(
      customerBillingPeriodLabel({
        presentation: scheduled,
        cancelAtPeriodEnd: true,
        complimentary: false,
      })
    ).toBe("Access until");

    const pastDue = presentBillingReturn({
      entitlementStatus: EntitlementStatus.ACTIVE,
      billingStatus: BillingStatus.PAST_DUE,
      commercialPlan: "PRACTICE",
      billingInterval: "MONTHLY",
      checkoutStarted: true,
      stripeSubscriptionId: "sub_due",
      paidThrough: PAID_END,
      currentPeriodEnd: PAID_END,
      now: NOW,
    });
    expect(labelFor(pastDue)).toBe("Past due");
    expect(labelFor(pastDue, false)).toBe("Active");
    expect(
      customerBillingStatusTone({ label: "Past due", presentation: pastDue })
    ).toBe("error");

    const unpaid = presentBillingReturn({
      entitlementStatus: EntitlementStatus.RESTRICTED,
      billingStatus: BillingStatus.UNPAID,
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
      checkoutStarted: true,
      stripeSubscriptionId: "sub_unpaid",
      now: NOW,
    });
    expect(labelFor(unpaid)).toBe("Payment required");
    expect(labelFor(unpaid, false)).toBe("Billing");
    expect(
      customerBillingStatusTone({
        label: "Payment required",
        presentation: unpaid,
      })
    ).toBe("error");

    const ended = presentBillingReturn({
      entitlementStatus: EntitlementStatus.ENDED,
      billingStatus: BillingStatus.ENDED,
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
      checkoutStarted: true,
      stripeSubscriptionId: "sub_ended",
      now: NOW,
    });
    expect(labelFor(ended)).toBe("Ended");
    expect(
      customerBillingStatusTone({ label: "Ended", presentation: ended })
    ).toBe("neutral");
    expect(
      customerBillingPeriodLabel({
        presentation: ended,
        cancelAtPeriodEnd: true,
        complimentary: false,
      })
    ).toBe("Subscription ended");

    const processing = presentBillingReturn({
      entitlementStatus: EntitlementStatus.PENDING,
      billingStatus: BillingStatus.PAYMENT_PENDING,
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
      checkoutStarted: true,
      checkoutSession: { status: "complete", paymentStatus: "unpaid" },
      stripeSubscriptionId: null,
      now: NOW,
    });
    expect(labelFor(processing, true, "Payment processing")).toBe(
      "Payment processing"
    );
    expect(
      customerBillingStatusTone({
        label: "Payment processing",
        presentation: processing,
      })
    ).toBe("warning");
  });
});

describe("billing setup contact defaults", () => {
  const saved = {
    legalEntityName: "Harbour Dental Pty Ltd",
    tradingName: "Harbour Dental",
    billingContactName: "Accounts",
    billingEmail: "accounts@example.com",
    addressLine1: "10 River Street",
    addressLine2: "",
    city: "Tweed Heads",
    region: "NSW",
    postalCode: "2486",
    country: "AU",
    businessNumberKind: "abn" as const,
    abn: "32671297130",
    acn: "",
  };

  it("uses the verified account for a new clinic and not as the legal entity", () => {
    expect(
      billingSetupFormDefaults({
        clinicName: "Harbour Dental",
        identity: null,
        accountName: "River Owner",
        accountEmail: "owner@example.com",
      })
    ).toMatchObject({
      legalEntityName: "",
      tradingName: "Harbour Dental",
      billingContactName: "River Owner",
      billingEmail: "owner@example.com",
    });
  });

  it("keeps a saved billing profile ahead of the account", () => {
    expect(
      billingSetupFormDefaults({
        clinicName: "Harbour Dental",
        identity: saved,
        accountName: "River Owner",
        accountEmail: "owner@example.com",
      })
    ).toMatchObject({
      legalEntityName: "Harbour Dental Pty Ltd",
      tradingName: "Harbour Dental",
      billingContactName: "Accounts",
      billingEmail: "accounts@example.com",
    });
  });

  it("fills only a blank saved contact from the account", () => {
    expect(
      billingSetupFormDefaults({
        clinicName: "Harbour Dental",
        identity: {
          ...saved,
          billingContactName: "  ",
          billingEmail: "",
        },
        accountName: "River Owner",
        accountEmail: "owner@example.com",
      })
    ).toMatchObject({
      legalEntityName: "Harbour Dental Pty Ltd",
      billingContactName: "River Owner",
      billingEmail: "owner@example.com",
    });
  });
});
