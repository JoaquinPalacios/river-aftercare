import { readFileSync } from "node:fs";

import { BillingStatus, EntitlementStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { offerSummaryForEntitlement } from "@/lib/billing/billing-presentation";
import {
  formatAudCents,
  groupOfferQuote,
  parseOfferedAdditionalSiteQuantity,
} from "@/lib/clinics/group-commercial";
import { prepareClinicCommercialOffer } from "@/lib/billing/prepare-offer";
import { LAUNCH_PLANS } from "@/lib/marketing/plans";
import { effectiveSiteLocationAllowance } from "@/lib/clinics/site-location-allowance";

describe("Group commercial quote", () => {
  it("prices base-only and additional-site offers in integer cents", () => {
    const monthlyBase = groupOfferQuote({
      interval: "MONTHLY",
      additionalSiteQuantity: 0,
    });
    expect(monthlyBase.totalCents).toBe(44_900);
    expect(monthlyBase.priceLabel).toBe("A$449 / month");
    expect(monthlyBase.detailLines).toContain("Additional Sites: none");
    expect(monthlyBase.sites).toBe(2);
    expect(monthlyBase.locations).toBe(5);
    expect(monthlyBase.capacityNote).toContain(
      "Available after successful payment"
    );

    const monthlyTwo = groupOfferQuote({
      interval: "MONTHLY",
      additionalSiteQuantity: 2,
    });
    expect(monthlyTwo.totalCents).toBe(54_900);
    expect(monthlyTwo.addonCents).toBe(10_000);
    expect(monthlyTwo.priceLabel).toBe("A$549 / month");
    expect(monthlyTwo.sites).toBe(4);
    expect(monthlyTwo.locations).toBe(7);

    const annualThree = groupOfferQuote({
      interval: "YEARLY",
      additionalSiteQuantity: 3,
    });
    expect(annualThree.totalCents).toBe(599_000);
    expect(formatAudCents(annualThree.totalCents)).toBe("A$5,990");
    expect(annualThree.sites).toBe(5);
    expect(annualThree.locations).toBe(8);
  });

  it("rejects negative, fractional, and unbounded additional-site quantities", () => {
    expect(parseOfferedAdditionalSiteQuantity("0")).toBe(0);
    expect(parseOfferedAdditionalSiteQuantity("2")).toBe(2);
    expect(parseOfferedAdditionalSiteQuantity("-1")).toBeNull();
    expect(parseOfferedAdditionalSiteQuantity("1.5")).toBeNull();
    expect(parseOfferedAdditionalSiteQuantity("2e1")).toBeNull();
    expect(parseOfferedAdditionalSiteQuantity("")).toBeNull();
    expect(parseOfferedAdditionalSiteQuantity("2147483647")).toBeNull();
  });
});

describe("operator Group offer persistence", () => {
  it("stores monthly and annual offers without purchased capacity", async () => {
    const row = {
      commercialPlan: "ESSENTIAL" as const,
      billingInterval: "MONTHLY" as const,
      billingStatus: BillingStatus.OFFER_PREPARED,
      entitlementStatus: EntitlementStatus.PENDING,
      offeredAdditionalSiteQuantity: null as number | null,
      purchasedAdditionalSiteQuantity: null as number | null,
      siteAllowance: 1,
      locationAllowance: 1,
    };
    const updates: Array<Record<string, unknown>> = [];
    const db = {
      clinicEntitlement: {
        findUnique: async () => row,
        upsert: async ({ update }: { update: Record<string, unknown> }) => {
          updates.push(update);
          Object.assign(row, update);
          return row;
        },
      },
      clinicBillingProfile: {
        findUnique: async () => null,
      },
    };

    for (const [interval, quantity] of [
      ["MONTHLY", 0],
      ["YEARLY", 0],
      ["MONTHLY", 2],
      ["YEARLY", 3],
    ] as const) {
      const result = await prepareClinicCommercialOffer(
        {
          clinicId: "clinic_a",
          commercialPlan: "GROUP",
          billingInterval: interval,
          offeredAdditionalSiteQuantity: quantity,
        },
        db as never
      );
      expect(result).toEqual({ ok: true });
    }

    expect(row).toMatchObject({
      commercialPlan: "GROUP",
      billingInterval: "YEARLY",
      billingStatus: BillingStatus.OFFER_PREPARED,
      entitlementStatus: EntitlementStatus.PENDING,
      offeredAdditionalSiteQuantity: 3,
      purchasedAdditionalSiteQuantity: null,
      siteAllowance: 1,
      locationAllowance: 1,
    });
    expect(updates.at(-1)).not.toHaveProperty(
      "purchasedAdditionalSiteQuantity"
    );
    expect(updates.at(-1)).not.toHaveProperty("siteAllowance");
    expect(updates.at(-1)).not.toHaveProperty(
      "scheduledAdditionalSiteQuantity"
    );
    expect(
      effectiveSiteLocationAllowance({
        entitlement: {
          commercialPlan: "GROUP",
          capacityEntitlementActive: false,
          purchasedAdditionalSiteQuantity: row.purchasedAdditionalSiteQuantity,
          extraSiteAllowance: 0,
          extraLocationAllowance: 0,
          siteAllowance: row.siteAllowance,
          locationAllowance: row.locationAllowance,
        },
      })
    ).toEqual({ siteAllowance: 1, locationAllowance: 1 });
  });

  it("prepares a new shell and revises an unpaid Group offer without capacity", async () => {
    const created: Array<Record<string, unknown>> = [];
    const shell = {
      clinicEntitlement: {
        findUnique: async () => null,
        upsert: async ({ create }: { create: Record<string, unknown> }) => {
          created.push(create);
          return create;
        },
      },
      clinicBillingProfile: {
        findUnique: async () => null,
      },
    };
    await expect(
      prepareClinicCommercialOffer(
        {
          clinicId: "clinic_new",
          commercialPlan: "GROUP",
          billingInterval: "MONTHLY",
          offeredAdditionalSiteQuantity: 0,
        },
        shell as never
      )
    ).resolves.toEqual({ ok: true });
    expect(created[0]).toMatchObject({
      commercialPlan: "GROUP",
      billingInterval: "MONTHLY",
      billingStatus: BillingStatus.OFFER_PREPARED,
      entitlementStatus: EntitlementStatus.PENDING,
      offeredAdditionalSiteQuantity: 0,
    });
    expect(created[0]).not.toHaveProperty("purchasedAdditionalSiteQuantity");
    expect(created[0]).not.toHaveProperty("siteAllowance");

    const annualShell = {
      clinicEntitlement: {
        findUnique: async () => null,
        upsert: async ({ create }: { create: Record<string, unknown> }) => {
          created.push(create);
          return create;
        },
      },
      clinicBillingProfile: {
        findUnique: async () => null,
      },
    };
    await expect(
      prepareClinicCommercialOffer(
        {
          clinicId: "clinic_new_annual",
          commercialPlan: "GROUP",
          billingInterval: "YEARLY",
          offeredAdditionalSiteQuantity: 2,
        },
        annualShell as never
      )
    ).resolves.toEqual({ ok: true });
    expect(created[1]).toMatchObject({
      commercialPlan: "GROUP",
      billingInterval: "YEARLY",
      billingStatus: BillingStatus.OFFER_PREPARED,
      entitlementStatus: EntitlementStatus.PENDING,
      offeredAdditionalSiteQuantity: 2,
    });

    const row = {
      commercialPlan: "GROUP" as const,
      billingInterval: "MONTHLY" as const,
      billingStatus: BillingStatus.OFFER_PREPARED,
      entitlementStatus: EntitlementStatus.PENDING,
      offeredAdditionalSiteQuantity: 3,
      purchasedAdditionalSiteQuantity: null as number | null,
      purchasedAdditionalLocationQuantity: null as number | null,
      siteAllowance: 1,
      locationAllowance: 1,
      scheduledAdditionalSiteQuantity: null as number | null,
    };
    const unpaid = {
      clinicEntitlement: {
        findUnique: async () => row,
        upsert: async ({ update }: { update: Record<string, unknown> }) => {
          Object.assign(row, update);
          return row;
        },
      },
      clinicBillingProfile: {
        findUnique: async () => ({ stripeSubscriptionId: null }),
      },
    };
    await expect(
      prepareClinicCommercialOffer(
        {
          clinicId: "clinic_a",
          commercialPlan: "GROUP",
          billingInterval: "YEARLY",
          offeredAdditionalSiteQuantity: 1,
        },
        unpaid as never
      )
    ).resolves.toEqual({ ok: true });
    expect(row).toMatchObject({
      commercialPlan: "GROUP",
      billingInterval: "YEARLY",
      billingStatus: BillingStatus.OFFER_PREPARED,
      entitlementStatus: EntitlementStatus.PENDING,
      offeredAdditionalSiteQuantity: 1,
      purchasedAdditionalSiteQuantity: null,
      purchasedAdditionalLocationQuantity: null,
      siteAllowance: 1,
      locationAllowance: 1,
      scheduledAdditionalSiteQuantity: null,
    });
  });

  it("rejects an initial Group offer when a River subscription is current", async () => {
    const cases: Array<{
      code: "already_active" | "subscription_exists" | "billing_underway";
      profile: { stripeSubscriptionId: string | null };
      row: Record<string, unknown>;
    }> = [
      {
        code: "already_active",
        profile: { stripeSubscriptionId: "sub_essential" },
        row: liveCommercialRow({
          commercialPlan: "ESSENTIAL",
          billingInterval: "MONTHLY",
          billingStatus: BillingStatus.ACTIVE,
          entitlementStatus: EntitlementStatus.ACTIVE,
          siteAllowance: 1,
          locationAllowance: 1,
        }),
      },
      {
        code: "already_active",
        profile: { stripeSubscriptionId: "sub_practice" },
        row: liveCommercialRow({
          commercialPlan: "PRACTICE",
          billingInterval: "YEARLY",
          billingStatus: BillingStatus.ACTIVE,
          entitlementStatus: EntitlementStatus.ACTIVE,
          purchasedAdditionalLocationQuantity: 2,
          siteAllowance: 1,
          locationAllowance: 4,
        }),
      },
      {
        code: "already_active",
        profile: { stripeSubscriptionId: "sub_group" },
        row: liveCommercialRow({
          commercialPlan: "GROUP",
          billingInterval: "MONTHLY",
          billingStatus: BillingStatus.ACTIVE,
          entitlementStatus: EntitlementStatus.ACTIVE,
          purchasedAdditionalSiteQuantity: 3,
          siteAllowance: 5,
          locationAllowance: 8,
        }),
      },
      {
        code: "already_active",
        profile: { stripeSubscriptionId: "sub_past_due" },
        row: liveCommercialRow({
          commercialPlan: "PRACTICE",
          billingStatus: BillingStatus.PAST_DUE,
          entitlementStatus: EntitlementStatus.ACTIVE,
          purchasedAdditionalLocationQuantity: 1,
          locationAllowance: 3,
        }),
      },
      {
        code: "subscription_exists",
        profile: { stripeSubscriptionId: "sub_restricted" },
        row: liveCommercialRow({
          commercialPlan: "PRACTICE",
          billingStatus: BillingStatus.UNPAID,
          entitlementStatus: EntitlementStatus.RESTRICTED,
          purchasedAdditionalLocationQuantity: 1,
          locationAllowance: 2,
        }),
      },
      {
        code: "already_active",
        profile: { stripeSubscriptionId: "sub_cancel" },
        row: liveCommercialRow({
          commercialPlan: "ESSENTIAL",
          billingStatus: BillingStatus.CANCEL_AT_PERIOD_END,
          entitlementStatus: EntitlementStatus.ACTIVE,
        }),
      },
      {
        code: "subscription_exists",
        profile: { stripeSubscriptionId: "sub_current" },
        row: liveCommercialRow({
          commercialPlan: "ESSENTIAL",
          billingInterval: "MONTHLY",
          billingStatus: BillingStatus.OFFER_PREPARED,
          entitlementStatus: EntitlementStatus.PENDING,
        }),
      },
    ];

    for (const item of cases) {
      const before = structuredClone(item.row);
      let writes = 0;
      const result = await prepareClinicCommercialOffer(
        {
          clinicId: "clinic_a",
          commercialPlan: "GROUP",
          billingInterval: "MONTHLY",
          offeredAdditionalSiteQuantity: 2,
        },
        {
          clinicEntitlement: {
            findUnique: async () => item.row,
            upsert: async () => {
              writes += 1;
              throw new Error("rejected Group offer must not write");
            },
          },
          clinicBillingProfile: {
            findUnique: async () => item.profile,
            update: async () => {
              writes += 1;
              throw new Error("rejected Group offer must not update profile");
            },
          },
        } as never
      );
      expect(result).toMatchObject({ ok: false, code: item.code });
      expect(writes).toBe(0);
      expect(item.row).toEqual(before);
    }
  });

  it("rejects an invalid quantity and an active Group subscription", async () => {
    const db = {
      clinicEntitlement: {
        findUnique: async () => {
          throw new Error("invalid quantity must not read");
        },
      },
      clinicBillingProfile: {
        findUnique: async () => null,
      },
    };
    await expect(
      prepareClinicCommercialOffer(
        {
          clinicId: "clinic_a",
          commercialPlan: "GROUP",
          billingInterval: "MONTHLY",
          offeredAdditionalSiteQuantity: -1,
        },
        db as never
      )
    ).resolves.toMatchObject({ ok: false, code: "group_offer_invalid" });

    const active = {
      clinicEntitlement: {
        findUnique: async () => ({
          commercialPlan: "GROUP",
          billingInterval: "MONTHLY",
          billingStatus: BillingStatus.ACTIVE,
          entitlementStatus: EntitlementStatus.ACTIVE,
          offeredAdditionalSiteQuantity: 0,
          purchasedAdditionalSiteQuantity: 0,
        }),
        upsert: async () => {
          throw new Error("active Group must not be revised");
        },
      },
      clinicBillingProfile: {
        findUnique: async () => ({ stripeSubscriptionId: "sub_live" }),
      },
    };
    const revised = await prepareClinicCommercialOffer(
      {
        clinicId: "clinic_a",
        commercialPlan: "GROUP",
        billingInterval: "YEARLY",
        offeredAdditionalSiteQuantity: 4,
      },
      active as never
    );
    expect(revised).toMatchObject({ ok: false, code: "already_active" });
  });
});

function liveCommercialRow(
  overrides: Record<string, unknown>
): Record<string, unknown> {
  return {
    commercialPlan: "PRACTICE",
    billingInterval: "YEARLY",
    billingStatus: BillingStatus.ACTIVE,
    entitlementStatus: EntitlementStatus.ACTIVE,
    offeredAdditionalSiteQuantity: null,
    purchasedAdditionalSiteQuantity: null,
    purchasedAdditionalLocationQuantity: null,
    siteAllowance: 1,
    locationAllowance: 1,
    extraSiteAllowance: 0,
    extraLocationAllowance: 0,
    scheduledAdditionalSiteQuantity: null,
    scheduledCapacityEffectiveAt: null,
    ...overrides,
  };
}

describe("Group offer surfaces", () => {
  it("keeps public Group pricing custom and shows the prepared offer privately", () => {
    const group = LAUNCH_PLANS.find((plan) => plan.id === "group");
    expect(group).toMatchObject({
      price: "Custom pricing",
      monthlyPrice: null,
      annualPrice: null,
      ctaHref: "/contact",
    });
    expect(readFileSync("lib/marketing/plans.ts", "utf8")).not.toContain("449");
    expect(readFileSync("lib/marketing/plans.ts", "utf8")).not.toContain(
      "group-commercial"
    );

    const summary = offerSummaryForEntitlement("GROUP", "MONTHLY", 2);
    expect(summary?.priceLabel).toBe("A$549 / month");
    expect(summary?.capacityNote).toContain(
      "Available after successful payment"
    );
    expect(summary?.detailLines?.join(" ")).toContain("2 ×");
    expect(offerSummaryForEntitlement("GROUP", "MONTHLY", null)).toBeNull();

    const setup = readFileSync(
      "app/(staff)/account/billing/setup/billing-setup-form.tsx",
      "utf8"
    );
    expect(setup).not.toContain("offeredAdditionalSiteQuantity");
    expect(setup).not.toContain('name="quantity"');
    expect(setup).toContain("capacityNote");

    const operatorActions = readFileSync(
      "app/(staff)/(operator)/operator/billing-actions.ts",
      "utf8"
    );
    expect(operatorActions).toContain("requirePlatformOperator");
    expect(operatorActions).toContain("offeredAdditionalSiteQuantity");
    const checkoutActions = readFileSync(
      "app/(staff)/account/billing/actions.ts",
      "utf8"
    );
    expect(checkoutActions).not.toContain("prepareClinicCommercialOffer");
    expect(checkoutActions).not.toContain("offeredAdditionalSiteQuantity");
    expect(checkoutActions).toContain("requireClinicAdmin");
  });
});
