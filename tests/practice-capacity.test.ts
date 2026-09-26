import { describe, expect, it } from "vitest";

import { effectiveSiteLocationAllowance } from "@/lib/clinics/site-location-allowance";
import { practiceEffectiveAllowances } from "@/lib/clinics/practice-capacity";

describe("Practice additional location capacity", () => {
  it("derives 1 site and 1 + N + complimentary locations", () => {
    expect(
      practiceEffectiveAllowances({
        purchasedAdditionalLocationQuantity: 0,
        extraLocationAllowance: 0,
      })
    ).toEqual({ siteAllowance: 1, locationAllowance: 1 });
    expect(
      effectiveSiteLocationAllowance({
        entitlement: {
          commercialPlan: "PRACTICE",
          capacityEntitlementActive: true,
          siteAllowance: 4,
          locationAllowance: 9,
          purchasedAdditionalLocationQuantity: 1,
          extraSiteAllowance: 3,
          extraLocationAllowance: 0,
        },
      })
    ).toEqual({ siteAllowance: 1, locationAllowance: 2 });
    expect(
      effectiveSiteLocationAllowance({
        entitlement: {
          commercialPlan: "PRACTICE",
          capacityEntitlementActive: true,
          siteAllowance: 1,
          locationAllowance: 1,
          purchasedAdditionalLocationQuantity: 2,
          extraLocationAllowance: 1,
        },
      })
    ).toEqual({ siteAllowance: 1, locationAllowance: 4 });
  });

  it("keeps a legacy Practice location total until conversion", () => {
    expect(
      effectiveSiteLocationAllowance({
        entitlement: {
          commercialPlan: "PRACTICE",
          capacityEntitlementActive: true,
          siteAllowance: 1,
          locationAllowance: 3,
          purchasedAdditionalLocationQuantity: null,
          extraLocationAllowance: 0,
        },
      })
    ).toEqual({ siteAllowance: 1, locationAllowance: 3 });
  });

  it("does not grant paid Practice capacity before the entitlement is active", () => {
    expect(
      effectiveSiteLocationAllowance({
        entitlement: {
          commercialPlan: "PRACTICE",
          capacityEntitlementActive: false,
          siteAllowance: 1,
          locationAllowance: 1,
          purchasedAdditionalLocationQuantity: 2,
          extraLocationAllowance: 1,
        },
      })
    ).toEqual({ siteAllowance: 1, locationAllowance: 1 });
  });
});
