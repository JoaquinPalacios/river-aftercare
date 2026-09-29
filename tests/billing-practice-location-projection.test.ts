import {
  BillingStatus,
  EntitlementStatus,
  StripeEventProcessingStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import type Stripe from "stripe";

import { PRACTICE_SUBSCRIPTION_SHAPE_FAILURE_CODE } from "@/lib/billing/group-billing-codes";
import {
  decidePracticeLocationProjection,
  resolveWebhookSubscriptionCatalog,
} from "@/lib/billing/practice-location-projection";
import { processVerifiedStripeEvent } from "@/lib/billing/webhook-processor";
import {
  BILLING_TEST_ENV,
  GROUP_BILLING_TEST_ENV,
  PRACTICE_LOCATION_BILLING_TEST_ENV,
  uniqueP2002,
} from "./helpers/billing";

const PRACTICE_MONTHLY =
  PRACTICE_LOCATION_BILLING_TEST_ENV.STRIPE_PRACTICE_MONTHLY_PRICE_ID;
const PRACTICE_YEARLY =
  PRACTICE_LOCATION_BILLING_TEST_ENV.STRIPE_PRACTICE_YEARLY_PRICE_ID;
const LOCATION_MONTHLY =
  PRACTICE_LOCATION_BILLING_TEST_ENV.STRIPE_PRACTICE_ADDITIONAL_LOCATION_MONTHLY_PRICE_ID;
const LOCATION_YEARLY =
  PRACTICE_LOCATION_BILLING_TEST_ENV.STRIPE_PRACTICE_ADDITIONAL_LOCATION_YEARLY_PRICE_ID;
const ESSENTIAL_MONTHLY = BILLING_TEST_ENV.STRIPE_ESSENTIAL_MONTHLY_PRICE_ID;
const ESSENTIAL_YEARLY = BILLING_TEST_ENV.STRIPE_ESSENTIAL_YEARLY_PRICE_ID;
const GROUP_MONTHLY = GROUP_BILLING_TEST_ENV.STRIPE_GROUP_MONTHLY_PRICE_ID;
const GROUP_ADDON =
  GROUP_BILLING_TEST_ENV.STRIPE_GROUP_ADDITIONAL_SITE_MONTHLY_PRICE_ID;

describe("Practice location projection predicate", () => {
  it("stores N when a non-active Practice becomes an active paid projection", () => {
    expect(
      decidePracticeLocationProjection({
        projectedPlan: "PRACTICE",
        projectedEntitlementStatus: EntitlementStatus.ACTIVE,
        classifiedQuantity: 0,
        previous: {
          commercialPlan: "PRACTICE",
          entitlementStatus: EntitlementStatus.PENDING,
          purchasedAdditionalLocationQuantity: null,
        },
      })
    ).toEqual({
      action: "project",
      mode: "new_or_transitioning_into_practice",
      quantity: 0,
    });
    expect(
      decidePracticeLocationProjection({
        projectedPlan: "PRACTICE",
        projectedEntitlementStatus: EntitlementStatus.ACTIVE,
        classifiedQuantity: 2,
        previous: null,
      })
    ).toEqual({
      action: "project",
      mode: "new_or_transitioning_into_practice",
      quantity: 2,
    });
  });

  it("projects a new quantity for an already converted Practice", () => {
    expect(
      decidePracticeLocationProjection({
        projectedPlan: "PRACTICE",
        projectedEntitlementStatus: EntitlementStatus.ACTIVE,
        classifiedQuantity: 1,
        previous: {
          commercialPlan: "PRACTICE",
          entitlementStatus: EntitlementStatus.ACTIVE,
          purchasedAdditionalLocationQuantity: 0,
        },
      })
    ).toEqual({
      action: "project",
      mode: "established_converted_practice",
      quantity: 1,
    });
  });

  it("preserves null for an established Practice that was never converted", () => {
    for (const entitlementStatus of [
      EntitlementStatus.ACTIVE,
      EntitlementStatus.RESTRICTED,
      EntitlementStatus.ENDED,
    ]) {
      expect(
        decidePracticeLocationProjection({
          projectedPlan: "PRACTICE",
          projectedEntitlementStatus: EntitlementStatus.ACTIVE,
          classifiedQuantity: 0,
          previous: {
            commercialPlan: "PRACTICE",
            entitlementStatus,
            purchasedAdditionalLocationQuantity: null,
          },
        })
      ).toEqual({
        action: "preserve_legacy",
        mode: "established_legacy_practice",
      });
    }
  });

  it("does not write N before the entitlement is active", () => {
    expect(
      decidePracticeLocationProjection({
        projectedPlan: "PRACTICE",
        projectedEntitlementStatus: EntitlementStatus.PENDING,
        classifiedQuantity: 1,
        previous: null,
      })
    ).toEqual({
      action: "omit",
      mode: "new_or_transitioning_into_practice",
    });
    expect(
      decidePracticeLocationProjection({
        projectedPlan: "PRACTICE",
        projectedEntitlementStatus: EntitlementStatus.ACTIVE,
        classifiedQuantity: null,
        previous: {
          commercialPlan: "ESSENTIAL",
          entitlementStatus: EntitlementStatus.ACTIVE,
          purchasedAdditionalLocationQuantity: null,
        },
      })
    ).toEqual({
      action: "require_subscription",
      mode: "new_or_transitioning_into_practice",
    });
    expect(
      decidePracticeLocationProjection({
        projectedPlan: "PRACTICE",
        projectedEntitlementStatus: EntitlementStatus.ACTIVE,
        classifiedQuantity: null,
        previous: {
          commercialPlan: "PRACTICE",
          entitlementStatus: EntitlementStatus.ACTIVE,
          purchasedAdditionalLocationQuantity: 0,
        },
      })
    ).toEqual({
      action: "require_subscription",
      mode: "established_converted_practice",
    });
    expect(
      decidePracticeLocationProjection({
        projectedPlan: "PRACTICE",
        projectedEntitlementStatus: EntitlementStatus.ACTIVE,
        classifiedQuantity: null,
        previous: {
          commercialPlan: "PRACTICE",
          entitlementStatus: EntitlementStatus.ACTIVE,
          purchasedAdditionalLocationQuantity: null,
        },
      })
    ).toEqual({
      action: "omit",
      mode: "established_legacy_practice",
    });
    expect(
      decidePracticeLocationProjection({
        projectedPlan: "ESSENTIAL",
        projectedEntitlementStatus: EntitlementStatus.ACTIVE,
        classifiedQuantity: null,
        previous: {
          commercialPlan: "PRACTICE",
          entitlementStatus: EntitlementStatus.ACTIVE,
          purchasedAdditionalLocationQuantity: 2,
        },
      })
    ).toEqual({
      action: "omit",
      mode: "outside_practice_quantity",
    });
  });
});

describe("webhook subscription catalogue", () => {
  it("uses subscription items when the invoice line is the add-on price", () => {
    expect(
      resolveWebhookSubscriptionCatalog({
        subscriptionItems: [
          { priceId: LOCATION_MONTHLY, quantity: 2 },
          { priceId: PRACTICE_MONTHLY, quantity: 1 },
        ],
        snapshotPriceId: LOCATION_MONTHLY,
        previous: null,
        env: PRACTICE_LOCATION_BILLING_TEST_ENV,
      })
    ).toEqual({
      kind: "project",
      mappedPrice: { plan: "PRACTICE", interval: "MONTHLY" },
      stripePriceId: PRACTICE_MONTHLY,
      practiceAdditionalLocationQuantity: 2,
    });
  });

  it("keeps an Essential invoice for an established Practice subscription", () => {
    expect(
      resolveWebhookSubscriptionCatalog({
        subscriptionItems: [{ priceId: PRACTICE_MONTHLY, quantity: 1 }],
        snapshotPriceId: ESSENTIAL_MONTHLY,
        previous: {
          commercialPlan: "PRACTICE",
          entitlementStatus: EntitlementStatus.ACTIVE,
        },
        env: BILLING_TEST_ENV,
      })
    ).toMatchObject({
      kind: "project",
      mappedPrice: { plan: "ESSENTIAL", interval: "MONTHLY" },
      practiceAdditionalLocationQuantity: null,
    });
  });

  it("does not let that Essential invoice override a new Practice activation", () => {
    expect(
      resolveWebhookSubscriptionCatalog({
        subscriptionItems: [{ priceId: PRACTICE_MONTHLY, quantity: 1 }],
        snapshotPriceId: ESSENTIAL_MONTHLY,
        previous: {
          commercialPlan: "PRACTICE",
          entitlementStatus: EntitlementStatus.PENDING,
        },
        env: BILLING_TEST_ENV,
      })
    ).toMatchObject({
      mappedPrice: { plan: "PRACTICE" },
      practiceAdditionalLocationQuantity: 0,
    });
  });
});

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
  const profiles = new Map<string, Record<string, unknown>>();
  const entitlements = new Map<string, Record<string, unknown>>();
  const receipts = new Map<string, Receipt>();
  const locationCalls: string[] = [];
  let receiptSeq = 0;

  const rejectLocation = async (operation: string) => {
    locationCalls.push(operation);
    throw new Error(`ClinicLocation ${operation} is not part of projection`);
  };

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
          clinicId?: string;
          stripeCustomerId?: string;
          stripeSubscriptionId?: string;
        };
      }) => {
        if (where.clinicId) {
          return profiles.get(where.clinicId) ?? null;
        }
        return (
          [...profiles.values()].find((row) => {
            if (where.stripeCustomerId) {
              return row.stripeCustomerId === where.stripeCustomerId;
            }
            return row.stripeSubscriptionId === where.stripeSubscriptionId;
          }) ?? null
        );
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
          stripeSubscriptionScheduleId: null,
          stripePlanDowngradeAttemptId: null,
          ...(profiles.get(where.clinicId) ?? {}),
          ...create,
          ...update,
          clinicId: where.clinicId,
        };
        profiles.set(where.clinicId, next);
        return next;
      },
      update: async ({
        where,
        data,
      }: {
        where: { clinicId: string };
        data: Record<string, unknown>;
      }) => {
        const next = { ...(profiles.get(where.clinicId) ?? {}), ...data };
        profiles.set(where.clinicId, next);
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
      update: async () => {
        throw new Error("direct entitlement update is unused");
      },
    },
    stripeEventReceipt: {
      create: async ({
        data,
      }: {
        data: { stripeEventId: string; eventType: string };
      }) => {
        if (receipts.has(data.stripeEventId)) {
          throw uniqueP2002(["stripeEventId"]);
        }
        const row: Receipt = {
          id: `rcpt_${++receiptSeq}`,
          stripeEventId: data.stripeEventId,
          eventType: data.eventType,
          processingStatus: StripeEventProcessingStatus.RECEIVED,
          clinicId: null,
          failureText: null,
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
    clinicLocation: {
      count: () => rejectLocation("count"),
      create: () => rejectLocation("create"),
      update: () => rejectLocation("update"),
      updateMany: () => rejectLocation("updateMany"),
      delete: () => rejectLocation("delete"),
      deleteMany: () => rejectLocation("deleteMany"),
    },
    async $executeRaw() {
      return 0;
    },
    async $transaction<T>(fn: (tx: typeof db) => Promise<T>): Promise<T> {
      return fn(db);
    },
    entitlements,
    receipts,
    locationCalls,
  };

  return db;
}

function paidInvoice(input: {
  id?: string;
  priceId: string;
  type?: "invoice.paid" | "invoice.payment_failed";
}): Stripe.Event {
  return {
    id: input.id ?? "evt_invoice_paid_1",
    object: "event",
    created: 1_747_000_000,
    type: input.type ?? "invoice.paid",
    data: {
      object: {
        id: "in_1",
        object: "invoice",
        status: input.type === "invoice.payment_failed" ? "open" : "paid",
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
              id: "il_1",
              pricing: { price_details: { price: input.priceId } },
              quantity: 9,
            },
          ],
        },
        period_start: 1_746_000_000,
        period_end: 1_748_600_000,
      },
    },
  } as unknown as Stripe.Event;
}

function subscriptionOf(input: {
  items: Array<{ price: string; quantity?: number }>;
  status?: string;
  cancelAtPeriodEnd?: boolean;
}): Stripe.Subscription {
  return {
    id: "sub_1",
    object: "subscription",
    status: input.status ?? "active",
    customer: "cus_1",
    cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
    metadata: { clinicId: "clinic_1" },
    items: {
      data: input.items.map((item, index) => ({
        id: `si_${index + 1}`,
        price: { id: item.price },
        quantity: item.quantity,
        current_period_start: 1_746_000_000,
        current_period_end: 1_748_600_000,
      })),
    },
  } as unknown as Stripe.Subscription;
}

function subscriptionEvent(
  subscription: Stripe.Subscription,
  id = "evt_sub_updated"
): Stripe.Event {
  return {
    id,
    object: "event",
    created: 1_747_100_000,
    type: "customer.subscription.updated",
    data: { object: subscription },
  } as Stripe.Event;
}

async function projectInvoice(input: {
  db: ReturnType<typeof createDb>;
  priceId: string;
  subscription: Stripe.Subscription | null;
  env?: Record<string, string | undefined>;
  id?: string;
  type?: "invoice.paid" | "invoice.payment_failed";
}) {
  return processVerifiedStripeEvent(
    paidInvoice({
      id: input.id,
      priceId: input.priceId,
      type: input.type,
    }),
    {
      prisma: input.db as never,
      reader: input.subscription
        ? { retrieveSubscription: async () => input.subscription }
        : null,
      env: input.env ?? PRACTICE_LOCATION_BILLING_TEST_ENV,
    }
  );
}

function seedEntitlement(
  db: ReturnType<typeof createDb>,
  row: Record<string, unknown>
) {
  db.entitlements.set("clinic_1", {
    commercialPlan: "PRACTICE",
    billingInterval: "MONTHLY",
    billingStatus: BillingStatus.ACTIVE,
    entitlementStatus: EntitlementStatus.ACTIVE,
    stripePriceId: PRACTICE_MONTHLY,
    siteAllowance: 1,
    locationAllowance: 1,
    purchasedAdditionalLocationQuantity: null,
    extraLocationAllowance: 0,
    extraSiteAllowance: 0,
    cancelAtPeriodEnd: false,
    ...row,
  });
}

describe("Practice additional location webhook projection", () => {
  it("stores N=0 for a new monthly or yearly Practice base", async () => {
    for (const [priceId, interval] of [
      [PRACTICE_MONTHLY, "MONTHLY"],
      [PRACTICE_YEARLY, "YEARLY"],
    ] as const) {
      const db = createDb();
      const result = await projectInvoice({
        db,
        priceId,
        subscription: subscriptionOf({ items: [{ price: priceId }] }),
        env: BILLING_TEST_ENV,
      });
      expect(result.outcome).toBe("processed");
      expect(db.entitlements.get("clinic_1")).toMatchObject({
        commercialPlan: "PRACTICE",
        billingInterval: interval,
        entitlementStatus: EntitlementStatus.ACTIVE,
        billingStatus: BillingStatus.ACTIVE,
        purchasedAdditionalLocationQuantity: 0,
        siteAllowance: 1,
        locationAllowance: 1,
        stripePriceId: priceId,
      });
      expect(db.locationCalls).toEqual([]);
    }
  });

  it("stores the add-on quantity for a new Practice subscription", async () => {
    const cases = [
      { base: PRACTICE_MONTHLY, addon: LOCATION_MONTHLY, quantity: 1 },
      { base: PRACTICE_MONTHLY, addon: LOCATION_MONTHLY, quantity: 2 },
      { base: PRACTICE_YEARLY, addon: LOCATION_YEARLY, quantity: 1 },
      { base: PRACTICE_YEARLY, addon: LOCATION_YEARLY, quantity: 2 },
    ];
    for (const item of cases) {
      const db = createDb();
      await projectInvoice({
        db,
        priceId: item.addon,
        subscription: subscriptionOf({
          items: [
            { price: item.addon, quantity: item.quantity },
            { price: item.base, quantity: 1 },
          ],
        }),
      });
      expect(db.entitlements.get("clinic_1")).toMatchObject({
        commercialPlan: "PRACTICE",
        purchasedAdditionalLocationQuantity: item.quantity,
        siteAllowance: 1,
        locationAllowance: 1 + item.quantity,
        stripePriceId: item.base,
      });
    }
  });

  it("reconciles a pending Practice allowance onto the derived formula", async () => {
    const db = createDb();
    seedEntitlement(db, {
      billingStatus: BillingStatus.PAYMENT_PENDING,
      entitlementStatus: EntitlementStatus.PENDING,
      locationAllowance: 3,
      extraLocationAllowance: 1,
    });
    await projectInvoice({
      db,
      priceId: PRACTICE_MONTHLY,
      subscription: subscriptionOf({ items: [{ price: PRACTICE_MONTHLY }] }),
    });
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      entitlementStatus: EntitlementStatus.ACTIVE,
      purchasedAdditionalLocationQuantity: 0,
      extraLocationAllowance: 1,
      siteAllowance: 1,
      locationAllowance: 2,
    });
  });

  it("leaves checkout, pending payment, and incomplete subscriptions unprojected", async () => {
    const checkout = createDb();
    await processVerifiedStripeEvent(
      {
        id: "evt_checkout",
        object: "event",
        created: 1_747_000_000,
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_1",
            object: "checkout.session",
            customer: "cus_1",
            subscription: "sub_1",
            client_reference_id: "clinic_1",
            metadata: { clinicId: "clinic_1" },
            payment_status: "unpaid",
            status: "complete",
          },
        },
      } as unknown as Stripe.Event,
      {
        prisma: checkout as never,
        reader: {
          retrieveSubscription: async () =>
            subscriptionOf({
              items: [
                { price: PRACTICE_MONTHLY, quantity: 1 },
                { price: LOCATION_MONTHLY, quantity: 2 },
              ],
              status: "incomplete",
            }),
        },
        env: PRACTICE_LOCATION_BILLING_TEST_ENV,
      }
    );
    expect(checkout.entitlements.get("clinic_1")).toMatchObject({
      billingStatus: BillingStatus.PAYMENT_PENDING,
      entitlementStatus: EntitlementStatus.PENDING,
    });
    expect(
      checkout.entitlements.get("clinic_1")?.purchasedAdditionalLocationQuantity
    ).toBeUndefined();

    const becs = createDb();
    await processVerifiedStripeEvent(
      {
        id: "evt_becs",
        object: "event",
        created: 1_747_000_000,
        type: "checkout.session.async_payment_succeeded",
        data: {
          object: {
            id: "cs_becs",
            object: "checkout.session",
            customer: "cus_1",
            subscription: "sub_1",
            metadata: { clinicId: "clinic_1" },
            payment_status: "paid",
            status: "complete",
          },
        },
      } as unknown as Stripe.Event,
      {
        prisma: becs as never,
        reader: {
          retrieveSubscription: async () =>
            subscriptionOf({ items: [{ price: PRACTICE_MONTHLY }] }),
        },
        env: BILLING_TEST_ENV,
      }
    );
    expect(becs.entitlements.get("clinic_1")).toMatchObject({
      entitlementStatus: EntitlementStatus.PENDING,
      billingStatus: BillingStatus.PAYMENT_PENDING,
    });
    expect(
      becs.entitlements.get("clinic_1")?.purchasedAdditionalLocationQuantity
    ).toBeUndefined();

    const incomplete = createDb();
    await projectInvoice({
      db: incomplete,
      priceId: PRACTICE_MONTHLY,
      subscription: subscriptionOf({
        items: [{ price: PRACTICE_MONTHLY }],
        status: "incomplete",
      }),
    });
    expect(incomplete.entitlements.get("clinic_1")).toMatchObject({
      entitlementStatus: EntitlementStatus.PENDING,
    });
    expect(
      incomplete.entitlements.get("clinic_1")
        ?.purchasedAdditionalLocationQuantity
    ).toBeUndefined();
  });

  it("does not activate Practice when the subscription cannot be retrieved", async () => {
    const fresh = createDb();
    await expect(
      projectInvoice({
        db: fresh,
        id: "evt_new_missing",
        priceId: PRACTICE_MONTHLY,
        subscription: null,
        env: BILLING_TEST_ENV,
      })
    ).rejects.toThrow("Practice subscription could not be retrieved.");
    expect(fresh.entitlements.size).toBe(0);
    expect(fresh.receipts.get("evt_new_missing")?.processingStatus).toBe(
      StripeEventProcessingStatus.FAILED
    );

    const pending = createDb();
    seedEntitlement(pending, {
      billingStatus: BillingStatus.PAYMENT_PENDING,
      entitlementStatus: EntitlementStatus.PENDING,
      locationAllowance: 3,
    });
    await expect(
      projectInvoice({
        db: pending,
        id: "evt_pending_missing",
        priceId: PRACTICE_MONTHLY,
        subscription: null,
        env: BILLING_TEST_ENV,
      })
    ).rejects.toThrow("Practice subscription could not be retrieved.");
    expect(pending.entitlements.get("clinic_1")).toMatchObject({
      commercialPlan: "PRACTICE",
      billingStatus: BillingStatus.PAYMENT_PENDING,
      entitlementStatus: EntitlementStatus.PENDING,
      purchasedAdditionalLocationQuantity: null,
      locationAllowance: 3,
    });
  });

  it("keeps an invalid new Practice shape from becoming ACTIVE", async () => {
    const db = createDb();
    seedEntitlement(db, {
      billingStatus: BillingStatus.OFFER_PREPARED,
      entitlementStatus: EntitlementStatus.PENDING,
      locationAllowance: 1,
    });
    const result = await projectInvoice({
      db,
      id: "evt_pending_invalid",
      priceId: PRACTICE_MONTHLY,
      subscription: subscriptionOf({
        items: [{ price: PRACTICE_MONTHLY, quantity: 2 }],
      }),
    });
    expect(result.outcome).toBe("invalid_practice_shape");
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      entitlementStatus: EntitlementStatus.PENDING,
      billingStatus: BillingStatus.OFFER_PREPARED,
      purchasedAdditionalLocationQuantity: null,
    });

    const fresh = createDb();
    const freshResult = await projectInvoice({
      db: fresh,
      id: "evt_new_invalid",
      priceId: PRACTICE_MONTHLY,
      subscription: subscriptionOf({
        items: [{ price: PRACTICE_MONTHLY, quantity: 2 }],
      }),
    });
    expect(freshResult.outcome).toBe("invalid_practice_shape");
    expect(fresh.entitlements.size).toBe(0);
    expect(fresh.receipts.get("evt_new_invalid")?.processingStatus).toBe(
      StripeEventProcessingStatus.FAILED
    );
  });

  it("lets a later delivery activate Practice after a missing subscription", async () => {
    const db = createDb();
    const event = paidInvoice({
      id: "evt_retry_activation",
      priceId: PRACTICE_MONTHLY,
    });
    const missing = {
      prisma: db as never,
      reader: { retrieveSubscription: async () => null },
      env: BILLING_TEST_ENV,
    };
    await expect(processVerifiedStripeEvent(event, missing)).rejects.toThrow(
      "Practice subscription could not be retrieved."
    );
    expect(db.entitlements.size).toBe(0);
    expect(db.receipts.get("evt_retry_activation")?.processingStatus).toBe(
      StripeEventProcessingStatus.FAILED
    );

    const second = await processVerifiedStripeEvent(event, {
      prisma: db as never,
      reader: {
        retrieveSubscription: async () =>
          subscriptionOf({ items: [{ price: PRACTICE_MONTHLY }] }),
      },
      env: BILLING_TEST_ENV,
    });
    expect(second.outcome).toBe("processed");
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      commercialPlan: "PRACTICE",
      entitlementStatus: EntitlementStatus.ACTIVE,
      purchasedAdditionalLocationQuantity: 0,
      siteAllowance: 1,
      locationAllowance: 1,
    });
    expect(db.receipts.get("evt_retry_activation")?.processingStatus).toBe(
      StripeEventProcessingStatus.PROCESSED
    );
  });

  it("lets a later event activate Practice after an invalid shape", async () => {
    const db = createDb();
    seedEntitlement(db, {
      billingStatus: BillingStatus.PAYMENT_PENDING,
      entitlementStatus: EntitlementStatus.PENDING,
      locationAllowance: 9,
    });
    const invalid = await projectInvoice({
      db,
      id: "evt_shape_then_ok_bad",
      priceId: PRACTICE_MONTHLY,
      subscription: subscriptionOf({
        items: [{ price: PRACTICE_MONTHLY, quantity: 2 }],
      }),
    });
    expect(invalid.outcome).toBe("invalid_practice_shape");
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      entitlementStatus: EntitlementStatus.PENDING,
      purchasedAdditionalLocationQuantity: null,
      locationAllowance: 9,
    });

    const activated = await projectInvoice({
      db,
      id: "evt_shape_then_ok_good",
      priceId: LOCATION_MONTHLY,
      subscription: subscriptionOf({
        items: [
          { price: PRACTICE_MONTHLY, quantity: 1 },
          { price: LOCATION_MONTHLY, quantity: 2 },
        ],
      }),
    });
    expect(activated.outcome).toBe("processed");
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      commercialPlan: "PRACTICE",
      entitlementStatus: EntitlementStatus.ACTIVE,
      purchasedAdditionalLocationQuantity: 2,
      siteAllowance: 1,
      locationAllowance: 3,
    });
  });

  it("projects quantity changes for an already converted Practice", async () => {
    const stays = createDb();
    seedEntitlement(stays, {
      purchasedAdditionalLocationQuantity: 0,
      locationAllowance: 1,
      extraLocationAllowance: 2,
    });
    await projectInvoice({
      db: stays,
      id: "evt_stay_0",
      priceId: PRACTICE_MONTHLY,
      subscription: subscriptionOf({ items: [{ price: PRACTICE_MONTHLY }] }),
    });
    expect(stays.entitlements.get("clinic_1")).toMatchObject({
      purchasedAdditionalLocationQuantity: 0,
      extraLocationAllowance: 2,
      siteAllowance: 1,
      locationAllowance: 3,
    });

    const up = createDb();
    seedEntitlement(up, {
      purchasedAdditionalLocationQuantity: 0,
      extraLocationAllowance: 2,
      locationAllowance: 3,
    });
    await projectInvoice({
      db: up,
      id: "evt_up",
      priceId: LOCATION_MONTHLY,
      subscription: subscriptionOf({
        items: [
          { price: PRACTICE_MONTHLY, quantity: 1 },
          { price: LOCATION_MONTHLY, quantity: 1 },
        ],
      }),
    });
    expect(up.entitlements.get("clinic_1")).toMatchObject({
      purchasedAdditionalLocationQuantity: 1,
      extraLocationAllowance: 2,
      siteAllowance: 1,
      locationAllowance: 4,
    });

    const down = createDb();
    seedEntitlement(down, {
      purchasedAdditionalLocationQuantity: 2,
      extraLocationAllowance: 2,
      locationAllowance: 5,
    });
    await processVerifiedStripeEvent(
      subscriptionEvent(
        subscriptionOf({
          items: [
            { price: LOCATION_MONTHLY, quantity: 1 },
            { price: PRACTICE_MONTHLY, quantity: 1 },
          ],
        }),
        "evt_down"
      ),
      {
        prisma: down as never,
        reader: {
          retrieveSubscription: async () =>
            subscriptionOf({
              items: [
                { price: LOCATION_MONTHLY, quantity: 1 },
                { price: PRACTICE_MONTHLY, quantity: 1 },
              ],
            }),
        },
        env: PRACTICE_LOCATION_BILLING_TEST_ENV,
      }
    );
    expect(down.entitlements.get("clinic_1")).toMatchObject({
      purchasedAdditionalLocationQuantity: 1,
      extraLocationAllowance: 2,
      siteAllowance: 1,
      locationAllowance: 4,
    });
    expect(down.locationCalls).toEqual([]);
  });

  it("keeps a converted Practice quantity when the subscription is unavailable or malformed", async () => {
    const missing = createDb();
    seedEntitlement(missing, {
      purchasedAdditionalLocationQuantity: 0,
      locationAllowance: 5,
      extraLocationAllowance: 0,
      billingStatus: BillingStatus.PAST_DUE,
    });
    await expect(
      projectInvoice({
        db: missing,
        id: "evt_converted_missing",
        priceId: PRACTICE_MONTHLY,
        subscription: null,
        env: BILLING_TEST_ENV,
      })
    ).rejects.toThrow("Practice subscription could not be retrieved.");
    expect(missing.entitlements.get("clinic_1")).toMatchObject({
      commercialPlan: "PRACTICE",
      entitlementStatus: EntitlementStatus.ACTIVE,
      billingStatus: BillingStatus.PAST_DUE,
      purchasedAdditionalLocationQuantity: 0,
      locationAllowance: 5,
    });
    expect(
      missing.receipts.get("evt_converted_missing")?.processingStatus
    ).toBe(StripeEventProcessingStatus.FAILED);

    const malformed = createDb();
    seedEntitlement(malformed, {
      purchasedAdditionalLocationQuantity: 2,
      extraLocationAllowance: 4,
      locationAllowance: 7,
    });
    const result = await projectInvoice({
      db: malformed,
      id: "evt_converted_malformed",
      priceId: PRACTICE_MONTHLY,
      subscription: subscriptionOf({
        items: [{ price: PRACTICE_MONTHLY, quantity: 2 }],
      }),
    });
    expect(result.outcome).toBe("invalid_practice_shape");
    expect(malformed.entitlements.get("clinic_1")).toMatchObject({
      commercialPlan: "PRACTICE",
      entitlementStatus: EntitlementStatus.ACTIVE,
      purchasedAdditionalLocationQuantity: 2,
      extraLocationAllowance: 4,
      locationAllowance: 7,
    });
    expect(malformed.locationCalls).toEqual([]);
  });

  it("does not convert legacy active Practice rows from null", async () => {
    for (const allowance of [1, 2, 3]) {
      const db = createDb();
      seedEntitlement(db, { locationAllowance: allowance });
      await projectInvoice({
        db,
        id: `evt_legacy_${allowance}`,
        priceId: PRACTICE_MONTHLY,
        subscription: subscriptionOf({
          items: [{ price: PRACTICE_MONTHLY, quantity: 1 }],
        }),
      });
      expect(db.entitlements.get("clinic_1")).toMatchObject({
        commercialPlan: "PRACTICE",
        entitlementStatus: EntitlementStatus.ACTIVE,
        purchasedAdditionalLocationQuantity: null,
        locationAllowance: allowance,
        siteAllowance: 1,
        extraLocationAllowance: 0,
      });

      await processVerifiedStripeEvent(
        subscriptionEvent(
          subscriptionOf({ items: [{ price: PRACTICE_MONTHLY }] }),
          `evt_refresh_${allowance}`
        ),
        {
          prisma: db as never,
          reader: {
            retrieveSubscription: async () =>
              subscriptionOf({
                items: [
                  { price: PRACTICE_MONTHLY, quantity: 1 },
                  { price: LOCATION_MONTHLY, quantity: allowance },
                ],
              }),
          },
          env: PRACTICE_LOCATION_BILLING_TEST_ENV,
        }
      );
      expect(db.entitlements.get("clinic_1")).toMatchObject({
        purchasedAdditionalLocationQuantity: null,
        locationAllowance: allowance,
        extraLocationAllowance: 0,
      });
    }
  });

  it("keeps an established legacy Practice when the subscription cannot be retrieved", async () => {
    const db = createDb();
    seedEntitlement(db, { locationAllowance: 3 });
    const result = await projectInvoice({
      db,
      id: "evt_legacy_missing",
      priceId: PRACTICE_MONTHLY,
      subscription: null,
      env: BILLING_TEST_ENV,
    });
    expect(result.outcome).toBe("processed");
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      commercialPlan: "PRACTICE",
      entitlementStatus: EntitlementStatus.ACTIVE,
      purchasedAdditionalLocationQuantity: null,
      locationAllowance: 3,
      siteAllowance: 1,
    });
    expect(db.receipts.get("evt_legacy_missing")?.processingStatus).toBe(
      StripeEventProcessingStatus.PROCESSED
    );
    expect(db.locationCalls).toEqual([]);
  });

  it.each([
    [
      "duplicate base",
      [
        { price: PRACTICE_MONTHLY, quantity: 1 },
        { price: PRACTICE_YEARLY, quantity: 1 },
      ],
      "duplicate_base",
    ],
    [
      "duplicate add-on",
      [
        { price: PRACTICE_MONTHLY, quantity: 1 },
        { price: LOCATION_MONTHLY, quantity: 1 },
        { price: LOCATION_MONTHLY, quantity: 2 },
      ],
      "duplicate_addon",
    ],
    [
      "add-on without base",
      [{ price: LOCATION_MONTHLY, quantity: 1 }],
      "addon_without_base",
    ],
    [
      "interval mismatch",
      [
        { price: PRACTICE_MONTHLY, quantity: 1 },
        { price: LOCATION_YEARLY, quantity: 1 },
      ],
      "interval_mismatch",
    ],
    [
      "essential mix",
      [
        { price: PRACTICE_MONTHLY, quantity: 1 },
        { price: ESSENTIAL_MONTHLY, quantity: 1 },
      ],
      "mixed_plan",
    ],
    [
      "base quantity",
      [{ price: PRACTICE_MONTHLY, quantity: 2 }],
      "base_quantity",
    ],
    [
      "add-on quantity",
      [
        { price: PRACTICE_MONTHLY, quantity: 1 },
        { price: LOCATION_MONTHLY, quantity: 0 },
      ],
      "addon_quantity",
    ],
    [
      "negative quantity",
      [
        { price: PRACTICE_MONTHLY, quantity: 1 },
        { price: LOCATION_MONTHLY, quantity: -1 },
      ],
      "invalid_quantity",
    ],
    [
      "fractional quantity",
      [{ price: PRACTICE_MONTHLY, quantity: 1.5 }],
      "invalid_quantity",
    ],
  ] as const)(
    "fails closed for %s without rewriting the entitlement",
    async (_label, items, reason) => {
      const db = createDb();
      seedEntitlement(db, { locationAllowance: 3 });
      const result = await projectInvoice({
        db,
        id: `evt_${reason}`,
        priceId: PRACTICE_MONTHLY,
        subscription: subscriptionOf({ items: [...items] }),
      });
      expect(result.outcome).toBe("invalid_practice_shape");
      expect(db.receipts.get(`evt_${reason}`)).toMatchObject({
        processingStatus: StripeEventProcessingStatus.FAILED,
      });
      expect(db.entitlements.get("clinic_1")).toMatchObject({
        commercialPlan: "PRACTICE",
        purchasedAdditionalLocationQuantity: null,
        locationAllowance: 3,
        entitlementStatus: EntitlementStatus.ACTIVE,
      });
      expect(PRACTICE_SUBSCRIPTION_SHAPE_FAILURE_CODE).toBe(
        "practice_subscription_shape_invalid"
      );
    }
  );

  it("fails closed for an unknown second item when the add-on price is not configured", async () => {
    const db = createDb();
    seedEntitlement(db, { locationAllowance: 3 });
    const result = await projectInvoice({
      db,
      id: "evt_unknown_item",
      priceId: PRACTICE_MONTHLY,
      subscription: subscriptionOf({
        items: [
          { price: PRACTICE_MONTHLY, quantity: 1 },
          { price: "price_not_configured", quantity: 1 },
        ],
      }),
      env: BILLING_TEST_ENV,
    });
    expect(result.outcome).toBe("invalid_practice_shape");
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      purchasedAdditionalLocationQuantity: null,
      locationAllowance: 3,
    });
  });

  it("fails closed for Practice mixed with Group without activating Group", async () => {
    for (const extra of [GROUP_MONTHLY, GROUP_ADDON]) {
      const db = createDb();
      seedEntitlement(db, { locationAllowance: 3 });
      const result = await projectInvoice({
        db,
        id: `evt_group_${extra}`,
        priceId: PRACTICE_MONTHLY,
        subscription: subscriptionOf({
          items: [
            { price: extra, quantity: 1 },
            { price: PRACTICE_MONTHLY, quantity: 1 },
          ],
        }),
        env: GROUP_BILLING_TEST_ENV,
      });
      expect(result.outcome).toBe("invalid_group_shape");
      expect(db.entitlements.get("clinic_1")).toMatchObject({
        commercialPlan: "PRACTICE",
        purchasedAdditionalLocationQuantity: null,
        locationAllowance: 3,
      });
      expect(
        db.entitlements.get("clinic_1")?.purchasedAdditionalSiteQuantity
      ).toBeUndefined();
    }
  });

  it("keeps Essential activation on one base item and does not record a location quantity", async () => {
    for (const priceId of [ESSENTIAL_MONTHLY, ESSENTIAL_YEARLY]) {
      const db = createDb();
      await projectInvoice({
        db,
        id: `evt_essential_${priceId}`,
        priceId,
        subscription: subscriptionOf({ items: [{ price: priceId }] }),
        env: BILLING_TEST_ENV,
      });
      expect(db.entitlements.get("clinic_1")).toMatchObject({
        commercialPlan: "ESSENTIAL",
        entitlementStatus: EntitlementStatus.ACTIVE,
      });
      expect(
        db.entitlements.get("clinic_1")?.purchasedAdditionalLocationQuantity
      ).toBeUndefined();
    }

    const invoiceOnly = createDb();
    const result = await projectInvoice({
      db: invoiceOnly,
      id: "evt_essential_invoice_only",
      priceId: ESSENTIAL_MONTHLY,
      subscription: null,
      env: BILLING_TEST_ENV,
    });
    expect(result.outcome).toBe("processed");
    expect(invoiceOnly.entitlements.get("clinic_1")).toMatchObject({
      commercialPlan: "ESSENTIAL",
      entitlementStatus: EntitlementStatus.ACTIVE,
    });
    expect(
      invoiceOnly.entitlements.get("clinic_1")
        ?.purchasedAdditionalLocationQuantity
    ).toBeUndefined();
  });

  it("projects Practice quantity when Essential is paid on a retrieved subscription", async () => {
    const base = createDb();
    seedEntitlement(base, {
      commercialPlan: "ESSENTIAL",
      stripePriceId: ESSENTIAL_MONTHLY,
      locationAllowance: 1,
      extraLocationAllowance: 0,
    });
    await projectInvoice({
      db: base,
      id: "evt_essential_base",
      priceId: PRACTICE_MONTHLY,
      subscription: subscriptionOf({ items: [{ price: PRACTICE_MONTHLY }] }),
      env: BILLING_TEST_ENV,
    });
    expect(base.entitlements.get("clinic_1")).toMatchObject({
      commercialPlan: "PRACTICE",
      entitlementStatus: EntitlementStatus.ACTIVE,
      purchasedAdditionalLocationQuantity: 0,
      siteAllowance: 1,
      locationAllowance: 1,
    });

    const withAddon = createDb();
    seedEntitlement(withAddon, {
      commercialPlan: "ESSENTIAL",
      stripePriceId: ESSENTIAL_MONTHLY,
      locationAllowance: 1,
      extraLocationAllowance: 1,
    });
    await projectInvoice({
      db: withAddon,
      id: "evt_essential_addon",
      priceId: PRACTICE_MONTHLY,
      subscription: subscriptionOf({
        items: [
          { price: LOCATION_MONTHLY, quantity: 2 },
          { price: PRACTICE_MONTHLY, quantity: 1 },
        ],
      }),
    });
    expect(withAddon.entitlements.get("clinic_1")).toMatchObject({
      commercialPlan: "PRACTICE",
      entitlementStatus: EntitlementStatus.ACTIVE,
      purchasedAdditionalLocationQuantity: 2,
      extraLocationAllowance: 1,
      siteAllowance: 1,
      locationAllowance: 4,
    });
  });

  it("does not turn Essential into Practice when the subscription is missing or invalid", async () => {
    const missing = createDb();
    seedEntitlement(missing, {
      commercialPlan: "ESSENTIAL",
      stripePriceId: ESSENTIAL_MONTHLY,
      locationAllowance: 1,
    });
    await expect(
      projectInvoice({
        db: missing,
        id: "evt_essential_missing",
        priceId: PRACTICE_MONTHLY,
        subscription: null,
        env: BILLING_TEST_ENV,
      })
    ).rejects.toThrow("Practice subscription could not be retrieved.");
    expect(missing.entitlements.get("clinic_1")).toMatchObject({
      commercialPlan: "ESSENTIAL",
      entitlementStatus: EntitlementStatus.ACTIVE,
      stripePriceId: ESSENTIAL_MONTHLY,
      locationAllowance: 1,
    });
    expect(
      missing.entitlements.get("clinic_1")?.purchasedAdditionalLocationQuantity
    ).toBeNull();

    const invalid = createDb();
    seedEntitlement(invalid, {
      commercialPlan: "ESSENTIAL",
      stripePriceId: ESSENTIAL_MONTHLY,
      locationAllowance: 1,
    });
    const result = await projectInvoice({
      db: invalid,
      id: "evt_essential_invalid",
      priceId: PRACTICE_MONTHLY,
      subscription: subscriptionOf({
        items: [
          { price: PRACTICE_MONTHLY, quantity: 1 },
          { price: ESSENTIAL_MONTHLY, quantity: 1 },
        ],
      }),
    });
    expect(result.outcome).toBe("invalid_practice_shape");
    expect(invalid.entitlements.get("clinic_1")).toMatchObject({
      commercialPlan: "ESSENTIAL",
      entitlementStatus: EntitlementStatus.ACTIVE,
      stripePriceId: ESSENTIAL_MONTHLY,
      locationAllowance: 1,
    });
  });

  it("keeps a legacy Practice allowance when the Essential downgrade invoice arrives", async () => {
    const db = createDb();
    seedEntitlement(db, { locationAllowance: 3 });
    await projectInvoice({
      db,
      priceId: ESSENTIAL_MONTHLY,
      subscription: subscriptionOf({ items: [{ price: PRACTICE_MONTHLY }] }),
      env: BILLING_TEST_ENV,
    });
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      commercialPlan: "ESSENTIAL",
      purchasedAdditionalLocationQuantity: null,
      locationAllowance: 3,
    });

    const converted = createDb();
    seedEntitlement(converted, {
      purchasedAdditionalLocationQuantity: 2,
      locationAllowance: 3,
    });
    const convertedResult = await projectInvoice({
      db: converted,
      id: "evt_converted_downgrade",
      priceId: ESSENTIAL_MONTHLY,
      subscription: subscriptionOf({ items: [{ price: PRACTICE_MONTHLY }] }),
      env: BILLING_TEST_ENV,
    });
    expect(convertedResult.outcome).toBe("processed");
    expect(converted.entitlements.get("clinic_1")).toMatchObject({
      commercialPlan: "ESSENTIAL",
      entitlementStatus: EntitlementStatus.ACTIVE,
      purchasedAdditionalLocationQuantity: 2,
      locationAllowance: 3,
    });
  });

  it("keeps legacy capacity through past_due, unpaid, cancellation, and deletion", async () => {
    const db = createDb();
    seedEntitlement(db, { locationAllowance: 3 });
    const pastDue = subscriptionOf({
      items: [{ price: PRACTICE_MONTHLY }],
      status: "past_due",
    });
    await processVerifiedStripeEvent(
      subscriptionEvent(pastDue, "evt_past_due"),
      {
        prisma: db as never,
        reader: { retrieveSubscription: async () => pastDue },
        env: BILLING_TEST_ENV,
      }
    );
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      billingStatus: BillingStatus.PAST_DUE,
      entitlementStatus: EntitlementStatus.ACTIVE,
      purchasedAdditionalLocationQuantity: null,
      locationAllowance: 3,
    });

    const unpaid = subscriptionOf({
      items: [{ price: PRACTICE_MONTHLY }],
      status: "unpaid",
    });
    await processVerifiedStripeEvent(subscriptionEvent(unpaid, "evt_unpaid"), {
      prisma: db as never,
      reader: { retrieveSubscription: async () => unpaid },
      env: BILLING_TEST_ENV,
    });
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      billingStatus: BillingStatus.UNPAID,
      entitlementStatus: EntitlementStatus.RESTRICTED,
      purchasedAdditionalLocationQuantity: null,
      locationAllowance: 3,
    });

    const restored = createDb();
    seedEntitlement(restored, { locationAllowance: 2 });
    const cancel = subscriptionOf({
      items: [{ price: PRACTICE_MONTHLY }],
      cancelAtPeriodEnd: true,
    });
    await processVerifiedStripeEvent(subscriptionEvent(cancel, "evt_cancel"), {
      prisma: restored as never,
      reader: { retrieveSubscription: async () => cancel },
      env: BILLING_TEST_ENV,
    });
    expect(restored.entitlements.get("clinic_1")).toMatchObject({
      billingStatus: BillingStatus.CANCEL_AT_PERIOD_END,
      entitlementStatus: EntitlementStatus.ACTIVE,
      purchasedAdditionalLocationQuantity: null,
      locationAllowance: 2,
    });

    const ended = createDb();
    seedEntitlement(ended, { locationAllowance: 3 });
    await processVerifiedStripeEvent(
      {
        id: "evt_deleted",
        object: "event",
        created: 1_747_200_000,
        type: "customer.subscription.deleted",
        data: {
          object: {
            ...subscriptionOf({
              items: [{ price: PRACTICE_MONTHLY }],
              status: "canceled",
            }),
            object: "subscription",
          },
        },
      } as Stripe.Event,
      {
        prisma: ended as never,
        reader: {
          retrieveSubscription: async () =>
            subscriptionOf({
              items: [{ price: PRACTICE_MONTHLY }],
              status: "canceled",
            }),
        },
        env: BILLING_TEST_ENV,
      }
    );
    expect(ended.entitlements.get("clinic_1")).toMatchObject({
      billingStatus: BillingStatus.ENDED,
      entitlementStatus: EntitlementStatus.ENDED,
      purchasedAdditionalLocationQuantity: null,
      locationAllowance: 3,
    });
    expect(ended.locationCalls).toEqual([]);
  });

  it("keeps historical Practice quantity null when a restricted or ended row is paid again", async () => {
    for (const entitlementStatus of [
      EntitlementStatus.RESTRICTED,
      EntitlementStatus.ENDED,
    ]) {
      const db = createDb();
      seedEntitlement(db, {
        entitlementStatus,
        billingStatus:
          entitlementStatus === EntitlementStatus.ENDED
            ? BillingStatus.ENDED
            : BillingStatus.UNPAID,
        locationAllowance: 3,
      });
      await projectInvoice({
        db,
        id: `evt_restore_${entitlementStatus}`,
        priceId: PRACTICE_MONTHLY,
        subscription: subscriptionOf({ items: [{ price: PRACTICE_MONTHLY }] }),
        env: BILLING_TEST_ENV,
      });
      expect(db.entitlements.get("clinic_1")).toMatchObject({
        commercialPlan: "PRACTICE",
        entitlementStatus: EntitlementStatus.ACTIVE,
        billingStatus: BillingStatus.ACTIVE,
        purchasedAdditionalLocationQuantity: null,
        locationAllowance: 3,
      });
    }
  });

  it("is idempotent after a new Practice activation", async () => {
    const db = createDb();
    const event = paidInvoice({ priceId: PRACTICE_MONTHLY });
    const deps = {
      prisma: db as never,
      reader: {
        retrieveSubscription: async () =>
          subscriptionOf({ items: [{ price: PRACTICE_MONTHLY }] }),
      },
      env: BILLING_TEST_ENV,
    };
    await processVerifiedStripeEvent(event, deps);
    const second = await processVerifiedStripeEvent(event, deps);
    expect(second.outcome).toBe("duplicate");
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      purchasedAdditionalLocationQuantity: 0,
      locationAllowance: 1,
    });
  });
});
