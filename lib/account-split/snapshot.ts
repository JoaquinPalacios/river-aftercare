import "server-only";

import { AccountTokenType, type Prisma } from "@prisma/client";

import type { AccountSplitSnapshot } from "@/lib/account-split/policy";
import { readSplitDestinationCommercialState } from "@/lib/billing/split-destination-access";
import { getPrisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

const OPEN_STATUSES = [
  "DRAFT",
  "DESTINATION_READY",
  "AWAITING_PAYMENT",
  "BILLING_READY",
  "READY_TO_EXECUTE",
] as const;

export async function findOpenAccountSplitPreparation(
  sourceClinicId: string,
  db: Db = getPrisma()
) {
  return db.clinicAccountSplitPreparation.findFirst({
    where: {
      sourceClinicId,
      status: { in: [...OPEN_STATUSES] },
    },
    select: { id: true, status: true, destinationClinicId: true },
  });
}

export async function findLatestCompletedAccountSplit(
  sourceClinicId: string,
  db: Db = getPrisma()
) {
  return db.clinicAccountSplitPreparation.findFirst({
    where: { sourceClinicId, status: { equals: "COMPLETED" } },
    orderBy: { executedAt: "desc" },
    select: { id: true, executedAt: true, destinationClinicId: true },
  });
}

export async function findLatestCancelledAccountSplit(
  sourceClinicId: string,
  db: Db = getPrisma()
) {
  return db.clinicAccountSplitPreparation.findFirst({
    where: { sourceClinicId, status: "CANCELLED" },
    orderBy: { cancelledAt: "desc" },
    select: {
      id: true,
      cancelledAt: true,
      destinationClinic: {
        select: { id: true, name: true, slug: true },
      },
    },
  });
}

export async function loadAccountSplitSnapshot(
  preparationId: string,
  db: Db = getPrisma()
): Promise<AccountSplitSnapshot | null> {
  const preparation = await db.clinicAccountSplitPreparation.findUnique({
    where: { id: preparationId },
    select: {
      id: true,
      status: true,
      sourceClinicId: true,
      destinationClinicId: true,
      keptClinicSiteId: true,
      destinationPlan: true,
      destinationBillingInterval: true,
      targetSourcePlan: true,
      expectedConfirmation: true,
      cancelledAt: true,
    },
  });
  if (!preparation) {
    return null;
  }

  const now = new Date();
  const [
    sourceClinic,
    sourceEntitlement,
    sites,
    locations,
    decisions,
    memberships,
    selections,
    invitations,
    guides,
    placements,
    destinationClinic,
    destinationEntitlement,
    destinationMemberships,
  ] = await runAccountSplitReads([
    () =>
      db.clinic.findUnique({
        where: { id: preparation.sourceClinicId },
        select: { id: true, name: true, slug: true },
      }),
    () =>
      db.clinicEntitlement.findUnique({
        where: { clinicId: preparation.sourceClinicId },
        select: {
          commercialPlan: true,
          locationAllowance: true,
          extraTeamMemberAllowance: true,
          extraCustomGuideAllowance: true,
          extraTemplateAdaptationAllowance: true,
        },
      }),
    () =>
      db.clinicSite.findMany({
        where: { clinicId: preparation.sourceClinicId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          displayName: true,
          active: true,
          isPrimary: true,
          logoUrl: true,
          faviconUrl: true,
          primaryColor: true,
          accentColor: true,
        },
      }),
    () =>
      db.clinicLocation.findMany({
        where: { clinicId: preparation.sourceClinicId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          clinicSiteId: true,
          name: true,
          slug: true,
          displayName: true,
          active: true,
          servesSiteRoot: true,
          isPrimary: true,
        },
      }),
    () =>
      db.clinicAccountSplitSiteDecision.findMany({
        where: { preparationId },
        select: { clinicSiteId: true, decision: true },
      }),
    () => loadMemberships(db, preparation.sourceClinicId),
    () =>
      db.clinicAccountSplitStaffSelection.findMany({
        where: { preparationId },
        select: {
          userId: true,
          keepOnSource: true,
          grantOnDestination: true,
          destinationRole: true,
        },
      }),
    () =>
      db.accountToken.findMany({
        where: {
          clinicId: preparation.sourceClinicId,
          type: AccountTokenType.INVITATION,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        select: { id: true, userId: true, email: true, role: true },
      }),
    () => loadGuides(db, preparation.sourceClinicId),
    () => loadPlacements(db, preparation.sourceClinicId),
    () =>
      preparation.destinationClinicId
        ? loadDestinationClinic(db, preparation.destinationClinicId)
        : Promise.resolve(null),
    () =>
      preparation.destinationClinicId
        ? readSplitDestinationCommercialState(
            preparation.destinationClinicId,
            db
          )
        : Promise.resolve(null),
    () =>
      preparation.destinationClinicId
        ? loadMemberships(db, preparation.destinationClinicId)
        : Promise.resolve([]),
  ]);

  if (!sourceClinic) {
    return null;
  }

  return {
    preparation,
    source: {
      id: sourceClinic.id,
      name: sourceClinic.name,
      slug: sourceClinic.slug,
      commercialPlan: sourceEntitlement?.commercialPlan ?? null,
      extras: {
        teamMembers: sourceEntitlement?.extraTeamMemberAllowance ?? 0,
        customGuides: sourceEntitlement?.extraCustomGuideAllowance ?? 0,
        templateAdaptations:
          sourceEntitlement?.extraTemplateAdaptationAllowance ?? 0,
      },
      locationAllowance: sourceEntitlement?.locationAllowance ?? 1,
    },
    sites,
    locations,
    decisions,
    memberships,
    selections,
    invitations,
    guides,
    placements,
    destination: {
      clinic: destinationClinic,
      entitlement: destinationEntitlement,
      memberships: destinationMemberships.map((membership) => ({
        userId: membership.userId,
        role: membership.role,
        active: membership.active,
        platformRole: membership.platformRole,
      })),
    },
  };
}

async function loadMemberships(db: Db, clinicId: string) {
  const rows = await db.clinicMembership.findMany({
    where: { clinicId },
    orderBy: { createdAt: "asc" },
    select: { userId: true, role: true, active: true },
  });
  const users =
    rows.length === 0
      ? []
      : await db.user.findMany({
          where: { id: { in: rows.map((row) => row.userId) } },
          select: { id: true, name: true, email: true, platformRole: true },
        });
  const byId = new Map(users.map((user) => [user.id, user]));
  return rows.flatMap((row) => {
    const user = byId.get(row.userId);
    if (!user) {
      return [];
    }
    return [
      {
        userId: row.userId,
        role: row.role,
        active: row.active,
        name: user.name,
        email: user.email,
        platformRole: user.platformRole,
      },
    ];
  });
}

async function loadGuides(db: Db, clinicId: string) {
  const guides = await db.practiceGuide.findMany({
    where: { clinicId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      publicSlug: true,
      status: true,
      guideTemplateId: true,
      pinnedRevisionId: true,
      sourceGuideTemplateId: true,
      adaptedAt: true,
      copiedFromPracticeGuideId: true,
      downgradeRetainedAt: true,
    },
  });
  const guideIds = guides.map((guide) => guide.id);
  if (guideIds.length === 0) {
    return [];
  }
  const revisions = await db.practiceGuideRevision.findMany({
    where: { practiceGuideId: { in: guideIds } },
    orderBy: { version: "asc" },
    select: {
      id: true,
      practiceGuideId: true,
      version: true,
      status: true,
      createdByUserId: true,
      reviewAttestedByUserId: true,
    },
  });
  const revisionIds = revisions.map((revision) => revision.id);
  const sectionCounts =
    revisionIds.length === 0
      ? []
      : await db.practiceGuideRevisionSection.groupBy({
          by: ["revisionId"],
          where: { revisionId: { in: revisionIds } },
          _count: { _all: true },
        });
  const overrideCounts = await db.practiceGuideOverride.groupBy({
    by: ["practiceGuideId"],
    where: { practiceGuideId: { in: guideIds } },
    _count: { _all: true },
  });
  const additionCounts = await db.practiceGuideAddition.groupBy({
    by: ["practiceGuideId"],
    where: { practiceGuideId: { in: guideIds } },
    _count: { _all: true },
  });
  const sectionsByRevision = new Map(
    sectionCounts.map((row) => [row.revisionId, row._count._all])
  );
  const overridesByGuide = new Map(
    overrideCounts.map((row) => [row.practiceGuideId, row._count._all])
  );
  const additionsByGuide = new Map(
    additionCounts.map((row) => [row.practiceGuideId, row._count._all])
  );
  const revisionsByGuide = new Map<string, typeof revisions>();
  for (const revision of revisions) {
    const current = revisionsByGuide.get(revision.practiceGuideId) ?? [];
    current.push(revision);
    revisionsByGuide.set(revision.practiceGuideId, current);
  }
  return guides.map((guide) => ({
    id: guide.id,
    title: guide.title,
    publicSlug: guide.publicSlug,
    status: guide.status,
    guideTemplateId: guide.guideTemplateId,
    pinnedRevisionId: guide.pinnedRevisionId,
    sourceGuideTemplateId: guide.sourceGuideTemplateId,
    adaptedAt: guide.adaptedAt,
    copiedFromPracticeGuideId: guide.copiedFromPracticeGuideId,
    downgradeRetainedAt: guide.downgradeRetainedAt,
    overrideCount: overridesByGuide.get(guide.id) ?? 0,
    additionCount: additionsByGuide.get(guide.id) ?? 0,
    revisions: (revisionsByGuide.get(guide.id) ?? []).map((revision) => ({
      id: revision.id,
      version: revision.version,
      status: revision.status,
      createdByUserId: revision.createdByUserId,
      reviewAttestedByUserId: revision.reviewAttestedByUserId,
      sectionCount: sectionsByRevision.get(revision.id) ?? 0,
    })),
  }));
}

async function loadPlacements(db: Db, clinicId: string) {
  const placements = await db.practiceGuidePlacement.findMany({
    where: { clinicId },
    select: {
      id: true,
      practiceGuideId: true,
      locationId: true,
      clinicId: true,
      publicSlug: true,
      isEnabled: true,
      publishedPracticeGuideRevisionId: true,
    },
  });
  if (placements.length === 0) {
    return [];
  }
  const guides = await db.practiceGuide.findMany({
    where: { id: { in: placements.map((row) => row.practiceGuideId) } },
    select: { id: true, clinicId: true },
  });
  const locations = await db.clinicLocation.findMany({
    where: { id: { in: placements.map((row) => row.locationId) } },
    select: { id: true, clinicId: true, clinicSiteId: true },
  });
  const sites = await db.clinicSite.findMany({
    where: {
      id: { in: locations.map((location) => location.clinicSiteId) },
    },
    select: { id: true, clinicId: true },
  });
  const revisionIds = placements.flatMap((row) =>
    row.publishedPracticeGuideRevisionId
      ? [row.publishedPracticeGuideRevisionId]
      : []
  );
  const revisions =
    revisionIds.length === 0
      ? []
      : await db.practiceGuideRevision.findMany({
          where: { id: { in: revisionIds } },
          select: { id: true, practiceGuideId: true },
        });
  const guideClinic = new Map(
    guides.map((guide) => [guide.id, guide.clinicId])
  );
  const locationById = new Map(
    locations.map((location) => [location.id, location])
  );
  const siteClinic = new Map(sites.map((site) => [site.id, site.clinicId]));
  const revisionGuide = new Map(
    revisions.map((revision) => [revision.id, revision.practiceGuideId])
  );
  return placements.map((placement) => {
    const location = locationById.get(placement.locationId);
    return {
      id: placement.id,
      practiceGuideId: placement.practiceGuideId,
      locationId: placement.locationId,
      clinicId: placement.clinicId,
      guideClinicId: guideClinic.get(placement.practiceGuideId) ?? "",
      locationClinicId: location?.clinicId ?? "",
      siteClinicId: location
        ? (siteClinic.get(location.clinicSiteId) ?? "")
        : "",
      publicSlug: placement.publicSlug,
      isEnabled: placement.isEnabled,
      publishedPracticeGuideRevisionId:
        placement.publishedPracticeGuideRevisionId,
      publishedRevisionPracticeGuideId:
        placement.publishedPracticeGuideRevisionId
          ? (revisionGuide.get(placement.publishedPracticeGuideRevisionId) ??
            null)
          : null,
    };
  });
}

async function loadDestinationClinic(db: Db, clinicId: string) {
  const clinic = await db.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, name: true, slug: true },
  });
  if (!clinic) {
    return null;
  }
  const siteCount = await db.clinicSite.count({ where: { clinicId } });
  return { ...clinic, siteCount };
}

async function runAccountSplitReads<T extends readonly unknown[]>(reads: {
  [K in keyof T]: () => Promise<T[K]>;
}): Promise<T> {
  const values: unknown[] = [];
  for (const read of reads) {
    values.push(await read());
  }
  return values as unknown as T;
}
