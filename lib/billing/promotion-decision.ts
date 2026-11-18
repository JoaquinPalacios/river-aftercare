import "server-only";

import {
  RIVER_PROMOTION_APPLICATION_AFTER_ZERO_INVOICE,
  RIVER_PROMOTION_APPLICATION_CHECKOUT,
  RIVER_PROMOTION_APPLICATION_KEY,
  RIVER_PROMOTION_COUPON_ID_KEY,
  RIVER_PROMOTION_OFFER_ID_KEY,
} from "@/lib/billing/promotion-terms";

export type PromotionInvoiceView = {
  status: string | null;
  billingReason: string | null;
  total: number | null;
  discountCouponIds: readonly string[];
};

export type PromotionSubscriptionView = {
  status: string | null;
  trialEnd: number | null;
  itemCount: number;
  metadata: Record<string, string | null | undefined> | null | undefined;
  discountCouponIds: readonly string[];
  invoices: readonly PromotionInvoiceView[];
};

export type PromotionAttachmentDecision =
  | { action: "skip" }
  | { action: "not_ready" }
  | {
      action: "attach";
      offerId: string;
      couponId: string;
    }
  | {
      action: "redeem";
      offerId: string;
      couponId: string;
      deferred: boolean;
    }
  | { action: "missed"; offerId: string; reason: string }
  | { action: "refuse"; offerId: string | null; reason: string };

function metadataValue(
  metadata: PromotionSubscriptionView["metadata"],
  key: string
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hasCoupon(ids: readonly string[], couponId: string): boolean {
  return ids.includes(couponId);
}

function invoiceHasCoupon(
  invoice: PromotionInvoiceView,
  couponId: string
): boolean {
  return hasCoupon(invoice.discountCouponIds, couponId);
}

function positiveInvoiceWithoutCoupon(
  invoices: readonly PromotionInvoiceView[],
  couponId: string
): boolean {
  return invoices.some(
    (invoice) =>
      (invoice.total ?? 0) > 0 && !invoiceHasCoupon(invoice, couponId)
  );
}

function zeroTrialInvoiceReady(
  invoices: readonly PromotionInvoiceView[]
): boolean {
  return invoices.some(
    (invoice) =>
      invoice.billingReason === "subscription_create" &&
      invoice.status === "paid" &&
      (invoice.total ?? 0) === 0 &&
      invoice.discountCouponIds.length === 0
  );
}

/**
 * A coupon placed on Checkout beside a trial is applied to the opening A$0
 * invoice. Once-only coupons are consumed there. Repeating coupons also start
 * their clock on that invoice. The deferred path attaches the coupon only
 * after that A$0 invoice is paid and before any positive invoice exists.
 */
export function decidePromotionAttachment(
  view: PromotionSubscriptionView
): PromotionAttachmentDecision {
  const application = metadataValue(
    view.metadata,
    RIVER_PROMOTION_APPLICATION_KEY
  );
  if (!application) {
    return { action: "skip" };
  }
  const offerId = metadataValue(view.metadata, RIVER_PROMOTION_OFFER_ID_KEY);
  const couponId = metadataValue(view.metadata, RIVER_PROMOTION_COUPON_ID_KEY);
  if (!offerId || !couponId) {
    return {
      action: "refuse",
      offerId,
      reason: "promotion_metadata_incomplete",
    };
  }
  if (view.itemCount !== 1) {
    return {
      action: "refuse",
      offerId,
      reason: "promotion_subscription_shape",
    };
  }
  const foreignDiscount = view.discountCouponIds.some((id) => id !== couponId);
  if (foreignDiscount) {
    return { action: "refuse", offerId, reason: "promotion_discount_present" };
  }

  if (application === RIVER_PROMOTION_APPLICATION_CHECKOUT) {
    if (
      hasCoupon(view.discountCouponIds, couponId) ||
      view.invoices.some((invoice) => invoiceHasCoupon(invoice, couponId))
    ) {
      return { action: "redeem", offerId, couponId, deferred: false };
    }
    if (positiveInvoiceWithoutCoupon(view.invoices, couponId)) {
      return {
        action: "refuse",
        offerId,
        reason: "promotion_missing_on_invoice",
      };
    }
    if (view.invoices.length === 0) {
      return { action: "not_ready" };
    }
    return { action: "not_ready" };
  }

  if (application !== RIVER_PROMOTION_APPLICATION_AFTER_ZERO_INVOICE) {
    return {
      action: "refuse",
      offerId,
      reason: "promotion_application_unknown",
    };
  }
  if (view.trialEnd == null) {
    return { action: "refuse", offerId, reason: "promotion_trial_missing" };
  }
  if (view.status === "canceled" || view.status === "incomplete_expired") {
    return {
      action: "missed",
      offerId,
      reason: "promotion_subscription_closed",
    };
  }
  if (
    hasCoupon(view.discountCouponIds, couponId) ||
    view.invoices.some((invoice) => invoiceHasCoupon(invoice, couponId))
  ) {
    return { action: "redeem", offerId, couponId, deferred: true };
  }
  if (positiveInvoiceWithoutCoupon(view.invoices, couponId)) {
    return {
      action: "missed",
      offerId,
      reason: "promotion_paid_invoice_without_discount",
    };
  }
  if (!zeroTrialInvoiceReady(view.invoices)) {
    return { action: "not_ready" };
  }
  return { action: "attach", offerId, couponId };
}
