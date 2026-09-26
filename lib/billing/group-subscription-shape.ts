import "server-only";

import type { BillingIntervalCode } from "@/lib/billing/price-map";
import {
  GROUP_SUBSCRIPTION_SHAPE_FAILURE_CODE,
  GROUP_SUBSCRIPTION_SHAPE_LOG_EVENT,
} from "@/lib/billing/group-billing-codes";
import {
  classifyConfiguredStripePrice,
  groupBillingAvailable,
  UnknownStripePriceError,
} from "@/lib/billing/price-map";

export {
  GROUP_SUBSCRIPTION_SHAPE_FAILURE_CODE,
  GROUP_SUBSCRIPTION_SHAPE_LOG_EVENT,
};

export type SubscriptionItemShape = {
  priceId: string;
  quantity: number;
};

export type GroupShapeRejection =
  | "invalid_quantity"
  | "unknown_item"
  | "mixed_plan"
  | "addon_without_base"
  | "duplicate_base"
  | "duplicate_addon"
  | "base_quantity"
  | "addon_quantity"
  | "interval_mismatch"
  | "group_billing_unavailable";

export type ClassifiedSubscriptionShape =
  | {
      ok: true;
      kind: "self_serve";
      plan: "ESSENTIAL" | "PRACTICE";
      interval: BillingIntervalCode;
      priceId: string;
    }
  | {
      ok: true;
      kind: "group";
      plan: "GROUP";
      interval: BillingIntervalCode;
      basePriceId: string;
      additionalSiteQuantity: number;
    }
  | {
      ok: false;
      code: typeof GROUP_SUBSCRIPTION_SHAPE_FAILURE_CODE;
      reason: GroupShapeRejection;
    }
  | {
      ok: false;
      code: "subscription_shape_invalid";
      reason: "self_serve_shape" | "invalid_quantity" | "unknown_item";
    };

type Env = Record<string, string | undefined>;

type ClassifiedItem = {
  priceId: string;
  quantity: number;
  price: ReturnType<typeof classifyConfiguredStripePrice> | null;
};

/**
 * Classifies subscription items without reading Stripe and without depending
 * on item order. Essential and Practice stay one base item at quantity 1.
 * Group Checkout and webhook projection do not call this yet.
 */
export function classifySubscriptionShape(
  items: readonly SubscriptionItemShape[],
  env: Env = process.env
): ClassifiedSubscriptionShape {
  const classified = items.map((item) => classifyItem(item, env));
  const groupItems = classified.filter((item) => isGroupPrice(item.price));

  if (classified.some((item) => !isFiniteInteger(item.quantity))) {
    if (groupItems.length > 0) {
      return groupFailure("invalid_quantity");
    }
    return {
      ok: false,
      code: "subscription_shape_invalid",
      reason: "invalid_quantity",
    };
  }

  if (classified.some((item) => item.quantity < 0)) {
    if (groupItems.length > 0) {
      return groupFailure("invalid_quantity");
    }
    return {
      ok: false,
      code: "subscription_shape_invalid",
      reason: "invalid_quantity",
    };
  }

  if (classified.some((item) => item.price === null)) {
    if (groupItems.length > 0) {
      return groupFailure("unknown_item");
    }
    return {
      ok: false,
      code: "subscription_shape_invalid",
      reason: "unknown_item",
    };
  }

  if (groupItems.length > 0) {
    return classifyGroupShape(classified, env);
  }

  return classifySelfServeShape(classified);
}

function classifyGroupShape(
  items: readonly ClassifiedItem[],
  env: Env
): ClassifiedSubscriptionShape {
  const groupBases = items.filter(
    (item) => item.price?.role === "BASE_PLAN" && item.price.plan === "GROUP"
  );
  const addons = items.filter(
    (item) => item.price?.role === "GROUP_SITE_ADDON"
  );
  const otherBases = items.filter(
    (item) => item.price?.role === "BASE_PLAN" && item.price.plan !== "GROUP"
  );

  if (otherBases.length > 0) {
    return groupFailure("mixed_plan");
  }
  if (groupBases.length === 0) {
    return groupFailure("addon_without_base");
  }
  if (groupBases.length > 1) {
    return groupFailure("duplicate_base");
  }
  if (addons.length > 1) {
    return groupFailure("duplicate_addon");
  }

  const base = groupBases[0];
  if (!base?.price || base.price.role !== "BASE_PLAN") {
    return groupFailure("addon_without_base");
  }
  if (base.quantity !== 1) {
    return groupFailure("base_quantity");
  }

  const addon = addons[0];
  if (addon && addon.quantity < 1) {
    return groupFailure("addon_quantity");
  }
  if (
    addon?.price?.role === "GROUP_SITE_ADDON" &&
    addon.price.interval !== base.price.interval
  ) {
    return groupFailure("interval_mismatch");
  }

  if (!groupBillingAvailable(env)) {
    return groupFailure("group_billing_unavailable");
  }

  return {
    ok: true,
    kind: "group",
    plan: "GROUP",
    interval: base.price.interval,
    basePriceId: base.price.priceId,
    additionalSiteQuantity: addon ? addon.quantity : 0,
  };
}

function classifySelfServeShape(
  items: readonly ClassifiedItem[]
): ClassifiedSubscriptionShape {
  if (items.length !== 1) {
    return {
      ok: false,
      code: "subscription_shape_invalid",
      reason: "self_serve_shape",
    };
  }
  const item = items[0];
  if (
    !item?.price ||
    item.price.role !== "BASE_PLAN" ||
    item.price.plan === "GROUP" ||
    item.quantity !== 1
  ) {
    return {
      ok: false,
      code: "subscription_shape_invalid",
      reason: "self_serve_shape",
    };
  }
  return {
    ok: true,
    kind: "self_serve",
    plan: item.price.plan,
    interval: item.price.interval,
    priceId: item.price.priceId,
  };
}

function classifyItem(item: SubscriptionItemShape, env: Env): ClassifiedItem {
  const priceId = item.priceId?.trim?.() ?? "";
  if (!priceId) {
    return { priceId: item.priceId, quantity: item.quantity, price: null };
  }
  try {
    return {
      priceId,
      quantity: item.quantity,
      price: classifyConfiguredStripePrice(priceId, env),
    };
  } catch (error) {
    if (error instanceof UnknownStripePriceError) {
      return { priceId, quantity: item.quantity, price: null };
    }
    throw error;
  }
}

function isGroupPrice(price: ClassifiedItem["price"]): boolean {
  if (!price) {
    return false;
  }
  return (
    (price.role === "BASE_PLAN" && price.plan === "GROUP") ||
    price.role === "GROUP_SITE_ADDON"
  );
}

function isFiniteInteger(quantity: number): boolean {
  return typeof quantity === "number" && Number.isInteger(quantity);
}

function groupFailure(
  reason: GroupShapeRejection
): ClassifiedSubscriptionShape {
  return {
    ok: false,
    code: GROUP_SUBSCRIPTION_SHAPE_FAILURE_CODE,
    reason,
  };
}
