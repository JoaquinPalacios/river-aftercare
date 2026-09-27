import type { CommercialPlan } from "@prisma/client";

import { planSplitSiteBranding } from "@/lib/account-split/branding-plan";
import { isSplitShellCompatibilitySlug } from "@/lib/account-split/shell-slug";
import {
  ACCOUNT_SPLIT_BLOCKER_CODES,
  destinationMembershipRoleConflict,
  projectAccountSplitStatus,
  PUBLIC_URLS_UNCHANGED_STATEMENT,
  type AccountSplitAssessment,
  type AccountSplitBlocker,
  type AccountSplitBlockerCode,
  type AccountSplitSnapshot,
  type AccountSplitWarning,
  type CanonicalRetargetDecision,
  type SplitBillingPhase,
} from "@/lib/account-split/policy";
import { effectiveSiteLocationAllowance } from "@/lib/clinics/site-location-allowance";
import {
  isAdaptedTemplateGuide,
  isOriginalCustomGuide,
} from "@/lib/entitlements/guide-usage";
import {
  effectiveAllowances,
  planGovernanceFromEntitlement,
  ZERO_ALLOWANCE_EXTRAS,
} from "@/lib/entitlements/plan-policy";

export const SITE_TO_EXISTING_GROUP_OPERATION =
  "SITE_TO_EXISTING_GROUP" as const;

const STRUCTURAL_BLOCKERS = new Set<AccountSplitBlockerCode>([
  "shell_missing",
  "destination_same_account",
  "destination_not_group",
  "destination_shell_rejected",
  "moving_site_missing",
  "moving_site_inactive",
  "moving_site_foreign",
  "source_last_active_site",
  "kept_site_missing",
  "kept_site_inactive",
  "kept_site_is_moving_site",
  "kept_site_not_current_primary",
  "destination_primary_missing",
  "destination_primary_conflict",
  "staff_selection_missing",
  "source_plan_mismatch",
]);

export type SupportedSiteToExistingGroupAction =
  | { available: true; operation: "group_site_to_existing_group" }
  | { available: false };

/**
 * A Group Account with at least two active Clinic Sites can move one of them
 * into another existing Group. An open preparation of this kind stays reachable.
 */
export function supportedSiteToExistingGroupAction(input: {
  commercialPlan: string | null;
  activeClinicSiteCount: number;
  hasOpenPreparation?: boolean;
}): SupportedSiteToExistingGroupAction {
  if (input.hasOpenPreparation) {
    return { available: true, operation: "group_site_to_existing_group" };
  }
  if (input.commercialPlan === "GROUP" && input.activeClinicSiteCount > 1) {
    return { available: true, operation: "group_site_to_existing_group" };
  }
  return { available: false };
}

export function existingGroupMoveConfirmationPhrase(siteSlug: string): string {
  return `move site ${siteSlug}`;
}

export function confirmationMatchesExistingGroupMove(
  siteSlug: string,
  typed: string
): boolean {
  return typed.trim() === existingGroupMoveConfirmationPhrase(siteSlug);
}

/**
 * Deterministic PracticeGuide.publicSlug when the destination Account already
 * uses the source slug. The placement public slug is not passed here.
 * The same taken set and desired slug always return the same value.
 */
export function allocateAccountGuideSlug(
  desired: string,
  taken: Set<string>
): string {
  if (!taken.has(desired)) {
    taken.add(desired);
    return desired;
  }
  let suffix = 2;
  while (taken.has(`${desired}-${suffix}`)) {
    suffix += 1;
  }
  const chosen = `${desired}-${suffix}`;
  taken.add(chosen);
  return chosen;
}

type GuideRow = AccountSplitSnapshot["guides"][number];

function orderBlockers(blockers: AccountSplitBlocker[]): AccountSplitBlocker[] {
  return ACCOUNT_SPLIT_BLOCKER_CODES.flatMap((code) =>
    blockers.filter((blocker) => blocker.code === code)
  );
}

function activeLocationCount(
  sites: Array<{ id: string; active: boolean }>,
  locations: Array<{ clinicSiteId: string; active: boolean }>
): number {
  const activeSiteIds = new Set(
    sites.filter((site) => site.active).map((site) => site.id)
  );
  return locations.filter(
    (location) => location.active && activeSiteIds.has(location.clinicSiteId)
  ).length;
}

function destinationAllowance(snapshot: AccountSplitSnapshot) {
  const entitlement = snapshot.destination.entitlement;
  return effectiveSiteLocationAllowance({
    entitlement: entitlement
      ? {
          commercialPlan: entitlement.commercialPlan,
          siteAllowance: entitlement.siteAllowance,
          locationAllowance: entitlement.locationAllowance,
          capacityEntitlementActive:
            entitlement.capacityEntitlementActive ??
            entitlement.access === "ACTIVE",
          purchasedAdditionalSiteQuantity:
            entitlement.purchasedAdditionalSiteQuantity,
          purchasedAdditionalLocationQuantity:
            entitlement.purchasedAdditionalLocationQuantity,
          extraSiteAllowance: entitlement.extraSiteAllowance,
          extraLocationAllowance: entitlement.extraLocationAllowance,
        }
      : null,
  });
}

function movingSiteFrom(snapshot: AccountSplitSnapshot) {
  const splitIds = snapshot.decisions
    .filter((decision) => decision.decision === "SPLIT")
    .map((decision) => decision.clinicSiteId);
  if (splitIds.length !== 1) {
    return { site: null, ambiguous: splitIds.length > 1 };
  }
  return {
    site: snapshot.sites.find((site) => site.id === splitIds[0]) ?? null,
    ambiguous: false,
  };
}

function sourcePlanBlocker(plan: CommercialPlan | null): AccountSplitBlocker {
  if (plan === "ESSENTIAL") {
    return {
      code: "source_plan_mismatch",
      message: "Essential cannot move a Clinic Site into an existing Group.",
    };
  }
  if (plan === "PRACTICE") {
    return {
      code: "source_plan_mismatch",
      message: "Practice cannot move a Clinic Site into an existing Group.",
    };
  }
  return {
    code: "source_plan_mismatch",
    message: "This move starts from a Group Account.",
  };
}

function isPristineCanonical(guide: GuideRow): boolean {
  return (
    guide.guideTemplateId !== null &&
    guide.pinnedRevisionId !== null &&
    guide.pinnedRevisionStatus === "PUBLISHED" &&
    guide.sourceGuideTemplateId === null &&
    guide.adaptedAt === null &&
    guide.copiedFromPracticeGuideId === null &&
    guide.overrideCount === 0 &&
    guide.additionCount === 0 &&
    guide.revisions.length === 0 &&
    guide.downgradeRetainedAt === null
  );
}

function isPubliclyServable(guide: GuideRow): boolean {
  if (!guide.isEnabled || guide.status !== "PUBLISHED") {
    return false;
  }
  const publishedClinicRevision = guide.revisions.some(
    (revision) => revision.status === "PUBLISHED" && revision.version > 0
  );
  if (publishedClinicRevision) {
    return true;
  }
  return (
    guide.revisions.length === 0 && guide.pinnedRevisionStatus === "PUBLISHED"
  );
}

function pristineFailure(
  guide: GuideRow,
  side: "source" | "destination"
): string | null {
  if (guide.sourceGuideTemplateId !== null || guide.adaptedAt !== null) {
    return side === "source"
      ? "source guide is adapted"
      : "destination guide is adapted";
  }
  if (guide.overrideCount > 0) {
    return side === "source"
      ? "source guide has an override"
      : "destination guide has an override";
  }
  if (guide.additionCount > 0) {
    return side === "source"
      ? "source guide has an addition"
      : "destination guide has an addition";
  }
  if (guide.revisions.length > 0) {
    return side === "source"
      ? "source guide has a clinic revision"
      : "destination guide has a clinic revision";
  }
  if (guide.downgradeRetainedAt !== null) {
    return side === "source"
      ? "source guide is in downgrade retention"
      : "destination guide lifecycle was modified";
  }
  if (guide.copiedFromPracticeGuideId !== null) {
    return side === "source"
      ? "source guide is a detached copy"
      : "destination guide lifecycle was modified";
  }
  if (guide.guideTemplateId === null || guide.pinnedRevisionId === null) {
    return "canonical pin is missing";
  }
  if (guide.pinnedRevisionStatus !== "PUBLISHED") {
    return "pinned template revision is not published";
  }
  return null;
}

export function canonicalRetargetReason(input: {
  source: GuideRow;
  destinations: GuideRow[];
  enabledOnMovingSite: boolean;
}): string | null {
  if (input.destinations.length !== 1) {
    return "destination does not have exactly one guide for this template";
  }
  const destination = input.destinations[0]!;
  if (
    input.source.guideTemplateId === null ||
    destination.guideTemplateId !== input.source.guideTemplateId
  ) {
    return "template does not match";
  }
  if (input.source.pinnedRevisionId !== destination.pinnedRevisionId) {
    return "pinned revision does not match";
  }
  const sourceFailure = pristineFailure(input.source, "source");
  if (sourceFailure) {
    return sourceFailure;
  }
  const destinationFailure = pristineFailure(destination, "destination");
  if (destinationFailure) {
    return destinationFailure;
  }
  if (input.enabledOnMovingSite && !isPubliclyServable(destination)) {
    return "destination guide is not publicly servable";
  }
  if (!isPristineCanonical(input.source) || !isPristineCanonical(destination)) {
    return "canonical guide is not an exact match";
  }
  return null;
}

function guidesOnLocations(
  snapshot: AccountSplitSnapshot,
  locationIds: Set<string>
): GuideRow[] {
  const guideIds = new Set(
    snapshot.placements
      .filter((placement) => locationIds.has(placement.locationId))
      .map((placement) => placement.practiceGuideId)
  );
  return snapshot.guides.filter((guide) => guideIds.has(guide.id));
}

function classifyExistingGroupBilling(input: {
  snapshot: AccountSplitSnapshot;
}): SplitBillingPhase {
  const entitlement = input.snapshot.destination.entitlement;
  if (!input.snapshot.preparation.destinationClinicId || !entitlement) {
    return { phase: "not_started" };
  }
  const reasons: string[] = [];
  if (entitlement.commercialPlan !== "GROUP") {
    reasons.push("Destination Account is not Group.");
  }
  if (
    entitlement.access !== "ACTIVE" ||
    entitlement.billingStatus !== "ACTIVE"
  ) {
    reasons.push("Destination billing is not active.");
  }
  if (
    entitlement.cancelAtPeriodEnd ||
    entitlement.billingStatus === "CANCEL_AT_PERIOD_END"
  ) {
    reasons.push("Destination subscription is scheduled to cancel.");
  }
  if (entitlement.scheduledCommercialPlan) {
    reasons.push("Destination subscription has a scheduled plan change.");
  }
  if (input.snapshot.destinationDetail.subscriptionSchedulePresent) {
    reasons.push("Destination Account has a subscription schedule.");
  }
  if (
    input.snapshot.destinationDetail.scheduledAdditionalSiteQuantity !== null ||
    input.snapshot.destinationDetail.scheduledCapacityEffectiveAt !== null
  ) {
    reasons.push("Destination Account has a scheduled capacity change.");
  }
  if (reasons.length > 0) {
    return { phase: "not_ready", reasons };
  }
  return { phase: "ready" };
}

/**
 * Readiness for moving one whole Clinic Site into a different existing Group.
 * This does not create a shell, start Checkout, or change either subscription.
 */
export function assessSiteToExistingGroup(
  snapshot: AccountSplitSnapshot
): AccountSplitAssessment {
  const blockers: AccountSplitBlocker[] = [];
  const warnings: AccountSplitWarning[] = [
    {
      code: "source_capacity_not_reduced",
      message:
        "Moving a Clinic Site does not reduce purchased or complimentary capacity on either Account, and it does not change Stripe.",
    },
  ];

  if (snapshot.preparation.operationKind !== SITE_TO_EXISTING_GROUP_OPERATION) {
    blockers.push({
      code: "operation_not_enabled",
      message: "This structural operation is not available.",
    });
  }
  if (snapshot.source.commercialPlan !== "GROUP") {
    blockers.push(sourcePlanBlocker(snapshot.source.commercialPlan));
  }

  const { site: movingSite, ambiguous } = movingSiteFrom(snapshot);
  if (
    ambiguous ||
    (snapshot.decisions.some((row) => row.decision === "SPLIT") && !movingSite)
  ) {
    blockers.push({
      code: "moving_site_missing",
      message: "Choose exactly one Clinic Site to move.",
    });
  } else if (!movingSite) {
    blockers.push({
      code: "moving_site_missing",
      message: "Choose the Clinic Site to move.",
    });
  } else if (
    snapshot.sites.every((site) => site.id !== movingSite.id) ||
    snapshot.preparation.sourceClinicId !== snapshot.source.id
  ) {
    blockers.push({
      code: "moving_site_foreign",
      message: "The Clinic Site to move must belong to the source Account.",
    });
  } else if (!movingSite.active) {
    blockers.push({
      code: "moving_site_inactive",
      message: "The Clinic Site to move must be active.",
    });
  }

  const activeSourceSites = snapshot.sites.filter((site) => site.active);
  if (
    movingSite?.active &&
    activeSourceSites.filter((site) => site.id !== movingSite.id).length < 1
  ) {
    blockers.push({
      code: "source_last_active_site",
      message:
        "The source Group must keep at least one other active Clinic Site.",
    });
  }

  const currentPrimary = snapshot.sites.find((site) => site.isPrimary) ?? null;
  const keptSite =
    snapshot.sites.find(
      (site) => site.id === snapshot.preparation.keptClinicSiteId
    ) ?? null;
  const movingIsPrimary = Boolean(movingSite?.isPrimary);
  if (movingSite?.active && movingIsPrimary) {
    if (!keptSite) {
      blockers.push({
        code: "kept_site_missing",
        message:
          "Choose the active Clinic Site that will become the source primary.",
      });
    } else if (keptSite.id === movingSite.id) {
      blockers.push({
        code: "kept_site_is_moving_site",
        message:
          "The Clinic Site that stays cannot be the Clinic Site that moves.",
      });
    } else if (!keptSite.active) {
      blockers.push({
        code: "kept_site_inactive",
        message:
          "The Clinic Site that stays on the source Account must be active.",
      });
    }
  } else if (movingSite?.active && !movingIsPrimary) {
    if (!currentPrimary || !keptSite || keptSite.id !== currentPrimary.id) {
      blockers.push({
        code: "kept_site_not_current_primary",
        message:
          "The source primary Clinic Site stays primary. Choose that Site as the one that remains.",
      });
    } else if (!keptSite.active) {
      blockers.push({
        code: "kept_site_inactive",
        message: "The source primary Clinic Site must stay active.",
      });
    }
  }

  const destinationId = snapshot.preparation.destinationClinicId;
  const destinationClinic = snapshot.destination.clinic;
  if (!destinationId || !destinationClinic) {
    blockers.push({
      code: "shell_missing",
      message:
        "Choose the existing Group Account that will receive this Clinic Site.",
    });
  } else if (destinationId === snapshot.source.id) {
    blockers.push({
      code: "destination_same_account",
      message: "Choose a different Group Account.",
    });
  } else if (isSplitShellCompatibilitySlug(destinationClinic.slug)) {
    blockers.push({
      code: "destination_shell_rejected",
      message:
        "This move does not create a destination Account. Choose a Group that already exists.",
    });
  } else if (snapshot.destination.entitlement?.commercialPlan !== "GROUP") {
    blockers.push({
      code: "destination_not_group",
      message:
        snapshot.destination.entitlement?.commercialPlan === "ESSENTIAL"
          ? "Essential cannot receive a Clinic Site from another Group."
          : snapshot.destination.entitlement?.commercialPlan === "PRACTICE"
            ? "Practice cannot receive a Clinic Site from another Group."
            : "Choose an existing Group Account.",
    });
  }

  const destinationPrimaries = snapshot.destinationDetail.sites.filter(
    (site) => site.active && site.isPrimary
  );
  if (
    destinationClinic &&
    snapshot.destination.entitlement?.commercialPlan === "GROUP"
  ) {
    if (destinationPrimaries.length === 0) {
      blockers.push({
        code: "destination_primary_missing",
        message:
          "The destination Group must already have one active primary Clinic Site.",
      });
    } else if (destinationPrimaries.length > 1) {
      blockers.push({
        code: "destination_primary_conflict",
        message:
          "The destination Group has more than one active primary Clinic Site. This move does not repair that.",
      });
    }
  }

  const movingLocations = movingSite
    ? snapshot.locations.filter(
        (location) => location.clinicSiteId === movingSite.id
      )
    : [];
  const movingLocationIds = new Set(
    movingLocations.map((location) => location.id)
  );
  const movingActiveLocations = movingLocations.filter(
    (location) => location.active && movingSite?.active
  );
  const destinationActiveSites = snapshot.destinationDetail.sites.filter(
    (site) => site.active
  ).length;
  const destinationActiveLocations = activeLocationCount(
    snapshot.destinationDetail.sites,
    snapshot.destinationDetail.locations
  );
  const postMoveActiveSites = destinationClinic
    ? destinationActiveSites + (movingSite?.active ? 1 : 0)
    : 0;
  const postMoveActiveLocations =
    destinationActiveLocations + movingActiveLocations.length;
  const allowance = destinationAllowance(snapshot);

  if (
    destinationClinic &&
    snapshot.destination.entitlement?.commercialPlan === "GROUP" &&
    movingSite?.active &&
    postMoveActiveSites > allowance.siteAllowance
  ) {
    blockers.push({
      code: "destination_site_allowance",
      message: `The destination Group allows ${allowance.siteAllowance} active Clinic Sites. After this move it would have ${postMoveActiveSites}.`,
    });
  }
  if (
    destinationClinic &&
    snapshot.destination.entitlement?.commercialPlan === "GROUP" &&
    movingSite?.active &&
    postMoveActiveLocations > allowance.locationAllowance
  ) {
    blockers.push({
      code: "destination_location_allowance",
      message: `The destination Group allows ${allowance.locationAllowance} active Locations. After this move it would have ${postMoveActiveLocations}.`,
    });
  }

  if (snapshot.destinationDetail.subscriptionSchedulePresent) {
    blockers.push({
      code: "destination_subscription_schedule",
      message:
        "The destination Account has a subscription schedule. Clear it before this move.",
    });
  }
  if (snapshot.destination.entitlement?.scheduledCommercialPlan) {
    blockers.push({
      code: "destination_scheduled_plan",
      message:
        "The destination Account has a scheduled plan change. Clear it before this move.",
    });
  }
  if (
    snapshot.destinationDetail.scheduledAdditionalSiteQuantity !== null ||
    snapshot.destinationDetail.scheduledCapacityEffectiveAt !== null
  ) {
    blockers.push({
      code: "destination_scheduled_capacity",
      message:
        "The destination Account has a scheduled capacity change. Clear it before this move.",
    });
  }
  if (
    snapshot.destination.entitlement?.cancelAtPeriodEnd ||
    snapshot.destination.entitlement?.billingStatus === "CANCEL_AT_PERIOD_END"
  ) {
    blockers.push({
      code: "destination_cancel_at_period_end",
      message:
        "The destination subscription is scheduled to cancel. This move needs stable destination capacity.",
    });
  }
  if (snapshot.destinationDetail.openDowngradePreparation) {
    blockers.push({
      code: "destination_downgrade_preparation",
      message:
        "The destination Account has an open downgrade preparation. Finish or cancel it before this move.",
    });
  }
  if (snapshot.destinationDetail.conflictingOpenPreparation) {
    blockers.push({
      code: "destination_conflicting_preparation",
      message:
        "The destination Account already has another open structural preparation.",
    });
  }

  if (snapshot.source.subscriptionSchedulePresent) {
    blockers.push({
      code: "source_subscription_schedule",
      message:
        "The source Account has a subscription schedule. Clear it before this move.",
    });
  }
  if (snapshot.source.scheduledCommercialPlan) {
    blockers.push({
      code: "source_scheduled_plan",
      message:
        "The source Account has a scheduled plan change. Clear it before this move.",
    });
  }
  if (
    snapshot.source.scheduledAdditionalSiteQuantity !== null ||
    snapshot.source.scheduledCapacityEffectiveAt !== null
  ) {
    blockers.push({
      code: "source_scheduled_capacity",
      message:
        "The source Account has a scheduled capacity change. Clear it before this move.",
    });
  }
  if (snapshot.source.openDowngradePreparation) {
    blockers.push({
      code: "source_downgrade_preparation",
      message:
        "The source Account has an open downgrade preparation. Finish or cancel it before this move.",
    });
  }
  if (snapshot.source.conflictingOpenPreparation) {
    blockers.push({
      code: "source_conflicting_preparation",
      message: "This Account already has another open structural preparation.",
    });
  }

  const movingGuides = guidesOnLocations(snapshot, movingLocationIds);
  const destinationByTemplate = new Map<string, GuideRow[]>();
  for (const guide of snapshot.destinationDetail.guides) {
    if (!guide.guideTemplateId) {
      continue;
    }
    const current = destinationByTemplate.get(guide.guideTemplateId) ?? [];
    current.push(guide);
    destinationByTemplate.set(guide.guideTemplateId, current);
  }
  const canonicalDecisions: CanonicalRetargetDecision[] = [];
  const retargetSourceIds = new Set<string>();
  const blockedCanonicalIds = new Set<string>();
  for (const guide of movingGuides) {
    if (!guide.guideTemplateId) {
      continue;
    }
    const destinations = destinationByTemplate.get(guide.guideTemplateId) ?? [];
    if (destinations.length === 0) {
      continue;
    }
    const guidePlacements = snapshot.placements.filter(
      (placement) =>
        placement.practiceGuideId === guide.id &&
        movingLocationIds.has(placement.locationId)
    );
    const enabledOnMovingSite = guidePlacements.some(
      (placement) => placement.isEnabled
    );
    const disabledOnMovingSite = guidePlacements.some(
      (placement) => !placement.isEnabled
    );
    const reason = canonicalRetargetReason({
      source: guide,
      destinations,
      enabledOnMovingSite,
    });
    const destination = destinations.length === 1 ? destinations[0]! : null;
    const confirmed = Boolean(
      destination &&
      reason === null &&
      snapshot.guideMaps.some(
        (row) =>
          row.sourcePracticeGuideId === guide.id &&
          row.destinationPracticeGuideId === destination.id
      )
    );
    if (reason === null && destination) {
      retargetSourceIds.add(guide.id);
    }
    canonicalDecisions.push({
      sourceGuideId: guide.id,
      sourceTitle: guide.title,
      guideTemplateId: guide.guideTemplateId,
      pinnedRevisionId: guide.pinnedRevisionId,
      pinnedRevisionStatus: guide.pinnedRevisionStatus,
      destinationGuideId: destination?.id ?? null,
      destinationTitle: destination?.title ?? null,
      enabledOnMovingSite,
      disabledOnMovingSite,
      compatible: reason === null,
      confirmed,
      reason,
    });
    if (reason) {
      blockedCanonicalIds.add(guide.id);
      blockers.push({
        code: "canonical_retarget_incompatible",
        message: `${guide.title} cannot use the destination guide for the same River template: ${reason}.`,
      });
    } else if (!confirmed) {
      blockers.push({
        code: "canonical_retarget_unconfirmed",
        message: `${guide.title} matches a destination guide. Confirm that this move should use the existing destination guide.`,
      });
    }
  }

  const copyGuides = movingGuides.filter((guide) => {
    if (retargetSourceIds.has(guide.id)) {
      return false;
    }
    if (blockedCanonicalIds.has(guide.id)) {
      return false;
    }
    if (
      guide.guideTemplateId &&
      destinationByTemplate.has(guide.guideTemplateId)
    ) {
      return false;
    }
    return true;
  });

  const governance = planGovernanceFromEntitlement({
    entitlement: snapshot.destination.entitlement
      ? { commercialPlan: snapshot.destination.entitlement.commercialPlan }
      : null,
  });
  if (governance.governed) {
    const extras = snapshot.destination.entitlement
      ? {
          teamMembers:
            snapshot.destination.entitlement.extraTeamMemberAllowance,
          customGuides:
            snapshot.destination.entitlement.extraCustomGuideAllowance,
          templateAdaptations:
            snapshot.destination.entitlement.extraTemplateAdaptationAllowance,
        }
      : ZERO_ALLOWANCE_EXTRAS;
    const limits = effectiveAllowances(governance.policy.base, extras);
    const existingCustom = snapshot.destinationDetail.guides.filter(
      (guide) =>
        guide.downgradeRetainedAt === null && isOriginalCustomGuide(guide)
    ).length;
    const existingAdapted = snapshot.destinationDetail.guides.filter(
      (guide) =>
        guide.downgradeRetainedAt === null && isAdaptedTemplateGuide(guide)
    ).length;
    const copyCustom = copyGuides.filter((guide) =>
      isOriginalCustomGuide(guide)
    ).length;
    const copyAdapted = copyGuides.filter((guide) =>
      isAdaptedTemplateGuide(guide)
    ).length;
    if (existingCustom + copyCustom > limits.customGuides) {
      blockers.push({
        code: "destination_custom_guide_allowance",
        message: `The destination plan allows ${limits.customGuides} custom guides. ${existingCustom + copyCustom} would be on the destination Account.`,
      });
    }
    if (existingAdapted + copyAdapted > limits.templateAdaptations) {
      blockers.push({
        code: "destination_adapted_guide_allowance",
        message: `The destination plan allows ${limits.templateAdaptations} adapted templates. ${existingAdapted + copyAdapted} would be on the destination Account.`,
      });
    }
    if (
      existingCustom + existingAdapted + copyCustom + copyAdapted >
      limits.combinedClinicOwnedGuides
    ) {
      blockers.push({
        code: "destination_combined_guide_allowance",
        message: `The destination plan allows ${limits.combinedClinicOwnedGuides} clinic-owned guides. This move would exceed that.`,
      });
    }
  }

  const activeMembers = snapshot.memberships.filter(
    (membership) => membership.active && membership.platformRole !== "OPERATOR"
  );
  const selectionByUser = new Map(
    snapshot.selections.map((selection) => [selection.userId, selection])
  );
  if (
    activeMembers.some((membership) => !selectionByUser.has(membership.userId))
  ) {
    blockers.push({
      code: "staff_selection_missing",
      message: "Save a source or destination choice for every active member.",
    });
  }
  if (
    activeMembers.some((membership) => {
      const selection = selectionByUser.get(membership.userId);
      return (
        selection?.keepOnSource === true &&
        selection.grantOnDestination === true
      );
    })
  ) {
    blockers.push({
      code: "dual_membership",
      message:
        "A person cannot stay on the source Account and also join the destination Account.",
    });
  }
  const sourceActiveIds = new Set(
    activeMembers.map((membership) => membership.userId)
  );
  if (
    snapshot.destination.memberships.some(
      (membership) =>
        membership.active && sourceActiveIds.has(membership.userId)
    )
  ) {
    blockers.push({
      code: "dual_membership",
      message:
        "A person cannot have an active membership on both the source Account and the destination Account.",
    });
  }
  const destinationByUser = new Map(
    snapshot.destination.memberships.map((membership) => [
      membership.userId,
      membership,
    ])
  );
  const selectedDestinationAdmin = activeMembers.some((membership) => {
    const selection = selectionByUser.get(membership.userId);
    const existing = destinationByUser.get(membership.userId);
    return (
      selection?.grantOnDestination === true &&
      selection.keepOnSource === false &&
      selection.destinationRole === "ADMIN" &&
      (!existing || existing.role === "ADMIN")
    );
  });
  const establishedDestinationAdmin = snapshot.destination.memberships.some(
    (membership) =>
      membership.active &&
      membership.role === "ADMIN" &&
      membership.platformRole !== "OPERATOR" &&
      !sourceActiveIds.has(membership.userId)
  );
  if (!selectedDestinationAdmin && !establishedDestinationAdmin) {
    blockers.push({
      code: "destination_admin_required",
      message:
        "Destination Account requires an active administrator. This move does not create one.",
    });
  }
  const roleConflict = destinationMembershipRoleConflict(snapshot);
  if (roleConflict) {
    blockers.push(roleConflict);
  }

  const branding = planSplitSiteBranding({
    sourceClinicId: snapshot.source.id,
    destinationClinicId: destinationId,
    site: movingSite,
    preparationId: snapshot.preparation.id,
    assets: snapshot.brandingAssets,
  });
  if (movingSite && !branding.ready) {
    blockers.push({
      code: "branding_assets_not_ready",
      message:
        "Prepare destination-owned branding for the moving Clinic Site before execution.",
    });
  }

  const billing = classifyExistingGroupBilling({ snapshot });
  if (billing.phase !== "ready" && destinationClinic) {
    blockers.push({
      code: "billing_not_ready",
      message:
        billing.phase === "not_ready"
          ? billing.reasons.join(" ")
          : "Destination billing is not ready. This move does not start Checkout.",
    });
  }

  if (snapshot.source.billingStatus === "PAST_DUE") {
    warnings.push({
      code: "source_past_due",
      message: "Source billing is past due. This does not block the move.",
    });
  }
  if (
    snapshot.source.cancelAtPeriodEnd ||
    snapshot.source.billingStatus === "CANCEL_AT_PERIOD_END"
  ) {
    warnings.push({
      code: "source_cancel_at_period_end",
      message:
        "Source billing is set to cancel at period end. This does not block the move.",
    });
  }
  if (snapshot.source.access === "RESTRICTED") {
    warnings.push({
      code: "source_restricted",
      message:
        "Source product access is restricted. This does not block the move.",
    });
  }
  if (snapshot.source.billingStatus === "UNPAID") {
    warnings.push({
      code: "source_unpaid",
      message: "Source billing is unpaid. This does not block the move.",
    });
  }
  if (
    snapshot.source.billingStatus === "ENDED" ||
    snapshot.source.access === "ENDED"
  ) {
    warnings.push({
      code: "source_ended",
      message: "Source billing has ended. This does not block the move.",
    });
  }
  if (snapshot.invitations.length > 0) {
    warnings.push({
      code: "outstanding_source_invitations",
      message: `${snapshot.invitations.length} outstanding source invitation${snapshot.invitations.length === 1 ? "" : "s"} stay on the source Account.`,
    });
  }

  const futurePrimary = movingIsPrimary ? keptSite : currentPrimary;
  const primaryPromotionRequired = Boolean(
    futurePrimary && currentPrimary && futurePrimary.id !== currentPrimary.id
  );
  const preparationComplete = !blockers.some((blocker) =>
    STRUCTURAL_BLOCKERS.has(blocker.code)
  );
  const ready =
    preparationComplete && billing.phase === "ready" && blockers.length === 0;
  const projectedBilling: SplitBillingPhase =
    billing.phase === "awaiting_payment"
      ? {
          phase: "not_ready",
          reasons: ["This move does not start Checkout."],
        }
      : billing;
  const status = projectAccountSplitStatus({
    current: snapshot.preparation.status,
    preparationComplete,
    billingPhase: projectedBilling.phase,
    ready,
  });

  const publicUrls = movingSite
    ? movingLocations.flatMap((location) =>
        snapshot.placements
          .filter((placement) => placement.locationId === location.id)
          .map((placement) => ({
            placementId: placement.id,
            hostname: movingSite.slug,
            path:
              location.servesSiteRoot || !location.slug
                ? `/${placement.publicSlug}`
                : `/${location.slug}/${placement.publicSlug}`,
          }))
      )
    : [];

  const destinationStaff = activeMembers.flatMap((membership) => {
    const selection = selectionByUser.get(membership.userId);
    if (!selection?.grantOnDestination || selection.keepOnSource) {
      return [];
    }
    return [
      {
        userId: membership.userId,
        email: membership.email,
        name: membership.name,
        destinationRole: selection.destinationRole,
      },
    ];
  });

  return {
    status,
    preparationComplete,
    billing: projectedBilling,
    blockers: orderBlockers(blockers),
    practiceDowngradeReady: false,
    practiceDowngradeBlockers: [],
    primaryPromotion: {
      required: primaryPromotionRequired,
      currentPrimarySite: currentPrimary,
      futurePrimarySite: futurePrimary,
      message:
        primaryPromotionRequired && futurePrimary
          ? `${futurePrimary.displayName} will become the source Account primary Clinic Site during execution.`
          : null,
    },
    warnings,
    confirmationPhrase: movingSite
      ? existingGroupMoveConfirmationPhrase(movingSite.slug)
      : null,
    keptSite,
    splitSite: movingSite,
    sourcePreview: {
      activeSiteCount: movingSite
        ? activeSourceSites.filter((site) => site.id !== movingSite.id).length
        : activeSourceSites.length,
      activeLocationCount: snapshot.locations.filter(
        (location) =>
          location.active &&
          location.clinicSiteId !== movingSite?.id &&
          snapshot.sites.some(
            (site) =>
              site.id === location.clinicSiteId &&
              site.active &&
              site.id !== movingSite?.id
          )
      ).length,
      siteLimit: allowance.siteAllowance,
      locationLimit: allowance.locationAllowance,
      teamUsed: activeMembers.filter((membership) => {
        const selection = selectionByUser.get(membership.userId);
        return !selection || selection.keepOnSource;
      }).length,
      teamLimit: 0,
      customGuides: 0,
      adaptedGuides: 0,
      combinedGuides: 0,
      customGuideLimit: 0,
      adaptedGuideLimit: 0,
      combinedGuideLimit: 0,
      guidesLosingAllPlacements: [],
      deactivatedSiteIds: [],
      retainedSiteIds: snapshot.sites
        .filter((site) => site.id !== movingSite?.id)
        .map((site) => site.id),
      activeSites: activeSourceSites
        .filter((site) => site.id !== movingSite?.id)
        .map((site) => ({
          id: site.id,
          displayName: site.displayName,
          slug: site.slug,
        })),
      planRemains: "GROUP",
    },
    locationMove: null,
    existingGroup: {
      movingSiteId: movingSite?.id ?? null,
      movingSiteIsPrimary: movingIsPrimary,
      destinationPrimarySiteId:
        destinationPrimaries.length === 1 ? destinationPrimaries[0]!.id : null,
      destinationActiveSites,
      destinationActiveLocations,
      postMoveActiveSites,
      postMoveActiveLocations,
      siteAllowance: allowance.siteAllowance,
      locationAllowance: allowance.locationAllowance,
      guidesToCopy: copyGuides.length,
      guidesToRetarget: retargetSourceIds.size,
      canonicalDecisions,
    },
    destinationPreview: {
      accountName: destinationClinic?.name ?? "Destination Group",
      compatibilitySlug: destinationClinic?.slug ?? null,
      compatibilitySlugNote:
        "The destination Account address stays as it is. The incoming Clinic Site keeps its own hostname.",
      siteHostname: movingSite?.slug ?? null,
      brandingUnchanged: true,
      locations: movingLocations.map((location) => ({
        id: location.id,
        name: location.displayName,
        slug: location.slug,
        servesSiteRoot: location.servesSiteRoot,
        active: location.active,
      })),
      publicUrls,
      publicUrlsUnchanged: Boolean(movingSite),
      publicUrlStatement: movingSite ? PUBLIC_URLS_UNCHANGED_STATEMENT : null,
      guideCount: copyGuides.length,
      revisionCount: 0,
      draftRevisionCount: 0,
      publishedRevisionCount: 0,
      sectionCount: 0,
      overrideCount: 0,
      additionCount: 0,
      placementCount: publicUrls.length,
      pinnedPlacementCount: 0,
      templateBackedGuideCount: copyGuides.filter(
        (guide) => guide.guideTemplateId !== null
      ).length,
      sharedWithKeptSiteCount: 0,
      guides: [],
      staff: destinationStaff,
      plan: null,
      interval: snapshot.preparation.destinationBillingInterval,
      siteUsed: postMoveActiveSites,
      siteLimit: allowance.siteAllowance,
      locationUsed: postMoveActiveLocations,
      locationLimit: allowance.locationAllowance,
      teamUsed: destinationStaff.length,
      teamLimit: 0,
    },
  };
}
