import { describe, expect, it } from "vitest";

import {
  ESSENTIAL_MONTHLY_CENTS,
  ESSENTIAL_YEARLY_CENTS,
  PRACTICE_MONTHLY_CENTS,
  PRACTICE_YEARLY_CENTS,
  cataloguePriceMismatchReason,
} from "@/lib/billing/catalogue-price";
import { conformingCataloguePrice } from "./helpers/billing";

describe("catalogue price amounts", () => {
  it("charges 10 monthly payments for 12 months of access", () => {
    expect(ESSENTIAL_MONTHLY_CENTS).toBe(5_900);
    expect(ESSENTIAL_YEARLY_CENTS).toBe(59_000);
    expect(PRACTICE_MONTHLY_CENTS).toBe(12_900);
    expect(PRACTICE_YEARLY_CENTS).toBe(129_000);
    expect(ESSENTIAL_YEARLY_CENTS).toBe(ESSENTIAL_MONTHLY_CENTS * 10);
    expect(PRACTICE_YEARLY_CENTS).toBe(PRACTICE_MONTHLY_CENTS * 10);
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
