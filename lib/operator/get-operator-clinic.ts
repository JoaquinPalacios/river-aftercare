import { PracticeGuideStatus } from "@prisma/client";

import { clinicSetupChecks } from "@/lib/clinic-portal/setup-status";
import { getPrisma } from "@/lib/prisma";

export interface OperatorClinicDetail {
  id: string;
  name: string;
  displayName: string;
  slug: string;
  branding: {
    logoUrl: string | null;
    primaryColor: string | null;
    accentColor: string | null;
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
  }>;
  members: Array<{
    id: string;
    role: string;
    name: string | null;
    email: string;
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
      profile: true,
      practiceGuides: {
        orderBy: [{ sortOrder: "asc" }, { publicSlug: "asc" }],
        select: {
          id: true,
          title: true,
          publicSlug: true,
          status: true,
          isEnabled: true,
        },
      },
      memberships: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
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
    (guide) => guide.status === PracticeGuideStatus.PUBLISHED && guide.isEnabled
  ).length;

  return {
    id: clinic.id,
    name: clinic.name,
    displayName: clinic.profile?.displayName?.trim() || clinic.name,
    slug: clinic.slug,
    branding: {
      logoUrl: clinic.profile?.logoUrl ?? null,
      primaryColor: clinic.profile?.primaryColor ?? null,
      accentColor: clinic.profile?.accentColor ?? null,
      neutralColor: clinic.profile?.neutralColor ?? null,
      radiusPreset: clinic.profile?.radiusPreset ?? null,
      typeface: clinic.profile?.typeface ?? null,
      instructionTerminology: clinic.profile?.instructionTerminology ?? null,
      themeMode: clinic.profile?.themeMode ?? null,
      allowPatientThemeToggle: clinic.profile?.allowPatientThemeToggle ?? null,
    },
    contact: {
      phone: clinic.profile?.phone ?? null,
      contactUrl: clinic.profile?.contactUrl ?? null,
      emergencyInstructions: clinic.profile?.emergencyInstructions ?? null,
      addressLine1: clinic.profile?.addressLine1 ?? null,
      city: clinic.profile?.city ?? null,
      region: clinic.profile?.region ?? null,
      postalCode: clinic.profile?.postalCode ?? null,
    },
    setup: clinicSetupChecks({
      displayName: clinic.profile?.displayName ?? null,
      logoUrl: clinic.profile?.logoUrl ?? null,
      primaryColor: clinic.profile?.primaryColor ?? null,
      accentColor: clinic.profile?.accentColor ?? null,
      themeMode: clinic.profile?.themeMode ?? null,
      phone: clinic.profile?.phone ?? null,
      contactUrl: clinic.profile?.contactUrl ?? null,
      emergencyInstructions: clinic.profile?.emergencyInstructions ?? null,
      publishedGuideCount,
    }),
    guides: clinic.practiceGuides,
    members: clinic.memberships.map((membership) => ({
      id: membership.id,
      role: membership.role,
      name: membership.user.name,
      email: membership.user.email,
    })),
    updatedAt: clinic.profile?.updatedAt ?? clinic.updatedAt,
  };
}
