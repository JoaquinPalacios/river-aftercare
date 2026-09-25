import "server-only";

import {
  composePatientProfile,
  type ComposedPatientProfile,
} from "@/lib/clinics/patient-profile";
import { isValidCareGuideSlug } from "@/lib/aftercare/slug";
import { getPrisma } from "@/lib/prisma";

export interface PatientLocationRecord {
  clinic: {
    id: string;
    slug: string;
    name: string;
  };
  siteId: string;
  locationId: string;
  placeName: string;
  locationSlug: string;
  profile: ComposedPatientProfile;
}

const locationSelect = {
  id: true,
  clinicId: true,
  clinicSiteId: true,
  name: true,
  slug: true,
  displayName: true,
  active: true,
  servesSiteRoot: true,
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
} as const;

/**
 * Resolves one additional location on the hostname's site.
 * Does not load the account's other sites or locations.
 */
export async function getPatientLocation(input: {
  siteSlug: string;
  locationSlug: string;
}): Promise<PatientLocationRecord | null> {
  if (
    !isValidCareGuideSlug(input.siteSlug) ||
    !isValidCareGuideSlug(input.locationSlug)
  ) {
    return null;
  }

  const site = await getPrisma().clinicSite.findUnique({
    where: { slug: input.siteSlug },
    select: {
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
      clinic: { select: { id: true, name: true } },
      locations: {
        where: {
          slug: input.locationSlug,
          active: true,
          servesSiteRoot: false,
        },
        take: 1,
        select: locationSelect,
      },
    },
  });

  const location = site?.locations[0];
  if (
    !site?.active ||
    !site.clinic ||
    site.clinic.id !== site.clinicId ||
    !location ||
    location.clinicId !== site.clinicId ||
    location.clinicSiteId !== site.id ||
    location.slug !== input.locationSlug ||
    location.servesSiteRoot
  ) {
    return null;
  }

  return {
    clinic: {
      id: site.clinic.id,
      slug: site.slug,
      name: site.clinic.name,
    },
    siteId: site.id,
    locationId: location.id,
    placeName: location.displayName.trim() || location.name,
    locationSlug: location.slug,
    profile: composePatientProfile(site, location),
  };
}
