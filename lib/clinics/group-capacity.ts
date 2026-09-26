/**
 * Derived Group site and location capacity.
 *
 * Included Group base is 2 Clinic Sites and 5 Locations.
 * Each purchased Additional Site bundle adds one site and one location.
 * Complimentary extras add independently and do not create a charge.
 *
 * `purchasedAdditionalSiteQuantity === null` means the account has not been
 * configured under this model. Stored siteAllowance and locationAllowance
 * stay the effective totals until an explicit configuration sets the
 * purchased quantity (including zero).
 *
 * Offered and scheduled quantities are not inputs. They do not grant capacity.
 */

export const GROUP_BASE_SITE_ALLOWANCE = 2;
export const GROUP_BASE_LOCATION_ALLOWANCE = 5;

export type GroupCapacityFacts = {
  purchasedAdditionalSiteQuantity: number;
  extraSiteAllowance: number;
  extraLocationAllowance: number;
  siteAllowance: number;
  locationAllowance: number;
};

export function groupEffectiveAllowances(input: {
  purchasedAdditionalSiteQuantity: number;
  extraSiteAllowance: number;
  extraLocationAllowance: number;
}): { siteAllowance: number; locationAllowance: number } {
  return {
    siteAllowance:
      GROUP_BASE_SITE_ALLOWANCE +
      input.purchasedAdditionalSiteQuantity +
      input.extraSiteAllowance,
    locationAllowance:
      GROUP_BASE_LOCATION_ALLOWANCE +
      input.purchasedAdditionalSiteQuantity +
      input.extraLocationAllowance,
  };
}

/**
 * One Group capacity decision for a write.
 *
 * Purchased quantity is preserved when it is already recorded. A null
 * purchased quantity becomes 0. Previous site and location totals are not
 * copied into complimentary extras and are not added to the purchased
 * quantity.
 *
 * While the entitlement is not ACTIVE, stored site and location totals are
 * left unchanged so an unpaid offer does not gain Group capacity.
 * While it is ACTIVE, this result is the only derived total to persist.
 */
export function groupCapacityPersistence(input: {
  capacityEntitlementActive: boolean;
  purchasedAdditionalSiteQuantity: number | null;
  extraSiteAllowance: number;
  extraLocationAllowance: number;
  siteAllowance: number;
  locationAllowance: number;
}): GroupCapacityFacts {
  const purchased = input.purchasedAdditionalSiteQuantity ?? 0;
  const derived = groupEffectiveAllowances({
    purchasedAdditionalSiteQuantity: purchased,
    extraSiteAllowance: input.extraSiteAllowance,
    extraLocationAllowance: input.extraLocationAllowance,
  });
  if (!input.capacityEntitlementActive) {
    return {
      purchasedAdditionalSiteQuantity: purchased,
      extraSiteAllowance: input.extraSiteAllowance,
      extraLocationAllowance: input.extraLocationAllowance,
      siteAllowance: input.siteAllowance,
      locationAllowance: input.locationAllowance,
    };
  }
  return {
    purchasedAdditionalSiteQuantity: purchased,
    extraSiteAllowance: input.extraSiteAllowance,
    extraLocationAllowance: input.extraLocationAllowance,
    siteAllowance: derived.siteAllowance,
    locationAllowance: derived.locationAllowance,
  };
}

export function groupCapacityIsDerived(input: {
  commercialPlan: string | null;
  capacityEntitlementActive?: boolean;
  purchasedAdditionalSiteQuantity: number | null | undefined;
  extraSiteAllowance: number | null | undefined;
  extraLocationAllowance: number | null | undefined;
}): boolean {
  if (input.commercialPlan !== "GROUP") {
    return false;
  }
  if (!input.capacityEntitlementActive) {
    return false;
  }
  if (
    input.purchasedAdditionalSiteQuantity === null ||
    input.purchasedAdditionalSiteQuantity === undefined
  ) {
    return false;
  }
  return (
    isNonNegativeInteger(input.purchasedAdditionalSiteQuantity) &&
    isNonNegativeInteger(input.extraSiteAllowance ?? 0) &&
    isNonNegativeInteger(input.extraLocationAllowance ?? 0)
  );
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}
