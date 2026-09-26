import "server-only";

import type { CommercialPlan } from "@prisma/client";

import {
  countActiveSiteLocationUsage,
  readAccountSiteLocationAllowance,
} from "@/lib/clinics/site-location-capacity";
import {
  groupCapacityEntitlementFlags,
  groupCapacityEntitlementSelect,
  groupCapacityPersistenceFromRow,
} from "@/lib/billing/group-capacity-gate";
import {
  GROUP_BASE_LOCATION_ALLOWANCE,
  GROUP_BASE_SITE_ALLOWANCE,
} from "@/lib/clinics/site-location-allowance";
import { MAX_OPERATOR_EXTRA_ALLOWANCE } from "@/lib/entitlements/allowance-input";
import {
  lockClinicAccountStructure,
  lockClinicSiteLocationCapacity,
} from "@/lib/entitlements/locks";
import { getPrisma } from "@/lib/prisma";

export { GROUP_BASE_LOCATION_ALLOWANCE, GROUP_BASE_SITE_ALLOWANCE };

export async function updateOperatorSiteLocationAllowance(input: {
  clinicId: string;
  siteAllowance: number;
  locationAllowance: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const prisma = getPrisma();
  const entitlement = await prisma.clinicEntitlement.findUnique({
    where: { clinicId: input.clinicId },
    select: { id: true, commercialPlan: true },
  });
  if (!entitlement) {
    return {
      ok: false,
      error: "Prepare a plan before setting site and location capacity.",
    };
  }

  const plan = entitlement.commercialPlan;
  if (plan === "GROUP") {
    return {
      ok: false,
      error:
        "Group capacity is saved as complimentary extras. Paid Additional Site bundles are not edited here.",
    };
  }
  const sites = input.siteAllowance;
  const locations = input.locationAllowance;
  if (
    !Number.isInteger(sites) ||
    !Number.isInteger(locations) ||
    sites < 1 ||
    locations < 1
  ) {
    return {
      ok: false,
      error:
        "Site and location allowances must be whole numbers of at least 1.",
    };
  }

  const planError = allowancePlanError(plan, sites, locations);
  if (planError) {
    return { ok: false, error: planError };
  }

  const usage = await countActiveSiteLocationUsage(prisma, input.clinicId);
  if (sites < usage.activeSites) {
    return {
      ok: false,
      error: `Deactivate clinic sites until ${sites} or fewer are active before lowering the site allowance. ${usage.activeSites} are active.`,
    };
  }
  if (locations < usage.activeLocations) {
    return {
      ok: false,
      error: `Deactivate locations until ${locations} or fewer are active before lowering the location allowance. ${usage.activeLocations} are active.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await lockClinicAccountStructure(tx, input.clinicId);
    await tx.clinicEntitlement.update({
      where: { clinicId: input.clinicId },
      data: {
        siteAllowance: 1,
        locationAllowance:
          plan === "ESSENTIAL" || plan === null ? 1 : locations,
      },
    });
  });
  return { ok: true };
}

export async function updateOperatorGroupComplimentaryCapacity(input: {
  clinicId: string;
  extraSiteAllowance: number;
  extraLocationAllowance: number;
}): Promise<
  { ok: true; commerciallyActive: boolean } | { ok: false; error: string }
> {
  if (
    !isOperatorExtra(input.extraSiteAllowance) ||
    !isOperatorExtra(input.extraLocationAllowance)
  ) {
    return { ok: false, error: "Enter a whole number of zero or more." };
  }

  const prisma = getPrisma();
  const entitlement = await prisma.clinicEntitlement.findUnique({
    where: { clinicId: input.clinicId },
    select: { commercialPlan: true },
  });
  if (!entitlement) {
    return {
      ok: false,
      error: "Prepare a plan before setting site and location capacity.",
    };
  }
  if (entitlement.commercialPlan !== "GROUP") {
    return {
      ok: false,
      error: "Complimentary site and location extras apply to a Group account.",
    };
  }

  const persisted = await prisma.$transaction(async (tx) => {
    await lockClinicAccountStructure(tx, input.clinicId);
    await lockClinicSiteLocationCapacity(tx, input.clinicId);
    const row = await tx.clinicEntitlement.findUnique({
      where: { clinicId: input.clinicId },
      select: groupCapacityEntitlementSelect,
    });
    if (!row || row.commercialPlan !== "GROUP") {
      return {
        ok: false as const,
        error: "Group capacity could not be saved.",
      };
    }
    const flags = groupCapacityEntitlementFlags(row);
    const next = groupCapacityPersistenceFromRow(row, {
      extraSiteAllowance: input.extraSiteAllowance,
      extraLocationAllowance: input.extraLocationAllowance,
    });
    if (
      !isPostgresInt(next.siteAllowance) ||
      !isPostgresInt(next.locationAllowance)
    ) {
      return {
        ok: false as const,
        error: "That complimentary capacity is too large.",
      };
    }
    await tx.clinicEntitlement.update({
      where: { clinicId: input.clinicId },
      data: {
        purchasedAdditionalSiteQuantity: next.purchasedAdditionalSiteQuantity,
        extraSiteAllowance: next.extraSiteAllowance,
        extraLocationAllowance: next.extraLocationAllowance,
        siteAllowance: next.siteAllowance,
        locationAllowance: next.locationAllowance,
      },
    });
    return {
      ok: true as const,
      commerciallyActive: flags.capacityEntitlementActive,
    };
  });
  return persisted;
}

function isOperatorExtra(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_OPERATOR_EXTRA_ALLOWANCE
  );
}

function isPostgresInt(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 2_147_483_647;
}

function allowancePlanError(
  plan: CommercialPlan | null,
  sites: number,
  locations: number
): string | null {
  if (plan === "PRACTICE") {
    if (sites !== 1) {
      return "Practice includes one clinic site. Location allowance can change. This does not change billing.";
    }
    return null;
  }
  if (sites !== 1 || locations !== 1) {
    return "Essential includes one clinic site and one location. This does not change billing.";
  }
  return null;
}

export async function loadOperatorSiteLocationCapacity(clinicId: string) {
  const prisma = getPrisma();
  const [usage, allowance, sites] = await Promise.all([
    countActiveSiteLocationUsage(prisma, clinicId),
    readAccountSiteLocationAllowance(prisma, clinicId),
    prisma.clinicSite.findMany({
      where: { clinicId },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        active: true,
        isPrimary: true,
        locations: {
          where: { active: true },
          select: { id: true },
        },
      },
    }),
  ]);
  return {
    usage,
    allowance,
    groupCapacity:
      allowance.commercialPlan === "GROUP"
        ? {
            configured: allowance.purchasedAdditionalSiteQuantity !== null,
            commerciallyActive: allowance.capacityEntitlementActive,
            purchasedAdditionalSiteQuantity:
              allowance.purchasedAdditionalSiteQuantity,
            extraSiteAllowance: allowance.extraSiteAllowance,
            extraLocationAllowance: allowance.extraLocationAllowance,
          }
        : null,
    sites: sites.map((site) => ({
      id: site.id,
      name: site.name,
      slug: site.slug,
      active: site.active,
      isPrimary: site.isPrimary,
      activeLocations: site.active ? site.locations.length : 0,
      storedActiveLocations: site.locations.length,
    })),
  };
}
