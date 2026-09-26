import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  GROUP_BASE_LOCATION_ALLOWANCE,
  GROUP_BASE_SITE_ALLOWANCE,
  groupCapacityPersistence,
  groupEffectiveAllowances,
} from "@/lib/clinics/group-capacity";
import { effectiveSiteLocationAllowance } from "@/lib/clinics/site-location-allowance";

describe("Group effective capacity", () => {
  it("gives an active Group with N=0 the included 2 sites and 5 locations", () => {
    expect(allowance(0, 0, 0)).toEqual({
      siteAllowance: 2,
      locationAllowance: 5,
    });
  });

  it("adds one site and one location for each purchased bundle", () => {
    expect(allowance(1, 0, 0)).toEqual({
      siteAllowance: 3,
      locationAllowance: 6,
    });
    expect(allowance(2, 0, 0)).toEqual({
      siteAllowance: 4,
      locationAllowance: 7,
    });
  });

  it("adds complimentary site and location extras independently", () => {
    expect(allowance(0, 2, 0)).toEqual({
      siteAllowance: 4,
      locationAllowance: 5,
    });
    expect(allowance(0, 0, 3)).toEqual({
      siteAllowance: 2,
      locationAllowance: 8,
    });
    expect(allowance(1, 2, 4)).toEqual({
      siteAllowance: 5,
      locationAllowance: 10,
    });
  });

  it("keeps Essential at one site and one location", () => {
    expect(
      effectiveSiteLocationAllowance({
        entitlement: {
          commercialPlan: "ESSENTIAL",
          capacityEntitlementActive: true,
          purchasedAdditionalSiteQuantity: 4,
          extraSiteAllowance: 4,
          extraLocationAllowance: 4,
          siteAllowance: 9,
          locationAllowance: 9,
        },
      })
    ).toEqual({ siteAllowance: 1, locationAllowance: 1 });
  });

  it("keeps Practice at one site and the stored location allowance", () => {
    expect(
      effectiveSiteLocationAllowance({
        entitlement: {
          commercialPlan: "PRACTICE",
          capacityEntitlementActive: true,
          purchasedAdditionalSiteQuantity: 2,
          extraSiteAllowance: 3,
          extraLocationAllowance: 3,
          siteAllowance: 4,
          locationAllowance: 6,
        },
      })
    ).toEqual({ siteAllowance: 1, locationAllowance: 6 });
  });

  it("does not grant Group capacity to a pending unpaid offer", () => {
    expect(
      effectiveSiteLocationAllowance({
        entitlement: {
          commercialPlan: "GROUP",
          capacityEntitlementActive: false,
          purchasedAdditionalSiteQuantity: 0,
          extraSiteAllowance: 1,
          extraLocationAllowance: 1,
          siteAllowance: 1,
          locationAllowance: 1,
        },
      })
    ).toEqual({ siteAllowance: 1, locationAllowance: 1 });
  });
});

describe("Group capacity transition", () => {
  it("keeps legacy raw totals until purchased quantity is recorded", () => {
    expect(
      effectiveSiteLocationAllowance({
        entitlement: {
          commercialPlan: "GROUP",
          capacityEntitlementActive: true,
          purchasedAdditionalSiteQuantity: null,
          extraSiteAllowance: 0,
          extraLocationAllowance: 0,
          siteAllowance: 4,
          locationAllowance: 8,
        },
      })
    ).toEqual({ siteAllowance: 4, locationAllowance: 8 });
  });

  it("does not infer complimentary extras from a legacy total when paid quantity is applied", () => {
    const legacySites = 4;
    const legacyLocations = 7;
    const converted = groupCapacityPersistence({
      capacityEntitlementActive: true,
      purchasedAdditionalSiteQuantity: null,
      extraSiteAllowance: 0,
      extraLocationAllowance: 0,
      siteAllowance: legacySites,
      locationAllowance: legacyLocations,
    });
    expect(converted).toEqual({
      purchasedAdditionalSiteQuantity: 0,
      extraSiteAllowance: 0,
      extraLocationAllowance: 0,
      siteAllowance: 2,
      locationAllowance: 5,
    });

    const projected = groupCapacityPersistence({
      capacityEntitlementActive: true,
      purchasedAdditionalSiteQuantity: 2,
      extraSiteAllowance: converted.extraSiteAllowance,
      extraLocationAllowance: converted.extraLocationAllowance,
      siteAllowance: legacySites,
      locationAllowance: legacyLocations,
    });
    expect(projected.extraSiteAllowance).toBe(0);
    expect(projected.extraLocationAllowance).toBe(0);
    expect(projected.siteAllowance).toBe(4);
    expect(projected.locationAllowance).toBe(7);
    expect(projected.siteAllowance).not.toBe(
      GROUP_BASE_SITE_ALLOWANCE + 2 + (legacySites - GROUP_BASE_SITE_ALLOWANCE)
    );
    expect(projected.locationAllowance).not.toBe(
      GROUP_BASE_LOCATION_ALLOWANCE +
        2 +
        (legacyLocations - GROUP_BASE_LOCATION_ALLOWANCE)
    );
  });

  it("converts and reconciles idempotently", () => {
    const first = groupCapacityPersistence({
      capacityEntitlementActive: true,
      purchasedAdditionalSiteQuantity: null,
      extraSiteAllowance: 1,
      extraLocationAllowance: 2,
      siteAllowance: 9,
      locationAllowance: 9,
    });
    const second = groupCapacityPersistence({
      capacityEntitlementActive: true,
      purchasedAdditionalSiteQuantity: first.purchasedAdditionalSiteQuantity,
      extraSiteAllowance: first.extraSiteAllowance,
      extraLocationAllowance: first.extraLocationAllowance,
      siteAllowance: first.siteAllowance,
      locationAllowance: first.locationAllowance,
    });
    expect(second).toEqual(first);
    expect(second).toEqual({
      purchasedAdditionalSiteQuantity: 0,
      extraSiteAllowance: 1,
      extraLocationAllowance: 2,
      siteAllowance: 3,
      locationAllowance: 7,
    });
  });

  it("preserves an already recorded paid quantity when extras are saved again", () => {
    const next = groupCapacityPersistence({
      capacityEntitlementActive: true,
      purchasedAdditionalSiteQuantity: 2,
      extraSiteAllowance: 1,
      extraLocationAllowance: 0,
      siteAllowance: 1,
      locationAllowance: 1,
    });
    expect(next.purchasedAdditionalSiteQuantity).toBe(2);
    expect(next.siteAllowance).toBe(5);
    expect(next.locationAllowance).toBe(7);
  });

  it("does not raise stored totals for a pending configuration", () => {
    expect(
      groupCapacityPersistence({
        capacityEntitlementActive: false,
        purchasedAdditionalSiteQuantity: null,
        extraSiteAllowance: 0,
        extraLocationAllowance: 0,
        siteAllowance: 1,
        locationAllowance: 1,
      })
    ).toEqual({
      purchasedAdditionalSiteQuantity: 0,
      extraSiteAllowance: 0,
      extraLocationAllowance: 0,
      siteAllowance: 1,
      locationAllowance: 1,
    });
  });

  it("uses one formula for enforcement and persistence", () => {
    const facts = {
      purchasedAdditionalSiteQuantity: 2,
      extraSiteAllowance: 1,
      extraLocationAllowance: 3,
    };
    expect(groupEffectiveAllowances(facts)).toEqual(
      effectiveSiteLocationAllowance({
        entitlement: {
          commercialPlan: "GROUP",
          capacityEntitlementActive: true,
          ...facts,
          siteAllowance: 1,
          locationAllowance: 1,
        },
      })
    );
    const allowanceSource = readFileSync(
      "lib/clinics/site-location-allowance.ts",
      "utf8"
    );
    const operatorSource = readFileSync(
      "lib/operator/update-site-location-allowance.ts",
      "utf8"
    );
    expect(allowanceSource).toContain("groupEffectiveAllowances");
    expect(operatorSource).toContain("groupCapacityPersistence");
    expect(allowanceSource).not.toMatch(/GROUP_BASE_SITE_ALLOWANCE\s*\+/);
    expect(operatorSource).not.toMatch(/GROUP_BASE_SITE_ALLOWANCE\s*\+/);
    const migration = readFileSync(
      "prisma/migrations/20260926140000_add_group_capacity_foundation/migration.sql",
      "utf8"
    );
    expect(migration).toContain('"purchasedAdditionalSiteQuantity" INTEGER');
    expect(migration).toContain(
      '"extraSiteAllowance" INTEGER NOT NULL DEFAULT 0'
    );
    expect(migration).toContain(
      '"extraLocationAllowance" INTEGER NOT NULL DEFAULT 0'
    );
    expect(migration).toContain('"offeredAdditionalSiteQuantity"');
    expect(migration).toContain('"scheduledAdditionalSiteQuantity"');
    expect(migration).toContain('"scheduledCapacityEffectiveAt"');
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE|SCHEMA)\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
  });
});

function allowance(
  purchasedAdditionalSiteQuantity: number,
  extraSiteAllowance: number,
  extraLocationAllowance: number
) {
  return effectiveSiteLocationAllowance({
    entitlement: {
      commercialPlan: "GROUP",
      capacityEntitlementActive: true,
      purchasedAdditionalSiteQuantity,
      extraSiteAllowance,
      extraLocationAllowance,
      siteAllowance: 1,
      locationAllowance: 1,
    },
  });
}
