import type { Prisma } from "@prisma/client";

import { planSplitSiteBranding } from "@/lib/account-split/branding-plan";
import { recordAccountSplitEvent } from "@/lib/account-split/events";
import {
  ACCOUNT_SPLIT_COMMERCIAL_CONFLICT_CODES,
  type AccountSplitAssessment,
  type AccountSplitSnapshot,
} from "@/lib/account-split/policy";
import {
  allocateAccountGuideSlug,
  assessSiteToExistingGroup,
  confirmationMatchesExistingGroupMove,
  existingGroupMoveConfirmationPhrase,
} from "@/lib/account-split/site-to-existing-group-policy";
import type {
  AccountSplitExecutionHooks,
  AccountSplitExecutionResult,
  CopiedRevision,
} from "@/lib/account-split/execute";
import { effectiveSiteLocationAllowance } from "@/lib/clinics/site-location-allowance";
import { countActiveSiteLocationUsage } from "@/lib/clinics/site-location-capacity";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import {
  lockClinicGuideCapacity,
  lockClinicSiteLocationCapacity,
  lockClinicTeamCapacity,
} from "@/lib/entitlements/locks";

type Tx = Prisma.TransactionClient;

type CutoverOutcome =
  | { kind: "completed"; result: AccountSplitExecutionResult }
  | { kind: "refused"; message: string };

type CapturedPlacement = {
  id: string;
  locationId: string;
  publicSlug: string;
  isEnabled: boolean;
  publishedPracticeGuideRevisionId: string | null;
  practiceGuideId: string;
  createdAt: Date;
};

type Steps = {
  interrupt: (
    hooks: AccountSplitExecutionHooks | undefined,
    point: NonNullable<AccountSplitExecutionHooks["interruptAfter"]>
  ) => Promise<void>;
  assertExclusiveStaffSelections: (snapshot: AccountSplitSnapshot) => void;
  copySplitGuides: (
    tx: Tx,
    input: {
      preparationId: string;
      sourceClinicId: string;
      destinationClinicId: string;
      movingLocationIds: Set<string>;
      excludeSourceGuideIds?: ReadonlySet<string>;
      publicSlugFor?: (guide: { id: string; publicSlug: string }) => string;
    }
  ) => Promise<{
    guideIds: Map<string, string>;
    revisionsBySource: Map<string, CopiedRevision>;
  }>;
  captureMovingPlacements: (
    tx: Tx,
    input: { sourceClinicId: string; locationIds: string[] }
  ) => Promise<CapturedPlacement[]>;
  assertPlacementPins: (
    placements: CapturedPlacement[],
    revisionsBySource: Map<string, CopiedRevision>
  ) => void;
  reinsertPlacements: (
    tx: Tx,
    input: {
      destinationClinicId: string;
      placements: CapturedPlacement[];
      guideIds: Map<string, string>;
      revisionsBySource: Map<string, CopiedRevision>;
    }
  ) => Promise<void>;
  assertCompatibilitySlugTargets: (
    tx: Tx,
    input: {
      sourceClinicId: string;
      destinationClinicId: string;
      sourceTarget: string;
      destinationTarget: string;
    }
  ) => Promise<void>;
  writeCompatibilitySlugs: (
    tx: Tx,
    input: {
      sourceClinicId: string;
      destinationClinicId: string;
      sourceTarget: string;
      destinationTarget: string;
    }
  ) => Promise<boolean>;
  mirrorClinicProfile: (
    tx: Tx,
    clinicId: string,
    siteId: string
  ) => Promise<void>;
  applyMembershipDecisions: (
    tx: Tx,
    input: {
      sourceClinicId: string;
      destinationClinicId: string;
      snapshot: AccountSplitSnapshot;
    }
  ) => Promise<string[]>;
  assertSourceStructure: (tx: Tx, sourceClinicId: string) => Promise<void>;
  readExecutionSummary: (
    db: Tx,
    preparationId: string
  ) => Promise<
    Omit<
      AccountSplitExecutionResult,
      "alreadyCompleted" | "compatibilitySlugParked"
    >
  >;
};

const COMMERCIAL_SELECT = {
  commercialPlan: true,
  entitlementStatus: true,
  purchasedAdditionalSiteQuantity: true,
  purchasedAdditionalLocationQuantity: true,
  extraSiteAllowance: true,
  extraLocationAllowance: true,
  siteAllowance: true,
  locationAllowance: true,
} as const;

/**
 * Structural cutover for SITE_TO_EXISTING_GROUP.
 * The caller already holds sorted account-structure locks and sorted
 * account-split locks. This does not create an Account, call Stripe, or
 * insert a ClinicLocationRedirect.
 */
export async function executeSiteToExistingGroupCutover(
  tx: Tx,
  input: {
    snapshot: AccountSplitSnapshot;
    operatorUserId: string;
    confirmation: string;
    hooks?: AccountSplitExecutionHooks;
    destinationClinicId: string;
    steps: Steps;
  }
): Promise<CutoverOutcome> {
  const snapshot = input.snapshot;
  const destinationId = input.destinationClinicId;
  if (snapshot.preparation.operationKind !== "SITE_TO_EXISTING_GROUP") {
    throw new ClinicPortalError(
      "This structural operation is not available.",
      "invalid"
    );
  }
  if (snapshot.preparation.status !== "READY_TO_EXECUTE") {
    throw new ClinicPortalError(
      "This preparation is not ready to execute.",
      "conflict"
    );
  }

  const assessment = assessSiteToExistingGroup(snapshot);
  const movingSite = assessment.splitSite;
  if (
    !movingSite ||
    !confirmationMatchesExistingGroupMove(movingSite.slug, input.confirmation)
  ) {
    throw new ClinicPortalError(
      movingSite
        ? `Type the confirmation exactly as ${existingGroupMoveConfirmationPhrase(movingSite.slug)}.`
        : "Choose the Clinic Site to move before executing.",
      "invalid"
    );
  }

  if (assessment.status !== "READY_TO_EXECUTE") {
    await tx.clinicAccountSplitPreparation.update({
      where: { id: snapshot.preparation.id },
      data: {
        status: assessment.status,
        expectedConfirmation: assessment.confirmationPhrase,
      },
    });
    await recordCommercialConflicts(tx, {
      assessment,
      operatorUserId: input.operatorUserId,
      snapshot,
      destinationId,
      siteId: movingSite.id,
    });
    return { kind: "refused", message: refusalMessage(assessment) };
  }

  const futurePrimary = assessment.primaryPromotion.futurePrimarySite;
  const destinationPrimaryId =
    assessment.existingGroup?.destinationPrimarySiteId;
  if (
    !futurePrimary ||
    futurePrimary.id === movingSite.id ||
    !destinationPrimaryId
  ) {
    throw new ClinicPortalError(
      "This move does not have a valid source and destination primary Site.",
      "conflict"
    );
  }

  const branding = planSplitSiteBranding({
    sourceClinicId: snapshot.source.id,
    destinationClinicId: destinationId,
    site: movingSite,
    preparationId: snapshot.preparation.id,
    assets: snapshot.brandingAssets,
  });
  if (!branding.ready || !branding.values) {
    throw new ClinicPortalError(
      "Prepare destination-owned branding for the moving Clinic Site before execution.",
      "conflict"
    );
  }

  const clinicIds = [snapshot.source.id, destinationId].sort();
  for (const clinicId of clinicIds) {
    await lockClinicTeamCapacity(tx, clinicId);
  }
  for (const clinicId of clinicIds) {
    await lockClinicGuideCapacity(tx, clinicId);
  }
  for (const clinicId of clinicIds) {
    await lockClinicSiteLocationCapacity(tx, clinicId);
  }

  const liveMoving = await tx.clinicSite.findFirst({
    where: { id: movingSite.id, clinicId: snapshot.source.id },
    select: {
      id: true,
      slug: true,
      active: true,
      isPrimary: true,
      logoUrl: true,
      darkLogoUrl: true,
      faviconUrl: true,
    },
  });
  if (
    !liveMoving ||
    !liveMoving.active ||
    liveMoving.slug !== movingSite.slug ||
    liveMoving.isPrimary !== movingSite.isPrimary ||
    liveMoving.logoUrl !== movingSite.logoUrl ||
    liveMoving.darkLogoUrl !== movingSite.darkLogoUrl ||
    liveMoving.faviconUrl !== movingSite.faviconUrl
  ) {
    throw new ClinicPortalError(
      "The Clinic Site to move changed. Review the preparation again.",
      "conflict"
    );
  }

  const liveKept = await tx.clinicSite.findFirst({
    where: { id: futurePrimary.id, clinicId: snapshot.source.id, active: true },
    select: { id: true, slug: true, isPrimary: true },
  });
  if (!liveKept || liveKept.id === movingSite.id) {
    throw new ClinicPortalError(
      "The Clinic Site that stays on the source Account is no longer valid.",
      "conflict"
    );
  }
  if (!movingSite.isPrimary && !liveKept.isPrimary) {
    throw new ClinicPortalError(
      "The source primary Clinic Site changed. Review the preparation again.",
      "conflict"
    );
  }

  const destinationPrimaries = await tx.clinicSite.findMany({
    where: { clinicId: destinationId, active: true, isPrimary: true },
    select: { id: true },
  });
  if (
    destinationPrimaries.length !== 1 ||
    destinationPrimaries[0]?.id !== destinationPrimaryId
  ) {
    throw new ClinicPortalError(
      "The destination primary Clinic Site changed. Review the preparation again.",
      "conflict"
    );
  }

  const movingLocationIds = snapshot.locations
    .filter((location) => location.clinicSiteId === movingSite.id)
    .map((location) => location.id)
    .sort();
  const liveLocations = await tx.clinicLocation.findMany({
    where: { clinicSiteId: movingSite.id, clinicId: snapshot.source.id },
    select: {
      id: true,
      slug: true,
      servesSiteRoot: true,
      active: true,
      isPrimary: true,
    },
  });
  if (
    liveLocations.length !== movingLocationIds.length ||
    liveLocations.some((location) => !movingLocationIds.includes(location.id))
  ) {
    throw new ClinicPortalError(
      "The Clinic Site locations changed. Review the preparation again.",
      "conflict"
    );
  }

  const livePlacements =
    movingLocationIds.length === 0
      ? []
      : await tx.practiceGuidePlacement.findMany({
          where: {
            clinicId: snapshot.source.id,
            locationId: { in: movingLocationIds },
          },
          select: {
            id: true,
            practiceGuideId: true,
            isEnabled: true,
            publicSlug: true,
          },
        });
  const expectedPlacementIds = snapshot.placements
    .filter((placement) => movingLocationIds.includes(placement.locationId))
    .map((placement) => placement.id)
    .sort();
  const actualPlacementIds = livePlacements
    .map((placement) => placement.id)
    .sort();
  if (expectedPlacementIds.join("|") !== actualPlacementIds.join("|")) {
    throw new ClinicPortalError(
      "Placements on the moving Clinic Site changed. Review the preparation again.",
      "conflict"
    );
  }

  const downgradeSelections =
    movingLocationIds.length === 0
      ? 0
      : await tx.downgradeLocationSelection.count({
          where: { locationId: { in: movingLocationIds } },
        });
  if (downgradeSelections > 0) {
    throw new ClinicPortalError(
      "A downgrade selection still names a location on the Clinic Site that would move.",
      "conflict"
    );
  }

  const retargets = new Map<string, string>();
  for (const decision of assessment.existingGroup?.canonicalDecisions ?? []) {
    if (
      !decision.compatible ||
      !decision.confirmed ||
      !decision.destinationGuideId
    ) {
      continue;
    }
    retargets.set(decision.sourceGuideId, decision.destinationGuideId);
  }
  for (const [sourceGuideId, destinationGuideId] of retargets) {
    const destinationGuide = await tx.practiceGuide.findFirst({
      where: { id: destinationGuideId, clinicId: destinationId },
      select: {
        id: true,
        guideTemplateId: true,
        pinnedRevisionId: true,
        sourceGuideTemplateId: true,
        adaptedAt: true,
        copiedFromPracticeGuideId: true,
        downgradeRetainedAt: true,
        isEnabled: true,
        status: true,
        overrides: { select: { id: true } },
        additions: { select: { id: true } },
        contentRevisions: { select: { id: true } },
      },
    });
    const sourceGuide = snapshot.guides.find(
      (guide) => guide.id === sourceGuideId
    );
    if (
      !destinationGuide ||
      !sourceGuide ||
      destinationGuide.guideTemplateId !== sourceGuide.guideTemplateId ||
      destinationGuide.pinnedRevisionId !== sourceGuide.pinnedRevisionId ||
      destinationGuide.sourceGuideTemplateId !== null ||
      destinationGuide.adaptedAt !== null ||
      destinationGuide.copiedFromPracticeGuideId !== null ||
      destinationGuide.downgradeRetainedAt !== null ||
      destinationGuide.overrides.length > 0 ||
      destinationGuide.additions.length > 0 ||
      destinationGuide.contentRevisions.length > 0
    ) {
      throw new ClinicPortalError(
        "A confirmed destination guide is no longer an exact canonical match.",
        "conflict"
      );
    }
  }

  const [
    sourceCommercial,
    destinationCommercial,
    destinationProfile,
    redirectsBefore,
  ] = await Promise.all([
    tx.clinicEntitlement.findUnique({
      where: { clinicId: snapshot.source.id },
      select: COMMERCIAL_SELECT,
    }),
    tx.clinicEntitlement.findUnique({
      where: { clinicId: destinationId },
      select: COMMERCIAL_SELECT,
    }),
    tx.clinicProfile.findUnique({
      where: { clinicId: destinationId },
      select: {
        displayName: true,
        logoUrl: true,
        darkLogoUrl: true,
        faviconUrl: true,
      },
    }),
    tx.clinicLocationRedirect.count(),
  ]);
  const destinationGuidesBefore = await tx.practiceGuide.findMany({
    where: { clinicId: destinationId },
    orderBy: { id: "asc" },
    select: {
      id: true,
      title: true,
      publicSlug: true,
      status: true,
      isEnabled: true,
      guideTemplateId: true,
      pinnedRevisionId: true,
      sourceGuideTemplateId: true,
      copiedFromPracticeGuideId: true,
      downgradeRetainedAt: true,
    },
  });
  const destinationClinic = await tx.clinic.findUnique({
    where: { id: destinationId },
    select: { slug: true },
  });
  if (!destinationClinic || !destinationProfile) {
    throw new ClinicPortalError(
      "The destination Group could not be found.",
      "conflict"
    );
  }

  input.steps.assertExclusiveStaffSelections(snapshot);
  await input.steps.assertCompatibilitySlugTargets(tx, {
    sourceClinicId: snapshot.source.id,
    destinationClinicId: destinationId,
    sourceTarget: liveKept.slug,
    destinationTarget: destinationClinic.slug,
  });

  await recordAccountSplitEvent(tx, {
    preparationId: snapshot.preparation.id,
    kind: "CUTOVER_STARTED",
    fromStatus: "READY_TO_EXECUTE",
    actorUserId: input.operatorUserId,
    sourceClinicId: snapshot.source.id,
    destinationClinicId: destinationId,
    siteId: movingSite.id,
    category: "cutover_started",
  });

  const existingSlugs = await tx.practiceGuide.findMany({
    where: { clinicId: destinationId },
    select: { publicSlug: true },
  });
  const takenSlugs = new Set(existingSlugs.map((guide) => guide.publicSlug));
  const copyGuideIds = [
    ...new Set(livePlacements.map((placement) => placement.practiceGuideId)),
  ].filter((id) => !retargets.has(id));
  const copyGuideRows =
    copyGuideIds.length === 0
      ? []
      : await tx.practiceGuide.findMany({
          where: { id: { in: copyGuideIds }, clinicId: snapshot.source.id },
          orderBy: { id: "asc" },
          select: { id: true, publicSlug: true },
        });
  const slugByGuide = new Map<string, string>();
  for (const guide of copyGuideRows) {
    slugByGuide.set(
      guide.id,
      allocateAccountGuideSlug(guide.publicSlug, takenSlugs)
    );
  }

  const copied = await input.steps.copySplitGuides(tx, {
    preparationId: snapshot.preparation.id,
    sourceClinicId: snapshot.source.id,
    destinationClinicId: destinationId,
    movingLocationIds: new Set(movingLocationIds),
    excludeSourceGuideIds: new Set(retargets.keys()),
    publicSlugFor: (guide) => {
      const slug = slugByGuide.get(guide.id);
      if (!slug) {
        throw new ClinicPortalError(
          "A guide copy could not choose a destination slug.",
          "conflict"
        );
      }
      return slug;
    },
  });
  await input.steps.interrupt(input.hooks, "after_guide_copies");

  const guideIds = new Map(copied.guideIds);
  for (const [sourceGuideId, destinationGuideId] of retargets) {
    if (guideIds.has(sourceGuideId)) {
      throw new ClinicPortalError(
        "A retargeted guide was also copied.",
        "conflict"
      );
    }
    guideIds.set(sourceGuideId, destinationGuideId);
  }

  const movingPlacements = await input.steps.captureMovingPlacements(tx, {
    sourceClinicId: snapshot.source.id,
    locationIds: movingLocationIds,
  });
  input.steps.assertPlacementPins(movingPlacements, copied.revisionsBySource);
  if (movingPlacements.length > 0) {
    await tx.practiceGuidePlacement.deleteMany({
      where: {
        id: { in: movingPlacements.map((placement) => placement.id) },
        clinicId: snapshot.source.id,
      },
    });
  }
  await input.steps.interrupt(input.hooks, "after_placement_deletion");

  if (movingSite.isPrimary) {
    await tx.clinicSite.updateMany({
      where: {
        id: movingSite.id,
        clinicId: snapshot.source.id,
        isPrimary: true,
      },
      data: { isPrimary: false },
    });
    const promoted = await tx.clinicSite.updateMany({
      where: { id: liveKept.id, clinicId: snapshot.source.id },
      data: { isPrimary: true },
    });
    if (promoted.count !== 1) {
      throw new ClinicPortalError(
        "The source primary Site could not be updated.",
        "conflict"
      );
    }
  }
  await input.steps.interrupt(input.hooks, "after_primary_switch");

  const locationsBefore = liveLocations.map((location) => ({
    id: location.id,
    slug: location.slug,
    servesSiteRoot: location.servesSiteRoot,
    active: location.active,
    isPrimary: location.isPrimary,
  }));
  await tx.clinicSite.update({
    where: { id: movingSite.id },
    data: {
      clinicId: destinationId,
      isPrimary: false,
      logoUrl: branding.values.logoUrl,
      darkLogoUrl: branding.values.darkLogoUrl,
      faviconUrl: branding.values.faviconUrl,
    },
  });
  const locationsAfter = await tx.clinicLocation.findMany({
    where: { clinicSiteId: movingSite.id },
    select: {
      id: true,
      slug: true,
      servesSiteRoot: true,
      active: true,
      isPrimary: true,
      clinicId: true,
    },
  });
  if (locationsAfter.length !== locationsBefore.length) {
    throw new ClinicPortalError(
      "Moving the site did not keep every location.",
      "conflict"
    );
  }
  for (const location of locationsAfter) {
    const previous = locationsBefore.find((row) => row.id === location.id);
    if (
      !previous ||
      location.clinicId !== destinationId ||
      location.slug !== previous.slug ||
      location.servesSiteRoot !== previous.servesSiteRoot ||
      location.active !== previous.active ||
      location.isPrimary !== previous.isPrimary
    ) {
      throw new ClinicPortalError(
        "A moved location did not stay attached to the destination Account.",
        "conflict"
      );
    }
  }
  await input.steps.interrupt(input.hooks, "after_site_move");

  await input.steps.reinsertPlacements(tx, {
    destinationClinicId: destinationId,
    placements: movingPlacements,
    guideIds,
    revisionsBySource: copied.revisionsBySource,
  });
  await input.steps.interrupt(input.hooks, "after_placement_reinsertion");

  const parked = await input.steps.writeCompatibilitySlugs(tx, {
    sourceClinicId: snapshot.source.id,
    destinationClinicId: destinationId,
    sourceTarget: liveKept.slug,
    destinationTarget: destinationClinic.slug,
  });
  await input.steps.mirrorClinicProfile(tx, snapshot.source.id, liveKept.id);

  await input.steps.applyMembershipDecisions(tx, {
    sourceClinicId: snapshot.source.id,
    destinationClinicId: destinationId,
    snapshot,
  });
  await input.steps.interrupt(input.hooks, "after_membership_changes");

  await input.steps.assertSourceStructure(tx, snapshot.source.id);
  await assertDestinationAfterMove(tx, {
    destinationClinicId: destinationId,
    movedSiteId: movingSite.id,
    movedSlug: movingSite.slug,
    destinationPrimaryId,
    guideIds,
    placementIds: movingPlacements.map((placement) => placement.id),
  });

  const [
    sourceAfter,
    destinationAfter,
    profileAfter,
    redirectsAfter,
    guidesAfter,
  ] = await Promise.all([
    tx.clinicEntitlement.findUnique({
      where: { clinicId: snapshot.source.id },
      select: COMMERCIAL_SELECT,
    }),
    tx.clinicEntitlement.findUnique({
      where: { clinicId: destinationId },
      select: COMMERCIAL_SELECT,
    }),
    tx.clinicProfile.findUnique({
      where: { clinicId: destinationId },
      select: {
        displayName: true,
        logoUrl: true,
        darkLogoUrl: true,
        faviconUrl: true,
      },
    }),
    tx.clinicLocationRedirect.count(),
    destinationGuidesBefore.length === 0
      ? Promise.resolve([])
      : tx.practiceGuide.findMany({
          where: {
            id: { in: destinationGuidesBefore.map((guide) => guide.id) },
          },
          orderBy: { id: "asc" },
          select: {
            id: true,
            title: true,
            publicSlug: true,
            status: true,
            isEnabled: true,
            guideTemplateId: true,
            pinnedRevisionId: true,
            sourceGuideTemplateId: true,
            copiedFromPracticeGuideId: true,
            downgradeRetainedAt: true,
          },
        }),
  ]);
  if (
    JSON.stringify(sourceCommercial) !== JSON.stringify(sourceAfter) ||
    JSON.stringify(destinationCommercial) !== JSON.stringify(destinationAfter)
  ) {
    throw new ClinicPortalError(
      "Execution must not change commercial capacity.",
      "conflict"
    );
  }
  if (JSON.stringify(destinationProfile) !== JSON.stringify(profileAfter)) {
    throw new ClinicPortalError(
      "Execution must not change the destination Account profile.",
      "conflict"
    );
  }
  if (redirectsAfter !== redirectsBefore) {
    throw new ClinicPortalError(
      "This move must not create a location redirect.",
      "conflict"
    );
  }
  if (JSON.stringify(destinationGuidesBefore) !== JSON.stringify(guidesAfter)) {
    throw new ClinicPortalError(
      "Execution must not change an existing destination guide.",
      "conflict"
    );
  }
  const usage = await countActiveSiteLocationUsage(tx, destinationId);
  const allowance = effectiveSiteLocationAllowance({
    entitlement: destinationAfter
      ? {
          commercialPlan: destinationAfter.commercialPlan,
          siteAllowance: destinationAfter.siteAllowance,
          locationAllowance: destinationAfter.locationAllowance,
          capacityEntitlementActive:
            destinationAfter.entitlementStatus === "ACTIVE",
          purchasedAdditionalSiteQuantity:
            destinationAfter.purchasedAdditionalSiteQuantity,
          extraSiteAllowance: destinationAfter.extraSiteAllowance,
          extraLocationAllowance: destinationAfter.extraLocationAllowance,
        }
      : null,
  });
  if (
    usage.activeSites > allowance.siteAllowance ||
    usage.activeLocations > allowance.locationAllowance
  ) {
    throw new ClinicPortalError(
      "Destination capacity no longer fits this move.",
      "conflict"
    );
  }

  const executedAt = new Date();
  const completed = await tx.clinicAccountSplitPreparation.updateMany({
    where: { id: snapshot.preparation.id, status: "READY_TO_EXECUTE" },
    data: {
      status: "COMPLETED",
      executedAt,
      executingOperatorUserId: input.operatorUserId,
      expectedConfirmation: existingGroupMoveConfirmationPhrase(
        movingSite.slug
      ),
    },
  });
  if (completed.count !== 1) {
    throw new ClinicPortalError(
      "This preparation could not be completed.",
      "conflict"
    );
  }
  await recordAccountSplitEvent(tx, {
    preparationId: snapshot.preparation.id,
    kind: "CUTOVER_COMPLETED",
    fromStatus: "READY_TO_EXECUTE",
    toStatus: "COMPLETED",
    actorUserId: input.operatorUserId,
    sourceClinicId: snapshot.source.id,
    destinationClinicId: destinationId,
    siteId: movingSite.id,
    category: "cutover_completed",
  });

  const summary = await input.steps.readExecutionSummary(
    tx,
    snapshot.preparation.id
  );
  return {
    kind: "completed",
    result: {
      ...summary,
      alreadyCompleted: false,
      compatibilitySlugParked: parked,
    },
  };
}

async function assertDestinationAfterMove(
  tx: Tx,
  input: {
    destinationClinicId: string;
    movedSiteId: string;
    movedSlug: string;
    destinationPrimaryId: string;
    guideIds: Map<string, string>;
    placementIds: string[];
  }
): Promise<void> {
  const moved = await tx.clinicSite.findUnique({
    where: { id: input.movedSiteId },
    select: { clinicId: true, isPrimary: true, slug: true, active: true },
  });
  if (
    !moved ||
    moved.clinicId !== input.destinationClinicId ||
    moved.isPrimary ||
    moved.slug !== input.movedSlug ||
    !moved.active
  ) {
    throw new ClinicPortalError(
      "The incoming Clinic Site must stay non-primary on the destination Group.",
      "conflict"
    );
  }
  const primaries = await tx.clinicSite.findMany({
    where: { clinicId: input.destinationClinicId, isPrimary: true },
    select: { id: true, active: true },
  });
  if (
    primaries.length !== 1 ||
    primaries[0]?.id !== input.destinationPrimaryId ||
    !primaries[0]?.active
  ) {
    throw new ClinicPortalError(
      "The destination primary Clinic Site must stay the primary Site.",
      "conflict"
    );
  }
  const placements =
    input.placementIds.length === 0
      ? []
      : await tx.practiceGuidePlacement.findMany({
          where: { id: { in: input.placementIds } },
          select: {
            id: true,
            clinicId: true,
            practiceGuideId: true,
            publicSlug: true,
          },
        });
  if (placements.length !== input.placementIds.length) {
    throw new ClinicPortalError(
      "A moving placement was not restored.",
      "conflict"
    );
  }
  for (const placement of placements) {
    if (placement.clinicId !== input.destinationClinicId) {
      throw new ClinicPortalError(
        "A destination placement points outside the destination Account.",
        "conflict"
      );
    }
    const expectedGuide = [...input.guideIds.values()];
    if (!expectedGuide.includes(placement.practiceGuideId)) {
      throw new ClinicPortalError(
        "A destination placement does not use the prepared guide.",
        "conflict"
      );
    }
  }
}

function refusalMessage(assessment: AccountSplitAssessment): string {
  if (assessment.blockers.length === 0) {
    return "This move is no longer ready to execute.";
  }
  return assessment.blockers.map((blocker) => blocker.message).join(" ");
}

async function recordCommercialConflicts(
  tx: Tx,
  input: {
    assessment: AccountSplitAssessment;
    operatorUserId: string;
    snapshot: AccountSplitSnapshot;
    destinationId: string;
    siteId: string;
  }
): Promise<void> {
  for (const code of ACCOUNT_SPLIT_COMMERCIAL_CONFLICT_CODES) {
    if (input.assessment.blockers.some((blocker) => blocker.code === code)) {
      await recordAccountSplitEvent(tx, {
        preparationId: input.snapshot.preparation.id,
        kind: "COMMERCIAL_CONFLICT",
        fromStatus: "READY_TO_EXECUTE",
        toStatus: input.assessment.status,
        actorUserId: input.operatorUserId,
        sourceClinicId: input.snapshot.source.id,
        destinationClinicId: input.destinationId,
        siteId: input.siteId,
        category: code,
      });
    }
  }
}
