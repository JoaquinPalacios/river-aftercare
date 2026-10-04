import { BillingStatus, EntitlementStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { executeClinicCheckout } from "@/lib/billing/checkout";
import {
  addUtcMonths,
  complimentaryProductStatus,
  endOfSydneyDay,
  nextComplimentaryExpiry,
  parseComplimentaryReason,
  parseCustomEndDate,
  parseOptionalReviewDate,
  sydneyNoon,
} from "@/lib/billing/complimentary-term";
import { assessCommercialOfferRevision } from "@/lib/billing/prepare-offer";
import { patientGuidesRemainPublic } from "@/lib/billing/public-guide-access";

const NOW = new Date("2026-10-04T00:00:00.000Z");

describe("complimentary term", () => {
  it("adds six and 12 months from now, and clamps a month end", () => {
    expect(addUtcMonths(NOW, 6).toISOString()).toBe("2027-04-04T00:00:00.000Z");
    expect(addUtcMonths(NOW, 12).toISOString()).toBe(
      "2027-10-04T00:00:00.000Z"
    );
    expect(
      addUtcMonths(new Date("2026-01-31T12:00:00.000Z"), 1).toISOString()
    ).toBe("2026-02-28T12:00:00.000Z");
  });

  it("uses the end of the selected Sydney day for a custom term", () => {
    const custom = parseCustomEndDate("2027-06-15", NOW);
    expect(custom).toEqual({
      ok: true,
      expiresAt: endOfSydneyDay(2027, 6, 15),
    });
    expect(endOfSydneyDay(2027, 6, 15).toISOString()).toBe(
      "2027-06-15T13:59:59.999Z"
    );
    expect(sydneyNoon(2027, 3, 1).toISOString()).toBe(
      "2027-03-01T01:00:00.000Z"
    );
  });

  it("stacks a dated extension on remaining time and refuses to bound an indefinite grant", () => {
    const current = addUtcMonths(NOW, 6);
    const stacked = nextComplimentaryExpiry({
      duration: "TWELVE_MONTHS",
      now: NOW,
      currentExpiresAt: current,
      currentIndefinite: false,
    });
    expect(stacked).toEqual({
      ok: true,
      term: { expiresAt: addUtcMonths(current, 12), indefinite: false },
    });
    const bounded = nextComplimentaryExpiry({
      duration: "SIX_MONTHS",
      now: NOW,
      currentExpiresAt: null,
      currentIndefinite: true,
    });
    expect(bounded.ok).toBe(false);
    const renewed = nextComplimentaryExpiry({
      duration: "INDEFINITE",
      now: NOW,
      currentExpiresAt: current,
      currentIndefinite: false,
    });
    expect(renewed).toEqual({
      ok: true,
      term: { expiresAt: null, indefinite: true },
    });
  });

  it("starts an expired extension from now", () => {
    const extended = nextComplimentaryExpiry({
      duration: "SIX_MONTHS",
      now: NOW,
      currentExpiresAt: new Date("2026-01-01T00:00:00.000Z"),
      currentIndefinite: false,
    });
    expect(extended).toEqual({
      ok: true,
      term: { expiresAt: addUtcMonths(NOW, 6), indefinite: false },
    });
  });

  it("requires a reason and a review date inside the horizon", () => {
    expect(parseComplimentaryReason("  collaboration   notes  ")).toEqual({
      ok: true,
      reason: "collaboration notes",
    });
    expect(parseComplimentaryReason("   ").ok).toBe(false);
    expect(parseOptionalReviewDate("", NOW)).toEqual({
      ok: true,
      reviewAt: null,
    });
    expect(parseOptionalReviewDate("2027-03-01", NOW)).toEqual({
      ok: true,
      reviewAt: sydneyNoon(2027, 3, 1),
    });
    expect(parseCustomEndDate("2020-01-01", NOW).ok).toBe(false);
  });

  it("closes only an active complimentary term that has reached its expiry", () => {
    expect(
      complimentaryProductStatus({
        entitlementStatus: EntitlementStatus.ACTIVE,
        commercialArrangement: "COMPLIMENTARY",
        complimentaryExpiresAt: NOW,
        now: NOW,
      })
    ).toBe(EntitlementStatus.ENDED);
    expect(
      complimentaryProductStatus({
        entitlementStatus: EntitlementStatus.ACTIVE,
        commercialArrangement: "COMPLIMENTARY",
        complimentaryExpiresAt: null,
        now: NOW,
      })
    ).toBe(EntitlementStatus.ACTIVE);
    expect(
      complimentaryProductStatus({
        entitlementStatus: EntitlementStatus.ACTIVE,
        commercialArrangement: "PAID",
        complimentaryExpiresAt: NOW,
        now: NOW,
      })
    ).toBe(EntitlementStatus.ACTIVE);
  });

  it("keeps published guides public when complimentary expiry has no retention clock", () => {
    expect(
      patientGuidesRemainPublic({
        entitlementStatus: EntitlementStatus.ENDED,
        publicGuideRetentionUntil: null,
        now: NOW,
      })
    ).toBe(true);
  });

  it("refuses checkout and offer revision for complimentary access", async () => {
    let stripeCalled = false;
    const result = await executeClinicCheckout({
      state: {
        clinicId: "clinic_comp",
        userId: "user_admin",
        commercialPlan: "ESSENTIAL",
        billingInterval: null,
        billingStatus: BillingStatus.NOT_BILLED,
        entitlementStatus: EntitlementStatus.PENDING,
        commercialArrangement: "COMPLIMENTARY",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripeCheckoutSessionId: null,
        offeredAdditionalSiteQuantity: null,
        termsAccepted: true,
        identity: null,
      },
      stripe: new Proxy({} as never, {
        get() {
          stripeCalled = true;
          throw new Error("Stripe was called");
        },
      }),
      successUrl: "http://app.localhost:3000/account/billing/complete",
      cancelUrl: "http://app.localhost:3000/account/billing/setup",
      persist: async () => {
        throw new Error("Checkout was persisted");
      },
    });
    expect(result).toEqual({ ok: false, code: "already_active" });
    expect(stripeCalled).toBe(false);
    expect(
      assessCommercialOfferRevision({
        entitlementStatus: EntitlementStatus.ENDED,
        billingStatus: BillingStatus.NOT_BILLED,
        stripeSubscriptionId: null,
        commercialArrangement: "COMPLIMENTARY",
      })
    ).toMatchObject({
      ok: false,
      message:
        "This clinic has complimentary access. Extend that agreement. Paid conversion is a later step.",
    });
    expect(
      assessCommercialOfferRevision({
        entitlementStatus: EntitlementStatus.ACTIVE,
        billingStatus: BillingStatus.ACTIVE,
        stripeSubscriptionId: "sub_paid",
        commercialArrangement: "PAID",
      }).ok
    ).toBe(false);
  });
});
