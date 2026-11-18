import { BillingStatus, EntitlementStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  executeClinicCheckout,
  type CheckoutStripePort,
  type LockedCheckoutState,
} from "@/lib/billing/checkout";
import {
  assessPromotionConfiguration,
  couponMatchesExpectation,
  resolvePromotionalRedemption,
} from "@/lib/billing/promotion-config";
import { decidePromotionAttachment } from "@/lib/billing/promotion-decision";
import {
  ensurePromotionDiscount,
  promotionAttachIdempotencyKey,
} from "@/lib/billing/promotion-attach";
import {
  paidMonthlyInvoicesInsideCouponWindow,
  promotionQuote,
} from "@/lib/billing/promotion-terms";
import {
  BILLING_TEST_ENV,
  conformingCataloguePrices,
} from "@/tests/helpers/billing";

const PROMO_ENV = {
  ...BILLING_TEST_ENV,
  STRIPE_PROMOTIONAL_REDEMPTION_ENABLED: "true",
  STRIPE_PROMOTION_WITH_TRIAL_ENABLED: "true",
  STRIPE_PROMOTION_MONTHLY_SIX_MONTH_COUPON_ID: "coupon_month_6",
  STRIPE_PROMOTION_MONTHLY_TWELVE_MONTH_COUPON_ID: "coupon_month_12",
  STRIPE_PROMOTION_ANNUAL_SIX_MONTH_COUPON_ID: "coupon_year_6",
  STRIPE_PROMOTION_ANNUAL_TWELVE_MONTH_COUPON_ID: "coupon_year_12",
};

const COUPONS = {
  coupon_month_6: {
    id: "coupon_month_6",
    valid: true,
    deleted: false,
    percentOff: 50,
    amountOff: null,
    currency: "aud",
    duration: "repeating",
    durationInMonths: 6,
    appliesToProductIds: null,
  },
  coupon_month_12: {
    id: "coupon_month_12",
    valid: true,
    deleted: false,
    percentOff: 50,
    amountOff: null,
    currency: "aud",
    duration: "repeating",
    durationInMonths: 12,
    appliesToProductIds: null,
  },
  coupon_year_6: {
    id: "coupon_year_6",
    valid: true,
    deleted: false,
    percentOff: 25,
    amountOff: null,
    currency: "aud",
    duration: "once",
    durationInMonths: null,
    appliesToProductIds: null,
  },
  coupon_year_12: {
    id: "coupon_year_12",
    valid: true,
    deleted: false,
    percentOff: 50,
    amountOff: null,
    currency: "aud",
    duration: "once",
    durationInMonths: null,
    appliesToProductIds: null,
  },
} as const;

function readyState(
  overrides: Partial<LockedCheckoutState> = {}
): LockedCheckoutState {
  return {
    clinicId: "clinic_promo",
    userId: "user_promo",
    commercialPlan: "ESSENTIAL",
    billingInterval: "MONTHLY",
    billingStatus: BillingStatus.OFFER_PREPARED,
    entitlementStatus: EntitlementStatus.PENDING,
    commercialArrangement: "PAID",
    stripeCustomerId: "cus_promo",
    stripeSubscriptionId: null,
    stripeCheckoutSessionId: null,
    trialEndsAt: null,
    offeredAdditionalSiteQuantity: null,
    termsAccepted: true,
    identity: {
      legalEntityName: "Harbour Dental Pty Ltd",
      billingEmail: "accounts@example.com",
      addressLine1: "10 River Street",
      addressLine2: null,
      city: "Tweed Heads",
      region: "NSW",
      postalCode: "2486",
      country: "AU",
    },
    ...overrides,
  };
}

function fakeStripe(subscriptions: Array<{ id: string }> | "throws" = []) {
  const created: Array<Record<string, unknown>> = [];
  const port: CheckoutStripePort = {
    prices: conformingCataloguePrices,
    customers: {
      async update(id) {
        return { id, metadata: {} };
      },
      async create() {
        return { id: "cus_promo", metadata: {} };
      },
    },
    checkout: {
      sessions: {
        async create(params) {
          created.push(params);
          return {
            id: "cs_promo",
            url: "https://checkout.stripe.com/c/pay/cs_promo",
            status: "open",
          };
        },
        async retrieve() {
          return {
            id: "cs_promo",
            url: null,
            status: "expired",
          };
        },
        async expire() {
          return {};
        },
      },
    },
    coupons: {
      async retrieve(id) {
        const coupon = COUPONS[id as keyof typeof COUPONS];
        if (!coupon) {
          throw new Error("missing coupon");
        }
        return coupon;
      },
    },
    subscriptions: {
      async list() {
        if (subscriptions === "throws") {
          throw new Error("stripe unavailable");
        }
        return { data: subscriptions };
      },
    },
  };
  return { port, created };
}

describe("introductory promotion terms", () => {
  it("maps the four catalogue offers and keeps renewal at the catalogue price", () => {
    expect(
      promotionQuote({
        plan: "ESSENTIAL",
        interval: "MONTHLY",
        term: "SIX_MONTHS",
        trial: false,
      })
    ).toMatchObject({
      priceLabel: "A$24.50 / month for 6 months",
      renewalLabel: "Then A$49 / month.",
      discountedCents: 2450,
    });
    expect(
      promotionQuote({
        plan: "PRACTICE",
        interval: "MONTHLY",
        term: "TWELVE_MONTHS",
        trial: true,
      }).priceLabel
    ).toBe("A$59.50 / month for 12 months");
    expect(
      promotionQuote({
        plan: "ESSENTIAL",
        interval: "YEARLY",
        term: "SIX_MONTHS",
        trial: false,
      })
    ).toMatchObject({
      priceLabel: "A$367.50 for the first year",
      renewalLabel: "Then A$490 / year.",
      discountedCents: 36750,
    });
    expect(
      promotionQuote({
        plan: "PRACTICE",
        interval: "YEARLY",
        term: "TWELVE_MONTHS",
        trial: false,
      }).discountedCents
    ).toBe(59500);
  });

  it("counts six paid monthly invoices inside a coupon that starts with the trial", () => {
    const trialEnd = new Date("2026-12-01T00:00:00.000Z");
    const couponStart = new Date("2026-11-17T00:00:00.000Z");
    const couponEnd = new Date("2027-05-17T00:00:00.000Z");
    expect(
      paidMonthlyInvoicesInsideCouponWindow({
        couponStart,
        couponEnd,
        trialEnd,
        paidInvoices: 8,
      })
    ).toBe(6);
  });
});

describe("introductory promotion configuration", () => {
  it("stays off until redemption is enabled and refuses a live key without the live flag", () => {
    expect(
      resolvePromotionalRedemption(
        { ...PROMO_ENV, STRIPE_PROMOTIONAL_REDEMPTION_ENABLED: "false" },
        { interval: "MONTHLY", term: "SIX_MONTHS", withTrial: false }
      ).ok
    ).toBe(false);
    expect(
      resolvePromotionalRedemption(
        { ...PROMO_ENV, STRIPE_SECRET_KEY: "sk_live_example" },
        { interval: "YEARLY", term: "SIX_MONTHS", withTrial: false }
      )
    ).toMatchObject({ ok: false, reason: "live_disabled" });
    expect(
      resolvePromotionalRedemption(
        { ...PROMO_ENV, STRIPE_PROMOTION_WITH_TRIAL_ENABLED: "false" },
        { interval: "MONTHLY", term: "SIX_MONTHS", withTrial: true }
      )
    ).toMatchObject({ ok: false, reason: "trial_combination_disabled" });
    const assessment = assessPromotionConfiguration({
      STRIPE_PROMOTIONAL_REDEMPTION_ENABLED: "true",
    });
    expect(assessment.failures.length).toBeGreaterThan(0);
    expect(assessPromotionConfiguration({}).failures).toEqual([]);
  });

  it("rejects a coupon that does not match the selected offer", () => {
    expect(
      couponMatchesExpectation(
        COUPONS.coupon_year_6,
        { percentOff: 25, duration: "once", durationInMonths: null },
        null
      )
    ).toBe(true);
    expect(
      couponMatchesExpectation(
        COUPONS.coupon_year_6,
        { percentOff: 50, duration: "once", durationInMonths: null },
        null
      )
    ).toBe(false);
  });
});

describe("introductory promotion checkout", () => {
  it("puts the once coupon on annual checkout when there is no trial history", async () => {
    const stripe = fakeStripe([{ id: "sub_old" }]);
    const prior = await executeClinicCheckout({
      state: readyState({
        billingInterval: "YEARLY",
        promotionalOffer: {
          id: "offer_year",
          term: "TWELVE_MONTHS",
          status: "AUTHORISED",
          authorisationExpiresAt: null,
          stripeCouponId: null,
          discountDeferred: false,
        },
      }),
      env: PROMO_ENV,
      stripe: stripe.port,
      successUrl: "https://app.localhost/account/billing/complete",
      cancelUrl: "https://app.localhost/account/billing/setup",
      persist: async () => {},
    });
    expect(prior).toEqual({ ok: false, code: "promotion_ineligible" });
    expect(stripe.created).toHaveLength(0);

    const fresh = fakeStripe([]);
    const opened = await executeClinicCheckout({
      state: readyState({
        billingInterval: "YEARLY",
        trialEndsAt: new Date("2026-01-01T00:00:00.000Z"),
        promotionalOffer: {
          id: "offer_year",
          term: "SIX_MONTHS",
          status: "AUTHORISED",
          authorisationExpiresAt: null,
          stripeCouponId: null,
          discountDeferred: false,
        },
      }),
      env: PROMO_ENV,
      stripe: fresh.port,
      successUrl: "https://app.localhost/account/billing/complete",
      cancelUrl: "https://app.localhost/account/billing/setup",
      persist: async () => {},
    });
    expect(opened.ok).toBe(true);
    expect(fresh.created[0]).toMatchObject({
      discounts: [{ coupon: "coupon_year_6" }],
      payment_method_types: ["card", "au_becs_debit"],
      payment_method_collection: "always",
    });
    expect(fresh.created[0]).not.toHaveProperty("allow_promotion_codes");
    expect(fresh.created[0]?.subscription_data).not.toHaveProperty(
      "trial_period_days"
    );
  });

  it("defers the coupon when the trial is applied and refuses the combination when that flag is off", async () => {
    const recorded: Array<{ discountDeferred: boolean; couponId: string }> = [];
    const stripe = fakeStripe([]);
    const opened = await executeClinicCheckout({
      state: readyState({
        promotionalOffer: {
          id: "offer_month",
          term: "SIX_MONTHS",
          status: "AUTHORISED",
          authorisationExpiresAt: null,
          stripeCouponId: null,
          discountDeferred: false,
        },
      }),
      env: PROMO_ENV,
      stripe: stripe.port,
      successUrl: "https://app.localhost/account/billing/complete",
      cancelUrl: "https://app.localhost/account/billing/setup",
      persist: async () => {},
      persistPromotion: async (update) => {
        recorded.push(update);
      },
    });
    expect(opened.ok).toBe(true);
    expect(stripe.created[0]?.subscription_data).toMatchObject({
      trial_period_days: 14,
      metadata: {
        riverPromotionApplication: "after_zero_invoice",
        riverPromotionCouponId: "coupon_month_6",
      },
    });
    expect(stripe.created[0]).not.toHaveProperty("discounts");
    expect(stripe.created[0]).toMatchObject({ allow_promotion_codes: false });
    expect(recorded).toEqual([
      {
        offerId: "offer_month",
        couponId: "coupon_month_6",
        discountDeferred: true,
      },
    ]);

    const blocked = fakeStripe([]);
    const refused = await executeClinicCheckout({
      state: readyState({
        promotionalOffer: {
          id: "offer_month",
          term: "TWELVE_MONTHS",
          status: "AUTHORISED",
          authorisationExpiresAt: null,
          stripeCouponId: null,
          discountDeferred: false,
        },
      }),
      env: { ...PROMO_ENV, STRIPE_PROMOTION_WITH_TRIAL_ENABLED: "false" },
      stripe: blocked.port,
      successUrl: "https://app.localhost/account/billing/complete",
      cancelUrl: "https://app.localhost/account/billing/setup",
      persist: async () => {},
    });
    expect(refused).toEqual({
      ok: false,
      code: "promotion_with_trial_unavailable",
    });
    expect(blocked.created).toHaveLength(0);
  });

  it("does not open Checkout for an expired or mismatched offer", async () => {
    const expiredStripe = fakeStripe([]);
    let expired = false;
    const result = await executeClinicCheckout({
      state: readyState({
        promotionalOffer: {
          id: "offer_old",
          term: "SIX_MONTHS",
          status: "AUTHORISED",
          authorisationExpiresAt: new Date("2020-01-01T00:00:00.000Z"),
          stripeCouponId: null,
          discountDeferred: false,
        },
      }),
      env: PROMO_ENV,
      stripe: expiredStripe.port,
      successUrl: "https://app.localhost/account/billing/complete",
      cancelUrl: "https://app.localhost/account/billing/setup",
      persist: async () => {},
      expirePromotion: async () => {
        expired = true;
      },
    });
    expect(result).toEqual({ ok: false, code: "promotion_expired" });
    expect(expired).toBe(true);
    expect(expiredStripe.created).toHaveLength(0);
  });
});

describe("deferred coupon attachment", () => {
  const metadata = {
    clinicId: "clinic_promo",
    riverPromotionOfferId: "offer_month",
    riverPromotionCouponId: "coupon_month_6",
    riverPromotionApplication: "after_zero_invoice",
  };

  it("waits until the zero invoice is paid and then attaches once", async () => {
    expect(
      decidePromotionAttachment({
        status: "trialing",
        trialEnd: 1_800_000_000,
        itemCount: 1,
        metadata,
        discountCouponIds: [],
        invoices: [],
      })
    ).toEqual({ action: "not_ready" });

    const attached: string[] = [];
    const decision = await ensurePromotionDiscount({
      subscriptionId: "sub_trial",
      stripe: {
        async retrieveSubscription() {
          return {
            status: "trialing",
            trial_end: 1_800_000_000,
            items: { data: [{ id: "si_1" }] },
            metadata,
            discounts:
              attached.length === 0
                ? []
                : [{ source: { coupon: "coupon_month_6" } }],
          } as never;
        },
        async listInvoices() {
          return [
            {
              status: "paid",
              billing_reason: "subscription_create",
              total: 0,
              discounts: [],
              total_discount_amounts: [],
            },
          ] as never;
        },
        async attachCoupon(_subscriptionId, couponId, idempotencyKey) {
          expect(idempotencyKey).toBe(
            promotionAttachIdempotencyKey("sub_trial", couponId)
          );
          attached.push(couponId);
        },
      },
    });
    expect(attached).toEqual(["coupon_month_6"]);
    expect(decision).toMatchObject({
      action: "redeem",
      couponId: "coupon_month_6",
      deferred: true,
    });
  });

  it("does not attach after a positive invoice missed the coupon, and refuses a second coupon", () => {
    expect(
      decidePromotionAttachment({
        status: "active",
        trialEnd: 1_800_000_000,
        itemCount: 1,
        metadata,
        discountCouponIds: [],
        invoices: [
          {
            status: "paid",
            billingReason: "subscription_cycle",
            total: 4900,
            discountCouponIds: [],
          },
        ],
      })
    ).toMatchObject({
      action: "missed",
      reason: "promotion_paid_invoice_without_discount",
    });
    expect(
      decidePromotionAttachment({
        status: "trialing",
        trialEnd: 1_800_000_000,
        itemCount: 1,
        metadata,
        discountCouponIds: ["coupon_other"],
        invoices: [
          {
            status: "paid",
            billingReason: "subscription_create",
            total: 0,
            discountCouponIds: [],
          },
        ],
      })
    ).toMatchObject({ action: "refuse", reason: "promotion_discount_present" });
  });

  it("redeems an immediate checkout coupon from the paid invoice", () => {
    expect(
      decidePromotionAttachment({
        status: "active",
        trialEnd: null,
        itemCount: 1,
        metadata: {
          ...metadata,
          riverPromotionApplication: "checkout",
          riverPromotionCouponId: "coupon_year_6",
        },
        discountCouponIds: [],
        invoices: [
          {
            status: "paid",
            billingReason: "subscription_create",
            total: 36750,
            discountCouponIds: ["coupon_year_6"],
          },
        ],
      })
    ).toMatchObject({
      action: "redeem",
      couponId: "coupon_year_6",
      deferred: false,
    });
  });
});
