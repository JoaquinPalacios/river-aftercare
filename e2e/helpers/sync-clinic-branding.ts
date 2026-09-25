import type { Prisma } from "@prisma/client";

import { e2ePrisma } from "./prisma";

const BRANDING_FIELDS = [
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
] as const;

/**
 * E2E setup writes the authoritative ClinicSite branding reference and the
 * legacy ClinicProfile mirror together.
 */
export async function syncE2eClinicBranding(
  clinicId: string,
  data: Prisma.ClinicProfileUpdateInput
): Promise<void> {
  const siteData: Prisma.ClinicSiteUpdateManyMutationInput = {};
  for (const field of BRANDING_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      siteData[field] = data[field] as never;
    }
  }

  await e2ePrisma.$transaction([
    e2ePrisma.clinicProfile.update({
      where: { clinicId },
      data,
    }),
    e2ePrisma.clinicSite.updateMany({
      where: { clinicId, isPrimary: true },
      data: siteData,
    }),
  ]);
}
