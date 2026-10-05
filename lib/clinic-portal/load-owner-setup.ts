import "server-only";

import { GuideRevisionStatus, PracticeGuideStatus } from "@prisma/client";

import { uniqueServiceCategories } from "@/lib/aftercare/service-category";
import {
  deriveOwnerSetup,
  type OwnerSetupAudience,
  type OwnerSetupSummary,
} from "@/lib/clinic-portal/owner-setup";
import { filterEligibleCanonicalTemplates } from "@/lib/clinic-portal/list-canonical-templates";
import {
  guideAllowanceFrom,
  isAdaptedTemplateGuide,
  isOriginalCustomGuide,
} from "@/lib/entitlements/guide-usage";
import { allowanceExtrasFrom } from "@/lib/entitlements/team-usage";
import { planGovernanceFromEntitlement } from "@/lib/entitlements/plan-policy";
import { getPrisma } from "@/lib/prisma";

/**
 * Derived getting-started summary for an assisted clinic.
 * Historical clinics (`assistedOnboarding` false) return null.
 * Reads the clinic graph once, then the published canonical catalogue once.
 */
export async function loadOwnerGettingStarted(
  clinicId: string,
  audience: OwnerSetupAudience
): Promise<OwnerSetupSummary | null> {
  const prisma = getPrisma();
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: {
      id: true,
      slug: true,
      assistedOnboarding: true,
      entitlement: {
        select: {
          commercialPlan: true,
          extraTeamMemberAllowance: true,
          extraCustomGuideAllowance: true,
          extraTemplateAdaptationAllowance: true,
        },
      },
      practiceGuides: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          status: true,
          guideTemplateId: true,
          sourceGuideTemplateId: true,
          adaptedAt: true,
          downgradeRetainedAt: true,
        },
      },
      sites: {
        where: { active: true },
        select: {
          id: true,
          isPrimary: true,
          clinicId: true,
          displayName: true,
          logoUrl: true,
          primaryColor: true,
          accentColor: true,
          themeMode: true,
          serviceCategories: {
            select: { serviceCategory: true },
          },
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

  if (!clinic?.assistedOnboarding) {
    return null;
  }

  const primarySites = clinic.sites.filter(
    (site) => site.isPrimary && site.clinicId === clinic.id
  );
  const site = primarySites.length === 1 ? primarySites[0] : null;
  const location =
    site &&
    site.locations.length === 1 &&
    site.locations[0]?.clinicId === clinic.id
      ? site.locations[0]
      : null;
  const serviceCategories = uniqueServiceCategories(
    clinic.sites
      .filter((row) => row.clinicId === clinic.id)
      .flatMap((row) =>
        row.serviceCategories.map((category) => category.serviceCategory)
      )
  );
  const guides = clinic.practiceGuides.filter(
    (guide) => guide.downgradeRetainedAt === null
  );
  const publishedGuideCount = guides.filter(
    (guide) => guide.status === PracticeGuideStatus.PUBLISHED
  ).length;
  const customGuideCount = guides.filter((guide) =>
    isOriginalCustomGuide(guide)
  ).length;
  const adaptedCount = guides.filter((guide) =>
    isAdaptedTemplateGuide(guide)
  ).length;
  const allowance = guideAllowanceFrom(
    planGovernanceFromEntitlement({ entitlement: clinic.entitlement }),
    allowanceExtrasFrom(clinic.entitlement),
    customGuideCount,
    adaptedCount
  );
  const catalogue =
    serviceCategories.length === 0
      ? []
      : await prisma.guideTemplate.findMany({
          where: {
            isActive: true,
            serviceCategory: { in: [...serviceCategories] },
            revisions: {
              some: { status: GuideRevisionStatus.PUBLISHED },
            },
          },
          orderBy: [{ serviceCategory: "asc" }, { title: "asc" }],
          select: {
            id: true,
            slug: true,
            title: true,
            serviceCategory: true,
            isSample: true,
            revisions: {
              where: { status: GuideRevisionStatus.PUBLISHED },
              select: {
                id: true,
                version: true,
                status: true,
              },
            },
          },
        });
  const enabledIds = new Set(
    guides
      .map((guide) => guide.guideTemplateId)
      .filter((id): id is string => Boolean(id))
  );
  const templates = filterEligibleCanonicalTemplates({
    clinicSlug: clinic.slug,
    serviceCategories,
    templates: catalogue,
    enabledIds,
  });

  return deriveOwnerSetup({
    audience,
    profile: {
      displayName: site?.displayName ?? null,
      logoUrl: site?.logoUrl ?? null,
      primaryColor: site?.primaryColor ?? null,
      accentColor: site?.accentColor ?? null,
      themeMode: site?.themeMode ?? null,
      phone: location?.phone ?? null,
      contactUrl: location?.contactUrl ?? null,
      emergencyInstructions: location?.emergencyInstructions ?? null,
      publishedGuideCount,
    },
    serviceCategories,
    sitesHref: site ? `/practice/sites/${site.id}` : "/practice/sites",
    templates: templates.map((template) => ({
      id: template.id,
      title: template.title,
      serviceCategory: template.serviceCategory,
      alreadyAdded: template.alreadyEnabled,
    })),
    guides: clinic.practiceGuides.map((guide) => ({
      id: guide.id,
      title: guide.title,
      status: guide.status,
      retained: guide.downgradeRetainedAt !== null,
      guideTemplateId: guide.guideTemplateId,
      sourceGuideTemplateId: guide.sourceGuideTemplateId,
    })),
    customGuidePermitted:
      !allowance.customGuides.atLimit && !allowance.combinedGuides.atLimit,
  });
}
