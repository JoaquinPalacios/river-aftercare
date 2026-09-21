import "server-only";

import {
  BillingStatus,
  EntitlementStatus,
  Prisma,
  StripeEventProcessingStatus,
  type PrismaClient,
} from "@prisma/client";
import type Stripe from "stripe";

import { logStripeBilling } from "@/lib/billing/log";
import { lookupStripePriceId } from "@/lib/billing/price-map";
import {
  projectEntitlement,
  type LocalEntitlementSnapshot,
} from "@/lib/billing/projection";
import { getPrisma } from "@/lib/prisma";
import {
  mergeSubscriptionIntoSnapshot,
  snapshotFromStripeEvent,
  STRIPE_WEBHOOK_EVENT_TYPE_SET,
  type StripeProjectionSnapshot,
} from "@/lib/billing/stripe-event";
import { getStripeClient } from "@/lib/billing/stripe-client";

export type StripeEventProcessOutcome =
  "processed" | "duplicate" | "ignored" | "unmapped_clinic" | "unknown_price";

export type ProcessStripeEventResult = {
  outcome: StripeEventProcessOutcome;
  clinicId: string | null;
  stripeEventId: string;
  eventType: string;
};

export type StripeSubscriptionReader = {
  retrieveSubscription(
    subscriptionId: string
  ): Promise<Stripe.Subscription | null>;
};

type BillingDb = Pick<
  PrismaClient,
  | "clinic"
  | "clinicBillingProfile"
  | "clinicEntitlement"
  | "stripeEventReceipt"
  | "$transaction"
>;

function isUniqueViolation(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return true;
  }
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function localFromRow(
  row: {
    commercialPlan: LocalEntitlementSnapshot["commercialPlan"];
    billingInterval: LocalEntitlementSnapshot["billingInterval"];
    billingStatus: BillingStatus;
    entitlementStatus: EntitlementStatus;
    stripePriceId: string | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    paidThrough: Date | null;
    cancelAtPeriodEnd: boolean;
    subscriptionEndedAt: Date | null;
    publicGuideRetentionUntil: Date | null;
  } | null
): LocalEntitlementSnapshot | null {
  if (!row) {
    return null;
  }
  return {
    commercialPlan: row.commercialPlan,
    billingInterval: row.billingInterval,
    billingStatus: row.billingStatus,
    entitlementStatus: row.entitlementStatus,
    stripePriceId: row.stripePriceId,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    paidThrough: row.paidThrough,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    subscriptionEndedAt: row.subscriptionEndedAt,
    publicGuideRetentionUntil: row.publicGuideRetentionUntil,
  };
}

export function createStripeSubscriptionReader(
  stripe: Stripe = getStripeClient()
): StripeSubscriptionReader {
  return {
    async retrieveSubscription(subscriptionId) {
      try {
        return await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["items.data.price"],
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
  };
}

async function resolveClinicId(options: {
  db: BillingDb;
  hint: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}): Promise<{ clinicId: string | null; conflict: boolean }> {
  const { db, hint, stripeCustomerId, stripeSubscriptionId } = options;
  const fromHint = hint
    ? await db.clinic.findUnique({
        where: { id: hint },
        select: { id: true },
      })
    : null;

  const fromSubscription = stripeSubscriptionId
    ? await db.clinicBillingProfile.findUnique({
        where: { stripeSubscriptionId },
        select: { clinicId: true },
      })
    : null;

  const fromCustomer = stripeCustomerId
    ? await db.clinicBillingProfile.findUnique({
        where: { stripeCustomerId },
        select: { clinicId: true },
      })
    : null;

  const ids = [
    fromHint?.id ?? null,
    fromSubscription?.clinicId ?? null,
    fromCustomer?.clinicId ?? null,
  ].filter((value): value is string => Boolean(value));

  const unique = [...new Set(ids)];
  if (unique.length > 1) {
    return { clinicId: null, conflict: true };
  }
  if (unique.length === 1) {
    return { clinicId: unique[0], conflict: false };
  }
  return { clinicId: fromHint?.id ?? null, conflict: false };
}

async function applyProjection(options: {
  db: BillingDb;
  clinicId: string;
  snapshot: StripeProjectionSnapshot;
  entitlement: LocalEntitlementSnapshot;
  stripeEventId: string;
}): Promise<void> {
  const { db, clinicId, snapshot, entitlement, stripeEventId } = options;
  const now = new Date();

  await db.clinicBillingProfile.upsert({
    where: { clinicId },
    create: {
      clinicId,
      stripeCustomerId: snapshot.stripeCustomerId,
      stripeSubscriptionId: snapshot.stripeSubscriptionId,
    },
    update: {
      ...(snapshot.stripeCustomerId
        ? { stripeCustomerId: snapshot.stripeCustomerId }
        : {}),
      ...(snapshot.stripeSubscriptionId
        ? { stripeSubscriptionId: snapshot.stripeSubscriptionId }
        : {}),
    },
  });

  await db.clinicEntitlement.upsert({
    where: { clinicId },
    create: {
      clinicId,
      commercialPlan: entitlement.commercialPlan,
      billingInterval: entitlement.billingInterval,
      billingStatus: entitlement.billingStatus,
      entitlementStatus: entitlement.entitlementStatus,
      stripePriceId: entitlement.stripePriceId,
      currentPeriodStart: entitlement.currentPeriodStart,
      currentPeriodEnd: entitlement.currentPeriodEnd,
      paidThrough: entitlement.paidThrough,
      cancelAtPeriodEnd: entitlement.cancelAtPeriodEnd,
      subscriptionEndedAt: entitlement.subscriptionEndedAt,
      publicGuideRetentionUntil: entitlement.publicGuideRetentionUntil,
      lastStripeEventId: stripeEventId,
      lastProjectedAt: now,
    },
    update: {
      commercialPlan: entitlement.commercialPlan,
      billingInterval: entitlement.billingInterval,
      billingStatus: entitlement.billingStatus,
      entitlementStatus: entitlement.entitlementStatus,
      stripePriceId: entitlement.stripePriceId,
      currentPeriodStart: entitlement.currentPeriodStart,
      currentPeriodEnd: entitlement.currentPeriodEnd,
      paidThrough: entitlement.paidThrough,
      cancelAtPeriodEnd: entitlement.cancelAtPeriodEnd,
      subscriptionEndedAt: entitlement.subscriptionEndedAt,
      publicGuideRetentionUntil: entitlement.publicGuideRetentionUntil,
      lastStripeEventId: stripeEventId,
      lastProjectedAt: now,
    },
  });
}

export async function processVerifiedStripeEvent(
  event: Stripe.Event,
  options?: {
    prisma?: BillingDb;
    reader?: StripeSubscriptionReader | null;
    env?: Record<string, string | undefined>;
  }
): Promise<ProcessStripeEventResult> {
  const db = options?.prisma ?? getPrisma();
  const env = options?.env ?? process.env;
  const stripeEventId = event.id;
  const eventType = event.type;

  logStripeBilling({
    event: "stripe_webhook_received",
    stripeEventId,
    eventType,
  });

  let receipt = await db.stripeEventReceipt
    .create({
      data: {
        stripeEventId,
        eventType,
        stripeCreatedAt: new Date(event.created * 1000),
        processingStatus: StripeEventProcessingStatus.RECEIVED,
      },
    })
    .catch(async (error) => {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      return db.stripeEventReceipt.findUnique({
        where: { stripeEventId },
      });
    });

  if (!receipt) {
    throw new Error("Stripe event receipt could not be created.");
  }

  if (
    receipt.processingStatus === StripeEventProcessingStatus.PROCESSED ||
    receipt.processingStatus === StripeEventProcessingStatus.IGNORED
  ) {
    logStripeBilling({
      event: "stripe_webhook_duplicate",
      stripeEventId,
      eventType,
      clinicId: receipt.clinicId,
    });
    return {
      outcome: "duplicate",
      clinicId: receipt.clinicId,
      stripeEventId,
      eventType,
    };
  }

  const mark = async (
    processingStatus: StripeEventProcessingStatus,
    failureText: string | null,
    clinicId: string | null
  ) => {
    await db.stripeEventReceipt.update({
      where: { id: receipt!.id },
      data: {
        processingStatus,
        failureText,
        clinicId,
        processedAt: new Date(),
      },
    });
  };

  if (!STRIPE_WEBHOOK_EVENT_TYPE_SET.has(eventType)) {
    await mark(StripeEventProcessingStatus.IGNORED, null, null);
    logStripeBilling({
      event: "stripe_webhook_ignored",
      stripeEventId,
      eventType,
    });
    return {
      outcome: "ignored",
      clinicId: null,
      stripeEventId,
      eventType,
    };
  }

  let snapshot = snapshotFromStripeEvent(event);
  if (!snapshot) {
    await mark(
      StripeEventProcessingStatus.IGNORED,
      "Event object is not a billing snapshot River handles.",
      null
    );
    logStripeBilling({
      event: "stripe_webhook_ignored",
      stripeEventId,
      eventType,
    });
    return {
      outcome: "ignored",
      clinicId: null,
      stripeEventId,
      eventType,
    };
  }

  const reader =
    options?.reader === undefined
      ? createStripeSubscriptionReader()
      : options.reader;

  if (reader && snapshot.stripeSubscriptionId) {
    const subscription = await reader.retrieveSubscription(
      snapshot.stripeSubscriptionId
    );
    if (subscription) {
      snapshot = mergeSubscriptionIntoSnapshot(snapshot, subscription);
    }
  }

  const identity = await resolveClinicId({
    db,
    hint: snapshot.clinicIdHint,
    stripeCustomerId: snapshot.stripeCustomerId,
    stripeSubscriptionId: snapshot.stripeSubscriptionId,
  });

  if (identity.conflict) {
    const diagnostic = "Stripe identifiers map to more than one River clinic.";
    await mark(StripeEventProcessingStatus.FAILED, diagnostic, null);
    logStripeBilling({
      event: "stripe_webhook_failed",
      stripeEventId,
      eventType,
      reason: "clinic_conflict",
    });
    return {
      outcome: "unmapped_clinic",
      clinicId: null,
      stripeEventId,
      eventType,
    };
  }

  const priceLookup = lookupStripePriceId(snapshot.stripePriceId, env);
  const previousRow = identity.clinicId
    ? await db.clinicEntitlement.findUnique({
        where: { clinicId: identity.clinicId },
      })
    : null;

  const projection = projectEntitlement({
    eventType,
    previous: localFromRow(previousRow),
    clinicId: identity.clinicId,
    stripeCustomerId: snapshot.stripeCustomerId,
    stripeSubscriptionId: snapshot.stripeSubscriptionId,
    stripePriceId: snapshot.stripePriceId,
    mappedPrice:
      priceLookup.kind === "mapped"
        ? { plan: priceLookup.plan, interval: priceLookup.interval }
        : null,
    unknownPrice: priceLookup.kind === "unknown",
    subscriptionStatus: snapshot.subscriptionStatus,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    currentPeriodStart: snapshot.currentPeriodStart,
    currentPeriodEnd: snapshot.currentPeriodEnd,
    invoiceIsPaid: snapshot.invoiceIsPaid,
  });

  if (projection.kind === "unmapped_clinic") {
    await mark(StripeEventProcessingStatus.FAILED, projection.diagnostic, null);
    logStripeBilling({
      event: "stripe_webhook_unknown_clinic",
      stripeEventId,
      eventType,
    });
    return {
      outcome: "unmapped_clinic",
      clinicId: null,
      stripeEventId,
      eventType,
    };
  }

  if (projection.kind === "unknown_price") {
    await mark(
      StripeEventProcessingStatus.FAILED,
      projection.diagnostic,
      identity.clinicId
    );
    logStripeBilling({
      event: "stripe_webhook_unknown_price",
      stripeEventId,
      eventType,
      clinicId: identity.clinicId,
      stripePriceId: projection.stripePriceId,
    });
    return {
      outcome: "unknown_price",
      clinicId: identity.clinicId,
      stripeEventId,
      eventType,
    };
  }

  try {
    await db.$transaction(async (tx) => {
      await applyProjection({
        db: tx as unknown as BillingDb,
        clinicId: identity.clinicId!,
        snapshot,
        entitlement: projection.entitlement,
        stripeEventId,
      });
      await tx.stripeEventReceipt.update({
        where: { id: receipt.id },
        data: {
          processingStatus: StripeEventProcessingStatus.PROCESSED,
          failureText: null,
          clinicId: identity.clinicId,
          processedAt: new Date(),
        },
      });
    });
  } catch (error) {
    const diagnostic = isUniqueViolation(error)
      ? "Stripe customer or subscription is already linked to another clinic."
      : "Billing projection could not be saved.";
    await mark(
      StripeEventProcessingStatus.FAILED,
      diagnostic,
      identity.clinicId
    );
    if (isUniqueViolation(error)) {
      logStripeBilling({
        event: "stripe_webhook_failed",
        stripeEventId,
        eventType,
        clinicId: identity.clinicId,
        reason: "identifier_conflict",
      });
      return {
        outcome: "unmapped_clinic",
        clinicId: identity.clinicId,
        stripeEventId,
        eventType,
      };
    }
    throw error;
  }

  logStripeBilling({
    event: "stripe_webhook_processed",
    stripeEventId,
    eventType,
    clinicId: identity.clinicId,
    outcome:
      projection.entitlement.entitlementStatus === EntitlementStatus.ACTIVE &&
      projection.entitlement.billingStatus === BillingStatus.ACTIVE
        ? "active"
        : projection.entitlement.entitlementStatus.toLowerCase(),
  });

  return {
    outcome: "processed",
    clinicId: identity.clinicId,
    stripeEventId,
    eventType,
  };
}
