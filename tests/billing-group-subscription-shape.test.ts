import { describe, expect, it } from "vitest";

import { GROUP_SUBSCRIPTION_SHAPE_FAILURE_CODE } from "@/lib/billing/group-billing-codes";
import { classifySubscriptionShape } from "@/lib/billing/group-subscription-shape";
import { OPERATIONAL_FAILURE_CODES } from "@/lib/observability/report-server-exception";
import { BILLING_TEST_ENV, GROUP_BILLING_TEST_ENV } from "./helpers/billing";

const GROUP_MONTHLY = GROUP_BILLING_TEST_ENV.STRIPE_GROUP_MONTHLY_PRICE_ID;
const GROUP_YEARLY = GROUP_BILLING_TEST_ENV.STRIPE_GROUP_YEARLY_PRICE_ID;
const ADDON_MONTHLY =
  GROUP_BILLING_TEST_ENV.STRIPE_GROUP_ADDITIONAL_SITE_MONTHLY_PRICE_ID;
const ADDON_YEARLY =
  GROUP_BILLING_TEST_ENV.STRIPE_GROUP_ADDITIONAL_SITE_YEARLY_PRICE_ID;
const ESSENTIAL_MONTHLY = BILLING_TEST_ENV.STRIPE_ESSENTIAL_MONTHLY_PRICE_ID;
const PRACTICE_YEARLY = BILLING_TEST_ENV.STRIPE_PRACTICE_YEARLY_PRICE_ID;

function item(priceId: string, quantity: number) {
  return { priceId, quantity };
}

describe("Group subscription shape", () => {
  it("classifies a monthly or yearly base with no add-on as N=0", () => {
    expect(
      classifySubscriptionShape(
        [item(GROUP_MONTHLY, 1)],
        GROUP_BILLING_TEST_ENV
      )
    ).toEqual({
      ok: true,
      kind: "group",
      plan: "GROUP",
      interval: "MONTHLY",
      basePriceId: GROUP_MONTHLY,
      additionalSiteQuantity: 0,
    });
    expect(
      classifySubscriptionShape([item(GROUP_YEARLY, 1)], GROUP_BILLING_TEST_ENV)
    ).toMatchObject({
      ok: true,
      interval: "YEARLY",
      basePriceId: GROUP_YEARLY,
      additionalSiteQuantity: 0,
    });
  });

  it("classifies a matching add-on quantity, including reversed item order", () => {
    expect(
      classifySubscriptionShape(
        [item(GROUP_MONTHLY, 1), item(ADDON_MONTHLY, 1)],
        GROUP_BILLING_TEST_ENV
      )
    ).toMatchObject({
      ok: true,
      additionalSiteQuantity: 1,
      interval: "MONTHLY",
    });
    expect(
      classifySubscriptionShape(
        [item(ADDON_MONTHLY, 4), item(GROUP_MONTHLY, 1)],
        GROUP_BILLING_TEST_ENV
      )
    ).toMatchObject({
      ok: true,
      additionalSiteQuantity: 4,
      basePriceId: GROUP_MONTHLY,
    });
    expect(
      classifySubscriptionShape(
        [item(ADDON_YEARLY, 3), item(GROUP_YEARLY, 1)],
        GROUP_BILLING_TEST_ENV
      )
    ).toMatchObject({
      ok: true,
      interval: "YEARLY",
      additionalSiteQuantity: 3,
    });
  });

  it.each([
    [
      "duplicate base",
      [item(GROUP_MONTHLY, 1), item(GROUP_YEARLY, 1)],
      "duplicate_base",
    ],
    [
      "duplicate add-on",
      [item(GROUP_MONTHLY, 1), item(ADDON_MONTHLY, 1), item(ADDON_MONTHLY, 2)],
      "duplicate_addon",
    ],
    ["add-on without base", [item(ADDON_MONTHLY, 1)], "addon_without_base"],
    [
      "Essential mixed in",
      [item(ESSENTIAL_MONTHLY, 1), item(GROUP_MONTHLY, 1)],
      "mixed_plan",
    ],
    [
      "Practice mixed in",
      [item(GROUP_YEARLY, 1), item(PRACTICE_YEARLY, 1)],
      "mixed_plan",
    ],
    [
      "interval mismatch",
      [item(GROUP_MONTHLY, 1), item(ADDON_YEARLY, 1)],
      "interval_mismatch",
    ],
    [
      "unknown item",
      [item(GROUP_MONTHLY, 1), item("price_unknown", 1)],
      "unknown_item",
    ],
    ["base quantity", [item(GROUP_MONTHLY, 2)], "base_quantity"],
    ["base quantity zero", [item(GROUP_MONTHLY, 0)], "base_quantity"],
    [
      "add-on quantity zero",
      [item(GROUP_MONTHLY, 1), item(ADDON_MONTHLY, 0)],
      "addon_quantity",
    ],
    [
      "negative quantity",
      [item(GROUP_MONTHLY, 1), item(ADDON_MONTHLY, -1)],
      "invalid_quantity",
    ],
    [
      "fractional quantity",
      [item(GROUP_YEARLY, 1), item(ADDON_YEARLY, 1.5)],
      "invalid_quantity",
    ],
  ] as const)("rejects %s", (_label, items, reason) => {
    expect(classifySubscriptionShape(items, GROUP_BILLING_TEST_ENV)).toEqual({
      ok: false,
      code: GROUP_SUBSCRIPTION_SHAPE_FAILURE_CODE,
      reason,
    });
  });

  it("uses the operational failure code prepared for malformed Group shapes", () => {
    expect(GROUP_SUBSCRIPTION_SHAPE_FAILURE_CODE).toBe(
      "group_subscription_shape_invalid"
    );
    expect(OPERATIONAL_FAILURE_CODES.GROUP_SUBSCRIPTION_SHAPE_INVALID).toBe(
      GROUP_SUBSCRIPTION_SHAPE_FAILURE_CODE
    );
  });

  it("keeps Essential and Practice as one item at quantity 1 when Group config is missing", () => {
    expect(
      classifySubscriptionShape([item(ESSENTIAL_MONTHLY, 1)], BILLING_TEST_ENV)
    ).toEqual({
      ok: true,
      kind: "self_serve",
      plan: "ESSENTIAL",
      interval: "MONTHLY",
      priceId: ESSENTIAL_MONTHLY,
    });
    expect(
      classifySubscriptionShape([item(PRACTICE_YEARLY, 1)], BILLING_TEST_ENV)
    ).toMatchObject({ ok: true, kind: "self_serve", plan: "PRACTICE" });
    expect(
      classifySubscriptionShape(
        [item(ESSENTIAL_MONTHLY, 1), item(ESSENTIAL_MONTHLY, 1)],
        GROUP_BILLING_TEST_ENV
      ).ok
    ).toBe(false);
    expect(
      classifySubscriptionShape(
        [item(ESSENTIAL_MONTHLY, 2)],
        GROUP_BILLING_TEST_ENV
      ).ok
    ).toBe(false);
    expect(
      classifySubscriptionShape([item(GROUP_MONTHLY, 1)], {
        ...BILLING_TEST_ENV,
        STRIPE_GROUP_MONTHLY_PRICE_ID: GROUP_MONTHLY,
      })
    ).toEqual({
      ok: false,
      code: GROUP_SUBSCRIPTION_SHAPE_FAILURE_CODE,
      reason: "group_billing_unavailable",
    });
  });
});
