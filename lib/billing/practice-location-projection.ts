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

export type PracticeCapacityMode =
  | "new_or_transitioning_into_practice"
  | "established_legacy_practice"
  | "established_converted_practice"
  | "outside_practice_quantity";

export type PracticeLocationProjection =
  | {
      action: "project";
      mode:
        "new_or_transitioning_into_practice" | "established_converted_practice";
      quantity: number;
    }
  | {
      action: "preserve_legacy";
      mode: "established_legacy_practice";
    }
  | {
      action: "require_subscription";
      mode:
        "new_or_transitioning_into_practice" | "established_converted_practice";
    }
  | {
      action: "omit";
      mode: PracticeCapacityMode;
    };

type CapacityPrevious = {
  commercialPlan: CommercialPlan | null;
  entitlementStatus: EntitlementStatus;
  purchasedAdditionalLocationQuantity: number | null;
};

/**
 * Classifies the previous persisted row. The current event must not be
 * written before this runs, or a partial Practice update could be read back
 * as legacy.
 *
 * Established Practice means commercial plan Practice and an entitlement that
 * has already left PENDING: ACTIVE, RESTRICTED, or ENDED.
 * Converted means that row stores a number, including 0.
 * Legacy means that row still stores null.
 * Every other previous row is outside Practice until the projected plan is
 * Practice, which is a new activation or a transition into Practice.
 */
export function practiceCapacityMode(input: {
  previous: CapacityPrevious | null;
  projectedPlan: CommercialPlan | null;
}): PracticeCapacityMode {
  if (isConvertedPractice(input.previous)) {
    return input.projectedPlan === "PRACTICE"
      ? "established_converted_practice"
      : "outside_practice_quantity";
  }
  if (isLegacyUnconvertedPractice(input.previous)) {
    return input.projectedPlan === "PRACTICE"
      ? "established_legacy_practice"
      : "outside_practice_quantity";
  }
  if (input.projectedPlan === "PRACTICE") {
    return "new_or_transitioning_into_practice";
  }
  return "outside_practice_quantity";
}

/**
 * An ACTIVE Practice projection can store N only from a retrieved valid
 * Practice shape.
 *
 * A new activation or a transition into Practice, and an already converted
 * Practice row, require that shape. Without it the caller must not apply
 * the projection: doing so would save ACTIVE Practice with a null quantity
 * and make the next event treat the row as legacy.
 *
 * An established legacy Practice keeps operating without the shape and does
 * not gain N. Leaving Practice, including the Essential invoice that completes
 * a scheduled downgrade, does not require a Practice quantity.
 */
export function decidePracticeLocationProjection(input: {
  projectedPlan: CommercialPlan | null;
  projectedEntitlementStatus: EntitlementStatus;
  classifiedQuantity: number | null;
  previous: CapacityPrevious | null;
}): PracticeLocationProjection {
  const mode = practiceCapacityMode({
    previous: input.previous,
    projectedPlan: input.projectedPlan,
  });
  const activePractice =
    input.projectedPlan === "PRACTICE" &&
    input.projectedEntitlementStatus === EntitlementStatus.ACTIVE;

  if (
    activePractice &&
    (mode === "new_or_transitioning_into_practice" ||
      mode === "established_converted_practice")
  ) {
    if (input.classifiedQuantity === null) {
      return { action: "require_subscription", mode };
    }
    return { action: "project", mode, quantity: input.classifiedQuantity };
  }

  if (
    mode === "established_legacy_practice" &&
    activePractice &&
    input.classifiedQuantity !== null
  ) {
    return { action: "preserve_legacy", mode };
  }

  return { action: "omit", mode };
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

export function isConvertedPractice(
  previous: CapacityPrevious | null
): boolean {
  return (
    isEstablishedPractice(previous) &&
    typeof previous?.purchasedAdditionalLocationQuantity === "number"
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
