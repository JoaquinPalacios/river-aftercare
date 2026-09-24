import "server-only";

import { randomUUID } from "node:crypto";

import {
  BillingStatus,
  EntitlementStatus,
  type BillingInterval,
  type CommercialPlan,
} from "@prisma/client";
import type Stripe from "stripe";

import type { Env } from "@/lib/billing/env";
import {
  RIVER_CLINIC_ID_METADATA_KEY,
  stripeObjectId,
} from "@/lib/billing/identity";
import { logStripeBilling } from "@/lib/billing/log";
import {
  stripePriceIdForPlan,
  StripePriceMappingError,
  planFromStripePriceId,
} from "@/lib/billing/price-map";
import { getStripeClient } from "@/lib/billing/stripe-client";
import { subscriptionCancellationScheduled } from "@/lib/billing/stripe-event";
import {
  type EssentialDowngradeReadiness,
  loadEssentialDowngradeReadiness,
  readinessHasGuideOverage,
} from "@/lib/entitlements/downgrade-readiness";
import {
  confirmedSelectionFitsReadiness,
  loadConfirmedDowngradeSelection,
  type ConfirmedGuideKeep,
} from "@/lib/entitlements/downgrade-selection";
import { lockClinicPlanDowngrade } from "@/lib/entitlements/locks";
import { getPrisma } from "@/lib/prisma";

/**
 * Stripe Node SDK 22.6.2, API version 2026-08-26.dahlia.
 *
 * Subscription Schedules are the supported way to change an existing
 * subscription's Price at a future phase boundary.
 *
 * Confirmed on the installed types:
 * - `subscriptionSchedules.create({ from_subscription })` migrates the
 *   current subscription. Other parameters, including metadata, cannot be
 *   combined with it. The copied phase has empty metadata and Stripe's
 *   default phase `proration_behavior` of `create_prorations`. The attempt
 *   id, `proration_behavior: none`, and the Essential phase are written on
 *   the following update. Live retrieval after that update is the source
 *   of truth.
 * - Phases use `duration` (`interval` + `interval_count`) or `end_date`.
 *   `iterations` is not in this SDK.
 * - `end_behavior`: `release` keeps the underlying subscription when the
 *   schedule ends. `cancel` cancels it when the schedule ends.
 * - The update's phase and request `proration_behavior` are `none`.
 *   `create_prorations` is accepted only on the one-phase copy that
 *   `from_subscription` returns, before that update.
 * - `release()` stops later phases and leaves the subscription in place.
 *   `preserve_cancel_date` keeps a cancellation the schedule has set.
 * - `billing_cycle_anchor: "phase_start"` resets the anchor. This flow
 *   does not send that value.
 * - `cancel()` on a schedule cancels the subscription immediately. This
 *   flow does not call it.
 */
export const RIVER_DOWNGRADE_SCHEDULE_PURPOSE = "practice_to_essential";
export const RIVER_DOWNGRADE_ATTEMPT_METADATA_KEY = "riverDowngradeAttemptId";
export const STRIPE_IDEMPOTENCY_KEY_MAX_LENGTH = 255;

export const PLAN_DOWNGRADE_PRORATION_BEHAVIOR = "none" as const;
export const PLAN_DOWNGRADE_END_BEHAVIOR = "release" as const;
export const PLAN_DOWNGRADE_BILLING_CYCLE_ANCHOR = "automatic" as const;

export type PlanDowngradeCode =
  | "not_ready"
  | "selection_required"
  | "not_active"
  | "past_due"
  | "cancel_scheduled"
  | "no_subscription"
  | "pending_checkout"
  | "ended"
  | "already_essential"
  | "unknown_schedule"
  | "subscription_shape"
  | "price_mismatch"
  | "price_not_configured"
  | "unsupported"
  | "schedule_failed"
  | "not_scheduled"
  | "already_transitioned";

export type PlanDowngradeState = {
  clinicId: string;
  commercialPlan: CommercialPlan | null;
  billingInterval: BillingInterval | null;
  entitlementStatus: EntitlementStatus | null;
  billingStatus: BillingStatus | null;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string | null;
  stripeSubscriptionScheduleId: string | null;
  stripePlanDowngradeAttemptId: string | null;
  stripeCheckoutSessionId: string | null;
  scheduledCommercialPlan: CommercialPlan | null;
  scheduledPlanEffectiveAt: Date | null;
};

export type DowngradeSchedulePhase = {
  priceId: string;
  quantity: number;
  startDate: number;
  endDate: number;
  prorationBehavior: string | null;
  billingCycleAnchor: string | null;
  hasExtras: boolean;
};

export type DowngradeScheduleSnapshot = {
  id: string;
  status: string;
  endBehavior: string;
  subscriptionId: string | null;
  releasedSubscriptionId: string | null;
  metadataClinicId: string | null;
  metadataPurpose: string | null;
  metadataAttemptId: string | null;
  phases: DowngradeSchedulePhase[];
};

export type DowngradeSubscriptionSnapshot = {
  id: string;
  status: string;
  scheduleId: string | null;
  cancelAtPeriodEnd: boolean;
  itemCount: number;
  itemId: string | null;
  priceId: string | null;
  quantity: number | null;
  periodEnd: number | null;
  discountsPresent: boolean;
  trialPresent: boolean;
  taxRatesPresent: boolean;
};

export type PlanDowngradeScheduleUpdate = {
  end_behavior: typeof PLAN_DOWNGRADE_END_BEHAVIOR;
  proration_behavior: typeof PLAN_DOWNGRADE_PRORATION_BEHAVIOR;
  metadata: {
    clinicId: string;
    riverSchedulePurpose: typeof RIVER_DOWNGRADE_SCHEDULE_PURPOSE;
    riverDowngradeAttemptId: string;
  };
  phases: [
    {
      items: [{ price: string; quantity: number }];
      start_date: number;
      end_date: number;
      proration_behavior: typeof PLAN_DOWNGRADE_PRORATION_BEHAVIOR;
    },
    {
      items: [{ price: string; quantity: number }];
      duration: { interval: "month" | "year"; interval_count: 1 };
      proration_behavior: typeof PLAN_DOWNGRADE_PRORATION_BEHAVIOR;
      billing_cycle_anchor: typeof PLAN_DOWNGRADE_BILLING_CYCLE_ANCHOR;
    },
  ];
};

export type CancellationSupersedeUpdate = {
  end_behavior: "cancel";
  proration_behavior: typeof PLAN_DOWNGRADE_PRORATION_BEHAVIOR;
  phases: [
    {
      items: [{ price: string; quantity: number }];
      start_date: number;
      end_date: number;
      proration_behavior: typeof PLAN_DOWNGRADE_PRORATION_BEHAVIOR;
    },
  ];
};

type StripeRequestOptions = { idempotencyKey?: string };

export type PlanDowngradeStripePort = {
  subscriptions: {
    retrieve(id: string): Promise<DowngradeSubscriptionSnapshot>;
  };
  subscriptionSchedules: {
    create(
      params: { from_subscription: string },
      options?: StripeRequestOptions
    ): Promise<DowngradeScheduleSnapshot>;
    retrieve(id: string): Promise<DowngradeScheduleSnapshot>;
    update(
      id: string,
      params: PlanDowngradeScheduleUpdate | CancellationSupersedeUpdate,
      options?: StripeRequestOptions
    ): Promise<DowngradeScheduleSnapshot>;
    release(
      id: string,
      params: { preserve_cancel_date?: boolean },
      options?: StripeRequestOptions
    ): Promise<DowngradeScheduleSnapshot>;
  };
};

export function planDowngradeMessage(
  code: PlanDowngradeCode,
  readiness?: EssentialDowngradeReadiness
): string {
  switch (code) {
    case "not_ready":
      return planDowngradeConflictMessage(readiness);
    case "selection_required":
      return "Clinic guide selection required. Nothing was changed.";
    case "past_due":
      return "A downgrade cannot be scheduled while a payment retry is still open.";
    case "cancel_scheduled":
      return "Remove the scheduled cancellation before scheduling a downgrade.";
    case "not_active":
      return "The downgrade can be scheduled once the subscription is active and the latest payment is settled.";
    case "no_subscription":
      return "This clinic does not have a subscription to change.";
    case "pending_checkout":
      return "Finish the current checkout before scheduling a downgrade.";
    case "ended":
      return "This subscription has ended. A downgrade cannot be scheduled.";
    case "already_essential":
      return "This clinic is already on Essential.";
    case "unknown_schedule":
      return "This subscription is already on a Stripe schedule River does not manage. It was left unchanged.";
    case "subscription_shape":
    case "price_mismatch":
    case "price_not_configured":
    case "schedule_failed":
      return "The downgrade could not be scheduled. The subscription was left unchanged.";
    case "unsupported":
      return "That plan change is not available.";
    case "not_scheduled":
      return "There is no scheduled downgrade to remove.";
    case "already_transitioned":
      return "Essential is already the current plan. Keeping Practice is no longer available.";
  }
}

export function planDowngradeConflictMessage(
  readiness?: EssentialDowngradeReadiness
): string {
  const intro =
    "Team usage must be resolved before downgrade. Nothing was changed.";
  if (!readiness?.conflicts.includes("TEAM_MEMBERS")) {
    return intro;
  }
  return `${intro} Team members: ${readiness.team.current} used / ${readiness.team.limit} allowed`;
}

function checkoutPending(state: PlanDowngradeState): boolean {
  if (
    state.billingStatus === BillingStatus.PAYMENT_PENDING ||
    state.billingStatus === BillingStatus.OFFER_PREPARED ||
    state.entitlementStatus === EntitlementStatus.PENDING
  ) {
    return true;
  }
  return Boolean(state.stripeCheckoutSessionId) && !state.stripeSubscriptionId;
}

export function assessOperatorPlanDowngrade(input: {
  state: PlanDowngradeState;
  readiness: EssentialDowngradeReadiness;
  guideSelection?: ConfirmedGuideKeep | null;
}):
  | { ok: true; stripeSubscriptionId: string; interval: BillingInterval }
  | { ok: false; code: PlanDowngradeCode } {
  const { state, readiness } = input;
  if (state.commercialPlan === "GROUP") {
    return { ok: false, code: "unsupported" };
  }
  if (state.commercialPlan === "ESSENTIAL") {
    return { ok: false, code: "already_essential" };
  }
  if (state.commercialPlan !== "PRACTICE" || !state.billingInterval) {
    return { ok: false, code: "unsupported" };
  }
  if (
    state.entitlementStatus === EntitlementStatus.ENDED ||
    state.billingStatus === BillingStatus.ENDED
  ) {
    return { ok: false, code: "ended" };
  }
  if (checkoutPending(state)) {
    return { ok: false, code: "pending_checkout" };
  }
  if (!state.stripeSubscriptionId) {
    return { ok: false, code: "no_subscription" };
  }
  if (
    state.cancelAtPeriodEnd ||
    state.billingStatus === BillingStatus.CANCEL_AT_PERIOD_END
  ) {
    return { ok: false, code: "cancel_scheduled" };
  }
  if (state.billingStatus === BillingStatus.PAST_DUE) {
    return { ok: false, code: "past_due" };
  }
  if (
    state.entitlementStatus !== EntitlementStatus.ACTIVE ||
    state.billingStatus !== BillingStatus.ACTIVE
  ) {
    return { ok: false, code: "not_active" };
  }
  if (readiness.conflicts.includes("TEAM_MEMBERS")) {
    return { ok: false, code: "not_ready" };
  }
  if (
    readinessHasGuideOverage(readiness) &&
    !confirmedSelectionFitsReadiness(readiness, input.guideSelection)
  ) {
    return { ok: false, code: "selection_required" };
  }
  return {
    ok: true,
    stripeSubscriptionId: state.stripeSubscriptionId,
    interval: state.billingInterval,
  };
}

export function assessOperatorDowngradeReversal(
  state: PlanDowngradeState
): { ok: true } | { ok: false; code: PlanDowngradeCode } {
  if (state.commercialPlan === "ESSENTIAL") {
    return { ok: false, code: "already_transitioned" };
  }
  if (
    state.cancelAtPeriodEnd ||
    state.billingStatus === BillingStatus.CANCEL_AT_PERIOD_END
  ) {
    return { ok: false, code: "cancel_scheduled" };
  }
  if (
    state.scheduledCommercialPlan !== "ESSENTIAL" ||
    !state.stripeSubscriptionScheduleId
  ) {
    return { ok: false, code: "not_scheduled" };
  }
  if (state.commercialPlan !== "PRACTICE" || !state.stripeSubscriptionId) {
    return { ok: false, code: "unsupported" };
  }
  return { ok: true };
}

export function planDowngradeIdempotencyKey(input: {
  clinicId: string;
  stripeSubscriptionId: string;
  targetPriceId?: string;
  periodEnd?: number;
  attemptId: string;
  step: "create" | "update" | "release";
}): string {
  const key =
    input.step === "release"
      ? `river-plan-downgrade-release-${input.clinicId}-${input.stripeSubscriptionId}-${input.attemptId}`
      : `river-plan-downgrade-${input.step}-${input.clinicId}-${input.stripeSubscriptionId}-${input.targetPriceId}-${input.periodEnd}-${input.attemptId}`;
  if (key.length > STRIPE_IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw new Error("Downgrade idempotency key exceeds Stripe's limit.");
  }
  return key;
}

export function downgradeDurationInterval(
  interval: BillingInterval
): "month" | "year" {
  return interval === "YEARLY" ? "year" : "month";
}

export function buildPracticeToEssentialScheduleUpdate(input: {
  clinicId: string;
  attemptId: string;
  currentPriceId: string;
  essentialPriceId: string;
  quantity: number;
  phaseStart: number;
  periodEnd: number;
  interval: BillingInterval;
}): PlanDowngradeScheduleUpdate {
  return {
    end_behavior: PLAN_DOWNGRADE_END_BEHAVIOR,
    proration_behavior: PLAN_DOWNGRADE_PRORATION_BEHAVIOR,
    metadata: {
      clinicId: input.clinicId,
      riverSchedulePurpose: RIVER_DOWNGRADE_SCHEDULE_PURPOSE,
      riverDowngradeAttemptId: input.attemptId,
    },
    phases: [
      {
        items: [{ price: input.currentPriceId, quantity: input.quantity }],
        start_date: input.phaseStart,
        end_date: input.periodEnd,
        proration_behavior: PLAN_DOWNGRADE_PRORATION_BEHAVIOR,
      },
      {
        items: [{ price: input.essentialPriceId, quantity: input.quantity }],
        duration: {
          interval: downgradeDurationInterval(input.interval),
          interval_count: 1,
        },
        proration_behavior: PLAN_DOWNGRADE_PRORATION_BEHAVIOR,
        billing_cycle_anchor: PLAN_DOWNGRADE_BILLING_CYCLE_ANCHOR,
      },
    ],
  };
}

export function buildCancellationSupersedeUpdate(input: {
  practicePriceId: string;
  quantity: number;
  phaseStart: number;
  periodEnd: number;
}): CancellationSupersedeUpdate {
  return {
    end_behavior: "cancel",
    proration_behavior: PLAN_DOWNGRADE_PRORATION_BEHAVIOR,
    phases: [
      {
        items: [{ price: input.practicePriceId, quantity: input.quantity }],
        start_date: input.phaseStart,
        end_date: input.periodEnd,
        proration_behavior: PLAN_DOWNGRADE_PRORATION_BEHAVIOR,
      },
    ],
  };
}

export function isRiverDowngradeSchedule(input: {
  scheduleId: string;
  metadataClinicId: string | null;
  metadataPurpose: string | null;
  localScheduleId: string | null;
  clinicId: string;
}): boolean {
  if (input.localScheduleId && input.localScheduleId === input.scheduleId) {
    return true;
  }
  return (
    input.metadataPurpose === RIVER_DOWNGRADE_SCHEDULE_PURPOSE &&
    input.metadataClinicId === input.clinicId
  );
}

export function scheduleDescribesDowngrade(input: {
  schedule: DowngradeScheduleSnapshot;
  practicePriceId: string;
  essentialPriceId: string;
}): { matches: boolean; effectiveAt: number | null } {
  if (input.schedule.endBehavior !== PLAN_DOWNGRADE_END_BEHAVIOR) {
    return { matches: false, effectiveAt: null };
  }
  const phases = input.schedule.phases;
  for (let index = 0; index < phases.length - 1; index += 1) {
    const current = phases[index];
    const next = phases[index + 1];
    if (!current || !next) {
      continue;
    }
    if (
      current.priceId === input.practicePriceId &&
      next.priceId === input.essentialPriceId &&
      current.quantity === 1 &&
      next.quantity === 1 &&
      (next.prorationBehavior === null ||
        next.prorationBehavior === PLAN_DOWNGRADE_PRORATION_BEHAVIOR)
    ) {
      return { matches: true, effectiveAt: current.endDate };
    }
  }
  return { matches: false, effectiveAt: null };
}

function unixToDate(value: number): Date {
  return new Date(value * 1000);
}

function failure(
  clinicId: string,
  code: PlanDowngradeCode
): { ok: false; code: PlanDowngradeCode } {
  logStripeBilling({
    event: "plan_downgrade_failed",
    clinicId,
    reason: code,
  });
  return { ok: false, code };
}

export type DowngradeVerificationReason =
  | "schedule_status"
  | "schedule_subscription"
  | "schedule_metadata"
  | "schedule_attempt"
  | "schedule_end_behavior"
  | "schedule_phases"
  | "schedule_phase_count"
  | "schedule_price"
  | "schedule_quantity"
  | "schedule_period_end"
  | "schedule_proration"
  | "schedule_extras"
  | "subscription_attachment"
  | "subscription_price"
  | "subscription_period"
  | "subscription_status";

export type AttachedScheduleClassification =
  | { kind: "complete" }
  | { kind: "intermediate" }
  | {
      kind: "other_attempt" | "unknown" | "ended";
      reason: DowngradeVerificationReason;
    };

export type DowngradeAttemptAllocation = {
  attemptId: string;
  created: boolean;
};

/**
 * Fresh schedule and subscription must both describe the same active
 * Practice → Essential downgrade. Create and update response bodies are not
 * this check.
 */
export function verifyLiveDowngradeSchedule(input: {
  schedule: DowngradeScheduleSnapshot;
  subscription: DowngradeSubscriptionSnapshot;
  expectedScheduleId: string;
  clinicId: string;
  attemptId: string;
  practicePriceId: string;
  essentialPriceId: string;
  periodEnd: number;
}):
  | { ok: true; effectiveAt: number }
  | { ok: false; reason: DowngradeVerificationReason } {
  if (input.schedule.id !== input.expectedScheduleId) {
    return { ok: false, reason: "schedule_subscription" };
  }
  if (input.schedule.status !== "active") {
    return { ok: false, reason: "schedule_status" };
  }
  if (input.schedule.subscriptionId !== input.subscription.id) {
    return { ok: false, reason: "schedule_subscription" };
  }
  if (
    input.schedule.metadataClinicId !== input.clinicId ||
    input.schedule.metadataPurpose !== RIVER_DOWNGRADE_SCHEDULE_PURPOSE
  ) {
    return { ok: false, reason: "schedule_metadata" };
  }
  if (input.schedule.metadataAttemptId !== input.attemptId) {
    return { ok: false, reason: "schedule_attempt" };
  }
  if (input.schedule.endBehavior !== PLAN_DOWNGRADE_END_BEHAVIOR) {
    return { ok: false, reason: "schedule_end_behavior" };
  }
  const current = input.schedule.phases[0];
  const next = input.schedule.phases[1];
  if (input.schedule.phases.length !== 2 || !current || !next) {
    return { ok: false, reason: "schedule_phase_count" };
  }
  if (current.hasExtras || next.hasExtras) {
    return { ok: false, reason: "schedule_extras" };
  }
  if (
    current.priceId !== input.practicePriceId ||
    next.priceId !== input.essentialPriceId
  ) {
    return { ok: false, reason: "schedule_price" };
  }
  if (current.quantity !== 1 || next.quantity !== 1) {
    return { ok: false, reason: "schedule_quantity" };
  }
  if (
    current.prorationBehavior !== PLAN_DOWNGRADE_PRORATION_BEHAVIOR ||
    next.prorationBehavior !== PLAN_DOWNGRADE_PRORATION_BEHAVIOR
  ) {
    return { ok: false, reason: "schedule_proration" };
  }
  if (
    current.endDate !== input.periodEnd ||
    next.startDate !== current.endDate
  ) {
    return { ok: false, reason: "schedule_period_end" };
  }
  if (next.billingCycleAnchor !== PLAN_DOWNGRADE_BILLING_CYCLE_ANCHOR) {
    return { ok: false, reason: "schedule_phases" };
  }
  if (input.subscription.status !== "active") {
    return { ok: false, reason: "subscription_status" };
  }
  if (input.subscription.priceId !== input.practicePriceId) {
    return { ok: false, reason: "subscription_price" };
  }
  if (input.subscription.periodEnd !== input.periodEnd) {
    return { ok: false, reason: "subscription_period" };
  }
  if (input.subscription.scheduleId !== input.schedule.id) {
    return { ok: false, reason: "subscription_attachment" };
  }
  return { ok: true, effectiveAt: current.endDate };
}

/**
 * `from_subscription` copies the current subscription into one phase.
 * That phase keeps Stripe's default `create_prorations` and has no River
 * metadata until the update. `none` and a missing value are also the
 * untouched copy. Any other proration is not this intermediate state.
 */
function copiedPhaseProrationAllowed(value: string | null): boolean {
  return (
    value === null ||
    value === PLAN_DOWNGRADE_PRORATION_BEHAVIOR ||
    value === "create_prorations"
  );
}

function intermediateScheduleMismatch(input: {
  schedule: DowngradeScheduleSnapshot;
  subscription: DowngradeSubscriptionSnapshot;
  attemptId: string;
  practicePriceId: string;
  periodEnd: number;
}): DowngradeVerificationReason | null {
  if (input.schedule.endBehavior !== PLAN_DOWNGRADE_END_BEHAVIOR) {
    return "schedule_end_behavior";
  }
  if (input.schedule.subscriptionId !== input.subscription.id) {
    return "schedule_subscription";
  }
  if (input.schedule.phases.length !== 1) {
    return "schedule_phase_count";
  }
  const phase = input.schedule.phases[0];
  if (!phase) {
    return "schedule_phase_count";
  }
  if (phase.hasExtras) {
    return "schedule_extras";
  }
  if (phase.priceId !== input.practicePriceId) {
    return "schedule_price";
  }
  if (phase.quantity !== 1) {
    return "schedule_quantity";
  }
  if (phase.endDate !== input.periodEnd) {
    return "schedule_period_end";
  }
  if (!copiedPhaseProrationAllowed(phase.prorationBehavior)) {
    return "schedule_proration";
  }
  if (
    input.schedule.metadataAttemptId &&
    input.schedule.metadataAttemptId !== input.attemptId
  ) {
    return "schedule_attempt";
  }
  return null;
}

/**
 * Classifies a schedule that is currently attached to the subscription.
 * `from_subscription` cannot set metadata, so the single copied Practice
 * phase has no attempt id until the update. A different attempt id, another
 * clinic, or another purpose is not adopted.
 */
export function classifyAttachedDowngradeSchedule(input: {
  schedule: DowngradeScheduleSnapshot;
  subscription: DowngradeSubscriptionSnapshot;
  clinicId: string;
  attemptId: string;
  practicePriceId: string;
  essentialPriceId: string;
  periodEnd: number;
}): AttachedScheduleClassification {
  if (
    input.schedule.status === "released" ||
    input.schedule.status === "completed" ||
    input.schedule.status === "canceled"
  ) {
    return { kind: "ended", reason: "schedule_status" };
  }
  if (input.schedule.status !== "active") {
    return { kind: "unknown", reason: "schedule_status" };
  }
  if (
    input.schedule.metadataAttemptId &&
    input.schedule.metadataAttemptId !== input.attemptId
  ) {
    return { kind: "other_attempt", reason: "schedule_attempt" };
  }
  if (
    input.schedule.metadataClinicId &&
    input.schedule.metadataClinicId !== input.clinicId
  ) {
    return { kind: "unknown", reason: "schedule_metadata" };
  }
  if (
    input.schedule.metadataPurpose &&
    input.schedule.metadataPurpose !== RIVER_DOWNGRADE_SCHEDULE_PURPOSE
  ) {
    return { kind: "unknown", reason: "schedule_metadata" };
  }
  if (
    input.schedule.subscriptionId &&
    input.schedule.subscriptionId !== input.subscription.id
  ) {
    return { kind: "unknown", reason: "schedule_subscription" };
  }
  const verified = verifyLiveDowngradeSchedule({
    schedule: input.schedule,
    subscription: input.subscription,
    expectedScheduleId: input.schedule.id,
    clinicId: input.clinicId,
    attemptId: input.attemptId,
    practicePriceId: input.practicePriceId,
    essentialPriceId: input.essentialPriceId,
    periodEnd: input.periodEnd,
  });
  if (verified.ok) {
    return { kind: "complete" };
  }
  const mismatch = intermediateScheduleMismatch({
    schedule: input.schedule,
    subscription: input.subscription,
    attemptId: input.attemptId,
    practicePriceId: input.practicePriceId,
    periodEnd: input.periodEnd,
  });
  if (!mismatch) {
    return { kind: "intermediate" };
  }
  const owned =
    input.schedule.metadataAttemptId === input.attemptId ||
    (input.schedule.metadataPurpose === RIVER_DOWNGRADE_SCHEDULE_PURPOSE &&
      input.schedule.metadataClinicId === input.clinicId);
  if (owned) {
    return { kind: "other_attempt", reason: mismatch };
  }
  return { kind: "unknown", reason: mismatch };
}

async function persistScheduledDowngrade(input: {
  clinicId: string;
  scheduleId: string;
  effectiveAt: Date;
}): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction([
    prisma.clinicBillingProfile.update({
      where: { clinicId: input.clinicId },
      data: { stripeSubscriptionScheduleId: input.scheduleId },
    }),
    prisma.clinicEntitlement.update({
      where: { clinicId: input.clinicId },
      data: {
        scheduledCommercialPlan: "ESSENTIAL",
        scheduledPlanEffectiveAt: input.effectiveAt,
      },
    }),
  ]);
}

export async function ensureDowngradeAttemptId(
  clinicId: string
): Promise<DowngradeAttemptAllocation> {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    await lockClinicPlanDowngrade(tx, clinicId);
    const profile = await tx.clinicBillingProfile.findUnique({
      where: { clinicId },
      select: { stripePlanDowngradeAttemptId: true },
    });
    if (!profile) {
      throw new Error("Clinic billing profile is missing.");
    }
    if (profile.stripePlanDowngradeAttemptId) {
      return {
        attemptId: profile.stripePlanDowngradeAttemptId,
        created: false,
      };
    }
    const attemptId = randomUUID();
    await tx.clinicBillingProfile.update({
      where: { clinicId },
      data: { stripePlanDowngradeAttemptId: attemptId },
    });
    return { attemptId, created: true };
  });
}

/**
 * Clears the local schedule projection when Stripe no longer has this
 * downgrade. The confirmed guide keep-set stays.
 */
export async function clearScheduledDowngradeProjection(input: {
  clinicId: string;
  retireAttempt: boolean;
}): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction([
    prisma.clinicBillingProfile.update({
      where: { clinicId: input.clinicId },
      data: {
        stripeSubscriptionScheduleId: null,
        ...(input.retireAttempt ? { stripePlanDowngradeAttemptId: null } : {}),
      },
    }),
    prisma.clinicEntitlement.update({
      where: { clinicId: input.clinicId },
      data: {
        scheduledCommercialPlan: null,
        scheduledPlanEffectiveAt: null,
      },
    }),
  ]);
}

/**
 * Keep Practice, or a cancellation that supersedes a validated downgrade.
 * This is the intentional end of the customer choice, so the keep-set goes
 * with the schedule projection.
 */
async function clearScheduledDowngrade(input: {
  clinicId: string;
}): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction([
    prisma.clinicBillingProfile.update({
      where: { clinicId: input.clinicId },
      data: {
        stripeSubscriptionScheduleId: null,
        stripePlanDowngradeAttemptId: null,
      },
    }),
    prisma.clinicEntitlement.update({
      where: { clinicId: input.clinicId },
      data: {
        scheduledCommercialPlan: null,
        scheduledPlanEffectiveAt: null,
      },
    }),
    prisma.clinicDowngradePreparation.deleteMany({
      where: { clinicId: input.clinicId },
    }),
  ]);
}

function claimsScheduledProjection(state: PlanDowngradeState): boolean {
  return Boolean(
    state.stripeSubscriptionScheduleId || state.scheduledCommercialPlan
  );
}

function logVerificationFailed(input: {
  clinicId: string;
  stripeSubscriptionId: string;
  scheduleId: string | null;
  attemptId: string | null;
  scheduleStatus: string | null;
  observedScheduleId: string | null;
  reason: DowngradeVerificationReason | "missing_attempt";
}): void {
  logStripeBilling({
    event: "plan_downgrade_verification_failed",
    clinicId: input.clinicId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    scheduleId: input.scheduleId,
    attemptId: input.attemptId,
    scheduleStatus: input.scheduleStatus,
    observedScheduleId: input.observedScheduleId,
    reason: input.reason,
  });
}

function subscriptionShapeBlocked(
  subscription: DowngradeSubscriptionSnapshot
): boolean {
  if (
    subscription.itemCount !== 1 ||
    !subscription.itemId ||
    !subscription.priceId ||
    !subscription.periodEnd
  ) {
    return true;
  }
  if (subscription.quantity !== 1) {
    return true;
  }
  if (
    subscription.discountsPresent ||
    subscription.trialPresent ||
    subscription.taxRatesPresent
  ) {
    return true;
  }
  return false;
}

export async function executeOperatorPlanDowngrade(input: {
  state: PlanDowngradeState;
  readiness: EssentialDowngradeReadiness;
  guideSelection?: ConfirmedGuideKeep | null;
  env?: Env;
  stripe?: PlanDowngradeStripePort;
  persist?: typeof persistScheduledDowngrade;
  ensureAttempt?: (clinicId: string) => Promise<DowngradeAttemptAllocation>;
  clearProjection?: typeof clearScheduledDowngradeProjection;
}): Promise<
  | {
      ok: true;
      alreadyScheduled: boolean;
      scheduleId: string;
      effectiveAt: Date;
      stripeSubscriptionId: string;
    }
  | { ok: false; code: PlanDowngradeCode }
> {
  const persist = input.persist ?? persistScheduledDowngrade;
  const ensureAttempt = input.ensureAttempt ?? ensureDowngradeAttemptId;
  const clearProjection =
    input.clearProjection ?? clearScheduledDowngradeProjection;
  const claims = claimsScheduledProjection(input.state);
  let assessed = claims
    ? null
    : assessOperatorPlanDowngrade({
        state: input.state,
        readiness: input.readiness,
        guideSelection: input.guideSelection,
      });
  if (assessed && !assessed.ok) {
    return failure(input.state.clinicId, assessed.code);
  }
  if (!input.state.stripeSubscriptionId) {
    return failure(input.state.clinicId, "no_subscription");
  }
  if (!input.state.billingInterval) {
    return failure(input.state.clinicId, "unsupported");
  }
  const interval = input.state.billingInterval;
  const subscriptionId = input.state.stripeSubscriptionId;

  let practicePriceId: string;
  let essentialPriceId: string;
  try {
    practicePriceId = stripePriceIdForPlan("PRACTICE", interval, input.env);
    essentialPriceId = stripePriceIdForPlan("ESSENTIAL", interval, input.env);
  } catch (error) {
    if (error instanceof StripePriceMappingError) {
      return failure(input.state.clinicId, "price_not_configured");
    }
    throw error;
  }

  let stripe: PlanDowngradeStripePort;
  try {
    stripe = input.stripe ?? downgradeStripePort(getStripeClient(input.env));
  } catch {
    return failure(input.state.clinicId, "schedule_failed");
  }

  const requireReady = () => {
    assessed =
      assessed ??
      assessOperatorPlanDowngrade({
        state: input.state,
        readiness: input.readiness,
        guideSelection: input.guideSelection,
      });
    return assessed;
  };

  try {
    let attemptId = input.state.stripePlanDowngradeAttemptId;
    let subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (subscription.id !== subscriptionId) {
      return failure(input.state.clinicId, "subscription_shape");
    }
    if (subscription.cancelAtPeriodEnd) {
      return failure(input.state.clinicId, "cancel_scheduled");
    }
    if (subscription.status !== "active") {
      return failure(input.state.clinicId, "not_active");
    }
    if (subscriptionShapeBlocked(subscription)) {
      return failure(input.state.clinicId, "subscription_shape");
    }

    let mapped: { plan: "ESSENTIAL" | "PRACTICE"; interval: BillingInterval };
    try {
      mapped = planFromStripePriceId(subscription.priceId ?? "", input.env);
    } catch (error) {
      if (error instanceof StripePriceMappingError) {
        return failure(input.state.clinicId, "price_not_configured");
      }
      return failure(input.state.clinicId, "price_mismatch");
    }
    if (mapped.plan === "ESSENTIAL") {
      return failure(input.state.clinicId, "already_transitioned");
    }
    if (
      mapped.plan !== "PRACTICE" ||
      mapped.interval !== interval ||
      subscription.priceId !== practicePriceId
    ) {
      return failure(input.state.clinicId, "price_mismatch");
    }
    const periodEnd = subscription.periodEnd;
    if (!periodEnd) {
      return failure(input.state.clinicId, "subscription_shape");
    }

    const persistIfVerified = async (live: {
      scheduleId: string;
      attemptId: string;
      alreadyScheduled: boolean;
    }) => {
      const freshSchedule = await stripe.subscriptionSchedules.retrieve(
        live.scheduleId
      );
      const freshSubscription =
        await stripe.subscriptions.retrieve(subscriptionId);
      const verified = verifyLiveDowngradeSchedule({
        schedule: freshSchedule,
        subscription: freshSubscription,
        expectedScheduleId: live.scheduleId,
        clinicId: input.state.clinicId,
        attemptId: live.attemptId,
        practicePriceId,
        essentialPriceId,
        periodEnd,
      });
      if (!verified.ok) {
        logVerificationFailed({
          clinicId: input.state.clinicId,
          stripeSubscriptionId: freshSubscription.id,
          scheduleId: live.scheduleId,
          attemptId: live.attemptId,
          scheduleStatus: freshSchedule.status,
          observedScheduleId: freshSubscription.scheduleId,
          reason: verified.reason,
        });
        if (
          !freshSubscription.scheduleId ||
          freshSchedule.status === "released" ||
          freshSchedule.status === "completed" ||
          freshSchedule.status === "canceled"
        ) {
          await clearProjection({
            clinicId: input.state.clinicId,
            retireAttempt: true,
          });
        }
        return failure(input.state.clinicId, "schedule_failed");
      }
      const effectiveAt = unixToDate(verified.effectiveAt);
      await persist({
        clinicId: input.state.clinicId,
        scheduleId: freshSchedule.id,
        effectiveAt,
      });
      if (live.alreadyScheduled) {
        logStripeBilling({
          event: "plan_downgrade_already_scheduled",
          clinicId: input.state.clinicId,
        });
      } else {
        logStripeBilling({
          event: "plan_downgrade_scheduled",
          clinicId: input.state.clinicId,
          billingInterval: interval,
        });
      }
      return {
        ok: true as const,
        alreadyScheduled: live.alreadyScheduled,
        scheduleId: freshSchedule.id,
        effectiveAt,
        stripeSubscriptionId: freshSubscription.id,
      };
    };

    const updateThenVerify = async (
      scheduleId: string,
      phaseStart: number,
      currentAttemptId: string
    ) => {
      await stripe.subscriptionSchedules.update(
        scheduleId,
        buildPracticeToEssentialScheduleUpdate({
          clinicId: input.state.clinicId,
          attemptId: currentAttemptId,
          currentPriceId: practicePriceId,
          essentialPriceId,
          quantity: 1,
          phaseStart,
          periodEnd,
          interval,
        }),
        {
          idempotencyKey: planDowngradeIdempotencyKey({
            clinicId: input.state.clinicId,
            stripeSubscriptionId: subscriptionId,
            targetPriceId: essentialPriceId,
            periodEnd,
            attemptId: currentAttemptId,
            step: "update",
          }),
        }
      );
      return await persistIfVerified({
        scheduleId,
        attemptId: currentAttemptId,
        alreadyScheduled: false,
      });
    };

    if (claims && !subscription.scheduleId) {
      logStripeBilling({
        event: "plan_downgrade_stale_projection_reconciled",
        clinicId: input.state.clinicId,
        scheduleId: input.state.stripeSubscriptionScheduleId,
        attemptId,
      });
      await clearProjection({
        clinicId: input.state.clinicId,
        retireAttempt: true,
      });
      attemptId = null;
    }

    if (subscription.scheduleId) {
      const existing = await stripe.subscriptionSchedules.retrieve(
        subscription.scheduleId
      );
      const classifyAttempt =
        attemptId ?? existing.metadataAttemptId ?? "unallocated";
      const classification = classifyAttachedDowngradeSchedule({
        schedule: existing,
        subscription,
        clinicId: input.state.clinicId,
        attemptId: classifyAttempt,
        practicePriceId,
        essentialPriceId,
        periodEnd,
      });
      if (classification.kind === "complete") {
        if (!existing.metadataAttemptId) {
          return failure(input.state.clinicId, "unknown_schedule");
        }
        return await persistIfVerified({
          scheduleId: existing.id,
          attemptId: existing.metadataAttemptId,
          alreadyScheduled: true,
        });
      }
      if (classification.kind !== "intermediate") {
        logVerificationFailed({
          clinicId: input.state.clinicId,
          stripeSubscriptionId: subscription.id,
          scheduleId: existing.id,
          attemptId,
          scheduleStatus: existing.status,
          observedScheduleId: subscription.scheduleId,
          reason: classification.reason,
        });
        return failure(
          input.state.clinicId,
          classification.kind === "ended"
            ? "schedule_failed"
            : "unknown_schedule"
        );
      }
      const ready = requireReady();
      if (!ready.ok) {
        return failure(input.state.clinicId, ready.code);
      }
      if (!attemptId) {
        const allocation = await ensureAttempt(input.state.clinicId);
        attemptId = allocation.attemptId;
        if (allocation.created) {
          logStripeBilling({
            event: "plan_downgrade_attempt_started",
            clinicId: input.state.clinicId,
            attemptId,
          });
        }
      }
      const phase = existing.phases[0];
      if (!phase) {
        return failure(input.state.clinicId, "unknown_schedule");
      }
      return await updateThenVerify(existing.id, phase.startDate, attemptId);
    }

    const ready = requireReady();
    if (!ready.ok) {
      return failure(input.state.clinicId, ready.code);
    }
    if (!attemptId) {
      const allocation = await ensureAttempt(input.state.clinicId);
      attemptId = allocation.attemptId;
      if (allocation.created) {
        logStripeBilling({
          event: "plan_downgrade_attempt_started",
          clinicId: input.state.clinicId,
          attemptId,
        });
      }
    }

    await stripe.subscriptionSchedules.create(
      { from_subscription: subscriptionId },
      {
        idempotencyKey: planDowngradeIdempotencyKey({
          clinicId: input.state.clinicId,
          stripeSubscriptionId: subscriptionId,
          targetPriceId: essentialPriceId,
          periodEnd,
          attemptId,
          step: "create",
        }),
      }
    );
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (!subscription.scheduleId) {
      logVerificationFailed({
        clinicId: input.state.clinicId,
        stripeSubscriptionId: subscription.id,
        scheduleId: null,
        attemptId,
        scheduleStatus: null,
        observedScheduleId: null,
        reason: "subscription_attachment",
      });
      await clearProjection({
        clinicId: input.state.clinicId,
        retireAttempt: true,
      });
      return failure(input.state.clinicId, "schedule_failed");
    }
    const attached = await stripe.subscriptionSchedules.retrieve(
      subscription.scheduleId
    );
    const attachedClassification = classifyAttachedDowngradeSchedule({
      schedule: attached,
      subscription,
      clinicId: input.state.clinicId,
      attemptId,
      practicePriceId,
      essentialPriceId,
      periodEnd,
    });
    if (attachedClassification.kind === "complete") {
      return await persistIfVerified({
        scheduleId: attached.id,
        attemptId,
        alreadyScheduled: true,
      });
    }
    if (attachedClassification.kind !== "intermediate") {
      logVerificationFailed({
        clinicId: input.state.clinicId,
        stripeSubscriptionId: subscription.id,
        scheduleId: attached.id,
        attemptId,
        scheduleStatus: attached.status,
        observedScheduleId: subscription.scheduleId,
        reason: attachedClassification.reason,
      });
      return failure(
        input.state.clinicId,
        attachedClassification.kind === "ended"
          ? "schedule_failed"
          : "unknown_schedule"
      );
    }
    const createdPhase = attached.phases[0];
    if (!createdPhase) {
      return failure(input.state.clinicId, "subscription_shape");
    }
    return await updateThenVerify(
      attached.id,
      createdPhase.startDate,
      attemptId
    );
  } catch {
    return failure(input.state.clinicId, "schedule_failed");
  }
}

export async function executeOperatorDowngradeReversal(input: {
  state: PlanDowngradeState;
  env?: Env;
  stripe: PlanDowngradeStripePort;
  clear?: (row: { clinicId: string }) => Promise<void>;
  clearProjection?: typeof clearScheduledDowngradeProjection;
}): Promise<
  | { ok: true; alreadyReversed: boolean; stripeSubscriptionId: string }
  | { ok: false; code: PlanDowngradeCode }
> {
  const clear = input.clear ?? clearScheduledDowngrade;
  const clearProjection =
    input.clearProjection ??
    (input.clear ? async () => undefined : clearScheduledDowngradeProjection);
  if (
    !input.state.scheduledCommercialPlan &&
    !input.state.stripeSubscriptionScheduleId
  ) {
    if (!input.state.stripeSubscriptionId) {
      return { ok: false, code: "not_scheduled" };
    }
    return {
      ok: true,
      alreadyReversed: true,
      stripeSubscriptionId: input.state.stripeSubscriptionId,
    };
  }

  const assessed = assessOperatorDowngradeReversal(input.state);
  if (!assessed.ok && assessed.code !== "not_scheduled") {
    return failure(input.state.clinicId, assessed.code);
  }

  if (!input.state.stripeSubscriptionId) {
    return failure(input.state.clinicId, "no_subscription");
  }

  let practicePriceId: string;
  try {
    practicePriceId = stripePriceIdForPlan(
      "PRACTICE",
      input.state.billingInterval ?? "MONTHLY",
      input.env
    );
  } catch (error) {
    if (error instanceof StripePriceMappingError) {
      return failure(input.state.clinicId, "price_not_configured");
    }
    throw error;
  }

  try {
    const subscription = await input.stripe.subscriptions.retrieve(
      input.state.stripeSubscriptionId
    );
    if (subscription.priceId !== practicePriceId) {
      return failure(input.state.clinicId, "already_transitioned");
    }
    const scheduleId =
      subscription.scheduleId ?? input.state.stripeSubscriptionScheduleId;
    if (!scheduleId) {
      await clearProjection({
        clinicId: input.state.clinicId,
        retireAttempt: true,
      });
      return {
        ok: true,
        alreadyReversed: true,
        stripeSubscriptionId: subscription.id,
      };
    }
    const schedule =
      await input.stripe.subscriptionSchedules.retrieve(scheduleId);
    if (
      !isRiverDowngradeSchedule({
        scheduleId: schedule.id,
        metadataClinicId: schedule.metadataClinicId,
        metadataPurpose: schedule.metadataPurpose,
        localScheduleId: input.state.stripeSubscriptionScheduleId,
        clinicId: input.state.clinicId,
      })
    ) {
      return failure(input.state.clinicId, "unknown_schedule");
    }
    const releasedSubscription =
      schedule.releasedSubscriptionId ?? schedule.subscriptionId;
    const ended =
      schedule.status === "released" ||
      schedule.status === "completed" ||
      schedule.status === "canceled";
    if (ended) {
      if (releasedSubscription && releasedSubscription !== subscription.id) {
        return failure(input.state.clinicId, "subscription_shape");
      }
      if (subscription.scheduleId) {
        logVerificationFailed({
          clinicId: input.state.clinicId,
          stripeSubscriptionId: subscription.id,
          scheduleId: schedule.id,
          attemptId: input.state.stripePlanDowngradeAttemptId,
          scheduleStatus: schedule.status,
          observedScheduleId: subscription.scheduleId,
          reason: "subscription_attachment",
        });
        return failure(input.state.clinicId, "schedule_failed");
      }
      const validatedLifecycle =
        input.state.scheduledCommercialPlan === "ESSENTIAL" &&
        input.state.stripeSubscriptionScheduleId === schedule.id &&
        input.state.stripePlanDowngradeAttemptId != null &&
        schedule.metadataAttemptId === input.state.stripePlanDowngradeAttemptId;
      if (validatedLifecycle) {
        await clear({ clinicId: input.state.clinicId });
      } else {
        await clearProjection({
          clinicId: input.state.clinicId,
          retireAttempt: true,
        });
      }
      return {
        ok: true,
        alreadyReversed: true,
        stripeSubscriptionId: subscription.id,
      };
    }

    if (!input.state.stripePlanDowngradeAttemptId) {
      logVerificationFailed({
        clinicId: input.state.clinicId,
        stripeSubscriptionId: subscription.id,
        scheduleId: schedule.id,
        attemptId: null,
        scheduleStatus: schedule.status,
        observedScheduleId: subscription.scheduleId,
        reason: "missing_attempt",
      });
      return failure(input.state.clinicId, "schedule_failed");
    }
    const attemptId = input.state.stripePlanDowngradeAttemptId;
    await input.stripe.subscriptionSchedules.release(
      schedule.id,
      { preserve_cancel_date: false },
      {
        idempotencyKey: planDowngradeIdempotencyKey({
          clinicId: input.state.clinicId,
          stripeSubscriptionId: subscription.id,
          attemptId,
          step: "release",
        }),
      }
    );
    const freshSchedule = await input.stripe.subscriptionSchedules.retrieve(
      schedule.id
    );
    const freshSubscription = await input.stripe.subscriptions.retrieve(
      subscription.id
    );
    const releasedId =
      freshSchedule.releasedSubscriptionId ?? freshSchedule.subscriptionId;
    if (
      freshSchedule.status !== "released" ||
      freshSubscription.scheduleId ||
      releasedId !== subscription.id
    ) {
      logVerificationFailed({
        clinicId: input.state.clinicId,
        stripeSubscriptionId: freshSubscription.id,
        scheduleId: freshSchedule.id,
        attemptId,
        scheduleStatus: freshSchedule.status,
        observedScheduleId: freshSubscription.scheduleId,
        reason:
          freshSchedule.status !== "released"
            ? "schedule_status"
            : "subscription_attachment",
      });
      return failure(input.state.clinicId, "schedule_failed");
    }
    await clear({ clinicId: input.state.clinicId });
    logStripeBilling({
      event: "plan_downgrade_reversed",
      clinicId: input.state.clinicId,
    });
    return {
      ok: true,
      alreadyReversed: false,
      stripeSubscriptionId: subscription.id,
    };
  } catch {
    return failure(input.state.clinicId, "schedule_failed");
  }
}

export function scheduledDowngradeFieldsAfterProjection(input: {
  previousScheduledPlan: CommercialPlan | null;
  previousEffectiveAt: Date | null;
  projectedPlan: CommercialPlan | null;
  cancellationSuperseded: boolean;
}): {
  scheduledCommercialPlan: CommercialPlan | null;
  scheduledPlanEffectiveAt: Date | null;
} {
  if (input.projectedPlan === "ESSENTIAL" || input.cancellationSuperseded) {
    return {
      scheduledCommercialPlan: null,
      scheduledPlanEffectiveAt: null,
    };
  }
  return {
    scheduledCommercialPlan: input.previousScheduledPlan,
    scheduledPlanEffectiveAt: input.previousEffectiveAt,
  };
}

export function shouldReleaseScheduleForCancellation(input: {
  scheduleId: string | null;
  cancelAtPeriodEnd: boolean;
}): boolean {
  return Boolean(input.scheduleId) && input.cancelAtPeriodEnd;
}

/**
 * A collapsed schedule can still end the subscription after the customer
 * removes cancellation. Release it so Practice continues, and do not put
 * the Essential phase back.
 */
export function shouldReleaseScheduleAfterCancellationReversed(input: {
  scheduleId: string | null;
  previousCancelAtPeriodEnd: boolean;
  cancelAtPeriodEnd: boolean;
}): boolean {
  return (
    Boolean(input.scheduleId) &&
    input.previousCancelAtPeriodEnd &&
    !input.cancelAtPeriodEnd
  );
}

export type ScheduleEventNotice = {
  scheduleId: string;
  status: string;
  endBehavior: string;
  subscriptionId: string | null;
  releasedSubscriptionId: string | null;
  metadataClinicId: string | null;
  metadataPurpose: string | null;
  metadataAttemptId: string | null;
  currentPriceId: string | null;
  currentQuantity: number | null;
  currentStart: number | null;
  currentEnd: number | null;
  futurePriceId: string | null;
};

export type ScheduleEventDecision =
  | { action: "ignore" }
  | { action: "clear_schedule" }
  | { action: "mark_cancel" }
  | { action: "fail" }
  | {
      action: "cancellation_supersedes";
      update: CancellationSupersedeUpdate;
    };

export function decideSubscriptionScheduleEvent(input: {
  notice: ScheduleEventNotice;
  clinicId: string;
  localScheduleId: string | null;
  practicePriceId: string | null;
  essentialPriceId: string | null;
}): ScheduleEventDecision {
  const owned = isRiverDowngradeSchedule({
    scheduleId: input.notice.scheduleId,
    metadataClinicId: input.notice.metadataClinicId,
    metadataPurpose: input.notice.metadataPurpose,
    localScheduleId: input.localScheduleId,
    clinicId: input.clinicId,
  });
  if (!owned) {
    return { action: "ignore" };
  }
  if (
    input.notice.status === "released" ||
    input.notice.status === "completed" ||
    input.notice.status === "canceled"
  ) {
    return { action: "clear_schedule" };
  }
  if (input.notice.endBehavior !== "cancel") {
    return { action: "ignore" };
  }
  if (input.notice.currentPriceId === input.essentialPriceId) {
    return { action: "ignore" };
  }
  if (
    input.notice.currentPriceId === input.practicePriceId &&
    !input.notice.futurePriceId
  ) {
    return { action: "mark_cancel" };
  }
  if (
    !input.practicePriceId ||
    input.notice.currentPriceId !== input.practicePriceId ||
    input.notice.futurePriceId !== input.essentialPriceId ||
    input.notice.currentQuantity !== 1 ||
    input.notice.currentStart == null ||
    input.notice.currentEnd == null
  ) {
    return { action: "fail" };
  }
  return {
    action: "cancellation_supersedes",
    update: buildCancellationSupersedeUpdate({
      practicePriceId: input.practicePriceId,
      quantity: 1,
      phaseStart: input.notice.currentStart,
      periodEnd: input.notice.currentEnd,
    }),
  };
}

function priceIdFromUnknown(value: unknown): string | null {
  return stripeObjectId(value);
}

export function noticeFromSubscriptionSchedule(
  schedule: Stripe.SubscriptionSchedule
): ScheduleEventNotice {
  const phases = schedule.phases ?? [];
  const currentWindow = schedule.current_phase;
  const current =
    (currentWindow
      ? phases.find(
          (phase) =>
            phase.start_date === currentWindow.start_date &&
            phase.end_date === currentWindow.end_date
        )
      : null) ?? phases[0];
  const currentIndex = current ? phases.indexOf(current) : -1;
  const future = currentIndex >= 0 ? phases[currentIndex + 1] : undefined;
  return {
    scheduleId: schedule.id,
    status: schedule.status,
    endBehavior: schedule.end_behavior,
    subscriptionId: stripeObjectId(schedule.subscription),
    releasedSubscriptionId: schedule.released_subscription,
    metadataClinicId: schedule.metadata?.[RIVER_CLINIC_ID_METADATA_KEY] ?? null,
    metadataPurpose: schedule.metadata?.riverSchedulePurpose ?? null,
    metadataAttemptId:
      schedule.metadata?.[RIVER_DOWNGRADE_ATTEMPT_METADATA_KEY] ?? null,
    currentPriceId: priceIdFromUnknown(current?.items?.[0]?.price),
    currentQuantity: current?.items?.[0]?.quantity ?? null,
    currentStart: current?.start_date ?? null,
    currentEnd: current?.end_date ?? null,
    futurePriceId: priceIdFromUnknown(future?.items?.[0]?.price),
  };
}

export function downgradeStripePort(stripe: Stripe): PlanDowngradeStripePort {
  return {
    subscriptions: {
      async retrieve(id) {
        const subscription = await stripe.subscriptions.retrieve(id);
        return subscriptionSnapshotFromStripe(subscription);
      },
    },
    subscriptionSchedules: {
      async create(params, options) {
        const schedule = await stripe.subscriptionSchedules.create(
          params,
          options
        );
        return scheduleSnapshotFromStripe(schedule);
      },
      async retrieve(id) {
        const schedule = await stripe.subscriptionSchedules.retrieve(id);
        return scheduleSnapshotFromStripe(schedule);
      },
      async update(id, params, options) {
        const schedule = await stripe.subscriptionSchedules.update(
          id,
          params,
          options
        );
        return scheduleSnapshotFromStripe(schedule);
      },
      async release(id, params, options) {
        const schedule = await stripe.subscriptionSchedules.release(
          id,
          params,
          options
        );
        return scheduleSnapshotFromStripe(schedule);
      },
    },
  };
}

export function subscriptionSnapshotFromStripe(
  subscription: Stripe.Subscription
): DowngradeSubscriptionSnapshot {
  const item = subscription.items?.data?.[0] ?? null;
  const discounts = subscription.discounts;
  return {
    id: subscription.id,
    status: subscription.status,
    scheduleId: stripeObjectId(subscription.schedule),
    cancelAtPeriodEnd: subscriptionCancellationScheduled(subscription),
    itemId: item?.id ?? null,
    priceId: stripeObjectId(item?.price) ?? null,
    quantity: item?.quantity ?? null,
    periodEnd:
      typeof item?.current_period_end === "number"
        ? item.current_period_end
        : null,
    itemCount: subscription.items?.data?.length ?? 0,
    discountsPresent: Array.isArray(discounts) && discounts.length > 0,
    trialPresent: subscription.trial_end != null,
    taxRatesPresent:
      Array.isArray(item?.tax_rates) && item.tax_rates.length > 0,
  };
}

export function scheduleSnapshotFromStripe(
  schedule: Stripe.SubscriptionSchedule
): DowngradeScheduleSnapshot {
  return {
    id: schedule.id,
    status: schedule.status,
    endBehavior: schedule.end_behavior,
    subscriptionId: stripeObjectId(schedule.subscription),
    releasedSubscriptionId: schedule.released_subscription,
    metadataClinicId: schedule.metadata?.[RIVER_CLINIC_ID_METADATA_KEY] ?? null,
    metadataPurpose: schedule.metadata?.riverSchedulePurpose ?? null,
    metadataAttemptId:
      schedule.metadata?.[RIVER_DOWNGRADE_ATTEMPT_METADATA_KEY] ?? null,
    phases: (schedule.phases ?? []).map((phase) => ({
      priceId: stripeObjectId(phase.items?.[0]?.price) ?? "",
      quantity: phase.items?.[0]?.quantity ?? 0,
      startDate: phase.start_date,
      endDate: phase.end_date,
      prorationBehavior: phase.proration_behavior ?? null,
      billingCycleAnchor: phase.billing_cycle_anchor ?? null,
      hasExtras: Boolean(
        phase.add_invoice_items?.length ||
        phase.discounts?.length ||
        phase.trial_end ||
        phase.default_tax_rates?.length
      ),
    })),
  };
}

async function loadDowngradeState(
  clinicId: string
): Promise<PlanDowngradeState | null> {
  const clinic = await getPrisma().clinic.findUnique({
    where: { id: clinicId },
    select: {
      entitlement: true,
      billingProfile: {
        select: {
          stripeSubscriptionId: true,
          stripeSubscriptionScheduleId: true,
          stripePlanDowngradeAttemptId: true,
          stripeCheckoutSessionId: true,
        },
      },
    },
  });
  if (!clinic) {
    return null;
  }
  return {
    clinicId,
    commercialPlan: clinic.entitlement?.commercialPlan ?? null,
    billingInterval: clinic.entitlement?.billingInterval ?? null,
    entitlementStatus: clinic.entitlement?.entitlementStatus ?? null,
    billingStatus: clinic.entitlement?.billingStatus ?? null,
    cancelAtPeriodEnd: clinic.entitlement?.cancelAtPeriodEnd ?? false,
    stripeSubscriptionId: clinic.billingProfile?.stripeSubscriptionId ?? null,
    stripeSubscriptionScheduleId:
      clinic.billingProfile?.stripeSubscriptionScheduleId ?? null,
    stripePlanDowngradeAttemptId:
      clinic.billingProfile?.stripePlanDowngradeAttemptId ?? null,
    stripeCheckoutSessionId:
      clinic.billingProfile?.stripeCheckoutSessionId ?? null,
    scheduledCommercialPlan:
      clinic.entitlement?.scheduledCommercialPlan ?? null,
    scheduledPlanEffectiveAt:
      clinic.entitlement?.scheduledPlanEffectiveAt ?? null,
  };
}

export async function submitOperatorPlanDowngrade(input: {
  clinicId: string;
  env?: Env;
  stripe?: PlanDowngradeStripePort;
}): Promise<
  | {
      ok: true;
      alreadyScheduled: boolean;
      effectiveAt: Date;
    }
  | { ok: false; code: PlanDowngradeCode }
> {
  const state = await loadDowngradeState(input.clinicId);
  if (!state) {
    return { ok: false, code: "unsupported" };
  }
  const readiness = await loadEssentialDowngradeReadiness(input.clinicId);
  const guideSelection = await loadConfirmedDowngradeSelection(input.clinicId);
  const result = await executeOperatorPlanDowngrade({
    state,
    readiness,
    guideSelection,
    env: input.env,
    stripe: input.stripe,
  });
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    alreadyScheduled: result.alreadyScheduled,
    effectiveAt: result.effectiveAt,
  };
}

export async function submitOperatorDowngradeReversal(input: {
  clinicId: string;
  env?: Env;
  stripe?: PlanDowngradeStripePort;
}): Promise<
  | { ok: true; alreadyReversed: boolean }
  | { ok: false; code: PlanDowngradeCode }
> {
  const state = await loadDowngradeState(input.clinicId);
  if (!state) {
    return { ok: false, code: "unsupported" };
  }
  let stripe = input.stripe;
  if (!stripe) {
    try {
      stripe = downgradeStripePort(getStripeClient(input.env));
    } catch {
      return failure(input.clinicId, "schedule_failed");
    }
  }
  const result = await executeOperatorDowngradeReversal({
    state,
    env: input.env,
    stripe,
  });
  if (!result.ok) {
    return result;
  }
  return { ok: true, alreadyReversed: result.alreadyReversed };
}

export async function releaseSchedulePreservingCancellation(input: {
  stripe: PlanDowngradeStripePort;
  scheduleId: string;
  expectedSubscriptionId: string;
  preserveCancelDate?: boolean;
}): Promise<{ ok: true; stripeSubscriptionId: string } | { ok: false }> {
  const preserveCancelDate = input.preserveCancelDate ?? true;
  try {
    const existing = await input.stripe.subscriptionSchedules.retrieve(
      input.scheduleId
    );
    if (
      existing.status === "released" ||
      existing.status === "completed" ||
      existing.status === "canceled"
    ) {
      const kept = existing.releasedSubscriptionId ?? existing.subscriptionId;
      if (kept && kept !== input.expectedSubscriptionId) {
        return { ok: false };
      }
      return { ok: true, stripeSubscriptionId: input.expectedSubscriptionId };
    }
    const released = await input.stripe.subscriptionSchedules.release(
      input.scheduleId,
      { preserve_cancel_date: preserveCancelDate }
    );
    const kept = released.releasedSubscriptionId ?? released.subscriptionId;
    if (kept && kept !== input.expectedSubscriptionId) {
      return { ok: false };
    }
    return { ok: true, stripeSubscriptionId: input.expectedSubscriptionId };
  } catch {
    return { ok: false };
  }
}
