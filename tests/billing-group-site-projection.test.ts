import {
  BillingStatus,
  EntitlementStatus,
  StripeEventProcessingStatus,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

import { GROUP_SUBSCRIPTION_SHAPE_FAILURE_CODE } from "@/lib/billing/group-billing-codes";
import { decideGroupSiteProjection } from "@/lib/billing/group-site-projection";
import { resolveWebhookSubscriptionCatalog } from "@/lib/billing/practice-location-projection";
import { processVerifiedStripeEvent } from "@/lib/billing/webhook-processor";
import * as report from "@/lib/observability/report-server-exception";
import {
  BILLING_TEST_ENV,
  GROUP_BILLING_TEST_ENV,
  PRACTICE_LOCATION_BILLING_TEST_ENV,
  uniqueP2002,
} from "./helpers/billing";

const GROUP_MONTHLY = GROUP_BILLING_TEST_ENV.STRIPE_GROUP_MONTHLY_PRICE_ID;
const GROUP_YEARLY = GROUP_BILLING_TEST_ENV.STRIPE_GROUP_YEARLY_PRICE_ID;
const ADDON_MONTHLY =
  GROUP_BILLING_TEST_ENV.STRIPE_GROUP_ADDITIONAL_SITE_MONTHLY_PRICE_ID;
const ADDON_YEARLY =
  GROUP_BILLING_TEST_ENV.STRIPE_GROUP_ADDITIONAL_SITE_YEARLY_PRICE_ID;
const PRACTICE_MONTHLY =
  PRACTICE_LOCATION_BILLING_TEST_ENV.STRIPE_PRACTICE_MONTHLY_PRICE_ID;
const LOCATION_MONTHLY =
  PRACTICE_LOCATION_BILLING_TEST_ENV.STRIPE_PRACTICE_ADDITIONAL_LOCATION_MONTHLY_PRICE_ID;
const ESSENTIAL_MONTHLY = BILLING_TEST_ENV.STRIPE_ESSENTIAL_MONTHLY_PRICE_ID;

describe("Group site projection predicate", () => {
  it("stores explicit N, including 0, when entering active Group", () => {
    expect(
      decideGroupSiteProjection({
        projectedPlan: "GROUP",
        projectedEntitlementStatus: EntitlementStatus.ACTIVE,
        classifiedQuantity: 0,
        previous: {
          commercialPlan: "GROUP",
          entitlementStatus: EntitlementStatus.PENDING,
          purchasedAdditionalSiteQuantity: null,
        },
      })
    ).toEqual({
      action: "project",
      mode: "new_or_transitioning_into_group",
      quantity: 0,
    });
    expect(
      decideGroupSiteProjection({
        projectedPlan: "GROUP",
        projectedEntitlementStatus: EntitlementStatus.ACTIVE,
        classifiedQuantity: 2,
        previous: null,
      })
    ).toEqual({
      action: "project",
      mode: "new_or_transitioning_into_group",
      quantity: 2,
    });
  });

  it("replaces N for an established converted Group and preserves legacy null", () => {
    expect(
      decideGroupSiteProjection({
        projectedPlan: "GROUP",
        projectedEntitlementStatus: EntitlementStatus.ACTIVE,
        classifiedQuantity: 2,
        previous: {
          commercialPlan: "GROUP",
          entitlementStatus: EntitlementStatus.ACTIVE,
          purchasedAdditionalSiteQuantity: 3,
        },
      })
    ).toEqual({
      action: "project",
      mode: "established_converted_group",
      quantity: 2,
    });
    for (const entitlementStatus of [
      EntitlementStatus.ACTIVE,
      EntitlementStatus.RESTRICTED,
      EntitlementStatus.ENDED,
    ]) {
      expect(
        decideGroupSiteProjection({
          projectedPlan: "GROUP",
          projectedEntitlementStatus: EntitlementStatus.ACTIVE,
          classifiedQuantity: 4,
          previous: {
            commercialPlan: "GROUP",
            entitlementStatus,
            purchasedAdditionalSiteQuantity: null,
          },
        })
      ).toEqual({
        action: "preserve_legacy",
        mode: "established_legacy_group",
      });
    }
  });

  it("requires the subscription before a new or converted Group becomes active", () => {
    expect(
      decideGroupSiteProjection({
        projectedPlan: "GROUP",
        projectedEntitlementStatus: EntitlementStatus.ACTIVE,
        classifiedQuantity: null,
        previous: {
          commercialPlan: "GROUP",
          entitlementStatus: EntitlementStatus.PENDING,
          purchasedAdditionalSiteQuantity: null,
        },
      }).action
    ).toBe("require_subscription");
    expect(
      decideGroupSiteProjection({
        projectedPlan: "GROUP",
        projectedEntitlementStatus: EntitlementStatus.PENDING,
        classifiedQuantity: 2,
        previous: null,
      })
    ).toMatchObject({ action: "omit" });
  });
});

describe("Group webhook catalogue", () => {
  it("reads N from subscription items, not the invoice line", () => {
    expect(
      resolveWebhookSubscriptionCatalog({
        subscriptionItems: [
          { priceId: ADDON_MONTHLY, quantity: 3 },
          { priceId: GROUP_MONTHLY, quantity: 1 },
        ],
        snapshotPriceId: ADDON_MONTHLY,
        previous: null,
        env: GROUP_BILLING_TEST_ENV,
      })
    ).toEqual({
      kind: "project",
      mappedPrice: { plan: "GROUP", interval: "MONTHLY" },
      stripePriceId: GROUP_MONTHLY,
      practiceAdditionalLocationQuantity: null,
      groupAdditionalSiteQuantity: 3,
    });
    expect(
      resolveWebhookSubscriptionCatalog({
        subscriptionItems: null,
        snapshotPriceId: GROUP_YEARLY,
        previous: null,
        env: GROUP_BILLING_TEST_ENV,
      })
    ).toMatchObject({
      mappedPrice: { plan: "GROUP", interval: "YEARLY" },
      groupAdditionalSiteQuantity: null,
      practiceAdditionalLocationQuantity: null,
    });
  });

  it("does not project a Group add-on into Practice location quantity", () => {
    const result = resolveWebhookSubscriptionCatalog({
      subscriptionItems: [
        { priceId: GROUP_MONTHLY, quantity: 1 },
        { priceId: ADDON_MONTHLY, quantity: 2 },
      ],
      snapshotPriceId: ADDON_MONTHLY,
      previous: null,
      env: GROUP_BILLING_TEST_ENV,
    });
    expect(result).toMatchObject({
      practiceAdditionalLocationQuantity: null,
      groupAdditionalSiteQuantity: 2,
    });
    expect(
      resolveWebhookSubscriptionCatalog({
        subscriptionItems: [
          { priceId: PRACTICE_MONTHLY, quantity: 1 },
          { priceId: LOCATION_MONTHLY, quantity: 2 },
        ],
        snapshotPriceId: LOCATION_MONTHLY,
        previous: null,
        env: GROUP_BILLING_TEST_ENV,
      })
    ).toMatchObject({
      mappedPrice: { plan: "PRACTICE" },
      practiceAdditionalLocationQuantity: 2,
    });
    expect(
      resolveWebhookSubscriptionCatalog({
        subscriptionItems: [
          { priceId: GROUP_MONTHLY, quantity: 1 },
          { priceId: LOCATION_MONTHLY, quantity: 1 },
        ],
        snapshotPriceId: GROUP_MONTHLY,
        previous: null,
        env: GROUP_BILLING_TEST_ENV,
      })
    ).toMatchObject({ kind: "group_shape", reason: "mixed_plan" });
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
  const structureCalls: string[] = [];
  let receiptSeq = 0;
  const rejectStructure = async (operation: string) => {
    structureCalls.push(operation);
    throw new Error(`${operation} is not part of projection`);
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
    clinicSite: {
      count: () => rejectStructure("ClinicSite.count"),
      create: () => rejectStructure("ClinicSite.create"),
      update: () => rejectStructure("ClinicSite.update"),
      delete: () => rejectStructure("ClinicSite.delete"),
    },
    clinicLocation: {
      count: () => rejectStructure("ClinicLocation.count"),
      create: () => rejectStructure("ClinicLocation.create"),
      update: () => rejectStructure("ClinicLocation.update"),
      delete: () => rejectStructure("ClinicLocation.delete"),
    },
    async $executeRaw() {
      return 0;
    },
    async $transaction<T>(fn: (tx: typeof db) => Promise<T>): Promise<T> {
      return fn(db);
    },
    entitlements,
    receipts,
    structureCalls,
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
        metadata: { clinicId: "clinic_1", offeredAdditionalSiteQuantity: "9" },
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
}): Stripe.Subscription {
  return {
    id: "sub_1",
    object: "subscription",
    status: input.status ?? "active",
    customer: "cus_1",
    cancel_at_period_end: false,
    metadata: { clinicId: "clinic_1", offeredAdditionalSiteQuantity: "9" },
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

async function projectInvoice(input: {
  db: ReturnType<typeof createDb>;
  priceId: string;
  subscription: Stripe.Subscription | null;
  id?: string;
  env?: Record<string, string | undefined>;
}) {
  return processVerifiedStripeEvent(
    paidInvoice({ id: input.id, priceId: input.priceId }),
    {
      prisma: input.db as never,
      reader: input.subscription
        ? { retrieveSubscription: async () => input.subscription }
        : null,
      env: input.env ?? GROUP_BILLING_TEST_ENV,
    }
  );
}

function seedEntitlement(
  db: ReturnType<typeof createDb>,
  row: Record<string, unknown>
) {
  db.entitlements.set("clinic_1", {
    commercialPlan: "GROUP",
    billingInterval: "MONTHLY",
    billingStatus: BillingStatus.OFFER_PREPARED,
    entitlementStatus: EntitlementStatus.PENDING,
    stripePriceId: null,
    siteAllowance: 1,
    locationAllowance: 1,
    purchasedAdditionalSiteQuantity: null,
    purchasedAdditionalLocationQuantity: null,
    offeredAdditionalSiteQuantity: 2,
    extraSiteAllowance: 0,
    extraLocationAllowance: 0,
    cancelAtPeriodEnd: false,
    scheduledAdditionalSiteQuantity: null,
    scheduledCapacityEffectiveAt: null,
    ...row,
  });
}

describe("Group invoice.paid activation", () => {
  it("stores N=0 for a new monthly or annual base and clears the offer", async () => {
    for (const [priceId, interval] of [
      [GROUP_MONTHLY, "MONTHLY"],
      [GROUP_YEARLY, "YEARLY"],
    ] as const) {
      const db = createDb();
      seedEntitlement(db, { offeredAdditionalSiteQuantity: 0 });
      const result = await projectInvoice({
        db,
        priceId,
        subscription: subscriptionOf({ items: [{ price: priceId }] }),
      });
      expect(result.outcome).toBe("processed");
      expect(db.entitlements.get("clinic_1")).toMatchObject({
        commercialPlan: "GROUP",
        billingInterval: interval,
        entitlementStatus: EntitlementStatus.ACTIVE,
        billingStatus: BillingStatus.ACTIVE,
        purchasedAdditionalSiteQuantity: 0,
        offeredAdditionalSiteQuantity: null,
        siteAllowance: 2,
        locationAllowance: 5,
        scheduledAdditionalSiteQuantity: null,
      });
      expect(db.structureCalls).toEqual([]);
    }
  });

  it("stores add-on quantities and keeps extras out of the purchased count", async () => {
    const cases = [
      {
        base: GROUP_MONTHLY,
        addon: ADDON_MONTHLY,
        quantity: 1,
        sites: 3,
        locations: 6,
      },
      {
        base: GROUP_MONTHLY,
        addon: ADDON_MONTHLY,
        quantity: 2,
        sites: 4,
        locations: 7,
      },
      {
        base: GROUP_YEARLY,
        addon: ADDON_YEARLY,
        quantity: 1,
        sites: 3,
        locations: 6,
      },
      {
        base: GROUP_YEARLY,
        addon: ADDON_YEARLY,
        quantity: 3,
        sites: 5,
        locations: 8,
      },
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
      const row = db.entitlements.get("clinic_1");
      expect(row).toMatchObject({
        commercialPlan: "GROUP",
        entitlementStatus: EntitlementStatus.ACTIVE,
        purchasedAdditionalSiteQuantity: item.quantity,
        siteAllowance: item.sites,
        locationAllowance: item.locations,
        stripePriceId: item.base,
      });
      expect(row?.purchasedAdditionalLocationQuantity ?? null).toBeNull();
    }

    const withExtras = createDb();
    seedEntitlement(withExtras, {
      extraSiteAllowance: 1,
      extraLocationAllowance: 3,
      offeredAdditionalSiteQuantity: 2,
    });
    await projectInvoice({
      db: withExtras,
      id: "evt_extras",
      priceId: ADDON_MONTHLY,
      subscription: subscriptionOf({
        items: [
          { price: GROUP_MONTHLY, quantity: 1 },
          { price: ADDON_MONTHLY, quantity: 2 },
        ],
      }),
    });
    expect(withExtras.entitlements.get("clinic_1")).toMatchObject({
      purchasedAdditionalSiteQuantity: 2,
      extraSiteAllowance: 1,
      extraLocationAllowance: 3,
      siteAllowance: 5,
      locationAllowance: 10,
      offeredAdditionalSiteQuantity: null,
    });
  });

  it("does not grant purchased capacity from checkout, pending, or incomplete payment", async () => {
    const checkout = createDb();
    seedEntitlement(checkout, { siteAllowance: 1, locationAllowance: 1 });
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
            metadata: {
              clinicId: "clinic_1",
              offeredAdditionalSiteQuantity: "2",
            },
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
                { price: GROUP_MONTHLY, quantity: 1 },
                { price: ADDON_MONTHLY, quantity: 2 },
              ],
              status: "incomplete",
            }),
        },
        env: GROUP_BILLING_TEST_ENV,
      }
    );
    expect(checkout.entitlements.get("clinic_1")).toMatchObject({
      entitlementStatus: EntitlementStatus.PENDING,
      billingStatus: BillingStatus.PAYMENT_PENDING,
      purchasedAdditionalSiteQuantity: null,
      offeredAdditionalSiteQuantity: 2,
      siteAllowance: 1,
      locationAllowance: 1,
    });

    const pending = createDb();
    seedEntitlement(pending, {});
    await processVerifiedStripeEvent(
      {
        id: "evt_sub",
        object: "event",
        created: 1_747_000_000,
        type: "customer.subscription.updated",
        data: {
          object: subscriptionOf({
            items: [
              { price: GROUP_MONTHLY, quantity: 1 },
              { price: ADDON_MONTHLY, quantity: 2 },
            ],
          }),
        },
      } as Stripe.Event,
      {
        prisma: pending as never,
        reader: {
          retrieveSubscription: async () =>
            subscriptionOf({
              items: [
                { price: GROUP_MONTHLY, quantity: 1 },
                { price: ADDON_MONTHLY, quantity: 2 },
              ],
            }),
        },
        env: GROUP_BILLING_TEST_ENV,
      }
    );
    expect(pending.entitlements.get("clinic_1")).toMatchObject({
      entitlementStatus: EntitlementStatus.PENDING,
      purchasedAdditionalSiteQuantity: null,
      offeredAdditionalSiteQuantity: 2,
    });

    const incomplete = createDb();
    await projectInvoice({
      db: incomplete,
      id: "evt_incomplete",
      priceId: GROUP_MONTHLY,
      subscription: subscriptionOf({
        items: [{ price: GROUP_MONTHLY }],
        status: "incomplete",
      }),
    });
    expect(incomplete.entitlements.get("clinic_1")).toMatchObject({
      entitlementStatus: EntitlementStatus.PENDING,
    });
    expect(
      incomplete.entitlements.get("clinic_1")?.purchasedAdditionalSiteQuantity
    ).toBeUndefined();
  });
});

describe("Group projection failure and legacy rows", () => {
  it("does not activate Group when the subscription cannot be retrieved, then retries", async () => {
    const fresh = createDb();
    await expect(
      projectInvoice({
        db: fresh,
        id: "evt_missing",
        priceId: GROUP_MONTHLY,
        subscription: null,
      })
    ).rejects.toThrow("Group subscription could not be retrieved.");
    expect(fresh.entitlements.size).toBe(0);
    expect(fresh.receipts.get("evt_missing")?.processingStatus).toBe(
      StripeEventProcessingStatus.FAILED
    );

    const pending = createDb();
    seedEntitlement(pending, {
      siteAllowance: 1,
      locationAllowance: 1,
      offeredAdditionalSiteQuantity: 2,
    });
    await expect(
      projectInvoice({
        db: pending,
        id: "evt_pending_missing",
        priceId: GROUP_MONTHLY,
        subscription: null,
      })
    ).rejects.toThrow("Group subscription could not be retrieved.");
    expect(pending.entitlements.get("clinic_1")).toMatchObject({
      entitlementStatus: EntitlementStatus.PENDING,
      purchasedAdditionalSiteQuantity: null,
      offeredAdditionalSiteQuantity: 2,
      siteAllowance: 1,
      locationAllowance: 1,
    });

    const retried = await processVerifiedStripeEvent(
      paidInvoice({ id: "evt_pending_missing", priceId: GROUP_MONTHLY }),
      {
        prisma: pending as never,
        reader: {
          retrieveSubscription: async () =>
            subscriptionOf({
              items: [
                { price: GROUP_MONTHLY, quantity: 1 },
                { price: ADDON_MONTHLY, quantity: 2 },
              ],
            }),
        },
        env: GROUP_BILLING_TEST_ENV,
      }
    );
    expect(retried.outcome).toBe("processed");
    expect(pending.receipts.get("evt_pending_missing")?.processingStatus).toBe(
      StripeEventProcessingStatus.PROCESSED
    );
    expect(pending.entitlements.get("clinic_1")).toMatchObject({
      entitlementStatus: EntitlementStatus.ACTIVE,
      purchasedAdditionalSiteQuantity: 2,
      siteAllowance: 4,
      locationAllowance: 7,
    });
  });

  it("keeps an invalid Group shape from changing entitlement", async () => {
    const sentry = vi
      .spyOn(report, "reportGroupSubscriptionShapeFailure")
      .mockImplementation(() => undefined);
    const db = createDb();
    seedEntitlement(db, {
      billingStatus: BillingStatus.ACTIVE,
      entitlementStatus: EntitlementStatus.ACTIVE,
      purchasedAdditionalSiteQuantity: 3,
      siteAllowance: 5,
      locationAllowance: 8,
      offeredAdditionalSiteQuantity: null,
    });
    const result = await projectInvoice({
      db,
      id: "evt_bad_shape",
      priceId: GROUP_MONTHLY,
      subscription: subscriptionOf({
        items: [
          { price: GROUP_MONTHLY, quantity: 1 },
          { price: ESSENTIAL_MONTHLY, quantity: 1 },
        ],
      }),
    });
    expect(result.outcome).toBe("invalid_group_shape");
    expect(db.receipts.get("evt_bad_shape")).toMatchObject({
      processingStatus: StripeEventProcessingStatus.FAILED,
    });
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      commercialPlan: "GROUP",
      purchasedAdditionalSiteQuantity: 3,
      siteAllowance: 5,
      locationAllowance: 8,
      entitlementStatus: EntitlementStatus.ACTIVE,
    });
    expect(GROUP_SUBSCRIPTION_SHAPE_FAILURE_CODE).toBe(
      "group_subscription_shape_invalid"
    );
    expect(sentry).toHaveBeenCalled();
    sentry.mockRestore();
  });

  it("preserves an established legacy null and does not report it as a failure", async () => {
    const sentry = vi
      .spyOn(report, "reportGroupSubscriptionShapeFailure")
      .mockImplementation(() => undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    for (const entitlementStatus of [
      EntitlementStatus.ACTIVE,
      EntitlementStatus.RESTRICTED,
      EntitlementStatus.ENDED,
    ]) {
      const db = createDb();
      seedEntitlement(db, {
        entitlementStatus,
        billingStatus:
          entitlementStatus === EntitlementStatus.ACTIVE
            ? BillingStatus.ACTIVE
            : entitlementStatus === EntitlementStatus.RESTRICTED
              ? BillingStatus.UNPAID
              : BillingStatus.ENDED,
        purchasedAdditionalSiteQuantity: null,
        siteAllowance: 6,
        locationAllowance: 11,
        extraSiteAllowance: 0,
        extraLocationAllowance: 0,
        offeredAdditionalSiteQuantity: null,
      });
      await projectInvoice({
        db,
        id: `evt_legacy_${entitlementStatus}`,
        priceId: ADDON_MONTHLY,
        subscription: subscriptionOf({
          items: [
            { price: ADDON_MONTHLY, quantity: 4 },
            { price: GROUP_MONTHLY, quantity: 1 },
          ],
        }),
      });
      expect(db.entitlements.get("clinic_1")).toMatchObject({
        commercialPlan: "GROUP",
        purchasedAdditionalSiteQuantity: null,
        siteAllowance: 6,
        locationAllowance: 11,
        extraSiteAllowance: 0,
        extraLocationAllowance: 0,
      });
      expect(db.structureCalls).toEqual([]);
    }
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "group_site_quantity_legacy_preserved",
      })
    );
    expect(sentry).not.toHaveBeenCalled();
    info.mockRestore();
    sentry.mockRestore();
  });

  it("projects a converted Group quantity and preserves it when retrieval fails", async () => {
    const db = createDb();
    seedEntitlement(db, {
      entitlementStatus: EntitlementStatus.ACTIVE,
      billingStatus: BillingStatus.ACTIVE,
      purchasedAdditionalSiteQuantity: 0,
      siteAllowance: 2,
      locationAllowance: 5,
      offeredAdditionalSiteQuantity: null,
    });
    await projectInvoice({
      db,
      id: "evt_zero",
      priceId: GROUP_MONTHLY,
      subscription: subscriptionOf({ items: [{ price: GROUP_MONTHLY }] }),
    });
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      purchasedAdditionalSiteQuantity: 0,
      siteAllowance: 2,
      locationAllowance: 5,
    });

    await projectInvoice({
      db,
      id: "evt_up",
      priceId: ADDON_MONTHLY,
      subscription: subscriptionOf({
        items: [
          { price: GROUP_MONTHLY, quantity: 1 },
          { price: ADDON_MONTHLY, quantity: 1 },
        ],
      }),
    });
    expect(db.entitlements.get("clinic_1")).toMatchObject({
      purchasedAdditionalSiteQuantity: 1,
      siteAllowance: 3,
      locationAllowance: 6,
    });

    const down = createDb();
    seedEntitlement(down, {
      entitlementStatus: EntitlementStatus.ACTIVE,
      billingStatus: BillingStatus.ACTIVE,
      purchasedAdditionalSiteQuantity: 3,
      siteAllowance: 5,
      locationAllowance: 8,
      extraSiteAllowance: 0,
      extraLocationAllowance: 0,
      offeredAdditionalSiteQuantity: null,
    });
    await projectInvoice({
      db: down,
      id: "evt_down",
      priceId: ADDON_MONTHLY,
      subscription: subscriptionOf({
        items: [
          { price: ADDON_MONTHLY, quantity: 2 },
          { price: GROUP_MONTHLY, quantity: 1 },
        ],
      }),
    });
    expect(down.entitlements.get("clinic_1")).toMatchObject({
      purchasedAdditionalSiteQuantity: 2,
      siteAllowance: 4,
      locationAllowance: 7,
    });

    const preserved = createDb();
    seedEntitlement(preserved, {
      entitlementStatus: EntitlementStatus.ACTIVE,
      billingStatus: BillingStatus.ACTIVE,
      purchasedAdditionalSiteQuantity: 3,
      siteAllowance: 5,
      locationAllowance: 8,
      offeredAdditionalSiteQuantity: null,
    });
    await expect(
      projectInvoice({
        db: preserved,
        id: "evt_preserve",
        priceId: GROUP_MONTHLY,
        subscription: null,
      })
    ).rejects.toThrow("Group subscription could not be retrieved.");
    expect(preserved.entitlements.get("clinic_1")).toMatchObject({
      purchasedAdditionalSiteQuantity: 3,
      siteAllowance: 5,
      locationAllowance: 8,
    });
  });
});
