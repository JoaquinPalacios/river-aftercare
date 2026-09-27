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

export type PracticeCapacityFacts = {
  purchasedAdditionalLocationQuantity: number;
  extraLocationAllowance: number;
  siteAllowance: number;
  locationAllowance: number;
};

/**
 * One Practice capacity decision for a write.
 *
 * `purchasedAdditionalLocationQuantity` must already be an explicit
 * non-negative integer. This helper does not turn null into 0 and does not
 * infer N or complimentary extras from a stored location total.
 *
 * While the entitlement is not ACTIVE, stored site and location totals stay
 * as they are. While it is ACTIVE, the derived totals are the only ones to
 * persist: 1 site and `1 + N + extraLocationAllowance`.
 */
export function practiceCapacityPersistence(input: {
  capacityEntitlementActive: boolean;
  purchasedAdditionalLocationQuantity: number;
  extraLocationAllowance: number;
  siteAllowance: number;
  locationAllowance: number;
}): PracticeCapacityFacts {
  const extra = isNonNegativeInteger(input.extraLocationAllowance)
    ? input.extraLocationAllowance
    : 0;
  const purchased = input.purchasedAdditionalLocationQuantity;
  if (!input.capacityEntitlementActive) {
    return {
      purchasedAdditionalLocationQuantity: purchased,
      extraLocationAllowance: extra,
      siteAllowance: input.siteAllowance,
      locationAllowance: input.locationAllowance,
    };
  }
  const derived = practiceEffectiveAllowances({
    purchasedAdditionalLocationQuantity: purchased,
    extraLocationAllowance: extra,
  });
  return {
    purchasedAdditionalLocationQuantity: purchased,
    extraLocationAllowance: extra,
    siteAllowance: derived.siteAllowance,
    locationAllowance: derived.locationAllowance,
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
