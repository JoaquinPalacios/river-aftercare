import "server-only";

import type { Prisma, ServiceCategory } from "@prisma/client";

import { uniqueServiceCategories } from "@/lib/aftercare/service-category";
import { guideServiceMismatchMessage } from "@/lib/aftercare/service-compatibility";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { lockClinicAccountStructure } from "@/lib/entitlements/locks";
import { getPrisma } from "@/lib/prisma";

type CategoryDb = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

async function requireOwnedSite(
  db: CategoryDb,
  clinicId: string,
  siteId: string
) {
  const site = await db.clinicSite.findFirst({
    where: { id: siteId, clinicId },
    select: { id: true, clinicId: true },
  });
  if (!site || site.clinicId !== clinicId) {
    throw new ClinicPortalError("Clinic site not found.", "not_found");
  }
  return site;
}

export async function listAccountServiceCategories(
  db: CategoryDb,
  clinicId: string
): Promise<ServiceCategory[]> {
  const sites = await db.clinicSite.findMany({
    where: { clinicId, active: true },
    select: {
      clinicId: true,
      serviceCategories: { select: { serviceCategory: true } },
    },
  });
  return uniqueServiceCategories(
    sites
      .filter((site) => site.clinicId === clinicId)
      .flatMap((site) =>
        site.serviceCategories.map((row) => row.serviceCategory)
      )
  );
}

async function assertEnabledPlacementsRemainCompatible(
  db: CategoryDb,
  input: {
    clinicId: string;
    clinicSiteId: string;
    serviceCategories: ServiceCategory[];
  }
): Promise<void> {
  const site = await db.clinicSite.findFirst({
    where: { id: input.clinicSiteId, clinicId: input.clinicId },
    select: { id: true, name: true, clinicId: true },
  });
  if (!site || site.clinicId !== input.clinicId) {
    throw new ClinicPortalError("Clinic site not found.", "not_found");
  }
  const placements = await db.practiceGuidePlacement.findMany({
    where: {
      clinicId: input.clinicId,
      isEnabled: true,
      location: { clinicSiteId: site.id, clinicId: input.clinicId },
    },
    select: {
      location: { select: { name: true, clinicId: true } },
      practiceGuide: { select: { serviceCategory: true, clinicId: true } },
    },
  });
  for (const placement of placements) {
    if (
      placement.location.clinicId !== input.clinicId ||
      placement.practiceGuide.clinicId !== input.clinicId
    ) {
      throw new ClinicPortalError("Guide not found.", "not_found");
    }
    const message = guideServiceMismatchMessage({
      guideServiceCategory: placement.practiceGuide.serviceCategory,
      siteServiceCategories: input.serviceCategories,
      locationName: placement.location.name,
      siteName: site.name,
    });
    if (message) {
      throw new ClinicPortalError(message, "conflict");
    }
  }
}

export async function replaceClinicSiteServiceCategories(input: {
  clinicId: string;
  siteId: string;
  serviceCategories: ServiceCategory[];
}): Promise<void> {
  const categories = uniqueServiceCategories(input.serviceCategories);
  await getPrisma().$transaction(async (tx) => {
    await lockClinicAccountStructure(tx, input.clinicId);
    const site = await requireOwnedSite(tx, input.clinicId, input.siteId);
    await assertEnabledPlacementsRemainCompatible(tx, {
      clinicId: input.clinicId,
      clinicSiteId: site.id,
      serviceCategories: categories,
    });
    await tx.clinicSiteServiceCategory.deleteMany({
      where: { clinicSiteId: site.id, clinicId: input.clinicId },
    });
    if (categories.length === 0) {
      return;
    }
    await tx.clinicSiteServiceCategory.createMany({
      data: categories.map((serviceCategory) => ({
        clinicSiteId: site.id,
        clinicId: input.clinicId,
        serviceCategory,
      })),
    });
  });
}

/** Copies a site's categories onto another site in the destination account. */
export async function copyClinicSiteServiceCategories(
  tx: CategoryDb,
  input: {
    sourceClinicId: string;
    sourceClinicSiteId: string;
    destinationClinicId: string;
    destinationClinicSiteId: string;
  }
): Promise<void> {
  const source = await tx.clinicSite.findFirst({
    where: { id: input.sourceClinicSiteId, clinicId: input.sourceClinicId },
    select: {
      clinicId: true,
      serviceCategories: { select: { serviceCategory: true } },
    },
  });
  if (!source || source.clinicId !== input.sourceClinicId) {
    throw new ClinicPortalError("Clinic site not found.", "not_found");
  }
  const destination = await tx.clinicSite.findFirst({
    where: {
      id: input.destinationClinicSiteId,
      clinicId: input.destinationClinicId,
    },
    select: { id: true, clinicId: true },
  });
  if (!destination || destination.clinicId !== input.destinationClinicId) {
    throw new ClinicPortalError("Clinic site not found.", "not_found");
  }
  if (source.serviceCategories.length === 0) {
    return;
  }
  await tx.clinicSiteServiceCategory.createMany({
    data: source.serviceCategories.map((row) => ({
      clinicSiteId: destination.id,
      clinicId: input.destinationClinicId,
      serviceCategory: row.serviceCategory,
    })),
    skipDuplicates: true,
  });
}

export async function assignPrimarySiteServiceCategories(
  db: CategoryDb,
  clinicId: string,
  serviceCategories: ServiceCategory[]
): Promise<void> {
  const site = await db.clinicSite.findFirst({
    where: { clinicId, isPrimary: true },
    select: { id: true, clinicId: true },
  });
  if (!site || site.clinicId !== clinicId) {
    throw new ClinicPortalError("Clinic site not found.", "not_found");
  }
  const categories = uniqueServiceCategories(serviceCategories);
  await assertEnabledPlacementsRemainCompatible(db, {
    clinicId,
    clinicSiteId: site.id,
    serviceCategories: categories,
  });
  await db.clinicSiteServiceCategory.deleteMany({
    where: { clinicSiteId: site.id, clinicId },
  });
  if (categories.length === 0) {
    return;
  }
  await db.clinicSiteServiceCategory.createMany({
    data: categories.map((serviceCategory) => ({
      clinicSiteId: site.id,
      clinicId,
      serviceCategory,
    })),
  });
}
