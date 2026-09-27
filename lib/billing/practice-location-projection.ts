import "server-only";

import { EntitlementStatus, type CommercialPlan } from "@prisma/client";

import {
  GROUP_SUBSCRIPTION_SHAPE_FAILURE_CODE,
  PRACTICE_SUBSCRIPTION_SHAPE_FAILURE_CODE,
} from "@/lib/billing/group-billing-codes";
import {
  classifySubscriptionShape,
  type PracticeShapeRejection,
  type SubscriptionItemShape,
} from "@/lib/billing/group-subscription-shape";
import {
  lookupStripePriceId,
  type BillingIntervalCode,
} from "@/lib/billing/price-map";

export type PracticeLocationProjection =
  | { action: "project"; quantity: number }
  | { action: "preserve_legacy" }
  | { action: "omit" };

type CapacityPrevious = {
  commercialPlan: CommercialPlan | null;
  entitlementStatus: EntitlementStatus;
  purchasedAdditionalLocationQuantity: number | null;
};

/**
 * Writes `purchasedAdditionalLocationQuantity` only for an ACTIVE Practice
 * projection whose retrieved subscription is a valid Practice shape.
 *
 * Already converted: the stored quantity is a number, including 0. Project
 * the classified quantity.
 *
 * New activation: there is no stored entitlement, the stored entitlement is
 * still PENDING, or the stored plan is not an established Practice row.
 * Store the classified quantity, including 0 when the add-on item is absent.
 *
 * Legacy: commercial plan is Practice, the purchased quantity is null, and
 * the entitlement is already ACTIVE, RESTRICTED, or ENDED. Leave null.
 * PENDING is the only entitlement status that has not yet been a paid
 * Practice lifecycle.
 */
export function decidePracticeLocationProjection(input: {
  projectedPlan: CommercialPlan | null;
  projectedEntitlementStatus: EntitlementStatus;
  classifiedQuantity: number | null;
  previous: CapacityPrevious | null;
}): PracticeLocationProjection {
  if (
    input.classifiedQuantity === null ||
    input.projectedPlan !== "PRACTICE" ||
    input.projectedEntitlementStatus !== EntitlementStatus.ACTIVE
  ) {
    return { action: "omit" };
  }

  const previous = input.previous;
  if (
    previous &&
    typeof previous.purchasedAdditionalLocationQuantity === "number"
  ) {
    return { action: "project", quantity: input.classifiedQuantity };
  }

  if (isLegacyUnconvertedPractice(previous)) {
    return { action: "preserve_legacy" };
  }

  return { action: "project", quantity: input.classifiedQuantity };
}

export function isEstablishedPractice(
  previous: {
    commercialPlan: CommercialPlan | null;
    entitlementStatus: EntitlementStatus;
  } | null
): boolean {
  if (!previous) {
    return false;
  }
  return (
    previous.commercialPlan === "PRACTICE" &&
    previous.entitlementStatus !== EntitlementStatus.PENDING
  );
}

export function isLegacyUnconvertedPractice(
  previous: CapacityPrevious | null
): boolean {
  return (
    isEstablishedPractice(previous) &&
    previous?.purchasedAdditionalLocationQuantity === null
  );
}

export type WebhookCatalogResolution =
  | {
      kind: "project";
      mappedPrice: {
        plan: "ESSENTIAL" | "PRACTICE";
        interval: BillingIntervalCode;
      } | null;
      stripePriceId: string | null;
      practiceAdditionalLocationQuantity: number | null;
    }
  | {
      kind: "unknown_price";
      stripePriceId: string;
    }
  | {
      kind: "practice_shape";
      reason: PracticeShapeRejection;
    }
  | {
      kind: "group_unsupported";
    };

/**
 * Subscription items are authoritative for Practice add-on quantity.
 * A mapped Essential price on the invoice still selects Essential when the
 * local row is already an established Practice. That preserves the scheduled
 * Practice → Essential invoice.paid path when the retrieved subscription has
 * not switched items yet. Any other invoice line, including an add-on price
 * or an unknown historical price, does not choose the quantity.
 */
export function resolveWebhookSubscriptionCatalog(input: {
  subscriptionItems: readonly SubscriptionItemShape[] | null;
  snapshotPriceId: string | null;
  previous: {
    commercialPlan: CommercialPlan | null;
    entitlementStatus: EntitlementStatus;
  } | null;
  env: Record<string, string | undefined>;
}): WebhookCatalogResolution {
  const invoiceLookup = lookupStripePriceId(input.snapshotPriceId, input.env);
  const shape =
    input.subscriptionItems === null
      ? null
      : classifySubscriptionShape(input.subscriptionItems, input.env);

  if (shape?.ok && shape.kind === "group") {
    return { kind: "group_unsupported" };
  }
  if (
    shape &&
    !shape.ok &&
    shape.code === GROUP_SUBSCRIPTION_SHAPE_FAILURE_CODE
  ) {
    return { kind: "group_unsupported" };
  }
  if (
    shape &&
    !shape.ok &&
    shape.code === PRACTICE_SUBSCRIPTION_SHAPE_FAILURE_CODE
  ) {
    return { kind: "practice_shape", reason: shape.reason };
  }

  if (shape?.ok && shape.kind === "practice") {
    if (
      invoiceLookup.kind === "mapped" &&
      invoiceLookup.plan === "ESSENTIAL" &&
      isEstablishedPractice(input.previous)
    ) {
      return {
        kind: "project",
        mappedPrice: {
          plan: invoiceLookup.plan,
          interval: invoiceLookup.interval,
        },
        stripePriceId: input.snapshotPriceId,
        practiceAdditionalLocationQuantity: null,
      };
    }
    return {
      kind: "project",
      mappedPrice: { plan: "PRACTICE", interval: shape.interval },
      stripePriceId: shape.basePriceId,
      practiceAdditionalLocationQuantity: shape.additionalLocationQuantity,
    };
  }

  if (shape?.ok && shape.kind === "self_serve") {
    if (invoiceLookup.kind === "mapped") {
      return {
        kind: "project",
        mappedPrice: {
          plan: invoiceLookup.plan,
          interval: invoiceLookup.interval,
        },
        stripePriceId: input.snapshotPriceId,
        practiceAdditionalLocationQuantity: null,
      };
    }
    return {
      kind: "project",
      mappedPrice: { plan: shape.plan, interval: shape.interval },
      stripePriceId: shape.priceId,
      practiceAdditionalLocationQuantity: null,
    };
  }

  if (shape && !shape.ok && shape.reason === "unknown_item") {
    return {
      kind: "unknown_price",
      stripePriceId: input.snapshotPriceId ?? "",
    };
  }

  if (invoiceLookup.kind === "unknown") {
    return {
      kind: "unknown_price",
      stripePriceId: invoiceLookup.stripePriceId,
    };
  }
  if (invoiceLookup.kind === "mapped") {
    return {
      kind: "project",
      mappedPrice: {
        plan: invoiceLookup.plan,
        interval: invoiceLookup.interval,
      },
      stripePriceId: input.snapshotPriceId,
      practiceAdditionalLocationQuantity: null,
    };
  }
  return {
    kind: "project",
    mappedPrice: null,
    stripePriceId: input.snapshotPriceId,
    practiceAdditionalLocationQuantity: null,
  };
}

/**
 * Stripe omits quantity when it is 1. An explicit 0, fraction, or negative
 * quantity stays explicit so the classifier can reject it.
 */
export function normalizeSubscriptionItemQuantity(
  quantity: number | null | undefined
): number {
  if (quantity === null || quantity === undefined) {
    return 1;
  }
  return quantity;
}
