import "server-only";

import { getPrisma } from "@/lib/prisma";
import { isValidCareGuideSlug } from "@/lib/aftercare/slug";

export interface ClinicBySlugRecord {
  id: string;
  slug: string;
  name: string;
  profile: {
    displayName: string;
    logoUrl: string | null;
    darkLogoUrl?: string | null;
    faviconUrl?: string | null;
    primaryColor: string | null;
    accentColor: string | null;
    darkPrimaryColor?: string | null;
    darkAccentColor?: string | null;
    useCustomDarkBranding?: boolean;
    neutralColor: string | null;
    radiusPreset: string;
    instructionTerminology: string;
    themeMode: string;
    allowPatientThemeToggle: boolean;
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
    showCareGuideAttribution: boolean;
    typeface: string | null;
  } | null;
}

export const clinicBySlugSelect = {
  id: true,
  slug: true,
  name: true,
  profile: {
    select: {
      displayName: true,
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
      instructionTerminology: true,
      themeMode: true,
      allowPatientThemeToggle: true,
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
      showCareGuideAttribution: true,
      typeface: true,
    },
  },
} as const;

export async function getClinicBySlug(
  slug: string
): Promise<ClinicBySlugRecord | null> {
  if (!isValidCareGuideSlug(slug)) {
    return null;
  }

  return getPrisma().clinic.findUnique({
    where: { slug },
    select: clinicBySlugSelect,
  });
}
