import { GuideRevisionStatus } from "@prisma/client";

import { isDemoTenant } from "@/lib/aftercare/demo-tenant";
import {
  classifyCanonicalTemplate,
  clinicCanUseCanonicalTemplate,
  type CanonicalTemplateAvailability,
} from "@/lib/aftercare/guide-template-review";
import { getPrisma } from "@/lib/prisma";

export interface CanonicalGuideTemplateOption {
  id: string;
  slug: string;
  title: string;
  specialty: string;
  availability: CanonicalTemplateAvailability;
  alreadyEnabled: boolean;
}

export interface CanonicalGuideTemplateList {
  isDemoTenant: boolean;
  templates: CanonicalGuideTemplateOption[];
}

export async function listCanonicalGuideTemplates(
  clinicId: string
): Promise<CanonicalGuideTemplateList> {
  const prisma = getPrisma();
  const [clinic, templates, enabled] = await Promise.all([
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
      orderBy: { title: "asc" },
      select: {
        id: true,
        slug: true,
        title: true,
        specialty: true,
        isSample: true,
        revisions: {
          where: { status: GuideRevisionStatus.PUBLISHED },
          select: {
            id: true,
            version: true,
            status: true,
            reviewedAt: true,
            reviewedBy: true,
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
  ]);

  if (!clinic) {
    return { isDemoTenant: false, templates: [] };
  }

  const demoTenant = isDemoTenant(clinic.slug);
  const enabledIds = new Set(
    enabled
      .map((guide) => guide.guideTemplateId)
      .filter((id): id is string => Boolean(id))
  );

  return {
    isDemoTenant: demoTenant,
    templates: templates.flatMap((template) => {
      const classified = classifyCanonicalTemplate({
        isSample: template.isSample,
        revisions: template.revisions,
      });
      if (
        !clinicCanUseCanonicalTemplate({
          isDemoTenant: demoTenant,
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
          specialty: template.specialty,
          availability: classified.availability,
          alreadyEnabled: enabledIds.has(template.id),
        },
      ];
    }),
  };
}
