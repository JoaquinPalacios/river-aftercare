import { describe, expect, it } from "vitest";

import { cataloguePriceIdsForSubscription } from "@/lib/billing/notices/load";
import {
  StripePriceMappingError,
  UnknownStripePriceError,
  buildStripePriceMap,
  classifyConfiguredStripePrice,
  lookupStripePriceId,
  planFromStripePriceId,
  recognizedBasePriceIds,
  stripeGroupBasePriceId,
  stripePriceIdForPlan,
} from "@/lib/billing/price-map";
import {
  BILLING_TEST_ENV,
  GROUP_BILLING_TEST_ENV,
  PRACTICE_LOCATION_BILLING_TEST_ENV,
} from "./helpers/billing";

describe("Stripe Price catalogue mapping", () => {
  it("maps Essential and Practice monthly and yearly to configured Price IDs", () => {
    expect(stripePriceIdForPlan("ESSENTIAL", "MONTHLY", BILLING_TEST_ENV)).toBe(
      "price_test_essential_monthly"
    );
    expect(stripePriceIdForPlan("ESSENTIAL", "YEARLY", BILLING_TEST_ENV)).toBe(
      "price_test_essential_yearly"
    );
    expect(stripePriceIdForPlan("PRACTICE", "MONTHLY", BILLING_TEST_ENV)).toBe(
      "price_test_practice_monthly"
    );
    expect(stripePriceIdForPlan("PRACTICE", "YEARLY", BILLING_TEST_ENV)).toBe(
      "price_test_practice_yearly"
    );
  });

  it("reverses Price IDs to plan and interval", () => {
    expect(
      planFromStripePriceId("price_test_practice_yearly", BILLING_TEST_ENV)
    ).toEqual({ plan: "PRACTICE", interval: "YEARLY" });
    expect(
      planFromStripePriceId("price_test_essential_monthly", BILLING_TEST_ENV)
    ).toEqual({ plan: "ESSENTIAL", interval: "MONTHLY" });
  });

  it("rejects unknown Price IDs", () => {
    expect(() =>
      planFromStripePriceId("price_unknown", BILLING_TEST_ENV)
    ).toThrow(UnknownStripePriceError);
    expect(lookupStripePriceId("price_unknown", BILLING_TEST_ENV)).toEqual({
      kind: "unknown",
      stripePriceId: "price_unknown",
    });
  });

  it("does not map Group and does not infer from amount or name", () => {
    const map = buildStripePriceMap(BILLING_TEST_ENV);
    expect(
      Object.keys(map.bySlot).some((slot) => slot.startsWith("GROUP:"))
    ).toBe(false);
    expect(
      lookupStripePriceId("price_group_custom", BILLING_TEST_ENV).kind
    ).toBe("unknown");
    expect(
      lookupStripePriceId("River Aftercare Essential", BILLING_TEST_ENV).kind
    ).toBe("unknown");
    expect(lookupStripePriceId("7900", BILLING_TEST_ENV).kind).toBe("unknown");
  });

  it("recognises a retired Price without using it for new Checkout", () => {
    const env = {
      ...BILLING_TEST_ENV,
      STRIPE_ESSENTIAL_MONTHLY_LEGACY_PRICE_IDS:
        "price_legacy_essential_monthly",
    };
    expect(stripePriceIdForPlan("ESSENTIAL", "MONTHLY", env)).toBe(
      "price_test_essential_monthly"
    );
    expect(
      planFromStripePriceId("price_legacy_essential_monthly", env)
    ).toEqual({ plan: "ESSENTIAL", interval: "MONTHLY" });
    expect(recognizedBasePriceIds("ESSENTIAL", "MONTHLY", env)).toEqual([
      "price_test_essential_monthly",
      "price_legacy_essential_monthly",
    ]);
    expect(lookupStripePriceId("price_legacy_essential_monthly", env)).toEqual({
      kind: "mapped",
      plan: "ESSENTIAL",
      interval: "MONTHLY",
    });
  });

  it("recognises a retired additional-location Price without selecting it as current", () => {
    const env = {
      ...PRACTICE_LOCATION_BILLING_TEST_ENV,
      STRIPE_PRACTICE_ADDITIONAL_LOCATION_MONTHLY_LEGACY_PRICE_IDS:
        "price_legacy_practice_location_monthly",
    };
    expect(
      classifyConfiguredStripePrice(
        "price_legacy_practice_location_monthly",
        env
      )
    ).toEqual({
      role: "PRACTICE_LOCATION_ADDON",
      interval: "MONTHLY",
      priceId: "price_legacy_practice_location_monthly",
    });
    expect(
      classifyConfiguredStripePrice("price_test_practice_location_monthly", env)
        .priceId
    ).toBe("price_test_practice_location_monthly");
    expect(
      cataloguePriceIdsForSubscription("PRACTICE", "MONTHLY", env)
    ).toEqual({
      catalogueBasePriceId: "price_test_practice_monthly",
      catalogueAddonPriceId: "price_test_practice_location_monthly",
    });
    expect(() =>
      planFromStripePriceId("price_legacy_practice_location_monthly", env)
    ).toThrow(UnknownStripePriceError);
    expect(stripePriceIdForPlan("PRACTICE", "MONTHLY", env)).toBe(
      "price_test_practice_monthly"
    );
  });

  it("keeps a retired additional-location Price recognisable when the current Price is unset", () => {
    const env = {
      ...BILLING_TEST_ENV,
      STRIPE_PRACTICE_ADDITIONAL_LOCATION_YEARLY_LEGACY_PRICE_IDS:
        "price_legacy_practice_location_yearly",
    };
    expect(
      classifyConfiguredStripePrice(
        "price_legacy_practice_location_yearly",
        env
      )
    ).toEqual({
      role: "PRACTICE_LOCATION_ADDON",
      interval: "YEARLY",
      priceId: "price_legacy_practice_location_yearly",
    });
    expect(
      cataloguePriceIdsForSubscription("PRACTICE", "YEARLY", env)
        .catalogueAddonPriceId
    ).toBeNull();
  });

  it("recognises a retired Group base Price without using it for Checkout", () => {
    const env = {
      ...GROUP_BILLING_TEST_ENV,
      STRIPE_GROUP_MONTHLY_LEGACY_PRICE_IDS: "price_legacy_group_monthly",
    };
    expect(stripeGroupBasePriceId("MONTHLY", env)).toBe(
      "price_test_group_monthly"
    );
    expect(
      classifyConfiguredStripePrice("price_legacy_group_monthly", env)
    ).toEqual({
      role: "BASE_PLAN",
      plan: "GROUP",
      interval: "MONTHLY",
      priceId: "price_legacy_group_monthly",
    });
    expect(cataloguePriceIdsForSubscription("GROUP", "MONTHLY", env)).toEqual({
      catalogueBasePriceId: "price_test_group_monthly",
      catalogueAddonPriceId: "price_test_group_site_monthly",
    });
    expect(() =>
      planFromStripePriceId("price_legacy_group_monthly", env)
    ).toThrow(UnknownStripePriceError);
  });

  it("rejects a legacy additional-location Price id that repeats the current Price id", () => {
    expect(() =>
      buildStripePriceMap({
        ...PRACTICE_LOCATION_BILLING_TEST_ENV,
        STRIPE_PRACTICE_ADDITIONAL_LOCATION_MONTHLY_LEGACY_PRICE_IDS:
          PRACTICE_LOCATION_BILLING_TEST_ENV.STRIPE_PRACTICE_ADDITIONAL_LOCATION_MONTHLY_PRICE_ID,
      })
    ).toThrow(StripePriceMappingError);
  });

  it("rejects a malformed additional-location legacy list", () => {
    expect(() =>
      buildStripePriceMap({
        ...BILLING_TEST_ENV,
        STRIPE_PRACTICE_ADDITIONAL_LOCATION_YEARLY_LEGACY_PRICE_IDS:
          "not-a-price",
      })
    ).toThrow(/Legacy Stripe Price/i);
  });

  it("rejects a legacy Price id that repeats the current Price id", () => {
    expect(() =>
      buildStripePriceMap({
        ...BILLING_TEST_ENV,
        STRIPE_ESSENTIAL_MONTHLY_LEGACY_PRICE_IDS:
          BILLING_TEST_ENV.STRIPE_ESSENTIAL_MONTHLY_PRICE_ID,
      })
    ).toThrow(/unique/i);
  });

  it("rejects duplicate configured Price IDs", () => {
    expect(() =>
      buildStripePriceMap({
        ...BILLING_TEST_ENV,
        STRIPE_PRACTICE_MONTHLY_PRICE_ID: "price_test_essential_monthly",
      })
    ).toThrow(/unique/i);
  });
});
