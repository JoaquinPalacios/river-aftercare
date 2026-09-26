import { describe, expect, it } from "vitest";

import {
  UnknownStripePriceError,
  buildStripePriceMap,
  classifyConfiguredStripePrice,
  groupBillingAvailable,
  lookupStripePriceId,
  planFromStripePriceId,
  stripePriceIdForPlan,
} from "@/lib/billing/price-map";
import { BILLING_TEST_ENV, GROUP_BILLING_TEST_ENV } from "./helpers/billing";

const EIGHT_PRICE_IDS = [
  GROUP_BILLING_TEST_ENV.STRIPE_ESSENTIAL_MONTHLY_PRICE_ID,
  GROUP_BILLING_TEST_ENV.STRIPE_ESSENTIAL_YEARLY_PRICE_ID,
  GROUP_BILLING_TEST_ENV.STRIPE_PRACTICE_MONTHLY_PRICE_ID,
  GROUP_BILLING_TEST_ENV.STRIPE_PRACTICE_YEARLY_PRICE_ID,
  GROUP_BILLING_TEST_ENV.STRIPE_GROUP_MONTHLY_PRICE_ID,
  GROUP_BILLING_TEST_ENV.STRIPE_GROUP_YEARLY_PRICE_ID,
  GROUP_BILLING_TEST_ENV.STRIPE_GROUP_ADDITIONAL_SITE_MONTHLY_PRICE_ID,
  GROUP_BILLING_TEST_ENV.STRIPE_GROUP_ADDITIONAL_SITE_YEARLY_PRICE_ID,
];

describe("Group Stripe catalogue", () => {
  it("keeps all eight configured Price IDs unique", () => {
    expect(new Set(EIGHT_PRICE_IDS).size).toBe(8);
    expect(groupBillingAvailable(GROUP_BILLING_TEST_ENV)).toBe(true);
    expect(
      stripePriceIdForPlan("ESSENTIAL", "MONTHLY", GROUP_BILLING_TEST_ENV)
    ).toBe("price_test_essential_monthly");
  });

  it("classifies Group monthly and yearly base prices", () => {
    expect(
      classifyConfiguredStripePrice(
        "price_test_group_monthly",
        GROUP_BILLING_TEST_ENV
      )
    ).toEqual({
      role: "BASE_PLAN",
      plan: "GROUP",
      interval: "MONTHLY",
      priceId: "price_test_group_monthly",
    });
    expect(
      classifyConfiguredStripePrice(
        "price_test_group_yearly",
        GROUP_BILLING_TEST_ENV
      )
    ).toEqual({
      role: "BASE_PLAN",
      plan: "GROUP",
      interval: "YEARLY",
      priceId: "price_test_group_yearly",
    });
  });

  it("classifies monthly and yearly Additional Site prices as add-ons", () => {
    const monthly = classifyConfiguredStripePrice(
      "price_test_group_site_monthly",
      GROUP_BILLING_TEST_ENV
    );
    const yearly = classifyConfiguredStripePrice(
      "price_test_group_site_yearly",
      GROUP_BILLING_TEST_ENV
    );
    expect(monthly).toEqual({
      role: "GROUP_SITE_ADDON",
      interval: "MONTHLY",
      priceId: "price_test_group_site_monthly",
    });
    expect(yearly).toEqual({
      role: "GROUP_SITE_ADDON",
      interval: "YEARLY",
      priceId: "price_test_group_site_yearly",
    });
    expect(monthly).not.toHaveProperty("plan");
    expect(yearly).not.toHaveProperty("plan");
  });

  it("does not treat an add-on Price as a self-serve CommercialPlan", () => {
    expect(() =>
      planFromStripePriceId(
        "price_test_group_site_monthly",
        GROUP_BILLING_TEST_ENV
      )
    ).toThrow(UnknownStripePriceError);
    expect(
      lookupStripePriceId("price_test_group_monthly", GROUP_BILLING_TEST_ENV)
    ).toEqual({
      kind: "unknown",
      stripePriceId: "price_test_group_monthly",
    });
    expect(
      buildStripePriceMap(GROUP_BILLING_TEST_ENV).bySlot
    ).not.toHaveProperty("GROUP:MONTHLY");
  });

  it("leaves Essential and Practice operational when Group prices are missing", () => {
    expect(groupBillingAvailable(BILLING_TEST_ENV)).toBe(false);
    expect(buildStripePriceMap(BILLING_TEST_ENV).bySlot).toEqual({
      "ESSENTIAL:MONTHLY": "price_test_essential_monthly",
      "ESSENTIAL:YEARLY": "price_test_essential_yearly",
      "PRACTICE:MONTHLY": "price_test_practice_monthly",
      "PRACTICE:YEARLY": "price_test_practice_yearly",
    });
    expect(
      classifyConfiguredStripePrice(
        "price_test_practice_yearly",
        BILLING_TEST_ENV
      )
    ).toEqual({
      role: "BASE_PLAN",
      plan: "PRACTICE",
      interval: "YEARLY",
      priceId: "price_test_practice_yearly",
    });
  });

  it.each([
    ["STRIPE_GROUP_MONTHLY_PRICE_ID", "price_test_essential_monthly"],
    ["STRIPE_GROUP_YEARLY_PRICE_ID", "price_test_practice_yearly"],
    [
      "STRIPE_GROUP_ADDITIONAL_SITE_MONTHLY_PRICE_ID",
      "price_test_group_monthly",
    ],
    [
      "STRIPE_GROUP_ADDITIONAL_SITE_YEARLY_PRICE_ID",
      "price_test_essential_yearly",
    ],
    ["STRIPE_GROUP_YEARLY_PRICE_ID", "price_test_group_monthly"],
  ] as const)("rejects duplicate Price ID %s", (envKey, priceId) => {
    expect(() =>
      buildStripePriceMap({
        ...GROUP_BILLING_TEST_ENV,
        [envKey]: priceId,
      })
    ).toThrow(/unique/i);
  });

  it("rejects an unknown Price", () => {
    expect(() =>
      classifyConfiguredStripePrice("price_unknown", GROUP_BILLING_TEST_ENV)
    ).toThrow(UnknownStripePriceError);
    expect(
      lookupStripePriceId("price_unknown", GROUP_BILLING_TEST_ENV)
    ).toEqual({
      kind: "unknown",
      stripePriceId: "price_unknown",
    });
  });
});
