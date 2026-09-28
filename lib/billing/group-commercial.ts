import {
  GROUP_BASE_LOCATION_ALLOWANCE,
  GROUP_BASE_SITE_ALLOWANCE,
  groupEffectiveAllowances,
} from "@/lib/clinics/group-capacity";
import { MAX_OPERATOR_EXTRA_ALLOWANCE } from "@/lib/entitlements/allowance-input";

/**
 * Operator-assisted Group commercial amounts in integer cents.
 * Public marketing does not import this module. Stripe remains the charge.
 */

export const GROUP_BASE_MONTHLY_CENTS = 44_900;
export const GROUP_BASE_YEARLY_CENTS = 449_000;
export const GROUP_ADDITIONAL_SITE_MONTHLY_CENTS = 5_000;
export const GROUP_ADDITIONAL_SITE_YEARLY_CENTS = 50_000;

export const GROUP_OFFER_QUANTITY_MESSAGE =
  "Enter a whole number of additional sites, zero or more.";

export function formatAudCents(cents: number): string {
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const dollars = Math.trunc(absolute / 100);
  const remainder = absolute % 100;
  const formatted = dollars.toLocaleString("en-AU");
  const body =
    remainder === 0
      ? formatted
      : `${formatted}.${String(remainder).padStart(2, "0")}`;
  return `${negative ? "-" : ""}A$${body}`;
}

export function parseOfferedAdditionalSiteQuantity(
  raw: unknown
): number | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value > MAX_OPERATOR_EXTRA_ALLOWANCE) {
    return null;
  }
  if (
    GROUP_BASE_LOCATION_ALLOWANCE + value > MAX_OPERATOR_EXTRA_ALLOWANCE ||
    GROUP_BASE_SITE_ALLOWANCE + value > MAX_OPERATOR_EXTRA_ALLOWANCE
  ) {
    return null;
  }
  return value;
}

export function isOfferedAdditionalSiteQuantity(
  value: number | null | undefined
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_OPERATOR_EXTRA_ALLOWANCE &&
    GROUP_BASE_LOCATION_ALLOWANCE + value <= MAX_OPERATOR_EXTRA_ALLOWANCE
  );
}

export type GroupOfferQuote = {
  interval: "MONTHLY" | "YEARLY";
  additionalSiteQuantity: number;
  cadence: "month" | "year";
  baseCents: number;
  addonUnitCents: number;
  addonCents: number;
  totalCents: number;
  sites: number;
  locations: number;
  planName: string;
  intervalLabel: string;
  priceLabel: string;
  annualNote: string | null;
  detailLines: readonly string[];
  capacityNote: string;
};

export function groupOfferQuote(input: {
  interval: "MONTHLY" | "YEARLY";
  additionalSiteQuantity: number;
}): GroupOfferQuote {
  const yearly = input.interval === "YEARLY";
  const baseCents = yearly ? GROUP_BASE_YEARLY_CENTS : GROUP_BASE_MONTHLY_CENTS;
  const addonUnitCents = yearly
    ? GROUP_ADDITIONAL_SITE_YEARLY_CENTS
    : GROUP_ADDITIONAL_SITE_MONTHLY_CENTS;
  const cadence = yearly ? "year" : "month";
  const addonCents = addonUnitCents * input.additionalSiteQuantity;
  const totalCents = baseCents + addonCents;
  const capacity = groupEffectiveAllowances({
    purchasedAdditionalSiteQuantity: input.additionalSiteQuantity,
    extraSiteAllowance: 0,
    extraLocationAllowance: 0,
  });
  const baseLabel = `${formatAudCents(baseCents)} / ${cadence}`;
  const totalLabel = `${formatAudCents(totalCents)} / ${cadence}`;
  const detailLines = [
    `Base: ${baseLabel}`,
    input.additionalSiteQuantity > 0
      ? `Additional Sites: ${input.additionalSiteQuantity} × ${formatAudCents(addonUnitCents)} / ${cadence}`
      : "Additional Sites: none",
    `Total: ${totalLabel}`,
    `Included: ${GROUP_BASE_SITE_ALLOWANCE} Clinic Sites and ${GROUP_BASE_LOCATION_ALLOWANCE} Locations`,
  ];
  return {
    interval: input.interval,
    additionalSiteQuantity: input.additionalSiteQuantity,
    cadence,
    baseCents,
    addonUnitCents,
    addonCents,
    totalCents,
    sites: capacity.siteAllowance,
    locations: capacity.locationAllowance,
    planName: "Group",
    intervalLabel: yearly ? "Annual" : "Monthly",
    priceLabel: totalLabel,
    annualNote: yearly ? "12 months for the price of 10" : null,
    detailLines,
    capacityNote: `Available after successful payment: ${capacity.siteAllowance} Sites / ${capacity.locationAllowance} Locations`,
  };
}
