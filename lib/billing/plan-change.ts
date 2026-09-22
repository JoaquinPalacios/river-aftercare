import "server-only";

import {
  BillingStatus,
  EntitlementStatus,
  type BillingInterval,
  type CommercialPlan,
} from "@prisma/client";

import type { Env } from "@/lib/billing/env";
import { logStripeBilling } from "@/lib/billing/log";
import {
  stripePriceIdForPlan,
  StripePriceMappingError,
} from "@/lib/billing/price-map";
import { getPrisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/billing/stripe-client";

export const PLAN_UPGRADE_PRORATION_BEHAVIOR = "always_invoice" as const;
export const PLAN_UPGRADE_PAYMENT_BEHAVIOR = "pending_if_incomplete" as const;
export const PLAN_UPGRADE_BILLING_CYCLE_ANCHOR = "unchanged" as const;

export type PlanChangeCode =
  | "downgrade_deferred"
  | "interval_unchanged"
  | "not_active"
  | "cancel_scheduled"
  | "no_subscription"
  | "group_unavailable"
  | "already_on_plan"
  | "unsupported"
  | "price_not_configured"
  | "subscription_shape"
  | "price_mismatch"
  | "upgrade_failed";

export type PlanChangeState = {
  clinicId: string;
  commercialPlan: CommercialPlan | null;
  billingInterval: BillingInterval | null;
  entitlementStatus: EntitlementStatus | null;
  billingStatus: BillingStatus | null;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string | null;
};

export type PlanUpgradeRequest =
  | {
      ok: true;
      clinicId: string;
      interval: BillingInterval;
      targetPlan: "PRACTICE";
      stripeSubscriptionId: string;
    }
  | { ok: false; code: PlanChangeCode };

/**
 * Operator-assisted Essential → Practice on the current interval.
 * Practice → Essential stays deferred until guide and team limits exist.
 * Monthly ↔ annual is not accepted from this action.
 * Submitted Price IDs are not part of the request.
 */
export function assessOperatorPlanUpgrade(
  state: PlanChangeState,
  requestedPlan: string
): PlanUpgradeRequest {
  const requested = requestedPlan.trim().toUpperCase();
  if (state.commercialPlan === "GROUP" || requested === "GROUP") {
    return { ok: false, code: "group_unavailable" };
  }
  if (requested === "ESSENTIAL" && state.commercialPlan === "PRACTICE") {
    return { ok: false, code: "downgrade_deferred" };
  }
  if (requested !== "PRACTICE") {
    return { ok: false, code: "unsupported" };
  }
  if (state.commercialPlan === "PRACTICE") {
    return { ok: false, code: "already_on_plan" };
  }
  if (state.commercialPlan !== "ESSENTIAL" || !state.billingInterval) {
    return { ok: false, code: "unsupported" };
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
  if (
    state.entitlementStatus !== EntitlementStatus.ACTIVE ||
    state.billingStatus !== BillingStatus.ACTIVE
  ) {
    return { ok: false, code: "not_active" };
  }
  return {
    ok: true,
    clinicId: state.clinicId,
    interval: state.billingInterval,
    targetPlan: "PRACTICE",
    stripeSubscriptionId: state.stripeSubscriptionId,
  };
}

export function planChangeMessage(code: PlanChangeCode): string {
  switch (code) {
    case "downgrade_deferred":
      return "Practice to Essential is not available yet. Guide and team limits have to be checked before a downgrade can be scheduled.";
    case "interval_unchanged":
      return "Monthly and annual billing stay as they are. Contact River Aftercare if the billing period needs to change.";
    case "not_active":
      return "The plan can change once the subscription is active and the latest payment is settled.";
    case "cancel_scheduled":
      return "Remove the scheduled cancellation before changing the plan.";
    case "no_subscription":
      return "This clinic does not have a subscription to change.";
    case "group_unavailable":
      return "Group plans are arranged directly with River Aftercare.";
    case "already_on_plan":
      return "This clinic is already on Practice.";
    case "unsupported":
      return "That plan change is not available.";
    case "price_not_configured":
    case "subscription_shape":
    case "price_mismatch":
    case "upgrade_failed":
      return "The plan change could not be sent. Nothing else was subscribed.";
  }
}

type SubscriptionItemPrice = { id: string } | string;

export type PlanChangeSubscription = {
  id: string;
  items: {
    data: Array<{
      id: string;
      quantity?: number | null;
      price: SubscriptionItemPrice;
    }>;
  };
};

export type PlanChangeStripePort = {
  subscriptions: {
    retrieve(id: string): Promise<PlanChangeSubscription>;
    update(
      id: string,
      params: {
        items: Array<{ id: string; price: string }>;
        proration_behavior: typeof PLAN_UPGRADE_PRORATION_BEHAVIOR;
        payment_behavior: typeof PLAN_UPGRADE_PAYMENT_BEHAVIOR;
        billing_cycle_anchor: typeof PLAN_UPGRADE_BILLING_CYCLE_ANCHOR;
      },
      options?: { idempotencyKey?: string }
    ): Promise<{ id: string }>;
  };
};

function priceIdOf(price: SubscriptionItemPrice): string | null {
  if (typeof price === "string") {
    return price;
  }
  return price.id || null;
}

export function planUpgradeIdempotencyKey(input: {
  clinicId: string;
  stripeSubscriptionId: string;
  targetPriceId: string;
}): string {
  return `river-plan-upgrade-${input.clinicId}-${input.stripeSubscriptionId}-${input.targetPriceId}`;
}

export async function executeOperatorPlanUpgrade(input: {
  state: PlanChangeState;
  requestedPlan: string;
  env?: Env;
  stripe: PlanChangeStripePort;
}): Promise<{ ok: true } | { ok: false; code: PlanChangeCode }> {
  const assessed = assessOperatorPlanUpgrade(input.state, input.requestedPlan);
  if (!assessed.ok) {
    if (assessed.code === "downgrade_deferred") {
      logStripeBilling({
        event: "plan_downgrade_deferred",
        clinicId: input.state.clinicId,
      });
    }
    return assessed;
  }

  let currentPriceId: string;
  let targetPriceId: string;
  try {
    currentPriceId = stripePriceIdForPlan(
      "ESSENTIAL",
      assessed.interval,
      input.env
    );
    targetPriceId = stripePriceIdForPlan(
      "PRACTICE",
      assessed.interval,
      input.env
    );
  } catch (error) {
    if (error instanceof StripePriceMappingError) {
      logStripeBilling({
        event: "plan_upgrade_failed",
        clinicId: assessed.clinicId,
        reason: "price_not_configured",
      });
      return { ok: false, code: "price_not_configured" };
    }
    throw error;
  }

  try {
    const subscription = await input.stripe.subscriptions.retrieve(
      assessed.stripeSubscriptionId
    );
    const items = subscription.items.data;
    if (items.length !== 1) {
      logStripeBilling({
        event: "plan_upgrade_failed",
        clinicId: assessed.clinicId,
        reason: "subscription_shape",
      });
      return { ok: false, code: "subscription_shape" };
    }
    const item = items[0];
    if ((item.quantity ?? 1) !== 1) {
      logStripeBilling({
        event: "plan_upgrade_failed",
        clinicId: assessed.clinicId,
        reason: "subscription_shape",
      });
      return { ok: false, code: "subscription_shape" };
    }
    const livePriceId = priceIdOf(item.price);
    if (livePriceId === targetPriceId) {
      return { ok: false, code: "already_on_plan" };
    }
    if (livePriceId !== currentPriceId) {
      logStripeBilling({
        event: "plan_upgrade_failed",
        clinicId: assessed.clinicId,
        reason: "price_mismatch",
      });
      return { ok: false, code: "price_mismatch" };
    }

    await input.stripe.subscriptions.update(
      assessed.stripeSubscriptionId,
      {
        items: [{ id: item.id, price: targetPriceId }],
        proration_behavior: PLAN_UPGRADE_PRORATION_BEHAVIOR,
        payment_behavior: PLAN_UPGRADE_PAYMENT_BEHAVIOR,
        billing_cycle_anchor: PLAN_UPGRADE_BILLING_CYCLE_ANCHOR,
      },
      {
        idempotencyKey: planUpgradeIdempotencyKey({
          clinicId: assessed.clinicId,
          stripeSubscriptionId: assessed.stripeSubscriptionId,
          targetPriceId,
        }),
      }
    );
    logStripeBilling({
      event: "plan_upgrade_submitted",
      clinicId: assessed.clinicId,
      billingInterval: assessed.interval,
    });
    return { ok: true };
  } catch {
    logStripeBilling({
      event: "plan_upgrade_failed",
      clinicId: assessed.clinicId,
      reason: "stripe_request_failed",
    });
    return { ok: false, code: "upgrade_failed" };
  }
}

export async function submitOperatorPlanUpgrade(input: {
  clinicId: string;
  requestedPlan: string;
  env?: Env;
  stripe?: PlanChangeStripePort;
}): Promise<{ ok: true } | { ok: false; code: PlanChangeCode }> {
  const clinic = await getPrisma().clinic.findUnique({
    where: { id: input.clinicId },
    select: {
      entitlement: true,
      billingProfile: { select: { stripeSubscriptionId: true } },
    },
  });
  if (!clinic) {
    return { ok: false, code: "unsupported" };
  }
  const state: PlanChangeState = {
    clinicId: input.clinicId,
    commercialPlan: clinic.entitlement?.commercialPlan ?? null,
    billingInterval: clinic.entitlement?.billingInterval ?? null,
    entitlementStatus: clinic.entitlement?.entitlementStatus ?? null,
    billingStatus: clinic.entitlement?.billingStatus ?? null,
    cancelAtPeriodEnd: clinic.entitlement?.cancelAtPeriodEnd ?? false,
    stripeSubscriptionId: clinic.billingProfile?.stripeSubscriptionId ?? null,
  };
  const assessed = assessOperatorPlanUpgrade(state, input.requestedPlan);
  if (!assessed.ok) {
    if (assessed.code === "downgrade_deferred") {
      logStripeBilling({
        event: "plan_downgrade_deferred",
        clinicId: input.clinicId,
      });
    }
    return assessed;
  }

  let stripe = input.stripe;
  if (!stripe) {
    try {
      stripe = getStripeClient(input.env);
    } catch {
      return { ok: false, code: "upgrade_failed" };
    }
  }
  return executeOperatorPlanUpgrade({
    state,
    requestedPlan: input.requestedPlan,
    env: input.env,
    stripe,
  });
}
