import "server-only";

import type { CommercialPlan } from "@prisma/client";

import {
  countActiveSiteLocationUsage,
  readAccountSiteLocationAllowance,
} from "@/lib/clinics/site-location-capacity";
import {
  GROUP_BASE_LOCATION_ALLOWANCE,
  GROUP_BASE_SITE_ALLOWANCE,
} from "@/lib/clinics/site-location-allowance";
import { lockClinicAccountStructure } from "@/lib/entitlements/locks";
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
        siteAllowance: plan === "GROUP" ? sites : 1,
        locationAllowance:
          plan === "ESSENTIAL" || plan === null ? 1 : locations,
      },
    });
  });
  return { ok: true };
}

function allowancePlanError(
  plan: CommercialPlan | null,
  sites: number,
  locations: number
): string | null {
  if (plan === "GROUP") {
    return null;
  }
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
