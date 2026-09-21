import "server-only";

import {
  BillingStatus,
  EntitlementStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { RIVER_CLINIC_ID_METADATA_KEY } from "@/lib/billing/identity";
import { logStripeBilling } from "@/lib/billing/log";
import {
  stripePriceIdForPlan,
  StripePriceMappingError,
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

/**
 * Card and AU BECS only.
 *
 * Stripe Checkout still accepts `payment_method_types` on API 2026-08-26.
 * Omitting it would follow the Dashboard's dynamic payment methods, which can
 * surface Afterpay, wallets, or other methods enabled on the account. The
 * launch catalogue is an allow-list, so the session names the two methods.
 * Stripe still renders the BECS mandate. River does not copy that text.
 */
export const CHECKOUT_PAYMENT_METHOD_TYPES = ["card", "au_becs_debit"] as const;

const PAID_BILLING = new Set<BillingStatus>([
  BillingStatus.ACTIVE,
  BillingStatus.PAST_DUE,
  BillingStatus.CANCEL_AT_PERIOD_END,
]);

export type CheckoutFailureCode =
  | "not_prepared"
  | "group_unavailable"
  | "price_not_configured"
  | "already_active"
  | "subscription_exists"
  | "payment_in_progress"
  | "terms_required"
  | "identity_incomplete"
  | "checkout_already_completed"
  | "checkout_unavailable"
  | "checkout_failed";

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
    case "group_unavailable":
      return "Group plans are arranged directly with River Aftercare.";
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
      return "We couldn't open secure payment. Your details have been saved.";
  }
}

export type CheckoutStripePort = {
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
    ): Promise<{ id: string }>;
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
    ): Promise<{ id: string }>;
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
          data: Array<{ price?: { id?: string } | string | null }>;
        } | null;
      }>;
      expire(id: string): Promise<unknown>;
    };
  };
};

export type CheckoutSessionCreateShape = {
  mode: "subscription";
  customer: string;
  client_reference_id: string;
  line_items: Array<{ price: string; quantity: 1 }>;
  success_url: string;
  cancel_url: string;
  metadata: Record<string, string>;
  subscription_data: { metadata: Record<string, string> };
  payment_method_types: Array<(typeof CHECKOUT_PAYMENT_METHOD_TYPES)[number]>;
  wallet_options: { link: { display: "never" } };
  allow_promotion_codes: false;
};

export type LockedCheckoutState = {
  clinicId: string;
  userId: string;
  commercialPlan: SelfServeCommercialPlan | "GROUP" | null;
  billingInterval: BillingIntervalCode | null;
  billingStatus: BillingStatus | null;
  entitlementStatus: EntitlementStatus | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCheckoutSessionId: string | null;
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

function sessionPriceId(session: {
  line_items?: {
    data: Array<{ price?: { id?: string } | string | null }>;
  } | null;
}): string | null {
  const price = session.line_items?.data?.[0]?.price;
  if (!price) {
    return null;
  }
  if (typeof price === "string") {
    return price;
  }
  return price.id ?? null;
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
}): Promise<CheckoutExecutionResult> {
  const { state } = input;
  const failure = (
    code: CheckoutFailureCode,
    reason: string
  ): CheckoutExecutionResult => {
    if (
      code === "checkout_failed" ||
      code === "checkout_unavailable" ||
      code === "price_not_configured"
    ) {
      logStripeBilling({
        event: "checkout_session_failed",
        clinicId: state.clinicId,
        reason,
      });
    }
    return { ok: false, code };
  };

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
    return failure("group_unavailable", "group_unavailable");
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

  let priceId: string;
  try {
    priceId = stripePriceIdForPlan(plan, interval, input.env);
  } catch (error) {
    if (error instanceof StripePriceMappingError) {
      return failure("price_not_configured", "price_not_configured");
    }
    throw error;
  }
  let customerId = state.stripeCustomerId;
  let createdCustomer = false;

  try {
    if (customerId) {
      await input.stripe.customers.update(customerId, {
        email: identity.billingEmail,
        name: identity.legalEntityName,
        address: customerAddress(identity),
        metadata: { [RIVER_CLINIC_ID_METADATA_KEY]: state.clinicId },
      });
      logStripeBilling({
        event: "stripe_customer_reused",
        clinicId: state.clinicId,
      });
    } else {
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
      await input.persist({ stripeCustomerId: customerId });
      logStripeBilling({
        event: "stripe_customer_created",
        clinicId: state.clinicId,
      });
    }

    if (state.stripeCheckoutSessionId) {
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
        if (sessionPriceId(existing) === priceId) {
          if (!isStripeHostedCheckoutUrl(existing.url)) {
            return failure("checkout_unavailable", "unexpected_checkout_url");
          }
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
        await input.stripe.checkout.sessions.expire(
          state.stripeCheckoutSessionId
        );
      }
    }

    const session = await input.stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        client_reference_id: state.clinicId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: { [RIVER_CLINIC_ID_METADATA_KEY]: state.clinicId },
        subscription_data: {
          metadata: { [RIVER_CLINIC_ID_METADATA_KEY]: state.clinicId },
        },
        payment_method_types: [...CHECKOUT_PAYMENT_METHOD_TYPES],
        wallet_options: { link: { display: "never" } },
        allow_promotion_codes: false,
      },
      {
        idempotencyKey: `river-checkout-${state.clinicId}-${priceId}-${state.stripeCheckoutSessionId ?? "initial"}`,
      }
    );

    if (!session.url || !isStripeHostedCheckoutUrl(session.url)) {
      return failure("checkout_unavailable", "missing_checkout_url");
    }

    await input.persist({ stripeCheckoutSessionId: session.id });
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
  } catch {
    return failure("checkout_failed", "stripe_request_failed");
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

        const identity =
          profile?.legalEntityName &&
          profile.billingEmail &&
          profile.addressLine1 &&
          profile.city &&
          profile.region &&
          profile.postalCode &&
          profile.country &&
          (profile.abn || profile.acn)
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
            stripeCustomerId: profile?.stripeCustomerId ?? null,
            stripeSubscriptionId: profile?.stripeSubscriptionId ?? null,
            stripeCheckoutSessionId: profile?.stripeCheckoutSessionId ?? null,
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
        });
      },
      { maxWait: 5_000, timeout: 20_000 }
    );
  } catch (error) {
    logStripeBilling({
      event: "checkout_session_failed",
      clinicId: input.clinicId,
      reason: "checkout_transaction_failed",
    });
    if (error instanceof Error && error.message === "CHECKOUT_RESULT") {
      return { ok: false, code: "checkout_failed" };
    }
    return { ok: false, code: "checkout_failed" };
  }
}
