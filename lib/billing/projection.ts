import "server-only";

import {
  BillingStatus,
  EntitlementStatus,
  type BillingInterval,
  type CommercialPlan,
} from "@prisma/client";

import { PUBLIC_GUIDE_RETENTION_DAYS } from "@/lib/billing/price-map";

export { PUBLIC_GUIDE_RETENTION_DAYS };

const CHECKOUT_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
]);

const PAID_ACTIVATION_EVENTS = new Set(["invoice.paid"]);

export type LocalEntitlementSnapshot = {
  commercialPlan: CommercialPlan | null;
  billingInterval: BillingInterval | null;
  billingStatus: BillingStatus;
  entitlementStatus: EntitlementStatus;
  stripePriceId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  paidThrough: Date | null;
  cancelAtPeriodEnd: boolean;
  subscriptionEndedAt: Date | null;
  publicGuideRetentionUntil: Date | null;
};

export type MappedCatalogPrice = {
  plan: Exclude<CommercialPlan, "GROUP">;
  interval: BillingInterval;
};

export type EntitlementProjectionInput = {
  eventType: string;
  previous: LocalEntitlementSnapshot | null;
  clinicId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  mappedPrice: MappedCatalogPrice | null;
  unknownPrice: boolean;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  invoiceIsPaid: boolean;
  now?: Date;
};

export type EntitlementProjectionResult =
  | {
      kind: "unmapped_clinic";
      diagnostic: string;
    }
  | {
      kind: "unknown_price";
      diagnostic: string;
      stripePriceId: string;
    }
  | {
      kind: "apply";
      entitlement: LocalEntitlementSnapshot;
    };

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function publicGuideRetentionUntil(
  endedAt: Date,
  paidThrough: Date | null
): Date {
  return addUtcDays(paidThrough ?? endedAt, PUBLIC_GUIDE_RETENTION_DAYS);
}

function isPaidLike(status: EntitlementStatus | null | undefined): boolean {
  return (
    status === EntitlementStatus.ACTIVE ||
    status === EntitlementStatus.RESTRICTED ||
    status === EntitlementStatus.ENDED
  );
}

function withMappedCatalog(
  snapshot: LocalEntitlementSnapshot,
  mappedPrice: MappedCatalogPrice | null,
  stripePriceId: string | null
): LocalEntitlementSnapshot {
  if (!mappedPrice) {
    return snapshot;
  }
  return {
    ...snapshot,
    commercialPlan: mappedPrice.plan,
    billingInterval: mappedPrice.interval,
    stripePriceId: stripePriceId ?? snapshot.stripePriceId,
  };
}

function withPeriod(
  snapshot: LocalEntitlementSnapshot,
  input: EntitlementProjectionInput
): LocalEntitlementSnapshot {
  return {
    ...snapshot,
    currentPeriodStart: input.currentPeriodStart ?? snapshot.currentPeriodStart,
    currentPeriodEnd: input.currentPeriodEnd ?? snapshot.currentPeriodEnd,
    paidThrough:
      input.currentPeriodEnd ??
      snapshot.paidThrough ??
      snapshot.currentPeriodEnd,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd,
  };
}

function endedSnapshot(
  previous: LocalEntitlementSnapshot | null,
  input: EntitlementProjectionInput,
  now: Date
): LocalEntitlementSnapshot {
  const paidThrough: Date | null =
    input.currentPeriodEnd ??
    previous?.paidThrough ??
    previous?.currentPeriodEnd ??
    null;
  const endedAt =
    previous?.subscriptionEndedAt ?? input.currentPeriodEnd ?? now;
  return withMappedCatalog(
    {
      commercialPlan: previous?.commercialPlan ?? null,
      billingInterval: previous?.billingInterval ?? null,
      billingStatus: BillingStatus.ENDED,
      entitlementStatus: EntitlementStatus.ENDED,
      stripePriceId: input.stripePriceId ?? previous?.stripePriceId ?? null,
      currentPeriodStart:
        input.currentPeriodStart ?? previous?.currentPeriodStart ?? null,
      currentPeriodEnd:
        input.currentPeriodEnd ?? previous?.currentPeriodEnd ?? null,
      paidThrough,
      cancelAtPeriodEnd: false,
      subscriptionEndedAt: endedAt,
      publicGuideRetentionUntil:
        previous?.publicGuideRetentionUntil ??
        publicGuideRetentionUntil(endedAt, paidThrough ?? null),
    },
    input.mappedPrice,
    input.stripePriceId
  );
}

function pendingSnapshot(
  previous: LocalEntitlementSnapshot | null,
  input: EntitlementProjectionInput
): LocalEntitlementSnapshot {
  return withPeriod(
    withMappedCatalog(
      {
        commercialPlan: previous?.commercialPlan ?? null,
        billingInterval: previous?.billingInterval ?? null,
        billingStatus: BillingStatus.PAYMENT_PENDING,
        entitlementStatus: EntitlementStatus.PENDING,
        stripePriceId: input.stripePriceId ?? previous?.stripePriceId ?? null,
        currentPeriodStart: previous?.currentPeriodStart ?? null,
        currentPeriodEnd: previous?.currentPeriodEnd ?? null,
        paidThrough: previous?.paidThrough ?? null,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
        subscriptionEndedAt: null,
        publicGuideRetentionUntil: null,
      },
      input.mappedPrice,
      input.stripePriceId
    ),
    input
  );
}

function activeSnapshot(
  previous: LocalEntitlementSnapshot | null,
  input: EntitlementProjectionInput,
  billingStatus: BillingStatus
): LocalEntitlementSnapshot {
  return withPeriod(
    withMappedCatalog(
      {
        commercialPlan: previous?.commercialPlan ?? null,
        billingInterval: previous?.billingInterval ?? null,
        billingStatus,
        entitlementStatus: EntitlementStatus.ACTIVE,
        stripePriceId: input.stripePriceId ?? previous?.stripePriceId ?? null,
        currentPeriodStart: previous?.currentPeriodStart ?? null,
        currentPeriodEnd: previous?.currentPeriodEnd ?? null,
        paidThrough: previous?.paidThrough ?? null,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
        subscriptionEndedAt: null,
        publicGuideRetentionUntil: null,
      },
      input.mappedPrice,
      input.stripePriceId
    ),
    input
  );
}

function restrictedSnapshot(
  previous: LocalEntitlementSnapshot | null,
  input: EntitlementProjectionInput
): LocalEntitlementSnapshot {
  return withPeriod(
    withMappedCatalog(
      {
        commercialPlan: previous?.commercialPlan ?? null,
        billingInterval: previous?.billingInterval ?? null,
        billingStatus: BillingStatus.UNPAID,
        entitlementStatus: EntitlementStatus.RESTRICTED,
        stripePriceId: input.stripePriceId ?? previous?.stripePriceId ?? null,
        currentPeriodStart: previous?.currentPeriodStart ?? null,
        currentPeriodEnd: previous?.currentPeriodEnd ?? null,
        paidThrough: previous?.paidThrough ?? null,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
        subscriptionEndedAt: null,
        publicGuideRetentionUntil: previous?.publicGuideRetentionUntil ?? null,
      },
      input.mappedPrice,
      input.stripePriceId
    ),
    input
  );
}

function wasActive(previous: LocalEntitlementSnapshot | null): boolean {
  return previous?.entitlementStatus === EntitlementStatus.ACTIVE;
}

export function projectEntitlement(
  input: EntitlementProjectionInput
): EntitlementProjectionResult {
  if (!input.clinicId) {
    return {
      kind: "unmapped_clinic",
      diagnostic: "Stripe object is not linked to a known River clinic.",
    };
  }

  if (input.unknownPrice) {
    return {
      kind: "unknown_price",
      diagnostic:
        "Stripe Price ID is not in the configured Essential/Practice catalogue.",
      stripePriceId: input.stripePriceId ?? "",
    };
  }

  const previous = input.previous;
  const now = input.now ?? new Date();
  const eventType = input.eventType;
  const subscriptionStatus = input.subscriptionStatus;

  if (CHECKOUT_EVENTS.has(eventType)) {
    if (isPaidLike(previous?.entitlementStatus)) {
      return {
        kind: "apply",
        entitlement: withPeriod(
          withMappedCatalog(previous!, input.mappedPrice, input.stripePriceId),
          input
        ),
      };
    }
    return { kind: "apply", entitlement: pendingSnapshot(previous, input) };
  }

  if (eventType === "invoice.payment_failed") {
    if (subscriptionStatus === "unpaid") {
      if (
        wasActive(previous) ||
        previous?.entitlementStatus === EntitlementStatus.RESTRICTED
      ) {
        return {
          kind: "apply",
          entitlement: restrictedSnapshot(previous, input),
        };
      }
      return { kind: "apply", entitlement: pendingSnapshot(previous, input) };
    }
    if (wasActive(previous)) {
      return {
        kind: "apply",
        entitlement: activeSnapshot(previous, input, BillingStatus.PAST_DUE),
      };
    }
    return { kind: "apply", entitlement: pendingSnapshot(previous, input) };
  }

  if (eventType === "customer.subscription.deleted") {
    return { kind: "apply", entitlement: endedSnapshot(previous, input, now) };
  }

  if (PAID_ACTIVATION_EVENTS.has(eventType) && input.invoiceIsPaid) {
    if (
      subscriptionStatus === "canceled" ||
      subscriptionStatus === "incomplete_expired" ||
      subscriptionStatus === "unpaid"
    ) {
      if (subscriptionStatus === "unpaid") {
        return {
          kind: "apply",
          entitlement: restrictedSnapshot(previous, input),
        };
      }
      return {
        kind: "apply",
        entitlement: endedSnapshot(previous, input, now),
      };
    }
    if (
      subscriptionStatus === "incomplete" ||
      subscriptionStatus === "paused"
    ) {
      return { kind: "apply", entitlement: pendingSnapshot(previous, input) };
    }
    const billingStatus = input.cancelAtPeriodEnd
      ? BillingStatus.CANCEL_AT_PERIOD_END
      : BillingStatus.ACTIVE;
    return {
      kind: "apply",
      entitlement: activeSnapshot(previous, input, billingStatus),
    };
  }

  if (
    eventType === "customer.subscription.created" ||
    eventType === "customer.subscription.updated"
  ) {
    if (
      subscriptionStatus === "canceled" ||
      subscriptionStatus === "incomplete_expired"
    ) {
      return {
        kind: "apply",
        entitlement: endedSnapshot(previous, input, now),
      };
    }
    if (subscriptionStatus === "unpaid") {
      if (
        wasActive(previous) ||
        previous?.entitlementStatus === EntitlementStatus.RESTRICTED
      ) {
        return {
          kind: "apply",
          entitlement: restrictedSnapshot(previous, input),
        };
      }
      return { kind: "apply", entitlement: pendingSnapshot(previous, input) };
    }
    if (subscriptionStatus === "past_due") {
      if (wasActive(previous)) {
        return {
          kind: "apply",
          entitlement: activeSnapshot(previous, input, BillingStatus.PAST_DUE),
        };
      }
      return { kind: "apply", entitlement: pendingSnapshot(previous, input) };
    }
    if (subscriptionStatus === "active" || subscriptionStatus === "trialing") {
      if (wasActive(previous)) {
        const billingStatus = input.cancelAtPeriodEnd
          ? BillingStatus.CANCEL_AT_PERIOD_END
          : BillingStatus.ACTIVE;
        return {
          kind: "apply",
          entitlement: activeSnapshot(previous, input, billingStatus),
        };
      }
      return { kind: "apply", entitlement: pendingSnapshot(previous, input) };
    }
    return { kind: "apply", entitlement: pendingSnapshot(previous, input) };
  }

  if (previous) {
    return { kind: "apply", entitlement: previous };
  }
  return { kind: "apply", entitlement: pendingSnapshot(previous, input) };
}
