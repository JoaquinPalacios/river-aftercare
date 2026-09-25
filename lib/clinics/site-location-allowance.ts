import type { CommercialPlan } from "@prisma/client";

/**
 * Account site and location caps. Enforced by site-location-capacity.
 *
 * Essential is always one site and one location.
 * Practice is always one site; the location total may rise.
 * Group uses the operator-configured totals on ClinicEntitlement.
 * A missing entitlement row is 1 site and 1 location, never unlimited.
 * A stored allowance below 1 is treated as 1.
 *
 * Approved Group base, not a Stripe price: 2 sites and 5 locations.
 * A later site bundle adds one site and one location. It is not charged here.
 */
export const GROUP_BASE_SITE_ALLOWANCE = 2;
export const GROUP_BASE_LOCATION_ALLOWANCE = 5;
export const DEFAULT_SITE_ALLOWANCE = 1;
export const DEFAULT_LOCATION_ALLOWANCE = 1;

export type SiteLocationAllowance = {
  siteAllowance: number;
  locationAllowance: number;
};

export function effectiveSiteLocationAllowance(input: {
  entitlement: {
    commercialPlan: CommercialPlan | null;
    siteAllowance: number;
    locationAllowance: number;
  } | null;
}): SiteLocationAllowance {
  if (!input.entitlement) {
    return {
      siteAllowance: DEFAULT_SITE_ALLOWANCE,
      locationAllowance: DEFAULT_LOCATION_ALLOWANCE,
    };
  }

  const storedSites = normalizeAllowance(input.entitlement.siteAllowance);
  const storedLocations = normalizeAllowance(
    input.entitlement.locationAllowance
  );

  if (input.entitlement.commercialPlan === "GROUP") {
    return {
      siteAllowance: storedSites,
      locationAllowance: storedLocations,
    };
  }

  if (input.entitlement.commercialPlan === "PRACTICE") {
    return {
      siteAllowance: DEFAULT_SITE_ALLOWANCE,
      locationAllowance: storedLocations,
    };
  }

  return {
    siteAllowance: DEFAULT_SITE_ALLOWANCE,
    locationAllowance: DEFAULT_LOCATION_ALLOWANCE,
  };
}

function normalizeAllowance(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    return 1;
  }
  return value;
}
