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
import {
  decideSubscriptionScheduleEvent,
  downgradeStripePort,
  noticeFromSubscriptionSchedule,
  RIVER_DOWNGRADE_SCHEDULE_PURPOSE,
  releaseSchedulePreservingCancellation,
  scheduledDowngradeFieldsAfterProjection,
  shouldReleaseScheduleAfterCancellationReversed,
  shouldReleaseScheduleForCancellation,
  type PlanDowngradeStripePort,
} from "@/lib/billing/plan-downgrade";
import {
  lookupStripePriceId,
  stripePriceIdForPlan,
  StripePriceMappingError,
} from "@/lib/billing/price-map";
import {
  projectEntitlement,
  type LocalEntitlementSnapshot,
} from "@/lib/billing/projection";
import { applyDowngradeGuideTransition } from "@/lib/entitlements/downgrade-retention";
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

type StripeEventOptions = {
  prisma?: BillingDb;
  reader?: StripeSubscriptionReader | null;
  env?: Record<string, string | undefined>;
  downgradeStripe?: PlanDowngradeStripePort | null;
};

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
  scheduledCommercialPlan: LocalEntitlementSnapshot["commercialPlan"];
  scheduledPlanEffectiveAt: Date | null;
  clearScheduleId: boolean;
  retireDowngradeAttempt: boolean;
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
      ...(options.clearScheduleId
        ? { stripeSubscriptionScheduleId: null }
        : {}),
      ...(options.retireDowngradeAttempt
        ? { stripePlanDowngradeAttemptId: null }
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
      scheduledCommercialPlan: options.scheduledCommercialPlan,
      scheduledPlanEffectiveAt: options.scheduledPlanEffectiveAt,
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
      scheduledCommercialPlan: options.scheduledCommercialPlan,
      scheduledPlanEffectiveAt: options.scheduledPlanEffectiveAt,
    },
  });
}

export async function processVerifiedStripeEvent(
  event: Stripe.Event,
  options?: StripeEventOptions
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

  if (eventType.startsWith("subscription_schedule.")) {
    return applySubscriptionScheduleEvent({
      event,
      db,
      env,
      mark,
      downgradeStripe: options?.downgradeStripe,
    });
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

  const profile = identity.clinicId
    ? await db.clinicBillingProfile.findUnique({
        where: { clinicId: identity.clinicId },
        select: {
          stripeSubscriptionId: true,
          stripeSubscriptionScheduleId: true,
          stripePlanDowngradeAttemptId: true,
        },
      })
    : null;
  let cancellationSuperseded = false;
  let clearScheduleId = false;
  const scheduleId = profile?.stripeSubscriptionScheduleId ?? null;
  const cancelNow = projection.entitlement.cancelAtPeriodEnd;
  const releaseForCancellation = shouldReleaseScheduleForCancellation({
    scheduleId,
    cancelAtPeriodEnd: cancelNow,
  });
  const releaseAfterReversal = shouldReleaseScheduleAfterCancellationReversed({
    scheduleId,
    previousCancelAtPeriodEnd: previousRow?.cancelAtPeriodEnd ?? false,
    cancelAtPeriodEnd: cancelNow,
  });
  if (releaseForCancellation || releaseAfterReversal) {
    const port =
      options?.downgradeStripe === undefined
        ? downgradeStripePort(getStripeClient(env))
        : options.downgradeStripe;
    if (!port) {
      throw new Error("Downgrade schedule could not be released.");
    }
    const released = await releaseSchedulePreservingCancellation({
      stripe: port,
      scheduleId: scheduleId ?? "",
      expectedSubscriptionId:
        snapshot.stripeSubscriptionId ?? profile?.stripeSubscriptionId ?? "",
      preserveCancelDate: releaseForCancellation,
    });
    if (!released.ok) {
      throw new Error("Downgrade schedule could not be released.");
    }
    clearScheduleId = true;
    if (releaseForCancellation) {
      cancellationSuperseded =
        projection.entitlement.commercialPlan !== "ESSENTIAL";
      if (identity.clinicId) {
        logStripeBilling({
          event: "plan_downgrade_superseded_by_cancellation",
          clinicId: identity.clinicId,
        });
      }
    } else if (identity.clinicId) {
      logStripeBilling({
        event: "plan_downgrade_released_after_cancel_reversal",
        clinicId: identity.clinicId,
      });
    }
  }
  const scheduledFields = scheduledDowngradeFieldsAfterProjection({
    previousScheduledPlan: previousRow?.scheduledCommercialPlan ?? null,
    previousEffectiveAt: previousRow?.scheduledPlanEffectiveAt ?? null,
    projectedPlan: projection.entitlement.commercialPlan,
    cancellationSuperseded,
  });
  const retireDowngradeAttempt =
    clearScheduleId ||
    cancellationSuperseded ||
    (projection.entitlement.commercialPlan === "ESSENTIAL" &&
      previousRow?.commercialPlan === "PRACTICE");

  try {
    await db.$transaction(async (tx) => {
      await applyProjection({
        db: tx as unknown as BillingDb,
        clinicId: identity.clinicId!,
        snapshot,
        entitlement: projection.entitlement,
        stripeEventId,
        scheduledCommercialPlan: scheduledFields.scheduledCommercialPlan,
        scheduledPlanEffectiveAt: scheduledFields.scheduledPlanEffectiveAt,
        clearScheduleId,
        retireDowngradeAttempt,
      });
      await applyDowngradeGuideTransition({
        db: tx,
        clinicId: identity.clinicId!,
        previousPlan: previousRow?.commercialPlan ?? null,
        projectedPlan: projection.entitlement.commercialPlan,
        transitionAt: snapshot.stripeCreatedAt,
        cancellationSuperseded,
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

  if (
    identity.clinicId &&
    projection.entitlement.entitlementStatus === EntitlementStatus.ACTIVE &&
    previousRow?.entitlementStatus !== EntitlementStatus.ACTIVE
  ) {
    logStripeBilling({
      event: "billing_entitlement_activated",
      clinicId: identity.clinicId,
      eventType,
    });
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

async function applySubscriptionScheduleEvent(input: {
  event: Stripe.Event;
  db: BillingDb;
  env: Record<string, string | undefined>;
  downgradeStripe: PlanDowngradeStripePort | null | undefined;
  mark: (
    processingStatus: StripeEventProcessingStatus,
    failureText: string | null,
    clinicId: string | null
  ) => Promise<void>;
}): Promise<ProcessStripeEventResult> {
  const stripeEventId = input.event.id;
  const eventType = input.event.type;
  const object = input.event.data.object as { object?: string };
  if (object.object !== "subscription_schedule") {
    await input.mark(StripeEventProcessingStatus.IGNORED, null, null);
    return {
      outcome: "ignored",
      clinicId: null,
      stripeEventId,
      eventType,
    };
  }

  const notice = noticeFromSubscriptionSchedule(
    input.event.data.object as Stripe.SubscriptionSchedule
  );
  let profile = await input.db.clinicBillingProfile.findUnique({
    where: { stripeSubscriptionScheduleId: notice.scheduleId },
    select: {
      clinicId: true,
      stripeSubscriptionId: true,
      stripeSubscriptionScheduleId: true,
      stripePlanDowngradeAttemptId: true,
    },
  });

  if (
    !profile &&
    notice.metadataPurpose === RIVER_DOWNGRADE_SCHEDULE_PURPOSE &&
    notice.metadataClinicId
  ) {
    const clinic = await input.db.clinic.findUnique({
      where: { id: notice.metadataClinicId },
      select: { id: true },
    });
    if (clinic) {
      const candidate = await input.db.clinicBillingProfile.findUnique({
        where: { clinicId: clinic.id },
        select: {
          clinicId: true,
          stripeSubscriptionId: true,
          stripeSubscriptionScheduleId: true,
          stripePlanDowngradeAttemptId: true,
        },
      });
      const sameSubscription =
        !notice.subscriptionId ||
        candidate?.stripeSubscriptionId === notice.subscriptionId;
      const sameSchedule =
        !candidate?.stripeSubscriptionScheduleId ||
        candidate.stripeSubscriptionScheduleId === notice.scheduleId;
      if (candidate && sameSubscription && sameSchedule) {
        profile = candidate;
      }
    }
  }

  if (!profile) {
    await input.mark(StripeEventProcessingStatus.IGNORED, null, null);
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

  const entitlement = await input.db.clinicEntitlement.findUnique({
    where: { clinicId: profile.clinicId },
  });
  let practicePriceId: string | null = null;
  let essentialPriceId: string | null = null;
  const interval = entitlement?.billingInterval;
  if (interval === "MONTHLY" || interval === "YEARLY") {
    try {
      practicePriceId = stripePriceIdForPlan("PRACTICE", interval, input.env);
      essentialPriceId = stripePriceIdForPlan("ESSENTIAL", interval, input.env);
    } catch (error) {
      if (!(error instanceof StripePriceMappingError)) {
        throw error;
      }
    }
  }

  const decision = decideSubscriptionScheduleEvent({
    notice,
    clinicId: profile.clinicId,
    localScheduleId: profile.stripeSubscriptionScheduleId,
    practicePriceId,
    essentialPriceId,
  });

  if (decision.action === "ignore") {
    await input.mark(
      StripeEventProcessingStatus.IGNORED,
      null,
      profile.clinicId
    );
    logStripeBilling({
      event: "stripe_webhook_ignored",
      stripeEventId,
      eventType,
    });
    return {
      outcome: "ignored",
      clinicId: profile.clinicId,
      stripeEventId,
      eventType,
    };
  }

  if (decision.action === "fail") {
    await input.mark(
      StripeEventProcessingStatus.FAILED,
      "Subscription schedule could not be reconciled.",
      profile.clinicId
    );
    throw new Error("Subscription schedule could not be reconciled.");
  }

  if (decision.action === "cancellation_supersedes") {
    const port =
      input.downgradeStripe === undefined
        ? downgradeStripePort(getStripeClient(input.env))
        : input.downgradeStripe;
    if (!port) {
      throw new Error("Downgrade schedule could not be changed.");
    }
    const updated = await port.subscriptionSchedules.update(
      notice.scheduleId,
      decision.update
    );
    const kept = updated.subscriptionId ?? updated.releasedSubscriptionId;
    if (
      (notice.subscriptionId && kept && kept !== notice.subscriptionId) ||
      (profile.stripeSubscriptionId &&
        kept &&
        kept !== profile.stripeSubscriptionId)
    ) {
      throw new Error("Downgrade schedule changed the subscription.");
    }
  }

  const clearSchedule = decision.action === "clear_schedule";
  const markCancel = decision.action === "cancellation_supersedes";
  const dropScheduled =
    clearSchedule || markCancel || decision.action === "mark_cancel";
  const attemptMismatch = Boolean(
    profile.stripePlanDowngradeAttemptId &&
    notice.metadataAttemptId &&
    profile.stripePlanDowngradeAttemptId !== notice.metadataAttemptId
  );
  const scheduleMismatch = Boolean(
    profile.stripeSubscriptionScheduleId &&
    profile.stripeSubscriptionScheduleId !== notice.scheduleId
  );
  if (attemptMismatch || scheduleMismatch) {
    await input.mark(
      StripeEventProcessingStatus.IGNORED,
      null,
      profile.clinicId
    );
    logStripeBilling({
      event: "stripe_webhook_ignored",
      stripeEventId,
      eventType,
    });
    return {
      outcome: "ignored",
      clinicId: profile.clinicId,
      stripeEventId,
      eventType,
    };
  }

  await input.db.$transaction(async (tx) => {
    const transaction = tx as unknown as BillingDb;
    if (clearSchedule || dropScheduled) {
      await transaction.clinicBillingProfile.update({
        where: { clinicId: profile.clinicId },
        data: {
          ...(clearSchedule ? { stripeSubscriptionScheduleId: null } : {}),
          ...(dropScheduled ? { stripePlanDowngradeAttemptId: null } : {}),
        },
      });
    }
    if (entitlement && dropScheduled) {
      await transaction.clinicEntitlement.update({
        where: { clinicId: profile.clinicId },
        data: {
          scheduledCommercialPlan: null,
          scheduledPlanEffectiveAt: null,
          ...(markCancel
            ? {
                cancelAtPeriodEnd: true,
                ...(entitlement.billingStatus === BillingStatus.ACTIVE
                  ? { billingStatus: BillingStatus.CANCEL_AT_PERIOD_END }
                  : {}),
              }
            : {}),
        },
      });
    }
  });
  await input.mark(
    StripeEventProcessingStatus.PROCESSED,
    null,
    profile.clinicId
  );

  if (markCancel) {
    logStripeBilling({
      event: "plan_downgrade_superseded_by_cancellation",
      clinicId: profile.clinicId,
    });
  }

  logStripeBilling({
    event: "stripe_webhook_processed",
    stripeEventId,
    eventType,
    clinicId: profile.clinicId,
    outcome: clearSchedule ? "schedule_cleared" : "schedule_reconciled",
  });

  return {
    outcome: "processed",
    clinicId: profile.clinicId,
    stripeEventId,
    eventType,
  };
}
