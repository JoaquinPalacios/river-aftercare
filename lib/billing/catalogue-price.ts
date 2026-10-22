import "server-only";

import {
  GROUP_ADDITIONAL_SITE_MONTHLY_CENTS,
  GROUP_ADDITIONAL_SITE_YEARLY_CENTS,
  GROUP_BASE_MONTHLY_CENTS,
  GROUP_BASE_YEARLY_CENTS,
} from "@/lib/clinics/group-commercial";
import { PLAN_PRICES } from "@/lib/marketing/plans";

import type {
  BillingIntervalCode,
  CommercialPlanCode,
} from "@/lib/billing/price-map";

export function audDollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export const ESSENTIAL_MONTHLY_CENTS = audDollarsToCents(
  PLAN_PRICES.essential.monthlyAudInclGst
);
export const ESSENTIAL_YEARLY_CENTS = audDollarsToCents(
  PLAN_PRICES.essential.annualAudInclGst
);
export const PRACTICE_MONTHLY_CENTS = audDollarsToCents(
  PLAN_PRICES.practice.monthlyAudInclGst
);
export const PRACTICE_YEARLY_CENTS = audDollarsToCents(
  PLAN_PRICES.practice.annualAudInclGst
);

export type CatalogueBasePlan = CommercialPlanCode;

export function catalogueBaseUnitAmountCents(
  plan: CatalogueBasePlan,
  interval: BillingIntervalCode
): number {
  if (plan === "ESSENTIAL") {
    return interval === "YEARLY"
      ? ESSENTIAL_YEARLY_CENTS
      : ESSENTIAL_MONTHLY_CENTS;
  }
  if (plan === "PRACTICE") {
    return interval === "YEARLY"
      ? PRACTICE_YEARLY_CENTS
      : PRACTICE_MONTHLY_CENTS;
  }
  return interval === "YEARLY"
    ? GROUP_BASE_YEARLY_CENTS
    : GROUP_BASE_MONTHLY_CENTS;
}

export function catalogueGroupSiteUnitAmountCents(
  interval: BillingIntervalCode
): number {
  return interval === "YEARLY"
    ? GROUP_ADDITIONAL_SITE_YEARLY_CENTS
    : GROUP_ADDITIONAL_SITE_MONTHLY_CENTS;
}

/**
 * Fields Checkout reads from a Stripe Price. Graduated add-on Prices are not
 * described here; they have no single unit amount.
 *
 * Stripe's `unit_amount_decimal` is a Decimal object, not a string.
 * Checkout passes the retrieved Price through, so this field accepts both.
 */
export type CatalogueUnitAmountDecimal =
  string | number | { toString(): string } | null;

export type RetrievedCataloguePrice = {
  active?: boolean | null;
  currency?: string | null;
  unit_amount?: number | null;
  unit_amount_decimal?: CatalogueUnitAmountDecimal;
  type?: string | null;
  tax_behavior?: string | null;
  billing_scheme?: string | null;
  recurring?: {
    interval?: string | null;
    interval_count?: number | null;
  } | null;
};

const STRIPE_INTERVAL: Record<BillingIntervalCode, "month" | "year"> = {
  MONTHLY: "month",
  YEARLY: "year",
};

/**
 * A configured catalogue Price may be charged only when Stripe's amount,
 * currency, interval, and tax behaviour match the advertised catalogue.
 * `tax_behavior: inclusive` is rejected. River Aftercare is not registering
 * for GST and does not mark Prices tax inclusive.
 */
export function cataloguePriceMismatchReason(
  expectedCents: number,
  interval: BillingIntervalCode,
  price: RetrievedCataloguePrice
): string | null {
  if (price.active === false) {
    return "inactive";
  }
  if ((price.currency ?? "").toLowerCase() !== "aud") {
    return "currency";
  }
  if (price.type && price.type !== "recurring") {
    return "type";
  }
  if (price.billing_scheme && price.billing_scheme !== "per_unit") {
    return "billing_scheme";
  }
  if (price.tax_behavior === "inclusive") {
    return "tax_behavior";
  }
  if (price.unit_amount !== expectedCents) {
    return "amount";
  }
  const decimalCents = catalogueUnitAmountDecimalCents(
    price.unit_amount_decimal
  );
  if (decimalCents != null && decimalCents !== expectedCents) {
    return "amount";
  }
  if (price.recurring?.interval !== STRIPE_INTERVAL[interval]) {
    return "interval";
  }
  if (
    price.recurring.interval_count != null &&
    price.recurring.interval_count !== 1
  ) {
    return "interval_count";
  }
  return null;
}

function catalogueUnitAmountDecimalCents(
  value: CatalogueUnitAmountDecimal | undefined
): number | null {
  if (value == null || value === "") {
    return null;
  }
  const raw = String(value);
  if (!/^\d+(?:\.\d+)?$/.test(raw)) {
    return Number.NaN;
  }
  return Number(raw);
}
