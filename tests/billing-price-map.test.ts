import { describe, expect, it } from "vitest";

import {
  UnknownStripePriceError,
  buildStripePriceMap,
  lookupStripePriceId,
  planFromStripePriceId,
  stripePriceIdForPlan,
} from "@/lib/billing/price-map";
import { BILLING_TEST_ENV } from "./helpers/billing";

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

  it("rejects duplicate configured Price IDs", () => {
    expect(() =>
      buildStripePriceMap({
        ...BILLING_TEST_ENV,
        STRIPE_PRACTICE_MONTHLY_PRICE_ID: "price_test_essential_monthly",
      })
    ).toThrow(/unique/i);
  });
});
