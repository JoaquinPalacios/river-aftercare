import "server-only";

import type {
  ClinicInstructionTerminology,
  ClinicRadiusPreset,
  ClinicThemeMode,
  ClinicTypeface,
} from "@prisma/client";

import {
  composePatientProfile,
  singleRootLocation,
  type ComposedPatientProfile,
} from "@/lib/clinics/patient-profile";
import { isValidCareGuideSlug } from "@/lib/aftercare/slug";
import { getPrisma } from "@/lib/prisma";

export interface ClinicBySlugRecord {
  id: string;
  slug: string;
  name: string;
  profile: ComposedPatientProfile | null;
}

const patientSiteSelect = {
  id: true,
  clinicId: true,
  slug: true,
  displayName: true,
  active: true,
  logoUrl: true,
  darkLogoUrl: true,
  faviconUrl: true,
  primaryColor: true,
  accentColor: true,
  darkPrimaryColor: true,
  darkAccentColor: true,
  useCustomDarkBranding: true,
  neutralColor: true,
  radiusPreset: true,
  typeface: true,
  instructionTerminology: true,
  themeMode: true,
  allowPatientThemeToggle: true,
  showCareGuideAttribution: true,
  clinic: {
    select: {
      id: true,
      name: true,
    },
  },
  locations: {
    where: {
      servesSiteRoot: true,
      active: true,
    },
    select: {
      id: true,
      clinicId: true,
      clinicSiteId: true,
      phone: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      region: true,
      postalCode: true,
      country: true,
      bookingUrl: true,
      contactUrl: true,
      contactEmail: true,
      emergencyInstructions: true,
    },
  },
} as const;

type PatientSiteRow = {
  id: string;
  clinicId: string;
  slug: string;
  displayName: string;
  active: boolean;
  logoUrl: string | null;
  darkLogoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  darkPrimaryColor: string | null;
  darkAccentColor: string | null;
  useCustomDarkBranding: boolean;
  neutralColor: string | null;
  radiusPreset: ClinicRadiusPreset;
  typeface: ClinicTypeface | null;
  instructionTerminology: ClinicInstructionTerminology;
  themeMode: ClinicThemeMode;
  allowPatientThemeToggle: boolean;
  showCareGuideAttribution: boolean;
  clinic: { id: string; name: string } | null;
  locations: Array<{
    id: string;
    clinicId: string;
    clinicSiteId: string;
    phone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
    bookingUrl: string | null;
    contactUrl: string | null;
    contactEmail: string | null;
    emergencyInstructions: string | null;
  }>;
};

function tenantFromSite(site: PatientSiteRow): ClinicBySlugRecord | null {
  if (!site.active || !site.clinic || site.clinic.id !== site.clinicId) {
    return null;
  }

  const location = singleRootLocation(site, site.locations);
  if (!location || location.clinicSiteId !== site.id) {
    return null;
  }

  return {
    id: site.clinic.id,
    slug: site.slug,
    name: site.clinic.name,
    profile: composePatientProfile(site, location),
  };
}

/**
 * Resolves a public tenant hostname to its ClinicSite.
 * Clinic.slug is not consulted. An inactive site or a missing root location
 * fails closed.
 */
export async function getClinicBySlug(
  slug: string
): Promise<ClinicBySlugRecord | null> {
  if (!isValidCareGuideSlug(slug)) {
    return null;
  }

  const site = await getPrisma().clinicSite.findUnique({
    where: { slug },
    select: patientSiteSelect,
  });

  if (!site) {
    return null;
  }

  return tenantFromSite(site);
}

/** Staff and operator chrome for the account's primary site and root location. */
export async function getPrimaryPatientChrome(
  clinicId: string
): Promise<ClinicBySlugRecord | null> {
  const sites = await getPrisma().clinicSite.findMany({
    where: { clinicId, isPrimary: true, active: true },
    select: patientSiteSelect,
  });

  if (sites.length !== 1) {
    return null;
  }

  const site = sites[0];
  if (!site || site.clinicId !== clinicId) {
    return null;
  }

  return tenantFromSite(site);
}
