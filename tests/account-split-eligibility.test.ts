import "dotenv/config";

import { PlatformRole } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  default: () => ({
    auth: vi.fn(),
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: vi.fn(() => ({})),
}));

import { executeClinicAccountSplit } from "@/lib/account-split/execute";
import {
  accountSplitDestinationAllowance,
  accountSplitSourceAllowance,
  classifyDestinationBilling,
  supportedAccountSplitAction,
  unsupportedAccountSplitMessage,
} from "@/lib/account-split/policy";
import { createAccountSplitPreparation } from "@/lib/account-split/preparation";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { getPrisma } from "@/lib/prisma";

const PREFIX = "asel_";

function db() {
  return getPrisma();
}

async function cleanup() {
  await db().clinic.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await db().user.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

describe("account split eligibility", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("shows a split action only for a Group Account that can move a Clinic Site", () => {
    expect(
      supportedAccountSplitAction({
        commercialPlan: "ESSENTIAL",
        activeClinicSiteCount: 1,
      })
    ).toEqual({ available: false });
    expect(
      supportedAccountSplitAction({
        commercialPlan: "PRACTICE",
        activeClinicSiteCount: 1,
      }).available
    ).toBe(false);
    expect(
      supportedAccountSplitAction({
        commercialPlan: "GROUP",
        activeClinicSiteCount: 1,
      }).available
    ).toBe(false);
    expect(
      supportedAccountSplitAction({
        commercialPlan: "GROUP",
        activeClinicSiteCount: 2,
      })
    ).toEqual({
      available: true,
      operation: "group_clinic_site_to_new_account",
    });
    expect(
      supportedAccountSplitAction({
        commercialPlan: "ESSENTIAL",
        activeClinicSiteCount: 1,
        hasOpenPreparation: true,
      }).available
    ).toBe(true);
    expect(unsupportedAccountSplitMessage("ESSENTIAL")).toMatch(/no split/);
    expect(unsupportedAccountSplitMessage("PRACTICE")).toMatch(/Group Account/);
  });

  it("uses derived capacity when split readiness reads a stale stored total", () => {
    expect(
      accountSplitSourceAllowance({
        id: "source",
        name: "Source",
        slug: "source",
        commercialPlan: "GROUP",
        extras: { teamMembers: 0, customGuides: 0, templateAdaptations: 0 },
        siteAllowance: 1,
        locationAllowance: 1,
        capacityEntitlementActive: true,
        purchasedAdditionalSiteQuantity: 1,
        purchasedAdditionalLocationQuantity: null,
        extraSiteAllowance: 0,
        extraLocationAllowance: 0,
        billingStatus: "ACTIVE",
        access: "ACTIVE",
        cancelAtPeriodEnd: false,
        subscriptionSchedulePresent: false,
        scheduledCommercialPlan: null,
        scheduledAdditionalSiteQuantity: null,
        scheduledCapacityEffectiveAt: null,
        offeredAdditionalSiteQuantity: null,
        openDowngradePreparation: false,
        conflictingOpenPreparation: false,
      })
    ).toEqual({ siteAllowance: 3, locationAllowance: 6 });

    const destination = {
      commercialPlan: "PRACTICE" as const,
      billingInterval: "MONTHLY" as const,
      billingStatus: "ACTIVE" as const,
      access: "ACTIVE" as const,
      cancelAtPeriodEnd: false,
      scheduledCommercialPlan: null,
      siteAllowance: 1,
      locationAllowance: 1,
      capacityEntitlementActive: true,
      purchasedAdditionalLocationQuantity: 2,
      extraLocationAllowance: 0,
      extraTeamMemberAllowance: 0,
      extraCustomGuideAllowance: 0,
      extraTemplateAdaptationAllowance: 0,
    };
    expect(
      accountSplitDestinationAllowance({
        plan: "PRACTICE",
        entitlement: destination,
      })
    ).toEqual({ siteAllowance: 1, locationAllowance: 3 });
    expect(
      classifyDestinationBilling({
        entitlement: destination,
        plan: "PRACTICE",
        interval: "MONTHLY",
        activeLocations: 3,
      }).phase
    ).toBe("ready");
    expect(
      classifyDestinationBilling({
        entitlement: {
          ...destination,
          locationAllowance: 9,
          purchasedAdditionalLocationQuantity: 0,
        },
        plan: "PRACTICE",
        interval: "MONTHLY",
        activeLocations: 3,
      }).phase
    ).toBe("not_ready");
  });

  it("rejects an Essential split and a non-operator even when the UI is bypassed", async () => {
    const operatorId = `${PREFIX}operator`;
    const staffId = `${PREFIX}staff`;
    const adminId = `${PREFIX}admin`;
    const clinicId = `${PREFIX}essential`;
    await db().user.createMany({
      data: [
        {
          id: operatorId,
          email: `${operatorId}@example.test`,
          name: "Operator",
          platformRole: PlatformRole.OPERATOR,
        },
        {
          id: staffId,
          email: `${staffId}@example.test`,
          name: "Staff",
          platformRole: PlatformRole.NONE,
        },
        {
          id: adminId,
          email: `${adminId}@example.test`,
          name: "Admin",
          platformRole: PlatformRole.NONE,
        },
      ],
    });
    await db().clinic.create({
      data: {
        id: clinicId,
        name: "Essential Account",
        slug: "asel-essential",
        entitlement: {
          create: {
            commercialPlan: "ESSENTIAL",
            billingStatus: "ACTIVE",
            entitlementStatus: "ACTIVE",
            siteAllowance: 1,
            locationAllowance: 1,
          },
        },
        sites: {
          create: {
            id: `${PREFIX}site`,
            name: "Only site",
            slug: "asel-site",
            displayName: "Only site",
            active: true,
            isPrimary: true,
          },
        },
      },
    });

    await expect(
      createAccountSplitPreparation({
        sourceClinicId: clinicId,
        keptClinicSiteId: `${PREFIX}site`,
        destinationPlan: "PRACTICE",
        destinationBillingInterval: "MONTHLY",
        operatorUserId: operatorId,
      })
    ).rejects.toThrow(/Essential has one Clinic Site/);

    await expect(
      createAccountSplitPreparation({
        sourceClinicId: clinicId,
        keptClinicSiteId: `${PREFIX}site`,
        destinationPlan: "PRACTICE",
        destinationBillingInterval: "MONTHLY",
        operatorUserId: staffId,
      })
    ).rejects.toThrow(/platform operator/);

    await expect(
      executeClinicAccountSplit({
        preparationId: `${PREFIX}missing`,
        confirmation: "split missing",
        operatorUserId: adminId,
        reviewedRevision: 0,
      })
    ).rejects.toThrow(/platform operator/);

    await expect(
      executeClinicAccountSplit({
        preparationId: `${PREFIX}missing`,
        confirmation: "split missing",
        operatorUserId: operatorId,
        reviewedRevision: 0,
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);
  });
});
