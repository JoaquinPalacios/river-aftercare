import { BillingStatus, EntitlementStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  BILLING_COMPLETE_PATH,
  BILLING_SETUP_PATH,
  decideClinicProductAccess,
} from "@/lib/billing/activation-gate";

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
      reason: "pending_onboarding",
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
      reason: "pending_onboarding",
      href: BILLING_COMPLETE_PATH,
    });
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

  it("does not lock restricted or ended clinics in this phase", () => {
    expect(
      decideClinicProductAccess({
        membershipSource: "membership",
        entitlementStatus: EntitlementStatus.RESTRICTED,
        billingStatus: BillingStatus.UNPAID,
      }).kind
    ).toBe("allow");
    expect(
      decideClinicProductAccess({
        membershipSource: "membership",
        entitlementStatus: EntitlementStatus.ENDED,
        billingStatus: BillingStatus.ENDED,
      }).kind
    ).toBe("allow");
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
