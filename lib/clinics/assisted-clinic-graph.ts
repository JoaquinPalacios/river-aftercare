import type { Prisma } from "@prisma/client";

import {
  uniqueServiceCategories,
  type ServiceCategory,
} from "@/lib/aftercare/service-category";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import {
  primaryClinicSiteData,
  rootClinicLocationData,
} from "@/lib/clinics/primary-site-location.mjs";
import { lockClinicAccountStructure } from "@/lib/entitlements/locks";

export const ASSISTED_CLINIC_CATEGORY_REQUIRED_MESSAGE =
  "Select at least one practice category.";

/**
 * Clinic, profile, primary site, categories, and root location.
 * The caller holds the tenant-slug lock and has already rejected a taken,
 * reserved, retired, or demo slug. This takes the new account's structure
 * lock after the clinic id exists. It does not create a user, membership,
 * entitlement, or Stripe object.
 */
export async function insertAssistedClinicGraph(
  tx: Prisma.TransactionClient,
  values: {
    name: string;
    slug: string;
    serviceCategories: readonly ServiceCategory[];
  }
): Promise<{ id: string }> {
  const serviceCategories = uniqueServiceCategories(values.serviceCategories);
  if (serviceCategories.length === 0) {
    throw new ClinicPortalError(
      ASSISTED_CLINIC_CATEGORY_REQUIRED_MESSAGE,
      "invalid"
    );
  }

  const profile = { displayName: values.name };
  const clinic = await tx.clinic.create({
    data: {
      name: values.name,
      slug: values.slug,
      assistedOnboarding: true,
      profile: {
        create: profile,
      },
    },
    select: { id: true },
  });
  await lockClinicAccountStructure(tx, clinic.id);
  const site = await tx.clinicSite.create({
    data: primaryClinicSiteData({
      clinicId: clinic.id,
      clinicName: values.name,
      slug: values.slug,
      profile,
    }),
    select: { id: true },
  });
  await tx.clinicSiteServiceCategory.createMany({
    data: serviceCategories.map((serviceCategory) => ({
      clinicSiteId: site.id,
      clinicId: clinic.id,
      serviceCategory,
    })),
  });
  await tx.clinicLocation.create({
    data: rootClinicLocationData({
      clinicId: clinic.id,
      clinicSiteId: site.id,
      clinicName: values.name,
      profile,
    }),
  });
  return clinic;
}
