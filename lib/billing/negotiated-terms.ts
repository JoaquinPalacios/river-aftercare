import "server-only";

import { formatAudCents } from "@/lib/clinics/group-commercial";
import {
  endOfSydneyDay,
  parseSydneyCalendarDate,
  startOfSydneyDay,
} from "@/lib/billing/complimentary-term";

/**
 * Stripe's published minimum and maximum charge for AUD.
 * Card and AU BECS Direct Debit both use this AUD minimum.
 * https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts
 */
export const STRIPE_AUD_MINIMUM_CHARGE_CENTS = 50;
export const STRIPE_AUD_MAXIMUM_CHARGE_CENTS = 99_999_999;

export const NEGOTIATED_TERMS_MAX = 2000;
export const NEGOTIATED_CURRENCY = "aud";
export const NEGOTIATED_TAX_LABEL = "No GST";

export const NEGOTIATED_START_MODES = [
  "CUSTOMER_INITIATED",
  "AGREED_DATE",
] as const;
export const NEGOTIATED_RATE_POLICIES = [
  "INDEFINITE",
  "CANCEL_WHEN_RATE_ENDS",
] as const;

export type NegotiatedStartMode = (typeof NEGOTIATED_START_MODES)[number];
export type NegotiatedRateExpiryPolicy =
  (typeof NEGOTIATED_RATE_POLICIES)[number];
export type NegotiatedPlan = "ESSENTIAL" | "PRACTICE";
export type NegotiatedInterval = "MONTHLY" | "YEARLY";

const HORIZON_MS = 10 * 366 * 24 * 60 * 60 * 1000;

export type ParsedNegotiatedTerms = {
  amountCents: number;
  startMode: NegotiatedStartMode;
  billingStartsAt: Date | null;
  rateExpiryPolicy: NegotiatedRateExpiryPolicy;
  rateExpiresAt: Date | null;
  commercialTerms: string;
};

export function parseAudAmountToCents(
  value: unknown
): { ok: true; amountCents: number } | { ok: false; error: string } {
  if (typeof value !== "string") {
    return { ok: false, error: "Enter the price in Australian dollars." };
  }
  const trimmed = value
    .trim()
    .replace(/[$,\s]/g, "")
    .replace(/^A/i, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return {
      ok: false,
      error: "Enter the price in dollars and cents, such as 49 or 49.00.",
    };
  }
  const [dollarsText, fraction = ""] = trimmed.split(".");
  const dollars = Number(dollarsText);
  const cents = dollars * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
  if (!Number.isSafeInteger(cents)) {
    return { ok: false, error: "Enter a valid price in Australian dollars." };
  }
  if (cents < STRIPE_AUD_MINIMUM_CHARGE_CENTS) {
    return {
      ok: false,
      error: `The price must be at least ${formatAudCents(STRIPE_AUD_MINIMUM_CHARGE_CENTS)}.`,
    };
  }
  if (cents > STRIPE_AUD_MAXIMUM_CHARGE_CENTS) {
    return {
      ok: false,
      error: `The price must be at most ${formatAudCents(STRIPE_AUD_MAXIMUM_CHARGE_CENTS)}.`,
    };
  }
  return { ok: true, amountCents: cents };
}

export function parseNegotiatedStartMode(
  value: unknown
): NegotiatedStartMode | null {
  if (value === "CUSTOMER_INITIATED" || value === "AGREED_DATE") {
    return value;
  }
  return null;
}

export function parseNegotiatedRatePolicy(
  value: unknown
): NegotiatedRateExpiryPolicy | null {
  if (value === "INDEFINITE" || value === "CANCEL_WHEN_RATE_ENDS") {
    return value;
  }
  return null;
}

export function parseNegotiatedInterval(
  value: unknown
): NegotiatedInterval | null {
  if (value === "MONTHLY" || value === "YEARLY") {
    return value;
  }
  return null;
}

export function parseNegotiatedTermsText(
  value: unknown
): { ok: true; commercialTerms: string } | { ok: false; error: string } {
  if (typeof value !== "string") {
    return { ok: false, error: "Enter the agreed commercial terms." };
  }
  const commercialTerms = value.trim().replace(/\s+/g, " ");
  if (!commercialTerms) {
    return { ok: false, error: "Enter the agreed commercial terms." };
  }
  if (commercialTerms.length > NEGOTIATED_TERMS_MAX) {
    return {
      ok: false,
      error: `The commercial terms must be ${NEGOTIATED_TERMS_MAX} characters or fewer.`,
    };
  }
  return { ok: true, commercialTerms };
}

export function parseNegotiatedOfferInput(
  input: {
    amount: unknown;
    startMode: unknown;
    billingStartDate: unknown;
    rateExpiryPolicy: unknown;
    rateEndDate: unknown;
    commercialTerms: unknown;
  },
  now: Date
): { ok: true; terms: ParsedNegotiatedTerms } | { ok: false; error: string } {
  const amount = parseAudAmountToCents(input.amount);
  if (!amount.ok) {
    return amount;
  }
  const startMode = parseNegotiatedStartMode(input.startMode);
  if (!startMode) {
    return { ok: false, error: "Choose when payment can start." };
  }
  const rateExpiryPolicy = parseNegotiatedRatePolicy(input.rateExpiryPolicy);
  if (!rateExpiryPolicy) {
    return {
      ok: false,
      error: "Choose what happens when the special rate ends.",
    };
  }
  const text = parseNegotiatedTermsText(input.commercialTerms);
  if (!text.ok) {
    return text;
  }

  let billingStartsAt: Date | null = null;
  if (startMode === "AGREED_DATE") {
    const parsed = parseSydneyCalendarDate(input.billingStartDate);
    if (!parsed) {
      return { ok: false, error: "Choose the agreed start date." };
    }
    billingStartsAt = startOfSydneyDay(parsed.year, parsed.month, parsed.day);
    if (billingStartsAt.getTime() + HORIZON_MS < now.getTime()) {
      return {
        ok: false,
        error: "Choose a start date that is not in the past.",
      };
    }
    if (billingStartsAt.getTime() > now.getTime() + HORIZON_MS) {
      return { ok: false, error: "Choose a start date within 10 years." };
    }
    const todayStart = startOfSydneyDay(...sydneyCivilYmd(now));
    if (billingStartsAt.getTime() < todayStart.getTime()) {
      return {
        ok: false,
        error: "Choose a start date that is not in the past.",
      };
    }
  }

  let rateExpiresAt: Date | null = null;
  if (rateExpiryPolicy === "CANCEL_WHEN_RATE_ENDS") {
    const parsed = parseSydneyCalendarDate(input.rateEndDate);
    if (!parsed) {
      return { ok: false, error: "Choose the date the special rate ends." };
    }
    rateExpiresAt = endOfSydneyDay(parsed.year, parsed.month, parsed.day);
    const earliest = billingStartsAt ?? now;
    if (rateExpiresAt.getTime() <= earliest.getTime()) {
      return {
        ok: false,
        error: "The special rate must end after payment can start.",
      };
    }
    if (rateExpiresAt.getTime() > now.getTime() + HORIZON_MS) {
      return { ok: false, error: "Choose an end date within 10 years." };
    }
  }

  return {
    ok: true,
    terms: {
      amountCents: amount.amountCents,
      startMode,
      billingStartsAt,
      rateExpiryPolicy,
      rateExpiresAt,
      commercialTerms: text.commercialTerms,
    },
  };
}

function sydneyCivilYmd(instant: Date): [number, number, number] {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return [read("year"), read("month"), read("day")];
}

export function negotiatedPriceLookupKey(input: {
  clinicId: string;
  commercialPlan: NegotiatedPlan;
  billingInterval: NegotiatedInterval;
  amountCents: number;
}): string {
  return `river-negotiated-${input.clinicId}-${input.commercialPlan}-${input.billingInterval}-${input.amountCents}`;
}

export function negotiatedPriceIdempotencyKey(lookupKey: string): string {
  return `river-price-${lookupKey}`;
}

export function negotiatedCheckoutIdempotencyKey(input: {
  clinicId: string;
  offerId: string;
  priceId: string;
  sessionId: string | null;
  attempt: number;
}): string {
  const revision = input.attempt > 0 ? `attempt-${input.attempt}` : "initial";
  const session = input.sessionId ? `${input.sessionId}-` : "";
  return `river-negotiated-checkout-${input.clinicId}-${input.offerId}-${input.priceId}-${session}${revision}`;
}

export function stripeRecurringInterval(
  interval: NegotiatedInterval
): "month" | "year" {
  return interval === "YEARLY" ? "year" : "month";
}

export type NegotiatedSubscriptionItem = {
  priceId: string;
  quantity: number;
  unitAmountCents: number | null;
};

export function subscriptionItemsForNegotiatedMatch(
  subscription: {
    items?: {
      data?: Array<{
        quantity?: number | null;
        price?:
          string | { id?: string | null; unit_amount?: number | null } | null;
      }>;
    } | null;
  } | null
): NegotiatedSubscriptionItem[] {
  return (subscription?.items?.data ?? []).map((item) => {
    const price = item.price;
    const priceId =
      typeof price === "string" ? price : (price?.id?.trim() ?? "");
    const unitAmount =
      price &&
      typeof price !== "string" &&
      typeof price.unit_amount === "number"
        ? price.unit_amount
        : null;
    const quantity =
      item.quantity === null || item.quantity === undefined ? 1 : item.quantity;
    return { priceId, quantity, unitAmountCents: unitAmount };
  });
}

export function negotiatedChargeMatchesOffer(input: {
  amountCents: number;
  stripePriceId: string;
  items: readonly NegotiatedSubscriptionItem[];
  invoiceAmountPaid: number | null;
}): boolean {
  if (input.items.length !== 1) {
    return false;
  }
  const item = input.items[0];
  if (!item || item.quantity !== 1 || item.priceId !== input.stripePriceId) {
    return false;
  }
  if (
    item.unitAmountCents !== null &&
    item.unitAmountCents !== input.amountCents
  ) {
    return false;
  }
  if (
    input.invoiceAmountPaid !== null &&
    input.invoiceAmountPaid !== input.amountCents
  ) {
    return false;
  }
  return true;
}

export function negotiatedOfferPayable(input: {
  status: "PREPARED" | "CHECKOUT_OPEN" | "CONVERTED" | "WITHDRAWN";
  billingStartsAt: Date | null;
  now: Date;
}): { payable: boolean; waitingForStart: boolean } {
  if (input.status !== "PREPARED" && input.status !== "CHECKOUT_OPEN") {
    return { payable: false, waitingForStart: false };
  }
  if (
    input.billingStartsAt &&
    input.now.getTime() < input.billingStartsAt.getTime()
  ) {
    return { payable: false, waitingForStart: true };
  }
  return { payable: true, waitingForStart: false };
}

export function negotiatedRatePolicyLabel(input: {
  rateExpiryPolicy: NegotiatedRateExpiryPolicy;
  rateExpiresLabel: string | null;
}): string {
  if (input.rateExpiryPolicy === "INDEFINITE") {
    return "The negotiated price continues until a later written change. It does not increase to the standard price.";
  }
  return `The subscription ends at ${input.rateExpiresLabel ?? "the agreed date"}. The price does not increase to the standard price.`;
}

export function formatNegotiatedPrice(
  amountCents: number,
  interval: NegotiatedInterval
): string {
  return `${formatAudCents(amountCents)} / ${interval === "YEARLY" ? "year" : "month"}`;
}

export type PersistedNegotiatedOffer = {
  id: string;
  status: "PREPARED" | "CHECKOUT_OPEN" | "CONVERTED" | "WITHDRAWN";
  stripePriceId: string | null;
  amountCents: number;
  commercialPlan: NegotiatedPlan;
  billingInterval: NegotiatedInterval;
};

export type ComplimentaryStripeDecision =
  | {
      action: "ignore";
      reason: "complimentary_access" | "negotiated_price_mismatch";
    }
  | { action: "retry" }
  | {
      action: "convert";
      offerId: string;
      commercialPlan: NegotiatedPlan;
      billingInterval: NegotiatedInterval;
      stripePriceId: string;
    }
  | {
      action: "remember_subscription";
      subscriptionId: string;
      customerId: string | null;
    }
  | { action: "clear_failed_subscription"; subscriptionId: string };

/**
 * Complimentary rows stay complimentary until a paid invoice matches the
 * persisted offer. Checkout completion and payment failure do not activate
 * paid access and do not change the price.
 */
export function decideComplimentaryStripeEvent(input: {
  eventType: string;
  invoiceIsPaid: boolean;
  subscriptionStatus: string | null;
  subscriptionId: string | null;
  customerId: string | null;
  items: readonly NegotiatedSubscriptionItem[];
  invoiceAmountPaid: number | null;
  offer: PersistedNegotiatedOffer | null;
}): ComplimentaryStripeDecision {
  const offer = input.offer;
  const open =
    offer &&
    (offer.status === "PREPARED" || offer.status === "CHECKOUT_OPEN") &&
    offer.stripePriceId;
  if (
    input.eventType === "invoice.paid" &&
    input.invoiceIsPaid &&
    open &&
    input.items.length === 0
  ) {
    return { action: "retry" };
  }
  const matches =
    open &&
    negotiatedChargeMatchesOffer({
      amountCents: offer.amountCents,
      stripePriceId: offer.stripePriceId!,
      items: input.items,
      invoiceAmountPaid:
        input.eventType === "invoice.paid" ? input.invoiceAmountPaid : null,
    });

  if (
    input.eventType === "invoice.paid" &&
    input.invoiceIsPaid &&
    input.subscriptionStatus === "active" &&
    matches &&
    offer?.stripePriceId
  ) {
    return {
      action: "convert",
      offerId: offer.id,
      commercialPlan: offer.commercialPlan,
      billingInterval: offer.billingInterval,
      stripePriceId: offer.stripePriceId,
    };
  }

  if (
    input.eventType === "invoice.paid" &&
    input.invoiceIsPaid &&
    open &&
    !matches
  ) {
    return { action: "ignore", reason: "negotiated_price_mismatch" };
  }

  if (
    (input.eventType === "checkout.session.completed" ||
      input.eventType === "checkout.session.async_payment_succeeded") &&
    input.subscriptionId &&
    matches
  ) {
    return {
      action: "remember_subscription",
      subscriptionId: input.subscriptionId,
      customerId: input.customerId,
    };
  }

  const failed =
    input.eventType === "invoice.payment_failed" ||
    input.eventType === "checkout.session.async_payment_failed";
  if (
    failed &&
    input.subscriptionId &&
    (input.subscriptionStatus === "canceled" ||
      input.subscriptionStatus === "incomplete_expired")
  ) {
    return {
      action: "clear_failed_subscription",
      subscriptionId: input.subscriptionId,
    };
  }

  return { action: "ignore", reason: "complimentary_access" };
}

export function negotiatedCatalogFromOffer(input: {
  offer: PersistedNegotiatedOffer | null;
  items: readonly NegotiatedSubscriptionItem[];
  invoiceAmountPaid: number | null;
}): {
  commercialPlan: NegotiatedPlan;
  billingInterval: NegotiatedInterval;
  stripePriceId: string;
} | null {
  const offer = input.offer;
  if (
    !offer ||
    offer.status === "WITHDRAWN" ||
    !offer.stripePriceId ||
    (offer.status !== "CONVERTED" &&
      offer.status !== "CHECKOUT_OPEN" &&
      offer.status !== "PREPARED")
  ) {
    return null;
  }
  if (
    !negotiatedChargeMatchesOffer({
      amountCents: offer.amountCents,
      stripePriceId: offer.stripePriceId,
      items: input.items,
      invoiceAmountPaid: input.invoiceAmountPaid,
    })
  ) {
    return null;
  }
  return {
    commercialPlan: offer.commercialPlan,
    billingInterval: offer.billingInterval,
    stripePriceId: offer.stripePriceId,
  };
}
