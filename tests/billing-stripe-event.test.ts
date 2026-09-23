import { BillingStatus, EntitlementStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type Stripe from "stripe";

import {
  billingPeriodLabel,
  presentBillingReturn,
} from "@/lib/billing/billing-presentation";
import {
  clinicIdFromClientReference,
  clinicIdFromMetadata,
} from "@/lib/billing/identity";
import { projectEntitlement } from "@/lib/billing/projection";
import {
  priceIdFromInvoice,
  snapshotFromStripeEvent,
  snapshotFromSubscription,
  subscriptionIdFromInvoice,
} from "@/lib/billing/stripe-event";
import { emptyEntitlement } from "@/tests/helpers/billing";

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

const PERIOD_END_UNIX = 1_792_647_594;
const CANCELLATION_REQUESTED_UNIX = 1_758_614_400;

function portalPeriodEndSubscription(
  overrides: Record<string, unknown> = {}
): Stripe.Subscription {
  return {
    id: "sub_portal",
    object: "subscription",
    status: "active",
    customer: "cus_portal",
    metadata: { clinicId: "clinic_portal" },
    cancel_at: PERIOD_END_UNIX,
    cancel_at_period_end: false,
    canceled_at: CANCELLATION_REQUESTED_UNIX,
    cancellation_details: { reason: "cancellation_requested" },
    ended_at: null,
    items: {
      object: "list",
      data: [
        {
          id: "si_portal",
          price: { id: "price_test_essential_monthly" },
          current_period_start: 1_789_969_194,
          current_period_end: PERIOD_END_UNIX,
        },
      ],
      has_more: false,
      url: "/v1/subscription_items",
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe("Customer Portal cancel_at scheduling", () => {
  it("treats cancel_at at the period end as scheduled cancellation", () => {
    const subscription = portalPeriodEndSubscription();
    const snapshot = snapshotFromSubscription(
      subscription,
      "customer.subscription.updated",
      "evt_cancel_at",
      CANCELLATION_REQUESTED_UNIX
    );
    const periodEnd = new Date(PERIOD_END_UNIX * 1000);

    expect(snapshot.cancelAtPeriodEnd).toBe(true);
    expect(snapshot.subscriptionStatus).toBe("active");
    expect(snapshot.currentPeriodEnd).toEqual(periodEnd);

    const projected = projectEntitlement({
      eventType: snapshot.eventType,
      previous: emptyEntitlement({
        commercialPlan: "ESSENTIAL",
        billingInterval: "MONTHLY",
        billingStatus: BillingStatus.ACTIVE,
        entitlementStatus: EntitlementStatus.ACTIVE,
        paidThrough: periodEnd,
        currentPeriodEnd: periodEnd,
      }),
      clinicId: "clinic_portal",
      stripeCustomerId: snapshot.stripeCustomerId,
      stripeSubscriptionId: snapshot.stripeSubscriptionId,
      stripePriceId: snapshot.stripePriceId,
      mappedPrice: { plan: "ESSENTIAL", interval: "MONTHLY" },
      unknownPrice: false,
      subscriptionStatus: snapshot.subscriptionStatus,
      cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
      currentPeriodStart: snapshot.currentPeriodStart,
      currentPeriodEnd: snapshot.currentPeriodEnd,
      invoiceIsPaid: false,
      now: new Date(CANCELLATION_REQUESTED_UNIX * 1000),
    });
    expect(projected.kind).toBe("apply");
    if (projected.kind !== "apply") {
      return;
    }
    expect(projected.entitlement.billingStatus).toBe(
      BillingStatus.CANCEL_AT_PERIOD_END
    );
    expect(projected.entitlement.entitlementStatus).toBe(
      EntitlementStatus.ACTIVE
    );
    expect(projected.entitlement.cancelAtPeriodEnd).toBe(true);
    expect(projected.entitlement.paidThrough).toEqual(periodEnd);
    expect(projected.entitlement.subscriptionEndedAt).toBeNull();

    const presented = presentBillingReturn({
      entitlementStatus: projected.entitlement.entitlementStatus,
      billingStatus: projected.entitlement.billingStatus,
      commercialPlan: projected.entitlement.commercialPlan,
      billingInterval: projected.entitlement.billingInterval,
      checkoutStarted: true,
      stripeSubscriptionId: "sub_portal",
      paidThrough: projected.entitlement.paidThrough,
      currentPeriodEnd: projected.entitlement.currentPeriodEnd,
      cancelAtPeriodEnd: projected.entitlement.cancelAtPeriodEnd,
    });
    expect(presented).toMatchObject({
      kind: "active",
      attention: "cancel_scheduled",
    });
    if (presented.kind !== "active") {
      return;
    }
    expect(presented.attentionMessage).toBe(
      "Your subscription is scheduled to end on 22 October 2026."
    );
    expect(billingPeriodLabel(true)).toBe("Access until");
    expect(billingPeriodLabel(false)).toBe("Next renewal");
  });

  it("clears scheduled cancellation when a later update drops cancel_at", () => {
    const periodEnd = new Date(PERIOD_END_UNIX * 1000);
    const snapshot = snapshotFromSubscription(
      portalPeriodEndSubscription({
        cancel_at: null,
        cancel_at_period_end: false,
        canceled_at: CANCELLATION_REQUESTED_UNIX,
        cancellation_details: null,
      }),
      "customer.subscription.updated",
      "evt_cancel_reversed",
      CANCELLATION_REQUESTED_UNIX + 60
    );
    expect(snapshot.cancelAtPeriodEnd).toBe(false);

    const projected = projectEntitlement({
      eventType: "customer.subscription.updated",
      previous: emptyEntitlement({
        commercialPlan: "ESSENTIAL",
        billingInterval: "MONTHLY",
        billingStatus: BillingStatus.CANCEL_AT_PERIOD_END,
        entitlementStatus: EntitlementStatus.ACTIVE,
        paidThrough: periodEnd,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: true,
      }),
      clinicId: "clinic_portal",
      stripeCustomerId: "cus_portal",
      stripeSubscriptionId: "sub_portal",
      stripePriceId: "price_test_essential_monthly",
      mappedPrice: { plan: "ESSENTIAL", interval: "MONTHLY" },
      unknownPrice: false,
      subscriptionStatus: "active",
      cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
      currentPeriodStart: snapshot.currentPeriodStart,
      currentPeriodEnd: snapshot.currentPeriodEnd,
      invoiceIsPaid: false,
    });
    expect(projected.kind).toBe("apply");
    if (projected.kind !== "apply") {
      return;
    }
    expect(projected.entitlement.billingStatus).toBe(BillingStatus.ACTIVE);
    expect(projected.entitlement.entitlementStatus).toBe(
      EntitlementStatus.ACTIVE
    );
    expect(projected.entitlement.cancelAtPeriodEnd).toBe(false);
    expect(projected.entitlement.commercialPlan).toBe("ESSENTIAL");
    expect(projected.entitlement.billingInterval).toBe("MONTHLY");
    expect(projected.entitlement.paidThrough).toEqual(periodEnd);
  });

  it("still schedules cancellation from cancel_at_period_end and ignores canceled_at alone", () => {
    expect(
      snapshotFromSubscription(
        portalPeriodEndSubscription({
          cancel_at: null,
          cancel_at_period_end: true,
        }),
        "customer.subscription.updated",
        "evt_flag",
        CANCELLATION_REQUESTED_UNIX
      ).cancelAtPeriodEnd
    ).toBe(true);
    expect(
      snapshotFromSubscription(
        portalPeriodEndSubscription({
          cancel_at: null,
          cancel_at_period_end: false,
          canceled_at: CANCELLATION_REQUESTED_UNIX,
        }),
        "customer.subscription.updated",
        "evt_request_only",
        CANCELLATION_REQUESTED_UNIX
      ).cancelAtPeriodEnd
    ).toBe(false);
  });
});
