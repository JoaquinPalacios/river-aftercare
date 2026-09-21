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
