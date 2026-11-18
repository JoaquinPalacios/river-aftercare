import "server-only";

import type { Env } from "@/lib/billing/env";
import {
  couponMatchesExpectation,
  resolvePromotionalRedemption,
  type PromotionCouponSnapshot,
} from "@/lib/billing/promotion-config";
import type { OpenPromotionalOffer } from "@/lib/billing/promotion-offer";
import {
  promotionApplicationForTrial,
  type PromotionApplication,
  type PromotionInterval,
  type PromotionTerm,
} from "@/lib/billing/promotion-terms";

export type ResolvedCheckoutPromotion = {
  offerId: string;
  term: PromotionTerm;
  couponId: string;
  application: PromotionApplication;
};

export type CheckoutPromotionResolution =
  | { ok: true; promotion: ResolvedCheckoutPromotion | null }
  | {
      ok: false;
      code:
        | "promotion_unavailable"
        | "promotion_expired"
        | "promotion_with_trial_unavailable"
        | "promotion_ineligible";
      reason: string;
      offerId: string | null;
    };

export async function resolveCheckoutPromotion(input: {
  offer: OpenPromotionalOffer | null;
  plan: string | null;
  interval: string | null;
  trialDays: number | null;
  env?: Env;
  now?: Date;
  priceProductId?: string | null;
  retrieveCoupon?: (couponId: string) => Promise<PromotionCouponSnapshot>;
}): Promise<CheckoutPromotionResolution> {
  if (!input.offer) {
    return { ok: true, promotion: null };
  }
  const offerId = input.offer.id;
  if (input.plan !== "ESSENTIAL" && input.plan !== "PRACTICE") {
    return {
      ok: false,
      code: "promotion_ineligible",
      reason: "promotion_plan",
      offerId,
    };
  }
  if (input.interval !== "MONTHLY" && input.interval !== "YEARLY") {
    return {
      ok: false,
      code: "promotion_ineligible",
      reason: "promotion_interval",
      offerId,
    };
  }
  const now = input.now ?? new Date();
  if (
    input.offer.authorisationExpiresAt &&
    input.offer.authorisationExpiresAt.getTime() <= now.getTime()
  ) {
    return {
      ok: false,
      code: "promotion_expired",
      reason: "promotion_expired",
      offerId,
    };
  }
  const interval = input.interval as PromotionInterval;
  const withTrial = input.trialDays === 14;
  const redemption = resolvePromotionalRedemption(input.env ?? process.env, {
    interval,
    term: input.offer.term,
    withTrial,
  });
  if (!redemption.ok) {
    if (redemption.reason === "trial_combination_disabled") {
      return {
        ok: false,
        code: "promotion_with_trial_unavailable",
        reason: redemption.reason,
        offerId,
      };
    }
    return {
      ok: false,
      code: "promotion_unavailable",
      reason: redemption.reason,
      offerId,
    };
  }
  if (typeof input.retrieveCoupon !== "function") {
    return {
      ok: false,
      code: "promotion_unavailable",
      reason: "promotion_coupon_unverified",
      offerId,
    };
  }
  let coupon: PromotionCouponSnapshot;
  try {
    coupon = await input.retrieveCoupon(redemption.couponId);
  } catch {
    return {
      ok: false,
      code: "promotion_unavailable",
      reason: "promotion_coupon_lookup_failed",
      offerId,
    };
  }
  if (
    !couponMatchesExpectation(
      coupon,
      redemption.expectation,
      input.priceProductId ?? null
    )
  ) {
    return {
      ok: false,
      code: "promotion_unavailable",
      reason: "promotion_coupon_mismatch",
      offerId,
    };
  }
  return {
    ok: true,
    promotion: {
      offerId,
      term: input.offer.term,
      couponId: redemption.couponId,
      application: promotionApplicationForTrial(input.trialDays),
    },
  };
}
