import "server-only";

import type { CommercialPlan, Prisma } from "@prisma/client";

import {
  effectiveSiteLocationAllowance,
  type SiteLocationAllowance,
} from "@/lib/clinics/site-location-allowance";
import { lockClinicSiteLocationCapacity } from "@/lib/entitlements/locks";
import { getPrisma } from "@/lib/prisma";

type CapacityClient = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

export type SiteLocationUsage = {
  activeSites: number;
  activeLocations: number;
};

export type SiteLocationCapacity =
  | { ok: true; allowance: SiteLocationAllowance; usage: SiteLocationUsage }
  | {
      ok: false;
      code: "site_capacity" | "location_capacity";
      error: string;
      allowance: SiteLocationAllowance;
      usage: SiteLocationUsage;
    };

/**
 * Active locations are those that are active on an active site.
 * Locations under an inactive site do not consume location allowance.
 */
export async function countActiveSiteLocationUsage(
  db: CapacityClient,
  clinicId: string
): Promise<SiteLocationUsage> {
  const [activeSites, activeLocations] = await Promise.all([
    db.clinicSite.count({
      where: { clinicId, active: true },
    }),
    db.clinicLocation.count({
      where: {
        clinicId,
        active: true,
        clinicSite: { clinicId, active: true },
      },
    }),
  ]);
  return { activeSites, activeLocations };
}

export async function readAccountSiteLocationAllowance(
  db: CapacityClient,
  clinicId: string
): Promise<SiteLocationAllowance & { commercialPlan: CommercialPlan | null }> {
  const entitlement = await db.clinicEntitlement.findUnique({
    where: { clinicId },
    select: {
      commercialPlan: true,
      siteAllowance: true,
      locationAllowance: true,
    },
  });
  return {
    commercialPlan: entitlement?.commercialPlan ?? null,
    ...effectiveSiteLocationAllowance({ entitlement }),
  };
}

function capacityError(input: {
  kind: "site" | "location";
  allowance: SiteLocationAllowance;
  usage: SiteLocationUsage;
  plan: CommercialPlan | null;
}): string {
  if (input.kind === "site") {
    if (
      input.plan === "ESSENTIAL" ||
      input.plan === "PRACTICE" ||
      !input.plan
    ) {
      return input.plan === "PRACTICE"
        ? "Practice includes one clinic site. Another site needs a Group account."
        : "This account can have one clinic site.";
    }
    return `This account is using ${input.usage.activeSites} of ${input.allowance.siteAllowance} clinic sites. Deactivate a site before adding another. This does not change billing.`;
  }

  if (input.plan === "ESSENTIAL" || !input.plan) {
    return "This account can have one active location.";
  }
  return `This account is using ${input.usage.activeLocations} of ${input.allowance.locationAllowance} active locations. Deactivate a location or ask River Aftercare to raise the location allowance. This does not change billing.`;
}

/**
 * Call inside the transaction that creates or reactivates a site or location.
 * Takes the account advisory lock, then counts active usage.
 */
export async function reserveSiteLocationCapacity(
  tx: Prisma.TransactionClient,
  input: {
    clinicId: string;
    additionalSites: number;
    additionalLocations: number;
  }
): Promise<SiteLocationCapacity> {
  await lockClinicSiteLocationCapacity(tx, input.clinicId);
  const allowance = await readAccountSiteLocationAllowance(tx, input.clinicId);
  const usage = await countActiveSiteLocationUsage(tx, input.clinicId);
  const nextSites = usage.activeSites + input.additionalSites;
  const nextLocations = usage.activeLocations + input.additionalLocations;

  if (nextSites > allowance.siteAllowance) {
    return {
      ok: false,
      code: "site_capacity",
      error: capacityError({
        kind: "site",
        allowance,
        usage,
        plan: allowance.commercialPlan,
      }),
      allowance,
      usage,
    };
  }

  if (nextLocations > allowance.locationAllowance) {
    return {
      ok: false,
      code: "location_capacity",
      error: capacityError({
        kind: "location",
        allowance,
        usage,
        plan: allowance.commercialPlan,
      }),
      allowance,
      usage,
    };
  }

  return { ok: true, allowance, usage };
}
