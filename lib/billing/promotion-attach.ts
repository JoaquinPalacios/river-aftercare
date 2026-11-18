import "server-only";

import type Stripe from "stripe";

import {
  decidePromotionAttachment,
  type PromotionAttachmentDecision,
  type PromotionSubscriptionView,
} from "@/lib/billing/promotion-decision";

export function promotionAttachIdempotencyKey(
  subscriptionId: string,
  couponId: string
): string {
  return `river-promo-attach-${subscriptionId}-${couponId}`;
}

export function couponIdFromDiscount(discount: unknown): string | null {
  if (!discount || typeof discount !== "object") {
    return null;
  }
  const record = discount as {
    coupon?: string | { id?: string | null } | null;
    source?: { coupon?: string | { id?: string | null } | null } | null;
  };
  const sourceCoupon = record.source?.coupon;
  if (typeof sourceCoupon === "string" && sourceCoupon) {
    return sourceCoupon;
  }
  if (sourceCoupon && typeof sourceCoupon === "object" && sourceCoupon.id) {
    return sourceCoupon.id;
  }
  if (typeof record.coupon === "string" && record.coupon) {
    return record.coupon;
  }
  if (record.coupon && typeof record.coupon === "object" && record.coupon.id) {
    return record.coupon.id;
  }
  return null;
}

function invoiceDiscountIds(invoice: Stripe.Invoice): string[] {
  const ids = new Set<string>();
  for (const discount of invoice.discounts ?? []) {
    const id = couponIdFromDiscount(discount);
    if (id) {
      ids.add(id);
    }
  }
  const totals = invoice.total_discount_amounts ?? [];
  for (const total of totals) {
    const id = couponIdFromDiscount(total.discount);
    if (id) {
      ids.add(id);
    }
  }
  return [...ids];
}

export function promotionViewFromSubscription(
  subscription: Stripe.Subscription,
  invoices: readonly Stripe.Invoice[]
): PromotionSubscriptionView {
  return {
    status: subscription.status ?? null,
    trialEnd: subscription.trial_end ?? null,
    itemCount: subscription.items?.data?.length ?? 0,
    metadata: subscription.metadata ?? null,
    discountCouponIds: (subscription.discounts ?? [])
      .map((discount) => couponIdFromDiscount(discount))
      .filter((id): id is string => Boolean(id)),
    invoices: invoices.map((invoice) => ({
      status: invoice.status ?? null,
      billingReason: invoice.billing_reason ?? null,
      total: invoice.total ?? null,
      discountCouponIds: invoiceDiscountIds(invoice),
    })),
  };
}

export type PromotionAttachStripe = {
  retrieveSubscription(
    subscriptionId: string
  ): Promise<Stripe.Subscription | null>;
  listInvoices(subscriptionId: string): Promise<Stripe.Invoice[]>;
  attachCoupon(
    subscriptionId: string,
    couponId: string,
    idempotencyKey: string
  ): Promise<void>;
};

export async function ensurePromotionDiscount(input: {
  subscriptionId: string;
  stripe: PromotionAttachStripe;
}): Promise<PromotionAttachmentDecision> {
  const subscription = await input.stripe.retrieveSubscription(
    input.subscriptionId
  );
  if (!subscription) {
    return { action: "not_ready" };
  }
  const invoices = await input.stripe.listInvoices(input.subscriptionId);
  const decision = decidePromotionAttachment(
    promotionViewFromSubscription(subscription, invoices)
  );
  if (decision.action !== "attach") {
    return decision;
  }
  await input.stripe.attachCoupon(
    input.subscriptionId,
    decision.couponId,
    promotionAttachIdempotencyKey(input.subscriptionId, decision.couponId)
  );
  const refreshed = await input.stripe.retrieveSubscription(
    input.subscriptionId
  );
  if (!refreshed) {
    return { action: "not_ready" };
  }
  const after = decidePromotionAttachment(
    promotionViewFromSubscription(refreshed, invoices)
  );
  if (after.action === "redeem" || after.action === "attach") {
    return {
      action: "redeem",
      offerId: decision.offerId,
      couponId: decision.couponId,
      deferred: true,
    };
  }
  return after;
}

export function promotionStripeFromClient(
  stripe: Stripe
): PromotionAttachStripe {
  return {
    async retrieveSubscription(subscriptionId) {
      try {
        return await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["discounts", "discounts.source.coupon", "items.data.price"],
        });
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "statusCode" in error &&
          (error as { statusCode?: number }).statusCode === 404
        ) {
          return null;
        }
        throw error;
      }
    },
    async listInvoices(subscriptionId) {
      const page = await stripe.invoices.list({
        subscription: subscriptionId,
        limit: 10,
      });
      return page.data;
    },
    async attachCoupon(subscriptionId, couponId, idempotencyKey) {
      await stripe.subscriptions.update(
        subscriptionId,
        { discounts: [{ coupon: couponId }] },
        { idempotencyKey }
      );
    },
  };
}
