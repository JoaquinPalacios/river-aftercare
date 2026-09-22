import { BillingStatus, EntitlementStatus } from "@prisma/client";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  BILLING_COMPLETE_PATH,
  BILLING_SETUP_PATH,
  BILLING_STATUS_PATH,
  decideClinicProductAccess,
} from "@/lib/billing/activation-gate";
import { projectEntitlement } from "@/lib/billing/projection";
import { emptyEntitlement } from "@/tests/helpers/billing";

describe("pre-payment activation gate", () => {
  it("leaves a legacy clinic with no entitlement unchanged", () => {
    expect(
      decideClinicProductAccess({
        membershipSource: "membership",
        entitlementStatus: null,
        billingStatus: null,
      })
    ).toEqual({ kind: "allow", reason: "legacy" });
  });

  it("blocks product access for a prepared pending clinic and allows billing setup", () => {
    expect(
      decideClinicProductAccess({
        membershipSource: "membership",
        entitlementStatus: EntitlementStatus.PENDING,
        billingStatus: BillingStatus.OFFER_PREPARED,
      })
    ).toEqual({
      kind: "billing_required",
      reason: "not_active",
      href: BILLING_SETUP_PATH,
    });
  });

  it("keeps payment processing on the status page and still gates the product", () => {
    expect(
      decideClinicProductAccess({
        membershipSource: "membership",
        entitlementStatus: EntitlementStatus.PENDING,
        billingStatus: BillingStatus.PAYMENT_PENDING,
      })
    ).toEqual({
      kind: "billing_required",
      reason: "not_active",
      href: BILLING_COMPLETE_PATH,
    });
  });

  it("keeps product access open while a payment is retrying", () => {
    expect(
      decideClinicProductAccess({
        membershipSource: "membership",
        entitlementStatus: EntitlementStatus.ACTIVE,
        billingStatus: BillingStatus.PAST_DUE,
      })
    ).toEqual({ kind: "allow", reason: "active" });
  });

  it("keeps product access open after cancellation is scheduled", () => {
    expect(
      decideClinicProductAccess({
        membershipSource: "membership",
        entitlementStatus: EntitlementStatus.ACTIVE,
        billingStatus: BillingStatus.CANCEL_AT_PERIOD_END,
      })
    ).toEqual({ kind: "allow", reason: "active" });
  });

  it("opens product access once the entitlement is active", () => {
    expect(
      decideClinicProductAccess({
        membershipSource: "membership",
        entitlementStatus: EntitlementStatus.ACTIVE,
        billingStatus: BillingStatus.ACTIVE,
      })
    ).toEqual({ kind: "allow", reason: "active" });
  });

  it("keeps a restricted billing clinic on the billing status route", () => {
    expect(
      decideClinicProductAccess({
        membershipSource: "membership",
        entitlementStatus: EntitlementStatus.RESTRICTED,
        billingStatus: BillingStatus.UNPAID,
      })
    ).toEqual({
      kind: "billing_required",
      reason: "not_active",
      href: BILLING_STATUS_PATH,
    });
  });

  it("keeps an ended billing clinic on the billing status route", () => {
    expect(
      decideClinicProductAccess({
        membershipSource: "membership",
        entitlementStatus: EntitlementStatus.ENDED,
        billingStatus: BillingStatus.ENDED,
      })
    ).toEqual({
      kind: "billing_required",
      reason: "not_active",
      href: BILLING_STATUS_PATH,
    });
  });

  it("does not let billing status open product access", () => {
    expect(
      decideClinicProductAccess({
        membershipSource: "membership",
        entitlementStatus: EntitlementStatus.ENDED,
        billingStatus: BillingStatus.ACTIVE,
      }).kind
    ).toBe("billing_required");
    expect(
      decideClinicProductAccess({
        membershipSource: "membership",
        entitlementStatus: EntitlementStatus.RESTRICTED,
        billingStatus: BillingStatus.ACTIVE,
      }).kind
    ).toBe("billing_required");
  });

  it("keeps product access closed after a never-paid subscription is deleted", () => {
    const deleted = projectEntitlement({
      eventType: "customer.subscription.deleted",
      previous: emptyEntitlement({
        entitlementStatus: EntitlementStatus.PENDING,
        billingStatus: BillingStatus.PAYMENT_PENDING,
        commercialPlan: "ESSENTIAL",
        billingInterval: "MONTHLY",
      }),
      clinicId: "clinic_new",
      stripeCustomerId: "cus_new",
      stripeSubscriptionId: "sub_new",
      stripePriceId: "price_test_essential_monthly",
      mappedPrice: { plan: "ESSENTIAL", interval: "MONTHLY" },
      unknownPrice: false,
      subscriptionStatus: "canceled",
      cancelAtPeriodEnd: false,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      invoiceIsPaid: false,
      now: new Date("2026-09-21T00:00:00.000Z"),
    });

    expect(deleted.kind).toBe("apply");
    if (deleted.kind !== "apply") {
      return;
    }
    expect(deleted.entitlement.entitlementStatus).toBe(EntitlementStatus.ENDED);
    expect(deleted.entitlement.entitlementStatus).not.toBe(
      EntitlementStatus.ACTIVE
    );

    expect(
      decideClinicProductAccess({
        membershipSource: "membership",
        entitlementStatus: deleted.entitlement.entitlementStatus,
        billingStatus: deleted.entitlement.billingStatus,
      })
    ).toEqual({
      kind: "billing_required",
      reason: "not_active",
      href: BILLING_STATUS_PATH,
    });
  });

  it("applies the same product gate to staff as to admins", () => {
    expect(
      decideClinicProductAccess({
        membershipSource: "membership",
        entitlementStatus: EntitlementStatus.ENDED,
        billingStatus: BillingStatus.ENDED,
      }).kind
    ).toBe("billing_required");
    const checkout = readFileSync(
      "app/(staff)/account/billing/actions.ts",
      "utf8"
    );
    expect(checkout).toContain("requireClinicAdmin");
  });

  it("gates clinic product routes and leaves billing pages reachable", () => {
    const portal = readFileSync(
      "app/(staff)/(clinic-portal)/layout.tsx",
      "utf8"
    );
    const account = readFileSync("app/(staff)/account/layout.tsx", "utf8");
    expect(portal).toContain("enforcePrePaymentActivationGate");
    expect(account).toContain("readClinicBillingAccess");
    expect(account).not.toContain("enforcePrePaymentActivationGate");
  });

  it("does not send an assisting operator through the customer gate", () => {
    expect(
      decideClinicProductAccess({
        membershipSource: "operator_support",
        entitlementStatus: EntitlementStatus.PENDING,
        billingStatus: BillingStatus.OFFER_PREPARED,
      })
    ).toEqual({ kind: "allow", reason: "operator_support" });
  });
});
