import { describe, expect, it } from "vitest";

import { assessEssentialDowngradeReadiness } from "@/lib/entitlements/downgrade-readiness";
import {
  allowanceDimension,
  effectiveAllowances,
  PLAN_ENTITLEMENT_POLICIES,
  planGovernanceFromEntitlement,
  ZERO_ALLOWANCE_EXTRAS,
} from "@/lib/entitlements/plan-policy";

describe("commercial plan entitlement policy", () => {
  it("fixes Essential and Practice base allowances without a Group cap", () => {
    expect(PLAN_ENTITLEMENT_POLICIES.ESSENTIAL).toEqual({
      commercialPlan: "ESSENTIAL",
      base: {
        teamMembers: 2,
        customGuides: 2,
        templateAdaptations: 2,
        combinedClinicOwnedGuides: 4,
      },
    });
    expect(PLAN_ENTITLEMENT_POLICIES.PRACTICE).toEqual({
      commercialPlan: "PRACTICE",
      base: {
        teamMembers: 5,
        customGuides: 30,
        templateAdaptations: 30,
        combinedClinicOwnedGuides: 40,
      },
    });
    expect(PLAN_ENTITLEMENT_POLICIES).not.toHaveProperty("GROUP");
  });

  it("adds persistent extras to the base without storing the effective total", () => {
    const essential = PLAN_ENTITLEMENT_POLICIES.ESSENTIAL.base;
    expect(
      effectiveAllowances(essential, {
        teamMembers: 3,
        customGuides: 1,
        templateAdaptations: 4,
      })
    ).toEqual({
      teamMembers: 5,
      customGuides: 3,
      templateAdaptations: 6,
      combinedClinicOwnedGuides: 9,
    });
    const practice = PLAN_ENTITLEMENT_POLICIES.PRACTICE.base;
    expect(
      effectiveAllowances(practice, {
        teamMembers: 0,
        customGuides: 2,
        templateAdaptations: 3,
      })
    ).toEqual({
      teamMembers: 5,
      customGuides: 32,
      templateAdaptations: 33,
      combinedClinicOwnedGuides: 45,
    });
    expect(ZERO_ALLOWANCE_EXTRAS).toEqual({
      teamMembers: 0,
      customGuides: 0,
      templateAdaptations: 0,
    });
    expect(allowanceDimension({ used: 3, base: 2, extra: 1 })).toMatchObject({
      effective: 3,
      remaining: 0,
      atLimit: true,
      overLimit: false,
    });
    expect(allowanceDimension({ used: 4, base: 2, extra: 1 })).toMatchObject({
      overLimit: true,
      remaining: 0,
    });
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

  it("compares Practice to Essential readiness against Essential base plus extras", () => {
    const essential = PLAN_ENTITLEMENT_POLICIES.ESSENTIAL.base;
    const ready = assessEssentialDowngradeReadiness({
      occupiedTeamPlaces: essential.teamMembers,
      customGuideCount: essential.customGuides,
      adaptedTemplateCount: essential.templateAdaptations,
    });
    expect(ready.ready).toBe(true);
    expect(ready.conflicts).toEqual([]);

    const adapted = assessEssentialDowngradeReadiness({
      occupiedTeamPlaces: essential.teamMembers,
      customGuideCount: 0,
      adaptedTemplateCount: essential.templateAdaptations + 1,
    });
    expect(adapted.conflicts).toEqual(["TEMPLATE_ADAPTATIONS"]);

    const guides = assessEssentialDowngradeReadiness({
      occupiedTeamPlaces: essential.teamMembers,
      customGuideCount: essential.customGuides + 1,
      adaptedTemplateCount: 0,
    });
    expect(guides.conflicts).toEqual(["CUSTOM_GUIDES"]);

    const overCombined = assessEssentialDowngradeReadiness({
      occupiedTeamPlaces: essential.teamMembers,
      customGuideCount: essential.customGuides,
      adaptedTemplateCount: essential.templateAdaptations + 1,
    });
    expect(overCombined.conflicts).toEqual([
      "TEMPLATE_ADAPTATIONS",
      "COMBINED_GUIDES",
    ]);

    const team = assessEssentialDowngradeReadiness({
      occupiedTeamPlaces: essential.teamMembers + 1,
      customGuideCount: essential.customGuides,
      adaptedTemplateCount: essential.templateAdaptations,
    });
    expect(team.conflicts).toEqual(["TEAM_MEMBERS"]);

    const all = assessEssentialDowngradeReadiness({
      occupiedTeamPlaces: essential.teamMembers + 1,
      customGuideCount: essential.customGuides + 1,
      adaptedTemplateCount: essential.templateAdaptations + 1,
    });
    expect(all.conflicts).toEqual([
      "TEAM_MEMBERS",
      "CUSTOM_GUIDES",
      "TEMPLATE_ADAPTATIONS",
      "COMBINED_GUIDES",
    ]);

    const withExtras = assessEssentialDowngradeReadiness({
      occupiedTeamPlaces: 3,
      customGuideCount: 4,
      adaptedTemplateCount: 5,
      extras: { teamMembers: 1, customGuides: 2, templateAdaptations: 3 },
    });
    expect(withExtras.ready).toBe(true);
    expect(withExtras.team.limit).toBe(3);
    expect(withExtras.guides.limit).toBe(4);
    expect(withExtras.adaptedTemplates.limit).toBe(5);
    expect(withExtras.combinedGuides).toEqual({ current: 9, limit: 9 });

    const combinedOnly = assessEssentialDowngradeReadiness({
      occupiedTeamPlaces: 2,
      customGuideCount: 2,
      adaptedTemplateCount: 2,
      extras: { teamMembers: 0, customGuides: 0, templateAdaptations: 0 },
    });
    expect(combinedOnly.ready).toBe(true);

    const flexibleReady = assessEssentialDowngradeReadiness({
      occupiedTeamPlaces: 2,
      customGuideCount: 3,
      adaptedTemplateCount: 2,
      extras: { teamMembers: 0, customGuides: 1, templateAdaptations: 0 },
    });
    expect(flexibleReady.ready).toBe(true);
    expect(flexibleReady.guides.limit).toBe(3);
    expect(flexibleReady.adaptedTemplates.limit).toBe(2);
    expect(flexibleReady.combinedGuides).toEqual({ current: 5, limit: 5 });
  });
});
