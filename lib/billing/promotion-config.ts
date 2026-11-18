import "server-only";

import {
  readTrimmedEnv,
  STRIPE_SECRET_KEY_ENV,
  type Env,
} from "@/lib/billing/env";
import { classifyStripeSecretKey } from "@/lib/billing/stripe-mode";
import {
  couponExpectation,
  type CouponExpectation,
  type PromotionInterval,
  type PromotionTerm,
} from "@/lib/billing/promotion-terms";

export const STRIPE_PROMOTIONAL_REDEMPTION_ENABLED_ENV =
  "STRIPE_PROMOTIONAL_REDEMPTION_ENABLED";
export const STRIPE_PROMOTIONAL_REDEMPTION_LIVE_ENABLED_ENV =
  "STRIPE_PROMOTIONAL_REDEMPTION_LIVE_ENABLED";
export const STRIPE_PROMOTION_WITH_TRIAL_ENABLED_ENV =
  "STRIPE_PROMOTION_WITH_TRIAL_ENABLED";

export const STRIPE_PROMOTION_MONTHLY_SIX_MONTH_COUPON_ID_ENV =
  "STRIPE_PROMOTION_MONTHLY_SIX_MONTH_COUPON_ID";
export const STRIPE_PROMOTION_MONTHLY_TWELVE_MONTH_COUPON_ID_ENV =
  "STRIPE_PROMOTION_MONTHLY_TWELVE_MONTH_COUPON_ID";
export const STRIPE_PROMOTION_ANNUAL_SIX_MONTH_COUPON_ID_ENV =
  "STRIPE_PROMOTION_ANNUAL_SIX_MONTH_COUPON_ID";
export const STRIPE_PROMOTION_ANNUAL_TWELVE_MONTH_COUPON_ID_ENV =
  "STRIPE_PROMOTION_ANNUAL_TWELVE_MONTH_COUPON_ID";

const COUPON_ID = /^[A-Za-z0-9_-]{3,80}$/;

export function promotionCouponEnvKey(
  interval: PromotionInterval,
  term: PromotionTerm
): string {
  if (interval === "MONTHLY" && term === "SIX_MONTHS") {
    return STRIPE_PROMOTION_MONTHLY_SIX_MONTH_COUPON_ID_ENV;
  }
  if (interval === "MONTHLY" && term === "TWELVE_MONTHS") {
    return STRIPE_PROMOTION_MONTHLY_TWELVE_MONTH_COUPON_ID_ENV;
  }
  if (interval === "YEARLY" && term === "SIX_MONTHS") {
    return STRIPE_PROMOTION_ANNUAL_SIX_MONTH_COUPON_ID_ENV;
  }
  return STRIPE_PROMOTION_ANNUAL_TWELVE_MONTH_COUPON_ID_ENV;
}

export function envFlagEnabled(name: string, env: Env = process.env): boolean {
  return readTrimmedEnv(name, env) === "true";
}

export function isPromotionalCouponId(value: string): boolean {
  if (!COUPON_ID.test(value)) {
    return false;
  }
  return !/^(?:sk|rk|rkcs|pk)_/.test(value) && !value.startsWith("whsec_");
}

export type PromotionalRedemption =
  | {
      ok: true;
      couponId: string;
      expectation: CouponExpectation;
      envKey: string;
    }
  | {
      ok: false;
      reason:
        | "disabled"
        | "live_disabled"
        | "trial_combination_disabled"
        | "coupon_missing"
        | "coupon_malformed";
      envKey: string;
    };

/**
 * Redemption stays off unless the environment asks for it. Live keys need a
 * second flag so a test coupon id cannot be copied into production and start
 * charging a discount. Trial-plus-promotion stays off until that flag is set.
 */
export function resolvePromotionalRedemption(
  env: Env,
  input: {
    interval: PromotionInterval;
    term: PromotionTerm;
    withTrial: boolean;
  }
): PromotionalRedemption {
  const envKey = promotionCouponEnvKey(input.interval, input.term);
  if (!envFlagEnabled(STRIPE_PROMOTIONAL_REDEMPTION_ENABLED_ENV, env)) {
    return { ok: false, reason: "disabled", envKey };
  }
  const secret = readTrimmedEnv(STRIPE_SECRET_KEY_ENV, env);
  const mode = secret ? classifyStripeSecretKey(secret) : null;
  if (
    mode === "live" &&
    !envFlagEnabled(STRIPE_PROMOTIONAL_REDEMPTION_LIVE_ENABLED_ENV, env)
  ) {
    return { ok: false, reason: "live_disabled", envKey };
  }
  if (
    input.withTrial &&
    !envFlagEnabled(STRIPE_PROMOTION_WITH_TRIAL_ENABLED_ENV, env)
  ) {
    return { ok: false, reason: "trial_combination_disabled", envKey };
  }
  const couponId = readTrimmedEnv(envKey, env);
  if (!couponId) {
    return { ok: false, reason: "coupon_missing", envKey };
  }
  if (!isPromotionalCouponId(couponId)) {
    return { ok: false, reason: "coupon_malformed", envKey };
  }
  return {
    ok: true,
    couponId,
    expectation: couponExpectation(input.interval, input.term),
    envKey,
  };
}

export type PromotionCouponSnapshot = {
  id: string;
  valid: boolean;
  deleted: boolean;
  percentOff: number | null;
  amountOff: number | null;
  currency: string | null;
  duration: string | null;
  durationInMonths: number | null;
  appliesToProductIds: string[] | null;
};

export function couponMatchesExpectation(
  coupon: PromotionCouponSnapshot,
  expectation: CouponExpectation,
  priceProductId: string | null
): boolean {
  if (coupon.deleted || !coupon.valid) {
    return false;
  }
  if (coupon.amountOff != null) {
    return false;
  }
  if (coupon.currency && coupon.currency !== "aud") {
    return false;
  }
  if (coupon.percentOff !== expectation.percentOff) {
    return false;
  }
  if (coupon.duration !== expectation.duration) {
    return false;
  }
  if (expectation.duration === "repeating") {
    if (coupon.durationInMonths !== expectation.durationInMonths) {
      return false;
    }
  } else if (coupon.durationInMonths != null) {
    return false;
  }
  if (coupon.appliesToProductIds && coupon.appliesToProductIds.length > 0) {
    if (
      !priceProductId ||
      !coupon.appliesToProductIds.includes(priceProductId)
    ) {
      return false;
    }
  }
  return true;
}

const PROMOTION_COUPON_ENV_KEYS = [
  STRIPE_PROMOTION_MONTHLY_SIX_MONTH_COUPON_ID_ENV,
  STRIPE_PROMOTION_MONTHLY_TWELVE_MONTH_COUPON_ID_ENV,
  STRIPE_PROMOTION_ANNUAL_SIX_MONTH_COUPON_ID_ENV,
  STRIPE_PROMOTION_ANNUAL_TWELVE_MONTH_COUPON_ID_ENV,
] as const;

/**
 * Coupon ids stay optional until a redemption flag is turned on. A flag
 * without four well-formed ids fails the configuration check. The ids
 * themselves are not printed.
 */
export function assessPromotionConfiguration(env: Env): {
  lines: string[];
  failures: string[];
} {
  const lines: string[] = [];
  const failures: string[] = [];
  const redemption = envFlagEnabled(
    STRIPE_PROMOTIONAL_REDEMPTION_ENABLED_ENV,
    env
  );
  const live = envFlagEnabled(
    STRIPE_PROMOTIONAL_REDEMPTION_LIVE_ENABLED_ENV,
    env
  );
  const withTrial = envFlagEnabled(
    STRIPE_PROMOTION_WITH_TRIAL_ENABLED_ENV,
    env
  );
  lines.push(
    `${STRIPE_PROMOTIONAL_REDEMPTION_ENABLED_ENV}: ${redemption ? "enabled" : "disabled"}`
  );
  lines.push(
    `${STRIPE_PROMOTIONAL_REDEMPTION_LIVE_ENABLED_ENV}: ${live ? "enabled" : "disabled"}`
  );
  lines.push(
    `${STRIPE_PROMOTION_WITH_TRIAL_ENABLED_ENV}: ${withTrial ? "enabled" : "disabled"}`
  );
  if (live && !redemption) {
    failures.push(
      `${STRIPE_PROMOTIONAL_REDEMPTION_LIVE_ENABLED_ENV} requires ${STRIPE_PROMOTIONAL_REDEMPTION_ENABLED_ENV}=true.`
    );
  }
  if (withTrial && !redemption) {
    failures.push(
      `${STRIPE_PROMOTION_WITH_TRIAL_ENABLED_ENV} requires ${STRIPE_PROMOTIONAL_REDEMPTION_ENABLED_ENV}=true.`
    );
  }
  for (const key of PROMOTION_COUPON_ENV_KEYS) {
    const value = readTrimmedEnv(key, env);
    if (!value) {
      lines.push(`${key}: ${redemption ? "missing" : "not configured"}`);
      if (redemption) {
        failures.push(
          `${key} is required while promotional redemption is enabled.`
        );
      }
      continue;
    }
    if (!isPromotionalCouponId(value)) {
      lines.push(`${key}: rejected`);
      if (redemption) {
        failures.push(
          `${key} must be a Stripe coupon id, not a key or secret.`
        );
      }
      continue;
    }
    lines.push(`${key}: configured`);
  }
  return { lines, failures };
}
