/**
 * Creates the primary ClinicSite and root ClinicLocation that accompany a
 * Clinic account. Patient runtime reads ClinicSite and the root location.
 * Seed uses deterministic ids so a re-seed matches the migration backfill.
 */

const NULLABLE_BRANDING_FIELDS = [
  "logoUrl",
  "darkLogoUrl",
  "faviconUrl",
  "primaryColor",
  "accentColor",
  "darkPrimaryColor",
  "darkAccentColor",
  "neutralColor",
  "typeface",
];

const BRANDING_DEFAULTS = {
  useCustomDarkBranding: false,
  radiusPreset: "MEDIUM",
  instructionTerminology: "AFTERCARE",
  themeMode: "SYSTEM",
  allowPatientThemeToggle: false,
  showCareGuideAttribution: true,
};

const CONTACT_FIELDS = [
  "phone",
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "postalCode",
  "country",
  "contactUrl",
  "contactEmail",
  "bookingUrl",
  "emergencyInstructions",
];

export function brandingFromProfile(profile) {
  const branding = {};
  for (const field of NULLABLE_BRANDING_FIELDS) {
    branding[field] = profile?.[field] ?? null;
  }
  for (const [field, fallback] of Object.entries(BRANDING_DEFAULTS)) {
    branding[field] = profile?.[field] ?? fallback;
  }
  return branding;
}

export function contactFromProfile(profile) {
  const contact = {};
  for (const field of CONTACT_FIELDS) {
    contact[field] = profile?.[field] ?? null;
  }
  return contact;
}

export function primaryClinicSiteData({ clinicId, clinicName, slug, profile }) {
  return {
    clinicId,
    name: clinicName,
    slug,
    displayName: profile?.displayName ?? clinicName,
    active: true,
    isPrimary: true,
    ...brandingFromProfile(profile),
  };
}

export function rootClinicLocationData({
  clinicId,
  clinicSiteId,
  clinicName,
  profile,
}) {
  const placeName = profile?.displayName ?? clinicName;
  return {
    clinicSiteId,
    clinicId,
    name: placeName,
    slug: null,
    displayName: placeName,
    ...contactFromProfile(profile),
    isPrimary: true,
    servesSiteRoot: true,
    active: true,
    deactivatedAt: null,
  };
}

export function backfilledSiteId(clinicId) {
  return `csite_${clinicId}`;
}

export function backfilledLocationId(clinicId) {
  return `cloc_${clinicId}`;
}

export async function ensurePrimarySiteAndRootLocation(
  db,
  { clinicId, clinicName, slug, profile }
) {
  const siteId = backfilledSiteId(clinicId);
  const locationId = backfilledLocationId(clinicId);
  const siteData = primaryClinicSiteData({
    clinicId,
    clinicName,
    slug,
    profile,
  });
  await db.clinicSite.upsert({
    where: { id: siteId },
    create: { id: siteId, ...siteData },
    update: siteData,
  });
  const locationData = rootClinicLocationData({
    clinicId,
    clinicSiteId: siteId,
    clinicName,
    profile,
  });
  await db.clinicLocation.upsert({
    where: { id: locationId },
    create: { id: locationId, ...locationData },
    update: locationData,
  });
  return { siteId, locationId };
}

export async function ensurePrimarySiteForClinic(db, clinicId) {
  const clinic = await db.clinic.findUnique({
    where: { id: clinicId },
    include: { profile: true },
  });
  if (!clinic) {
    throw new Error(`Clinic ${clinicId} was not found.`);
  }
  return ensurePrimarySiteAndRootLocation(db, {
    clinicId: clinic.id,
    clinicName: clinic.name,
    slug: clinic.slug,
    profile: clinic.profile,
  });
}
