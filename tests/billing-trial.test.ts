import { BillingStatus, EntitlementStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type Stripe from "stripe";

import { presentBillingReturn } from "@/lib/billing/billing-presentation";
import { evaluateBillingNotices } from "@/lib/billing/notices/evaluate";
import {
  assessClinicPlanDowngrade,
  subscriptionSnapshotFromStripe,
} from "@/lib/billing/plan-downgrade";
import {
  neverPaidCatalogueTrial,
  projectEntitlement,
  publicGuideRetentionUntil,
  PUBLIC_GUIDE_RETENTION_DAYS,
} from "@/lib/billing/projection";
import { emptyEntitlement } from "./helpers/billing";

const TRIAL_START = new Date("2026-11-01T00:00:00.000Z");
const TRIAL_END = new Date("2026-11-15T00:00:00.000Z");
const FIRST_PAID_END = new Date("2026-12-15T00:00:00.000Z");
const ANNUAL_PAID_END = new Date("2027-11-15T00:00:00.000Z");

function project(overrides: Partial<Parameters<typeof projectEntitlement>[0]>) {
  return projectEntitlement({
    eventType: "customer.subscription.updated",
    previous: emptyEntitlement({
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
      billingStatus: BillingStatus.OFFER_PREPARED,
      entitlementStatus: EntitlementStatus.PENDING,
    }),
    clinicId: "clinic_trial",
    stripeCustomerId: "cus_trial",
    stripeSubscriptionId: "sub_trial",
    stripePriceId: "price_test_essential_monthly",
    mappedPrice: { plan: "ESSENTIAL", interval: "MONTHLY" },
    unknownPrice: false,
    subscriptionStatus: "trialing",
    cancelAtPeriodEnd: false,
    currentPeriodStart: TRIAL_START,
    currentPeriodEnd: TRIAL_END,
    invoiceIsPaid: false,
    trialEndsAt: TRIAL_END,
    now: TRIAL_START,
    ...overrides,
  });
}

function applied(result: ReturnType<typeof projectEntitlement>) {
  expect(result.kind).toBe("apply");
  if (result.kind !== "apply") {
    throw new Error(result.kind);
  }
  return result.entitlement;
}

describe("catalogue trial projection", () => {
  it("does not open a trial when the subscription has no payment method", () => {
    const entitlement = applied(project({ paymentMethodPresent: false }));
    expect(entitlement.entitlementStatus).toBe(EntitlementStatus.PENDING);
    expect(entitlement.billingStatus).toBe(BillingStatus.PAYMENT_PENDING);
  });

  it("opens monthly and annual trials without a paid-through date", () => {
    for (const interval of ["MONTHLY", "YEARLY"] as const) {
      const entitlement = applied(
        project({
          mappedPrice: { plan: "PRACTICE", interval },
          previous: emptyEntitlement({
            commercialPlan: "PRACTICE",
            billingInterval: interval,
            billingStatus: BillingStatus.OFFER_PREPARED,
            entitlementStatus: EntitlementStatus.PENDING,
          }),
        })
      );
      expect(entitlement.entitlementStatus).toBe(EntitlementStatus.ACTIVE);
      expect(entitlement.billingStatus).toBe(BillingStatus.TRIALING);
      expect(entitlement.paidThrough).toBeNull();
      expect(entitlement.trialEndsAt).toEqual(TRIAL_END);
      expect(entitlement.billingInterval).toBe(interval);
    }
  });

  it("keeps the opening invoice unpaid when events arrive in either order", () => {
    const created = applied(
      project({ eventType: "customer.subscription.created" })
    );
    const checkoutAfterCreate = applied(
      project({
        eventType: "checkout.session.completed",
        previous: created,
      })
    );
    const zeroInvoice = applied(
      project({
        eventType: "invoice.paid",
        invoiceIsPaid: true,
        invoiceAmountPaid: 0,
        invoiceBillingReason: "subscription_create",
        previous: checkoutAfterCreate,
      })
    );
    expect(zeroInvoice.billingStatus).toBe(BillingStatus.TRIALING);
    expect(zeroInvoice.paidThrough).toBeNull();
    expect(zeroInvoice.trialEndsAt).toEqual(TRIAL_END);

    const invoiceFirst = applied(
      project({
        eventType: "invoice.paid",
        invoiceIsPaid: true,
        invoiceAmountPaid: 0,
        invoiceBillingReason: "subscription_create",
        previous: null,
      })
    );
    const createdAfterInvoice = applied(
      project({
        eventType: "customer.subscription.created",
        previous: invoiceFirst,
      })
    );
    expect(createdAfterInvoice).toEqual(invoiceFirst);
    expect(createdAfterInvoice).toEqual(zeroInvoice);
  });

  it("does not treat a duplicate trial event as a new paid period", () => {
    const first = applied(
      project({ eventType: "customer.subscription.updated" })
    );
    const duplicate = applied(
      project({
        eventType: "customer.subscription.updated",
        previous: first,
      })
    );
    expect(duplicate).toEqual(first);
    expect(neverPaidCatalogueTrial(duplicate, { trialEndsAt: TRIAL_END })).toBe(
      true
    );
  });

  it("keeps billing in trial when the subscription becomes active before the first invoice", () => {
    const trialing = applied(project({}));
    const earlyActive = applied(
      project({
        eventType: "customer.subscription.updated",
        subscriptionStatus: "active",
        previous: trialing,
        now: TRIAL_END,
      })
    );
    expect(earlyActive.billingStatus).toBe(BillingStatus.TRIALING);
    expect(earlyActive.entitlementStatus).toBe(EntitlementStatus.ACTIVE);
    expect(earlyActive.paidThrough).toBeNull();
    expect(earlyActive.trialEndsAt).toEqual(TRIAL_END);
  });

  it("records the first collected monthly or annual invoice and keeps the trial end", () => {
    const trialing = applied(project({}));
    const monthly = applied(
      project({
        eventType: "invoice.paid",
        invoiceIsPaid: true,
        invoiceAmountPaid: 4900,
        invoiceBillingReason: "subscription_cycle",
        subscriptionStatus: "active",
        currentPeriodStart: TRIAL_END,
        currentPeriodEnd: FIRST_PAID_END,
        previous: trialing,
        now: TRIAL_END,
      })
    );
    expect(monthly.billingStatus).toBe(BillingStatus.ACTIVE);
    expect(monthly.paidThrough).toEqual(FIRST_PAID_END);
    expect(monthly.trialEndsAt).toEqual(TRIAL_END);

    const annualTrial = applied(
      project({
        mappedPrice: { plan: "ESSENTIAL", interval: "YEARLY" },
        previous: emptyEntitlement({
          commercialPlan: "ESSENTIAL",
          billingInterval: "YEARLY",
          billingStatus: BillingStatus.OFFER_PREPARED,
          entitlementStatus: EntitlementStatus.PENDING,
        }),
      })
    );
    const annual = applied(
      project({
        eventType: "invoice.paid",
        invoiceIsPaid: true,
        invoiceAmountPaid: 49000,
        invoiceBillingReason: "subscription_cycle",
        subscriptionStatus: "active",
        currentPeriodStart: TRIAL_END,
        currentPeriodEnd: ANNUAL_PAID_END,
        mappedPrice: { plan: "ESSENTIAL", interval: "YEARLY" },
        previous: annualTrial,
        now: TRIAL_END,
      })
    );
    expect(annual.billingStatus).toBe(BillingStatus.ACTIVE);
    expect(annual.paidThrough).toEqual(ANNUAL_PAID_END);
    expect(annual.trialEndsAt).toEqual(TRIAL_END);
  });

  it("keeps access until a canceled trial ends and does not store a paid-through date", () => {
    const trialing = applied(project({}));
    const canceled = applied(
      project({
        eventType: "customer.subscription.updated",
        cancelAtPeriodEnd: true,
        previous: trialing,
      })
    );
    expect(canceled.billingStatus).toBe(BillingStatus.CANCEL_AT_PERIOD_END);
    expect(canceled.entitlementStatus).toBe(EntitlementStatus.ACTIVE);
    expect(canceled.paidThrough).toBeNull();
    expect(canceled.cancelAtPeriodEnd).toBe(true);

    const ended = applied(
      project({
        eventType: "customer.subscription.deleted",
        subscriptionStatus: "canceled",
        cancelAtPeriodEnd: false,
        previous: canceled,
        now: TRIAL_END,
      })
    );
    expect(ended.billingStatus).toBe(BillingStatus.ENDED);
    expect(ended.entitlementStatus).toBe(EntitlementStatus.ENDED);
    expect(ended.paidThrough).toBeNull();
    expect(ended.trialEndsAt).toEqual(TRIAL_END);
    expect(ended.publicGuideRetentionUntil).toEqual(
      publicGuideRetentionUntil(TRIAL_END, null)
    );
    expect(PUBLIC_GUIDE_RETENTION_DAYS).toBe(60);
  });

  it("keeps the paid retention path after a collected period ends", () => {
    const paid = applied(
      project({
        eventType: "invoice.paid",
        invoiceIsPaid: true,
        invoiceAmountPaid: 4900,
        invoiceBillingReason: "subscription_cycle",
        subscriptionStatus: "active",
        currentPeriodEnd: FIRST_PAID_END,
        previous: applied(project({})),
      })
    );
    const ended = applied(
      project({
        eventType: "customer.subscription.deleted",
        subscriptionStatus: "canceled",
        currentPeriodEnd: FIRST_PAID_END,
        previous: paid,
        now: FIRST_PAID_END,
      })
    );
    expect(ended.paidThrough).toEqual(FIRST_PAID_END);
    expect(ended.publicGuideRetentionUntil).toEqual(
      publicGuideRetentionUntil(FIRST_PAID_END, FIRST_PAID_END)
    );
  });

  it("records a card failure while the subscription is still active", () => {
    const trialing = applied(project({}));
    const failed = applied(
      project({
        eventType: "invoice.payment_failed",
        subscriptionStatus: "active",
        previous: trialing,
        now: TRIAL_END,
      })
    );
    expect(failed.billingStatus).toBe(BillingStatus.PAST_DUE);
    expect(failed.entitlementStatus).toBe(EntitlementStatus.ACTIVE);
    expect(failed.paidThrough).toBeNull();
  });

  it("records a card failure and ignores past_due until that failure arrives", () => {
    const trialing = applied(project({}));
    const clearing = applied(
      project({
        eventType: "customer.subscription.updated",
        subscriptionStatus: "past_due",
        previous: trialing,
        now: TRIAL_END,
      })
    );
    expect(clearing.billingStatus).toBe(BillingStatus.TRIALING);
    expect(clearing.paidThrough).toBeNull();
    expect(clearing.entitlementStatus).toBe(EntitlementStatus.ACTIVE);

    const failed = applied(
      project({
        eventType: "invoice.payment_failed",
        subscriptionStatus: "past_due",
        previous: clearing,
        now: TRIAL_END,
      })
    );
    expect(failed.billingStatus).toBe(BillingStatus.PAST_DUE);
    expect(failed.entitlementStatus).toBe(EntitlementStatus.ACTIVE);
    expect(failed.paidThrough).toBeNull();

    const duplicatePastDue = applied(
      project({
        eventType: "customer.subscription.updated",
        subscriptionStatus: "past_due",
        previous: failed,
        now: TRIAL_END,
      })
    );
    expect(duplicatePastDue.billingStatus).toBe(BillingStatus.PAST_DUE);
    expect(duplicatePastDue.paidThrough).toBeNull();
  });

  it("does not send an annual renewal notice for a 14-day trial period", () => {
    const annual = applied(
      project({
        mappedPrice: { plan: "ESSENTIAL", interval: "YEARLY" },
        previous: emptyEntitlement({
          commercialPlan: "ESSENTIAL",
          billingInterval: "YEARLY",
          billingStatus: BillingStatus.OFFER_PREPARED,
          entitlementStatus: EntitlementStatus.PENDING,
        }),
      })
    );
    const notices = evaluateBillingNotices({
      subscription: {
        entitlementStatus: "ACTIVE",
        billingStatus: "TRIALING",
        commercialPlan: "ESSENTIAL",
        billingInterval: "YEARLY",
        stripePriceId: "price_test_essential_yearly",
        stripeSubscriptionId: "sub_trial",
        currentPeriodStart: annual.currentPeriodStart,
        currentPeriodEnd: annual.currentPeriodEnd,
        paidThrough: annual.paidThrough,
        trialEndsAt: annual.trialEndsAt,
        cancelAtPeriodEnd: false,
        scheduledCommercialPlan: null,
        scheduledAdditionalSiteQuantity: null,
        stripeSubscriptionScheduleId: null,
        purchasedAdditionalLocationQuantity: null,
        purchasedAdditionalSiteQuantity: null,
        catalogueBasePriceId: "price_test_essential_yearly",
        catalogueAddonPriceId: null,
      },
      priceChanges: [],
      deliveries: [],
      now: new Date("2026-11-10T00:00:00.000Z"),
      billingUrl: "http://app.localhost:3000/account/billing",
      contactUrl: "http://localhost:3000/contact",
    });
    expect(notices.emails).toEqual([]);
    expect(notices.overviewNotices.map((notice) => notice.id)).not.toContain(
      "annual_renewal"
    );
  });

  it("describes an open trial as a trial and a paid subscription as a renewal", () => {
    const trial = presentBillingReturn({
      entitlementStatus: EntitlementStatus.ACTIVE,
      billingStatus: BillingStatus.TRIALING,
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
      checkoutStarted: true,
      stripeSubscriptionId: "sub_trial",
      paidThrough: null,
      trialEndsAt: TRIAL_END,
      now: TRIAL_START,
    });
    expect(trial).toMatchObject({
      kind: "active",
      productAccess: true,
      trial: { phase: "in_trial", endsAt: TRIAL_END },
    });
    if (trial.kind === "active") {
      expect(trial.trial?.message).toContain("free trial");
      expect(trial.trial?.message).not.toContain("renew");
    }

    const paid = presentBillingReturn({
      entitlementStatus: EntitlementStatus.ACTIVE,
      billingStatus: BillingStatus.ACTIVE,
      commercialPlan: "ESSENTIAL",
      billingInterval: "YEARLY",
      checkoutStarted: true,
      stripeSubscriptionId: "sub_paid",
      paidThrough: ANNUAL_PAID_END,
      currentPeriodEnd: ANNUAL_PAID_END,
      trialEndsAt: TRIAL_END,
      now: TRIAL_END,
    });
    expect(paid).toMatchObject({
      kind: "active",
      attention: null,
      trial: null,
    });
  });
});

describe("catalogue trial plan changes", () => {
  const readiness = {
    ready: true,
    conflicts: [],
    team: { current: 1, limit: 5 },
    guides: { current: 0, limit: 2 },
    adaptedTemplates: { current: 0, limit: 2 },
    combinedGuides: { current: 0, limit: 4 },
  };

  it("refuses a downgrade during a trial and allows one after the trial end is past", () => {
    expect(
      assessClinicPlanDowngrade({
        state: {
          clinicId: "clinic_trial",
          commercialPlan: "PRACTICE",
          billingInterval: "MONTHLY",
          entitlementStatus: EntitlementStatus.ACTIVE,
          billingStatus: BillingStatus.TRIALING,
          cancelAtPeriodEnd: false,
          stripeSubscriptionId: "sub_trial",
          stripeSubscriptionScheduleId: null,
          stripePlanDowngradeAttemptId: null,
          stripeCheckoutSessionId: null,
          scheduledCommercialPlan: null,
          scheduledPlanEffectiveAt: null,
        },
        readiness,
      })
    ).toEqual({ ok: false, code: "trial_in_progress" });

    const future = Math.floor(Date.now() / 1000) + 86_400;
    const past = Math.floor(Date.now() / 1000) - 86_400;
    expect(
      subscriptionSnapshotFromStripe({
        id: "sub_trial",
        status: "trialing",
        trial_end: future,
        items: { data: [] },
      } as unknown as Stripe.Subscription).trialPresent
    ).toBe(true);
    expect(
      subscriptionSnapshotFromStripe({
        id: "sub_paid",
        status: "active",
        trial_end: past,
        items: { data: [] },
      } as unknown as Stripe.Subscription).trialPresent
    ).toBe(false);
  });
});
