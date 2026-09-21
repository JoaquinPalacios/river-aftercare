import { BillingStatus, EntitlementStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  assessCommercialOfferRevision,
  prepareClinicCommercialOffer,
} from "@/lib/billing/prepare-offer";

describe("operator commercial offer", () => {
  it("allows preparation before any subscription exists", () => {
    expect(
      assessCommercialOfferRevision({
        entitlementStatus: null,
        billingStatus: null,
        stripeSubscriptionId: null,
      }).ok
    ).toBe(true);
    expect(
      assessCommercialOfferRevision({
        entitlementStatus: EntitlementStatus.PENDING,
        billingStatus: BillingStatus.OFFER_PREPARED,
        stripeSubscriptionId: null,
      }).ok
    ).toBe(true);
  });

  it("refuses to overwrite an active or in-progress subscription", () => {
    expect(
      assessCommercialOfferRevision({
        entitlementStatus: EntitlementStatus.ACTIVE,
        billingStatus: BillingStatus.ACTIVE,
        stripeSubscriptionId: "sub_test",
      }).ok
    ).toBe(false);
    expect(
      assessCommercialOfferRevision({
        entitlementStatus: EntitlementStatus.PENDING,
        billingStatus: BillingStatus.PAYMENT_PENDING,
        stripeSubscriptionId: null,
      }).ok
    ).toBe(false);
  });

  it("stores the offer as pending and prepared, not active", async () => {
    const writes: Array<Record<string, unknown>> = [];
    const db = {
      clinicEntitlement: {
        findUnique: async () => null,
        upsert: async ({ create }: { create: Record<string, unknown> }) => {
          writes.push(create);
          return create;
        },
      },
      clinicBillingProfile: {
        findUnique: async () => null,
        update: async () => {
          throw new Error("no profile to update");
        },
      },
    };

    const result = await prepareClinicCommercialOffer(
      {
        clinicId: "clinic_a",
        commercialPlan: "PRACTICE",
        billingInterval: "YEARLY",
      },
      db as never
    );

    expect(result).toEqual({ ok: true });
    expect(writes[0]).toMatchObject({
      clinicId: "clinic_a",
      commercialPlan: "PRACTICE",
      billingInterval: "YEARLY",
      billingStatus: BillingStatus.OFFER_PREPARED,
      entitlementStatus: EntitlementStatus.PENDING,
    });
  });
});
