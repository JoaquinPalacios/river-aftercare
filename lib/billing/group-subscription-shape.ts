import "server-only";

import type { BillingIntervalCode } from "@/lib/billing/price-map";
import {
  GROUP_SUBSCRIPTION_SHAPE_FAILURE_CODE,
  GROUP_SUBSCRIPTION_SHAPE_LOG_EVENT,
  PRACTICE_SUBSCRIPTION_SHAPE_FAILURE_CODE,
  PRACTICE_SUBSCRIPTION_SHAPE_LOG_EVENT,
} from "@/lib/billing/group-billing-codes";
import {
  classifyConfiguredStripePrice,
  UnknownStripePriceError,
} from "@/lib/billing/price-map";

export {
  GROUP_SUBSCRIPTION_SHAPE_FAILURE_CODE,
  GROUP_SUBSCRIPTION_SHAPE_LOG_EVENT,
  PRACTICE_SUBSCRIPTION_SHAPE_FAILURE_CODE,
  PRACTICE_SUBSCRIPTION_SHAPE_LOG_EVENT,
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
  | "interval_mismatch";

export type PracticeShapeRejection =
  | "invalid_quantity"
  | "unknown_item"
  | "mixed_plan"
  | "addon_without_base"
  | "duplicate_base"
  | "duplicate_addon"
  | "base_quantity"
  | "addon_quantity"
  | "interval_mismatch";

export type ClassifiedSubscriptionShape =
  | {
      ok: true;
      kind: "self_serve";
      plan: "ESSENTIAL";
      interval: BillingIntervalCode;
      priceId: string;
    }
  | {
      ok: true;
      kind: "practice";
      plan: "PRACTICE";
      interval: BillingIntervalCode;
      basePriceId: string;
      additionalLocationQuantity: number;
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
      code: typeof PRACTICE_SUBSCRIPTION_SHAPE_FAILURE_CODE;
      reason: PracticeShapeRejection;
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
 * on item order. Essential is one base item at quantity 1. Practice is one
 * base item at quantity 1 plus an optional Additional Location quantity.
 * Webhook projection classifies the retrieved subscription items.
 * Checkout does not call this.
 */
export function classifySubscriptionShape(
  items: readonly SubscriptionItemShape[],
  env: Env = process.env
): ClassifiedSubscriptionShape {
  const classified = items.map((item) => classifyItem(item, env));
  const groupItems = classified.filter((item) => isGroupPrice(item.price));

  const practiceItems = classified.filter((item) =>
    isPracticePrice(item.price)
  );

  if (classified.some((item) => !isFiniteInteger(item.quantity))) {
    return quantityFailure(groupItems.length > 0, practiceItems.length > 0);
  }

  if (classified.some((item) => item.quantity < 0)) {
    return quantityFailure(groupItems.length > 0, practiceItems.length > 0);
  }

  if (classified.some((item) => item.price === null)) {
    if (groupItems.length > 0) {
      return groupFailure("unknown_item");
    }
    if (practiceItems.length > 0) {
      return practiceFailure("unknown_item");
    }
    return {
      ok: false,
      code: "subscription_shape_invalid",
      reason: "unknown_item",
    };
  }

  if (groupItems.length > 0) {
    return classifyGroupShape(classified);
  }

  if (practiceItems.length > 0) {
    return classifyPracticeShape(classified);
  }

  return classifySelfServeShape(classified);
}

function classifyGroupShape(
  items: readonly ClassifiedItem[]
): ClassifiedSubscriptionShape {
  const groupBases = items.filter(
    (item) => item.price?.role === "BASE_PLAN" && item.price.plan === "GROUP"
  );
  const addons = items.filter(
    (item) => item.price?.role === "GROUP_SITE_ADDON"
  );
  const foreign = items.filter(
    (item) =>
      !(item.price?.role === "BASE_PLAN" && item.price.plan === "GROUP") &&
      item.price?.role !== "GROUP_SITE_ADDON"
  );

  if (foreign.length > 0) {
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

  return {
    ok: true,
    kind: "group",
    plan: "GROUP",
    interval: base.price.interval,
    basePriceId: base.price.priceId,
    additionalSiteQuantity: addon ? addon.quantity : 0,
  };
}

function classifyPracticeShape(
  items: readonly ClassifiedItem[]
): ClassifiedSubscriptionShape {
  const practiceBases = items.filter(
    (item) => item.price?.role === "BASE_PLAN" && item.price.plan === "PRACTICE"
  );
  const addons = items.filter(
    (item) => item.price?.role === "PRACTICE_LOCATION_ADDON"
  );
  const otherItems = items.filter(
    (item) =>
      !(item.price?.role === "BASE_PLAN" && item.price.plan === "PRACTICE") &&
      item.price?.role !== "PRACTICE_LOCATION_ADDON"
  );

  if (otherItems.length > 0) {
    return practiceFailure("mixed_plan");
  }
  if (practiceBases.length === 0) {
    return practiceFailure("addon_without_base");
  }
  if (practiceBases.length > 1) {
    return practiceFailure("duplicate_base");
  }
  if (addons.length > 1) {
    return practiceFailure("duplicate_addon");
  }

  const base = practiceBases[0];
  if (!base?.price || base.price.role !== "BASE_PLAN") {
    return practiceFailure("addon_without_base");
  }
  if (base.quantity !== 1) {
    return practiceFailure("base_quantity");
  }

  const addon = addons[0];
  if (addon && addon.quantity < 1) {
    return practiceFailure("addon_quantity");
  }
  if (
    addon?.price?.role === "PRACTICE_LOCATION_ADDON" &&
    addon.price.interval !== base.price.interval
  ) {
    return practiceFailure("interval_mismatch");
  }

  return {
    ok: true,
    kind: "practice",
    plan: "PRACTICE",
    interval: base.price.interval,
    basePriceId: base.price.priceId,
    additionalLocationQuantity: addon ? addon.quantity : 0,
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
    item.price.plan !== "ESSENTIAL" ||
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

function isPracticePrice(price: ClassifiedItem["price"]): boolean {
  if (!price) {
    return false;
  }
  return (
    (price.role === "BASE_PLAN" && price.plan === "PRACTICE") ||
    price.role === "PRACTICE_LOCATION_ADDON"
  );
}

function quantityFailure(
  group: boolean,
  practice: boolean
): ClassifiedSubscriptionShape {
  if (group) {
    return groupFailure("invalid_quantity");
  }
  if (practice) {
    return practiceFailure("invalid_quantity");
  }
  return {
    ok: false,
    code: "subscription_shape_invalid",
    reason: "invalid_quantity",
  };
}

function practiceFailure(
  reason: PracticeShapeRejection
): ClassifiedSubscriptionShape {
  return {
    ok: false,
    code: PRACTICE_SUBSCRIPTION_SHAPE_FAILURE_CODE,
    reason,
  };
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
