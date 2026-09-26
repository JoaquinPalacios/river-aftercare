import { describe, expect, it } from "vitest";

import { PRACTICE_SUBSCRIPTION_SHAPE_FAILURE_CODE } from "@/lib/billing/group-billing-codes";
import { GROUP_SUBSCRIPTION_SHAPE_FAILURE_CODE } from "@/lib/billing/group-billing-codes";
import { classifySubscriptionShape } from "@/lib/billing/group-subscription-shape";
import {
  GROUP_BILLING_TEST_ENV,
  PRACTICE_LOCATION_BILLING_TEST_ENV,
} from "./helpers/billing";

const ENV = {
  ...GROUP_BILLING_TEST_ENV,
  ...PRACTICE_LOCATION_BILLING_TEST_ENV,
};
const PRACTICE_MONTHLY = ENV.STRIPE_PRACTICE_MONTHLY_PRICE_ID;
const PRACTICE_YEARLY = ENV.STRIPE_PRACTICE_YEARLY_PRICE_ID;
const LOCATION_MONTHLY =
  ENV.STRIPE_PRACTICE_ADDITIONAL_LOCATION_MONTHLY_PRICE_ID;
const LOCATION_YEARLY = ENV.STRIPE_PRACTICE_ADDITIONAL_LOCATION_YEARLY_PRICE_ID;
const ESSENTIAL_MONTHLY = ENV.STRIPE_ESSENTIAL_MONTHLY_PRICE_ID;
const GROUP_MONTHLY = ENV.STRIPE_GROUP_MONTHLY_PRICE_ID;
const GROUP_ADDON = ENV.STRIPE_GROUP_ADDITIONAL_SITE_MONTHLY_PRICE_ID;

function item(priceId: string, quantity: number) {
  return { priceId, quantity };
}

function practice(
  interval: "MONTHLY" | "YEARLY",
  quantity: number,
  items: Array<{ priceId: string; quantity: number }> = []
) {
  const base = interval === "MONTHLY" ? PRACTICE_MONTHLY : PRACTICE_YEARLY;
  return classifySubscriptionShape([item(base, 1), ...items], ENV);
}

describe("Practice subscription shape", () => {
  it("classifies a monthly or yearly base with no add-on as N=0", () => {
    expect(practice("MONTHLY", 0)).toEqual({
      ok: true,
      kind: "practice",
      plan: "PRACTICE",
      interval: "MONTHLY",
      basePriceId: PRACTICE_MONTHLY,
      additionalLocationQuantity: 0,
    });
    expect(
      classifySubscriptionShape([item(PRACTICE_YEARLY, 1)], ENV)
    ).toMatchObject({
      ok: true,
      kind: "practice",
      interval: "YEARLY",
      additionalLocationQuantity: 0,
    });
  });

  it("classifies a matching location add-on quantity, including reversed order", () => {
    expect(
      classifySubscriptionShape(
        [item(PRACTICE_MONTHLY, 1), item(LOCATION_MONTHLY, 1)],
        ENV
      )
    ).toMatchObject({ ok: true, additionalLocationQuantity: 1 });
    expect(
      classifySubscriptionShape(
        [item(LOCATION_MONTHLY, 3), item(PRACTICE_MONTHLY, 1)],
        ENV
      )
    ).toMatchObject({
      ok: true,
      interval: "MONTHLY",
      additionalLocationQuantity: 3,
    });
    expect(
      classifySubscriptionShape(
        [item(LOCATION_YEARLY, 2), item(PRACTICE_YEARLY, 1)],
        ENV
      )
    ).toMatchObject({
      ok: true,
      interval: "YEARLY",
      additionalLocationQuantity: 2,
    });
  });

  it.each([
    [
      "duplicate base",
      [item(PRACTICE_MONTHLY, 1), item(PRACTICE_MONTHLY, 1)],
      "duplicate_base",
    ],
    [
      "duplicate add-on",
      [
        item(PRACTICE_MONTHLY, 1),
        item(LOCATION_MONTHLY, 1),
        item(LOCATION_MONTHLY, 2),
      ],
      "duplicate_addon",
    ],
    ["add-on without base", [item(LOCATION_MONTHLY, 1)], "addon_without_base"],
    [
      "group add-on",
      [item(PRACTICE_MONTHLY, 1), item(GROUP_ADDON, 1)],
      "mixed_plan",
    ],
    [
      "group base",
      [item(PRACTICE_MONTHLY, 1), item(GROUP_MONTHLY, 1)],
      "mixed_plan",
    ],
    [
      "interval mismatch",
      [item(PRACTICE_MONTHLY, 1), item(LOCATION_YEARLY, 1)],
      "interval_mismatch",
    ],
    [
      "unknown item",
      [item(PRACTICE_MONTHLY, 1), item("price_unknown", 1)],
      "unknown_item",
    ],
    ["base quantity", [item(PRACTICE_MONTHLY, 2)], "base_quantity"],
    [
      "add-on quantity 0",
      [item(PRACTICE_MONTHLY, 1), item(LOCATION_MONTHLY, 0)],
      "addon_quantity",
    ],
    [
      "negative quantity",
      [item(PRACTICE_MONTHLY, 1), item(LOCATION_MONTHLY, -1)],
      "invalid_quantity",
    ],
    ["fractional quantity", [item(PRACTICE_MONTHLY, 1.5)], "invalid_quantity"],
    [
      "essential mix",
      [item(PRACTICE_MONTHLY, 1), item(ESSENTIAL_MONTHLY, 1)],
      "mixed_plan",
    ],
  ] as const)("rejects %s", (_label, items, reason) => {
    const result = classifySubscriptionShape(items, ENV);
    if (
      reason === "mixed_plan" &&
      items.some((entry) => entry.priceId.startsWith("price_test_group"))
    ) {
      expect(result).toEqual({
        ok: false,
        code: GROUP_SUBSCRIPTION_SHAPE_FAILURE_CODE,
        reason: "mixed_plan",
      });
      return;
    }
    expect(result).toEqual({
      ok: false,
      code: PRACTICE_SUBSCRIPTION_SHAPE_FAILURE_CODE,
      reason,
    });
  });
});
