import "server-only";

import { formatAudCents } from "@/lib/clinics/group-commercial";
import {
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

export type NegotiatedStartMode = (typeof NEGOTIATED_START_MODES)[number];
export type NegotiatedPlan = "ESSENTIAL" | "PRACTICE";
export type NegotiatedInterval = "MONTHLY" | "YEARLY";

/** Shown to operators and clinic administrators. There is no fixed end date. */
export const NEGOTIATED_PRICE_CONTINUES =
  "The negotiated price continues until a later written change or cancellation. It does not increase to the standard price.";

const HORIZON_MS = 10 * 366 * 24 * 60 * 60 * 1000;

export type ParsedNegotiatedTerms = {
  amountCents: number;
  startMode: NegotiatedStartMode;
  billingStartsAt: Date | null;
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

  return {
    ok: true,
    terms: {
      amountCents: amount.amountCents,
      startMode,
      billingStartsAt,
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
  currency: string | null;
  productId: string | null;
  interval: "month" | "year" | null;
};

type NegotiatedPriceShape = {
  id?: string | null;
  unit_amount?: number | null;
  currency?: string | null;
  product?: string | { id?: string | null } | null;
  recurring?: { interval?: string | null } | null;
};

export function subscriptionItemsForNegotiatedMatch(
  subscription: {
    items?: {
      data?: Array<{
        quantity?: number | null;
        price?: string | NegotiatedPriceShape | null;
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
    const currency =
      price && typeof price !== "string" && price.currency
        ? price.currency.trim().toLowerCase()
        : null;
    const productId = productIdFromNegotiatedPrice(price);
    const recurring =
      price && typeof price !== "string" ? price.recurring?.interval : null;
    const interval =
      recurring === "month" || recurring === "year" ? recurring : null;
    const quantity =
      item.quantity === null || item.quantity === undefined ? 1 : item.quantity;
    return {
      priceId,
      quantity,
      unitAmountCents: unitAmount,
      currency,
      productId,
      interval,
    };
  });
}

function productIdFromNegotiatedPrice(
  price: string | NegotiatedPriceShape | null | undefined
): string | null {
  if (!price || typeof price === "string") {
    return null;
  }
  if (typeof price.product === "string" && price.product.trim()) {
    return price.product.trim();
  }
  if (price.product && typeof price.product === "object" && price.product.id) {
    return price.product.id.trim() || null;
  }
  return null;
}

export type NegotiatedChargeVerdict =
  { verdict: "match" } | { verdict: "incomplete" } | { verdict: "mismatch" };

/**
 * The persisted Price, product, currency, interval, quantity and unit amount
 * authorise the conversion. `invoice.amount_paid` is settlement, not the price:
 * a customer balance or credit can change it without changing the offer.
 */
export function negotiatedChargeMatchesOffer(input: {
  amountCents: number;
  stripePriceId: string;
  stripeProductId: string | null;
  billingInterval: NegotiatedInterval;
  items: readonly NegotiatedSubscriptionItem[];
}): NegotiatedChargeVerdict {
  if (input.items.length === 0) {
    return { verdict: "incomplete" };
  }
  if (input.items.length !== 1) {
    return { verdict: "mismatch" };
  }
  const item = input.items[0];
  if (!item || !item.priceId || !input.stripePriceId) {
    return { verdict: "incomplete" };
  }
  if (item.priceId !== input.stripePriceId || item.quantity !== 1) {
    return { verdict: "mismatch" };
  }
  if (
    item.unitAmountCents === null ||
    item.currency === null ||
    item.interval === null ||
    item.productId === null ||
    !input.stripeProductId
  ) {
    return { verdict: "incomplete" };
  }
  if (
    item.unitAmountCents !== input.amountCents ||
    item.currency !== NEGOTIATED_CURRENCY ||
    item.interval !== stripeRecurringInterval(input.billingInterval) ||
    item.productId !== input.stripeProductId
  ) {
    return { verdict: "mismatch" };
  }
  return { verdict: "match" };
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
  stripeProductId: string | null;
  amountCents: number;
  commercialPlan: NegotiatedPlan;
  billingInterval: NegotiatedInterval;
};

export type NegotiatedRetryReason =
  | "subscription_not_retrieved"
  | "negotiated_terms_unverified"
  | "negotiated_price_mismatch";

export type ComplimentaryStripeDecision =
  | { action: "ignore"; reason: "complimentary_access" }
  | {
      action: "retry";
      reason: NegotiatedRetryReason;
      diagnostic: string;
      rememberSubscription: boolean;
      subscriptionId: string | null;
      customerId: string | null;
    }
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

const RETRY_DIAGNOSTIC: Record<NegotiatedRetryReason, string> = {
  subscription_not_retrieved: "Negotiated subscription could not be retrieved.",
  negotiated_terms_unverified:
    "Negotiated subscription terms could not be verified.",
  negotiated_price_mismatch:
    "Negotiated subscription does not match the open offer.",
};

function retryDecision(
  reason: NegotiatedRetryReason,
  input: {
    subscriptionId: string | null;
    customerId: string | null;
    rememberSubscription: boolean;
  }
): ComplimentaryStripeDecision {
  return {
    action: "retry",
    reason,
    diagnostic: RETRY_DIAGNOSTIC[reason],
    rememberSubscription: input.rememberSubscription,
    subscriptionId: input.subscriptionId,
    customerId: input.customerId,
  };
}

/**
 * Complimentary rows stay complimentary until a paid invoice matches the
 * persisted Price. Checkout completion and payment failure do not activate
 * paid access. A commercial mismatch is retryable and keeps the subscription
 * id so an operator can withdraw it. It is not marked ignored.
 */
export function decideComplimentaryStripeEvent(input: {
  eventType: string;
  invoiceIsPaid: boolean;
  subscriptionStatus: string | null;
  subscriptionId: string | null;
  customerId: string | null;
  items: readonly NegotiatedSubscriptionItem[];
  offer: PersistedNegotiatedOffer | null;
}): ComplimentaryStripeDecision {
  const offer = input.offer;
  const open =
    offer && (offer.status === "PREPARED" || offer.status === "CHECKOUT_OPEN");
  const paidInvoice = input.eventType === "invoice.paid" && input.invoiceIsPaid;
  const checkoutCompleted =
    input.eventType === "checkout.session.completed" ||
    input.eventType === "checkout.session.async_payment_succeeded";

  if (open && (paidInvoice || checkoutCompleted)) {
    const verdict = negotiatedChargeMatchesOffer({
      amountCents: offer.amountCents,
      stripePriceId: offer.stripePriceId ?? "",
      stripeProductId: offer.stripeProductId,
      billingInterval: offer.billingInterval,
      items: input.items,
    });
    if (verdict.verdict === "incomplete") {
      return retryDecision(
        input.items.length === 0
          ? "subscription_not_retrieved"
          : "negotiated_terms_unverified",
        {
          subscriptionId: input.subscriptionId,
          customerId: input.customerId,
          rememberSubscription: false,
        }
      );
    }
    if (verdict.verdict === "mismatch") {
      return retryDecision("negotiated_price_mismatch", {
        subscriptionId: input.subscriptionId,
        customerId: input.customerId,
        rememberSubscription: Boolean(input.subscriptionId),
      });
    }
    if (
      paidInvoice &&
      input.subscriptionStatus === "active" &&
      offer.stripePriceId
    ) {
      return {
        action: "convert",
        offerId: offer.id,
        commercialPlan: offer.commercialPlan,
        billingInterval: offer.billingInterval,
        stripePriceId: offer.stripePriceId,
      };
    }
    if (paidInvoice) {
      return retryDecision("negotiated_terms_unverified", {
        subscriptionId: input.subscriptionId,
        customerId: input.customerId,
        rememberSubscription: false,
      });
    }
    if (input.subscriptionId) {
      return {
        action: "remember_subscription",
        subscriptionId: input.subscriptionId,
        customerId: input.customerId,
      };
    }
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
    negotiatedChargeMatchesOffer({
      amountCents: offer.amountCents,
      stripePriceId: offer.stripePriceId,
      stripeProductId: offer.stripeProductId,
      billingInterval: offer.billingInterval,
      items: input.items,
    }).verdict !== "match"
  ) {
    return null;
  }
  return {
    commercialPlan: offer.commercialPlan,
    billingInterval: offer.billingInterval,
    stripePriceId: offer.stripePriceId,
  };
}
