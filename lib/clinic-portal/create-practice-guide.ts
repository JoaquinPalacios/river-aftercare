import {
  GuideRevisionStatus,
  PracticeGuideStatus,
  PracticeSectionProvenance,
} from "@prisma/client";

import { composeGuideDocument } from "@/lib/aftercare/compose-guide-document";
import { isDemoTenant } from "@/lib/aftercare/demo-tenant";
import {
  classifyCanonicalTemplateAvailability,
  clinicCanUseCanonicalTemplate,
} from "@/lib/aftercare/guide-template-review";
import { isValidCareGuideSlug } from "@/lib/aftercare/slug";
import {
  practiceRevisionSectionsFromComposed,
  WORKING_DRAFT_VERSION,
} from "@/lib/aftercare/practice-revision-document";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import type {
  CreateCustomGuideInput,
  CreateTemplateGuideInput,
} from "@/lib/clinic-portal/guide-schemas";
import { getPrisma } from "@/lib/prisma";

async function nextUnusedSlug(
  clinicId: string,
  desired: string
): Promise<string> {
  if (!isValidCareGuideSlug(desired)) {
    throw new ClinicPortalError("Enter a valid public slug.", "invalid");
  }

  const existing = await getPrisma().practiceGuide.findMany({
    where: { clinicId },
    select: { publicSlug: true },
  });
  const used = new Set(existing.map((guide) => guide.publicSlug));
  if (!used.has(desired)) {
    return desired;
  }

  for (let index = 2; index < 50; index += 1) {
    const candidate = `${desired}-${index}`;
    if (isValidCareGuideSlug(candidate) && !used.has(candidate)) {
      return candidate;
    }
  }

  throw new ClinicPortalError(
    "Could not allocate a unique public slug for this clinic.",
    "conflict"
  );
}

async function nextSortOrder(clinicId: string): Promise<number> {
  const last = await getPrisma().practiceGuide.findFirst({
    where: { clinicId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? 0) + 1;
}

export async function createCustomPracticeGuide(input: {
  clinicId: string;
  actorUserId: string;
  values: CreateCustomGuideInput;
}): Promise<{ id: string }> {
  const publicSlug = await nextUnusedSlug(
    input.clinicId,
    input.values.publicSlug
  );
  const sortOrder = await nextSortOrder(input.clinicId);

  return getPrisma().$transaction(async (tx) => {
    const guide = await tx.practiceGuide.create({
      data: {
        clinicId: input.clinicId,
        title: input.values.title,
        publicSlug,
        status: PracticeGuideStatus.DRAFT,
        isEnabled: false,
        sortOrder,
      },
    });

    await tx.practiceGuideRevision.create({
      data: {
        practiceGuideId: guide.id,
        version: WORKING_DRAFT_VERSION,
        status: GuideRevisionStatus.DRAFT,
        title: input.values.title,
        createdByUserId: input.actorUserId,
        sections: {
          create: {
            key: "introduction",
            kind: "INTRODUCTION",
            title: "About this guide",
            body: "Add the recovery information your patients should follow after this treatment.",
            sortOrder: 1,
            provenance: PracticeSectionProvenance.PRACTICE_CUSTOM,
          },
        },
      },
    });

    return { id: guide.id };
  });
}

export async function createPracticeGuideFromTemplate(input: {
  clinicId: string;
  actorUserId: string;
  values: CreateTemplateGuideInput;
}): Promise<{ id: string }> {
  const clinic = await getPrisma().clinic.findUnique({
    where: { id: input.clinicId },
    select: { slug: true },
  });
  if (!clinic) {
    throw new ClinicPortalError("That template is not available.", "not_found");
  }

  const template = await getPrisma().guideTemplate.findFirst({
    where: {
      id: input.values.templateId,
      isActive: true,
      revisions: { some: { status: GuideRevisionStatus.PUBLISHED } },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      revisions: {
        where: { status: GuideRevisionStatus.PUBLISHED },
        orderBy: { version: "desc" },
        select: {
          id: true,
          status: true,
          reviewedAt: true,
          reviewedBy: true,
          sections: {
            orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
          },
        },
      },
    },
  });

  const availability = classifyCanonicalTemplateAvailability(
    template?.revisions ?? []
  );
  const allowed = clinicCanUseCanonicalTemplate({
    isDemoTenant: isDemoTenant(clinic.slug),
    availability,
  });
  const publishedRevision = template?.revisions[0];
  if (!template || !publishedRevision || !allowed) {
    throw new ClinicPortalError("That template is not available.", "not_found");
  }

  const existing = await getPrisma().practiceGuide.findFirst({
    where: {
      clinicId: input.clinicId,
      guideTemplateId: template.id,
    },
    select: { id: true },
  });
  if (existing) {
    throw new ClinicPortalError(
      "This practice already has a guide from that template.",
      "conflict"
    );
  }

  const desiredSlug = input.values.publicSlug ?? template.slug;
  const publicSlug = await nextUnusedSlug(input.clinicId, desiredSlug);
  const sortOrder = await nextSortOrder(input.clinicId);
  const composed = composeGuideDocument({
    canonicalSections: publishedRevision.sections.map((section) => ({
      key: section.key,
      kind: section.kind,
      title: section.title,
      body: section.body,
      periodLabel: section.periodLabel,
      startDay: section.startDay,
      endDay: section.endDay,
      sortOrder: section.sortOrder,
    })),
    overrides: [],
    additions: [],
  });
  const draftSections = practiceRevisionSectionsFromComposed(composed.sections);

  return getPrisma().$transaction(async (tx) => {
    const guide = await tx.practiceGuide.create({
      data: {
        clinicId: input.clinicId,
        title: template.title,
        guideTemplateId: template.id,
        pinnedRevisionId: publishedRevision.id,
        publicSlug,
        status: PracticeGuideStatus.DRAFT,
        isEnabled: false,
        sortOrder,
      },
    });

    await tx.practiceGuideRevision.create({
      data: {
        practiceGuideId: guide.id,
        version: WORKING_DRAFT_VERSION,
        status: GuideRevisionStatus.DRAFT,
        title: template.title,
        createdByUserId: input.actorUserId,
        sections: {
          create: draftSections,
        },
      },
    });

    return { id: guide.id };
  });
}
