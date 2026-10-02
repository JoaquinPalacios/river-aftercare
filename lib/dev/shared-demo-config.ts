import type { PrismaClient, ServiceCategory } from "@prisma/client";

import { DEMO_AFTERCARE_TENANT_SLUG } from "../aftercare/demo-tenant.ts";
import { SERVICE_CATEGORIES } from "../aftercare/service-category.ts";
import { ensurePrimarySiteAndRootLocation } from "../clinics/primary-site-location.mjs";
import {
  SHARED_DEMO_ACCOUNT,
  SHARED_DEMO_DISPLAY_NAME,
  SHARED_DEMO_PROFILE,
} from "./shared-demo-brand.ts";

const SHARED_DEMO_CATEGORIES: readonly ServiceCategory[] = SERVICE_CATEGORIES;

export interface SharedDemoConfigSnapshot {
  clinic: { id: string; slug: string; name: string } | null;
  site: { id: string; slug: string; displayName: string } | null;
  categories: ServiceCategory[];
  profile: {
    displayName: string;
    logoUrl: string | null;
    phone: string | null;
    addressLine1: string | null;
    primaryColor: string | null;
    contactEmail: string | null;
  } | null;
}

export type SharedDemoConfigPlan = {
  action: "refuse" | "noop" | "configure";
  reason: string;
  clinicId: string | null;
  siteId: string | null;
  missingCategories: ServiceCategory[];
  brandingChanges: string[];
  writesCategories: boolean;
  writesBranding: boolean;
};

export function planSharedDemoConfig(input: {
  local: boolean;
  apply: boolean;
  allowProduction: boolean;
  confirmSharedDemo: boolean;
  confirmBranding: boolean;
  snapshot: SharedDemoConfigSnapshot;
}): SharedDemoConfigPlan {
  const { snapshot } = input;
  const base = {
    clinicId: snapshot.clinic?.id ?? null,
    siteId: snapshot.site?.id ?? null,
    missingCategories: [] as ServiceCategory[],
    brandingChanges: brandingChanges(snapshot),
    writesCategories: false,
    writesBranding: false,
  };
  if (
    !snapshot.clinic ||
    snapshot.clinic.slug !== DEMO_AFTERCARE_TENANT_SLUG ||
    snapshot.clinic.id !== SHARED_DEMO_ACCOUNT.id ||
    !snapshot.site ||
    snapshot.site.slug !== DEMO_AFTERCARE_TENANT_SLUG
  ) {
    return {
      ...base,
      action: "refuse",
      reason:
        "The existing shared demo account was not found. This command does not create an account.",
    };
  }
  const missingCategories = SHARED_DEMO_CATEGORIES.filter(
    (category) => !snapshot.categories.includes(category)
  );
  const branding = brandingChanges(snapshot);
  if (!input.apply) {
    if (missingCategories.length === 0 && branding.length === 0) {
      return {
        ...base,
        missingCategories,
        brandingChanges: branding,
        action: "noop",
        reason:
          "Dry-run: the shared demo already has every category and the neutral brand.",
      };
    }
    return {
      ...base,
      missingCategories,
      brandingChanges: branding,
      action: "configure",
      reason:
        "Dry-run: no writes. Apply adds missing service categories. Branding changes only when --confirm-branding is also set.",
    };
  }
  if (!input.local && (!input.allowProduction || !input.confirmSharedDemo)) {
    return {
      ...base,
      missingCategories,
      brandingChanges: branding,
      action: "refuse",
      reason:
        "Remote configuration is refused. Pass --allow-production and --confirm-shared-demo. This command does not create an account, a sample, or a practice guide.",
    };
  }
  const writesCategories = missingCategories.length > 0;
  const writesBranding = input.confirmBranding && branding.length > 0;
  if (!writesCategories && !writesBranding) {
    return {
      ...base,
      missingCategories,
      brandingChanges: branding,
      action: "noop",
      reason: input.confirmBranding
        ? "The shared demo already matches this configuration."
        : "Service categories already match. Branding was not changed. Pass --confirm-branding to update it.",
    };
  }
  return {
    ...base,
    missingCategories,
    brandingChanges: branding,
    writesCategories,
    writesBranding,
    action: "configure",
    reason: writesBranding
      ? "Apply will add missing categories and set the neutral shared-demo brand."
      : "Apply will add missing categories. Branding stays as it is.",
  };
}

function brandingChanges(snapshot: SharedDemoConfigSnapshot): string[] {
  const profile = snapshot.profile;
  if (!profile || !snapshot.clinic || !snapshot.site) {
    return [];
  }
  const changes: string[] = [];
  if (snapshot.clinic.name !== SHARED_DEMO_DISPLAY_NAME) {
    changes.push("account name");
  }
  if (
    snapshot.site.displayName !== SHARED_DEMO_DISPLAY_NAME ||
    profile.displayName !== SHARED_DEMO_DISPLAY_NAME
  ) {
    changes.push("display name");
  }
  if (profile.logoUrl !== SHARED_DEMO_PROFILE.logoUrl) {
    changes.push("logo");
  }
  if (profile.primaryColor !== SHARED_DEMO_PROFILE.primaryColor) {
    changes.push("colour");
  }
  if (profile.phone) {
    changes.push("phone");
  }
  if (profile.addressLine1) {
    changes.push("address");
  }
  if (profile.contactEmail) {
    changes.push("email");
  }
  return changes;
}

export async function loadSharedDemoConfigSnapshot(
  prisma: PrismaClient
): Promise<SharedDemoConfigSnapshot> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: SHARED_DEMO_ACCOUNT.id },
    select: {
      id: true,
      slug: true,
      name: true,
      profile: {
        select: {
          displayName: true,
          logoUrl: true,
          phone: true,
          addressLine1: true,
          primaryColor: true,
          contactEmail: true,
        },
      },
      sites: {
        where: { isPrimary: true },
        select: {
          id: true,
          slug: true,
          displayName: true,
          serviceCategories: { select: { serviceCategory: true } },
        },
      },
    },
  });
  const site = clinic?.sites[0] ?? null;
  return {
    clinic: clinic
      ? { id: clinic.id, slug: clinic.slug, name: clinic.name }
      : null,
    site: site
      ? { id: site.id, slug: site.slug, displayName: site.displayName }
      : null,
    categories: site?.serviceCategories.map((row) => row.serviceCategory) ?? [],
    profile: clinic?.profile ?? null,
  };
}

/**
 * Adds missing service categories on the existing shared demo.
 * Branding is written only when the plan says so.
 * Practice guides, revisions, and samples are not touched.
 */
export async function applySharedDemoConfig(
  prisma: PrismaClient,
  plan: SharedDemoConfigPlan
): Promise<void> {
  if (plan.action !== "configure" || !plan.clinicId || !plan.siteId) {
    return;
  }
  if (plan.writesCategories) {
    for (const serviceCategory of plan.missingCategories) {
      await prisma.clinicSiteServiceCategory.upsert({
        where: {
          clinicSiteId_serviceCategory: {
            clinicSiteId: plan.siteId,
            serviceCategory,
          },
        },
        create: {
          clinicSiteId: plan.siteId,
          clinicId: plan.clinicId,
          serviceCategory,
        },
        update: {},
      });
    }
  }
  if (!plan.writesBranding) {
    return;
  }
  await prisma.clinic.update({
    where: { id: plan.clinicId },
    data: { name: SHARED_DEMO_DISPLAY_NAME },
  });
  await prisma.clinicProfile.upsert({
    where: { clinicId: plan.clinicId },
    update: SHARED_DEMO_PROFILE,
    create: { clinicId: plan.clinicId, ...SHARED_DEMO_PROFILE },
  });
  const profile = await prisma.clinicProfile.findUniqueOrThrow({
    where: { clinicId: plan.clinicId },
  });
  await ensurePrimarySiteAndRootLocation(prisma, {
    clinicId: plan.clinicId,
    clinicName: SHARED_DEMO_DISPLAY_NAME,
    slug: DEMO_AFTERCARE_TENANT_SLUG,
    profile,
  });
}
