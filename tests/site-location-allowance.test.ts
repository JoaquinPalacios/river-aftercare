import { describe, expect, it } from "vitest";

import { effectiveSiteLocationAllowance } from "@/lib/clinics/site-location-allowance";

describe("site and location allowance policy", () => {
  it("treats a missing entitlement as one site and one location", () => {
    expect(effectiveSiteLocationAllowance({ entitlement: null })).toEqual({
      siteAllowance: 1,
      locationAllowance: 1,
    });
  });

  it("keeps Essential at one site and one location even when stored totals are higher", () => {
    expect(
      effectiveSiteLocationAllowance({
        entitlement: {
          commercialPlan: "ESSENTIAL",
          siteAllowance: 4,
          locationAllowance: 9,
        },
      })
    ).toEqual({ siteAllowance: 1, locationAllowance: 1 });
  });

  it("keeps Practice at one site and uses the stored location total", () => {
    expect(
      effectiveSiteLocationAllowance({
        entitlement: {
          commercialPlan: "PRACTICE",
          siteAllowance: 3,
          locationAllowance: 4,
        },
      })
    ).toEqual({ siteAllowance: 1, locationAllowance: 4 });
  });

  it("uses Group totals configured on the entitlement", () => {
    expect(
      effectiveSiteLocationAllowance({
        entitlement: {
          commercialPlan: "GROUP",
          siteAllowance: 2,
          locationAllowance: 5,
        },
      })
    ).toEqual({ siteAllowance: 2, locationAllowance: 5 });
  });

  it("keeps a pending Group offer on stored totals", () => {
    expect(
      effectiveSiteLocationAllowance({
        entitlement: {
          commercialPlan: "GROUP",
          capacityEntitlementActive: false,
          purchasedAdditionalSiteQuantity: 0,
          extraSiteAllowance: 0,
          extraLocationAllowance: 0,
          siteAllowance: 1,
          locationAllowance: 1,
        },
      })
    ).toEqual({ siteAllowance: 1, locationAllowance: 1 });
  });

  it("uses the Group formula only for an active configured entitlement", () => {
    expect(
      effectiveSiteLocationAllowance({
        entitlement: {
          commercialPlan: "GROUP",
          capacityEntitlementActive: true,
          purchasedAdditionalSiteQuantity: 0,
          extraSiteAllowance: 0,
          extraLocationAllowance: 0,
          siteAllowance: 1,
          locationAllowance: 1,
        },
      })
    ).toEqual({ siteAllowance: 2, locationAllowance: 5 });
  });

  it("does not treat an unspecified plan or a sub-1 total as unlimited", () => {
    expect(
      effectiveSiteLocationAllowance({
        entitlement: {
          commercialPlan: null,
          siteAllowance: 8,
          locationAllowance: 8,
        },
      })
    ).toEqual({ siteAllowance: 1, locationAllowance: 1 });
    expect(
      effectiveSiteLocationAllowance({
        entitlement: {
          commercialPlan: "GROUP",
          siteAllowance: 0,
          locationAllowance: -2,
        },
      })
    ).toEqual({ siteAllowance: 1, locationAllowance: 1 });
  });
});
