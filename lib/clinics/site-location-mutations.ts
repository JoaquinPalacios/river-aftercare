import "server-only";

import type { Prisma } from "@prisma/client";

import { brandingFromProfile } from "@/lib/clinics/primary-site-location.mjs";
import { isUniqueConstraintError } from "@/lib/clinics/prisma-errors";
import { reserveSiteLocationCapacity } from "@/lib/clinics/site-location-capacity";
import {
  assertLocationSlugAvailable,
  assertSiteSlug,
} from "@/lib/clinics/slug-collisions";
import type {
  CreateLocationInput,
  CreateSiteInput,
  LocationDetailsInput,
  SiteBrandingInput,
} from "@/lib/clinics/site-location-schemas";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { lockClinicAccountStructure } from "@/lib/entitlements/locks";
import { getPrisma } from "@/lib/prisma";

const PROFILE_BRANDING_FIELDS = [
  "displayName",
  "logoUrl",
  "darkLogoUrl",
  "faviconUrl",
  "primaryColor",
  "accentColor",
  "darkPrimaryColor",
  "darkAccentColor",
  "useCustomDarkBranding",
  "neutralColor",
  "radiusPreset",
  "typeface",
  "instructionTerminology",
  "themeMode",
  "allowPatientThemeToggle",
  "showCareGuideAttribution",
] as const satisfies readonly (keyof SiteBrandingInput)[];

function slugTaken(): ClinicPortalError {
  return new ClinicPortalError(
    "That address is already in use. Choose a different one.",
    "conflict"
  );
}

function capacityError(error: string): ClinicPortalError {
  return new ClinicPortalError(error, "capacity");
}

async function requireOwnedSite(
  db: Prisma.TransactionClient,
  clinicId: string,
  siteId: string
) {
  const site = await db.clinicSite.findFirst({
    where: { id: siteId, clinicId },
    select: {
      id: true,
      clinicId: true,
      active: true,
      isPrimary: true,
      slug: true,
    },
  });
  if (!site || site.clinicId !== clinicId) {
    throw new ClinicPortalError("Clinic site not found.", "not_found");
  }
  return site;
}

export async function createClinicSiteWithRootLocation(input: {
  clinicId: string;
  values: CreateSiteInput;
}): Promise<{ siteId: string; locationId: string }> {
  assertSiteSlug(input.values.siteSlug);
  try {
    return await getPrisma().$transaction(async (tx) => {
      await lockClinicAccountStructure(tx, input.clinicId);
      const reserved = await reserveSiteLocationCapacity(tx, {
        clinicId: input.clinicId,
        additionalSites: 1,
        additionalLocations: 1,
      });
      if (!reserved.ok) {
        throw capacityError(reserved.error);
      }

      const site = await tx.clinicSite.create({
        data: {
          clinicId: input.clinicId,
          name: input.values.siteName,
          slug: input.values.siteSlug,
          displayName: input.values.siteName,
          active: true,
          isPrimary: false,
          ...brandingFromProfile(null),
        },
      });
      const location = await tx.clinicLocation.create({
        data: {
          clinicSiteId: site.id,
          clinicId: input.clinicId,
          name: input.values.locationName,
          slug: null,
          displayName:
            input.values.locationDisplayName ?? input.values.locationName,
          phone: input.values.phone,
          addressLine1: input.values.addressLine1,
          addressLine2: input.values.addressLine2,
          city: input.values.city,
          region: input.values.region,
          postalCode: input.values.postalCode,
          country: input.values.country,
          contactUrl: input.values.contactUrl,
          contactEmail: input.values.contactEmail,
          bookingUrl: input.values.bookingUrl,
          emergencyInstructions: input.values.emergencyInstructions,
          isPrimary: true,
          servesSiteRoot: true,
          active: true,
        },
      });
      return { siteId: site.id, locationId: location.id };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw slugTaken();
    }
    throw error;
  }
}

export async function createClinicLocation(input: {
  clinicId: string;
  siteId: string;
  values: CreateLocationInput;
}): Promise<{ locationId: string }> {
  try {
    return await getPrisma().$transaction(async (tx) => {
      await lockClinicAccountStructure(tx, input.clinicId);
      const site = await requireOwnedSite(tx, input.clinicId, input.siteId);
      if (!site.active) {
        throw new ClinicPortalError(
          "Activate this clinic site before adding a location.",
          "conflict"
        );
      }
      const reserved = await reserveSiteLocationCapacity(tx, {
        clinicId: input.clinicId,
        additionalSites: 0,
        additionalLocations: 1,
      });
      if (!reserved.ok) {
        throw capacityError(reserved.error);
      }
      await assertLocationSlugAvailable(tx, {
        clinicId: input.clinicId,
        clinicSiteId: site.id,
        slug: input.values.slug,
      });
      const location = await tx.clinicLocation.create({
        data: {
          clinicSiteId: site.id,
          clinicId: input.clinicId,
          name: input.values.name,
          slug: input.values.slug,
          displayName: input.values.displayName,
          phone: input.values.phone,
          addressLine1: input.values.addressLine1,
          addressLine2: input.values.addressLine2,
          city: input.values.city,
          region: input.values.region,
          postalCode: input.values.postalCode,
          country: input.values.country,
          contactUrl: input.values.contactUrl,
          contactEmail: input.values.contactEmail,
          bookingUrl: input.values.bookingUrl,
          emergencyInstructions: input.values.emergencyInstructions,
          isPrimary: false,
          servesSiteRoot: false,
          active: true,
        },
      });
      return { locationId: location.id };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw slugTaken();
    }
    throw error;
  }
}

/** Updates physical details. Location and site slugs are not writable here. */
export async function updateClinicLocation(input: {
  clinicId: string;
  locationId: string;
  values: LocationDetailsInput;
}): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    await lockClinicAccountStructure(tx, input.clinicId);
    const location = await tx.clinicLocation.findFirst({
      where: { id: input.locationId, clinicId: input.clinicId },
      select: {
        id: true,
        clinicId: true,
        clinicSiteId: true,
        servesSiteRoot: true,
        slug: true,
        clinicSite: { select: { isPrimary: true, clinicId: true } },
      },
    });
    if (
      !location ||
      location.clinicId !== input.clinicId ||
      location.clinicSite.clinicId !== input.clinicId
    ) {
      throw new ClinicPortalError("Location not found.", "not_found");
    }

    await tx.clinicLocation.update({
      where: { id: location.id },
      data: {
        name: input.values.name,
        displayName: input.values.displayName,
        phone: input.values.phone,
        addressLine1: input.values.addressLine1,
        addressLine2: input.values.addressLine2,
        city: input.values.city,
        region: input.values.region,
        postalCode: input.values.postalCode,
        country: input.values.country,
        contactUrl: input.values.contactUrl,
        contactEmail: input.values.contactEmail,
        bookingUrl: input.values.bookingUrl,
        emergencyInstructions: input.values.emergencyInstructions,
      },
    });

    if (location.servesSiteRoot && location.clinicSite.isPrimary) {
      await tx.clinicProfile.update({
        where: { clinicId: input.clinicId },
        data: {
          phone: input.values.phone,
          addressLine1: input.values.addressLine1,
          addressLine2: input.values.addressLine2,
          city: input.values.city,
          region: input.values.region,
          postalCode: input.values.postalCode,
          country: input.values.country,
          contactUrl: input.values.contactUrl,
          contactEmail: input.values.contactEmail,
          bookingUrl: input.values.bookingUrl,
          emergencyInstructions: input.values.emergencyInstructions,
        },
      });
    }
  });
}

export async function deactivateClinicLocation(input: {
  clinicId: string;
  locationId: string;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  await getPrisma().$transaction(async (tx) => {
    await lockClinicAccountStructure(tx, input.clinicId);
    const location = await tx.clinicLocation.findFirst({
      where: { id: input.locationId, clinicId: input.clinicId },
      select: {
        id: true,
        clinicId: true,
        servesSiteRoot: true,
        active: true,
      },
    });
    if (!location || location.clinicId !== input.clinicId) {
      throw new ClinicPortalError("Location not found.", "not_found");
    }
    if (location.servesSiteRoot) {
      throw new ClinicPortalError(
        "The site root location stays active while the site is active. Deactivate the site instead.",
        "conflict"
      );
    }
    if (!location.active) {
      return;
    }
    await tx.clinicLocation.update({
      where: { id: location.id },
      data: { active: false, deactivatedAt: now },
    });
  });
}

export async function reactivateClinicLocation(input: {
  clinicId: string;
  locationId: string;
}): Promise<void> {
  try {
    await getPrisma().$transaction(async (tx) => {
      await lockClinicAccountStructure(tx, input.clinicId);
      const location = await tx.clinicLocation.findFirst({
        where: { id: input.locationId, clinicId: input.clinicId },
        select: {
          id: true,
          clinicId: true,
          active: true,
          servesSiteRoot: true,
          clinicSite: { select: { active: true, clinicId: true } },
        },
      });
      if (
        !location ||
        location.clinicId !== input.clinicId ||
        location.clinicSite.clinicId !== input.clinicId
      ) {
        throw new ClinicPortalError("Location not found.", "not_found");
      }
      if (location.servesSiteRoot) {
        throw new ClinicPortalError(
          "The site root location is not deactivated on its own.",
          "conflict"
        );
      }
      if (location.active) {
        return;
      }
      if (!location.clinicSite.active) {
        throw new ClinicPortalError(
          "Activate the clinic site before reactivating this location.",
          "conflict"
        );
      }
      const reserved = await reserveSiteLocationCapacity(tx, {
        clinicId: input.clinicId,
        additionalSites: 0,
        additionalLocations: 1,
      });
      if (!reserved.ok) {
        throw capacityError(reserved.error);
      }
      await tx.clinicLocation.update({
        where: { id: location.id },
        data: { active: true, deactivatedAt: null },
      });
    });
  } catch (error) {
    if (error instanceof ClinicPortalError) {
      throw error;
    }
    throw error;
  }
}

export async function updateClinicSiteBranding(input: {
  clinicId: string;
  siteId: string;
  values: SiteBrandingInput;
}): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    await lockClinicAccountStructure(tx, input.clinicId);
    const site = await requireOwnedSite(tx, input.clinicId, input.siteId);
    const branding = {
      displayName: input.values.displayName,
      logoUrl: input.values.logoUrl,
      darkLogoUrl: input.values.darkLogoUrl,
      faviconUrl: input.values.faviconUrl,
      primaryColor: input.values.primaryColor,
      accentColor: input.values.accentColor,
      darkPrimaryColor: input.values.darkPrimaryColor,
      darkAccentColor: input.values.darkAccentColor,
      useCustomDarkBranding: input.values.useCustomDarkBranding,
      neutralColor: input.values.neutralColor,
      radiusPreset: input.values.radiusPreset,
      typeface: input.values.typeface,
      instructionTerminology: input.values.instructionTerminology,
      themeMode: input.values.themeMode,
      allowPatientThemeToggle: input.values.allowPatientThemeToggle,
      showCareGuideAttribution: input.values.showCareGuideAttribution,
    };
    await tx.clinicSite.update({
      where: { id: site.id },
      data: {
        name: input.values.name,
        ...branding,
      },
    });
    if (!site.isPrimary) {
      return;
    }
    const profileData = Object.fromEntries(
      PROFILE_BRANDING_FIELDS.map((field) => [field, branding[field]])
    );
    await tx.clinicProfile.update({
      where: { clinicId: input.clinicId },
      data: profileData,
    });
  });
}

export async function deactivateClinicSite(input: {
  clinicId: string;
  siteId: string;
}): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    await lockClinicAccountStructure(tx, input.clinicId);
    const site = await requireOwnedSite(tx, input.clinicId, input.siteId);
    if (!site.active) {
      return;
    }
    await tx.clinicSite.update({
      where: { id: site.id },
      data: { active: false },
    });
  });
}

export async function reactivateClinicSite(input: {
  clinicId: string;
  siteId: string;
}): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    await lockClinicAccountStructure(tx, input.clinicId);
    const site = await requireOwnedSite(tx, input.clinicId, input.siteId);
    if (site.active) {
      return;
    }
    const dormantLocations = await tx.clinicLocation.count({
      where: {
        clinicId: input.clinicId,
        clinicSiteId: site.id,
        active: true,
      },
    });
    const reserved = await reserveSiteLocationCapacity(tx, {
      clinicId: input.clinicId,
      additionalSites: 1,
      additionalLocations: dormantLocations,
    });
    if (!reserved.ok) {
      const needed = dormantLocations;
      throw capacityError(
        reserved.code === "location_capacity"
          ? `Reactivating this site needs room for ${needed} active location${needed === 1 ? "" : "s"}. ${reserved.error}`
          : reserved.error
      );
    }
    await tx.clinicSite.update({
      where: { id: site.id },
      data: { active: true },
    });
  });
}
