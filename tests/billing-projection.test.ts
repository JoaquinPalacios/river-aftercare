import { BillingStatus, EntitlementStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  projectEntitlement,
  publicGuideRetentionUntil,
  PUBLIC_GUIDE_RETENTION_DAYS,
} from "@/lib/billing/projection";
import { emptyEntitlement } from "./helpers/billing";

const PERIOD_START = new Date("2026-09-01T00:00:00.000Z");
const PERIOD_END = new Date("2026-10-01T00:00:00.000Z");
const NOW = new Date("2026-09-21T00:00:00.000Z");

const mappedEssential = {
  plan: "ESSENTIAL" as const,
  interval: "MONTHLY" as const,
};

function project(overrides: Partial<Parameters<typeof projectEntitlement>[0]>) {
  return projectEntitlement({
    eventType: "invoice.paid",
    previous: null,
    clinicId: "clinic_1",
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    stripePriceId: "price_test_essential_monthly",
    mappedPrice: mappedEssential,
    unknownPrice: false,
    subscriptionStatus: "active",
    cancelAtPeriodEnd: false,
    currentPeriodStart: PERIOD_START,
    currentPeriodEnd: PERIOD_END,
    invoiceIsPaid: false,
    now: NOW,
    ...overrides,
  });
}

describe("entitlement projection", () => {
  it("keeps Checkout completion pending even when payment_status would be paid", () => {
    const result = project({
      eventType: "checkout.session.completed",
      invoiceIsPaid: false,
      subscriptionStatus: "active",
    });
    expect(result.kind).toBe("apply");
    if (result.kind !== "apply") {
      return;
    }
    expect(result.entitlement.entitlementStatus).toBe(
      EntitlementStatus.PENDING
    );
    expect(result.entitlement.billingStatus).toBe(
      BillingStatus.PAYMENT_PENDING
    );
  });

  it("keeps async Checkout payment success pending until invoice.paid", () => {
    const result = project({
      eventType: "checkout.session.async_payment_succeeded",
    });
    expect(result.kind).toBe("apply");
    if (result.kind !== "apply") {
      return;
    }
    expect(result.entitlement.entitlementStatus).toBe(
      EntitlementStatus.PENDING
    );
  });

  it("activates from a paid first invoice", () => {
    const result = project({
      eventType: "invoice.paid",
      invoiceIsPaid: true,
      subscriptionStatus: "active",
    });
    expect(result.kind).toBe("apply");
    if (result.kind !== "apply") {
      return;
    }
    expect(result.entitlement).toMatchObject({
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
      billingStatus: BillingStatus.ACTIVE,
      entitlementStatus: EntitlementStatus.ACTIVE,
      paidThrough: PERIOD_END,
      currentPeriodEnd: PERIOD_END,
    });
  });

  it("renews an active subscription from a later paid invoice", () => {
    const nextEnd = new Date("2026-11-01T00:00:00.000Z");
    const result = project({
      eventType: "invoice.paid",
      invoiceIsPaid: true,
      previous: emptyEntitlement({
        commercialPlan: "ESSENTIAL",
        billingInterval: "MONTHLY",
        billingStatus: BillingStatus.ACTIVE,
        entitlementStatus: EntitlementStatus.ACTIVE,
        paidThrough: PERIOD_END,
      }),
      currentPeriodEnd: nextEnd,
    });
    expect(result.kind).toBe("apply");
    if (result.kind !== "apply") {
      return;
    }
    expect(result.entitlement.entitlementStatus).toBe(EntitlementStatus.ACTIVE);
    expect(result.entitlement.paidThrough).toEqual(nextEnd);
  });

  it("keeps ACTIVE entitlement while Stripe is past_due / retrying", () => {
    const failed = project({
      eventType: "invoice.payment_failed",
      subscriptionStatus: "past_due",
      previous: emptyEntitlement({
        billingStatus: BillingStatus.ACTIVE,
        entitlementStatus: EntitlementStatus.ACTIVE,
        paidThrough: PERIOD_END,
      }),
    });
    expect(failed.kind).toBe("apply");
    if (failed.kind !== "apply") {
      return;
    }
    expect(failed.entitlement.billingStatus).toBe(BillingStatus.PAST_DUE);
    expect(failed.entitlement.entitlementStatus).toBe(EntitlementStatus.ACTIVE);

    const updated = project({
      eventType: "customer.subscription.updated",
      subscriptionStatus: "past_due",
      previous: failed.entitlement,
    });
    expect(updated.kind).toBe("apply");
    if (updated.kind !== "apply") {
      return;
    }
    expect(updated.entitlement.entitlementStatus).toBe(
      EntitlementStatus.ACTIVE
    );
  });

  it("projects terminal unpaid as RESTRICTED without ending the row", () => {
    const result = project({
      eventType: "customer.subscription.updated",
      subscriptionStatus: "unpaid",
      previous: emptyEntitlement({
        billingStatus: BillingStatus.PAST_DUE,
        entitlementStatus: EntitlementStatus.ACTIVE,
        paidThrough: PERIOD_END,
      }),
    });
    expect(result.kind).toBe("apply");
    if (result.kind !== "apply") {
      return;
    }
    expect(result.entitlement.billingStatus).toBe(BillingStatus.UNPAID);
    expect(result.entitlement.entitlementStatus).toBe(
      EntitlementStatus.RESTRICTED
    );
    expect(result.entitlement.publicGuideRetentionUntil).toBeNull();
  });

  it("keeps cancel-at-period-end active through the paid-through date", () => {
    const result = project({
      eventType: "customer.subscription.updated",
      subscriptionStatus: "active",
      cancelAtPeriodEnd: true,
      previous: emptyEntitlement({
        billingStatus: BillingStatus.ACTIVE,
        entitlementStatus: EntitlementStatus.ACTIVE,
        paidThrough: PERIOD_END,
        currentPeriodEnd: PERIOD_END,
      }),
    });
    expect(result.kind).toBe("apply");
    if (result.kind !== "apply") {
      return;
    }
    expect(result.entitlement.billingStatus).toBe(
      BillingStatus.CANCEL_AT_PERIOD_END
    );
    expect(result.entitlement.entitlementStatus).toBe(EntitlementStatus.ACTIVE);
    expect(result.entitlement.cancelAtPeriodEnd).toBe(true);
    expect(result.entitlement.subscriptionEndedAt).toBeNull();
    expect(result.entitlement.publicGuideRetentionUntil).toBeNull();
  });

  it("ends a deleted subscription and calculates 60-day retention from paid-through", () => {
    const result = project({
      eventType: "customer.subscription.deleted",
      subscriptionStatus: "canceled",
      previous: emptyEntitlement({
        billingStatus: BillingStatus.CANCEL_AT_PERIOD_END,
        entitlementStatus: EntitlementStatus.ACTIVE,
        paidThrough: PERIOD_END,
        currentPeriodEnd: PERIOD_END,
        cancelAtPeriodEnd: true,
      }),
    });
    expect(result.kind).toBe("apply");
    if (result.kind !== "apply") {
      return;
    }
    expect(result.entitlement.billingStatus).toBe(BillingStatus.ENDED);
    expect(result.entitlement.entitlementStatus).toBe(EntitlementStatus.ENDED);
    expect(result.entitlement.publicGuideRetentionUntil).toEqual(
      publicGuideRetentionUntil(PERIOD_END, PERIOD_END)
    );
    expect(PUBLIC_GUIDE_RETENTION_DAYS).toBe(60);
  });

  it("does not activate from subscription.created while the first invoice is unpaid", () => {
    const result = project({
      eventType: "customer.subscription.created",
      subscriptionStatus: "active",
      invoiceIsPaid: false,
      previous: null,
    });
    expect(result.kind).toBe("apply");
    if (result.kind !== "apply") {
      return;
    }
    expect(result.entitlement.entitlementStatus).toBe(
      EntitlementStatus.PENDING
    );
  });

  it("does not let a later Checkout event regress an ACTIVE entitlement", () => {
    const result = project({
      eventType: "checkout.session.completed",
      previous: emptyEntitlement({
        billingStatus: BillingStatus.ACTIVE,
        entitlementStatus: EntitlementStatus.ACTIVE,
        paidThrough: PERIOD_END,
      }),
    });
    expect(result.kind).toBe("apply");
    if (result.kind !== "apply") {
      return;
    }
    expect(result.entitlement.entitlementStatus).toBe(EntitlementStatus.ACTIVE);
  });

  it("removes a scheduled cancellation without ending the subscription", () => {
    const result = project({
      eventType: "customer.subscription.updated",
      subscriptionStatus: "active",
      cancelAtPeriodEnd: false,
      previous: emptyEntitlement({
        commercialPlan: "ESSENTIAL",
        billingInterval: "MONTHLY",
        billingStatus: BillingStatus.CANCEL_AT_PERIOD_END,
        entitlementStatus: EntitlementStatus.ACTIVE,
        paidThrough: PERIOD_END,
        currentPeriodEnd: PERIOD_END,
        cancelAtPeriodEnd: true,
      }),
    });
    expect(result.kind).toBe("apply");
    if (result.kind !== "apply") {
      return;
    }
    expect(result.entitlement.billingStatus).toBe(BillingStatus.ACTIVE);
    expect(result.entitlement.entitlementStatus).toBe(EntitlementStatus.ACTIVE);
    expect(result.entitlement.cancelAtPeriodEnd).toBe(false);
    expect(result.entitlement.paidThrough).toEqual(PERIOD_END);
    expect(result.entitlement.subscriptionEndedAt).toBeNull();
  });

  it("does not let a delayed payment failure regress a recovered active subscription", () => {
    const result = project({
      eventType: "invoice.payment_failed",
      subscriptionStatus: "active",
      previous: emptyEntitlement({
        billingStatus: BillingStatus.ACTIVE,
        entitlementStatus: EntitlementStatus.ACTIVE,
        paidThrough: PERIOD_END,
      }),
    });
    expect(result.kind).toBe("apply");
    if (result.kind !== "apply") {
      return;
    }
    expect(result.entitlement.billingStatus).toBe(BillingStatus.ACTIVE);
    expect(result.entitlement.entitlementStatus).toBe(EntitlementStatus.ACTIVE);
  });

  it("does not let a stale subscription update reopen an ended clinic", () => {
    const retention = publicGuideRetentionUntil(PERIOD_END, PERIOD_END);
    const result = project({
      eventType: "customer.subscription.updated",
      subscriptionStatus: "active",
      previous: emptyEntitlement({
        billingStatus: BillingStatus.ENDED,
        entitlementStatus: EntitlementStatus.ENDED,
        paidThrough: PERIOD_END,
        subscriptionEndedAt: PERIOD_END,
        publicGuideRetentionUntil: retention,
      }),
    });
    expect(result.kind).toBe("apply");
    if (result.kind !== "apply") {
      return;
    }
    expect(result.entitlement.entitlementStatus).toBe(EntitlementStatus.ENDED);
    expect(result.entitlement.publicGuideRetentionUntil).toEqual(retention);
  });

  it("maps an already-active subscription onto Practice when Stripe reports the new price", () => {
    const result = project({
      eventType: "customer.subscription.updated",
      subscriptionStatus: "active",
      stripePriceId: "price_test_practice_monthly",
      mappedPrice: { plan: "PRACTICE", interval: "MONTHLY" },
      previous: emptyEntitlement({
        commercialPlan: "ESSENTIAL",
        billingInterval: "MONTHLY",
        billingStatus: BillingStatus.ACTIVE,
        entitlementStatus: EntitlementStatus.ACTIVE,
        stripePriceId: "price_test_essential_monthly",
        paidThrough: PERIOD_END,
      }),
    });
    expect(result.kind).toBe("apply");
    if (result.kind !== "apply") {
      return;
    }
    expect(result.entitlement.commercialPlan).toBe("PRACTICE");
    expect(result.entitlement.billingInterval).toBe("MONTHLY");
    expect(result.entitlement.entitlementStatus).toBe(EntitlementStatus.ACTIVE);
  });

  it("does not activate a never-paid subscription because cancellation is scheduled", () => {
    const result = project({
      eventType: "customer.subscription.updated",
      subscriptionStatus: "active",
      cancelAtPeriodEnd: true,
      invoiceIsPaid: false,
      previous: null,
    });
    expect(result.kind).toBe("apply");
    if (result.kind !== "apply") {
      return;
    }
    expect(result.entitlement.entitlementStatus).toBe(
      EntitlementStatus.PENDING
    );
    expect(result.entitlement.billingStatus).toBe(
      BillingStatus.PAYMENT_PENDING
    );
  });

  it("does not let scheduled cancellation reopen restricted or ended clinics", () => {
    const restricted = project({
      eventType: "customer.subscription.updated",
      subscriptionStatus: "active",
      cancelAtPeriodEnd: true,
      previous: emptyEntitlement({
        billingStatus: BillingStatus.UNPAID,
        entitlementStatus: EntitlementStatus.RESTRICTED,
        paidThrough: PERIOD_END,
      }),
    });
    const ended = project({
      eventType: "customer.subscription.updated",
      subscriptionStatus: "active",
      cancelAtPeriodEnd: true,
      previous: emptyEntitlement({
        billingStatus: BillingStatus.ENDED,
        entitlementStatus: EntitlementStatus.ENDED,
        paidThrough: PERIOD_END,
        subscriptionEndedAt: PERIOD_END,
      }),
    });
    expect(restricted.kind).toBe("apply");
    expect(ended.kind).toBe("apply");
    if (restricted.kind !== "apply" || ended.kind !== "apply") {
      return;
    }
    expect(restricted.entitlement.entitlementStatus).toBe(
      EntitlementStatus.RESTRICTED
    );
    expect(ended.entitlement.entitlementStatus).toBe(EntitlementStatus.ENDED);
  });

  it("keeps past-due access and terminal unpaid when cancellation is also scheduled", () => {
    const pastDue = project({
      eventType: "customer.subscription.updated",
      subscriptionStatus: "past_due",
      cancelAtPeriodEnd: true,
      previous: emptyEntitlement({
        billingStatus: BillingStatus.ACTIVE,
        entitlementStatus: EntitlementStatus.ACTIVE,
        paidThrough: PERIOD_END,
      }),
    });
    const unpaid = project({
      eventType: "invoice.payment_failed",
      subscriptionStatus: "unpaid",
      cancelAtPeriodEnd: true,
      previous: emptyEntitlement({
        billingStatus: BillingStatus.PAST_DUE,
        entitlementStatus: EntitlementStatus.ACTIVE,
        paidThrough: PERIOD_END,
      }),
    });
    expect(pastDue.kind).toBe("apply");
    expect(unpaid.kind).toBe("apply");
    if (pastDue.kind !== "apply" || unpaid.kind !== "apply") {
      return;
    }
    expect(pastDue.entitlement).toMatchObject({
      billingStatus: BillingStatus.PAST_DUE,
      entitlementStatus: EntitlementStatus.ACTIVE,
      cancelAtPeriodEnd: true,
    });
    expect(unpaid.entitlement).toMatchObject({
      billingStatus: BillingStatus.UNPAID,
      entitlementStatus: EntitlementStatus.RESTRICTED,
    });
  });

  it("still activates a scheduled-cancel subscription from invoice.paid", () => {
    const result = project({
      eventType: "invoice.paid",
      subscriptionStatus: "active",
      cancelAtPeriodEnd: true,
      invoiceIsPaid: true,
      previous: emptyEntitlement({
        billingStatus: BillingStatus.PAYMENT_PENDING,
        entitlementStatus: EntitlementStatus.PENDING,
      }),
    });
    expect(result.kind).toBe("apply");
    if (result.kind !== "apply") {
      return;
    }
    expect(result.entitlement.billingStatus).toBe(
      BillingStatus.CANCEL_AT_PERIOD_END
    );
    expect(result.entitlement.entitlementStatus).toBe(EntitlementStatus.ACTIVE);
  });

  it("fails closed for an unknown clinic or unknown Price ID", () => {
    expect(project({ clinicId: null }).kind).toBe("unmapped_clinic");
    expect(
      project({
        unknownPrice: true,
        stripePriceId: "price_other",
        mappedPrice: null,
      })
    ).toMatchObject({
      kind: "unknown_price",
      stripePriceId: "price_other",
    });
  });
});
