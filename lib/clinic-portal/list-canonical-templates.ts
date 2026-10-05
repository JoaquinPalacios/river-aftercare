import { GuideRevisionStatus, type ServiceCategory } from "@prisma/client";

import { isDemoTenant } from "@/lib/aftercare/demo-tenant";
import {
  classifyCanonicalTemplate,
  clinicCanUseCanonicalTemplate,
  type CanonicalTemplateAvailability,
} from "@/lib/aftercare/guide-template-review";
import { uniqueServiceCategories } from "@/lib/aftercare/service-category";
import { listAccountServiceCategories } from "@/lib/clinics/site-service-categories";
import { getPrisma } from "@/lib/prisma";

export interface CanonicalGuideTemplateOption {
  id: string;
  slug: string;
  title: string;
  serviceCategory: ServiceCategory;
  availability: CanonicalTemplateAvailability;
  alreadyEnabled: boolean;
}

export interface CanonicalGuideTemplateList {
  isDemoTenant: boolean;
  serviceCategories: ServiceCategory[];
  templatesNeedServiceCategories: boolean;
  templates: CanonicalGuideTemplateOption[];
}

export interface CanonicalTemplateCandidate {
  id: string;
  slug: string;
  title: string;
  serviceCategory: ServiceCategory;
  isSample: boolean;
  revisions: Array<{
    id: string;
    version: number;
    status: GuideRevisionStatus | string;
  }>;
}

/**
 * Production eligibility for one clinic. A template is listed only when its
 * category is on an active site, its latest published revision is production
 * (or the designated demo sample), and unpublished revisions are ignored.
 */
export function filterEligibleCanonicalTemplates(input: {
  clinicSlug: string;
  serviceCategories: readonly ServiceCategory[];
  templates: readonly CanonicalTemplateCandidate[];
  enabledIds?: ReadonlySet<string>;
}): CanonicalGuideTemplateOption[] {
  const categories = uniqueServiceCategories(input.serviceCategories);
  const enabledIds = input.enabledIds ?? new Set<string>();
  return input.templates.flatMap((template) => {
    if (!categories.includes(template.serviceCategory)) {
      return [];
    }
    const classified = classifyCanonicalTemplate({
      isSample: template.isSample,
      revisions: template.revisions,
    });
    if (
      !clinicCanUseCanonicalTemplate({
        clinicSlug: input.clinicSlug,
        serviceCategory: template.serviceCategory,
        templateSlug: template.slug,
        availability: classified.availability,
      }) ||
      !classified.availability ||
      !classified.eligibleRevisionId
    ) {
      return [];
    }
    return [
      {
        id: template.id,
        slug: template.slug,
        title: template.title,
        serviceCategory: template.serviceCategory,
        availability: classified.availability,
        alreadyEnabled: enabledIds.has(template.id),
      },
    ];
  });
}

export async function listCanonicalGuideTemplates(
  clinicId: string
): Promise<CanonicalGuideTemplateList> {
  const prisma = getPrisma();
  const [clinic, templates, enabled, serviceCategories] = await Promise.all([
    prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { slug: true },
    }),
    prisma.guideTemplate.findMany({
      where: {
        isActive: true,
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
    }),
    prisma.practiceGuide.findMany({
      where: {
        clinicId,
        guideTemplateId: { not: null },
      },
      select: { guideTemplateId: true },
    }),
    listAccountServiceCategories(prisma, clinicId),
  ]);

  if (!clinic) {
    return {
      isDemoTenant: false,
      serviceCategories: [],
      templatesNeedServiceCategories: false,
      templates: [],
    };
  }

  const categories = uniqueServiceCategories(serviceCategories);
  if (categories.length === 0) {
    return {
      isDemoTenant: isDemoTenant(clinic.slug),
      serviceCategories: [],
      templatesNeedServiceCategories: true,
      templates: [],
    };
  }

  const demoTenant = isDemoTenant(clinic.slug);
  const enabledIds = new Set(
    enabled
      .map((guide) => guide.guideTemplateId)
      .filter((id): id is string => Boolean(id))
  );

  return {
    isDemoTenant: demoTenant,
    serviceCategories: categories,
    templatesNeedServiceCategories: false,
    templates: filterEligibleCanonicalTemplates({
      clinicSlug: clinic.slug,
      serviceCategories: categories,
      templates,
      enabledIds,
    }),
  };
}
