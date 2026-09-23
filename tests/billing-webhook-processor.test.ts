import {
  BillingStatus,
  EntitlementStatus,
  StripeEventProcessingStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import type Stripe from "stripe";

import { processVerifiedStripeEvent } from "@/lib/billing/webhook-processor";
import { BILLING_TEST_ENV, uniqueP2002 } from "./helpers/billing";

type Receipt = {
  id: string;
  stripeEventId: string;
  eventType: string;
  processingStatus: StripeEventProcessingStatus;
  clinicId: string | null;
  failureText: string | null;
};

function createDb() {
  const clinics = new Map<string, { id: string }>([
    ["clinic_1", { id: "clinic_1" }],
  ]);
  const profiles = new Map<
    string,
    {
      clinicId: string;
      stripeCustomerId: string | null;
      stripeSubscriptionId: string | null;
    }
  >();
  const entitlements = new Map<string, Record<string, unknown>>();
  const receipts = new Map<string, Receipt>();
  let receiptSeq = 0;

  const db: any = {
    clinic: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        clinics.get(id) ?? null,
    },
    clinicBillingProfile: {
      findUnique: async ({
        where,
      }: {
        where: { stripeCustomerId?: string; stripeSubscriptionId?: string };
      }) => {
        if (where.stripeCustomerId) {
          return (
            [...profiles.values()].find(
              (row) => row.stripeCustomerId === where.stripeCustomerId
            ) ?? null
          );
        }
        if (where.stripeSubscriptionId) {
          return (
            [...profiles.values()].find(
              (row) => row.stripeSubscriptionId === where.stripeSubscriptionId
            ) ?? null
          );
        }
        return null;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { clinicId: string };
        create: {
          clinicId: string;
          stripeCustomerId: string | null;
          stripeSubscriptionId: string | null;
        };
        update: {
          stripeCustomerId?: string;
          stripeSubscriptionId?: string;
        };
      }) => {
        const existing = profiles.get(where.clinicId);
        const next = existing
          ? {
              ...existing,
              stripeCustomerId:
                update.stripeCustomerId ?? existing.stripeCustomerId,
              stripeSubscriptionId:
                update.stripeSubscriptionId ?? existing.stripeSubscriptionId,
            }
          : create;
        for (const row of profiles.values()) {
          if (
            next.stripeCustomerId &&
            row.clinicId !== next.clinicId &&
            row.stripeCustomerId === next.stripeCustomerId
          ) {
            throw uniqueP2002(["stripeCustomerId"]);
          }
        }
        profiles.set(next.clinicId, next);
        return next;
      },
    },
    clinicEntitlement: {
      findUnique: async ({
        where: { clinicId },
      }: {
        where: { clinicId: string };
      }) => entitlements.get(clinicId) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { clinicId: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const next = {
          ...(entitlements.get(where.clinicId) ?? {}),
          ...create,
          ...update,
          clinicId: where.clinicId,
        };
        entitlements.set(where.clinicId, next);
        return next;
      },
    },
    stripeEventReceipt: {
      create: async ({
        data,
      }: {
        data: Omit<Receipt, "id" | "clinicId" | "failureText"> &
          Partial<Receipt>;
      }) => {
        if (receipts.has(data.stripeEventId)) {
          throw uniqueP2002(["stripeEventId"]);
        }
        const row: Receipt = {
          id: `rcpt_${++receiptSeq}`,
          stripeEventId: data.stripeEventId,
          eventType: data.eventType,
          processingStatus:
            data.processingStatus ?? StripeEventProcessingStatus.RECEIVED,
          clinicId: data.clinicId ?? null,
          failureText: data.failureText ?? null,
        };
        receipts.set(row.stripeEventId, row);
        return row;
      },
      findUnique: async ({
        where: { stripeEventId },
      }: {
        where: { stripeEventId: string };
      }) => receipts.get(stripeEventId) ?? null,
      update: async ({
        where: { id },
        data,
      }: {
        where: { id: string };
        data: Partial<Receipt>;
      }) => {
        const current = [...receipts.values()].find((row) => row.id === id);
        if (!current) {
          throw new Error("missing receipt");
        }
        Object.assign(current, data);
        return current;
      },
    },
    async $transaction<T>(fn: (tx: typeof db) => Promise<T>): Promise<T> {
      return fn(db);
    },
    profiles,
    entitlements,
    receipts,
  };

  return db;
}

function invoicePaidEvent(): Stripe.Event {
  return {
    id: "evt_invoice_paid_1",
    object: "event",
    api_version: null,
    created: 1_747_000_000,
    type: "invoice.paid",
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: "in_1",
        object: "invoice",
        status: "paid",
        customer: "cus_1",
        metadata: { clinicId: "clinic_1" },
        parent: {
          type: "subscription_details",
          quote_details: null,
          subscription_details: {
            subscription: "sub_1",
            metadata: { clinicId: "clinic_1" },
          },
        },
        lines: {
          object: "list",
          data: [
            {
              id: "il_1",
              object: "line_item",
              pricing: {
                type: "price_details",
                price_details: {
                  price: "price_test_essential_monthly",
                  product: "prod_1",
                },
                unit_amount_decimal: "7900",
              },
            },
          ],
          has_more: false,
          url: "/v1/invoices/in_1/lines",
        },
        period_start: 1_746_000_000,
        period_end: 1_748_600_000,
      },
    },
  } as unknown as Stripe.Event;
}

function checkoutCompletedEvent(): Stripe.Event {
  return {
    id: "evt_checkout_1",
    object: "event",
    api_version: null,
    created: 1_747_000_000,
    type: "checkout.session.completed",
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: "cs_1",
        object: "checkout.session",
        customer: "cus_1",
        subscription: "sub_1",
        client_reference_id: "clinic_1",
        metadata: { clinicId: "clinic_1" },
        payment_status: "paid",
        status: "complete",
      },
    },
  } as unknown as Stripe.Event;
}

const activeSubscription = {
  id: "sub_1",
  object: "subscription",
  status: "active",
  customer: "cus_1",
  cancel_at_period_end: false,
  metadata: { clinicId: "clinic_1" },
  items: {
    object: "list",
    data: [
      {
        id: "si_1",
        price: { id: "price_test_essential_monthly" },
        current_period_start: 1_746_000_000,
        current_period_end: 1_748_600_000,
      },
    ],
    has_more: false,
    url: "/v1/subscription_items",
  },
} as unknown as Stripe.Subscription;

describe("processVerifiedStripeEvent", () => {
  it("does not grant paid entitlement from Checkout completion alone", async () => {
    const db = createDb();
    const result = await processVerifiedStripeEvent(checkoutCompletedEvent(), {
      prisma: db,
      reader: {
        retrieveSubscription: async () => activeSubscription,
      },
      env: BILLING_TEST_ENV,
    });
    expect(result.outcome).toBe("processed");
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      entitlementStatus: EntitlementStatus.PENDING,
      billingStatus: BillingStatus.PAYMENT_PENDING,
    });
  });

  it("activates from invoice.paid for a mapped Price", async () => {
    const db = createDb();
    const result = await processVerifiedStripeEvent(invoicePaidEvent(), {
      prisma: db,
      reader: {
        retrieveSubscription: async () => activeSubscription,
      },
      env: BILLING_TEST_ENV,
    });
    expect(result.outcome).toBe("processed");
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
      entitlementStatus: EntitlementStatus.ACTIVE,
      billingStatus: BillingStatus.ACTIVE,
    });
  });

  it("is idempotent for a duplicate event", async () => {
    const db = createDb();
    const event = invoicePaidEvent();
    const deps = {
      prisma: db,
      reader: { retrieveSubscription: async () => activeSubscription },
      env: BILLING_TEST_ENV,
    };
    await processVerifiedStripeEvent(event, deps);
    const second = await processVerifiedStripeEvent(event, deps);
    expect(second.outcome).toBe("duplicate");
    expect([...db.receipts.values()]).toHaveLength(1);
  });

  it("records unsupported events as ignored", async () => {
    const db = createDb();
    const result = await processVerifiedStripeEvent(
      {
        ...invoicePaidEvent(),
        id: "evt_ping",
        type: "ping",
      } as unknown as Stripe.Event,
      { prisma: db, reader: null, env: BILLING_TEST_ENV }
    );
    expect(result.outcome).toBe("ignored");
    expect(db.receipts.get("evt_ping")?.processingStatus).toBe(
      StripeEventProcessingStatus.IGNORED
    );
    expect(db.entitlements.size).toBe(0);
  });

  it("fails closed for an unknown Price ID", async () => {
    const db = createDb();
    const event = invoicePaidEvent();
    const invoice = event.data.object as {
      lines: {
        data: Array<{ pricing: { price_details: { price: string } } }>;
      };
    };
    invoice.lines.data[0].pricing.price_details.price = "price_not_configured";
    const result = await processVerifiedStripeEvent(event, {
      prisma: db,
      reader: {
        retrieveSubscription: async () =>
          ({
            ...activeSubscription,
            items: {
              ...activeSubscription.items,
              data: [
                {
                  id: "si_1",
                  price: { id: "price_not_configured" },
                  current_period_start: 1_746_000_000,
                  current_period_end: 1_748_600_000,
                },
              ],
            },
          }) as Stripe.Subscription,
      },
      env: BILLING_TEST_ENV,
    });
    expect(result.outcome).toBe("unknown_price");
    expect(db.entitlements.size).toBe(0);
    expect(db.receipts.get(event.id)?.processingStatus).toBe(
      StripeEventProcessingStatus.FAILED
    );
  });

  it("fails closed when the clinic cannot be mapped", async () => {
    const db = createDb();
    const event = invoicePaidEvent();
    (
      event.data.object as unknown as { metadata: { clinicId: string } }
    ).metadata.clinicId = "clinic_missing";
    (
      event.data.object as unknown as {
        parent: { subscription_details: { metadata: { clinicId: string } } };
      }
    ).parent.subscription_details.metadata.clinicId = "clinic_missing";
    const result = await processVerifiedStripeEvent(event, {
      prisma: db,
      reader: {
        retrieveSubscription: async () =>
          ({
            ...activeSubscription,
            metadata: { clinicId: "clinic_missing" },
          }) as Stripe.Subscription,
      },
      env: BILLING_TEST_ENV,
    });
    expect(result.outcome).toBe("unmapped_clinic");
    expect(db.entitlements.size).toBe(0);
  });

  it("does not revoke ACTIVE entitlement on invoice.payment_failed during retry", async () => {
    const db = createDb();
    await processVerifiedStripeEvent(invoicePaidEvent(), {
      prisma: db,
      reader: { retrieveSubscription: async () => activeSubscription },
      env: BILLING_TEST_ENV,
    });
    const failed = {
      ...invoicePaidEvent(),
      id: "evt_invoice_failed_1",
      type: "invoice.payment_failed",
    } as Stripe.Event;
    await processVerifiedStripeEvent(failed, {
      prisma: db,
      reader: {
        retrieveSubscription: async () =>
          ({
            ...activeSubscription,
            status: "past_due",
          }) as Stripe.Subscription,
      },
      env: BILLING_TEST_ENV,
    });
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      billingStatus: BillingStatus.PAST_DUE,
      entitlementStatus: EntitlementStatus.ACTIVE,
    });
  });

  it("projects a deleted subscription as ENDED with 60-day retention", async () => {
    const db = createDb();
    await processVerifiedStripeEvent(invoicePaidEvent(), {
      prisma: db,
      reader: { retrieveSubscription: async () => activeSubscription },
      env: BILLING_TEST_ENV,
    });
    const deleted = {
      ...invoicePaidEvent(),
      id: "evt_sub_deleted_1",
      type: "customer.subscription.deleted",
      data: {
        object: {
          ...activeSubscription,
          status: "canceled",
          cancel_at_period_end: false,
        },
      },
    } as Stripe.Event;
    await processVerifiedStripeEvent(deleted, {
      prisma: db,
      reader: {
        retrieveSubscription: async () =>
          ({
            ...activeSubscription,
            status: "canceled",
          }) as Stripe.Subscription,
      },
      env: BILLING_TEST_ENV,
    });
    const entitlement = db.entitlements.get("clinic_1");
    expect(entitlement).toMatchObject({
      billingStatus: BillingStatus.ENDED,
      entitlementStatus: EntitlementStatus.ENDED,
    });
    expect(entitlement?.publicGuideRetentionUntil).toBeInstanceOf(Date);
  });

  it("projects Portal cancel_at as scheduled cancellation and can reverse it", async () => {
    const db = createDb();
    const periodEnd = 1_792_647_594;
    const scheduled = {
      ...activeSubscription,
      cancel_at: periodEnd,
      cancel_at_period_end: false,
      canceled_at: 1_758_614_400,
      cancellation_details: { reason: "cancellation_requested" },
      ended_at: null,
      items: {
        object: "list",
        data: [
          {
            id: "si_1",
            price: { id: "price_test_essential_monthly" },
            current_period_start: 1_789_969_194,
            current_period_end: periodEnd,
          },
        ],
        has_more: false,
        url: "/v1/subscription_items",
      },
    } as Stripe.Subscription;
    await processVerifiedStripeEvent(invoicePaidEvent(), {
      prisma: db,
      reader: { retrieveSubscription: async () => activeSubscription },
      env: BILLING_TEST_ENV,
    });
    const updated = {
      id: "evt_portal_cancel_at",
      object: "event",
      created: 1_758_614_400,
      type: "customer.subscription.updated",
      data: { object: scheduled },
    } as Stripe.Event;
    await processVerifiedStripeEvent(updated, {
      prisma: db,
      reader: { retrieveSubscription: async () => scheduled },
      env: BILLING_TEST_ENV,
    });
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      billingStatus: BillingStatus.CANCEL_AT_PERIOD_END,
      entitlementStatus: EntitlementStatus.ACTIVE,
      cancelAtPeriodEnd: true,
      paidThrough: new Date(periodEnd * 1000),
      subscriptionEndedAt: null,
    });

    const reversed = {
      ...scheduled,
      cancel_at: null,
      cancel_at_period_end: false,
      canceled_at: 1_758_614_400,
    } as Stripe.Subscription;
    await processVerifiedStripeEvent(
      {
        ...updated,
        id: "evt_portal_cancel_reversed",
        data: { object: reversed },
      } as Stripe.Event,
      {
        prisma: db,
        reader: { retrieveSubscription: async () => reversed },
        env: BILLING_TEST_ENV,
      }
    );
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      billingStatus: BillingStatus.ACTIVE,
      entitlementStatus: EntitlementStatus.ACTIVE,
      cancelAtPeriodEnd: false,
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
    });
  });

  it("projects terminal unpaid as RESTRICTED, not ENDED", async () => {
    const db = createDb();
    await processVerifiedStripeEvent(invoicePaidEvent(), {
      prisma: db,
      reader: { retrieveSubscription: async () => activeSubscription },
      env: BILLING_TEST_ENV,
    });
    const unpaid = {
      ...invoicePaidEvent(),
      id: "evt_sub_unpaid_1",
      type: "customer.subscription.updated",
    } as Stripe.Event;
    await processVerifiedStripeEvent(unpaid, {
      prisma: db,
      reader: {
        retrieveSubscription: async () =>
          ({ ...activeSubscription, status: "unpaid" }) as Stripe.Subscription,
      },
      env: BILLING_TEST_ENV,
    });
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      billingStatus: BillingStatus.UNPAID,
      entitlementStatus: EntitlementStatus.RESTRICTED,
      publicGuideRetentionUntil: null,
    });
  });
});
