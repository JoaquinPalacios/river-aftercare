import { PracticeGuideStatus } from "@prisma/client";

import { publicPracticeName } from "@/lib/clinics/patient-profile";
import { clinicSetupChecks } from "@/lib/clinic-portal/setup-status";
import { getPrisma } from "@/lib/prisma";

export interface OperatorClinicDetail {
  id: string;
  name: string;
  displayName: string;
  slug: string;
  branding: {
    logoUrl: string | null;
    darkLogoUrl: string | null;
    faviconUrl: string | null;
    primaryColor: string | null;
    accentColor: string | null;
    darkPrimaryColor: string | null;
    darkAccentColor: string | null;
    useCustomDarkBranding: boolean;
    neutralColor: string | null;
    radiusPreset: string | null;
    typeface: string | null;
    instructionTerminology: string | null;
    themeMode: string | null;
    allowPatientThemeToggle: boolean | null;
  };
  contact: {
    phone: string | null;
    contactUrl: string | null;
    emergencyInstructions: string | null;
    addressLine1: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
  };
  setup: ReturnType<typeof clinicSetupChecks>;
  guides: Array<{
    id: string;
    title: string;
    publicSlug: string;
    status: PracticeGuideStatus;
    isEnabled: boolean;
    downgradeRetainedAt: Date | null;
    downgradeRetentionUntil: Date | null;
  }>;
  members: Array<{
    id: string;
    role: string;
    name: string | null;
    email: string;
    active: boolean;
  }>;
  updatedAt: Date;
}

export async function getOperatorClinic(
  clinicId: string
): Promise<OperatorClinicDetail | null> {
  const clinic = await getPrisma().clinic.findUnique({
    where: { id: clinicId },
    select: {
      id: true,
      name: true,
      slug: true,
      updatedAt: true,
      sites: {
        where: { isPrimary: true, active: true },
        select: {
          slug: true,
          displayName: true,
          clinicId: true,
          updatedAt: true,
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
          locations: {
            where: { servesSiteRoot: true, active: true },
            select: {
              clinicId: true,
              updatedAt: true,
              phone: true,
              contactUrl: true,
              emergencyInstructions: true,
              addressLine1: true,
              city: true,
              region: true,
              postalCode: true,
            },
          },
        },
      },
      practiceGuides: {
        orderBy: [{ sortOrder: "asc" }, { publicSlug: "asc" }],
        select: {
          id: true,
          title: true,
          publicSlug: true,
          status: true,
          isEnabled: true,
          downgradeRetainedAt: true,
          downgradeRetentionUntil: true,
        },
      },
      memberships: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          active: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!clinic) {
    return null;
  }

  const publishedGuideCount = clinic.practiceGuides.filter(
    (guide) =>
      guide.status === PracticeGuideStatus.PUBLISHED &&
      guide.isEnabled &&
      guide.downgradeRetainedAt === null
  ).length;
  const site = clinic.sites.length === 1 ? clinic.sites[0] : null;
  const location =
    site &&
    site.clinicId === clinic.id &&
    site.locations.length === 1 &&
    site.locations[0]?.clinicId === clinic.id
      ? site.locations[0]
      : null;
  const publicSlug = site && location ? site.slug : clinic.slug;
  const updatedAt = latestDate(
    site?.updatedAt,
    location?.updatedAt,
    clinic.updatedAt
  );

  return {
    id: clinic.id,
    name: clinic.name,
    displayName: publicPracticeName({
      siteDisplayName: site?.displayName,
      accountName: clinic.name,
    }),
    slug: publicSlug,
    branding: {
      logoUrl: site?.logoUrl ?? null,
      darkLogoUrl: site?.darkLogoUrl ?? null,
      faviconUrl: site?.faviconUrl ?? null,
      primaryColor: site?.primaryColor ?? null,
      accentColor: site?.accentColor ?? null,
      darkPrimaryColor: site?.darkPrimaryColor ?? null,
      darkAccentColor: site?.darkAccentColor ?? null,
      useCustomDarkBranding: site?.useCustomDarkBranding ?? false,
      neutralColor: site?.neutralColor ?? null,
      radiusPreset: site?.radiusPreset ?? null,
      typeface: site?.typeface ?? null,
      instructionTerminology: site?.instructionTerminology ?? null,
      themeMode: site?.themeMode ?? null,
      allowPatientThemeToggle: site?.allowPatientThemeToggle ?? null,
    },
    contact: {
      phone: location?.phone ?? null,
      contactUrl: location?.contactUrl ?? null,
      emergencyInstructions: location?.emergencyInstructions ?? null,
      addressLine1: location?.addressLine1 ?? null,
      city: location?.city ?? null,
      region: location?.region ?? null,
      postalCode: location?.postalCode ?? null,
    },
    setup: clinicSetupChecks({
      displayName: site?.displayName ?? null,
      logoUrl: site?.logoUrl ?? null,
      primaryColor: site?.primaryColor ?? null,
      accentColor: site?.accentColor ?? null,
      themeMode: site?.themeMode ?? null,
      phone: location?.phone ?? null,
      contactUrl: location?.contactUrl ?? null,
      emergencyInstructions: location?.emergencyInstructions ?? null,
      publishedGuideCount,
    }),
    guides: clinic.practiceGuides,
    members: clinic.memberships.map((membership) => ({
      id: membership.id,
      role: membership.role,
      name: membership.user.name,
      email: membership.user.email,
      active: membership.active,
    })),
    updatedAt,
  };
}

function latestDate(...dates: Array<Date | null | undefined>): Date {
  return dates.reduce<Date>((latest, date) => {
    if (!date) {
      return latest;
    }
    return date.getTime() > latest.getTime() ? date : latest;
  }, new Date(0));
}
