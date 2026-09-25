import { PracticeGuideStatus } from "@prisma/client";

import { publicPracticeName } from "@/lib/clinics/patient-profile";
import { clinicSetupChecks } from "@/lib/clinic-portal/setup-status";
import { getPrisma } from "@/lib/prisma";

export interface OperatorClinicListItem {
  id: string;
  name: string;
  displayName: string;
  slug: string;
  guideCount: number;
  publishedGuideCount: number;
  setupLabel: string;
  updatedAt: Date;
}

export async function listOperatorClinics(): Promise<OperatorClinicListItem[]> {
  const clinics = await getPrisma().clinic.findMany({
    orderBy: { name: "asc" },
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
          primaryColor: true,
          accentColor: true,
          themeMode: true,
          locations: {
            where: { servesSiteRoot: true, active: true },
            select: {
              clinicId: true,
              updatedAt: true,
              phone: true,
              contactUrl: true,
              emergencyInstructions: true,
            },
          },
        },
      },
      practiceGuides: {
        select: {
          status: true,
          isEnabled: true,
        },
      },
    },
  });

  return clinics.map((clinic) => {
    const publishedGuideCount = clinic.practiceGuides.filter(
      (guide) =>
        guide.status === PracticeGuideStatus.PUBLISHED && guide.isEnabled
    ).length;
    const site = clinic.sites.length === 1 ? clinic.sites[0] : null;
    const location =
      site &&
      site.clinicId === clinic.id &&
      site.locations.length === 1 &&
      site.locations[0]?.clinicId === clinic.id
        ? site.locations[0]
        : null;
    const setup = clinicSetupChecks({
      displayName: site?.displayName ?? null,
      logoUrl: site?.logoUrl ?? null,
      primaryColor: site?.primaryColor ?? null,
      accentColor: site?.accentColor ?? null,
      themeMode: site?.themeMode ?? null,
      phone: location?.phone ?? null,
      contactUrl: location?.contactUrl ?? null,
      emergencyInstructions: location?.emergencyInstructions ?? null,
      publishedGuideCount,
    });
    const needsAttention = setup.some(
      (check) => check.state === "needs_attention"
    );

    return {
      id: clinic.id,
      name: clinic.name,
      displayName: publicPracticeName({
        siteDisplayName: site?.displayName,
        accountName: clinic.name,
      }),
      slug: site && location ? site.slug : clinic.slug,
      guideCount: clinic.practiceGuides.length,
      publishedGuideCount,
      setupLabel: needsAttention ? "Needs attention" : "Configured",
      updatedAt:
        [site?.updatedAt, location?.updatedAt, clinic.updatedAt]
          .filter((date): date is Date => Boolean(date))
          .toSorted((left, right) => right.getTime() - left.getTime())[0] ??
        clinic.updatedAt,
    };
  });
}

export { summarizeOperatorClinics } from "@/lib/operator/summarize-operator-clinics";
