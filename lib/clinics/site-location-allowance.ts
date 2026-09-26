import type { CommercialPlan } from "@prisma/client";

import {
  GROUP_BASE_LOCATION_ALLOWANCE,
  GROUP_BASE_SITE_ALLOWANCE,
  groupCapacityIsDerived,
  groupEffectiveAllowances,
} from "@/lib/clinics/group-capacity";

export { GROUP_BASE_LOCATION_ALLOWANCE, GROUP_BASE_SITE_ALLOWANCE };

/**
 * Account site and location caps. Enforced by site-location-capacity.
 *
 * Essential is always one site and one location.
 * Practice is always one site; the location total may rise.
 * A missing entitlement row is 1 site and 1 location, never unlimited.
 * A stored allowance below 1 is treated as 1.
 *
 * Group capacity uses the derived model only when the entitlement is ACTIVE
 * and purchasedAdditionalSiteQuantity has been recorded, including zero.
 * Until that explicit configuration, stored totals remain in force.
 * A pending or unpaid Group offer does not receive the included 2/5.
 */
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
    capacityEntitlementActive?: boolean;
    purchasedAdditionalSiteQuantity?: number | null;
    extraSiteAllowance?: number | null;
    extraLocationAllowance?: number | null;
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

  if (
    groupCapacityIsDerived({
      commercialPlan: input.entitlement.commercialPlan,
      capacityEntitlementActive: input.entitlement.capacityEntitlementActive,
      purchasedAdditionalSiteQuantity:
        input.entitlement.purchasedAdditionalSiteQuantity,
      extraSiteAllowance: input.entitlement.extraSiteAllowance,
      extraLocationAllowance: input.entitlement.extraLocationAllowance,
    })
  ) {
    return groupEffectiveAllowances({
      purchasedAdditionalSiteQuantity:
        input.entitlement.purchasedAdditionalSiteQuantity ?? 0,
      extraSiteAllowance: input.entitlement.extraSiteAllowance ?? 0,
      extraLocationAllowance: input.entitlement.extraLocationAllowance ?? 0,
    });
  }

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
