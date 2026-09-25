import type { Prisma } from "@prisma/client";

import type { PracticeSettingsInput } from "@/lib/clinic-portal/practice-settings-schema";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";

const SITE_FIELDS = [
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
] as const satisfies readonly (keyof PracticeSettingsInput)[];

const LOCATION_FIELDS = [
  "phone",
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "postalCode",
  "contactUrl",
  "emergencyInstructions",
] as const satisfies readonly (keyof PracticeSettingsInput)[];

export type PracticeChromeDb = Prisma.TransactionClient;

function pick<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[]
): Pick<T, K> {
  const picked = {} as Pick<T, K>;
  for (const key of keys) {
    picked[key] = value[key];
  }
  return picked;
}

async function requirePrimaryRoot(
  db: PracticeChromeDb,
  clinicId: string
): Promise<{ siteId: string; locationId: string }> {
  const sites = await db.clinicSite.findMany({
    where: { clinicId, isPrimary: true, active: true },
    select: {
      id: true,
      clinicId: true,
      locations: {
        where: {
          servesSiteRoot: true,
          active: true,
          clinicId,
        },
        select: { id: true, clinicId: true, clinicSiteId: true },
      },
    },
  });

  if (sites.length !== 1) {
    throw new ClinicPortalError("Practice not found.", "not_found");
  }

  const site = sites[0];
  if (!site || site.clinicId !== clinicId || site.locations.length !== 1) {
    throw new ClinicPortalError("Practice not found.", "not_found");
  }

  const location = site.locations[0];
  if (
    !location ||
    location.clinicId !== clinicId ||
    location.clinicSiteId !== site.id
  ) {
    throw new ClinicPortalError("Practice not found.", "not_found");
  }

  return { siteId: site.id, locationId: location.id };
}

/**
 * Writes practice settings to the authoritative site and root location, and
 * mirrors the same values onto ClinicProfile for rollback compatibility.
 * Callers must invoke this inside a transaction.
 */
export async function syncPracticeSettings(
  db: PracticeChromeDb,
  input: { clinicId: string; values: PracticeSettingsInput }
): Promise<void> {
  const { siteId, locationId } = await requirePrimaryRoot(db, input.clinicId);

  await db.clinicSite.update({
    where: { id: siteId },
    data: pick(input.values, SITE_FIELDS),
  });
  await db.clinicLocation.update({
    where: { id: locationId },
    data: pick(input.values, LOCATION_FIELDS),
  });
  await db.clinicProfile.upsert({
    where: { clinicId: input.clinicId },
    update: input.values,
    create: {
      clinicId: input.clinicId,
      ...input.values,
    },
  });
}

export async function syncBrandingAssetReference(
  db: PracticeChromeDb,
  input: {
    clinicId: string;
    field: "logoUrl" | "darkLogoUrl" | "faviconUrl";
    storageKey: string | null;
  }
): Promise<void> {
  const sites = await db.clinicSite.findMany({
    where: { clinicId: input.clinicId, isPrimary: true, active: true },
    select: { id: true, clinicId: true },
  });
  if (sites.length !== 1 || sites[0]?.clinicId !== input.clinicId) {
    throw new ClinicPortalError("Practice profile is missing.", "not_found");
  }

  const profile = await db.clinicProfile.findUnique({
    where: { clinicId: input.clinicId },
    select: { clinicId: true },
  });
  if (!profile) {
    throw new ClinicPortalError("Practice profile is missing.", "not_found");
  }

  await db.clinicSite.update({
    where: { id: sites[0].id },
    data: { [input.field]: input.storageKey },
  });
  await db.clinicProfile.update({
    where: { clinicId: input.clinicId },
    data: { [input.field]: input.storageKey },
  });
}

/**
 * Writes a branding asset onto one ClinicSite. The primary site also updates
 * ClinicProfile. Other sites do not.
 */
export async function syncSiteBrandingAssetReference(
  db: PracticeChromeDb,
  input: {
    clinicId: string;
    siteId: string;
    field: "logoUrl" | "darkLogoUrl" | "faviconUrl";
    storageKey: string | null;
  }
): Promise<void> {
  const site = await db.clinicSite.findFirst({
    where: { id: input.siteId, clinicId: input.clinicId },
    select: { id: true, clinicId: true, isPrimary: true },
  });
  if (!site || site.clinicId !== input.clinicId) {
    throw new ClinicPortalError("Clinic site not found.", "not_found");
  }

  await db.clinicSite.update({
    where: { id: site.id },
    data: { [input.field]: input.storageKey },
  });

  if (!site.isPrimary) {
    return;
  }

  const profile = await db.clinicProfile.findUnique({
    where: { clinicId: input.clinicId },
    select: { clinicId: true },
  });
  if (!profile) {
    throw new ClinicPortalError("Practice profile is missing.", "not_found");
  }
  await db.clinicProfile.update({
    where: { clinicId: input.clinicId },
    data: { [input.field]: input.storageKey },
  });
}
