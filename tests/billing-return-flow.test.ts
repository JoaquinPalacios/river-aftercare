import { BillingStatus, EntitlementStatus } from "@prisma/client";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  billingSetupCancelMessage,
  presentBillingReturn,
} from "@/lib/billing/billing-presentation";

describe("billing return flow", () => {
  it("shows payment processing for a pending return and does not grant access", () => {
    expect(
      presentBillingReturn({
        entitlementStatus: EntitlementStatus.PENDING,
        billingStatus: BillingStatus.PAYMENT_PENDING,
        commercialPlan: "PRACTICE",
        billingInterval: "MONTHLY",
        checkoutStarted: true,
        stripeSubscriptionId: "sub_test",
      })
    ).toEqual({ kind: "processing", productAccess: false });
  });

  it("keeps a just-submitted Checkout pending until the local projection changes", () => {
    expect(
      presentBillingReturn({
        entitlementStatus: EntitlementStatus.PENDING,
        billingStatus: BillingStatus.OFFER_PREPARED,
        commercialPlan: "ESSENTIAL",
        billingInterval: "MONTHLY",
        checkoutStarted: true,
        stripeSubscriptionId: null,
      })
    ).toEqual({ kind: "processing", productAccess: false });
  });

  it("shows the active state only from the local entitlement", () => {
    const active = presentBillingReturn({
      entitlementStatus: EntitlementStatus.ACTIVE,
      billingStatus: BillingStatus.ACTIVE,
      commercialPlan: "PRACTICE",
      billingInterval: "YEARLY",
      checkoutStarted: true,
      stripeSubscriptionId: "sub_test",
    });
    expect(active).toMatchObject({
      kind: "active",
      productAccess: true,
      assistedSetup: true,
    });
  });

  it("shows an ended subscription as inactive without product access", () => {
    expect(
      presentBillingReturn({
        entitlementStatus: EntitlementStatus.ENDED,
        billingStatus: BillingStatus.ENDED,
        commercialPlan: "ESSENTIAL",
        billingInterval: "MONTHLY",
        checkoutStarted: true,
        stripeSubscriptionId: "sub_ended",
      })
    ).toEqual({ kind: "inactive", productAccess: false });
  });

  it("keeps a restricted entitlement on recovery without product access", () => {
    expect(
      presentBillingReturn({
        entitlementStatus: EntitlementStatus.RESTRICTED,
        billingStatus: BillingStatus.UNPAID,
        commercialPlan: "PRACTICE",
        billingInterval: "MONTHLY",
        checkoutStarted: false,
        stripeSubscriptionId: "sub_restricted",
      })
    ).toMatchObject({ kind: "restricted", productAccess: false });
  });

  it("keeps a past-due subscription active in the product while flagging billing", () => {
    expect(
      presentBillingReturn({
        entitlementStatus: EntitlementStatus.ACTIVE,
        billingStatus: BillingStatus.PAST_DUE,
        commercialPlan: "ESSENTIAL",
        billingInterval: "MONTHLY",
        checkoutStarted: true,
        stripeSubscriptionId: "sub_past_due",
        paidThrough: new Date("2026-10-01T00:00:00.000Z"),
      })
    ).toMatchObject({
      kind: "active",
      productAccess: true,
      attention: "past_due",
    });
  });

  it("shows a scheduled end date without marking the subscription ended", () => {
    const presented = presentBillingReturn({
      entitlementStatus: EntitlementStatus.ACTIVE,
      billingStatus: BillingStatus.CANCEL_AT_PERIOD_END,
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
      checkoutStarted: true,
      stripeSubscriptionId: "sub_cancel",
      cancelAtPeriodEnd: true,
      paidThrough: new Date("2026-10-01T00:00:00.000Z"),
    });
    expect(presented).toMatchObject({
      kind: "active",
      productAccess: true,
      attention: "cancel_scheduled",
    });
    if (presented.kind !== "active") {
      return;
    }
    expect(presented.attentionMessage).toContain(
      "Your subscription is scheduled to end on"
    );
    expect(presented.attentionMessage).not.toContain("Ended");
  });

  it("does not treat a portal return page as a billing mutation", () => {
    const page = readFileSync("app/(staff)/account/billing/page.tsx", "utf8");
    const form = readFileSync(
      "app/(staff)/account/billing/manage-billing-form.tsx",
      "utf8"
    );
    const actions = readFileSync(
      "app/(staff)/account/billing/actions.ts",
      "utf8"
    );
    expect(page).toContain("ManageBillingForm");
    expect(form).toContain("Manage billing");
    expect(page).not.toContain("subscriptions.update");
    expect(page).not.toContain("invoice.paid");
    expect(actions).not.toContain("stripeCustomerId");
    expect(actions).not.toContain("priceId");
    expect(actions).toContain("BILLING_PORTAL_RETURN_PATH");
    expect(actions).not.toContain("entitlement.update");
  });

  it("does not let a success URL override a still-pending entitlement", () => {
    const complete = readFileSync(
      "app/(staff)/account/billing/complete/page.tsx",
      "utf8"
    );
    expect(complete).not.toContain("invoice.paid");
    expect(complete).not.toContain("session_id");
    expect(complete).not.toContain("entitlement.update");
    expect(complete).toContain("Payment processing");
    expect(complete).toContain("Your River Aftercare subscription is active.");
  });

  it("returns a cancelled Checkout to setup without an entitlement change", () => {
    expect(billingSetupCancelMessage("cancelled")).toBe(
      "Payment setup wasn't completed. Your details have been saved."
    );
    expect(billingSetupCancelMessage(null)).toBeNull();
    const setup = readFileSync(
      "app/(staff)/account/billing/setup/page.tsx",
      "utf8"
    );
    expect(setup).toContain("billingSetupCancelMessage");
    expect(setup).not.toContain("invoice.paid");
    expect(setup).not.toContain("entitlement.update");
  });
});
