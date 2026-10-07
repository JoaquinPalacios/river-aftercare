import "server-only";

import {
  BillingStatus,
  PlatformRole,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { findOpenAccountSplitInvolvingClinic } from "@/lib/account-split/snapshot";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import {
  CLINIC_ARCHIVED_MESSAGE,
  CLINIC_INACTIVE_MESSAGE,
  clinicIsClosed,
} from "@/lib/clinics/clinic-activity";
import { formatBillingDate } from "@/lib/billing/billing-presentation";
import {
  checkoutAttemptFromMetadata,
  CHECKOUT_PAYMENT_METHOD_TYPES,
  type CheckoutExecutionResult,
  type CheckoutFailureCode,
} from "@/lib/billing/checkout";
import { checkoutReturnUrlIssue } from "@/lib/billing/checkout-origin";
import type { Env } from "@/lib/billing/env";
import {
  RIVER_CHECKOUT_ATTEMPT_METADATA_KEY,
  RIVER_CLINIC_ID_METADATA_KEY,
} from "@/lib/billing/identity";
import { logStripeBilling } from "@/lib/billing/log";
import {
  formatNegotiatedPrice,
  negotiatedChargeMatchesOffer,
  negotiatedCheckoutIdempotencyKey,
  negotiatedOfferPayable,
  negotiatedPriceIdempotencyKey,
  negotiatedPriceLookupKey,
  NEGOTIATED_CURRENCY,
  NEGOTIATED_PRICE_CONTINUES,
  NEGOTIATED_TAX_LABEL,
  parseNegotiatedInterval,
  parseNegotiatedOfferInput,
  stripeRecurringInterval,
  subscriptionItemsForNegotiatedMatch,
  type NegotiatedInterval,
  type NegotiatedPlan,
  type PersistedNegotiatedOffer,
} from "@/lib/billing/negotiated-terms";
import {
  billingIntervalLabel,
  commercialPlanLabel,
} from "@/lib/billing/offer-display";
import {
  stripePriceIdForPlan,
  StripePriceMappingError,
} from "@/lib/billing/price-map";
import {
  checkoutFailureLogFields,
  classifyStripeCheckoutFailure,
} from "@/lib/billing/stripe-error-log";
import {
  getStripeClient,
  getStripeClientConfig,
} from "@/lib/billing/stripe-client";
import { stripeDeployment } from "@/lib/billing/stripe-mode";
import { lockClinicAccountStructure } from "@/lib/entitlements/locks";
import {
  PRIVACY_ACKNOWLEDGEMENT_VERSION,
  TERMS_ACCEPTANCE_VERSION,
} from "@/lib/legal/status";
import { getPrisma } from "@/lib/prisma";

const OPEN_OFFER_STATUSES = ["PREPARED", "CHECKOUT_OPEN"] as const;

export const NEGOTIATED_SPLIT_BLOCK =
  "A negotiated paid offer is open for this clinic. Withdraw it before an account split.";

const SPLIT_BLOCK =
  "An account split is open for this clinic. Finish or cancel it before changing the negotiated price.";

const SUBSCRIPTION_BLOCK =
  "This clinic already has a Stripe subscription. A negotiated price cannot start a second one.";

const MATCHING_SUBSCRIPTION_HOLD =
  "This subscription matches the negotiated price. Wait for payment confirmation before withdrawing the offer.";

const CHECKOUT_BLOCK =
  "Checkout is open for this negotiated price. Withdraw it before preparing a different price.";

type OfferDelegate = {
  findFirst: (args: unknown) => Promise<PersistedOfferRow | null>;
  findMany: (args: unknown) => Promise<PersistedOfferRow[]>;
  create: (args: unknown) => Promise<PersistedOfferRow>;
  update: (args: unknown) => Promise<PersistedOfferRow>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
};

type PersistedOfferRow = {
  id: string;
  clinicId: string;
  commercialPlan: NegotiatedPlan | "GROUP";
  billingInterval: NegotiatedInterval;
  amountCents: number;
  currency: string;
  taxTreatment: "NO_GST";
  startMode: "CUSTOMER_INITIATED" | "AGREED_DATE";
  billingStartsAt: Date | null;
  commercialTerms: string;
  status: "PREPARED" | "CHECKOUT_OPEN" | "CONVERTED" | "WITHDRAWN";
  stripePriceId: string | null;
  stripeProductId: string | null;
  acceptedByUserId: string | null;
  acceptedAt: Date | null;
  convertedAt: Date | null;
  withdrawnAt: Date | null;
  createdAt: Date;
};

type OfferDb = {
  clinicNegotiatedOffer: OfferDelegate;
  clinic: PrismaClient["clinic"];
  clinicEntitlement: PrismaClient["clinicEntitlement"];
  clinicBillingProfile: PrismaClient["clinicBillingProfile"];
  legalAcceptance: PrismaClient["legalAcceptance"];
  $transaction?: <T>(fn: (tx: OfferDb) => Promise<T>) => Promise<T>;
  $executeRaw?: (...args: unknown[]) => Promise<unknown>;
};

export type NegotiatedStripePrice = {
  id: string;
  active?: boolean;
  currency?: string | null;
  unit_amount?: number | null;
  product?: string | { id?: string | null } | null;
  recurring?: { interval?: string | null } | null;
};

export type NegotiatedStripePort = {
  prices: {
    list(params: {
      lookup_keys: string[];
      limit: number;
    }): Promise<{ data: NegotiatedStripePrice[] }>;
    retrieve(id: string): Promise<NegotiatedStripePrice>;
    create(
      params: {
        currency: string;
        unit_amount: number;
        product: string;
        recurring: { interval: "month" | "year" };
        lookup_key: string;
        transfer_lookup_key: false;
        tax_behavior: "unspecified";
        nickname: string;
        metadata: Record<string, string>;
      },
      options?: { idempotencyKey?: string }
    ): Promise<NegotiatedStripePrice>;
  };
  customers: {
    create(
      params: {
        email?: string;
        name?: string;
        address?: Record<string, string>;
        metadata?: Record<string, string>;
      },
      options?: { idempotencyKey?: string }
    ): Promise<{ id: string; metadata?: Record<string, string> | null }>;
    update(
      id: string,
      params: {
        email?: string;
        name?: string;
        address?: Record<string, string>;
        metadata?: Record<string, string>;
      }
    ): Promise<{ id: string; metadata?: Record<string, string> | null }>;
  };
  checkout: {
    sessions: {
      create(
        params: {
          mode: "subscription";
          customer: string;
          client_reference_id: string;
          line_items: Array<{ price: string; quantity: number }>;
          success_url: string;
          cancel_url: string;
          metadata: Record<string, string>;
          subscription_data: {
            metadata: Record<string, string>;
          };
          payment_method_types: Array<
            (typeof CHECKOUT_PAYMENT_METHOD_TYPES)[number]
          >;
          wallet_options: { link: { display: "never" } };
          allow_promotion_codes: false;
        },
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
      }>;
      expire(id: string): Promise<unknown>;
    };
  };
  subscriptions?: {
    retrieve(
      id: string,
      params?: { expand?: string[] }
    ): Promise<{
      id: string;
      status: string | null;
      items?: {
        data?: Array<{
          quantity?: number | null;
          price?:
            | string
            | {
                id?: string | null;
                unit_amount?: number | null;
                currency?: string | null;
                product?: string | { id?: string | null } | null;
                recurring?: { interval?: string | null } | null;
              }
            | null;
        }>;
      } | null;
    }>;
    cancel(id: string): Promise<{ id: string; status: string | null }>;
  };
};

function asOfferDb(db: unknown): OfferDb {
  return db as OfferDb;
}

async function withStructureLock<T>(
  db: OfferDb,
  clinicId: string,
  write: (tx: OfferDb) => Promise<T>
): Promise<T> {
  if (
    typeof db.$transaction === "function" &&
    typeof db.$executeRaw === "function"
  ) {
    return db.$transaction(async (tx) => {
      await lockClinicAccountStructure(
        tx as unknown as Parameters<typeof lockClinicAccountStructure>[0],
        clinicId
      );
      return write(tx);
    });
  }
  return write(db);
}

function productIdFromPrice(price: NegotiatedStripePrice): string | null {
  if (typeof price.product === "string" && price.product.trim()) {
    return price.product.trim();
  }
  if (price.product && typeof price.product === "object" && price.product.id) {
    return price.product.id.trim() || null;
  }
  return null;
}

function priceMatchesOffer(
  price: NegotiatedStripePrice,
  input: {
    amountCents: number;
    productId: string;
    interval: "month" | "year";
  }
): boolean {
  return (
    price.active !== false &&
    price.currency?.toLowerCase() === NEGOTIATED_CURRENCY &&
    price.unit_amount === input.amountCents &&
    productIdFromPrice(price) === input.productId &&
    price.recurring?.interval === input.interval
  );
}

export async function ensureNegotiatedStripePrice(input: {
  stripe: NegotiatedStripePort;
  catalogPriceId: string;
  clinicId: string;
  offerId: string;
  commercialPlan: NegotiatedPlan;
  billingInterval: NegotiatedInterval;
  amountCents: number;
}): Promise<
  | { ok: true; priceId: string; productId: string }
  | { ok: false; code: "price_not_configured" | "checkout_failed" }
> {
  let catalog: NegotiatedStripePrice;
  try {
    catalog = await input.stripe.prices.retrieve(input.catalogPriceId);
  } catch {
    return { ok: false, code: "price_not_configured" };
  }
  const productId = productIdFromPrice(catalog);
  if (!productId) {
    return { ok: false, code: "price_not_configured" };
  }
  const interval = stripeRecurringInterval(input.billingInterval);
  const lookupKey = negotiatedPriceLookupKey({
    clinicId: input.clinicId,
    commercialPlan: input.commercialPlan,
    billingInterval: input.billingInterval,
    amountCents: input.amountCents,
  });
  const expected = {
    amountCents: input.amountCents,
    productId,
    interval,
  };
  const reuse = async (): Promise<string | null> => {
    const listed = await input.stripe.prices.list({
      lookup_keys: [lookupKey],
      limit: 1,
    });
    const found = listed.data[0];
    if (!found) {
      return null;
    }
    if (!priceMatchesOffer(found, expected)) {
      return "mismatch";
    }
    return found.id;
  };
  try {
    const existing = await reuse();
    if (existing === "mismatch") {
      return { ok: false, code: "checkout_failed" };
    }
    if (existing) {
      return { ok: true, priceId: existing, productId };
    }
    const created = await input.stripe.prices.create(
      {
        currency: NEGOTIATED_CURRENCY,
        unit_amount: input.amountCents,
        product: productId,
        recurring: { interval },
        lookup_key: lookupKey,
        transfer_lookup_key: false,
        tax_behavior: "unspecified",
        nickname: `River negotiated ${input.commercialPlan} ${input.billingInterval}`,
        metadata: {
          [RIVER_CLINIC_ID_METADATA_KEY]: input.clinicId,
          riverPricePurpose: "negotiated_offer",
          offerId: input.offerId,
        },
      },
      { idempotencyKey: negotiatedPriceIdempotencyKey(lookupKey) }
    );
    if (!priceMatchesOffer(created, expected)) {
      return { ok: false, code: "checkout_failed" };
    }
    return { ok: true, priceId: created.id, productId };
  } catch {
    try {
      const existing = await reuse();
      if (existing && existing !== "mismatch") {
        return { ok: true, priceId: existing, productId };
      }
    } catch {
      return { ok: false, code: "checkout_failed" };
    }
    return { ok: false, code: "checkout_failed" };
  }
}

async function openSplitId(
  db: OfferDb,
  clinicId: string
): Promise<string | null> {
  const split = await findOpenAccountSplitInvolvingClinic(
    clinicId,
    db as unknown as Parameters<typeof findOpenAccountSplitInvolvingClinic>[1]
  );
  return split?.id ?? null;
}

export async function assertNoOpenNegotiatedOffer(
  db: Pick<Prisma.TransactionClient, "clinicNegotiatedOffer">,
  clinicId: string
): Promise<void> {
  const open = await db.clinicNegotiatedOffer.findFirst({
    where: { clinicId, status: { in: [...OPEN_OFFER_STATUSES] } },
    select: { id: true },
  });
  if (open) {
    throw new ClinicPortalError(NEGOTIATED_SPLIT_BLOCK, "conflict");
  }
}

export async function findNegotiatedOfferForPrice(
  db: Pick<Prisma.TransactionClient, "clinicNegotiatedOffer">,
  clinicId: string,
  stripePriceId: string | null
): Promise<PersistedNegotiatedOffer | null> {
  const priceId = stripePriceId?.trim() ?? "";
  if (!priceId) {
    return null;
  }
  const row = await db.clinicNegotiatedOffer.findFirst({
    where: {
      clinicId,
      stripePriceId: priceId,
      status: { in: ["PREPARED", "CHECKOUT_OPEN", "CONVERTED"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (
    !row ||
    (row.commercialPlan !== "ESSENTIAL" && row.commercialPlan !== "PRACTICE")
  ) {
    return null;
  }
  return toPersistedOffer(row);
}

export async function findOpenNegotiatedOffer(
  db: Pick<Prisma.TransactionClient, "clinicNegotiatedOffer">,
  clinicId: string
): Promise<PersistedNegotiatedOffer | null> {
  const row = await db.clinicNegotiatedOffer.findFirst({
    where: {
      clinicId,
      status: { in: [...OPEN_OFFER_STATUSES] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (
    !row ||
    (row.commercialPlan !== "ESSENTIAL" && row.commercialPlan !== "PRACTICE") ||
    (row.status !== "PREPARED" && row.status !== "CHECKOUT_OPEN")
  ) {
    return null;
  }
  return toPersistedOffer(row);
}

function toPersistedOffer(row: {
  id: string;
  status: string;
  stripePriceId: string | null;
  stripeProductId: string | null;
  amountCents: number;
  commercialPlan: string;
  billingInterval: string;
}): PersistedNegotiatedOffer | null {
  if (
    (row.commercialPlan !== "ESSENTIAL" && row.commercialPlan !== "PRACTICE") ||
    (row.billingInterval !== "MONTHLY" && row.billingInterval !== "YEARLY") ||
    (row.status !== "PREPARED" &&
      row.status !== "CHECKOUT_OPEN" &&
      row.status !== "CONVERTED" &&
      row.status !== "WITHDRAWN")
  ) {
    return null;
  }
  return {
    id: row.id,
    status: row.status,
    stripePriceId: row.stripePriceId,
    stripeProductId: row.stripeProductId,
    amountCents: row.amountCents,
    commercialPlan: row.commercialPlan,
    billingInterval: row.billingInterval,
  };
}

function planOf(plan: string | null | undefined): NegotiatedPlan | null {
  if (plan === "ESSENTIAL" || plan === "PRACTICE") {
    return plan;
  }
  return null;
}

export async function prepareNegotiatedOffer(
  input: {
    clinicId: string;
    actorUserId: string;
    actorPlatformRole: string;
    billingInterval: unknown;
    amount: unknown;
    startMode: unknown;
    billingStartDate: unknown;
    commercialTerms: unknown;
    now?: Date;
  },
  db: OfferDb = asOfferDb(getPrisma())
): Promise<{ ok: true; offerId: string } | { ok: false; error: string }> {
  if (input.actorPlatformRole !== PlatformRole.OPERATOR) {
    return {
      ok: false,
      error: "Only a platform operator can prepare a negotiated price.",
    };
  }
  const interval = parseNegotiatedInterval(input.billingInterval);
  if (!interval) {
    return { ok: false, error: "Choose monthly or annual billing." };
  }
  const now = input.now ?? new Date();
  const parsed = parseNegotiatedOfferInput(
    {
      amount: input.amount,
      startMode: input.startMode,
      billingStartDate: input.billingStartDate,
      commercialTerms: input.commercialTerms,
    },
    now
  );
  if (!parsed.ok) {
    return parsed;
  }

  try {
    return await withStructureLock(db, input.clinicId, async (tx) => {
      const clinic = await tx.clinic.findUnique({
        where: { id: input.clinicId },
        select: { id: true, deactivatedAt: true, archivedAt: true },
      });
      if (!clinic) {
        return { ok: false as const, error: "Clinic not found." };
      }
      if (clinic.archivedAt) {
        return { ok: false as const, error: CLINIC_ARCHIVED_MESSAGE };
      }
      if (clinicIsClosed(clinic)) {
        return { ok: false as const, error: CLINIC_INACTIVE_MESSAGE };
      }
      const entitlement = await tx.clinicEntitlement.findUnique({
        where: { clinicId: input.clinicId },
      });
      const plan = planOf(entitlement?.commercialPlan);
      if (entitlement?.commercialArrangement !== "COMPLIMENTARY" || !plan) {
        return {
          ok: false as const,
          error:
            "A negotiated price can only be prepared for complimentary Essential or Practice access.",
        };
      }
      const profile = await tx.clinicBillingProfile.findUnique({
        where: { clinicId: input.clinicId },
        select: {
          stripeSubscriptionId: true,
          stripeCheckoutSessionId: true,
        },
      });
      if (profile?.stripeSubscriptionId) {
        return { ok: false as const, error: SUBSCRIPTION_BLOCK };
      }
      if (
        profile?.stripeCheckoutSessionId ||
        entitlement.billingStatus === BillingStatus.PAYMENT_PENDING
      ) {
        return { ok: false as const, error: CHECKOUT_BLOCK };
      }
      if (await openSplitId(tx, input.clinicId)) {
        return { ok: false as const, error: SPLIT_BLOCK };
      }
      const open = await tx.clinicNegotiatedOffer.findFirst({
        where: {
          clinicId: input.clinicId,
          status: { in: [...OPEN_OFFER_STATUSES] },
        },
      });
      if (open?.status === "CHECKOUT_OPEN") {
        return { ok: false as const, error: CHECKOUT_BLOCK };
      }
      if (open) {
        await tx.clinicNegotiatedOffer.update({
          where: { id: open.id },
          data: {
            status: "WITHDRAWN",
            withdrawnAt: now,
          },
        });
      }
      const created = await tx.clinicNegotiatedOffer.create({
        data: {
          clinicId: input.clinicId,
          preparedByUserId: input.actorUserId,
          commercialPlan: plan,
          billingInterval: interval,
          amountCents: parsed.terms.amountCents,
          currency: NEGOTIATED_CURRENCY,
          taxTreatment: "NO_GST",
          startMode: parsed.terms.startMode,
          billingStartsAt: parsed.terms.billingStartsAt,
          commercialTerms: parsed.terms.commercialTerms,
          status: "PREPARED",
        },
      });
      return { ok: true as const, offerId: created.id };
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return {
        ok: false,
        error:
          "A negotiated price was saved at the same time. Review the current offer and try again.",
      };
    }
    throw error;
  }
}

export async function withdrawNegotiatedOffer(
  input: {
    clinicId: string;
    actorUserId: string;
    actorPlatformRole: string;
    now?: Date;
    stripe?: NegotiatedStripePort | null;
  },
  db: OfferDb = asOfferDb(getPrisma())
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.actorPlatformRole !== PlatformRole.OPERATOR) {
    return {
      ok: false,
      error: "Only a platform operator can withdraw a negotiated price.",
    };
  }
  const now = input.now ?? new Date();
  const preview = await db.clinicNegotiatedOffer.findFirst({
    where: {
      clinicId: input.clinicId,
      status: { in: [...OPEN_OFFER_STATUSES] },
    },
  });
  if (!preview) {
    return {
      ok: false,
      error: "There is no open negotiated price to withdraw.",
    };
  }
  const profile = await db.clinicBillingProfile.findUnique({
    where: { clinicId: input.clinicId },
    select: {
      stripeSubscriptionId: true,
      stripeCheckoutSessionId: true,
    },
  });
  let clearSubscriptionId: string | null = null;
  if (profile?.stripeSubscriptionId) {
    const subscriptions = input.stripe?.subscriptions;
    if (!subscriptions) {
      return {
        ok: false,
        error:
          "Secure payment isn't available right now, so the linked subscription cannot be checked.",
      };
    }
    let subscription: Awaited<ReturnType<typeof subscriptions.retrieve>>;
    try {
      subscription = await subscriptions.retrieve(
        profile.stripeSubscriptionId,
        { expand: ["items.data.price"] }
      );
    } catch {
      return {
        ok: false,
        error:
          "The linked subscription could not be checked. The offer was left unchanged.",
      };
    }
    const verdict = negotiatedChargeMatchesOffer({
      amountCents: preview.amountCents,
      stripePriceId: preview.stripePriceId ?? "",
      stripeProductId: preview.stripeProductId,
      billingInterval: preview.billingInterval,
      items: subscriptionItemsForNegotiatedMatch(subscription),
    });
    const stillCollecting =
      subscription.status === "active" ||
      subscription.status === "trialing" ||
      subscription.status === "past_due" ||
      subscription.status === "incomplete" ||
      subscription.status === "paused";
    if (verdict.verdict === "match" && stillCollecting) {
      return { ok: false, error: MATCHING_SUBSCRIPTION_HOLD };
    }
    if (verdict.verdict === "incomplete" && stillCollecting) {
      return {
        ok: false,
        error:
          "The linked subscription could not be checked. The offer was left unchanged.",
      };
    }
    if (
      subscription.status !== "canceled" &&
      subscription.status !== "incomplete_expired"
    ) {
      try {
        await subscriptions.cancel(profile.stripeSubscriptionId);
      } catch {
        return {
          ok: false,
          error:
            "The linked subscription could not be canceled. The offer was left unchanged.",
        };
      }
    }
    clearSubscriptionId = profile.stripeSubscriptionId;
  }
  if (profile?.stripeCheckoutSessionId) {
    const stripe = input.stripe;
    if (!stripe) {
      return {
        ok: false,
        error:
          "Secure payment isn't available right now, so the open Checkout cannot be withdrawn.",
      };
    }
    try {
      const session = await stripe.checkout.sessions.retrieve(
        profile.stripeCheckoutSessionId
      );
      if (session.status === "open") {
        await stripe.checkout.sessions.expire(profile.stripeCheckoutSessionId);
      } else if (session.status === "complete") {
        return {
          ok: false,
          error:
            "Checkout has already been submitted. Wait for payment confirmation before changing the offer.",
        };
      }
    } catch {
      return {
        ok: false,
        error:
          "The open Checkout could not be closed. The offer was left unchanged.",
      };
    }
  }

  return withStructureLock(db, input.clinicId, async (tx) => {
    const current = await tx.clinicNegotiatedOffer.findFirst({
      where: {
        clinicId: input.clinicId,
        status: { in: [...OPEN_OFFER_STATUSES] },
      },
    });
    if (!current) {
      return {
        ok: false as const,
        error: "There is no open negotiated price to withdraw.",
      };
    }
    const lockedEntitlement = await tx.clinicEntitlement.findUnique({
      where: { clinicId: input.clinicId },
      select: { commercialArrangement: true },
    });
    if (lockedEntitlement?.commercialArrangement !== "COMPLIMENTARY") {
      return {
        ok: false as const,
        error: "This clinic is already paid. The offer was left unchanged.",
      };
    }
    const lockedProfile = await tx.clinicBillingProfile.findUnique({
      where: { clinicId: input.clinicId },
      select: { stripeSubscriptionId: true },
    });
    if (
      clearSubscriptionId &&
      lockedProfile?.stripeSubscriptionId &&
      lockedProfile.stripeSubscriptionId !== clearSubscriptionId
    ) {
      return {
        ok: false as const,
        error:
          "A different Stripe subscription is linked to this clinic. The offer was left unchanged.",
      };
    }
    if (!clearSubscriptionId && lockedProfile?.stripeSubscriptionId) {
      return { ok: false as const, error: SUBSCRIPTION_BLOCK };
    }
    await tx.clinicNegotiatedOffer.update({
      where: { id: current.id },
      data: { status: "WITHDRAWN", withdrawnAt: now },
    });
    if (lockedProfile) {
      await tx.clinicBillingProfile.update({
        where: { clinicId: input.clinicId },
        data: {
          stripeCheckoutSessionId: null,
          ...(clearSubscriptionId ? { stripeSubscriptionId: null } : {}),
        },
      });
    }
    return { ok: true as const };
  });
}

export type NegotiatedOfferPanel = {
  canPrepare: boolean;
  blockedReason: string | null;
  plan: NegotiatedPlan | null;
  offers: Array<{
    id: string;
    status: PersistedOfferRow["status"];
    statusLabel: string;
    planLabel: string;
    intervalLabel: string;
    priceLabel: string;
    taxLabel: string;
    startLabel: string;
    policyLabel: string;
    terms: string;
    open: boolean;
  }>;
};

const STATUS_LABEL: Record<PersistedOfferRow["status"], string> = {
  PREPARED: "Prepared",
  CHECKOUT_OPEN: "Checkout open",
  CONVERTED: "Converted",
  WITHDRAWN: "Withdrawn",
};

export async function loadNegotiatedOfferPanel(
  clinicId: string,
  db: OfferDb = asOfferDb(getPrisma())
): Promise<NegotiatedOfferPanel | null> {
  const entitlement = await db.clinicEntitlement.findUnique({
    where: { clinicId },
  });
  const offers = await db.clinicNegotiatedOffer.findMany({
    where: { clinicId },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  const plan = planOf(entitlement?.commercialPlan);
  const complimentary = entitlement?.commercialArrangement === "COMPLIMENTARY";
  if (!complimentary && offers.length === 0) {
    return null;
  }
  const open = offers.some(
    (offer) => offer.status === "PREPARED" || offer.status === "CHECKOUT_OPEN"
  );
  let blockedReason: string | null = null;
  if (!complimentary || !plan) {
    blockedReason = null;
  } else if (open) {
    blockedReason =
      "Withdraw the open negotiated price before preparing another.";
  }
  return {
    canPrepare: Boolean(complimentary && plan && !open),
    blockedReason,
    plan,
    offers: offers.flatMap((offer) => {
      if (
        offer.commercialPlan !== "ESSENTIAL" &&
        offer.commercialPlan !== "PRACTICE"
      ) {
        return [];
      }
      return [
        {
          id: offer.id,
          status: offer.status,
          statusLabel: STATUS_LABEL[offer.status],
          planLabel: commercialPlanLabel(offer.commercialPlan),
          intervalLabel: billingIntervalLabel(offer.billingInterval),
          priceLabel: formatNegotiatedPrice(
            offer.amountCents,
            offer.billingInterval
          ),
          taxLabel: NEGOTIATED_TAX_LABEL,
          startLabel:
            offer.startMode === "AGREED_DATE" && offer.billingStartsAt
              ? formatBillingDate(offer.billingStartsAt)
              : "When the administrator pays",
          policyLabel: NEGOTIATED_PRICE_CONTINUES,
          terms: offer.commercialTerms,
          open: offer.status === "PREPARED" || offer.status === "CHECKOUT_OPEN",
        },
      ];
    }),
  };
}

export type ClinicNegotiatedOfferSummary = {
  id: string;
  status: "PREPARED" | "CHECKOUT_OPEN";
  planLabel: string;
  intervalLabel: string;
  priceLabel: string;
  taxLabel: string;
  startLabel: string;
  policyLabel: string;
  terms: string;
  payable: boolean;
  waitingForStart: boolean;
};

export async function loadOpenNegotiatedOfferSummary(
  clinicId: string,
  now = new Date(),
  db: OfferDb = asOfferDb(getPrisma())
): Promise<ClinicNegotiatedOfferSummary | null> {
  const offer = await db.clinicNegotiatedOffer.findFirst({
    where: {
      clinicId,
      status: { in: [...OPEN_OFFER_STATUSES] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (
    !offer ||
    (offer.commercialPlan !== "ESSENTIAL" &&
      offer.commercialPlan !== "PRACTICE") ||
    (offer.status !== "PREPARED" && offer.status !== "CHECKOUT_OPEN")
  ) {
    return null;
  }
  const timing = negotiatedOfferPayable({
    status: offer.status,
    billingStartsAt: offer.billingStartsAt,
    now,
  });
  return {
    id: offer.id,
    status: offer.status,
    planLabel: commercialPlanLabel(offer.commercialPlan),
    intervalLabel: billingIntervalLabel(offer.billingInterval),
    priceLabel: formatNegotiatedPrice(offer.amountCents, offer.billingInterval),
    taxLabel: NEGOTIATED_TAX_LABEL,
    startLabel:
      offer.startMode === "AGREED_DATE" && offer.billingStartsAt
        ? formatBillingDate(offer.billingStartsAt)
        : "When you pay",
    policyLabel: NEGOTIATED_PRICE_CONTINUES,
    terms: offer.commercialTerms,
    payable: timing.payable,
    waitingForStart: timing.waitingForStart,
  };
}

function hostedCheckoutUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" && parsed.hostname === "checkout.stripe.com"
    );
  } catch {
    return false;
  }
}

type CheckoutSnapshot = {
  offer: PersistedOfferRow;
  plan: NegotiatedPlan;
  customerId: string | null;
  sessionId: string | null;
  identity: {
    legalEntityName: string;
    billingEmail: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  };
};

function checkoutFailure(
  clinicId: string,
  code: CheckoutFailureCode,
  reason: string
): CheckoutExecutionResult {
  if (
    code === "checkout_failed" ||
    code === "checkout_unavailable" ||
    code === "price_not_configured"
  ) {
    logStripeBilling({
      event: "checkout_session_failed",
      clinicId,
      reason,
    });
  }
  return { ok: false, code };
}

export async function startNegotiatedCheckout(input: {
  clinicId: string;
  userId: string;
  acceptNegotiatedTerms: boolean;
  successUrl: string;
  cancelUrl: string;
  now?: Date;
  env?: Env;
  db?: OfferDb;
  stripe?: NegotiatedStripePort;
}): Promise<CheckoutExecutionResult> {
  const db = input.db ?? asOfferDb(getPrisma());
  const now = input.now ?? new Date();
  if (!input.acceptNegotiatedTerms) {
    return { ok: false, code: "negotiated_terms_required" };
  }
  if (typeof db.clinic?.findUnique === "function") {
    const clinic = await db.clinic.findUnique({
      where: { id: input.clinicId },
      select: { deactivatedAt: true, archivedAt: true },
    });
    if (clinicIsClosed(clinic)) {
      return checkoutFailure(
        input.clinicId,
        "checkout_unavailable",
        "clinic_inactive"
      );
    }
  }
  const config = getStripeClientConfig(input.env);
  if (!input.stripe && !config.ready) {
    return checkoutFailure(
      input.clinicId,
      "checkout_unavailable",
      "stripe_not_configured"
    );
  }
  const stripe =
    input.stripe ??
    (getStripeClient(input.env) as unknown as NegotiatedStripePort);

  const locked = await withStructureLock(db, input.clinicId, async (tx) => {
    if (typeof tx.clinic?.findUnique === "function") {
      const clinic = await tx.clinic.findUnique({
        where: { id: input.clinicId },
        select: { deactivatedAt: true, archivedAt: true },
      });
      if (clinicIsClosed(clinic)) {
        return { ok: false as const, code: "checkout_unavailable" as const };
      }
    }
    const entitlement = await tx.clinicEntitlement.findUnique({
      where: { clinicId: input.clinicId },
    });
    const plan = planOf(entitlement?.commercialPlan);
    if (entitlement?.commercialArrangement !== "COMPLIMENTARY" || !plan) {
      return { ok: false as const, code: "not_prepared" as const };
    }
    const offer = await tx.clinicNegotiatedOffer.findFirst({
      where: {
        clinicId: input.clinicId,
        status: { in: [...OPEN_OFFER_STATUSES] },
      },
    });
    if (!offer || offer.commercialPlan !== plan) {
      return { ok: false as const, code: "not_prepared" as const };
    }
    const timing = negotiatedOfferPayable({
      status: offer.status,
      billingStartsAt: offer.billingStartsAt,
      now,
    });
    if (!timing.payable) {
      return { ok: false as const, code: "negotiated_not_ready" as const };
    }
    const profile = await tx.clinicBillingProfile.findUnique({
      where: { clinicId: input.clinicId },
    });
    if (profile?.stripeSubscriptionId) {
      return { ok: false as const, code: "subscription_exists" as const };
    }
    if (await openSplitId(tx, input.clinicId)) {
      return { ok: false as const, code: "split_in_progress" as const };
    }
    const acceptance = await tx.legalAcceptance.findFirst({
      where: {
        clinicId: input.clinicId,
        userId: input.userId,
        termsVersion: TERMS_ACCEPTANCE_VERSION,
        privacyVersionAcknowledged: PRIVACY_ACKNOWLEDGEMENT_VERSION,
        source: "BILLING_CHECKOUT",
      },
      select: { id: true },
    });
    if (!acceptance) {
      return { ok: false as const, code: "terms_required" as const };
    }
    if (
      !profile?.legalEntityName ||
      !profile.billingEmail ||
      !profile.addressLine1 ||
      !profile.city ||
      !profile.region ||
      !profile.postalCode ||
      !profile.country
    ) {
      return { ok: false as const, code: "identity_incomplete" as const };
    }
    await tx.clinicNegotiatedOffer.update({
      where: { id: offer.id },
      data: { acceptedByUserId: input.userId, acceptedAt: now },
    });
    const snapshot: CheckoutSnapshot = {
      offer,
      plan,
      customerId: profile.stripeCustomerId,
      sessionId: profile.stripeCheckoutSessionId,
      identity: {
        legalEntityName: profile.legalEntityName,
        billingEmail: profile.billingEmail,
        addressLine1: profile.addressLine1,
        addressLine2: profile.addressLine2,
        city: profile.city,
        region: profile.region,
        postalCode: profile.postalCode,
        country: profile.country,
      },
    };
    return { ok: true as const, snapshot };
  });
  if (!locked.ok) {
    return { ok: false, code: locked.code };
  }

  const { snapshot } = locked;
  let catalogPriceId: string;
  try {
    catalogPriceId = stripePriceIdForPlan(
      snapshot.plan,
      snapshot.offer.billingInterval,
      input.env
    );
  } catch (error) {
    if (error instanceof StripePriceMappingError) {
      return checkoutFailure(
        input.clinicId,
        "price_not_configured",
        "price_not_configured"
      );
    }
    throw error;
  }

  const deployment = stripeDeployment(input.env);
  const returnUrlIssue =
    checkoutReturnUrlIssue(input.successUrl, deployment) ??
    checkoutReturnUrlIssue(input.cancelUrl, deployment);
  if (returnUrlIssue) {
    return checkoutFailure(input.clinicId, "checkout_failed", returnUrlIssue);
  }

  const ensured = await ensureNegotiatedStripePrice({
    stripe,
    catalogPriceId,
    clinicId: input.clinicId,
    offerId: snapshot.offer.id,
    commercialPlan: snapshot.plan,
    billingInterval: snapshot.offer.billingInterval,
    amountCents: snapshot.offer.amountCents,
  });
  if (!ensured.ok) {
    return checkoutFailure(input.clinicId, ensured.code, ensured.code);
  }

  const savedPrice = await withStructureLock(db, input.clinicId, async (tx) => {
    const offer = await tx.clinicNegotiatedOffer.findFirst({
      where: { id: snapshot.offer.id, clinicId: input.clinicId },
    });
    const entitlement = await tx.clinicEntitlement.findUnique({
      where: { clinicId: input.clinicId },
      select: { commercialArrangement: true },
    });
    const profile = await tx.clinicBillingProfile.findUnique({
      where: { clinicId: input.clinicId },
      select: { stripeSubscriptionId: true },
    });
    if (
      !offer ||
      (offer.status !== "PREPARED" && offer.status !== "CHECKOUT_OPEN") ||
      entitlement?.commercialArrangement !== "COMPLIMENTARY" ||
      profile?.stripeSubscriptionId ||
      offer.amountCents !== snapshot.offer.amountCents
    ) {
      return false;
    }
    await tx.clinicNegotiatedOffer.update({
      where: { id: offer.id },
      data: {
        stripePriceId: ensured.priceId,
        stripeProductId: ensured.productId,
      },
    });
    return true;
  });
  if (!savedPrice) {
    return checkoutFailure(input.clinicId, "checkout_failed", "offer_changed");
  }

  const address = {
    line1: snapshot.identity.addressLine1,
    ...(snapshot.identity.addressLine2
      ? { line2: snapshot.identity.addressLine2 }
      : {}),
    city: snapshot.identity.city,
    state: snapshot.identity.region,
    postal_code: snapshot.identity.postalCode,
    country: snapshot.identity.country,
  };
  let customerId = snapshot.customerId;
  let createdCustomer = false;
  let checkoutAttempt = 0;
  try {
    if (customerId) {
      const updated = await stripe.customers.update(customerId, {
        email: snapshot.identity.billingEmail,
        name: snapshot.identity.legalEntityName,
        address,
        metadata: { [RIVER_CLINIC_ID_METADATA_KEY]: input.clinicId },
      });
      checkoutAttempt = checkoutAttemptFromMetadata(updated.metadata);
    } else {
      const customer = await stripe.customers.create(
        {
          email: snapshot.identity.billingEmail,
          name: snapshot.identity.legalEntityName,
          address,
          metadata: { [RIVER_CLINIC_ID_METADATA_KEY]: input.clinicId },
        },
        { idempotencyKey: `river-customer-${input.clinicId}` }
      );
      customerId = customer.id;
      createdCustomer = true;
      checkoutAttempt = checkoutAttemptFromMetadata(customer.metadata);
      await withStructureLock(db, input.clinicId, async (tx) => {
        await tx.clinicBillingProfile.update({
          where: { clinicId: input.clinicId },
          data: { stripeCustomerId: customerId },
        });
      });
    }
  } catch (error) {
    logStripeBilling({
      event: "checkout_session_failed",
      clinicId: input.clinicId,
      reason: "stripe_request_failed",
      ...checkoutFailureLogFields({
        operation: "negotiated_customer",
        commercialPlan: snapshot.plan,
        billingInterval: snapshot.offer.billingInterval,
        error,
      }),
    });
    return { ok: false, code: "checkout_failed" };
  }

  const lineItems = [{ price: ensured.priceId, quantity: 1 }];
  const metadata = { [RIVER_CLINIC_ID_METADATA_KEY]: input.clinicId };

  const openSession = async (
    attempt: number
  ): Promise<CheckoutExecutionResult> => {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId!,
        client_reference_id: input.clinicId,
        line_items: lineItems,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata,
        subscription_data: {
          metadata,
        },
        payment_method_types: [...CHECKOUT_PAYMENT_METHOD_TYPES],
        wallet_options: { link: { display: "never" } },
        allow_promotion_codes: false,
      },
      {
        idempotencyKey: negotiatedCheckoutIdempotencyKey({
          clinicId: input.clinicId,
          offerId: snapshot.offer.id,
          priceId: ensured.priceId,
          sessionId: snapshot.sessionId,
          attempt,
        }),
      }
    );
    if (!session.url || !hostedCheckoutUrl(session.url)) {
      return checkoutFailure(
        input.clinicId,
        "checkout_unavailable",
        "missing_checkout_url"
      );
    }
    const persisted = await withStructureLock(
      db,
      input.clinicId,
      async (tx) => {
        const offer = await tx.clinicNegotiatedOffer.findFirst({
          where: { id: snapshot.offer.id },
        });
        const profile = await tx.clinicBillingProfile.findUnique({
          where: { clinicId: input.clinicId },
          select: { stripeSubscriptionId: true },
        });
        if (
          !offer ||
          (offer.status !== "PREPARED" && offer.status !== "CHECKOUT_OPEN") ||
          offer.stripePriceId !== ensured.priceId ||
          profile?.stripeSubscriptionId
        ) {
          return false;
        }
        await tx.clinicNegotiatedOffer.update({
          where: { id: offer.id },
          data: { status: "CHECKOUT_OPEN" },
        });
        await tx.clinicBillingProfile.update({
          where: { clinicId: input.clinicId },
          data: { stripeCheckoutSessionId: session.id },
        });
        return true;
      }
    );
    if (!persisted) {
      if (session.status === "open") {
        await stripe.checkout.sessions
          .expire(session.id)
          .catch(() => undefined);
      }
      return checkoutFailure(
        input.clinicId,
        "checkout_failed",
        "offer_changed"
      );
    }
    logStripeBilling({
      event: "checkout_session_created",
      clinicId: input.clinicId,
      commercialPlan: snapshot.plan,
      billingInterval: snapshot.offer.billingInterval,
    });
    return {
      ok: true,
      url: session.url,
      reusedSession: false,
      createdCustomer,
    };
  };

  try {
    if (snapshot.sessionId) {
      const existing = await stripe.checkout.sessions.retrieve(
        snapshot.sessionId,
        {
          expand: ["line_items"],
        }
      );
      if (existing.status === "complete") {
        return { ok: false, code: "checkout_already_completed" };
      }
      if (
        existing.status === "open" &&
        existing.url &&
        hostedCheckoutUrl(existing.url)
      ) {
        const items = (existing.line_items?.data ?? []).map((item) => {
          const price = item.price;
          const priceId = typeof price === "string" ? price : (price?.id ?? "");
          return { price: priceId, quantity: item.quantity ?? 1 };
        });
        if (
          items.length === 1 &&
          items[0]?.price === ensured.priceId &&
          items[0]?.quantity === 1
        ) {
          logStripeBilling({
            event: "checkout_session_reused",
            clinicId: input.clinicId,
            commercialPlan: snapshot.plan,
            billingInterval: snapshot.offer.billingInterval,
          });
          return {
            ok: true,
            url: existing.url,
            reusedSession: true,
            createdCustomer,
          };
        }
        await stripe.checkout.sessions.expire(snapshot.sessionId);
      }
    }
    return await openSession(checkoutAttempt);
  } catch (error) {
    const failureClass = classifyStripeCheckoutFailure(error);
    logStripeBilling({
      event: "checkout_session_failed",
      clinicId: input.clinicId,
      reason: "stripe_request_failed",
      ...checkoutFailureLogFields({
        operation: "negotiated_checkout_session_create",
        commercialPlan: snapshot.plan,
        billingInterval: snapshot.offer.billingInterval,
        error,
        checkoutAttempt,
      }),
    });
    if (failureClass === "definitive" && customerId) {
      await stripe.customers
        .update(customerId, {
          metadata: {
            [RIVER_CLINIC_ID_METADATA_KEY]: input.clinicId,
            [RIVER_CHECKOUT_ATTEMPT_METADATA_KEY]: String(checkoutAttempt + 1),
          },
        })
        .catch(() => undefined);
    }
    return { ok: false, code: "checkout_failed" };
  }
}
