import "server-only";

import { clinicPatientSiteUrl } from "@/lib/clinic-portal/patient-site-url";
import { placementPublicPath } from "@/lib/clinic-portal/placement-path";
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
  placementId?: string | null;
}): Promise<PublishedGuideShareTarget | null> {
  const guide = await getPrisma().practiceGuide.findFirst({
    where: {
      id: input.guideId,
      clinicId: input.clinicId,
      ...PUBLIC_PRACTICE_GUIDE_WHERE,
    },
    select: {
      downgradeRetainedAt: true,
      downgradeRetentionUntil: true,
      placements: {
        where: {
          isEnabled: true,
          clinicId: input.clinicId,
          ...(input.placementId ? { id: input.placementId } : {}),
          location: {
            ...(input.placementId ? {} : { servesSiteRoot: true }),
            active: true,
            clinicId: input.clinicId,
            clinicSite: {
              ...(input.placementId ? {} : { isPrimary: true }),
              active: true,
              clinicId: input.clinicId,
            },
          },
        },
        select: {
          publicSlug: true,
          clinicId: true,
          location: {
            select: {
              clinicId: true,
              slug: true,
              servesSiteRoot: true,
              active: true,
              clinicSite: {
                select: { slug: true, clinicId: true, active: true },
              },
            },
          },
        },
      },
    },
  });

  const placement = guide?.placements.length === 1 ? guide.placements[0] : null;
  if (
    !guide ||
    !placement ||
    placement.clinicId !== input.clinicId ||
    placement.location.clinicId !== input.clinicId ||
    placement.location.clinicSite.clinicId !== input.clinicId ||
    !placement.location.clinicSite.active ||
    !placement.location.active
  ) {
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
    clinicSlug: placement.location.clinicSite.slug,
    protocol: input.protocol,
    pathname: placementPublicPath({
      servesSiteRoot: placement.location.servesSiteRoot,
      locationSlug: placement.location.slug,
      publicSlug: placement.publicSlug,
    }),
  });

  if (!publicUrl) {
    return null;
  }

  return {
    publicUrl,
    clinicSlug: placement.location.clinicSite.slug,
    publicSlug: placement.publicSlug,
  };
}
