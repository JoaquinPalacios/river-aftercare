import { describe, expect, it } from "vitest";

import { assessEssentialDowngradeReadiness } from "@/lib/entitlements/downgrade-readiness";
import {
  PLAN_ENTITLEMENT_POLICIES,
  planGovernanceFromEntitlement,
} from "@/lib/entitlements/plan-policy";

describe("commercial plan entitlement policy", () => {
  it("fixes Essential and Practice allowances without a Group cap", () => {
    expect(PLAN_ENTITLEMENT_POLICIES.ESSENTIAL).toEqual({
      commercialPlan: "ESSENTIAL",
      teamMemberLimit: 2,
      customGuideLimit: 2,
      canAdaptRiverTemplates: false,
    });
    expect(PLAN_ENTITLEMENT_POLICIES.PRACTICE).toEqual({
      commercialPlan: "PRACTICE",
      teamMemberLimit: 5,
      customGuideLimit: 30,
      canAdaptRiverTemplates: true,
    });
    expect(PLAN_ENTITLEMENT_POLICIES).not.toHaveProperty("GROUP");
  });

  it("keeps legacy, group, and unspecified clinics outside the fixed caps", () => {
    expect(planGovernanceFromEntitlement({ entitlement: null })).toEqual({
      governed: false,
      reason: "legacy",
    });
    expect(
      planGovernanceFromEntitlement({
        entitlement: { commercialPlan: "GROUP" },
      })
    ).toEqual({ governed: false, reason: "group" });
    expect(
      planGovernanceFromEntitlement({
        entitlement: { commercialPlan: null },
      })
    ).toEqual({ governed: false, reason: "unspecified" });
    expect(
      planGovernanceFromEntitlement({
        entitlement: { commercialPlan: "ESSENTIAL" },
      }).governed
    ).toBe(true);
    expect(
      planGovernanceFromEntitlement({
        entitlement: { commercialPlan: "PRACTICE" },
      }).governed
    ).toBe(true);
  });

  it("reports Practice to Essential conflicts from usage, not from copy", () => {
    const essential = PLAN_ENTITLEMENT_POLICIES.ESSENTIAL;
    const ready = assessEssentialDowngradeReadiness({
      occupiedTeamPlaces: essential.teamMemberLimit,
      customGuideCount: essential.customGuideLimit,
    });
    expect(ready.ready).toBe(true);
    expect(ready.conflicts).toEqual([]);

    const guides = assessEssentialDowngradeReadiness({
      occupiedTeamPlaces: essential.teamMemberLimit,
      customGuideCount: essential.customGuideLimit + 1,
    });
    expect(guides.ready).toBe(false);
    expect(guides.conflicts).toEqual(["CUSTOM_GUIDES"]);

    const team = assessEssentialDowngradeReadiness({
      occupiedTeamPlaces: essential.teamMemberLimit + 1,
      customGuideCount: essential.customGuideLimit,
    });
    expect(team.conflicts).toEqual(["TEAM_MEMBERS"]);

    const both = assessEssentialDowngradeReadiness({
      occupiedTeamPlaces: essential.teamMemberLimit + 1,
      customGuideCount: essential.customGuideLimit + 1,
    });
    expect(both.conflicts).toEqual(["TEAM_MEMBERS", "CUSTOM_GUIDES"]);
    expect(both.team.limit).toBe(essential.teamMemberLimit);
    expect(both.guides.limit).toBe(essential.customGuideLimit);
  });
});
