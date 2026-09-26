/**
 * Derived Practice location capacity.
 *
 * Practice includes 1 Clinic Site and 1 Location.
 * Each purchased Additional Location adds one physical Location.
 * The shared complimentary location extra adds independently.
 * Additional Locations never add a Clinic Site.
 *
 * `purchasedAdditionalLocationQuantity === null` means the account has not
 * been configured under this model. Stored locationAllowance stays effective
 * until an explicit configuration records the purchased quantity, including
 * zero. Historical totals are not inferred as paid quantity or as extras.
 */

export const PRACTICE_BASE_SITE_ALLOWANCE = 1;
export const PRACTICE_BASE_LOCATION_ALLOWANCE = 1;

export function practiceEffectiveAllowances(input: {
  purchasedAdditionalLocationQuantity: number;
  extraLocationAllowance: number;
}): { siteAllowance: number; locationAllowance: number } {
  return {
    siteAllowance: PRACTICE_BASE_SITE_ALLOWANCE,
    locationAllowance:
      PRACTICE_BASE_LOCATION_ALLOWANCE +
      input.purchasedAdditionalLocationQuantity +
      input.extraLocationAllowance,
  };
}

export function practiceCapacityIsDerived(input: {
  commercialPlan: string | null;
  capacityEntitlementActive?: boolean;
  purchasedAdditionalLocationQuantity: number | null | undefined;
  extraLocationAllowance: number | null | undefined;
}): boolean {
  if (input.commercialPlan !== "PRACTICE") {
    return false;
  }
  if (!input.capacityEntitlementActive) {
    return false;
  }
  if (
    input.purchasedAdditionalLocationQuantity === null ||
    input.purchasedAdditionalLocationQuantity === undefined
  ) {
    return false;
  }
  return (
    isNonNegativeInteger(input.purchasedAdditionalLocationQuantity) &&
    isNonNegativeInteger(input.extraLocationAllowance ?? 0)
  );
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}
