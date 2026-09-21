import { describe, expect, it } from "vitest";
import type Stripe from "stripe";

import {
  clinicIdFromClientReference,
  clinicIdFromMetadata,
} from "@/lib/billing/identity";
import {
  priceIdFromInvoice,
  snapshotFromStripeEvent,
  subscriptionIdFromInvoice,
} from "@/lib/billing/stripe-event";

describe("Stripe identity and Basil event snapshots", () => {
  it("reads clinicId from metadata and client_reference_id, never email", () => {
    expect(
      clinicIdFromMetadata({
        clinicId: "clinic_1",
        email: "owner@clinic.example.test",
      })
    ).toBe("clinic_1");
    expect(
      clinicIdFromMetadata({
        email: "owner@clinic.example.test",
        name: "Harbour Dental",
      })
    ).toBeNull();
    expect(clinicIdFromClientReference("clinic_1")).toBe("clinic_1");
    expect(clinicIdFromClientReference(" owner@clinic.example.test ")).toBe(
      "owner@clinic.example.test"
    );
  });

  it("extracts subscription and Price IDs from current Invoice fields", () => {
    const invoice = {
      id: "in_1",
      object: "invoice",
      customer: "cus_1",
      parent: {
        type: "subscription_details",
        subscription_details: {
          subscription: "sub_1",
          metadata: { clinicId: "clinic_1" },
        },
      },
      lines: {
        data: [
          {
            pricing: {
              price_details: {
                price: "price_test_essential_monthly",
              },
            },
          },
        ],
      },
    } as unknown as Stripe.Invoice;

    expect(subscriptionIdFromInvoice(invoice)).toBe("sub_1");
    expect(priceIdFromInvoice(invoice)).toBe("price_test_essential_monthly");
  });

  it("does not treat Checkout completion as a paid invoice", () => {
    const snapshot = snapshotFromStripeEvent({
      id: "evt_cs_1",
      object: "event",
      created: 1_747_000_000,
      type: "checkout.session.completed",
      data: {
        object: {
          object: "checkout.session",
          customer: "cus_1",
          subscription: "sub_1",
          client_reference_id: "clinic_1",
          metadata: { clinicId: "clinic_1" },
          payment_status: "paid",
        },
      },
    } as unknown as Stripe.Event);

    expect(snapshot).toMatchObject({
      clinicIdHint: "clinic_1",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      invoiceIsPaid: false,
      checkoutPaymentStatus: "paid",
    });
  });

  it("marks invoice.paid snapshots as paid even before retrieving the Subscription", () => {
    const snapshot = snapshotFromStripeEvent({
      id: "evt_in_1",
      object: "event",
      created: 1_747_000_000,
      type: "invoice.paid",
      data: {
        object: {
          object: "invoice",
          status: "paid",
          customer: "cus_1",
          metadata: { clinicId: "clinic_1" },
          parent: {
            type: "subscription_details",
            subscription_details: {
              subscription: "sub_1",
              metadata: { clinicId: "clinic_1" },
            },
          },
          lines: {
            data: [
              {
                pricing: {
                  price_details: { price: "price_test_practice_yearly" },
                },
              },
            ],
          },
          period_start: 1_746_000_000,
          period_end: 1_748_600_000,
        },
      },
    } as unknown as Stripe.Event);

    expect(snapshot).toMatchObject({
      clinicIdHint: "clinic_1",
      stripeSubscriptionId: "sub_1",
      stripePriceId: "price_test_practice_yearly",
      invoiceIsPaid: true,
    });
  });
});
