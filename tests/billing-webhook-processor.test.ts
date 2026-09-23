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
      stripeSubscriptionScheduleId: string | null;
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
        where: {
          stripeCustomerId?: string;
          stripeSubscriptionId?: string;
          clinicId?: string;
          stripeSubscriptionScheduleId?: string;
        };
      }) => {
        if (where.clinicId) {
          return profiles.get(where.clinicId) ?? null;
        }
        if (where.stripeSubscriptionScheduleId) {
          return (
            [...profiles.values()].find(
              (row) =>
                row.stripeSubscriptionScheduleId ===
                where.stripeSubscriptionScheduleId
            ) ?? null
          );
        }
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
      update: async ({
        where,
        data,
      }: {
        where: { clinicId: string };
        data: Record<string, unknown>;
      }) => {
        const existing = profiles.get(where.clinicId);
        if (!existing) {
          throw new Error("missing profile");
        }
        const next = { ...existing, ...data };
        profiles.set(where.clinicId, next);
        return next;
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
          stripeSubscriptionScheduleId?: string | null;
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
              stripeSubscriptionScheduleId:
                "stripeSubscriptionScheduleId" in update
                  ? (update.stripeSubscriptionScheduleId ?? null)
                  : existing.stripeSubscriptionScheduleId,
            }
          : {
              stripeSubscriptionScheduleId: null,
              ...create,
            };
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
      update: async ({
        where,
        data,
      }: {
        where: { clinicId: string };
        data: Record<string, unknown>;
      }) => {
        const next = {
          ...(entitlements.get(where.clinicId) ?? {}),
          ...data,
          clinicId: where.clinicId,
        };
        entitlements.set(where.clinicId, next);
        return next;
      },
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

function subscriptionWith(input: {
  priceId: string;
  status?: string;
  cancelAtPeriodEnd?: boolean;
  cancelAt?: number | null;
}): Stripe.Subscription {
  return {
    ...activeSubscription,
    status: input.status ?? "active",
    cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
    cancel_at: input.cancelAt ?? null,
    items: {
      object: "list",
      data: [
        {
          id: "si_1",
          price: { id: input.priceId },
          quantity: 1,
          current_period_start: 1_746_000_000,
          current_period_end: 1_748_600_000,
        },
      ],
      has_more: false,
      url: "/v1/subscription_items",
    },
  } as Stripe.Subscription;
}

function invoiceEvent(input: {
  id: string;
  type: "invoice.paid" | "invoice.payment_failed";
  priceId: string;
}): Stripe.Event {
  const event = invoicePaidEvent();
  event.id = input.id;
  event.type = input.type;
  const invoice = event.data.object as {
    lines: { data: Array<{ pricing: { price_details: { price: string } } }> };
  };
  invoice.lines.data[0].pricing.price_details.price = input.priceId;
  return event;
}

function subscriptionEvent(input: {
  id: string;
  subscription: Stripe.Subscription;
}): Stripe.Event {
  return {
    id: input.id,
    object: "event",
    created: 1_747_100_000,
    type: "customer.subscription.updated",
    data: { object: input.subscription },
  } as Stripe.Event;
}

function seedPracticeDowngrade(
  db: ReturnType<typeof createDb>,
  input: {
    priceId?: string;
    interval?: "MONTHLY" | "YEARLY";
    cancelAtPeriodEnd?: boolean;
  } = {}
) {
  db.profiles.set("clinic_1", {
    clinicId: "clinic_1",
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    stripeSubscriptionScheduleId: "sub_sched_1",
  });
  db.entitlements.set("clinic_1", {
    commercialPlan: "PRACTICE",
    billingInterval: input.interval ?? "MONTHLY",
    billingStatus: input.cancelAtPeriodEnd
      ? BillingStatus.CANCEL_AT_PERIOD_END
      : BillingStatus.ACTIVE,
    entitlementStatus: EntitlementStatus.ACTIVE,
    stripePriceId: input.priceId ?? "price_test_practice_monthly",
    cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
    scheduledCommercialPlan: input.cancelAtPeriodEnd ? null : "ESSENTIAL",
    scheduledPlanEffectiveAt: input.cancelAtPeriodEnd
      ? null
      : new Date("2026-10-22T00:00:00.000Z"),
    extraTeamMemberAllowance: 1,
    extraCustomGuideAllowance: 2,
    extraTemplateAdaptationAllowance: 0,
  });
}

function scheduleEvent(input: {
  id: string;
  type?: string;
  status?: string;
  endBehavior: string;
  phases: Array<{
    price: string;
    start: number;
    end: number;
    quantity?: number;
  }>;
}): Stripe.Event {
  return {
    id: input.id,
    object: "event",
    created: 1_747_200_000,
    type: input.type ?? "subscription_schedule.updated",
    data: {
      object: {
        id: "sub_sched_1",
        object: "subscription_schedule",
        status: input.status ?? "active",
        end_behavior: input.endBehavior,
        subscription: "sub_1",
        released_subscription: null,
        metadata: {
          clinicId: "clinic_1",
          riverSchedulePurpose: "practice_to_essential",
        },
        current_phase: input.phases[0]
          ? {
              start_date: input.phases[0].start,
              end_date: input.phases[0].end,
            }
          : null,
        phases: input.phases.map((phase) => ({
          start_date: phase.start,
          end_date: phase.end,
          proration_behavior: "none",
          items: [{ price: phase.price, quantity: phase.quantity ?? 1 }],
        })),
      },
    },
  } as unknown as Stripe.Event;
}

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

  it("projects Essential at renewal from either invoice.paid or subscription.updated", async () => {
    for (const priceId of [
      "price_test_essential_monthly",
      "price_test_essential_yearly",
    ] as const) {
      const interval =
        priceId === "price_test_essential_yearly" ? "YEARLY" : "MONTHLY";
      const practicePrice =
        interval === "YEARLY"
          ? "price_test_practice_yearly"
          : "price_test_practice_monthly";
      const invoiceFirst = createDb();
      seedPracticeDowngrade(invoiceFirst, {
        interval,
        priceId: practicePrice,
      });
      await processVerifiedStripeEvent(
        invoiceEvent({
          id: `evt_paid_${interval}`,
          type: "invoice.paid",
          priceId,
        }),
        {
          prisma: invoiceFirst,
          reader: {
            retrieveSubscription: async () =>
              subscriptionWith({ priceId: practicePrice }),
          },
          env: BILLING_TEST_ENV,
        }
      );
      expect(invoiceFirst.entitlements.get("clinic_1")).toMatchObject({
        commercialPlan: "ESSENTIAL",
        billingInterval: interval,
        entitlementStatus: EntitlementStatus.ACTIVE,
        billingStatus: BillingStatus.ACTIVE,
        scheduledCommercialPlan: null,
        extraTeamMemberAllowance: 1,
        extraCustomGuideAllowance: 2,
      });
      expect(invoiceFirst.profiles.get("clinic_1")).toMatchObject({
        stripeSubscriptionId: "sub_1",
        stripeSubscriptionScheduleId: "sub_sched_1",
      });

      const subscriptionFirst = createDb();
      seedPracticeDowngrade(subscriptionFirst, {
        interval,
        priceId: practicePrice,
      });
      const essentialSubscription = subscriptionWith({ priceId });
      await processVerifiedStripeEvent(
        subscriptionEvent({
          id: `evt_sub_${interval}`,
          subscription: essentialSubscription,
        }),
        {
          prisma: subscriptionFirst,
          reader: { retrieveSubscription: async () => essentialSubscription },
          env: BILLING_TEST_ENV,
        }
      );
      await processVerifiedStripeEvent(
        invoiceEvent({
          id: `evt_paid_after_${interval}`,
          type: "invoice.paid",
          priceId,
        }),
        {
          prisma: subscriptionFirst,
          reader: { retrieveSubscription: async () => essentialSubscription },
          env: BILLING_TEST_ENV,
        }
      );
      expect(subscriptionFirst.entitlements.get("clinic_1")).toMatchObject({
        commercialPlan: "ESSENTIAL",
        billingInterval: interval,
        scheduledCommercialPlan: null,
        extraTeamMemberAllowance: 1,
      });
      expect(
        subscriptionFirst.profiles.get("clinic_1")?.stripeSubscriptionId
      ).toBe("sub_1");
    }
  });

  it("keeps Essential retry access when the downgrade renewal payment fails", async () => {
    const db = createDb();
    seedPracticeDowngrade(db);
    const pastDue = subscriptionWith({
      priceId: "price_test_essential_monthly",
      status: "past_due",
    });
    await processVerifiedStripeEvent(
      invoiceEvent({
        id: "evt_downgrade_failed",
        type: "invoice.payment_failed",
        priceId: "price_test_essential_monthly",
      }),
      {
        prisma: db,
        reader: { retrieveSubscription: async () => pastDue },
        env: BILLING_TEST_ENV,
        downgradeStripe: null,
      }
    );
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
      billingStatus: BillingStatus.PAST_DUE,
      entitlementStatus: EntitlementStatus.ACTIVE,
      scheduledCommercialPlan: null,
      extraTeamMemberAllowance: 1,
      extraCustomGuideAllowance: 2,
    });

    const unpaid = subscriptionWith({
      priceId: "price_test_essential_monthly",
      status: "unpaid",
    });
    await processVerifiedStripeEvent(
      subscriptionEvent({ id: "evt_downgrade_unpaid", subscription: unpaid }),
      {
        prisma: db,
        reader: { retrieveSubscription: async () => unpaid },
        env: BILLING_TEST_ENV,
      }
    );
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
      billingStatus: BillingStatus.UNPAID,
      entitlementStatus: EntitlementStatus.RESTRICTED,
      extraTeamMemberAllowance: 1,
    });
    expect(db.profiles.get("clinic_1")?.stripeSubscriptionId).toBe("sub_1");
  });

  it("lets cancellation win over a scheduled downgrade and does not restore it", async () => {
    const db = createDb();
    seedPracticeDowngrade(db);
    const releases: Array<{ preserve_cancel_date?: boolean }> = [];
    const updates: unknown[] = [];
    const stripe = {
      subscriptions: {
        retrieve: async () => {
          throw new Error("subscription retrieve is not used here");
        },
      },
      subscriptionSchedules: {
        retrieve: async (id: string) => ({
          id,
          status: "active",
          endBehavior: "release",
          subscriptionId: "sub_1",
          releasedSubscriptionId: null,
          metadataClinicId: "clinic_1",
          metadataPurpose: "practice_to_essential",
          phases: [],
        }),
        update: async (_id: string, params: unknown) => {
          updates.push(params);
          return {
            id: "sub_sched_1",
            status: "active",
            endBehavior: "cancel",
            subscriptionId: "sub_1",
            releasedSubscriptionId: null,
            metadataClinicId: "clinic_1",
            metadataPurpose: "practice_to_essential",
            phases: [],
          };
        },
        release: async (
          _id: string,
          params: { preserve_cancel_date?: boolean }
        ) => {
          releases.push(params);
          return {
            id: "sub_sched_1",
            status: "released",
            endBehavior: "release",
            subscriptionId: null,
            releasedSubscriptionId: "sub_1",
            metadataClinicId: "clinic_1",
            metadataPurpose: "practice_to_essential",
            phases: [],
          };
        },
        create: async () => {
          throw new Error("must not create a schedule");
        },
      },
    };
    const cancelled = subscriptionWith({
      priceId: "price_test_practice_monthly",
      cancelAtPeriodEnd: true,
    });
    await processVerifiedStripeEvent(
      subscriptionEvent({ id: "evt_cancel_wins", subscription: cancelled }),
      {
        prisma: db,
        reader: { retrieveSubscription: async () => cancelled },
        env: BILLING_TEST_ENV,
        downgradeStripe: stripe,
      }
    );
    expect(releases).toEqual([{ preserve_cancel_date: true }]);
    expect(updates).toHaveLength(0);
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      commercialPlan: "PRACTICE",
      billingInterval: "MONTHLY",
      cancelAtPeriodEnd: true,
      billingStatus: BillingStatus.CANCEL_AT_PERIOD_END,
      entitlementStatus: EntitlementStatus.ACTIVE,
      scheduledCommercialPlan: null,
      scheduledPlanEffectiveAt: null,
      extraTeamMemberAllowance: 1,
    });
    expect(db.profiles.get("clinic_1")).toMatchObject({
      stripeSubscriptionId: "sub_1",
      stripeSubscriptionScheduleId: null,
    });

    const restored = subscriptionWith({
      priceId: "price_test_practice_monthly",
    });
    await processVerifiedStripeEvent(
      subscriptionEvent({ id: "evt_cancel_reversed", subscription: restored }),
      {
        prisma: db,
        reader: { retrieveSubscription: async () => restored },
        env: BILLING_TEST_ENV,
        downgradeStripe: stripe,
      }
    );
    expect(releases).toHaveLength(1);
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      commercialPlan: "PRACTICE",
      cancelAtPeriodEnd: false,
      billingStatus: BillingStatus.ACTIVE,
      scheduledCommercialPlan: null,
      extraTeamMemberAllowance: 1,
    });
  });

  it("collapses a schedule when cancellation is only on the schedule", async () => {
    const db = createDb();
    seedPracticeDowngrade(db);
    const updates: Array<{ end_behavior: string; phases: unknown[] }> = [];
    const stripe = {
      subscriptions: { retrieve: async () => ({}) },
      subscriptionSchedules: {
        retrieve: async () => {
          throw new Error("release retrieve should not run");
        },
        release: async () => {
          throw new Error(
            "must not release while cancellation is schedule-managed"
          );
        },
        create: async () => {
          throw new Error("must not create a schedule");
        },
        update: async (
          id: string,
          params: { end_behavior: string; phases: unknown[] }
        ) => {
          updates.push(params);
          return {
            id,
            status: "active",
            endBehavior: "cancel",
            subscriptionId: "sub_1",
            releasedSubscriptionId: null,
            metadataClinicId: "clinic_1",
            metadataPurpose: "practice_to_essential",
            phases: [],
          };
        },
      },
    } as unknown as import("@/lib/billing/plan-downgrade").PlanDowngradeStripePort;
    await processVerifiedStripeEvent(
      scheduleEvent({
        id: "evt_sched_cancel",
        endBehavior: "cancel",
        phases: [
          {
            price: "price_test_practice_monthly",
            start: 1_746_000_000,
            end: 1_748_600_000,
          },
          {
            price: "price_test_essential_monthly",
            start: 1_748_600_000,
            end: 1_751_200_000,
          },
        ],
      }),
      {
        prisma: db,
        env: BILLING_TEST_ENV,
        downgradeStripe: stripe,
      }
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      end_behavior: "cancel",
      proration_behavior: "none",
      phases: [
        {
          items: [{ price: "price_test_practice_monthly", quantity: 1 }],
          start_date: 1_746_000_000,
          end_date: 1_748_600_000,
          proration_behavior: "none",
        },
      ],
    });
    expect(db.profiles.get("clinic_1")?.stripeSubscriptionScheduleId).toBe(
      "sub_sched_1"
    );
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      commercialPlan: "PRACTICE",
      cancelAtPeriodEnd: true,
      billingStatus: BillingStatus.CANCEL_AT_PERIOD_END,
      scheduledCommercialPlan: null,
      extraTeamMemberAllowance: 1,
    });

    const restored = subscriptionWith({
      priceId: "price_test_practice_monthly",
    });
    const releases: Array<{ preserve_cancel_date?: boolean }> = [];
    await processVerifiedStripeEvent(
      subscriptionEvent({
        id: "evt_undo_schedule_cancel",
        subscription: restored,
      }),
      {
        prisma: db,
        reader: { retrieveSubscription: async () => restored },
        env: BILLING_TEST_ENV,
        downgradeStripe: {
          ...stripe,
          subscriptionSchedules: {
            ...stripe.subscriptionSchedules,
            retrieve: async (id: string) => ({
              id,
              status: "active",
              endBehavior: "cancel",
              subscriptionId: "sub_1",
              releasedSubscriptionId: null,
              metadataClinicId: "clinic_1",
              metadataPurpose: "practice_to_essential",
              phases: [],
            }),
            release: async (
              _id: string,
              params: { preserve_cancel_date?: boolean }
            ) => {
              releases.push(params);
              return {
                id: "sub_sched_1",
                status: "released",
                endBehavior: "cancel",
                subscriptionId: null,
                releasedSubscriptionId: "sub_1",
                metadataClinicId: "clinic_1",
                metadataPurpose: "practice_to_essential",
                phases: [],
              };
            },
          },
        } as unknown as import("@/lib/billing/plan-downgrade").PlanDowngradeStripePort,
      }
    );
    expect(releases).toEqual([{ preserve_cancel_date: false }]);
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      commercialPlan: "PRACTICE",
      scheduledCommercialPlan: null,
      cancelAtPeriodEnd: false,
      billingStatus: BillingStatus.ACTIVE,
    });
    expect(db.profiles.get("clinic_1")?.stripeSubscriptionId).toBe("sub_1");
    expect(db.profiles.get("clinic_1")?.stripeSubscriptionScheduleId).toBe(
      null
    );
  });
});
