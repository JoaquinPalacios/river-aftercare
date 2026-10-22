import { describe, expect, it } from "vitest";

import { cataloguePriceRejection } from "@/lib/billing/catalogue-price-check";
import {
  ESSENTIAL_MONTHLY_CENTS,
  ESSENTIAL_YEARLY_CENTS,
  PRACTICE_ADDITIONAL_LOCATION_MONTHLY_CENTS,
  PRACTICE_ADDITIONAL_LOCATION_YEARLY_CENTS,
  PRACTICE_MONTHLY_CENTS,
  PRACTICE_YEARLY_CENTS,
  catalogueBaseUnitAmountCents,
  catalogueGroupSiteUnitAmountCents,
  cataloguePracticeRecurringCents,
  cataloguePriceMismatchReason,
} from "@/lib/billing/catalogue-price";
import {
  GROUP_ADDITIONAL_SITE_MONTHLY_CENTS,
  GROUP_ADDITIONAL_SITE_YEARLY_CENTS,
} from "@/lib/clinics/group-commercial";
import {
  conformingCataloguePrice,
  GROUP_BILLING_TEST_ENV,
  PRACTICE_LOCATION_BILLING_TEST_ENV,
} from "./helpers/billing";

describe("catalogue price amounts", () => {
  it("charges 10 monthly payments for 12 months of access", () => {
    expect(ESSENTIAL_MONTHLY_CENTS).toBe(5_900);
    expect(ESSENTIAL_YEARLY_CENTS).toBe(59_000);
    expect(PRACTICE_MONTHLY_CENTS).toBe(12_900);
    expect(PRACTICE_YEARLY_CENTS).toBe(129_000);
    expect(ESSENTIAL_YEARLY_CENTS).toBe(ESSENTIAL_MONTHLY_CENTS * 10);
    expect(PRACTICE_YEARLY_CENTS).toBe(PRACTICE_MONTHLY_CENTS * 10);
    expect(PRACTICE_ADDITIONAL_LOCATION_MONTHLY_CENTS).toBe(5_900);
    expect(PRACTICE_ADDITIONAL_LOCATION_YEARLY_CENTS).toBe(59_000);
    expect(PRACTICE_ADDITIONAL_LOCATION_YEARLY_CENTS).toBe(
      PRACTICE_ADDITIONAL_LOCATION_MONTHLY_CENTS * 10
    );
    expect(cataloguePracticeRecurringCents("MONTHLY", 0)).toBe(
      PRACTICE_MONTHLY_CENTS
    );
    expect(cataloguePracticeRecurringCents("MONTHLY", 1)).toBe(
      PRACTICE_MONTHLY_CENTS + PRACTICE_ADDITIONAL_LOCATION_MONTHLY_CENTS
    );
    expect(cataloguePracticeRecurringCents("YEARLY", 3)).toBe(
      PRACTICE_YEARLY_CENTS + PRACTICE_ADDITIONAL_LOCATION_YEARLY_CENTS * 3
    );
    expect(cataloguePracticeRecurringCents("MONTHLY", 2)).not.toBe(
      PRACTICE_MONTHLY_CENTS + 7_900 + 5_900
    );
  });

  it("accepts an AUD exclusive recurring Price at the advertised amount", () => {
    expect(
      cataloguePriceMismatchReason(
        ESSENTIAL_MONTHLY_CENTS,
        "MONTHLY",
        conformingCataloguePrice("price_test_essential_monthly")
      )
    ).toBeNull();
  });

  it("rejects the previous Essential and Practice amounts", () => {
    expect(
      cataloguePriceMismatchReason(
        ESSENTIAL_MONTHLY_CENTS,
        "MONTHLY",
        conformingCataloguePrice("price_test_essential_monthly", {
          unit_amount: 7_900,
          unit_amount_decimal: "7900",
        })
      )
    ).toBe("amount");
    expect(
      cataloguePriceMismatchReason(
        PRACTICE_YEARLY_CENTS,
        "YEARLY",
        conformingCataloguePrice("price_test_practice_yearly", {
          unit_amount: 149_000,
          unit_amount_decimal: "149000",
        })
      )
    ).toBe("amount");
  });

  it("accepts Stripe's Decimal unit amount when it matches the catalogue", () => {
    expect(
      cataloguePriceMismatchReason(
        ESSENTIAL_MONTHLY_CENTS,
        "MONTHLY",
        conformingCataloguePrice("price_test_essential_monthly", {
          unit_amount_decimal: {
            toString() {
              return "5900.00";
            },
          },
        })
      )
    ).toBeNull();
    expect(
      cataloguePriceMismatchReason(
        ESSENTIAL_MONTHLY_CENTS,
        "MONTHLY",
        conformingCataloguePrice("price_test_essential_monthly", {
          unit_amount_decimal: {
            toString() {
              return "7900";
            },
          },
        })
      )
    ).toBe("amount");
  });

  it("expects Group base at A$399 and A$3,990 and leaves additional sites unchanged", async () => {
    expect(catalogueBaseUnitAmountCents("GROUP", "MONTHLY")).toBe(39_900);
    expect(catalogueBaseUnitAmountCents("GROUP", "YEARLY")).toBe(399_000);
    expect(catalogueBaseUnitAmountCents("GROUP", "YEARLY")).toBe(
      catalogueBaseUnitAmountCents("GROUP", "MONTHLY") * 10
    );
    expect(catalogueGroupSiteUnitAmountCents("MONTHLY")).toBe(
      GROUP_ADDITIONAL_SITE_MONTHLY_CENTS
    );
    expect(catalogueGroupSiteUnitAmountCents("YEARLY")).toBe(
      GROUP_ADDITIONAL_SITE_YEARLY_CENTS
    );
    expect(GROUP_ADDITIONAL_SITE_MONTHLY_CENTS).toBe(5_000);
    expect(GROUP_ADDITIONAL_SITE_YEARLY_CENTS).toBe(50_000);
    const priceId = GROUP_BILLING_TEST_ENV.STRIPE_GROUP_MONTHLY_PRICE_ID;
    await expect(
      cataloguePriceRejection({
        priceId,
        env: GROUP_BILLING_TEST_ENV,
        retrieve: async () => conformingCataloguePrice(priceId),
      })
    ).resolves.toBeNull();
    await expect(
      cataloguePriceRejection({
        priceId,
        env: GROUP_BILLING_TEST_ENV,
        retrieve: async () =>
          conformingCataloguePrice(priceId, {
            unit_amount: 44_900,
            unit_amount_decimal: "44900",
          }),
      })
    ).resolves.toBe("catalogue_price_mismatch_amount");
  });

  it("accepts the flat additional-location Price and refuses a graduated one", async () => {
    const priceId =
      PRACTICE_LOCATION_BILLING_TEST_ENV.STRIPE_PRACTICE_ADDITIONAL_LOCATION_MONTHLY_PRICE_ID;
    await expect(
      cataloguePriceRejection({
        priceId,
        env: PRACTICE_LOCATION_BILLING_TEST_ENV,
        retrieve: async () =>
          conformingCataloguePrice(priceId, {
            unit_amount: PRACTICE_ADDITIONAL_LOCATION_MONTHLY_CENTS,
            unit_amount_decimal: "5900",
            recurring: { interval: "month", interval_count: 1 },
          }),
      })
    ).resolves.toBeNull();
    await expect(
      cataloguePriceRejection({
        priceId,
        env: PRACTICE_LOCATION_BILLING_TEST_ENV,
        retrieve: async () =>
          conformingCataloguePrice(priceId, {
            billing_scheme: "tiered",
            unit_amount: null,
            unit_amount_decimal: null,
            recurring: { interval: "month", interval_count: 1 },
          }),
      })
    ).resolves.toBe("catalogue_price_mismatch_billing_scheme");
    await expect(
      cataloguePriceRejection({
        priceId,
        env: PRACTICE_LOCATION_BILLING_TEST_ENV,
        retrieve: async () =>
          conformingCataloguePrice(priceId, {
            unit_amount: 7_900,
            unit_amount_decimal: "7900",
            recurring: { interval: "month", interval_count: 1 },
          }),
      })
    ).resolves.toBe("catalogue_price_mismatch_amount");
  });

  it("rejects a tax-inclusive Price and a monthly interval on a yearly charge", () => {
    expect(
      cataloguePriceMismatchReason(
        ESSENTIAL_MONTHLY_CENTS,
        "MONTHLY",
        conformingCataloguePrice("price_test_essential_monthly", {
          tax_behavior: "inclusive",
        })
      )
    ).toBe("tax_behavior");
    expect(
      cataloguePriceMismatchReason(
        ESSENTIAL_YEARLY_CENTS,
        "YEARLY",
        conformingCataloguePrice("price_test_essential_yearly", {
          recurring: { interval: "month", interval_count: 1 },
        })
      )
    ).toBe("interval");
  });
});
