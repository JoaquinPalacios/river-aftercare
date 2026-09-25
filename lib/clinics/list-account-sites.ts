import "server-only";

import {
  countActiveSiteLocationUsage,
  readAccountSiteLocationAllowance,
} from "@/lib/clinics/site-location-capacity";
import { getPrisma } from "@/lib/prisma";
import { getRootDomain } from "@/lib/tenancy/root-domain";

const siteSelect = {
  id: true,
  clinicId: true,
  name: true,
  slug: true,
  displayName: true,
  active: true,
  isPrimary: true,
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
  locations: {
    orderBy: [{ servesSiteRoot: "desc" as const }, { name: "asc" as const }],
    select: {
      id: true,
      name: true,
      displayName: true,
      slug: true,
      active: true,
      servesSiteRoot: true,
      phone: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      region: true,
      postalCode: true,
      country: true,
      contactUrl: true,
      contactEmail: true,
      bookingUrl: true,
      emergencyInstructions: true,
    },
  },
};

export async function listAccountSites(clinicId: string) {
  const prisma = getPrisma();
  const [sites, usage, allowance] = await Promise.all([
    prisma.clinicSite.findMany({
      where: { clinicId },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
      select: siteSelect,
    }),
    countActiveSiteLocationUsage(prisma, clinicId),
    readAccountSiteLocationAllowance(prisma, clinicId),
  ]);
  return {
    sites: sites.filter((site) => site.clinicId === clinicId),
    usage,
    allowance,
    rootDomain: getRootDomain(),
  };
}

export async function getAccountSite(clinicId: string, siteId: string) {
  const listed = await listAccountSites(clinicId);
  const site = listed.sites.find((candidate) => candidate.id === siteId);
  if (!site) {
    return null;
  }
  return { ...listed, site };
}
