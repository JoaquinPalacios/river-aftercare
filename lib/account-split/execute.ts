import "server-only";

import {
  ClinicMembershipRole,
  GuideRevisionStatus,
  PlatformRole,
  type Prisma,
} from "@prisma/client";

import { deleteDatabaseSessionsForUser } from "@/lib/auth/session";
import {
  lockAccountSplit,
  lockAccountSplitShellSlug,
} from "@/lib/account-split/locks";
import {
  assessAccountSplit,
  assessExecutedPracticeDowngrade,
  classifyDestinationBilling,
  confirmationMatchesSplitSite,
  splitConfirmationPhrase,
  type AccountSplitAssessment,
  type AccountSplitSnapshot,
} from "@/lib/account-split/policy";
import {
  allocateSplitShellSlug,
  generateSplitShellSlug,
  isSplitShellCompatibilitySlug,
} from "@/lib/account-split/shell-slug";
import { loadAccountSplitSnapshot } from "@/lib/account-split/snapshot";
import { readSplitDestinationCommercialState } from "@/lib/billing/split-destination-access";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { countTeamUsage } from "@/lib/entitlements/team-usage";
import {
  isAdaptedTemplateGuide,
  isOriginalCustomGuide,
} from "@/lib/entitlements/guide-usage";
import {
  lockClinicAccountStructures,
  lockClinicTeamCapacity,
} from "@/lib/entitlements/locks";
import { getPrisma } from "@/lib/prisma";

/**
 * Structural cutover for one prepared Site split.
 *
 * Lock order inside the single transaction:
 * 1. `clinic-account-structure` for source and destination, sorted by clinic id
 * 2. `clinic-account-split:{sourceClinicId}`
 * 3. Reload, then recompute readiness
 * 4. `clinic-account-split-shell-slug` only when compatibility slugs must be parked
 * 5. `clinic-team-capacity` for both accounts, sorted, only when memberships move
 * 6. `clinic-access:{userId}` for each moved user, sorted by user id
 *
 * Structure locks are held before the reload, so concurrent account mutations
 * wait. Narrower locks are taken after that reload and immediately before the
 * writes they cover. They still follow the structure lock, so the order is
 * not inverted. A wrong confirmation throws before any write. A preparation
 * that is no longer ready commits only the status regression from the
 * preparation state machine, then the caller rejects. Structural writes roll
 * back together with COMPLETED.
 *
 * No Stripe, Resend, R2, or other network call runs here.
 */

export type AccountSplitExecutionInterrupt =
  | "after_guide_copies"
  | "after_placement_deletion"
  | "after_site_move"
  | "after_placement_reinsertion"
  | "after_membership_changes";

export type AccountSplitExecutionHooks = {
  /** Test seam. Runs after the structure and preparation locks, before writes. */
  afterLocks?: () => Promise<void> | void;
  /** Test seam. Throws inside the transaction so PostgreSQL rolls it back. */
  interruptAfter?: AccountSplitExecutionInterrupt;
};

export class AccountSplitExecutionInterrupted extends Error {
  constructor(readonly point: AccountSplitExecutionInterrupt) {
    super(`Account split execution interrupted after ${point}.`);
    this.name = "AccountSplitExecutionInterrupted";
  }
}

export type AccountSplitExecutionResult = {
  preparationId: string;
  alreadyCompleted: boolean;
  executedAt: Date;
  executedByOperatorUserId: string | null;
  executedByName: string | null;
  confirmation: string | null;
  source: { id: string; name: string; slug: string };
  destination: { id: string; name: string; slug: string };
  movedSite: {
    id: string;
    slug: string;
    displayName: string;
  };
  sourcePrimarySite: {
    id: string;
    slug: string;
    displayName: string;
  };
  guideCopyCount: number;
  revisionCopyCount: number;
  staffMovedCount: number;
  deactivatedSiteCount: number;
  practiceDowngradeReady: boolean;
  /** True only for the transaction that parked a compatibility slug. */
  compatibilitySlugParked: boolean | null;
};

type Tx = Prisma.TransactionClient;

type CapturedPlacement = {
  id: string;
  locationId: string;
  publicSlug: string;
  isEnabled: boolean;
  publishedPracticeGuideRevisionId: string | null;
  practiceGuideId: string;
  createdAt: Date;
};

type CopiedRevision = {
  sourceId: string;
  destinationId: string;
  destinationGuideId: string;
  status: GuideRevisionStatus;
  version: number;
};

export async function executeClinicAccountSplit(input: {
  preparationId: string;
  confirmation: string;
  operatorUserId: string;
  hooks?: AccountSplitExecutionHooks;
}): Promise<AccountSplitExecutionResult> {
  await assertPlatformOperator(input.operatorUserId);

  const head = await getPrisma().clinicAccountSplitPreparation.findUnique({
    where: { id: input.preparationId },
    select: {
      id: true,
      sourceClinicId: true,
      destinationClinicId: true,
      status: true,
    },
  });
  if (!head) {
    throw new ClinicPortalError("That preparation was not found.", "not_found");
  }
  if (!head.destinationClinicId) {
    throw new ClinicPortalError(
      "Create the destination shell Account before executing this split.",
      "conflict"
    );
  }

  const outcome = await getPrisma().$transaction(
    async (tx) => {
      await lockClinicAccountStructures(tx, [
        head.sourceClinicId,
        head.destinationClinicId!,
      ]);
      await lockAccountSplit(tx, head.sourceClinicId);
      if (input.hooks?.afterLocks) {
        await input.hooks.afterLocks();
      }

      const snapshot = await loadAccountSplitSnapshot(head.id, tx);
      if (!snapshot) {
        throw new ClinicPortalError(
          "That preparation was not found.",
          "not_found"
        );
      }
      if (snapshot.preparation.status === "COMPLETED") {
        const summary = await readExecutionSummary(tx, snapshot.preparation.id);
        return {
          kind: "completed" as const,
          result: {
            ...summary,
            alreadyCompleted: true,
            compatibilitySlugParked: null,
          },
        };
      }
      if (snapshot.preparation.status === "CANCELLED") {
        throw new ClinicPortalError(
          "This preparation is cancelled.",
          "conflict"
        );
      }
      if (snapshot.preparation.status !== "READY_TO_EXECUTE") {
        throw new ClinicPortalError(
          "This preparation is not ready to execute.",
          "conflict"
        );
      }

      const assessment = assessAccountSplit(snapshot);
      const splitSite = assessment.splitSite;
      if (
        !splitSite ||
        !confirmationMatchesSplitSite(splitSite.slug, input.confirmation)
      ) {
        throw new ClinicPortalError(
          splitSite
            ? `Type the confirmation exactly as ${splitConfirmationPhrase(splitSite.slug)}.`
            : "Type the confirmation for the site this preparation splits.",
          "invalid"
        );
      }

      const destinationId = snapshot.preparation.destinationClinicId;
      if (
        !destinationId ||
        destinationId !== head.destinationClinicId ||
        snapshot.destination.clinic?.id !== destinationId
      ) {
        throw new ClinicPortalError(
          "The destination shell could not be found.",
          "conflict"
        );
      }

      const destinationLocationCount = await tx.clinicLocation.count({
        where: { clinicId: destinationId },
      });
      const shellPopulated =
        snapshot.destination.clinic.siteCount !== 0 ||
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
        }
        return {
          kind: "refused" as const,
          message: shellPopulated
            ? "The destination shell must not contain a Site or Location."
            : refusalMessage(assessment),
        };
      }

      assertExclusiveStaffSelections(snapshot);
      const sourceTarget = assessment.primaryPromotion.futurePrimarySite;
      if (!sourceTarget || sourceTarget.id === splitSite.id) {
        throw new ClinicPortalError(
          "This split does not have one source primary Site.",
          "conflict"
        );
      }
      await assertCompatibilitySlugTargets(tx, {
        sourceClinicId: snapshot.source.id,
        destinationClinicId: destinationId,
        sourceTarget: sourceTarget.slug,
        destinationTarget: splitSite.slug,
      });

      const movingLocationIds = new Set(
        snapshot.locations
          .filter((location) => location.clinicSiteId === splitSite.id)
          .map((location) => location.id)
      );
      const copied = await copySplitGuides(tx, {
        preparationId: snapshot.preparation.id,
        sourceClinicId: snapshot.source.id,
        destinationClinicId: destinationId,
        movingLocationIds,
      });
      await interrupt(input.hooks, "after_guide_copies");

      const movingPlacements = await captureMovingPlacements(tx, {
        sourceClinicId: snapshot.source.id,
        locationIds: [...movingLocationIds],
      });
      assertPlacementPins(movingPlacements, copied.revisionsBySource);
      await tx.practiceGuidePlacement.deleteMany({
        where: {
          id: { in: movingPlacements.map((placement) => placement.id) },
          clinicId: snapshot.source.id,
        },
      });
      await interrupt(input.hooks, "after_placement_deletion");

      await promoteSourcePrimary(tx, {
        sourceClinicId: snapshot.source.id,
        currentPrimaryId:
          assessment.primaryPromotion.currentPrimarySite?.id ?? null,
        futurePrimaryId: sourceTarget.id,
      });
      if (assessment.sourcePreview.deactivatedSiteIds.length > 0) {
        await tx.clinicSite.updateMany({
          where: {
            id: { in: assessment.sourcePreview.deactivatedSiteIds },
            clinicId: snapshot.source.id,
          },
          data: { active: false },
        });
      }

      const locationsBefore = await tx.clinicLocation.findMany({
        where: { clinicSiteId: splitSite.id, clinicId: snapshot.source.id },
        select: { id: true, slug: true, servesSiteRoot: true },
      });
      await tx.clinicSite.update({
        where: { id: splitSite.id },
        data: { clinicId: destinationId, isPrimary: true },
      });
      await assertMovedLocations(tx, {
        siteId: splitSite.id,
        destinationClinicId: destinationId,
        before: locationsBefore,
      });
      await interrupt(input.hooks, "after_site_move");

      await reinsertPlacements(tx, {
        destinationClinicId: destinationId,
        placements: movingPlacements,
        guideIds: copied.guideIds,
        revisionsBySource: copied.revisionsBySource,
      });
      await interrupt(input.hooks, "after_placement_reinsertion");

      const parked = await writeCompatibilitySlugs(tx, {
        sourceClinicId: snapshot.source.id,
        destinationClinicId: destinationId,
        sourceTarget: sourceTarget.slug,
        destinationTarget: splitSite.slug,
      });
      await mirrorClinicProfile(tx, snapshot.source.id, sourceTarget.id);
      await mirrorClinicProfile(tx, destinationId, splitSite.id);

      const movedUserIds = await applyMembershipDecisions(tx, {
        sourceClinicId: snapshot.source.id,
        destinationClinicId: destinationId,
        snapshot,
      });
      await interrupt(input.hooks, "after_membership_changes");

      await assertSourceStructure(tx, snapshot.source.id);
      await assertDestinationStructure(tx, {
        destinationClinicId: destinationId,
        movedSiteId: splitSite.id,
        destinationGuideIds: new Set(copied.guideIds.values()),
        placementIds: movingPlacements.map((placement) => placement.id),
      });
      await assertEntitlementStillReady(tx, {
        destinationClinicId: destinationId,
        plan: snapshot.preparation.destinationPlan,
        interval: snapshot.preparation.destinationBillingInterval,
      });
      const sourcePlan = await tx.clinicEntitlement.findUnique({
        where: { clinicId: snapshot.source.id },
        select: { commercialPlan: true },
      });
      if (sourcePlan?.commercialPlan !== snapshot.source.commercialPlan) {
        throw new ClinicPortalError(
          "Execution must not change the source commercial plan.",
          "conflict"
        );
      }

      const practiceDowngradeReady = await readPracticeDowngradeReady(tx, {
        sourceClinicId: snapshot.source.id,
        preparationId: snapshot.preparation.id,
      });
      const executedAt = new Date();
      const completed = await tx.clinicAccountSplitPreparation.updateMany({
        where: {
          id: snapshot.preparation.id,
          status: "READY_TO_EXECUTE",
        },
        data: {
          status: "COMPLETED",
          executedAt,
          executingOperatorUserId: input.operatorUserId,
          expectedConfirmation: splitConfirmationPhrase(splitSite.slug),
        },
      });
      if (completed.count !== 1) {
        throw new ClinicPortalError(
          "This preparation could not be completed.",
          "conflict"
        );
      }

      const summary = await readExecutionSummary(tx, snapshot.preparation.id);
      return {
        kind: "completed" as const,
        result: {
          ...summary,
          alreadyCompleted: false,
          compatibilitySlugParked: parked,
          practiceDowngradeReady,
        },
      };
    },
    { maxWait: 15_000, timeout: 20_000 }
  );

  if (outcome.kind === "refused") {
    throw new ClinicPortalError(outcome.message, "conflict");
  }
  return outcome.result;
}

export async function loadAccountSplitExecutionSummary(
  preparationId: string
): Promise<AccountSplitExecutionResult | null> {
  const status = await getPrisma().clinicAccountSplitPreparation.findUnique({
    where: { id: preparationId },
    select: { status: true },
  });
  if (status?.status !== "COMPLETED") {
    return null;
  }
  const summary = await readExecutionSummary(getPrisma(), preparationId);
  return {
    ...summary,
    alreadyCompleted: true,
    compatibilitySlugParked: null,
  };
}

async function assertPlatformOperator(userId: string): Promise<void> {
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: { platformRole: true },
  });
  if (!user || user.platformRole !== PlatformRole.OPERATOR) {
    throw new ClinicPortalError(
      "Only a platform operator can execute an account split.",
      "forbidden"
    );
  }
}

function refusalMessage(assessment: AccountSplitAssessment): string {
  if (assessment.blockers.length === 0) {
    return "This split is no longer ready to execute.";
  }
  return assessment.blockers.map((blocker) => blocker.message).join(" ");
}

function assertExclusiveStaffSelections(snapshot: AccountSplitSnapshot): void {
  const activeMembers = snapshot.memberships.filter(
    (membership) => membership.active && membership.platformRole !== "OPERATOR"
  );
  const byUser = new Map(
    snapshot.selections.map((selection) => [selection.userId, selection])
  );
  for (const membership of activeMembers) {
    const selection = byUser.get(membership.userId);
    const sourceOnly =
      selection?.keepOnSource === true && !selection.grantOnDestination;
    const destinationOnly =
      selection?.grantOnDestination === true && !selection.keepOnSource;
    if (!sourceOnly && !destinationOnly) {
      throw new ClinicPortalError(
        "Each person must be source only or destination only.",
        "conflict"
      );
    }
  }
}

async function interrupt(
  hooks: AccountSplitExecutionHooks | undefined,
  point: AccountSplitExecutionInterrupt
): Promise<void> {
  if (hooks?.interruptAfter === point) {
    throw new AccountSplitExecutionInterrupted(point);
  }
}

async function copySplitGuides(
  tx: Tx,
  input: {
    preparationId: string;
    sourceClinicId: string;
    destinationClinicId: string;
    movingLocationIds: Set<string>;
  }
): Promise<{
  guideIds: Map<string, string>;
  revisionsBySource: Map<string, CopiedRevision>;
}> {
  const placements = await tx.practiceGuidePlacement.findMany({
    where: {
      clinicId: input.sourceClinicId,
      locationId: { in: [...input.movingLocationIds] },
    },
    select: { practiceGuideId: true },
  });
  const sourceGuideIds = [
    ...new Set(placements.map((row) => row.practiceGuideId)),
  ];
  const guides =
    sourceGuideIds.length === 0
      ? []
      : await tx.practiceGuide.findMany({
          where: {
            id: { in: sourceGuideIds },
            clinicId: input.sourceClinicId,
          },
          include: {
            overrides: true,
            additions: true,
            contentRevisions: {
              orderBy: { version: "asc" },
              include: { sections: { orderBy: { sortOrder: "asc" } } },
            },
          },
        });
  if (guides.length !== sourceGuideIds.length) {
    throw new ClinicPortalError(
      "A guide on the moving site could not be copied.",
      "conflict"
    );
  }

  const guideIds = new Map<string, string>();
  const revisionsBySource = new Map<string, CopiedRevision>();
  for (const guide of guides) {
    const copy = await tx.practiceGuide.create({
      data: {
        clinicId: input.destinationClinicId,
        title: guide.title,
        publicSlug: guide.publicSlug,
        status: guide.status,
        isEnabled: guide.isEnabled,
        publishedAt: guide.publishedAt,
        sortOrder: guide.sortOrder,
        guideTemplateId: guide.guideTemplateId,
        pinnedRevisionId: guide.pinnedRevisionId,
        sourceGuideTemplateId: guide.sourceGuideTemplateId,
        adaptedAt: guide.adaptedAt,
        copiedFromPracticeGuideId: null,
        downgradeRetainedAt: null,
        downgradeRetentionUntil: null,
      },
      select: { id: true },
    });
    guideIds.set(guide.id, copy.id);

    const revisionPairs: CopiedRevision[] = [];
    for (const revision of guide.contentRevisions) {
      const include =
        revision.version === 0 ||
        revision.status === GuideRevisionStatus.PUBLISHED;
      if (!include) {
        continue;
      }
      const copiedRevision = await tx.practiceGuideRevision.create({
        data: {
          practiceGuideId: copy.id,
          version: revision.version,
          status: revision.status,
          title: revision.title,
          introduction: revision.introduction,
          publishedAt: revision.publishedAt,
          createdByUserId: revision.createdByUserId,
          reviewAttestedAt: revision.reviewAttestedAt,
          reviewAttestedByUserId: revision.reviewAttestedByUserId,
          createdAt: revision.createdAt,
          sections: {
            create: revision.sections.map((section) => ({
              key: section.key,
              kind: section.kind,
              title: section.title,
              body: section.body,
              periodLabel: section.periodLabel,
              startDay: section.startDay,
              endDay: section.endDay,
              sortOrder: section.sortOrder,
              provenance: section.provenance,
            })),
          },
        },
        select: { id: true },
      });
      const pair: CopiedRevision = {
        sourceId: revision.id,
        destinationId: copiedRevision.id,
        destinationGuideId: copy.id,
        status: revision.status,
        version: revision.version,
      };
      revisionPairs.push(pair);
      revisionsBySource.set(revision.id, pair);
    }

    if (guide.overrides.length > 0) {
      await tx.practiceGuideOverride.createMany({
        data: guide.overrides.map((override) => ({
          practiceGuideId: copy.id,
          sectionKey: override.sectionKey,
          title: override.title,
          body: override.body,
        })),
      });
    }
    if (guide.additions.length > 0) {
      await tx.practiceGuideAddition.createMany({
        data: guide.additions.map((addition) => ({
          practiceGuideId: copy.id,
          key: addition.key,
          kind: addition.kind,
          title: addition.title,
          body: addition.body,
          periodLabel: addition.periodLabel,
          startDay: addition.startDay,
          endDay: addition.endDay,
          sortOrder: addition.sortOrder,
          insertAfterSectionKey: addition.insertAfterSectionKey,
        })),
      });
    }

    const guideMap = await tx.clinicAccountSplitGuideMap.create({
      data: {
        preparationId: input.preparationId,
        sourcePracticeGuideId: guide.id,
        destinationPracticeGuideId: copy.id,
      },
      select: { id: true },
    });
    if (revisionPairs.length > 0) {
      await tx.clinicAccountSplitRevisionMap.createMany({
        data: revisionPairs.map((pair) => ({
          preparationId: input.preparationId,
          guideMapId: guideMap.id,
          sourceRevisionId: pair.sourceId,
          destinationRevisionId: pair.destinationId,
        })),
      });
    }
  }

  return { guideIds, revisionsBySource };
}

async function captureMovingPlacements(
  tx: Tx,
  input: { sourceClinicId: string; locationIds: string[] }
): Promise<CapturedPlacement[]> {
  if (input.locationIds.length === 0) {
    return [];
  }
  const rows = await tx.practiceGuidePlacement.findMany({
    where: {
      clinicId: input.sourceClinicId,
      locationId: { in: input.locationIds },
    },
    select: {
      id: true,
      locationId: true,
      publicSlug: true,
      isEnabled: true,
      publishedPracticeGuideRevisionId: true,
      practiceGuideId: true,
      createdAt: true,
    },
  });
  return rows;
}

function assertPlacementPins(
  placements: CapturedPlacement[],
  revisionsBySource: Map<string, CopiedRevision>
): void {
  for (const placement of placements) {
    if (!placement.publishedPracticeGuideRevisionId) {
      continue;
    }
    const mapped = revisionsBySource.get(
      placement.publishedPracticeGuideRevisionId
    );
    if (!mapped) {
      throw new ClinicPortalError(
        "A placement revision pin has no destination revision.",
        "conflict"
      );
    }
    if (
      mapped.status !== GuideRevisionStatus.PUBLISHED ||
      mapped.version <= 0
    ) {
      throw new ClinicPortalError(
        "A placement must pin a published revision after version 0.",
        "conflict"
      );
    }
  }
}

async function promoteSourcePrimary(
  tx: Tx,
  input: {
    sourceClinicId: string;
    currentPrimaryId: string | null;
    futurePrimaryId: string;
  }
): Promise<void> {
  if (input.currentPrimaryId === input.futurePrimaryId) {
    return;
  }
  if (input.currentPrimaryId) {
    await tx.clinicSite.updateMany({
      where: {
        id: input.currentPrimaryId,
        clinicId: input.sourceClinicId,
        isPrimary: true,
      },
      data: { isPrimary: false },
    });
  }
  const promoted = await tx.clinicSite.updateMany({
    where: {
      id: input.futurePrimaryId,
      clinicId: input.sourceClinicId,
    },
    data: { isPrimary: true },
  });
  if (promoted.count !== 1) {
    throw new ClinicPortalError(
      "The source primary Site could not be updated.",
      "conflict"
    );
  }
}

async function assertMovedLocations(
  tx: Tx,
  input: {
    siteId: string;
    destinationClinicId: string;
    before: Array<{ id: string; slug: string | null; servesSiteRoot: boolean }>;
  }
): Promise<void> {
  const after = await tx.clinicLocation.findMany({
    where: { clinicSiteId: input.siteId },
    select: { id: true, slug: true, servesSiteRoot: true, clinicId: true },
  });
  if (after.length !== input.before.length) {
    throw new ClinicPortalError(
      "Moving the site did not keep every location.",
      "conflict"
    );
  }
  const beforeById = new Map(
    input.before.map((location) => [location.id, location])
  );
  for (const location of after) {
    const previous = beforeById.get(location.id);
    if (
      !previous ||
      location.clinicId !== input.destinationClinicId ||
      location.slug !== previous.slug ||
      location.servesSiteRoot !== previous.servesSiteRoot
    ) {
      throw new ClinicPortalError(
        "A moved location did not stay attached to the destination Account.",
        "conflict"
      );
    }
  }
}

async function reinsertPlacements(
  tx: Tx,
  input: {
    destinationClinicId: string;
    placements: CapturedPlacement[];
    guideIds: Map<string, string>;
    revisionsBySource: Map<string, CopiedRevision>;
  }
): Promise<void> {
  if (input.placements.length === 0) {
    return;
  }
  const data = input.placements.map((placement) => {
    const destinationGuideId = input.guideIds.get(placement.practiceGuideId);
    if (!destinationGuideId) {
      throw new ClinicPortalError(
        "A moving placement has no destination guide copy.",
        "conflict"
      );
    }
    let publishedPracticeGuideRevisionId: string | null = null;
    if (placement.publishedPracticeGuideRevisionId) {
      const mapped = input.revisionsBySource.get(
        placement.publishedPracticeGuideRevisionId
      );
      if (!mapped || mapped.destinationGuideId !== destinationGuideId) {
        throw new ClinicPortalError(
          "A placement pin does not belong to the destination guide copy.",
          "conflict"
        );
      }
      publishedPracticeGuideRevisionId = mapped.destinationId;
    }
    return {
      id: placement.id,
      locationId: placement.locationId,
      clinicId: input.destinationClinicId,
      practiceGuideId: destinationGuideId,
      publishedPracticeGuideRevisionId,
      publicSlug: placement.publicSlug,
      isEnabled: placement.isEnabled,
      createdAt: placement.createdAt,
    };
  });
  await tx.practiceGuidePlacement.createMany({ data });
  const restored = await tx.practiceGuidePlacement.findMany({
    where: { id: { in: data.map((row) => row.id) } },
    select: {
      id: true,
      clinicId: true,
      practiceGuide: { select: { clinicId: true } },
      location: { select: { clinicId: true } },
    },
  });
  if (restored.length !== data.length) {
    throw new ClinicPortalError(
      "A moving placement was not restored.",
      "conflict"
    );
  }
  for (const placement of restored) {
    if (
      placement.clinicId !== input.destinationClinicId ||
      placement.practiceGuide.clinicId !== input.destinationClinicId ||
      placement.location.clinicId !== input.destinationClinicId
    ) {
      throw new ClinicPortalError(
        "A destination placement points outside the destination Account.",
        "conflict"
      );
    }
  }
}

async function assertCompatibilitySlugTargets(
  tx: Tx,
  input: {
    sourceClinicId: string;
    destinationClinicId: string;
    sourceTarget: string;
    destinationTarget: string;
  }
): Promise<void> {
  const [source, destination] = await loadSlugRows(tx, input);
  await assertSlugHolder(
    tx,
    input.destinationTarget,
    allowedSlugHolders({
      target: input.destinationTarget,
      writerId: destination.id,
      writerTarget: input.destinationTarget,
      other: source,
      otherTarget: input.sourceTarget,
    })
  );
  await assertSlugHolder(
    tx,
    input.sourceTarget,
    allowedSlugHolders({
      target: input.sourceTarget,
      writerId: source.id,
      writerTarget: input.sourceTarget,
      other: destination,
      otherTarget: input.destinationTarget,
    })
  );
}

function allowedSlugHolders(input: {
  target: string;
  writerId: string;
  writerTarget: string;
  other: { id: string; slug: string };
  otherTarget: string;
}): Set<string> {
  const allowed = new Set<string>();
  if (input.writerTarget === input.target) {
    allowed.add(input.writerId);
  }
  if (input.other.slug === input.target && input.otherTarget !== input.target) {
    allowed.add(input.other.id);
  }
  return allowed;
}

async function assertSlugHolder(
  tx: Tx,
  slug: string,
  allowed: Set<string>
): Promise<void> {
  const holder = await tx.clinic.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (holder && !allowed.has(holder.id)) {
    throw new ClinicPortalError(
      "That compatibility address is already used by another account.",
      "conflict"
    );
  }
}

async function writeCompatibilitySlugs(
  tx: Tx,
  input: {
    sourceClinicId: string;
    destinationClinicId: string;
    sourceTarget: string;
    destinationTarget: string;
  }
): Promise<boolean> {
  const [source, destination] = await loadSlugRows(tx, input);
  if (
    source.slug === input.sourceTarget &&
    destination.slug === input.destinationTarget
  ) {
    return false;
  }

  const sourceHoldsDestinationTarget =
    source.slug === input.destinationTarget &&
    source.slug !== input.sourceTarget;
  const destinationHoldsSourceTarget =
    destination.slug === input.sourceTarget &&
    destination.slug !== input.destinationTarget;

  if (sourceHoldsDestinationTarget && destinationHoldsSourceTarget) {
    await lockAccountSplitShellSlug(tx);
    const parked = await allocateSplitShellSlug(
      tx,
      Array.from({ length: 8 }, () => generateSplitShellSlug())
    );
    if (!isSplitShellCompatibilitySlug(parked)) {
      throw new ClinicPortalError(
        "Could not reserve a destination account slug.",
        "conflict"
      );
    }
    await tx.clinic.update({
      where: { id: source.id },
      data: { slug: parked },
    });
    await tx.clinic.update({
      where: { id: destination.id },
      data: { slug: input.destinationTarget },
    });
    await tx.clinic.update({
      where: { id: source.id },
      data: { slug: input.sourceTarget },
    });
    return true;
  }

  if (sourceHoldsDestinationTarget) {
    await tx.clinic.update({
      where: { id: source.id },
      data: { slug: input.sourceTarget },
    });
    await tx.clinic.update({
      where: { id: destination.id },
      data: { slug: input.destinationTarget },
    });
    return false;
  }

  if (destinationHoldsSourceTarget) {
    await tx.clinic.update({
      where: { id: destination.id },
      data: { slug: input.destinationTarget },
    });
    await tx.clinic.update({
      where: { id: source.id },
      data: { slug: input.sourceTarget },
    });
    return false;
  }

  if (destination.slug !== input.destinationTarget) {
    await tx.clinic.update({
      where: { id: destination.id },
      data: { slug: input.destinationTarget },
    });
  }
  if (source.slug !== input.sourceTarget) {
    await tx.clinic.update({
      where: { id: source.id },
      data: { slug: input.sourceTarget },
    });
  }
  return false;
}

async function loadSlugRows(
  tx: Tx,
  input: { sourceClinicId: string; destinationClinicId: string }
): Promise<[{ id: string; slug: string }, { id: string; slug: string }]> {
  const source = await tx.clinic.findUnique({
    where: { id: input.sourceClinicId },
    select: { id: true, slug: true },
  });
  const destination = await tx.clinic.findUnique({
    where: { id: input.destinationClinicId },
    select: { id: true, slug: true },
  });
  if (!source || !destination) {
    throw new ClinicPortalError(
      "The source or destination Account could not be found.",
      "not_found"
    );
  }
  return [source, destination];
}

async function mirrorClinicProfile(
  tx: Tx,
  clinicId: string,
  siteId: string
): Promise<void> {
  const site = await tx.clinicSite.findFirst({
    where: { id: siteId, clinicId, isPrimary: true },
    select: {
      id: true,
      clinicId: true,
      displayName: true,
      logoUrl: true,
      darkLogoUrl: true,
      faviconUrl: true,
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
      locations: {
        where: { servesSiteRoot: true },
        select: {
          id: true,
          clinicId: true,
          phone: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          region: true,
          postalCode: true,
          country: true,
          contactUrl: true,
          contactEmail: true,
          bookingUrl: true,
          emergencyInstructions: true,
        },
      },
    },
  });
  const location = site?.locations.length === 1 ? site.locations[0] : null;
  if (
    !site ||
    site.clinicId !== clinicId ||
    !location ||
    location.clinicId !== clinicId
  ) {
    throw new ClinicPortalError(
      "The primary site profile could not be mirrored.",
      "conflict"
    );
  }
  await tx.clinicProfile.update({
    where: { clinicId },
    data: {
      displayName: site.displayName,
      logoUrl: site.logoUrl,
      darkLogoUrl: site.darkLogoUrl,
      faviconUrl: site.faviconUrl,
      primaryColor: site.primaryColor,
      accentColor: site.accentColor,
      darkPrimaryColor: site.darkPrimaryColor,
      darkAccentColor: site.darkAccentColor,
      useCustomDarkBranding: site.useCustomDarkBranding,
      neutralColor: site.neutralColor,
      radiusPreset: site.radiusPreset,
      typeface: site.typeface,
      instructionTerminology: site.instructionTerminology,
      themeMode: site.themeMode,
      allowPatientThemeToggle: site.allowPatientThemeToggle,
      showCareGuideAttribution: site.showCareGuideAttribution,
      phone: location.phone,
      addressLine1: location.addressLine1,
      addressLine2: location.addressLine2,
      city: location.city,
      region: location.region,
      postalCode: location.postalCode,
      country: location.country,
      contactUrl: location.contactUrl,
      contactEmail: location.contactEmail,
      bookingUrl: location.bookingUrl,
      emergencyInstructions: location.emergencyInstructions,
    },
  });
}

async function applyMembershipDecisions(
  tx: Tx,
  input: {
    sourceClinicId: string;
    destinationClinicId: string;
    snapshot: AccountSplitSnapshot;
  }
): Promise<string[]> {
  const selectionByUser = new Map(
    input.snapshot.selections.map((selection) => [selection.userId, selection])
  );
  const movers = input.snapshot.memberships
    .filter((membership) => {
      if (!membership.active || membership.platformRole === "OPERATOR") {
        return false;
      }
      const selection = selectionByUser.get(membership.userId);
      return (
        selection?.grantOnDestination === true &&
        selection.keepOnSource === false
      );
    })
    .sort((left, right) => left.userId.localeCompare(right.userId));

  if (movers.length > 0) {
    const clinicIds = [input.sourceClinicId, input.destinationClinicId].sort();
    for (const clinicId of clinicIds) {
      await lockClinicTeamCapacity(tx, clinicId);
    }
    for (const membership of movers) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clinic-access:${membership.userId}`}))`;
    }
  }

  for (const membership of movers) {
    const selection = selectionByUser.get(membership.userId);
    if (!selection) {
      throw new ClinicPortalError(
        "A destination staff decision is missing.",
        "conflict"
      );
    }
    const removed = await tx.clinicMembership.deleteMany({
      where: {
        clinicId: input.sourceClinicId,
        userId: membership.userId,
        active: true,
      },
    });
    if (removed.count !== 1) {
      throw new ClinicPortalError(
        "A source membership could not be removed.",
        "conflict"
      );
    }
    const existing = await tx.clinicMembership.findUnique({
      where: {
        clinicId_userId: {
          clinicId: input.destinationClinicId,
          userId: membership.userId,
        },
      },
      select: { id: true },
    });
    if (existing) {
      await tx.clinicMembership.update({
        where: { id: existing.id },
        data: { active: true, role: selection.destinationRole },
      });
    } else {
      await tx.clinicMembership.create({
        data: {
          clinicId: input.destinationClinicId,
          userId: membership.userId,
          role: selection.destinationRole,
          active: true,
        },
      });
    }
    await deleteDatabaseSessionsForUser(membership.userId, tx);
  }

  const destinationAdmins = await tx.clinicMembership.count({
    where: {
      clinicId: input.destinationClinicId,
      active: true,
      role: ClinicMembershipRole.ADMIN,
      user: { platformRole: { not: PlatformRole.OPERATOR } },
    },
  });
  if (destinationAdmins < 1) {
    throw new ClinicPortalError(
      "The destination Account must keep an active administrator.",
      "conflict"
    );
  }

  const dual = await tx.$queryRaw<Array<{ userId: string }>>`
    SELECT source_membership."userId"
    FROM "ClinicMembership" AS source_membership
    INNER JOIN "ClinicMembership" AS destination_membership
      ON destination_membership."userId" = source_membership."userId"
    WHERE source_membership."clinicId" = ${input.sourceClinicId}
      AND destination_membership."clinicId" = ${input.destinationClinicId}
      AND source_membership."active" = true
      AND destination_membership."active" = true
  `;
  if (dual.length > 0) {
    throw new ClinicPortalError(
      "A person cannot have an active membership on both Accounts.",
      "conflict"
    );
  }
  return movers.map((membership) => membership.userId);
}

async function assertSourceStructure(
  tx: Tx,
  sourceClinicId: string
): Promise<void> {
  const sites = await tx.clinicSite.findMany({
    where: { clinicId: sourceClinicId },
    select: {
      id: true,
      active: true,
      isPrimary: true,
      locations: {
        select: {
          id: true,
          clinicId: true,
          active: true,
          servesSiteRoot: true,
        },
      },
    },
  });
  const activeSites = sites.filter((site) => site.active);
  if (activeSites.length < 1) {
    throw new ClinicPortalError(
      "The source Account must keep an active Site.",
      "conflict"
    );
  }
  if (sites.filter((site) => site.isPrimary).length !== 1) {
    throw new ClinicPortalError(
      "The source Account must have exactly one primary Site.",
      "conflict"
    );
  }
  for (const site of activeSites) {
    const roots = site.locations.filter(
      (location) => location.servesSiteRoot && location.active
    );
    if (roots.length !== 1) {
      throw new ClinicPortalError(
        "Each active source Site needs one active root location.",
        "conflict"
      );
    }
  }
  for (const site of sites) {
    if (
      site.locations.some((location) => location.clinicId !== sourceClinicId)
    ) {
      throw new ClinicPortalError(
        "A source location belongs to another Account.",
        "conflict"
      );
    }
  }
  await assertPlacementOwnership(tx, sourceClinicId);
}

async function assertDestinationStructure(
  tx: Tx,
  input: {
    destinationClinicId: string;
    movedSiteId: string;
    destinationGuideIds: Set<string>;
    placementIds: string[];
  }
): Promise<void> {
  const sites = await tx.clinicSite.findMany({
    where: { clinicId: input.destinationClinicId },
    select: {
      id: true,
      active: true,
      isPrimary: true,
      locations: {
        select: {
          id: true,
          clinicId: true,
          active: true,
          servesSiteRoot: true,
        },
      },
    },
  });
  if (sites.length !== 1 || sites[0]?.id !== input.movedSiteId) {
    throw new ClinicPortalError(
      "The destination Account must contain the moved Site only.",
      "conflict"
    );
  }
  const site = sites[0];
  if (!site.active || !site.isPrimary) {
    throw new ClinicPortalError(
      "The moved Site must be the active primary Site.",
      "conflict"
    );
  }
  if (
    site.locations.some(
      (location) => location.clinicId !== input.destinationClinicId
    )
  ) {
    throw new ClinicPortalError(
      "A destination location belongs to another Account.",
      "conflict"
    );
  }
  const roots = site.locations.filter(
    (location) => location.servesSiteRoot && location.active
  );
  if (roots.length !== 1) {
    throw new ClinicPortalError(
      "The moved Site needs one active root location.",
      "conflict"
    );
  }
  const placements = await tx.practiceGuidePlacement.findMany({
    where: { clinicId: input.destinationClinicId },
    select: { id: true, practiceGuideId: true },
  });
  const placementIds = new Set(placements.map((placement) => placement.id));
  if (
    input.placementIds.length !== placements.length ||
    input.placementIds.some((id) => !placementIds.has(id))
  ) {
    throw new ClinicPortalError(
      "Destination placements do not match the moved site.",
      "conflict"
    );
  }
  if (
    placements.some(
      (placement) => !input.destinationGuideIds.has(placement.practiceGuideId)
    )
  ) {
    throw new ClinicPortalError(
      "A destination placement does not use a guide copy.",
      "conflict"
    );
  }
  await assertPlacementOwnership(tx, input.destinationClinicId);
}

async function assertPlacementOwnership(
  tx: Tx,
  clinicId: string
): Promise<void> {
  const crossed = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT placement."id"
    FROM "PracticeGuidePlacement" AS placement
    INNER JOIN "PracticeGuide" AS guide
      ON guide."id" = placement."practiceGuideId"
    INNER JOIN "ClinicLocation" AS location
      ON location."id" = placement."locationId"
    INNER JOIN "ClinicSite" AS site
      ON site."id" = location."clinicSiteId"
    WHERE placement."clinicId" = ${clinicId}
      AND (
        placement."clinicId" <> guide."clinicId"
        OR placement."clinicId" <> location."clinicId"
        OR location."clinicId" <> site."clinicId"
      )
  `;
  if (crossed.length > 0) {
    throw new ClinicPortalError("A placement crosses Accounts.", "conflict");
  }
}

async function assertEntitlementStillReady(
  tx: Tx,
  input: {
    destinationClinicId: string;
    plan: AccountSplitSnapshot["preparation"]["destinationPlan"];
    interval: AccountSplitSnapshot["preparation"]["destinationBillingInterval"];
  }
): Promise<void> {
  const entitlement = await readSplitDestinationCommercialState(
    input.destinationClinicId,
    tx
  );
  const activeLocations = await tx.clinicLocation.count({
    where: {
      clinicId: input.destinationClinicId,
      active: true,
      clinicSite: { active: true, clinicId: input.destinationClinicId },
    },
  });
  const plan =
    input.plan === "ESSENTIAL" || input.plan === "PRACTICE" ? input.plan : null;
  const billing = classifyDestinationBilling({
    entitlement,
    plan,
    interval: input.interval,
    activeLocations,
  });
  if (billing.phase !== "ready") {
    throw new ClinicPortalError(
      "Destination billing is no longer ready.",
      "conflict"
    );
  }
}

async function readPracticeDowngradeReady(
  db: Tx | ReturnType<typeof getPrisma>,
  input: { sourceClinicId: string; preparationId: string }
): Promise<boolean> {
  const entitlement = await db.clinicEntitlement.findUnique({
    where: { clinicId: input.sourceClinicId },
    select: {
      locationAllowance: true,
      extraTeamMemberAllowance: true,
      extraCustomGuideAllowance: true,
      extraTemplateAdaptationAllowance: true,
    },
  });
  const sites = await db.clinicSite.findMany({
    where: { clinicId: input.sourceClinicId, active: true },
    select: { id: true },
  });
  const activeLocationCount = await db.clinicLocation.count({
    where: {
      clinicId: input.sourceClinicId,
      active: true,
      clinicSiteId: { in: sites.map((site) => site.id) },
    },
  });
  const team = await countTeamUsage(db, input.sourceClinicId);
  const guides = await db.practiceGuide.findMany({
    where: { clinicId: input.sourceClinicId, downgradeRetainedAt: null },
    select: {
      id: true,
      guideTemplateId: true,
      sourceGuideTemplateId: true,
      adaptedAt: true,
    },
  });
  const placed = await db.practiceGuidePlacement.findMany({
    where: { clinicId: input.sourceClinicId },
    select: { practiceGuideId: true },
  });
  const placedIds = new Set(
    placed.map((placement) => placement.practiceGuideId)
  );
  const mapped = await db.clinicAccountSplitGuideMap.findMany({
    where: { preparationId: input.preparationId },
    select: { sourcePracticeGuideId: true },
  });
  const guidesLosingAllPlacements = mapped.filter(
    (row) => !placedIds.has(row.sourcePracticeGuideId)
  ).length;
  return assessExecutedPracticeDowngrade({
    activeSiteCount: sites.length,
    activeLocationCount,
    locationAllowance: entitlement?.locationAllowance ?? 1,
    teamUsed: team.occupiedPlaces,
    extras: {
      teamMembers: entitlement?.extraTeamMemberAllowance ?? 0,
      customGuides: entitlement?.extraCustomGuideAllowance ?? 0,
      templateAdaptations: entitlement?.extraTemplateAdaptationAllowance ?? 0,
    },
    customGuides: guides.filter((guide) => isOriginalCustomGuide(guide)).length,
    adaptedGuides: guides.filter((guide) => isAdaptedTemplateGuide(guide))
      .length,
    guidesLosingAllPlacements,
  }).ready;
}

async function readExecutionSummary(
  db: Tx | ReturnType<typeof getPrisma>,
  preparationId: string
): Promise<
  Omit<
    AccountSplitExecutionResult,
    "alreadyCompleted" | "compatibilitySlugParked"
  >
> {
  const preparation = await db.clinicAccountSplitPreparation.findUnique({
    where: { id: preparationId },
    select: {
      id: true,
      status: true,
      sourceClinicId: true,
      destinationClinicId: true,
      executedAt: true,
      executingOperatorUserId: true,
      expectedConfirmation: true,
      executingOperator: { select: { name: true } },
      sourceClinic: { select: { id: true, name: true, slug: true } },
      destinationClinic: { select: { id: true, name: true, slug: true } },
    },
  });
  if (
    !preparation ||
    preparation.status !== "COMPLETED" ||
    !preparation.executedAt ||
    !preparation.destinationClinicId ||
    !preparation.destinationClinic
  ) {
    throw new ClinicPortalError(
      "The completed split could not be read.",
      "conflict"
    );
  }
  const [
    movedDecision,
    sourcePrimary,
    guideCopyCount,
    revisionCopyCount,
    staffMovedCount,
    deactivatedSiteCount,
    practiceDowngradeReady,
  ] = await Promise.all([
    db.clinicAccountSplitSiteDecision.findFirst({
      where: { preparationId, decision: "SPLIT" },
      select: {
        clinicSite: {
          select: { id: true, slug: true, displayName: true, clinicId: true },
        },
      },
    }),
    db.clinicSite.findFirst({
      where: { clinicId: preparation.sourceClinicId, isPrimary: true },
      select: { id: true, slug: true, displayName: true },
    }),
    db.clinicAccountSplitGuideMap.count({ where: { preparationId } }),
    db.clinicAccountSplitRevisionMap.count({ where: { preparationId } }),
    db.clinicAccountSplitStaffSelection.count({
      where: {
        preparationId,
        grantOnDestination: true,
        keepOnSource: false,
      },
    }),
    db.clinicAccountSplitSiteDecision.count({
      where: { preparationId, decision: "DEACTIVATE" },
    }),
    readPracticeDowngradeReady(db, {
      sourceClinicId: preparation.sourceClinicId,
      preparationId,
    }),
  ]);
  if (
    !movedDecision?.clinicSite ||
    movedDecision.clinicSite.clinicId !== preparation.destinationClinicId ||
    !sourcePrimary
  ) {
    throw new ClinicPortalError(
      "The completed split could not be read.",
      "conflict"
    );
  }
  return {
    preparationId,
    executedAt: preparation.executedAt,
    executedByOperatorUserId: preparation.executingOperatorUserId,
    executedByName: preparation.executingOperator?.name ?? null,
    confirmation: preparation.expectedConfirmation,
    source: preparation.sourceClinic,
    destination: preparation.destinationClinic,
    movedSite: {
      id: movedDecision.clinicSite.id,
      slug: movedDecision.clinicSite.slug,
      displayName: movedDecision.clinicSite.displayName,
    },
    sourcePrimarySite: sourcePrimary,
    guideCopyCount,
    revisionCopyCount,
    staffMovedCount,
    deactivatedSiteCount,
    practiceDowngradeReady,
  };
}
