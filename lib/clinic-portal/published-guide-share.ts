import "server-only";

import { clinicPatientSiteUrl } from "@/lib/clinic-portal/patient-site-url";
import { PUBLIC_PRACTICE_GUIDE_WHERE } from "@/lib/aftercare/public-practice-guide-predicates";
import { downgradeRetentionIsOpen } from "@/lib/entitlements/downgrade-retention";
import { getPrisma } from "@/lib/prisma";

export interface PublishedGuideShareTarget {
  publicUrl: string;
  clinicSlug: string;
  publicSlug: string;
}

export async function loadPublishedGuideShareTarget(input: {
  clinicId: string;
  guideId: string;
  requestHost: string;
  protocol?: string;
}): Promise<PublishedGuideShareTarget | null> {
  const guide = await getPrisma().practiceGuide.findFirst({
    where: {
      id: input.guideId,
      clinicId: input.clinicId,
      ...PUBLIC_PRACTICE_GUIDE_WHERE,
    },
    select: {
      publicSlug: true,
      downgradeRetainedAt: true,
      downgradeRetentionUntil: true,
      clinic: {
        select: {
          slug: true,
        },
      },
    },
  });

  if (!guide) {
    return null;
  }

  if (
    guide.downgradeRetainedAt &&
    !downgradeRetentionIsOpen(guide, new Date())
  ) {
    return null;
  }

  const publicUrl = clinicPatientSiteUrl({
    requestHost: input.requestHost,
    clinicSlug: guide.clinic.slug,
    protocol: input.protocol,
    pathname: `/${guide.publicSlug}`,
  });

  if (!publicUrl) {
    return null;
  }

  return {
    publicUrl,
    clinicSlug: guide.clinic.slug,
    publicSlug: guide.publicSlug,
  };
}
