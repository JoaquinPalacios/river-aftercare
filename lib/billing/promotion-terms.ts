import "server-only";

import { formatAudCents } from "@/lib/clinics/group-commercial";
import { PLAN_PRICES } from "@/lib/marketing/plans";

/**
 * Introductory discounts for new Essential and Practice clinics.
 * Monthly and annual catalogue billing stay as they are. There is no annual
 * commitment billed monthly. Group, negotiated prices, and add-on prices are
 * outside this catalogue.
 */

export const PROMOTION_TERMS = ["SIX_MONTHS", "TWELVE_MONTHS"] as const;

export type PromotionTerm = (typeof PROMOTION_TERMS)[number];

export type PromotionInterval = "MONTHLY" | "YEARLY";

export type PromotionPlan = "ESSENTIAL" | "PRACTICE";

export const RIVER_PROMOTION_OFFER_ID_KEY = "riverPromotionOfferId";
export const RIVER_PROMOTION_COUPON_ID_KEY = "riverPromotionCouponId";
export const RIVER_PROMOTION_APPLICATION_KEY = "riverPromotionApplication";
export const RIVER_PROMOTION_APPLICATION_CHECKOUT = "checkout";
export const RIVER_PROMOTION_APPLICATION_AFTER_ZERO_INVOICE =
  "after_zero_invoice";

export type PromotionApplication =
  | typeof RIVER_PROMOTION_APPLICATION_CHECKOUT
  | typeof RIVER_PROMOTION_APPLICATION_AFTER_ZERO_INVOICE;

export type CouponExpectation = {
  percentOff: 50 | 25;
  duration: "once" | "repeating";
  durationInMonths: 6 | 12 | null;
};

export function isPromotionTerm(value: string): value is PromotionTerm {
  return value === "SIX_MONTHS" || value === "TWELVE_MONTHS";
}

export type IntroductoryTermField =
  | { status: "absent" }
  | { status: "clear" }
  | { status: "set"; term: PromotionTerm }
  | { status: "invalid" };

/** Absent means the form did not ask, so an existing authorisation stays. */
export function parseIntroductoryTermField(
  value: string | null
): IntroductoryTermField {
  if (value == null) {
    return { status: "absent" };
  }
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "NONE") {
    return { status: "clear" };
  }
  if (isPromotionTerm(trimmed)) {
    return { status: "set", term: trimmed };
  }
  return { status: "invalid" };
}

export function couponExpectation(
  interval: PromotionInterval,
  term: PromotionTerm
): CouponExpectation {
  if (interval === "MONTHLY" && term === "SIX_MONTHS") {
    return { percentOff: 50, duration: "repeating", durationInMonths: 6 };
  }
  if (interval === "MONTHLY" && term === "TWELVE_MONTHS") {
    return { percentOff: 50, duration: "repeating", durationInMonths: 12 };
  }
  if (interval === "YEARLY" && term === "SIX_MONTHS") {
    return { percentOff: 25, duration: "once", durationInMonths: null };
  }
  return { percentOff: 50, duration: "once", durationInMonths: null };
}

export function promotionApplicationForTrial(
  trialDays: number | null
): PromotionApplication {
  return trialDays === 14
    ? RIVER_PROMOTION_APPLICATION_AFTER_ZERO_INVOICE
    : RIVER_PROMOTION_APPLICATION_CHECKOUT;
}

function catalogueCents(
  plan: PromotionPlan,
  interval: PromotionInterval
): number {
  const prices =
    plan === "ESSENTIAL" ? PLAN_PRICES.essential : PLAN_PRICES.practice;
  const dollars =
    interval === "YEARLY" ? prices.annualAudInclGst : prices.monthlyAudInclGst;
  return Math.round(dollars * 100);
}

export function discountedCents(
  amountCents: number,
  percentOff: 50 | 25
): number {
  return Math.round((amountCents * (100 - percentOff)) / 100);
}

export type PromotionQuote = {
  plan: PromotionPlan;
  interval: PromotionInterval;
  term: PromotionTerm;
  percentOff: 50 | 25;
  catalogueCents: number;
  discountedCents: number;
  priceLabel: string;
  renewalLabel: string;
  detailLines: readonly string[];
};

export function promotionQuote(input: {
  plan: PromotionPlan;
  interval: PromotionInterval;
  term: PromotionTerm;
  trial: boolean;
}): PromotionQuote {
  const expectation = couponExpectation(input.interval, input.term);
  const fullCents = catalogueCents(input.plan, input.interval);
  const introCents = discountedCents(fullCents, expectation.percentOff);
  const fullLabel = formatAudCents(fullCents);
  const introLabel = formatAudCents(introCents);
  const planName = input.plan === "ESSENTIAL" ? "Essential" : "Practice";
  const months = input.term === "SIX_MONTHS" ? 6 : 12;

  if (input.interval === "MONTHLY") {
    const priceLabel = `${introLabel} / month for ${months} months`;
    const renewalLabel = `Then ${fullLabel} / month.`;
    const detailLines = [
      `${expectation.percentOff}% off the ${planName} monthly price for the first ${months} paid months.`,
      renewalLabel,
      "Monthly billing continues after the introductory price. This is not an annual commitment.",
    ];
    if (input.trial) {
      detailLines.unshift(
        "14 days free, then the introductory monthly price. A card or Australian bank debit is still required. Cancel from Billing before the trial ends to avoid the first charge."
      );
    }
    return {
      plan: input.plan,
      interval: input.interval,
      term: input.term,
      percentOff: expectation.percentOff,
      catalogueCents: fullCents,
      discountedCents: introCents,
      priceLabel,
      renewalLabel,
      detailLines,
    };
  }

  const priceLabel = `${introLabel} for the first year`;
  const renewalLabel = `Then ${fullLabel} / year.`;
  const detailLines = [
    `${expectation.percentOff}% off the first annual invoice. That is the ${months}-month introductory offer for annual upfront billing.`,
    renewalLabel,
    "The annual plan stays one upfront payment. It is not billed monthly.",
  ];
  if (input.trial) {
    detailLines.unshift(
      "14 days free, then the discounted first annual invoice. A card or Australian bank debit is still required. Cancel from Billing before the trial ends to avoid that charge."
    );
  }
  return {
    plan: input.plan,
    interval: input.interval,
    term: input.term,
    percentOff: expectation.percentOff,
    catalogueCents: fullCents,
    discountedCents: introCents,
    priceLabel,
    renewalLabel,
    detailLines,
  };
}

export function promotionTermLabel(term: PromotionTerm): string {
  return term === "SIX_MONTHS" ? "Six-month offer" : "Twelve-month offer";
}

export function sydneyDateInputValue(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * A 14-day trial plus a coupon that starts when the subscription starts still
 * covers the promised paid periods. The coupon window is calendar months from
 * attachment. The first paid invoice is at the trial end, and each later
 * monthly invoice is one month after that. The last discounted monthly invoice
 * is one month inside the window because 14 days is shorter than a month.
 */
export function paidMonthlyInvoicesInsideCouponWindow(input: {
  couponStart: Date;
  couponEnd: Date;
  trialEnd: Date;
  paidInvoices: number;
}): number {
  let included = 0;
  const cursor = new Date(input.trialEnd.getTime());
  for (let index = 0; index < input.paidInvoices; index += 1) {
    if (index > 0) {
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    if (
      cursor.getTime() >= input.couponStart.getTime() &&
      cursor.getTime() < input.couponEnd.getTime()
    ) {
      included += 1;
    }
  }
  return included;
}
