import "server-only";

import {
  GuideRevisionStatus,
  PracticeGuideStatus,
  PracticeSectionProvenance,
} from "@prisma/client";

import { composeGuideDocument } from "@/lib/aftercare/compose-guide-document";
import { isValidCareGuideSlug } from "@/lib/aftercare/slug";
import {
  practiceRevisionSectionsFromComposed,
  WORKING_DRAFT_VERSION,
} from "@/lib/aftercare/practice-revision-document";
import { PUBLIC_PRACTICE_GUIDE_WHERE } from "@/lib/aftercare/public-practice-guide-predicates";
import { clinicPatientSiteUrl } from "@/lib/clinic-portal/patient-site-url";
import { placementPublicPath } from "@/lib/clinic-portal/placement-path";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { assertPracticeGuideWritable } from "@/lib/clinic-portal/retained-guide-guard";
import { assertRootGuideSlugAvailable } from "@/lib/clinics/slug-collisions";
import { lockClinicSiteLocationCapacity } from "@/lib/entitlements/locks";
import { reserveCustomGuidePlace } from "@/lib/entitlements/guide-usage";
import { isUniqueConstraintError } from "@/lib/clinics/prisma-errors";
import { getPrisma } from "@/lib/prisma";

function notFound(message: string): ClinicPortalError {
  return new ClinicPortalError(message, "not_found");
}

async function requireGuide(clinicId: string, guideId: string) {
  const guide = await getPrisma().practiceGuide.findFirst({
    where: { id: guideId, clinicId },
    select: {
      id: true,
      clinicId: true,
      title: true,
      publicSlug: true,
      status: true,
      isEnabled: true,
      downgradeRetainedAt: true,
      guideTemplateId: true,
      pinnedRevisionId: true,
      pinnedRevision: {
        select: { id: true, status: true },
      },
      contentRevisions: {
        where: {
          status: GuideRevisionStatus.PUBLISHED,
          version: { gt: 0 },
        },
        orderBy: { version: "desc" },
        take: 1,
        select: { id: true, version: true },
      },
    },
  });
  if (!guide || guide.clinicId !== clinicId) {
    throw notFound("Guide not found.");
  }
  assertPracticeGuideWritable(guide);
  return guide;
}

function guideCanBePublic(guide: {
  status: PracticeGuideStatus;
  isEnabled: boolean;
  downgradeRetainedAt: Date | null;
  contentRevisions: Array<{ id: string }>;
  pinnedRevision: { status: GuideRevisionStatus } | null;
}): boolean {
  if (
    guide.downgradeRetainedAt ||
    guide.status !== PracticeGuideStatus.PUBLISHED ||
    !guide.isEnabled
  ) {
    return false;
  }
  if (guide.contentRevisions.length > 0) {
    return true;
  }
  return guide.pinnedRevision?.status === GuideRevisionStatus.PUBLISHED;
}

export async function setGuideAvailableAtLocation(input: {
  clinicId: string;
  guideId: string;
  locationId: string;
  available: boolean;
}): Promise<{ enabled: boolean; publicPath: string | null }> {
  const guide = await requireGuide(input.clinicId, input.guideId);
  try {
    return await getPrisma().$transaction(async (tx) => {
      await lockClinicSiteLocationCapacity(tx, input.clinicId);
      const location = await tx.clinicLocation.findFirst({
        where: { id: input.locationId, clinicId: input.clinicId },
        select: {
          id: true,
          clinicId: true,
          slug: true,
          active: true,
          servesSiteRoot: true,
          clinicSiteId: true,
          clinicSite: { select: { active: true, clinicId: true, slug: true } },
        },
      });
      if (
        !location ||
        location.clinicId !== input.clinicId ||
        location.clinicSite.clinicId !== input.clinicId
      ) {
        throw notFound("Location not found.");
      }

      const existing = await tx.practiceGuidePlacement.findUnique({
        where: {
          locationId_practiceGuideId: {
            locationId: location.id,
            practiceGuideId: guide.id,
          },
        },
        select: {
          id: true,
          clinicId: true,
          publicSlug: true,
          isEnabled: true,
          publishedPracticeGuideRevisionId: true,
        },
      });

      if (!input.available) {
        if (!existing || existing.clinicId !== input.clinicId) {
          return { enabled: false, publicPath: null };
        }
        await tx.practiceGuidePlacement.update({
          where: { id: existing.id },
          data: { isEnabled: false },
        });
        return { enabled: false, publicPath: null };
      }

      if (!location.active || !location.clinicSite.active) {
        throw new ClinicPortalError(
          "Choose an active location on an active clinic site.",
          "conflict"
        );
      }

      const canBePublic = guideCanBePublic(guide);
      const publicSlug = existing?.publicSlug ?? guide.publicSlug;
      if (!isValidCareGuideSlug(publicSlug)) {
        throw new ClinicPortalError("Enter a valid public slug.", "invalid");
      }

      if (location.servesSiteRoot) {
        await assertRootGuideSlugAvailable(tx, {
          clinicId: input.clinicId,
          clinicSiteId: location.clinicSiteId,
          publicSlug,
        });
      }

      const latest = guide.contentRevisions[0] ?? null;
      const enabled = canBePublic;
      const pin = latest?.id ?? null;

      if (!existing) {
        await tx.practiceGuidePlacement.create({
          data: {
            clinicId: input.clinicId,
            locationId: location.id,
            practiceGuideId: guide.id,
            publicSlug,
            isEnabled: enabled,
            publishedPracticeGuideRevisionId: enabled ? pin : null,
          },
        });
      } else if (existing.clinicId !== input.clinicId) {
        throw notFound("Guide not found.");
      } else {
        await tx.practiceGuidePlacement.update({
          where: { id: existing.id },
          data: {
            isEnabled: enabled,
            ...(enabled && !existing.publishedPracticeGuideRevisionId && latest
              ? { publishedPracticeGuideRevisionId: latest.id }
              : {}),
          },
        });
      }

      return {
        enabled,
        publicPath: enabled
          ? placementPublicPath({
              servesSiteRoot: location.servesSiteRoot,
              locationSlug: location.slug,
              publicSlug,
            })
          : null,
      };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ClinicPortalError(
        "That guide address is already used at this location.",
        "conflict"
      );
    }
    throw error;
  }
}

export async function useLatestPlacementVersion(input: {
  clinicId: string;
  placementId: string;
}): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    const placement = await tx.practiceGuidePlacement.findFirst({
      where: { id: input.placementId, clinicId: input.clinicId },
      select: {
        id: true,
        clinicId: true,
        practiceGuideId: true,
        practiceGuide: {
          select: { id: true, clinicId: true, downgradeRetainedAt: true },
        },
      },
    });
    if (
      !placement ||
      placement.clinicId !== input.clinicId ||
      placement.practiceGuide.clinicId !== input.clinicId ||
      placement.practiceGuide.id !== placement.practiceGuideId
    ) {
      throw notFound("Placement not found.");
    }
    assertPracticeGuideWritable(placement.practiceGuide);
    const latest = await tx.practiceGuideRevision.findFirst({
      where: {
        practiceGuideId: placement.practiceGuideId,
        status: GuideRevisionStatus.PUBLISHED,
        version: { gt: 0 },
      },
      orderBy: { version: "desc" },
      select: { id: true, practiceGuideId: true },
    });
    if (!latest || latest.practiceGuideId !== placement.practiceGuideId) {
      throw new ClinicPortalError(
        "This location is using the original template. Publish a clinic version before updating it here.",
        "conflict"
      );
    }
    await tx.practiceGuidePlacement.update({
      where: { id: placement.id },
      data: { publishedPracticeGuideRevisionId: latest.id },
    });
  });
}

function copySlug(sourceSlug: string, locationSlug: string | null): string {
  const suffix = locationSlug ?? "copy";
  const raw = `${sourceSlug}-${suffix}`.slice(0, 32).replace(/-+$/g, "");
  return isValidCareGuideSlug(raw) ? raw : `${sourceSlug}-copy`.slice(0, 32);
}

export async function detachPlacementGuide(input: {
  clinicId: string;
  actorUserId: string;
  placementId: string;
}): Promise<{ guideId: string }> {
  try {
    return await getPrisma().$transaction(async (tx) => {
      const placement = await tx.practiceGuidePlacement.findFirst({
        where: { id: input.placementId, clinicId: input.clinicId },
        include: {
          location: {
            select: {
              id: true,
              clinicId: true,
              name: true,
              slug: true,
              servesSiteRoot: true,
            },
          },
          publishedPracticeGuideRevision: {
            include: {
              sections: { orderBy: { sortOrder: "asc" } },
            },
          },
          practiceGuide: {
            include: {
              pinnedRevision: {
                include: { sections: { orderBy: { sortOrder: "asc" } } },
              },
              overrides: true,
              additions: true,
            },
          },
        },
      });
      if (
        !placement ||
        placement.clinicId !== input.clinicId ||
        placement.location.clinicId !== input.clinicId ||
        placement.practiceGuide.clinicId !== input.clinicId
      ) {
        throw notFound("Placement not found.");
      }
      assertPracticeGuideWritable(placement.practiceGuide);

      const reserved = await reserveCustomGuidePlace(tx, input.clinicId);
      if (!reserved.ok) {
        throw new ClinicPortalError(
          reserved.error,
          reserved.code === "COMBINED_GUIDE_LIMIT_REACHED"
            ? "combined_guide_limit"
            : "custom_guide_limit"
        );
      }

      const source = placement.practiceGuide;
      const pinned = placement.publishedPracticeGuideRevision;
      const visibleSections =
        pinned &&
        pinned.practiceGuideId === source.id &&
        pinned.status === GuideRevisionStatus.PUBLISHED &&
        pinned.version > 0
          ? pinned.sections.map((section) => ({
              key: section.key,
              kind: section.kind,
              title: section.title,
              body: section.body,
              periodLabel: section.periodLabel,
              startDay: section.startDay,
              endDay: section.endDay,
              sortOrder: section.sortOrder,
              provenance: PracticeSectionProvenance.PRACTICE_CUSTOM,
            }))
          : source.pinnedRevision &&
              source.pinnedRevision.status === GuideRevisionStatus.PUBLISHED
            ? practiceRevisionSectionsFromComposed(
                composeGuideDocument({
                  canonicalSections: source.pinnedRevision.sections,
                  overrides: source.overrides,
                  additions: source.additions,
                }).sections
              )
            : null;

      if (!visibleSections || visibleSections.length === 0) {
        throw new ClinicPortalError(
          "Publish this guide before creating a location-specific copy.",
          "conflict"
        );
      }

      const place = placement.location.name.trim() || "location";
      const title = `${source.title} — ${place}`.slice(0, 120);
      const last = await tx.practiceGuide.findFirst({
        where: { clinicId: input.clinicId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      let publicSlug = copySlug(source.publicSlug, placement.location.slug);
      const used = await tx.practiceGuide.findMany({
        where: { clinicId: input.clinicId },
        select: { publicSlug: true },
      });
      const usedSlugs = new Set(used.map((guide) => guide.publicSlug));
      if (usedSlugs.has(publicSlug)) {
        for (let index = 2; index < 40; index += 1) {
          const candidate = copySlug(publicSlug, String(index));
          if (!usedSlugs.has(candidate) && isValidCareGuideSlug(candidate)) {
            publicSlug = candidate;
            break;
          }
        }
      }

      const created = await tx.practiceGuide.create({
        data: {
          clinicId: input.clinicId,
          title,
          publicSlug,
          status: PracticeGuideStatus.PUBLISHED,
          isEnabled: placement.isEnabled,
          sortOrder: (last?.sortOrder ?? 0) + 1,
          publishedAt: placement.isEnabled ? new Date() : null,
          copiedFromPracticeGuideId: source.id,
        },
      });
      const published = await tx.practiceGuideRevision.create({
        data: {
          practiceGuideId: created.id,
          version: 1,
          status: GuideRevisionStatus.PUBLISHED,
          title,
          publishedAt: new Date(),
          createdByUserId: input.actorUserId,
          sections: { create: visibleSections },
        },
      });
      await tx.practiceGuideRevision.create({
        data: {
          practiceGuideId: created.id,
          version: WORKING_DRAFT_VERSION,
          status: GuideRevisionStatus.DRAFT,
          title,
          createdByUserId: input.actorUserId,
          sections: { create: visibleSections },
        },
      });
      await tx.practiceGuidePlacement.update({
        where: { id: placement.id },
        data: {
          practiceGuideId: created.id,
          publishedPracticeGuideRevisionId: published.id,
        },
      });
      return { guideId: created.id };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ClinicPortalError(
        "Could not create a location-specific copy with a unique guide address.",
        "conflict"
      );
    }
    throw error;
  }
}

export async function loadGuidePlacementBoard(input: {
  clinicId: string;
  guideId: string;
  requestHost: string;
  protocol?: string;
}) {
  const prisma = getPrisma();
  const guide = await prisma.practiceGuide.findFirst({
    where: { id: input.guideId, clinicId: input.clinicId },
    select: {
      id: true,
      clinicId: true,
      title: true,
      publicSlug: true,
      status: true,
      isEnabled: true,
      contentRevisions: {
        where: {
          status: GuideRevisionStatus.PUBLISHED,
          version: { gt: 0 },
        },
        orderBy: { version: "desc" },
        take: 1,
        select: { id: true, version: true },
      },
      placements: {
        where: { clinicId: input.clinicId },
        select: {
          id: true,
          locationId: true,
          publicSlug: true,
          isEnabled: true,
          publishedPracticeGuideRevisionId: true,
          location: {
            select: {
              slug: true,
              servesSiteRoot: true,
              active: true,
              clinicSite: { select: { slug: true, active: true } },
            },
          },
        },
      },
    },
  });
  if (!guide || guide.clinicId !== input.clinicId) {
    return null;
  }
  const sites = await prisma.clinicSite.findMany({
    where: { clinicId: input.clinicId },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      active: true,
      locations: {
        orderBy: [{ servesSiteRoot: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          slug: true,
          active: true,
          servesSiteRoot: true,
        },
      },
    },
  });
  const latest = guide.contentRevisions[0] ?? null;
  const byLocation = new Map(
    guide.placements.map((placement) => [placement.locationId, placement])
  );
  return {
    guideId: guide.id,
    latestVersion: latest?.version ?? null,
    latestRevisionId: latest?.id ?? null,
    sites: sites
      .filter((site) => site.id)
      .map((site) => ({
        id: site.id,
        name: site.name,
        active: site.active,
        locations: site.locations.map((location) => {
          const placement = byLocation.get(location.id);
          const publicPath = placement
            ? placementPublicPath({
                servesSiteRoot: location.servesSiteRoot,
                locationSlug: location.slug,
                publicSlug: placement.publicSlug,
              })
            : null;
          return {
            id: location.id,
            name: location.name,
            active: location.active && site.active,
            placementId: placement?.id ?? null,
            enabled: placement?.isEnabled ?? false,
            behind:
              Boolean(placement?.isEnabled) &&
              placementIsBehindLatest({
                pinId: placement?.publishedPracticeGuideRevisionId ?? null,
                latestPublishedId: latest?.id ?? null,
              }),
            publicUrl:
              placement?.isEnabled && publicPath
                ? clinicPatientSiteUrl({
                    requestHost: input.requestHost,
                    clinicSlug: site.slug,
                    protocol: input.protocol,
                    pathname: publicPath,
                  })
                : null,
          };
        }),
      })),
  };
}

export function placementIsBehindLatest(input: {
  pinId: string | null;
  latestPublishedId: string | null;
}): boolean {
  return Boolean(
    input.latestPublishedId && input.pinId !== input.latestPublishedId
  );
}

export { PUBLIC_PRACTICE_GUIDE_WHERE };
