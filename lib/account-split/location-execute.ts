import type { Prisma } from "@prisma/client";

import { planSplitSiteBranding } from "@/lib/account-split/branding-plan";
import { recordAccountSplitEvent } from "@/lib/account-split/events";
import {
  ACCOUNT_SPLIT_COMMERCIAL_CONFLICT_CODES,
  type AccountSplitAssessment,
  type AccountSplitSnapshot,
} from "@/lib/account-split/policy";
import {
  assessLocationToNewAccount,
  confirmationMatchesLocationMove,
  locationMoveConfirmationPhrase,
} from "@/lib/account-split/location-policy";
import { lockAccountSplitShellSlug } from "@/lib/account-split/locks";
import type {
  AccountSplitExecutionHooks,
  AccountSplitExecutionResult,
  CopiedRevision,
} from "@/lib/account-split/execute";
import { createClinicLocationRedirect } from "@/lib/clinics/location-redirect";
import { readSplitDestinationCommercialState } from "@/lib/billing/split-destination-access";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import {
  lockClinicGuideCapacity,
  lockClinicSiteLocationCapacity,
  lockClinicTeamCapacity,
} from "@/lib/entitlements/locks";

/**
 * Structural cutover for LOCATION_TO_NEW_ACCOUNT.
 * The caller already holds sorted account-structure locks and sorted
 * account-split locks, and has rejected a stale revision or a completed retry.
 * This branch does not move a Clinic Site and does not create a redirect for
 * SITE_TO_NEW_ACCOUNT.
 */

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

export type LocationCutoverSteps = {
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

export async function executeLocationToNewAccountCutover(
  tx: Tx,
  input: {
    snapshot: AccountSplitSnapshot;
    operatorUserId: string;
    confirmation: string;
    hooks?: AccountSplitExecutionHooks;
    destinationClinicId: string;
    steps: LocationCutoverSteps;
  }
): Promise<CutoverOutcome> {
  const snapshot = input.snapshot;
  const destinationId = input.destinationClinicId;
  if (snapshot.preparation.operationKind !== "LOCATION_TO_NEW_ACCOUNT") {
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

  const assessment = assessLocationToNewAccount(snapshot);
  const destinationSlug = snapshot.preparation.destinationSiteSlug;
  const moving = assessment.locationMove?.location ?? null;
  if (
    !destinationSlug ||
    !confirmationMatchesLocationMove(destinationSlug, input.confirmation)
  ) {
    throw new ClinicPortalError(
      destinationSlug
        ? `Type the confirmation exactly as ${locationMoveConfirmationPhrase(destinationSlug)}.`
        : "Confirm the destination Clinic Site address before executing this move.",
      "invalid"
    );
  }

  const purchasedBefore = snapshot.source.purchasedAdditionalLocationQuantity;
  const extraBefore = snapshot.source.extraLocationAllowance;
  const destinationLocationCount = await tx.clinicLocation.count({
    where: { clinicId: destinationId },
  });
  const shellPopulated =
    (snapshot.destination.clinic?.siteCount ?? 0) !== 0 ||
    (snapshot.destination.clinic?.locationCount ?? 0) !== 0 ||
    destinationLocationCount !== 0;

  if (assessment.status !== "READY_TO_EXECUTE" || shellPopulated) {
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
      });
    }
    return {
      kind: "refused",
      message: shellPopulated
        ? "The destination shell must not contain a Site or Location."
        : refusalMessage(assessment),
    };
  }

  const sourceSite = assessment.keptSite;
  if (!sourceSite || !moving || !moving.slug) {
    throw new ClinicPortalError(
      "The location to move is no longer eligible.",
      "conflict"
    );
  }
  const liveLocation = await tx.clinicLocation.findFirst({
    where: {
      id: moving.id,
      clinicId: snapshot.source.id,
      clinicSiteId: sourceSite.id,
    },
    select: {
      id: true,
      slug: true,
      servesSiteRoot: true,
      active: true,
      isPrimary: true,
      name: true,
      displayName: true,
    },
  });
  if (
    !liveLocation ||
    !liveLocation.active ||
    liveLocation.servesSiteRoot ||
    liveLocation.slug === null ||
    liveLocation.slug !== moving.slug
  ) {
    throw new ClinicPortalError(
      "The location to move changed. Review the preparation again.",
      "conflict"
    );
  }
  const oldSlug = liveLocation.slug;

  const branding = planSplitSiteBranding({
    sourceClinicId: snapshot.source.id,
    destinationClinicId: destinationId,
    site: sourceSite,
    preparationId: snapshot.preparation.id,
    assets: snapshot.brandingAssets,
  });
  if (!branding.ready || !branding.values) {
    throw new ClinicPortalError(
      "Prepare destination-owned branding from the source Clinic Site before execution.",
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
  await lockAccountSplitShellSlug(tx);

  const sourcePrimary = await tx.clinicSite.findFirst({
    where: { clinicId: snapshot.source.id, isPrimary: true },
    select: { id: true, slug: true },
  });
  if (!sourcePrimary || sourcePrimary.id !== sourceSite.id) {
    throw new ClinicPortalError(
      "The source Clinic Site must remain the primary Site.",
      "conflict"
    );
  }
  await input.steps.assertCompatibilitySlugTargets(tx, {
    sourceClinicId: snapshot.source.id,
    destinationClinicId: destinationId,
    sourceTarget: sourcePrimary.slug,
    destinationTarget: destinationSlug,
  });
  const slugTaken = await tx.clinicSite.findUnique({
    where: { slug: destinationSlug },
    select: { id: true },
  });
  if (slugTaken) {
    throw new ClinicPortalError(
      "That destination Clinic Site address is already in use.",
      "conflict"
    );
  }

  input.steps.assertExclusiveStaffSelections(snapshot);

  await recordAccountSplitEvent(tx, {
    preparationId: snapshot.preparation.id,
    kind: "CUTOVER_STARTED",
    fromStatus: "READY_TO_EXECUTE",
    actorUserId: input.operatorUserId,
    sourceClinicId: snapshot.source.id,
    destinationClinicId: destinationId,
    siteId: sourceSite.id,
    locationId: liveLocation.id,
    category: "cutover_started",
  });

  const copied = await input.steps.copySplitGuides(tx, {
    preparationId: snapshot.preparation.id,
    sourceClinicId: snapshot.source.id,
    destinationClinicId: destinationId,
    movingLocationIds: new Set([liveLocation.id]),
  });
  await input.steps.interrupt(input.hooks, "after_guide_copies");

  const movingPlacements = await input.steps.captureMovingPlacements(tx, {
    sourceClinicId: snapshot.source.id,
    locationIds: [liveLocation.id],
  });
  input.steps.assertPlacementPins(movingPlacements, copied.revisionsBySource);
  if (movingPlacements.length > 0) {
    await tx.practiceGuidePlacement.deleteMany({
      where: {
        id: { in: movingPlacements.map((placement) => placement.id) },
        clinicId: snapshot.source.id,
        locationId: liveLocation.id,
      },
    });
  }
  await tx.downgradeLocationSelection.deleteMany({
    where: { locationId: liveLocation.id },
  });

  if (liveLocation.isPrimary) {
    await tx.clinicLocation.update({
      where: { id: liveLocation.id },
      data: { isPrimary: false },
    });
    const root = await tx.clinicLocation.findFirst({
      where: {
        clinicId: snapshot.source.id,
        clinicSiteId: sourceSite.id,
        servesSiteRoot: true,
        active: true,
      },
      select: { id: true },
    });
    if (!root || root.id === liveLocation.id) {
      throw new ClinicPortalError(
        "The source Clinic Site must keep its active root location.",
        "conflict"
      );
    }
    const promoted = await tx.clinicLocation.updateMany({
      where: {
        id: root.id,
        clinicId: snapshot.source.id,
        clinicSiteId: sourceSite.id,
      },
      data: { isPrimary: true },
    });
    if (promoted.count !== 1) {
      throw new ClinicPortalError(
        "The source root location could not become primary.",
        "conflict"
      );
    }
  }

  const theme = await tx.clinicSite.findFirst({
    where: { id: sourceSite.id, clinicId: snapshot.source.id },
    select: {
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
    },
  });
  if (!theme) {
    throw new ClinicPortalError(
      "The source Clinic Site could not be read.",
      "conflict"
    );
  }
  const existingDestinationSites = await tx.clinicSite.count({
    where: { clinicId: destinationId },
  });
  if (existingDestinationSites !== 0) {
    throw new ClinicPortalError(
      "The destination shell must not contain a Site.",
      "conflict"
    );
  }
  const destinationSite = await tx.clinicSite.create({
    data: {
      clinicId: destinationId,
      name: liveLocation.name,
      slug: destinationSlug,
      displayName: liveLocation.displayName,
      active: true,
      isPrimary: true,
      logoUrl: branding.values.logoUrl,
      darkLogoUrl: branding.values.darkLogoUrl,
      faviconUrl: branding.values.faviconUrl,
      ...theme,
    },
    select: { id: true, slug: true },
  });
  await input.steps.interrupt(input.hooks, "after_destination_site_creation");

  await tx.clinicLocation.update({
    where: { id: liveLocation.id },
    data: {
      clinicId: destinationId,
      clinicSiteId: destinationSite.id,
      slug: null,
      servesSiteRoot: true,
      isPrimary: true,
    },
  });
  await input.steps.interrupt(input.hooks, "after_location_promotion");

  await input.steps.reinsertPlacements(tx, {
    destinationClinicId: destinationId,
    placements: movingPlacements,
    guideIds: copied.guideIds,
    revisionsBySource: copied.revisionsBySource,
  });

  await createClinicLocationRedirect({
    tx,
    preparationId: snapshot.preparation.id,
    sourceClinicSiteId: sourceSite.id,
    fromSlug: oldSlug,
    destinationClinicSiteId: destinationSite.id,
  });
  await input.steps.interrupt(input.hooks, "after_location_redirect");

  const parked = await input.steps.writeCompatibilitySlugs(tx, {
    sourceClinicId: snapshot.source.id,
    destinationClinicId: destinationId,
    sourceTarget: sourcePrimary.slug,
    destinationTarget: destinationSlug,
  });
  await input.steps.mirrorClinicProfile(tx, snapshot.source.id, sourceSite.id);
  await input.steps.mirrorClinicProfile(tx, destinationId, destinationSite.id);
  await input.steps.applyMembershipDecisions(tx, {
    sourceClinicId: snapshot.source.id,
    destinationClinicId: destinationId,
    snapshot,
  });
  await input.steps.interrupt(input.hooks, "after_membership_changes");

  await input.steps.assertSourceStructure(tx, snapshot.source.id);
  await assertLocationMoveResult(tx, {
    sourceClinicId: snapshot.source.id,
    sourceSiteId: sourceSite.id,
    destinationClinicId: destinationId,
    destinationSiteId: destinationSite.id,
    locationId: liveLocation.id,
    oldSlug,
    placementIds: movingPlacements.map((placement) => placement.id),
    destinationGuideIds: new Set(copied.guideIds.values()),
    purchasedAdditionalLocationQuantity: purchasedBefore,
    extraLocationAllowance: extraBefore,
  });
  await assertLocationBillingStillReady(tx, snapshot, destinationId);

  const executedAt = new Date();
  const completed = await tx.clinicAccountSplitPreparation.updateMany({
    where: {
      id: snapshot.preparation.id,
      status: "READY_TO_EXECUTE",
      operationKind: "LOCATION_TO_NEW_ACCOUNT",
    },
    data: {
      status: "COMPLETED",
      executedAt,
      executingOperatorUserId: input.operatorUserId,
      expectedConfirmation: locationMoveConfirmationPhrase(destinationSlug),
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
    siteId: destinationSite.id,
    locationId: liveLocation.id,
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
        siteId: input.assessment.locationMove?.sourceSiteId ?? null,
        locationId: input.assessment.locationMove?.location?.id ?? null,
        category: code,
      });
    }
  }
}

async function assertLocationMoveResult(
  tx: Tx,
  input: {
    sourceClinicId: string;
    sourceSiteId: string;
    destinationClinicId: string;
    destinationSiteId: string;
    locationId: string;
    oldSlug: string;
    placementIds: string[];
    destinationGuideIds: Set<string>;
    purchasedAdditionalLocationQuantity: number | null;
    extraLocationAllowance: number;
  }
): Promise<void> {
  const moved = await tx.clinicLocation.findUnique({
    where: { id: input.locationId },
    select: {
      id: true,
      clinicId: true,
      clinicSiteId: true,
      slug: true,
      servesSiteRoot: true,
      isPrimary: true,
      active: true,
    },
  });
  if (
    !moved ||
    moved.clinicId !== input.destinationClinicId ||
    moved.clinicSiteId !== input.destinationSiteId ||
    moved.slug !== null ||
    moved.servesSiteRoot !== true ||
    moved.isPrimary !== true ||
    moved.active !== true
  ) {
    throw new ClinicPortalError(
      "The location was not promoted onto the destination Clinic Site.",
      "conflict"
    );
  }
  const sourceSites = await tx.clinicSite.findMany({
    where: { clinicId: input.sourceClinicId },
    select: { id: true },
  });
  if (!sourceSites.some((site) => site.id === input.sourceSiteId)) {
    throw new ClinicPortalError(
      "The source Account must keep its Clinic Site.",
      "conflict"
    );
  }
  const sourcePrimaries = await tx.clinicLocation.count({
    where: { clinicSiteId: input.sourceSiteId, isPrimary: true },
  });
  if (sourcePrimaries !== 1) {
    throw new ClinicPortalError(
      "The source Clinic Site must keep exactly one primary location.",
      "conflict"
    );
  }
  const sourceRoot = await tx.clinicLocation.findFirst({
    where: {
      clinicSiteId: input.sourceSiteId,
      servesSiteRoot: true,
      active: true,
    },
    select: { id: true, slug: true },
  });
  if (!sourceRoot || sourceRoot.slug !== null || sourceRoot.id === moved.id) {
    throw new ClinicPortalError(
      "The source Clinic Site must keep its active root location.",
      "conflict"
    );
  }
  const entitlement = await tx.clinicEntitlement.findUnique({
    where: { clinicId: input.sourceClinicId },
    select: {
      purchasedAdditionalLocationQuantity: true,
      extraLocationAllowance: true,
      commercialPlan: true,
    },
  });
  if (
    entitlement?.purchasedAdditionalLocationQuantity !==
      input.purchasedAdditionalLocationQuantity ||
    entitlement.extraLocationAllowance !== input.extraLocationAllowance ||
    entitlement.commercialPlan !== "PRACTICE"
  ) {
    throw new ClinicPortalError(
      "Execution must not change source location capacity or the source plan.",
      "conflict"
    );
  }
  const redirect = await tx.clinicLocationRedirect.findUnique({
    where: {
      sourceClinicSiteId_fromSlug: {
        sourceClinicSiteId: input.sourceSiteId,
        fromSlug: input.oldSlug,
      },
    },
    select: { destinationClinicSiteId: true },
  });
  if (redirect?.destinationClinicSiteId !== input.destinationSiteId) {
    throw new ClinicPortalError(
      "The old location address was not reserved.",
      "conflict"
    );
  }
  const placements = await tx.practiceGuidePlacement.findMany({
    where: { locationId: input.locationId },
    select: {
      id: true,
      clinicId: true,
      practiceGuideId: true,
      publicSlug: true,
    },
  });
  if (placements.length !== input.placementIds.length) {
    throw new ClinicPortalError(
      "Destination placements do not match the moved location.",
      "conflict"
    );
  }
  for (const placement of placements) {
    if (
      !input.placementIds.includes(placement.id) ||
      placement.clinicId !== input.destinationClinicId ||
      !input.destinationGuideIds.has(placement.practiceGuideId)
    ) {
      throw new ClinicPortalError(
        "A destination placement does not use a copied guide.",
        "conflict"
      );
    }
  }
}

async function assertLocationBillingStillReady(
  tx: Tx,
  snapshot: AccountSplitSnapshot,
  destinationClinicId: string
): Promise<void> {
  const entitlement = await readSplitDestinationCommercialState(
    destinationClinicId,
    tx
  );
  const fresh: AccountSplitSnapshot = {
    ...snapshot,
    destination: {
      ...snapshot.destination,
      entitlement,
    },
  };
  const assessment = assessLocationToNewAccount(fresh);
  if (
    assessment.blockers.some((blocker) => blocker.code === "billing_not_ready")
  ) {
    throw new ClinicPortalError(
      "Destination billing is no longer ready.",
      "conflict"
    );
  }
  if (
    assessment.blockers.some(
      (blocker) =>
        blocker.code === "destination_location_quantity_unprojected" ||
        blocker.code === "destination_location_allowance" ||
        blocker.code === "destination_team_count" ||
        blocker.code === "destination_custom_guide_allowance" ||
        blocker.code === "destination_adapted_guide_allowance" ||
        blocker.code === "destination_combined_guide_allowance"
    )
  ) {
    throw new ClinicPortalError(
      "Destination capacity is no longer sufficient.",
      "conflict"
    );
  }
}
