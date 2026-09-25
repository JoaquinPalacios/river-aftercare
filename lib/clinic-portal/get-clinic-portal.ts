import "server-only";

import { PracticeGuideStatus } from "@prisma/client";
import { headers } from "next/headers";
import { cache } from "react";

import { publicPracticeName } from "@/lib/clinics/patient-profile";
import { clinicPatientSiteUrl } from "@/lib/clinic-portal/patient-site-url";
import {
  clinicSetupChecks,
  type ClinicSetupCheck,
} from "@/lib/clinic-portal/setup-status";
import { getPrisma } from "@/lib/prisma";

export interface ClinicPortalOverview {
  clinicId: string;
  clinicName: string;
  displayName: string;
  slug: string;
  patientSiteHref: string | null;
  publishedGuideCount: number;
  draftGuideCount: number;
  setup: ClinicSetupCheck[];
}

export const getClinicPortalOverview = cache(
  async (clinicId: string): Promise<ClinicPortalOverview | null> => {
    const clinic = await getPrisma().clinic.findUnique({
      where: { id: clinicId },
      select: {
        id: true,
        name: true,
        practiceGuides: {
          select: {
            status: true,
          },
        },
        sites: {
          where: { isPrimary: true, active: true },
          select: {
            slug: true,
            displayName: true,
            clinicId: true,
            logoUrl: true,
            primaryColor: true,
            accentColor: true,
            themeMode: true,
            locations: {
              where: { servesSiteRoot: true, active: true },
              select: {
                clinicId: true,
                phone: true,
                contactUrl: true,
                emergencyInstructions: true,
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
      (guide) => guide.status === PracticeGuideStatus.PUBLISHED
    ).length;
    const draftGuideCount = clinic.practiceGuides.filter(
      (guide) => guide.status === PracticeGuideStatus.DRAFT
    ).length;
    const site = clinic.sites.length === 1 ? clinic.sites[0] : null;
    const location =
      site &&
      site.clinicId === clinic.id &&
      site.locations.length === 1 &&
      site.locations[0]?.clinicId === clinic.id
        ? site.locations[0]
        : null;
    const displayName = publicPracticeName({
      siteDisplayName: site?.displayName,
      accountName: clinic.name,
    });
    const publicSlug = site && location ? site.slug : null;
    const requestHeaders = await headers();
    const host =
      requestHeaders.get("x-forwarded-host") ??
      requestHeaders.get("host") ??
      "";
    const protocol =
      requestHeaders.get("x-forwarded-proto") ??
      (host.includes("localhost") ? "http" : "https");

    return {
      clinicId: clinic.id,
      clinicName: clinic.name,
      displayName,
      slug: publicSlug ?? "",
      patientSiteHref:
        host && publicSlug
          ? clinicPatientSiteUrl({
              requestHost: host,
              clinicSlug: publicSlug,
              protocol,
            })
          : null,
      publishedGuideCount,
      draftGuideCount,
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
    };
  }
);
