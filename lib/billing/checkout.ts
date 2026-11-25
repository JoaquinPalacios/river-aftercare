import "server-only";

import { createHash } from "node:crypto";

import type Stripe from "stripe";

import {
  BillingStatus,
  EntitlementStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import {
  RIVER_CHECKOUT_ATTEMPT_METADATA_KEY,
  RIVER_CLINIC_ID_METADATA_KEY,
} from "@/lib/billing/identity";
import { clinicIsClosed } from "@/lib/clinics/clinic-activity";
import { isOfferedAdditionalSiteQuantity } from "@/lib/clinics/group-commercial";
import { checkoutReturnUrlIssue } from "@/lib/billing/checkout-origin";
import { logStripeBilling } from "@/lib/billing/log";
import {
  checkoutFailureLogFields,
  classifyStripeCheckoutFailure,
} from "@/lib/billing/stripe-error-log";
import { stripeDeployment } from "@/lib/billing/stripe-mode";
import type { RetrievedCataloguePrice } from "@/lib/billing/catalogue-price";
import {
  rejectMismatchedCataloguePrices,
  type CataloguePriceReader,
} from "@/lib/billing/catalogue-price-check";
import {
  stripeGroupBasePriceId,
  stripeGroupSiteAddonPriceId,
  stripePriceIdForPlan,
  StripePriceMappingError,
  UnknownStripePriceError,
  type BillingIntervalCode,
  type SelfServeCommercialPlan,
} from "@/lib/billing/price-map";
import {
  getStripeClient,
  getStripeClientConfig,
} from "@/lib/billing/stripe-client";
import type { Env } from "@/lib/billing/env";
import {
  PRIVACY_ACKNOWLEDGEMENT_VERSION,
  TERMS_ACCEPTANCE_VERSION,
} from "@/lib/legal/status";
import { getPrisma } from "@/lib/prisma";
import {
  CATALOGUE_TRIAL_PERIOD_DAYS,
  catalogueTrialDaysForState,
  catalogueTrialHistory,
  RIVER_TRIAL_DAYS_METADATA_KEY,
} from "@/lib/billing/trial";
import type { PromotionCouponSnapshot } from "@/lib/billing/promotion-config";
import {
  resolveCheckoutPromotion,
  type ResolvedCheckoutPromotion,
} from "@/lib/billing/promotion-checkout";
import {
  expirePromotionalOffer,
  loadOpenPromotionalOffer,
  markPromotionalOfferCheckoutOpen,
  promotionalOfferStillOpen,
  type OpenPromotionalOffer,
} from "@/lib/billing/promotion-offer";
import {
  RIVER_PROMOTION_APPLICATION_AFTER_ZERO_INVOICE,
  RIVER_PROMOTION_APPLICATION_CHECKOUT,
  RIVER_PROMOTION_APPLICATION_KEY,
  RIVER_PROMOTION_COUPON_ID_KEY,
  RIVER_PROMOTION_OFFER_ID_KEY,
} from "@/lib/billing/promotion-terms";

/**
 * Card and AU BECS only.
 *
 * Stripe API `2026-10-28.endive` rejects `payment_method_types` on Checkout
 * Session create. `allowed_payment_method_types` filters the account's
 * dynamic methods, so other methods enabled in the Dashboard stay unavailable.
 * Omitting the filter would offer those methods. Stripe still renders the
 * BECS mandate. River does not copy that text.
 */
export const CHECKOUT_PAYMENT_METHOD_TYPES = ["card", "au_becs_debit"] as const;

const PAID_BILLING = new Set<BillingStatus>([
  BillingStatus.ACTIVE,
  BillingStatus.TRIALING,
  BillingStatus.PAST_DUE,
  BillingStatus.CANCEL_AT_PERIOD_END,
]);

export type CheckoutFailureCode =
  | "not_prepared"
  | "group_offer_missing"
  | "group_offer_invalid"
  | "price_not_configured"
  | "already_active"
  | "subscription_exists"
  | "payment_in_progress"
  | "terms_required"
  | "identity_incomplete"
  | "checkout_already_completed"
  | "checkout_unavailable"
  | "checkout_failed"
  | "trial_eligibility_unavailable"
  | "promotion_unavailable"
  | "promotion_expired"
  | "promotion_with_trial_unavailable"
  | "promotion_ineligible"
  | "negotiated_not_ready"
  | "negotiated_terms_required"
  | "split_in_progress";

export type CheckoutActorDecision =
  | { ok: true; clinicId: string }
  | { ok: false; code: "staff_forbidden" | "operator_forbidden" | "tenancy" };

export function assertClinicCheckoutActor(input: {
  role: "ADMIN" | "STAFF";
  membershipSource: "membership" | "operator_support";
  sessionClinicId: string;
  submittedClinicId?: string | null;
}): CheckoutActorDecision {
  if (input.role !== "ADMIN") {
    return { ok: false, code: "staff_forbidden" };
  }
  if (input.membershipSource === "operator_support") {
    return { ok: false, code: "operator_forbidden" };
  }
  const submitted = input.submittedClinicId?.trim() ?? "";
  if (submitted && submitted !== input.sessionClinicId) {
    return { ok: false, code: "tenancy" };
  }
  return { ok: true, clinicId: input.sessionClinicId };
}

export function checkoutFailureMessage(code: CheckoutFailureCode): string {
  switch (code) {
    case "not_prepared":
      return "River Aftercare hasn't prepared billing for this clinic yet.";
    case "group_offer_missing":
      return "River Aftercare hasn't prepared a Group offer for this clinic yet.";
    case "group_offer_invalid":
      return "The prepared Group offer needs to be updated before payment.";
    case "price_not_configured":
    case "checkout_unavailable":
      return "Secure payment isn't available right now. Contact River Aftercare if this continues.";
    case "already_active":
      return "This clinic already has an active River Aftercare subscription.";
    case "subscription_exists":
    case "payment_in_progress":
      return "Payment is already in progress for this clinic.";
    case "terms_required":
      return "Agree to the Terms & Conditions before continuing.";
    case "identity_incomplete":
      return "Please review the billing details.";
    case "checkout_already_completed":
      return "Payment has already been submitted.";
    case "checkout_failed":
      return "We couldn't open secure payment. Your details have been saved. Please try again.";
    case "trial_eligibility_unavailable":
      return "We couldn't confirm the 14-day free trial. Payment was not opened, and you have not been charged. Please try again.";
    case "promotion_unavailable":
      return "The introductory offer can't be applied right now. Payment was not opened, and you have not been charged.";
    case "promotion_expired":
      return "This introductory offer has expired. Payment was not opened. Ask River Aftercare to prepare billing again.";
    case "promotion_with_trial_unavailable":
      return "The introductory offer can't be combined with the free trial yet. Payment was not opened, and you have not been charged.";
    case "promotion_ineligible":
      return "This clinic can't use the introductory offer. Payment was not opened, and you have not been charged.";
    case "negotiated_not_ready":
      return "This negotiated price is not open for payment yet.";
    case "negotiated_terms_required":
      return "Accept the negotiated commercial terms before continuing.";
    case "split_in_progress":
      return "An account split is open for this clinic. Finish or cancel it before payment.";
  }
}

export type CheckoutStripePort = {
  prices: CataloguePriceReader;
  customers: {
    create(
      params: {
        email?: string;
        name?: string;
        address?: {
          line1?: string;
          line2?: string;
          city?: string;
          state?: string;
          postal_code?: string;
          country?: string;
        };
        metadata?: Record<string, string>;
      },
      options?: { idempotencyKey?: string }
    ): Promise<{ id: string; metadata?: Record<string, string> | null }>;
    update(
      id: string,
      params: {
        email?: string;
        name?: string;
        address?: {
          line1?: string;
          line2?: string;
          city?: string;
          state?: string;
          postal_code?: string;
          country?: string;
        };
        metadata?: Record<string, string>;
      }
    ): Promise<{ id: string; metadata?: Record<string, string> | null }>;
  };
  checkout: {
    sessions: {
      create(
        params: CheckoutSessionCreateShape,
        options?: { idempotencyKey?: string }
      ): Promise<{ id: string; url: string | null; status: string | null }>;
      retrieve(
        id: string,
        params?: { expand?: string[] }
      ): Promise<{
        id: string;
        url: string | null;
        status: string | null;
        line_items?: {
          data: Array<{
            price?: { id?: string } | string | null;
            quantity?: number | null;
          }>;
        } | null;
        metadata?: Record<string, string> | null;
      }>;
      expire(id: string): Promise<unknown>;
    };
  };
  /**
   * Optional so existing test doubles stay non-trial. Production Stripe has
   * this method. When local state promises a trial, a missing or failed list
   * refuses Checkout instead of opening an immediately chargeable session.
   */
  subscriptions?: {
    list(params: {
      customer: string;
      status: "all";
      limit: number;
    }): Promise<{ data?: ReadonlyArray<{ id?: string }> | null }>;
  };
  /**
   * Required only when an authorised introductory offer is present. A missing
   * retrieve refuses Checkout rather than charging the catalogue price.
   */
  coupons?: {
    retrieve(id: string): Promise<PromotionCouponSnapshot>;
  };
};

export type CheckoutSessionCreateShape = {
  mode: "subscription";
  customer: string;
  client_reference_id: string;
  line_items: Array<{ price: string; quantity: number }>;
  success_url: string;
  cancel_url: string;
  metadata: Record<string, string>;
  subscription_data: {
    metadata: Record<string, string>;
    trial_period_days?: number;
  };
  allowed_payment_method_types: Array<
    (typeof CHECKOUT_PAYMENT_METHOD_TYPES)[number]
  >;
  /**
   * Keep collecting a card or AU BECS during a trial. Stripe's default is
   * already `always`; naming it stops a later change to `if_required`.
   */
  payment_method_collection: "always";
  wallet_options: { link: { display: "never" } };
  /**
   * Omitted when `discounts` is set. Stripe rejects a session that sends both.
   */
  allow_promotion_codes?: false;
  discounts?: Array<{ coupon: string }>;
};

export type LockedCheckoutState = {
  clinicId: string;
  userId: string;
  commercialPlan: SelfServeCommercialPlan | "GROUP" | null;
  billingInterval: BillingIntervalCode | null;
  billingStatus: BillingStatus | null;
  entitlementStatus: EntitlementStatus | null;
  commercialArrangement?: "PAID" | "COMPLIMENTARY" | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCheckoutSessionId: string | null;
  /** Set after a catalogue trial starts. A later checkout cannot trial again. */
  trialEndsAt?: Date | null;
  /** Open operator-authorised introductory offer. Absent means no discount. */
  promotionalOffer?: OpenPromotionalOffer | null;
  offeredAdditionalSiteQuantity: number | null;
  termsAccepted: boolean;
  identity: {
    legalEntityName: string;
    billingEmail: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  } | null;
};

export type CheckoutExecutionResult =
  | {
      ok: true;
      url: string;
      reusedSession: boolean;
      createdCustomer: boolean;
    }
  | { ok: false; code: CheckoutFailureCode };

function isStripeHostedCheckoutUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" && parsed.hostname === "checkout.stripe.com"
    );
  } catch {
    return false;
  }
}

function sessionLineItems(session: {
  line_items?: {
    data: Array<{
      price?: { id?: string } | string | null;
      quantity?: number | null;
    }>;
  } | null;
}): Array<{ price: string; quantity: number }> {
  return (session.line_items?.data ?? []).flatMap((item) => {
    const price = item.price;
    const priceId = typeof price === "string" ? price : (price?.id ?? "");
    if (!priceId) {
      return [];
    }
    const quantity =
      item.quantity === null || item.quantity === undefined ? 1 : item.quantity;
    return [{ price: priceId, quantity }];
  });
}

function sameLineItems(
  actual: ReadonlyArray<{ price: string; quantity: number }>,
  expected: ReadonlyArray<{ price: string; quantity: number }>
): boolean {
  if (actual.length !== expected.length) {
    return false;
  }
  const remaining = [...actual];
  for (const item of expected) {
    const index = remaining.findIndex(
      (candidate) =>
        candidate.price === item.price && candidate.quantity === item.quantity
    );
    if (index < 0) {
      return false;
    }
    remaining.splice(index, 1);
  }
  return remaining.length === 0;
}

function checkoutLineItems(
  state: LockedCheckoutState,
  env: Env | undefined
): Array<{ price: string; quantity: number }> {
  const plan = state.commercialPlan;
  const interval = state.billingInterval;
  if (!plan || !interval) {
    throw new StripePriceMappingError(
      "Stripe Price ID is not configured for that plan and interval."
    );
  }
  if (plan === "GROUP") {
    const quantity = state.offeredAdditionalSiteQuantity ?? 0;
    const basePriceId = stripeGroupBasePriceId(interval, env);
    if (quantity === 0) {
      return [{ price: basePriceId, quantity: 1 }];
    }
    return [
      { price: basePriceId, quantity: 1 },
      {
        price: stripeGroupSiteAddonPriceId(interval, env),
        quantity,
      },
    ];
  }
  return [{ price: stripePriceIdForPlan(plan, interval, env), quantity: 1 }];
}

function productIdFromPrice(price: RetrievedCataloguePrice): string | null {
  if (!price.product) {
    return null;
  }
  if (typeof price.product === "string") {
    return price.product;
  }
  return price.product.id ?? null;
}

function checkoutMetadata(
  state: LockedCheckoutState,
  trialDays: typeof CATALOGUE_TRIAL_PERIOD_DAYS | null = null,
  promotion: ResolvedCheckoutPromotion | null = null
): Record<string, string> {
  const metadata: Record<string, string> = {
    [RIVER_CLINIC_ID_METADATA_KEY]: state.clinicId,
  };
  if (trialDays === CATALOGUE_TRIAL_PERIOD_DAYS) {
    metadata[RIVER_TRIAL_DAYS_METADATA_KEY] = String(
      CATALOGUE_TRIAL_PERIOD_DAYS
    );
  }
  if (promotion) {
    metadata[RIVER_PROMOTION_OFFER_ID_KEY] = promotion.offerId;
    metadata[RIVER_PROMOTION_COUPON_ID_KEY] = promotion.couponId;
    metadata[RIVER_PROMOTION_APPLICATION_KEY] = promotion.application;
  }
  if (
    state.commercialPlan === "GROUP" &&
    state.billingInterval &&
    typeof state.offeredAdditionalSiteQuantity === "number"
  ) {
    metadata.commercialPlan = "GROUP";
    metadata.billingInterval = state.billingInterval;
    metadata.offeredAdditionalSiteQuantity = String(
      state.offeredAdditionalSiteQuantity
    );
  }
  return metadata;
}

/**
 * Attempt 0 with no stored Session keeps the historical `initial` suffix.
 * A Checkout Session that Stripe already created under that key is still
 * returned on replay. A later definitive rejection stores attempt 1, 2, …
 * on the Customer and the suffix becomes `attempt-N`.
 * A stored Session id stays in the suffix so a lost create for that
 * replacement cannot fork another Session. Once the attempt has advanced,
 * the Session id and the attempt are both included.
 */
function promotionIdempotencySegment(
  promotion: ResolvedCheckoutPromotion | null
): string {
  if (!promotion) {
    return "";
  }
  const mode =
    promotion.application === RIVER_PROMOTION_APPLICATION_AFTER_ZERO_INVOICE
      ? "d"
      : "c";
  return `-promo-${mode}-${promotion.offerId}`;
}

function boundedCheckoutIdempotencyKey(key: string): string {
  if (key.length <= 255) {
    return key;
  }
  return `river-checkout-${createHash("sha256").update(key).digest("hex")}`;
}

export function checkoutIdempotencyKey(
  clinicId: string,
  lineItems: ReadonlyArray<{ price: string; quantity: number }>,
  sessionId: string | null,
  attempt = 0,
  trialDays = 0,
  promotion: ResolvedCheckoutPromotion | null = null
): string {
  const suffix = checkoutIdempotencySuffix(sessionId, attempt);
  const trialSegment =
    trialDays === CATALOGUE_TRIAL_PERIOD_DAYS ? "-trial-14" : "";
  const promotionSegment = promotionIdempotencySegment(promotion);
  if (lineItems.length === 1 && lineItems[0]?.quantity === 1) {
    return boundedCheckoutIdempotencyKey(
      `river-checkout-${clinicId}-${lineItems[0].price}${trialSegment}${promotionSegment}-${suffix}`
    );
  }
  const signature = lineItems
    .map((item) => `${item.price}x${item.quantity}`)
    .join("+");
  return boundedCheckoutIdempotencyKey(
    `river-checkout-${clinicId}-${signature}${trialSegment}${promotionSegment}-${suffix}`
  );
}

function sessionRequestsTrial(session: {
  metadata?: Record<string, string> | null;
}): boolean {
  return (
    session.metadata?.[RIVER_TRIAL_DAYS_METADATA_KEY] ===
    String(CATALOGUE_TRIAL_PERIOD_DAYS)
  );
}

function sessionPromotionMatches(
  session: { metadata?: Record<string, string> | null },
  promotion: ResolvedCheckoutPromotion | null
): boolean {
  const metadata = session.metadata ?? {};
  const offerId = metadata[RIVER_PROMOTION_OFFER_ID_KEY] ?? "";
  const couponId = metadata[RIVER_PROMOTION_COUPON_ID_KEY] ?? "";
  const application = metadata[RIVER_PROMOTION_APPLICATION_KEY] ?? "";
  if (!promotion) {
    return offerId === "" && couponId === "" && application === "";
  }
  return (
    offerId === promotion.offerId &&
    couponId === promotion.couponId &&
    application === promotion.application
  );
}

function checkoutIdempotencySuffix(
  sessionId: string | null,
  attempt: number
): string {
  const revision = attempt > 0 ? `attempt-${attempt}` : null;
  if (sessionId && revision) {
    return `${sessionId}-${revision}`;
  }
  if (sessionId) {
    return sessionId;
  }
  return revision ?? "initial";
}

export function checkoutAttemptFromMetadata(
  metadata: Record<string, string> | null | undefined
): number {
  const raw = metadata?.[RIVER_CHECKOUT_ATTEMPT_METADATA_KEY];
  if (!raw || !/^(0|[1-9][0-9]{0,5})$/.test(raw)) {
    return 0;
  }
  return Number(raw);
}

function customerAddress(
  identity: NonNullable<LockedCheckoutState["identity"]>
) {
  return {
    line1: identity.addressLine1,
    ...(identity.addressLine2 ? { line2: identity.addressLine2 } : {}),
    city: identity.city,
    state: identity.region,
    postal_code: identity.postalCode,
    country: identity.country,
  };
}

export async function executeClinicCheckout(input: {
  state: LockedCheckoutState;
  env?: Env;
  stripe: CheckoutStripePort;
  successUrl: string;
  cancelUrl: string;
  persist: (update: {
    stripeCustomerId?: string;
    stripeCheckoutSessionId?: string | null;
  }) => Promise<void>;
  persistPromotion?: (update: {
    offerId: string;
    couponId: string;
    discountDeferred: boolean;
  }) => Promise<void>;
  expirePromotion?: (offerId: string) => Promise<void>;
}): Promise<CheckoutExecutionResult> {
  const { state } = input;
  const failure = (
    code: CheckoutFailureCode,
    reason: string,
    extra?: { operation?: string; error?: unknown; checkoutAttempt?: number }
  ): CheckoutExecutionResult => {
    if (
      code === "checkout_failed" ||
      code === "checkout_unavailable" ||
      code === "price_not_configured" ||
      code === "trial_eligibility_unavailable" ||
      code === "promotion_unavailable" ||
      code === "promotion_expired" ||
      code === "promotion_with_trial_unavailable" ||
      code === "promotion_ineligible"
    ) {
      logStripeBilling({
        event: "checkout_session_failed",
        clinicId: state.clinicId,
        reason,
        ...checkoutFailureLogFields({
          operation: extra?.operation,
          commercialPlan: state.commercialPlan,
          billingInterval: state.billingInterval,
          error: extra?.error,
          checkoutAttempt: extra?.checkoutAttempt,
        }),
      });
    }
    return { ok: false, code };
  };

  if (state.commercialArrangement === "COMPLIMENTARY") {
    return failure("already_active", "complimentary_access");
  }

  if (
    state.entitlementStatus === EntitlementStatus.ACTIVE ||
    (state.billingStatus && PAID_BILLING.has(state.billingStatus))
  ) {
    return failure("already_active", "already_active");
  }

  if (state.stripeSubscriptionId) {
    return failure("subscription_exists", "subscription_exists");
  }

  if (state.billingStatus === BillingStatus.PAYMENT_PENDING) {
    return failure("payment_in_progress", "payment_in_progress");
  }

  const plan = state.commercialPlan;
  const interval = state.billingInterval;
  if (
    state.billingStatus !== BillingStatus.OFFER_PREPARED ||
    !plan ||
    !interval
  ) {
    return failure("not_prepared", "not_prepared");
  }

  if (plan === "GROUP") {
    if (
      state.offeredAdditionalSiteQuantity === null ||
      state.offeredAdditionalSiteQuantity === undefined
    ) {
      return failure("group_offer_missing", "group_offer_missing");
    }
    if (!isOfferedAdditionalSiteQuantity(state.offeredAdditionalSiteQuantity)) {
      return failure("group_offer_invalid", "group_offer_invalid");
    }
  }

  if (!state.termsAccepted) {
    return failure("terms_required", "terms_required");
  }

  const identity = state.identity;
  if (
    !identity ||
    !identity.legalEntityName ||
    !identity.billingEmail ||
    !identity.addressLine1 ||
    !identity.city ||
    !identity.region ||
    !identity.postalCode ||
    !identity.country
  ) {
    return failure("identity_incomplete", "identity_incomplete");
  }

  let lineItems: Array<{ price: string; quantity: number }>;
  try {
    lineItems = checkoutLineItems(state, input.env);
  } catch (error) {
    if (error instanceof StripePriceMappingError) {
      return failure("price_not_configured", "price_not_configured", {
        operation: "price_resolution",
      });
    }
    throw error;
  }

  try {
    const rejection = await rejectMismatchedCataloguePrices({
      priceIds: lineItems.map((item) => item.price),
      env: input.env,
      retrieve: (priceId) => input.stripe.prices.retrieve(priceId),
    });
    if (rejection) {
      return failure("price_not_configured", rejection, {
        operation: "catalogue_price",
      });
    }
  } catch (error) {
    if (
      error instanceof StripePriceMappingError ||
      error instanceof UnknownStripePriceError
    ) {
      return failure("price_not_configured", "catalogue_price_unmapped", {
        operation: "catalogue_price",
      });
    }
    return failure("checkout_failed", "catalogue_price_lookup_failed", {
      operation: "catalogue_price",
      error,
    });
  }

  const deployment = stripeDeployment(input.env);
  const returnUrlIssue =
    checkoutReturnUrlIssue(input.successUrl, deployment) ??
    checkoutReturnUrlIssue(input.cancelUrl, deployment);
  if (returnUrlIssue) {
    return failure(
      "checkout_failed",
      returnUrlIssue === "malformed"
        ? "malformed_return_url"
        : "insecure_production_return_url",
      { operation: "return_url" }
    );
  }

  let customerId = state.stripeCustomerId;
  let createdCustomer = false;
  let operation = "checkout";
  let checkoutAttempt = 0;
  let trialDays: typeof CATALOGUE_TRIAL_PERIOD_DAYS | null = null;
  let promotion: ResolvedCheckoutPromotion | null = null;

  const recordPromotion = async (): Promise<void> => {
    if (!promotion || !input.persistPromotion) {
      return;
    }
    await input.persistPromotion({
      offerId: promotion.offerId,
      couponId: promotion.couponId,
      discountDeferred:
        promotion.application ===
        RIVER_PROMOTION_APPLICATION_AFTER_ZERO_INVOICE,
    });
  };

  const persistCheckoutAttempt = async (next: number): Promise<boolean> => {
    if (!customerId || next <= checkoutAttempt || next > 1_000_000) {
      return false;
    }
    try {
      const updated = await input.stripe.customers.update(customerId, {
        metadata: {
          [RIVER_CLINIC_ID_METADATA_KEY]: state.clinicId,
          [RIVER_CHECKOUT_ATTEMPT_METADATA_KEY]: String(next),
        },
      });
      if (
        updated.metadata &&
        checkoutAttemptFromMetadata(updated.metadata) !== next
      ) {
        return false;
      }
      checkoutAttempt = next;
      return true;
    } catch (error) {
      failure("checkout_failed", "checkout_attempt_not_advanced", {
        operation: "stripe_checkout_attempt_advance",
        error,
        checkoutAttempt: next,
      });
      return false;
    }
  };

  const openCheckoutSession = async (
    attempt: number
  ): Promise<CheckoutExecutionResult> => {
    if (!customerId) {
      return failure("checkout_failed", "stripe_request_failed", {
        operation: "stripe_customer_create",
        checkoutAttempt: attempt,
      });
    }
    operation = "stripe_checkout_session_create";
    const metadata = checkoutMetadata(state, trialDays, promotion);
    const checkoutCouponId =
      promotion &&
      promotion.application === RIVER_PROMOTION_APPLICATION_CHECKOUT
        ? promotion.couponId
        : null;
    const sessionParams = {
      mode: "subscription" as const,
      customer: customerId,
      client_reference_id: state.clinicId,
      line_items: lineItems,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata,
      subscription_data: {
        metadata,
        ...(trialDays === CATALOGUE_TRIAL_PERIOD_DAYS
          ? { trial_period_days: CATALOGUE_TRIAL_PERIOD_DAYS }
          : {}),
      },
      allowed_payment_method_types: [...CHECKOUT_PAYMENT_METHOD_TYPES],
      payment_method_collection: "always" as const,
      wallet_options: { link: { display: "never" as const } },
      ...(checkoutCouponId
        ? { discounts: [{ coupon: checkoutCouponId }] }
        : { allow_promotion_codes: false as const }),
    } satisfies CheckoutSessionCreateShape &
      Stripe.Checkout.SessionCreateParams;
    const session = await input.stripe.checkout.sessions.create(sessionParams, {
      idempotencyKey: checkoutIdempotencyKey(
        state.clinicId,
        lineItems,
        state.stripeCheckoutSessionId,
        attempt,
        trialDays ?? 0,
        promotion
      ),
    });

    if (!session.url || !isStripeHostedCheckoutUrl(session.url)) {
      return failure("checkout_unavailable", "missing_checkout_url", {
        operation: "stripe_checkout_session_create",
        checkoutAttempt: attempt,
      });
    }

    operation = "persist_checkout_session";
    await input.persist({ stripeCheckoutSessionId: session.id });
    await recordPromotion();
    logStripeBilling({
      event: "checkout_session_created",
      clinicId: state.clinicId,
      commercialPlan: plan,
      billingInterval: interval,
    });

    return {
      ok: true,
      url: session.url,
      reusedSession: false,
      createdCustomer,
    };
  };

  try {
    if (customerId) {
      operation = "stripe_customer_update";
      const updated = await input.stripe.customers.update(customerId, {
        email: identity.billingEmail,
        name: identity.legalEntityName,
        address: customerAddress(identity),
        metadata: { [RIVER_CLINIC_ID_METADATA_KEY]: state.clinicId },
      });
      checkoutAttempt = checkoutAttemptFromMetadata(updated.metadata);
      logStripeBilling({
        event: "stripe_customer_reused",
        clinicId: state.clinicId,
      });
    } else {
      operation = "stripe_customer_create";
      const customer = await input.stripe.customers.create(
        {
          email: identity.billingEmail,
          name: identity.legalEntityName,
          address: customerAddress(identity),
          metadata: { [RIVER_CLINIC_ID_METADATA_KEY]: state.clinicId },
        },
        { idempotencyKey: `river-customer-${state.clinicId}` }
      );
      customerId = customer.id;
      createdCustomer = true;
      checkoutAttempt = checkoutAttemptFromMetadata(customer.metadata);
      operation = "persist_stripe_customer";
      await input.persist({ stripeCustomerId: customerId });
      logStripeBilling({
        event: "stripe_customer_created",
        clinicId: state.clinicId,
      });
    }

    let trialHistory: "none" | "present" | "unavailable" | null = null;
    if (
      customerId &&
      catalogueTrialDaysForState(state) === CATALOGUE_TRIAL_PERIOD_DAYS
    ) {
      trialHistory = await catalogueTrialHistory({
        customerId,
        listSubscriptions: input.stripe.subscriptions?.list.bind(
          input.stripe.subscriptions
        ),
      });
      if (trialHistory === "none") {
        trialDays = CATALOGUE_TRIAL_PERIOD_DAYS;
      } else if (trialHistory === "unavailable") {
        return failure(
          "trial_eligibility_unavailable",
          "subscription_history_unavailable",
          { operation: "catalogue_trial_history" }
        );
      } else {
        logStripeBilling({
          event: "checkout_trial_withheld",
          clinicId: state.clinicId,
          reason: "prior_subscription",
        });
      }
    }

    const openOffer = state.promotionalOffer ?? null;
    if (openOffer && !promotionalOfferStillOpen(openOffer)) {
      if (input.expirePromotion) {
        await input.expirePromotion(openOffer.id);
      }
      return failure("promotion_expired", "promotion_expired");
    }
    if (openOffer && trialHistory === "present") {
      return failure("promotion_ineligible", "prior_subscription");
    }
    let priceProductId: string | null = null;
    if (openOffer && lineItems.length === 1) {
      const price = await input.stripe.prices.retrieve(lineItems[0].price);
      priceProductId = productIdFromPrice(price);
    }
    const promotionResolution = await resolveCheckoutPromotion({
      offer: openOffer,
      plan,
      interval,
      trialDays,
      env: input.env,
      priceProductId,
      retrieveCoupon: input.stripe.coupons
        ? (couponId) => input.stripe.coupons!.retrieve(couponId)
        : undefined,
    });
    if (!promotionResolution.ok) {
      return failure(promotionResolution.code, promotionResolution.reason);
    }
    promotion = promotionResolution.promotion;

    if (state.stripeCheckoutSessionId) {
      operation = "stripe_checkout_session_retrieve";
      const existing = await input.stripe.checkout.sessions.retrieve(
        state.stripeCheckoutSessionId,
        { expand: ["line_items"] }
      );
      if (existing.status === "complete") {
        return failure(
          "checkout_already_completed",
          "checkout_already_completed"
        );
      }
      if (existing.status === "open" && existing.url) {
        const trialMatches =
          sessionRequestsTrial(existing) ===
          (trialDays === CATALOGUE_TRIAL_PERIOD_DAYS);
        const promotionMatches = sessionPromotionMatches(existing, promotion);
        if (
          sameLineItems(sessionLineItems(existing), lineItems) &&
          trialMatches &&
          promotionMatches
        ) {
          if (!isStripeHostedCheckoutUrl(existing.url)) {
            return failure("checkout_unavailable", "unexpected_checkout_url");
          }
          await recordPromotion();
          logStripeBilling({
            event: "checkout_session_reused",
            clinicId: state.clinicId,
            commercialPlan: plan,
            billingInterval: interval,
          });
          return {
            ok: true,
            url: existing.url,
            reusedSession: true,
            createdCustomer,
          };
        }
        operation = "stripe_checkout_session_expire";
        await input.stripe.checkout.sessions.expire(
          state.stripeCheckoutSessionId
        );
      }
    }

    try {
      return await openCheckoutSession(checkoutAttempt);
    } catch (error) {
      const failedAttempt = checkoutAttempt;
      const failureClass = classifyStripeCheckoutFailure(error);
      if (
        operation !== "stripe_checkout_session_create" ||
        failureClass !== "definitive"
      ) {
        return failure("checkout_failed", "stripe_request_failed", {
          operation,
          error,
          checkoutAttempt: failedAttempt,
        });
      }

      failure("checkout_failed", "stripe_request_failed", {
        operation,
        error,
        checkoutAttempt: failedAttempt,
      });
      const advanced = await persistCheckoutAttempt(failedAttempt + 1);
      if (!advanced) {
        return { ok: false, code: "checkout_failed" };
      }
      return await openCheckoutSession(checkoutAttempt);
    }
  } catch (error) {
    const failedAttempt = checkoutAttempt;
    const failureClass = classifyStripeCheckoutFailure(error);
    if (
      operation === "stripe_checkout_session_create" &&
      failureClass === "definitive"
    ) {
      failure("checkout_failed", "stripe_request_failed", {
        operation,
        error,
        checkoutAttempt: failedAttempt,
      });
      await persistCheckoutAttempt(failedAttempt + 1);
      return { ok: false, code: "checkout_failed" };
    }
    return failure("checkout_failed", "stripe_request_failed", {
      operation,
      error,
      checkoutAttempt: failedAttempt,
    });
  }
}

type CheckoutDb = Pick<
  PrismaClient,
  | "clinicEntitlement"
  | "clinicBillingProfile"
  | "legalAcceptance"
  | "$transaction"
  | "$queryRaw"
>;

export async function createClinicCheckout(input: {
  clinicId: string;
  userId: string;
  successUrl: string;
  cancelUrl: string;
  env?: Env;
  db?: CheckoutDb;
  stripe?: CheckoutStripePort;
}): Promise<CheckoutExecutionResult> {
  const db = input.db ?? getPrisma();
  const clinicReader = db as {
    clinic?: {
      findUnique?: (args: {
        where: { id: string };
        select: { deactivatedAt: true; archivedAt: true };
      }) => Promise<{
        deactivatedAt: Date | null;
        archivedAt?: Date | null;
      } | null>;
    };
  };
  if (typeof clinicReader.clinic?.findUnique === "function") {
    const clinic = await clinicReader.clinic.findUnique({
      where: { id: input.clinicId },
      select: { deactivatedAt: true, archivedAt: true },
    });
    if (clinicIsClosed(clinic)) {
      return { ok: false, code: "checkout_unavailable" };
    }
  }
  const config = getStripeClientConfig(input.env);
  if (!input.stripe && !config.ready) {
    logStripeBilling({
      event: "checkout_session_failed",
      clinicId: input.clinicId,
      reason: "stripe_not_configured",
    });
    return { ok: false, code: "checkout_unavailable" };
  }

  const stripe =
    input.stripe ??
    (getStripeClient(input.env) as unknown as CheckoutStripePort);

  let commercialPlan: string | null = null;
  let billingInterval: string | null = null;
  try {
    return await db.$transaction(
      async (tx) => {
        const transaction = tx as Prisma.TransactionClient;
        await transaction.$queryRaw`
          SELECT "id" FROM "ClinicBillingProfile"
          WHERE "clinicId" = ${input.clinicId}
          FOR UPDATE
        `;
        await transaction.$queryRaw`
          SELECT "id" FROM "ClinicEntitlement"
          WHERE "clinicId" = ${input.clinicId}
          FOR UPDATE
        `;

        const entitlement = await transaction.clinicEntitlement.findUnique({
          where: { clinicId: input.clinicId },
        });
        const profile = await transaction.clinicBillingProfile.findUnique({
          where: { clinicId: input.clinicId },
        });
        const acceptance = await transaction.legalAcceptance.findFirst({
          where: {
            clinicId: input.clinicId,
            userId: input.userId,
            termsVersion: TERMS_ACCEPTANCE_VERSION,
            privacyVersionAcknowledged: PRIVACY_ACKNOWLEDGEMENT_VERSION,
            source: "BILLING_CHECKOUT",
          },
          select: { id: true },
        });

        commercialPlan = entitlement?.commercialPlan ?? null;
        billingInterval = entitlement?.billingInterval ?? null;

        // ABN and ACN are optional. Neither is copied onto the Stripe
        // Customer, Checkout Session, or invoice.
        const identity =
          profile?.legalEntityName &&
          profile.billingEmail &&
          profile.addressLine1 &&
          profile.city &&
          profile.region &&
          profile.postalCode &&
          profile.country
            ? {
                legalEntityName: profile.legalEntityName,
                billingEmail: profile.billingEmail,
                addressLine1: profile.addressLine1,
                addressLine2: profile.addressLine2,
                city: profile.city,
                region: profile.region,
                postalCode: profile.postalCode,
                country: profile.country,
              }
            : null;

        return executeClinicCheckout({
          state: {
            clinicId: input.clinicId,
            userId: input.userId,
            commercialPlan: entitlement?.commercialPlan ?? null,
            billingInterval: entitlement?.billingInterval ?? null,
            billingStatus: entitlement?.billingStatus ?? null,
            entitlementStatus: entitlement?.entitlementStatus ?? null,
            commercialArrangement: entitlement?.commercialArrangement ?? null,
            stripeCustomerId: profile?.stripeCustomerId ?? null,
            stripeSubscriptionId: profile?.stripeSubscriptionId ?? null,
            stripeCheckoutSessionId: profile?.stripeCheckoutSessionId ?? null,
            trialEndsAt: entitlement?.trialEndsAt ?? null,
            promotionalOffer: await loadOpenPromotionalOffer(
              input.clinicId,
              transaction as never
            ),
            offeredAdditionalSiteQuantity:
              entitlement?.offeredAdditionalSiteQuantity ?? null,
            termsAccepted: Boolean(acceptance),
            identity,
          },
          env: input.env,
          stripe,
          successUrl: input.successUrl,
          cancelUrl: input.cancelUrl,
          persist: async (update) => {
            if (!profile) {
              return;
            }
            await transaction.clinicBillingProfile.update({
              where: { clinicId: input.clinicId },
              data: update,
            });
          },
          persistPromotion: async (update) => {
            await markPromotionalOfferCheckoutOpen(
              {
                offerId: update.offerId,
                clinicId: input.clinicId,
                stripeCouponId: update.couponId,
                discountDeferred: update.discountDeferred,
              },
              transaction as never
            );
          },
          expirePromotion: async (offerId) => {
            await expirePromotionalOffer(
              { offerId, clinicId: input.clinicId },
              transaction as never
            );
          },
        });
      },
      { maxWait: 5_000, timeout: 20_000 }
    );
  } catch (error) {
    logStripeBilling({
      event: "checkout_session_failed",
      clinicId: input.clinicId,
      reason: "checkout_transaction_failed",
      ...checkoutFailureLogFields({
        operation: "checkout_transaction",
        commercialPlan,
        billingInterval,
        error,
      }),
    });
    return { ok: false, code: "checkout_failed" };
  }
}
