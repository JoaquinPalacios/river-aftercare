import type { Prisma, PrismaClient, ServiceCategory } from "@prisma/client";

import { DEMO_AFTERCARE_TENANT_SLUG } from "../aftercare/demo-tenant.ts";
import { SERVICE_CATEGORIES } from "../aftercare/service-category.ts";
import {
  SHARED_DEMO_DISPLAY_NAME,
  SHARED_DEMO_EMERGENCY_INSTRUCTIONS,
} from "./shared-demo-brand.ts";

const SHARED_DEMO_CATEGORIES: readonly ServiceCategory[] = SERVICE_CATEGORIES;

/**
 * Visual brand stored on the profile and the primary site.
 * The configuration command reports these values and never writes them.
 * Production keeps its current colour, logo, and theme. The local seed
 * keeps its own stored brand. Neither is replaced with the other.
 */
export const SHARED_DEMO_RETAINED_BRAND_FIELDS = [
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

export type SharedDemoRetainedBrandField =
  (typeof SHARED_DEMO_RETAINED_BRAND_FIELDS)[number];

const CONTACT_FIELDS = [
  "phone",
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "postalCode",
  "country",
  "bookingUrl",
  "contactUrl",
  "contactEmail",
] as const;

export interface SharedDemoBrandState {
  logoUrl: string | null;
  darkLogoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  darkPrimaryColor: string | null;
  darkAccentColor: string | null;
  useCustomDarkBranding: boolean;
  neutralColor: string | null;
  radiusPreset: string;
  typeface: string | null;
  instructionTerminology: string;
  themeMode: string;
  allowPatientThemeToggle: boolean;
  showCareGuideAttribution: boolean;
}

export interface SharedDemoContactState {
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
}

export interface SharedDemoClinicRecord {
  id: string;
  slug: string;
  name: string;
}

export interface SharedDemoSiteRecord {
  id: string;
  clinicId: string;
  slug: string;
  name: string;
  displayName: string;
  active: boolean;
  isPrimary: boolean;
  brand: SharedDemoBrandState;
}

export interface SharedDemoLocationRecord {
  id: string;
  clinicId: string;
  clinicSiteId: string;
  name: string;
  displayName: string;
  slug: string | null;
  active: boolean;
  servesSiteRoot: boolean;
  contact: SharedDemoContactState;
}

export interface SharedDemoProfileRecord {
  displayName: string;
  brand: SharedDemoBrandState;
  contact: SharedDemoContactState;
}

/**
 * Independent lookups for the one demodental account.
 * Slug queries and id re-reads must describe the same rows.
 */
export interface SharedDemoIdentityInput {
  clinicsBySlug: readonly SharedDemoClinicRecord[];
  clinicById: SharedDemoClinicRecord | null;
  sitesBySlug: readonly SharedDemoSiteRecord[];
  siteById: SharedDemoSiteRecord | null;
  primarySites: readonly SharedDemoSiteRecord[];
  rootLocations: readonly SharedDemoLocationRecord[];
  rootLocationById: SharedDemoLocationRecord | null;
  profile: SharedDemoProfileRecord | null;
}

export interface SharedDemoConfigSnapshot {
  identityRefusal: string | null;
  clinic: SharedDemoClinicRecord | null;
  site: SharedDemoSiteRecord | null;
  location: SharedDemoLocationRecord | null;
  categories: ServiceCategory[];
  profile: SharedDemoProfileRecord | null;
}

export interface SharedDemoFieldReport {
  label: string;
  current: string;
  proposed: string;
}

export type SharedDemoConfigPlan = {
  action: "refuse" | "noop" | "configure";
  reason: string;
  clinicId: string | null;
  siteId: string | null;
  locationId: string | null;
  missingCategories: ServiceCategory[];
  writesCategories: boolean;
  /** Public name, contact details, and emergency instructions. Never colour, logo, or theme. */
  writesIdentity: boolean;
  identityFields: SharedDemoFieldReport[];
  contactFields: SharedDemoFieldReport[];
  emergencyFields: SharedDemoFieldReport[];
  retainedProfileBrand: SharedDemoFieldReport[];
  retainedSiteBrand: SharedDemoFieldReport[];
  categoryReport: SharedDemoFieldReport;
};

const PROPOSED_CONTACT: SharedDemoContactState = {
  phone: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  region: null,
  postalCode: null,
  country: null,
  bookingUrl: null,
  contactUrl: null,
  contactEmail: null,
  emergencyInstructions: SHARED_DEMO_EMERGENCY_INSTRUCTIONS,
};

/**
 * Fields written when `--confirm-branding` is set.
 * Colour, logo, and theme are absent on purpose.
 */
export const SHARED_DEMO_PROFILE_IDENTITY_UPDATE = {
  displayName: SHARED_DEMO_DISPLAY_NAME,
  phone: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  region: null,
  postalCode: null,
  country: null,
  bookingUrl: null,
  contactUrl: null,
  contactEmail: null,
  emergencyInstructions: SHARED_DEMO_EMERGENCY_INSTRUCTIONS,
} as const;

export const SHARED_DEMO_SITE_IDENTITY_UPDATE = {
  name: SHARED_DEMO_DISPLAY_NAME,
  displayName: SHARED_DEMO_DISPLAY_NAME,
} as const;

export const SHARED_DEMO_LOCATION_IDENTITY_UPDATE = {
  name: SHARED_DEMO_DISPLAY_NAME,
  displayName: SHARED_DEMO_DISPLAY_NAME,
  phone: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  region: null,
  postalCode: null,
  country: null,
  bookingUrl: null,
  contactUrl: null,
  contactEmail: null,
  emergencyInstructions: SHARED_DEMO_EMERGENCY_INSTRUCTIONS,
} as const;

const brandSelect = {
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
} satisfies Prisma.ClinicProfileSelect;

const contactSelect = {
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
} satisfies Prisma.ClinicLocationSelect;

function emptySnapshot(
  identityRefusal: string | null
): SharedDemoConfigSnapshot {
  return {
    identityRefusal,
    clinic: null,
    site: null,
    location: null,
    categories: [],
    profile: null,
  };
}

function sameClinic(
  left: SharedDemoClinicRecord,
  right: SharedDemoClinicRecord
): boolean {
  return (
    left.id === right.id && left.slug === right.slug && left.name === right.name
  );
}

function sameSite(
  left: SharedDemoSiteRecord,
  right: SharedDemoSiteRecord
): boolean {
  return (
    left.id === right.id &&
    left.clinicId === right.clinicId &&
    left.slug === right.slug &&
    left.isPrimary === right.isPrimary &&
    left.active === right.active
  );
}

function sameLocation(
  left: SharedDemoLocationRecord,
  right: SharedDemoLocationRecord
): boolean {
  return (
    left.id === right.id &&
    left.clinicId === right.clinicId &&
    left.clinicSiteId === right.clinicSiteId &&
    left.slug === right.slug &&
    left.servesSiteRoot === right.servesSiteRoot &&
    left.active === right.active
  );
}

/**
 * Resolves the shared demo from the unique account slug `demodental`.
 * The local seed id and a production id both pass when the account, primary
 * site, and root location are one consistent graph. A mismatched id, an
 * extra row, or a missing row is refused. Nothing is created.
 */
export function assessSharedDemoIdentity(
  input: SharedDemoIdentityInput,
  categories: readonly ServiceCategory[] = []
): SharedDemoConfigSnapshot {
  if (input.clinicsBySlug.length === 0) {
    return emptySnapshot(
      "The existing shared demo account was not found. This command does not create an account, a site, or a location."
    );
  }
  if (input.clinicsBySlug.length > 1) {
    return emptySnapshot(
      "More than one account uses the slug demodental. This command does not choose between them."
    );
  }
  const clinic = input.clinicsBySlug[0];
  if (!clinic) {
    return emptySnapshot(
      "The existing shared demo account was not found. This command does not create an account, a site, or a location."
    );
  }
  if (clinic.slug !== DEMO_AFTERCARE_TENANT_SLUG) {
    return emptySnapshot(
      "The account slug is not demodental. This command does not create an account."
    );
  }
  if (!input.clinicById || !sameClinic(input.clinicById, clinic)) {
    return {
      ...emptySnapshot(
        "The account id does not match the demodental account. This command does not create an account."
      ),
      clinic,
    };
  }

  if (input.sitesBySlug.length === 0) {
    return {
      ...emptySnapshot(
        "The demodental account has no site with slug demodental. This command does not create a site."
      ),
      clinic,
      profile: input.profile,
    };
  }
  if (input.sitesBySlug.length > 1) {
    return {
      ...emptySnapshot(
        "More than one site uses the slug demodental. This command does not choose between them."
      ),
      clinic,
    };
  }
  const site = input.sitesBySlug[0];
  if (!site || site.slug !== DEMO_AFTERCARE_TENANT_SLUG) {
    return {
      ...emptySnapshot(
        "The site slug is not demodental. This command does not create a site."
      ),
      clinic,
    };
  }
  if (site.clinicId !== clinic.id) {
    return {
      ...emptySnapshot(
        "The site with slug demodental belongs to a different account. This command does not create a site."
      ),
      clinic,
    };
  }
  if (!site.isPrimary) {
    return {
      ...emptySnapshot(
        "The site with slug demodental is not the account's primary site. This command does not create a site."
      ),
      clinic,
      site,
    };
  }
  if (!site.active) {
    return {
      ...emptySnapshot(
        "The shared demo primary site is inactive. This command does not create a site."
      ),
      clinic,
      site,
    };
  }
  if (!input.siteById || !sameSite(input.siteById, site)) {
    return {
      ...emptySnapshot(
        "The site id does not match the demodental site. This command does not create a site."
      ),
      clinic,
      site,
    };
  }
  if (input.primarySites.length === 0) {
    return {
      ...emptySnapshot(
        "The demodental account has no primary site. This command does not create a site."
      ),
      clinic,
      site,
    };
  }
  if (input.primarySites.length > 1) {
    return {
      ...emptySnapshot(
        "The demodental account has more than one primary site. This command does not choose between them."
      ),
      clinic,
    };
  }
  const primarySite = input.primarySites[0];
  if (
    !primarySite ||
    primarySite.id !== site.id ||
    primarySite.slug !== DEMO_AFTERCARE_TENANT_SLUG ||
    primarySite.clinicId !== clinic.id
  ) {
    return {
      ...emptySnapshot(
        "The primary site is not the demodental site. This command does not create a site."
      ),
      clinic,
      site,
    };
  }

  if (input.rootLocations.length === 0) {
    return {
      ...emptySnapshot(
        "The demodental site has no root location. This command does not create a location."
      ),
      clinic,
      site,
      profile: input.profile,
    };
  }
  if (input.rootLocations.length > 1) {
    return {
      ...emptySnapshot(
        "The demodental site has more than one root location. This command does not choose between them."
      ),
      clinic,
      site,
    };
  }
  const location = input.rootLocations[0];
  if (
    !location ||
    location.clinicId !== clinic.id ||
    location.clinicSiteId !== site.id
  ) {
    return {
      ...emptySnapshot(
        "The root location does not belong to the demodental site. This command does not create a location."
      ),
      clinic,
      site,
    };
  }
  if (location.slug !== null || !location.servesSiteRoot) {
    return {
      ...emptySnapshot(
        "The location on the demodental site is not the site-root location. This command does not create a location."
      ),
      clinic,
      site,
      location,
    };
  }
  if (!location.active) {
    return {
      ...emptySnapshot(
        "The shared demo root location is inactive. This command does not create a location."
      ),
      clinic,
      site,
      location,
    };
  }
  if (
    !input.rootLocationById ||
    !sameLocation(input.rootLocationById, location)
  ) {
    return {
      ...emptySnapshot(
        "The root location id does not match the demodental site root. This command does not create a location."
      ),
      clinic,
      site,
      location,
    };
  }
  if (!input.profile) {
    return {
      ...emptySnapshot(
        "The demodental account has no profile. This command does not create a profile."
      ),
      clinic,
      site,
      location,
    };
  }

  return {
    identityRefusal: null,
    clinic,
    site,
    location,
    profile: input.profile,
    categories: [...categories],
  };
}

function displayValue(value: string | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "(empty)";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return value;
}

function field(
  label: string,
  current: string | boolean | null | undefined,
  proposed: string | boolean | null | undefined
): SharedDemoFieldReport {
  return {
    label,
    current: displayValue(current),
    proposed: displayValue(proposed),
  };
}

function contactFields(
  scope: string,
  contact: SharedDemoContactState | null
): SharedDemoFieldReport[] {
  return CONTACT_FIELDS.map((name) =>
    field(`${scope} ${name}`, contact?.[name] ?? null, PROPOSED_CONTACT[name])
  );
}

function brandFields(
  scope: string,
  brand: SharedDemoBrandState | null
): SharedDemoFieldReport[] {
  return SHARED_DEMO_RETAINED_BRAND_FIELDS.map((name) =>
    field(`${scope} ${name}`, brand?.[name] ?? null, brand?.[name] ?? null)
  );
}

function categoryLabel(categories: readonly ServiceCategory[]): string {
  const ordered = SHARED_DEMO_CATEGORIES.filter((category) =>
    categories.includes(category)
  );
  return ordered.length > 0 ? ordered.join(", ") : "(none)";
}

export function describeSharedDemoConfig(snapshot: SharedDemoConfigSnapshot): {
  identityFields: SharedDemoFieldReport[];
  contactFields: SharedDemoFieldReport[];
  emergencyFields: SharedDemoFieldReport[];
  retainedProfileBrand: SharedDemoFieldReport[];
  retainedSiteBrand: SharedDemoFieldReport[];
  categoryReport: SharedDemoFieldReport;
} {
  return {
    identityFields: [
      field(
        "account name",
        snapshot.clinic?.name ?? null,
        SHARED_DEMO_DISPLAY_NAME
      ),
      field(
        "profile display name",
        snapshot.profile?.displayName ?? null,
        SHARED_DEMO_DISPLAY_NAME
      ),
      field("site name", snapshot.site?.name ?? null, SHARED_DEMO_DISPLAY_NAME),
      field(
        "site display name",
        snapshot.site?.displayName ?? null,
        SHARED_DEMO_DISPLAY_NAME
      ),
      field(
        "root location name",
        snapshot.location?.name ?? null,
        SHARED_DEMO_DISPLAY_NAME
      ),
      field(
        "root location display name",
        snapshot.location?.displayName ?? null,
        SHARED_DEMO_DISPLAY_NAME
      ),
    ],
    contactFields: [
      ...contactFields("profile", snapshot.profile?.contact ?? null),
      ...contactFields("root location", snapshot.location?.contact ?? null),
    ],
    emergencyFields: [
      field(
        "profile emergency instructions",
        snapshot.profile?.contact.emergencyInstructions ?? null,
        SHARED_DEMO_EMERGENCY_INSTRUCTIONS
      ),
      field(
        "root location emergency instructions",
        snapshot.location?.contact.emergencyInstructions ?? null,
        SHARED_DEMO_EMERGENCY_INSTRUCTIONS
      ),
    ],
    retainedProfileBrand: brandFields(
      "profile",
      snapshot.profile?.brand ?? null
    ),
    retainedSiteBrand: brandFields("site", snapshot.site?.brand ?? null),
    categoryReport: field(
      "service categories",
      categoryLabel(snapshot.categories),
      SHARED_DEMO_CATEGORIES.join(", ")
    ),
  };
}

function differs(fields: readonly SharedDemoFieldReport[]): boolean {
  return fields.some((item) => item.current !== item.proposed);
}

export function planSharedDemoConfig(input: {
  local: boolean;
  apply: boolean;
  allowProduction: boolean;
  confirmSharedDemo: boolean;
  confirmBranding: boolean;
  snapshot: SharedDemoConfigSnapshot;
}): SharedDemoConfigPlan {
  const description = describeSharedDemoConfig(input.snapshot);
  const base = {
    clinicId: input.snapshot.clinic?.id ?? null,
    siteId: input.snapshot.site?.id ?? null,
    locationId: input.snapshot.location?.id ?? null,
    missingCategories: [] as ServiceCategory[],
    writesCategories: false,
    writesIdentity: false,
    ...description,
  };
  if (
    input.snapshot.identityRefusal ||
    !input.snapshot.clinic ||
    !input.snapshot.site ||
    !input.snapshot.location ||
    !input.snapshot.profile
  ) {
    return {
      ...base,
      action: "refuse",
      reason:
        input.snapshot.identityRefusal ??
        "The existing shared demo account was not found. This command does not create an account, a site, or a location.",
    };
  }

  const missingCategories = SHARED_DEMO_CATEGORIES.filter(
    (category) => !input.snapshot.categories.includes(category)
  );
  const identityDiffers =
    differs(description.identityFields) ||
    differs(description.contactFields) ||
    differs(description.emergencyFields);
  const withCategories = { ...base, missingCategories };

  if (!input.apply) {
    if (missingCategories.length === 0 && !identityDiffers) {
      return {
        ...withCategories,
        action: "noop",
        reason:
          "Dry-run: the shared demo already has every service category and the River Aftercare Demo Clinic identity. Stored colours, logo, and theme are retained.",
      };
    }
    return {
      ...withCategories,
      action: "configure",
      reason:
        "Dry-run: no writes. Apply adds missing service categories only. Stored colours, logo, and theme stay as they are. The public name, contact details, and emergency instructions change only when --confirm-branding is also set.",
    };
  }
  if (!input.local && (!input.allowProduction || !input.confirmSharedDemo)) {
    return {
      ...withCategories,
      action: "refuse",
      reason:
        "Remote configuration is refused. Pass --allow-production and --confirm-shared-demo. This command does not create an account, a site, a location, a sample, or a practice guide.",
    };
  }

  const writesCategories = missingCategories.length > 0;
  const writesIdentity = input.confirmBranding && identityDiffers;
  if (!writesCategories && !writesIdentity) {
    return {
      ...withCategories,
      action: "noop",
      reason: input.confirmBranding
        ? "The shared demo already matches this configuration. Stored colours, logo, and theme were left unchanged."
        : "Service categories already match. Stored colours, logo, and theme were left unchanged. Pass --confirm-branding to update the public name, contact details, and emergency instructions.",
    };
  }
  return {
    ...withCategories,
    writesCategories,
    writesIdentity,
    action: "configure",
    reason: writesIdentity
      ? "Apply will add missing service categories and update the public name, contact details, and emergency instructions. Stored colours, logo, and theme stay as they are."
      : "Apply will add missing service categories. Stored colours, logo, theme, contact details, and emergency instructions stay as they are.",
  };
}

export function formatSharedDemoConfigReport(
  plan: SharedDemoConfigPlan
): string {
  const lines = [
    `Account id: ${plan.clinicId ?? "(not found)"}`,
    `Site id: ${plan.siteId ?? "(not found)"}`,
    `Root location id: ${plan.locationId ?? "(not found)"}`,
    "Identity:",
    ...plan.identityFields.map(formatField),
    "Service categories:",
    formatField(plan.categoryReport),
    "Contact details:",
    ...plan.contactFields.map(formatField),
    "Emergency instructions:",
    ...plan.emergencyFields.map(formatField),
    "Retained profile branding:",
    ...plan.retainedProfileBrand.map(formatField),
    "Retained site branding:",
    ...plan.retainedSiteBrand.map(formatField),
    "Category writes: " + (plan.writesCategories ? "yes" : "no"),
    "Identity writes: " + (plan.writesIdentity ? "yes" : "no"),
    "Branding writes: no",
  ];
  return lines.join("\n");
}

function formatField(item: SharedDemoFieldReport): string {
  return `  ${item.label}: ${item.current} → ${item.proposed}`;
}

function brandFrom(
  row: Prisma.ClinicProfileGetPayload<{ select: typeof brandSelect }>
): SharedDemoBrandState {
  return {
    logoUrl: row.logoUrl,
    darkLogoUrl: row.darkLogoUrl,
    faviconUrl: row.faviconUrl,
    primaryColor: row.primaryColor,
    accentColor: row.accentColor,
    darkPrimaryColor: row.darkPrimaryColor,
    darkAccentColor: row.darkAccentColor,
    useCustomDarkBranding: row.useCustomDarkBranding,
    neutralColor: row.neutralColor,
    radiusPreset: row.radiusPreset,
    typeface: row.typeface,
    instructionTerminology: row.instructionTerminology,
    themeMode: row.themeMode,
    allowPatientThemeToggle: row.allowPatientThemeToggle,
    showCareGuideAttribution: row.showCareGuideAttribution,
  };
}

function contactFrom(
  row: Prisma.ClinicLocationGetPayload<{ select: typeof contactSelect }>
): SharedDemoContactState {
  return {
    phone: row.phone,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    region: row.region,
    postalCode: row.postalCode,
    country: row.country,
    bookingUrl: row.bookingUrl,
    contactUrl: row.contactUrl,
    contactEmail: row.contactEmail,
    emergencyInstructions: row.emergencyInstructions,
  };
}

const siteSelect = {
  id: true,
  clinicId: true,
  slug: true,
  name: true,
  displayName: true,
  active: true,
  isPrimary: true,
  ...brandSelect,
} satisfies Prisma.ClinicSiteSelect;

const locationSelect = {
  id: true,
  clinicId: true,
  clinicSiteId: true,
  name: true,
  displayName: true,
  slug: true,
  active: true,
  servesSiteRoot: true,
  ...contactSelect,
} satisfies Prisma.ClinicLocationSelect;

const profileSelect = {
  displayName: true,
  ...brandSelect,
  ...contactSelect,
} satisfies Prisma.ClinicProfileSelect;

type SiteRow = Prisma.ClinicSiteGetPayload<{ select: typeof siteSelect }>;
type LocationRow = Prisma.ClinicLocationGetPayload<{
  select: typeof locationSelect;
}>;
type ProfileRow = Prisma.ClinicProfileGetPayload<{
  select: typeof profileSelect;
}>;

function mapSite(row: SiteRow): SharedDemoSiteRecord {
  return {
    id: row.id,
    clinicId: row.clinicId,
    slug: row.slug,
    name: row.name,
    displayName: row.displayName,
    active: row.active,
    isPrimary: row.isPrimary,
    brand: brandFrom(row),
  };
}

function mapLocation(row: LocationRow): SharedDemoLocationRecord {
  return {
    id: row.id,
    clinicId: row.clinicId,
    clinicSiteId: row.clinicSiteId,
    name: row.name,
    displayName: row.displayName,
    slug: row.slug,
    active: row.active,
    servesSiteRoot: row.servesSiteRoot,
    contact: contactFrom(row),
  };
}

function mapProfile(row: ProfileRow): SharedDemoProfileRecord {
  return {
    displayName: row.displayName,
    brand: brandFrom(row),
    contact: contactFrom(row),
  };
}

/**
 * Loads the demodental account by slug, then re-reads the account, primary
 * site, and root location by id. Guide revisions, pins, overrides, and
 * additions are not read.
 */
export async function loadSharedDemoConfigSnapshot(
  prisma: PrismaClient
): Promise<SharedDemoConfigSnapshot> {
  const clinicsBySlug = await prisma.clinic.findMany({
    where: { slug: DEMO_AFTERCARE_TENANT_SLUG },
    select: { id: true, slug: true, name: true },
  });
  const slugClinic = clinicsBySlug.length === 1 ? clinicsBySlug[0] : null;
  const clinicById = slugClinic
    ? await prisma.clinic.findUnique({
        where: { id: slugClinic.id },
        select: { id: true, slug: true, name: true },
      })
    : null;
  const sitesBySlug = await prisma.clinicSite.findMany({
    where: { slug: DEMO_AFTERCARE_TENANT_SLUG },
    select: siteSelect,
  });
  const slugSite = sitesBySlug.length === 1 ? sitesBySlug[0] : null;
  const siteById = slugSite
    ? await prisma.clinicSite.findUnique({
        where: { id: slugSite.id },
        select: siteSelect,
      })
    : null;
  const primarySites = slugClinic
    ? await prisma.clinicSite.findMany({
        where: { clinicId: slugClinic.id, isPrimary: true },
        select: siteSelect,
      })
    : [];
  const siteForRoot =
    slugSite && slugClinic && slugSite.clinicId === slugClinic.id
      ? slugSite
      : null;
  const rootLocations = siteForRoot
    ? await prisma.clinicLocation.findMany({
        where: { clinicSiteId: siteForRoot.id, servesSiteRoot: true },
        select: locationSelect,
      })
    : [];
  const rootLocation = rootLocations.length === 1 ? rootLocations[0] : null;
  const rootLocationById = rootLocation
    ? await prisma.clinicLocation.findUnique({
        where: { id: rootLocation.id },
        select: locationSelect,
      })
    : null;
  const profileRow = slugClinic
    ? await prisma.clinicProfile.findUnique({
        where: { clinicId: slugClinic.id },
        select: profileSelect,
      })
    : null;
  const categories = siteForRoot
    ? await prisma.clinicSiteServiceCategory.findMany({
        where: {
          clinicSiteId: siteForRoot.id,
          clinicId: siteForRoot.clinicId,
        },
        select: { serviceCategory: true },
      })
    : [];

  return assessSharedDemoIdentity(
    {
      clinicsBySlug,
      clinicById,
      sitesBySlug: sitesBySlug.map(mapSite),
      siteById: siteById ? mapSite(siteById) : null,
      primarySites: primarySites.map(mapSite),
      rootLocations: rootLocations.map(mapLocation),
      rootLocationById: rootLocationById ? mapLocation(rootLocationById) : null,
      profile: profileRow ? mapProfile(profileRow) : null,
    },
    categories.map((row) => row.serviceCategory)
  );
}

/**
 * Adds missing service categories on the verified site.
 * With identity confirmation, updates the public name, contact details, and
 * emergency instructions on the existing account, profile, site, and root
 * location. It does not create those rows and does not write colour, logo,
 * theme, guide revisions, pins, overrides, or additions.
 */
export async function applySharedDemoConfig(
  prisma: PrismaClient,
  plan: SharedDemoConfigPlan
): Promise<void> {
  if (
    plan.action !== "configure" ||
    !plan.clinicId ||
    !plan.siteId ||
    !plan.locationId
  ) {
    return;
  }
  if (!plan.writesCategories && !plan.writesIdentity) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (plan.writesCategories) {
      for (const serviceCategory of plan.missingCategories) {
        await tx.clinicSiteServiceCategory.upsert({
          where: {
            clinicSiteId_serviceCategory: {
              clinicSiteId: plan.siteId!,
              serviceCategory,
            },
          },
          create: {
            clinicSiteId: plan.siteId!,
            clinicId: plan.clinicId!,
            serviceCategory,
          },
          update: {},
        });
      }
    }
    if (!plan.writesIdentity) {
      return;
    }

    const clinic = await tx.clinic.updateMany({
      where: { id: plan.clinicId!, slug: DEMO_AFTERCARE_TENANT_SLUG },
      data: { name: SHARED_DEMO_DISPLAY_NAME },
    });
    if (clinic.count !== 1) {
      throw new Error(
        "The shared demo account was not updated. This command does not create an account."
      );
    }

    await tx.clinicProfile.update({
      where: { clinicId: plan.clinicId! },
      data: SHARED_DEMO_PROFILE_IDENTITY_UPDATE,
    });

    const site = await tx.clinicSite.updateMany({
      where: {
        id: plan.siteId!,
        clinicId: plan.clinicId!,
        slug: DEMO_AFTERCARE_TENANT_SLUG,
        isPrimary: true,
      },
      data: SHARED_DEMO_SITE_IDENTITY_UPDATE,
    });
    if (site.count !== 1) {
      throw new Error(
        "The shared demo site was not updated. This command does not create a site."
      );
    }

    const location = await tx.clinicLocation.updateMany({
      where: {
        id: plan.locationId!,
        clinicId: plan.clinicId!,
        clinicSiteId: plan.siteId!,
        servesSiteRoot: true,
        slug: null,
      },
      data: SHARED_DEMO_LOCATION_IDENTITY_UPDATE,
    });
    if (location.count !== 1) {
      throw new Error(
        "The shared demo root location was not updated. This command does not create a location."
      );
    }
  });
}
