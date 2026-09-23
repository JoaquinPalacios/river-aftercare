import "dotenv/config";

import { readFileSync } from "node:fs";

import {
  BillingStatus,
  EntitlementStatus,
  PlatformRole,
  PracticeGuideStatus,
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { loadEssentialDowngradeReadiness } from "@/lib/entitlements/downgrade-readiness";
import { updateOperatorAllowanceExtras } from "@/lib/entitlements/operator-extras";
import { PLAN_ENTITLEMENT_POLICIES } from "@/lib/entitlements/plan-policy";
import { getPrisma } from "@/lib/prisma";

const prisma = getPrisma();
const PREFIX = "test_ent_extra_";
const CLINIC_ID = `${PREFIX}clinic`;
const OPERATOR_ID = `${PREFIX}operator`;

async function cleanup() {
  await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
  await prisma.clinicMembership.deleteMany({ where: { clinicId: CLINIC_ID } });
  await prisma.clinicEntitlement.deleteMany({ where: { clinicId: CLINIC_ID } });
  await prisma.clinic.deleteMany({ where: { id: CLINIC_ID } });
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

describe("operator allowance extras", () => {
  beforeAll(async () => {
    await cleanup();
    await prisma.user.create({
      data: {
        id: OPERATOR_ID,
        email: `${PREFIX}operator@example.test`,
        name: "Extras Operator",
        platformRole: PlatformRole.OPERATOR,
      },
    });
    await prisma.clinic.create({
      data: { id: CLINIC_ID, name: "Extras Clinic", slug: "ent-extra-clinic" },
    });
    await prisma.clinicEntitlement.create({
      data: {
        clinicId: CLINIC_ID,
        commercialPlan: "ESSENTIAL",
        billingStatus: BillingStatus.ACTIVE,
        entitlementStatus: EntitlementStatus.ACTIVE,
        stripePriceId: "price_test_essential",
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("lets an operator set extras without touching the plan or Stripe price", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await updateOperatorAllowanceExtras({
      actorUserId: OPERATOR_ID,
      actorPlatformRole: PlatformRole.OPERATOR,
      clinicId: CLINIC_ID,
      extras: { teamMembers: 3, customGuides: 1, templateAdaptations: 4 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.effective).toEqual({
        teamMembers: 5,
        customGuides: 3,
        templateAdaptations: 6,
      });
    }
    const stored = await prisma.clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: CLINIC_ID },
    });
    expect(stored.commercialPlan).toBe("ESSENTIAL");
    expect(stored.stripePriceId).toBe("price_test_essential");
    expect(stored.extraTeamMemberAllowance).toBe(3);
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "operator_allowance_extra_updated",
        actorUserId: OPERATOR_ID,
        clinicId: CLINIC_ID,
        dimension: "team_members",
        previousExtra: 0,
        nextExtra: 3,
        effectiveAllowance: 5,
      })
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain("@");
    info.mockRestore();
  });

  it("rejects a non-operator, including a forged operator role that is not the session role", async () => {
    const refused = await updateOperatorAllowanceExtras({
      actorUserId: OPERATOR_ID,
      actorPlatformRole: PlatformRole.NONE,
      clinicId: CLINIC_ID,
      extras: { teamMembers: 9, customGuides: 9, templateAdaptations: 9 },
    });
    expect(refused.ok).toBe(false);
    const stored = await prisma.clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: CLINIC_ID },
    });
    expect(stored.extraTeamMemberAllowance).toBe(3);
  });

  it("allows a reduction below current usage without deleting guides or memberships", async () => {
    await prisma.user.create({
      data: {
        id: `${PREFIX}member`,
        email: `${PREFIX}member@example.test`,
        name: "Member",
      },
    });
    await prisma.clinicMembership.create({
      data: {
        clinicId: CLINIC_ID,
        userId: `${PREFIX}member`,
        role: "ADMIN",
        active: true,
      },
    });
    await prisma.practiceGuide.create({
      data: {
        clinicId: CLINIC_ID,
        title: "Kept",
        publicSlug: "kept",
        status: PracticeGuideStatus.DRAFT,
      },
    });
    const reduced = await updateOperatorAllowanceExtras({
      actorUserId: OPERATOR_ID,
      actorPlatformRole: PlatformRole.OPERATOR,
      clinicId: CLINIC_ID,
      extras: { teamMembers: 0, customGuides: 0, templateAdaptations: 0 },
    });
    expect(reduced.ok).toBe(true);
    expect(
      await prisma.clinicMembership.count({ where: { clinicId: CLINIC_ID } })
    ).toBe(1);
    expect(
      await prisma.practiceGuide.count({ where: { clinicId: CLINIC_ID } })
    ).toBe(1);
    const readiness = await loadEssentialDowngradeReadiness(CLINIC_ID);
    expect(readiness.guides.current).toBe(1);
    expect(readiness.guides.limit).toBe(
      PLAN_ENTITLEMENT_POLICIES.ESSENTIAL.base.customGuides
    );
  });

  it("keeps extras when the local plan projection changes to Practice", async () => {
    await updateOperatorAllowanceExtras({
      actorUserId: OPERATOR_ID,
      actorPlatformRole: PlatformRole.OPERATOR,
      clinicId: CLINIC_ID,
      extras: { teamMembers: 1, customGuides: 3, templateAdaptations: 2 },
    });
    await prisma.clinicEntitlement.update({
      where: { clinicId: CLINIC_ID },
      data: { commercialPlan: "PRACTICE" },
    });
    const stored = await prisma.clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: CLINIC_ID },
    });
    expect(stored.commercialPlan).toBe("PRACTICE");
    expect(stored.extraCustomGuideAllowance).toBe(3);
    expect(stored.stripePriceId).toBe("price_test_essential");
    const readiness = await loadEssentialDowngradeReadiness(CLINIC_ID);
    expect(readiness.team.limit).toBe(
      PLAN_ENTITLEMENT_POLICIES.ESSENTIAL.base.teamMembers + 1
    );
    expect(readiness.guides.limit).toBe(
      PLAN_ENTITLEMENT_POLICIES.ESSENTIAL.base.customGuides + 3
    );
    expect(readiness.adaptedTemplates.limit).toBe(
      PLAN_ENTITLEMENT_POLICIES.ESSENTIAL.base.templateAdaptations + 2
    );
    expect(readiness.conflicts).not.toContain("CUSTOM_GUIDES");
  });

  it("does not reference Stripe from the extras service", () => {
    const source = readFileSync(
      new URL("../lib/entitlements/operator-extras.ts", import.meta.url),
      "utf8"
    );
    expect(source).not.toMatch(/from ["']stripe["']/);
    expect(source).not.toMatch(/\bstripe\./);
  });
});
