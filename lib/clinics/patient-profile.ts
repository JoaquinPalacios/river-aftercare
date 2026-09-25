import type {
  ClinicInstructionTerminology,
  ClinicRadiusPreset,
  ClinicThemeMode,
  ClinicTypeface,
} from "@prisma/client";

/**
 * Patient chrome assembled from the authoritative site and its root location.
 * `displayName` is the site brand. Location display names are not substituted.
 */

export type ComposedPatientProfile = PatientSiteBranding &
  PatientLocationContact;
export type PatientSiteBranding = {
  displayName: string;
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
};

export type PatientLocationContact = {
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
};

export function composePatientProfile(
  site: PatientSiteBranding,
  location: PatientLocationContact
): ComposedPatientProfile {
  return {
    displayName: site.displayName,
    logoUrl: site.logoUrl,
    darkLogoUrl: site.darkLogoUrl,
    faviconUrl: site.faviconUrl,
    primaryColor: site.primaryColor,
    accentColor: site.accentColor,
    darkPrimaryColor: site.darkPrimaryColor,
    darkAccentColor: site.darkAccentColor,
    useCustomDarkBranding: site.useCustomDarkBranding,
    neutralColor: site.neutralColor,
    radiusPreset: site.radiusPreset,
    typeface: site.typeface,
    instructionTerminology: site.instructionTerminology,
    themeMode: site.themeMode,
    allowPatientThemeToggle: site.allowPatientThemeToggle,
    showCareGuideAttribution: site.showCareGuideAttribution,
    phone: location.phone,
    addressLine1: location.addressLine1,
    addressLine2: location.addressLine2,
    city: location.city,
    region: location.region,
    postalCode: location.postalCode,
    country: location.country,
    bookingUrl: location.bookingUrl,
    contactUrl: location.contactUrl,
    contactEmail: location.contactEmail,
    emergencyInstructions: location.emergencyInstructions,
  };
}

export function singleRootLocation<T extends { clinicId: string }>(
  site: { id: string; clinicId: string; active: boolean },
  locations: T[]
): T | null {
  if (!site.active || locations.length !== 1) {
    return null;
  }
  const location = locations[0];
  if (!location || location.clinicId !== site.clinicId) {
    return null;
  }
  return location;
}

export function publicPracticeName(input: {
  siteDisplayName?: string | null;
  accountName: string;
}): string {
  const brand = input.siteDisplayName?.trim();
  return brand && brand.length > 0 ? brand : input.accountName;
}
