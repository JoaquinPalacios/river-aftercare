import { describe, expect, it } from "vitest";

import { startOfSydneyDay } from "@/lib/billing/complimentary-term";
import {
  decideComplimentaryStripeEvent,
  formatNegotiatedPrice,
  negotiatedCheckoutIdempotencyKey,
  negotiatedPriceIdempotencyKey,
  negotiatedPriceLookupKey,
  parseAudAmountToCents,
  parseNegotiatedOfferInput,
  type NegotiatedSubscriptionItem,
  STRIPE_AUD_MAXIMUM_CHARGE_CENTS,
  STRIPE_AUD_MINIMUM_CHARGE_CENTS,
} from "@/lib/billing/negotiated-terms";

const NOW = new Date("2026-10-05T01:00:00.000Z");

describe("negotiated price parsing", () => {
  it("stores exact integer cents for monthly and annual examples", () => {
    expect(parseAudAmountToCents("49")).toEqual({
      ok: true,
      amountCents: 4900,
    });
    expect(parseAudAmountToCents("A$49.00")).toEqual({
      ok: true,
      amountCents: 4900,
    });
    expect(parseAudAmountToCents("499")).toEqual({
      ok: true,
      amountCents: 49900,
    });
    expect(parseAudAmountToCents("1,499.50")).toEqual({
      ok: true,
      amountCents: 149950,
    });
    expect(formatNegotiatedPrice(4900, "MONTHLY")).toBe("A$49 / month");
    expect(formatNegotiatedPrice(49900, "YEARLY")).toBe("A$499 / year");
  });

  it("rejects amounts below the Stripe AUD minimum and above the maximum", () => {
    expect(parseAudAmountToCents("0.49").ok).toBe(false);
    expect(parseAudAmountToCents("0.50")).toEqual({
      ok: true,
      amountCents: STRIPE_AUD_MINIMUM_CHARGE_CENTS,
    });
    expect(parseAudAmountToCents("999999.99")).toEqual({
      ok: true,
      amountCents: STRIPE_AUD_MAXIMUM_CHARGE_CENTS,
    });
    expect(parseAudAmountToCents("1000000").ok).toBe(false);
    expect(parseAudAmountToCents("49.999").ok).toBe(false);
    expect(parseAudAmountToCents("-49").ok).toBe(false);
  });

  it("keeps an agreed start date separate from complimentary expiry", () => {
    const indefinite = parseNegotiatedOfferInput(
      {
        amount: "49",
        startMode: "CUSTOMER_INITIATED",
        billingStartDate: "",
        commercialTerms: "A$49 per month while the collaboration continues.",
      },
      NOW
    );
    expect(indefinite).toMatchObject({
      ok: true,
      terms: {
        amountCents: 4900,
        startMode: "CUSTOMER_INITIATED",
        billingStartsAt: null,
      },
    });

    const dated = parseNegotiatedOfferInput(
      {
        amount: "499",
        startMode: "AGREED_DATE",
        billingStartDate: "2026-11-01",
        commercialTerms: "Annual price from the agreed Sydney day.",
      },
      NOW
    );
    expect(dated.ok).toBe(true);
    if (!dated.ok) {
      return;
    }
    expect(dated.terms.billingStartsAt).toEqual(startOfSydneyDay(2026, 11, 1));
  });

  it("builds stable Stripe idempotency keys from the persisted offer", () => {
    const lookup = negotiatedPriceLookupKey({
      clinicId: "clinic_1",
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
      amountCents: 4900,
    });
    expect(lookup).toBe("river-negotiated-clinic_1-ESSENTIAL-MONTHLY-4900");
    expect(negotiatedPriceIdempotencyKey(lookup)).toBe(`river-price-${lookup}`);
    expect(
      negotiatedCheckoutIdempotencyKey({
        clinicId: "clinic_1",
        offerId: "offer_1",
        priceId: "price_1",
        sessionId: null,
        attempt: 0,
      })
    ).toBe("river-negotiated-checkout-clinic_1-offer_1-price_1-initial");
  });
});

describe("complimentary Stripe decisions", () => {
  const offer = {
    id: "offer_1",
    status: "CHECKOUT_OPEN" as const,
    stripePriceId: "price_neg_49",
    stripeProductId: "prod_neg",
    amountCents: 4900,
    commercialPlan: "ESSENTIAL" as const,
    billingInterval: "MONTHLY" as const,
  };
  const item: NegotiatedSubscriptionItem = {
    priceId: "price_neg_49",
    quantity: 1,
    unitAmountCents: 4900,
    currency: "aud",
    productId: "prod_neg",
    interval: "month",
  };
  const paid = {
    eventType: "invoice.paid",
    invoiceIsPaid: true,
    subscriptionStatus: "active",
    subscriptionId: "sub_1",
    customerId: "cus_1",
    offer,
  };

  it("converts a paid invoice that matches the persisted price", () => {
    expect(
      decideComplimentaryStripeEvent({ ...paid, items: [item] })
    ).toMatchObject({
      action: "convert",
      offerId: "offer_1",
      stripePriceId: "price_neg_49",
    });
  });

  it("retries a paid invoice whose Price, amount, quantity, currency, or composition does not match", () => {
    const cases: NegotiatedSubscriptionItem[][] = [
      [{ ...item, priceId: "price_other" }],
      [{ ...item, unitAmountCents: 7900 }],
      [{ ...item, quantity: 2 }],
      [{ ...item, currency: "usd" }],
      [{ ...item, productId: "prod_other" }],
      [{ ...item, interval: "year" }],
      [item, { ...item, priceId: "price_extra" }],
    ];
    for (const items of cases) {
      expect(decideComplimentaryStripeEvent({ ...paid, items })).toMatchObject({
        action: "retry",
        reason: "negotiated_price_mismatch",
        rememberSubscription: true,
        subscriptionId: "sub_1",
      });
    }
  });

  it("does not convert when there is no open offer", () => {
    expect(
      decideComplimentaryStripeEvent({ ...paid, items: [item], offer: null })
    ).toEqual({ action: "ignore", reason: "complimentary_access" });
    expect(
      decideComplimentaryStripeEvent({
        eventType: "customer.subscription.deleted",
        invoiceIsPaid: false,
        subscriptionStatus: "canceled",
        subscriptionId: "sub_1",
        customerId: "cus_1",
        items: [item],
        offer,
      })
    ).toEqual({ action: "ignore", reason: "complimentary_access" });
  });

  it("retries when the subscription Price cannot be verified", () => {
    expect(
      decideComplimentaryStripeEvent({ ...paid, items: [] })
    ).toMatchObject({
      action: "retry",
      reason: "subscription_not_retrieved",
      rememberSubscription: false,
    });
    expect(
      decideComplimentaryStripeEvent({
        ...paid,
        items: [{ ...item, currency: null }],
      })
    ).toMatchObject({
      action: "retry",
      reason: "negotiated_terms_unverified",
      rememberSubscription: false,
    });
  });

  it("remembers Checkout and clears only a canceled or expired subscription", () => {
    expect(
      decideComplimentaryStripeEvent({
        eventType: "checkout.session.completed",
        invoiceIsPaid: false,
        subscriptionStatus: "active",
        subscriptionId: "sub_1",
        customerId: "cus_1",
        items: [item],
        offer,
      })
    ).toEqual({
      action: "remember_subscription",
      subscriptionId: "sub_1",
      customerId: "cus_1",
    });
    expect(
      decideComplimentaryStripeEvent({
        eventType: "invoice.payment_failed",
        invoiceIsPaid: false,
        subscriptionStatus: "canceled",
        subscriptionId: "sub_1",
        customerId: "cus_1",
        items: [item],
        offer,
      })
    ).toEqual({ action: "clear_failed_subscription", subscriptionId: "sub_1" });
    expect(
      decideComplimentaryStripeEvent({
        eventType: "invoice.payment_failed",
        invoiceIsPaid: false,
        subscriptionStatus: "past_due",
        subscriptionId: "sub_1",
        customerId: "cus_1",
        items: [item],
        offer,
      })
    ).toEqual({ action: "ignore", reason: "complimentary_access" });
  });
});
