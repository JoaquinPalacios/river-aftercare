import type { CommercialPlan } from "@prisma/client";

import { planSplitSiteBranding } from "@/lib/account-split/branding-plan";
import {
  ACCOUNT_SPLIT_BLOCKER_CODES,
  accountSplitDestinationAllowance,
  classifyDestinationBilling,
  destinationMembershipRoleConflict,
  projectAccountSplitStatus,
  type AccountSplitAssessment,
  type AccountSplitBlocker,
  type AccountSplitBlockerCode,
  type AccountSplitSnapshot,
  type AccountSplitWarning,
} from "@/lib/account-split/policy";
import { isSplitShellCompatibilitySlug } from "@/lib/account-split/shell-slug";
import { isValidCareGuideSlug } from "@/lib/aftercare/slug";
import {
  isAdaptedTemplateGuide,
  isOriginalCustomGuide,
} from "@/lib/entitlements/guide-usage";
import {
  effectiveAllowances,
  PLAN_ENTITLEMENT_POLICIES,
  ZERO_ALLOWANCE_EXTRAS,
  type GovernedCommercialPlan,
} from "@/lib/entitlements/plan-policy";
import { isReservedTenantSlug } from "@/lib/tenancy/reserved-slugs";

export const LOCATION_MOVE_OPERATION = "LOCATION_TO_NEW_ACCOUNT" as const;

/**
 * Structural fields that keep a location move in DRAFT until the operator
 * has selected an eligible location, confirmed the destination site slug,
 * created an empty shell, and saved staff choices.
 */
const LOCATION_STRUCTURAL_BLOCKERS = new Set<AccountSplitBlockerCode>([
  "shell_missing",
  "destination_shell_has_sites",
  "location_not_selected",
  "location_inactive",
  "location_is_root",
  "location_missing_slug",
  "location_wrong_site",
  "source_site_inactive",
  "source_root_missing",
  "kept_site_missing",
  "destination_site_slug_unconfirmed",
  "destination_site_slug_invalid",
  "destination_site_slug_taken",
  "destination_not_new_account",
  "destination_plan_rejected",
  "staff_selection_missing",
  "source_plan_mismatch",
]);

export type LocationMoveCandidate = {
  id: string;
  clinicId: string;
  clinicSiteId: string;
  active: boolean;
  servesSiteRoot: boolean;
  slug: string | null;
};

export type SupportedLocationMoveAction =
  | { available: true; operation: "practice_location_to_new_account" }
  | { available: false };

/**
 * Practice Accounts with an active non-root location can start this move.
 * An open location preparation stays reachable. Group Clinic Site splits use
 * `supportedAccountSplitAction` and are not offered here.
 */
export function supportedLocationToNewAccountAction(input: {
  commercialPlan: string | null;
  eligibleLocationCount: number;
  hasOpenPreparation?: boolean;
}): SupportedLocationMoveAction {
  if (input.hasOpenPreparation) {
    return {
      available: true,
      operation: "practice_location_to_new_account",
    };
  }
  if (input.commercialPlan === "PRACTICE" && input.eligibleLocationCount > 0) {
    return {
      available: true,
      operation: "practice_location_to_new_account",
    };
  }
  return { available: false };
}

export function locationMoveConfirmationPhrase(siteSlug: string): string {
  return `move ${siteSlug}`;
}

export function confirmationMatchesLocationMove(
  siteSlug: string,
  typed: string
): boolean {
  return typed.trim() === locationMoveConfirmationPhrase(siteSlug);
}

/**
 * Authoritative eligibility for one Practice non-root location.
 * Root locations (`servesSiteRoot` or a null slug) are rejected here.
 * Callers must not promote another location into a root to bypass this.
 */
export function locationMoveEligibility(input: {
  commercialPlan: string | null;
  sourceSite: { id: string; clinicId: string; active: boolean } | null;
  location: LocationMoveCandidate | null;
  rootLocation: {
    id: string;
    active: boolean;
    servesSiteRoot: boolean;
  } | null;
}): AccountSplitBlocker | null {
  if (input.commercialPlan !== "PRACTICE") {
    return {
      code: "source_plan_mismatch",
      message: sourcePlanMessage(input.commercialPlan),
    };
  }
  if (!input.sourceSite) {
    return {
      code: "kept_site_missing",
      message: "Choose the Practice Clinic Site this location belongs to.",
    };
  }
  if (!input.sourceSite.active) {
    return {
      code: "source_site_inactive",
      message: "The source Clinic Site must be active.",
    };
  }
  if (!input.location) {
    return {
      code: "location_not_selected",
      message: "Choose the location to move onto the new account.",
    };
  }
  if (
    input.location.clinicId !== input.sourceSite.clinicId ||
    input.location.clinicSiteId !== input.sourceSite.id
  ) {
    return {
      code: "location_wrong_site",
      message: "That location is not on the source Clinic Site.",
    };
  }
  if (!input.location.active) {
    return {
      code: "location_inactive",
      message: "Choose an active location.",
    };
  }
  if (input.location.servesSiteRoot) {
    return {
      code: "location_is_root",
      message:
        "The root location stays on the source Clinic Site. Moving a root location is not supported.",
    };
  }
  if (input.location.slug === null) {
    return {
      code: "location_missing_slug",
      message:
        "A location without a public address cannot move onto a new account.",
    };
  }
  if (
    !input.rootLocation ||
    !input.rootLocation.active ||
    !input.rootLocation.servesSiteRoot ||
    input.rootLocation.id === input.location.id
  ) {
    return {
      code: "source_root_missing",
      message:
        "The source Clinic Site must keep its active root location behind.",
    };
  }
  return null;
}

export function locationDestinationSlugIssue(
  slug: string | null
): AccountSplitBlocker | null {
  if (!slug || slug.trim() === "") {
    return {
      code: "destination_site_slug_unconfirmed",
      message:
        "Confirm the destination Clinic Site address before billing can be ready.",
    };
  }
  if (!isValidCareGuideSlug(slug) || isReservedTenantSlug(slug)) {
    return {
      code: "destination_site_slug_invalid",
      message:
        "Enter a destination Clinic Site address using lowercase letters, numbers, and hyphens.",
    };
  }
  return null;
}

export function destinationSiteSlugIsTaken(
  snapshot: AccountSplitSnapshot,
  slug: string
): boolean {
  if (snapshot.destinationSlugSiteId) {
    return true;
  }
  const holder = snapshot.destinationSlugClinicId;
  if (!holder) {
    return false;
  }
  if (holder === snapshot.preparation.destinationClinicId) {
    return false;
  }
  if (holder === snapshot.source.id) {
    const primary = snapshot.sites.find((site) => site.isPrimary);
    return !primary || primary.slug === slug;
  }
  return true;
}

function sourcePlanMessage(plan: string | null): string {
  if (plan === "ESSENTIAL") {
    return "Essential cannot move a location onto a new account.";
  }
  if (plan === "GROUP") {
    return "A Group Account uses Clinic Site split. It cannot move one location onto a new account.";
  }
  return "This move starts from a Practice Account.";
}

function governedPlan(plan: CommercialPlan): GovernedCommercialPlan | null {
  if (plan === "ESSENTIAL" || plan === "PRACTICE") {
    return plan;
  }
  return null;
}

function orderBlockers(blockers: AccountSplitBlocker[]): AccountSplitBlocker[] {
  return ACCOUNT_SPLIT_BLOCKER_CODES.flatMap((code) =>
    blockers.filter((blocker) => blocker.code === code)
  );
}

/**
 * People who will be active destination administrators after cutover.
 * An existing destination role is kept, so a reviewed ADMIN decision does not
 * count when that membership already has another role. Platform operators
 * do not count. Their Terms acceptance does not either.
 */
function prospectiveDestinationAdminIds(
  snapshot: AccountSplitSnapshot
): string[] {
  const destinationByUser = new Map(
    snapshot.destination.memberships.map((membership) => [
      membership.userId,
      membership,
    ])
  );
  const selectionByUser = new Map(
    snapshot.selections.map((selection) => [selection.userId, selection])
  );
  const ids = new Set<string>();
  for (const membership of snapshot.memberships) {
    if (!membership.active || membership.platformRole === "OPERATOR") {
      continue;
    }
    const selection = selectionByUser.get(membership.userId);
    if (
      !selection?.grantOnDestination ||
      selection.keepOnSource ||
      selection.destinationRole !== "ADMIN"
    ) {
      continue;
    }
    const existing = destinationByUser.get(membership.userId);
    if (existing && existing.role !== "ADMIN") {
      continue;
    }
    ids.add(membership.userId);
  }
  const sourceActiveIds = new Set(
    snapshot.memberships
      .filter((membership) => membership.active)
      .map((membership) => membership.userId)
  );
  for (const membership of snapshot.destination.memberships) {
    if (
      !membership.active ||
      membership.role !== "ADMIN" ||
      membership.platformRole === "OPERATOR" ||
      sourceActiveIds.has(membership.userId)
    ) {
      continue;
    }
    ids.add(membership.userId);
  }
  return [...ids];
}

/**
 * Readiness for moving one Practice non-root location onto a new Essential
 * or Practice account. This is not the Group Clinic Site split assessment.
 */
export function assessLocationToNewAccount(
  snapshot: AccountSplitSnapshot
): AccountSplitAssessment {
  const blockers: AccountSplitBlocker[] = [];
  const warnings: AccountSplitWarning[] = [
    {
      code: "source_capacity_not_reduced",
      message:
        "Moving a location does not reduce the source Account's purchased or complimentary location capacity, and it does not change Stripe.",
    },
  ];

  const sourceSite =
    snapshot.sites.find(
      (site) => site.id === snapshot.preparation.keptClinicSiteId
    ) ?? null;
  const location =
    snapshot.locations.find(
      (row) => row.id === snapshot.preparation.sourceLocationId
    ) ?? null;
  const rootLocation =
    snapshot.locations.find(
      (row) =>
        row.clinicSiteId === sourceSite?.id &&
        row.servesSiteRoot &&
        row.id !== location?.id
    ) ??
    snapshot.locations.find(
      (row) => row.clinicSiteId === sourceSite?.id && row.servesSiteRoot
    ) ??
    null;

  const eligibility = locationMoveEligibility({
    commercialPlan: snapshot.source.commercialPlan,
    sourceSite: sourceSite
      ? {
          id: sourceSite.id,
          clinicId: snapshot.source.id,
          active: sourceSite.active,
        }
      : null,
    location: location
      ? {
          id: location.id,
          clinicId: snapshot.source.id,
          clinicSiteId: location.clinicSiteId,
          active: location.active,
          servesSiteRoot: location.servesSiteRoot,
          slug: location.slug,
        }
      : null,
    rootLocation: rootLocation
      ? {
          id: rootLocation.id,
          active: rootLocation.active,
          servesSiteRoot: rootLocation.servesSiteRoot,
        }
      : null,
  });
  if (eligibility) {
    blockers.push(eligibility);
  }

  const slugIssue = locationDestinationSlugIssue(
    snapshot.preparation.destinationSiteSlug
  );
  if (slugIssue) {
    blockers.push(slugIssue);
  } else if (
    snapshot.preparation.destinationSiteSlug &&
    destinationSiteSlugIsTaken(
      snapshot,
      snapshot.preparation.destinationSiteSlug
    )
  ) {
    blockers.push({
      code: "destination_site_slug_taken",
      message:
        "That destination Clinic Site address is already in use. Confirm a different one.",
    });
  }

  if (snapshot.preparation.destinationPlan === "GROUP") {
    blockers.push({
      code: "destination_plan_rejected",
      message: "The destination Account cannot be Group.",
    });
  }

  if (
    !snapshot.preparation.destinationClinicId ||
    !snapshot.destination.clinic
  ) {
    blockers.push({
      code: "shell_missing",
      message:
        "Create the destination shell Account before this move can proceed.",
    });
  } else if (
    snapshot.destination.clinic.siteCount !== 0 ||
    snapshot.destination.clinic.locationCount !== 0
  ) {
    blockers.push({
      code: "destination_shell_has_sites",
      message:
        "The destination shell must stay empty until the location moves. It cannot be an existing Account.",
    });
  } else if (!isSplitShellCompatibilitySlug(snapshot.destination.clinic.slug)) {
    blockers.push({
      code: "destination_not_new_account",
      message:
        "This move creates a new Account. It does not use an existing Account.",
    });
  }

  const movingLocationIds = new Set(location ? [location.id] : []);
  const copyGuides = location
    ? snapshot.guides.filter((guide) =>
        snapshot.placements.some(
          (placement) =>
            placement.practiceGuideId === guide.id &&
            movingLocationIds.has(placement.locationId)
        )
      )
    : [];
  const sharedGuides = copyGuides.filter((guide) =>
    snapshot.placements.some(
      (placement) =>
        placement.practiceGuideId === guide.id &&
        placement.locationId !== location?.id
    )
  );
  const guidesLeftWithoutPlacements = copyGuides.filter((guide) => {
    const own = snapshot.placements.filter(
      (placement) => placement.practiceGuideId === guide.id
    );
    return (
      own.some((placement) => placement.locationId === location?.id) &&
      own.every((placement) => placement.locationId === location?.id)
    );
  });
  if (sharedGuides.length > 0) {
    warnings.push({
      code: "guides_shared_with_kept_site",
      message: `${sharedGuides.length} guide${sharedGuides.length === 1 ? "" : "s"} placed on the moving location ${sharedGuides.length === 1 ? "is" : "are"} also placed elsewhere on the source Account. The source guide stays. The destination receives a copy.`,
    });
  }
  if (guidesLeftWithoutPlacements.length > 0) {
    warnings.push({
      code: "guides_left_without_placements",
      message: `${guidesLeftWithoutPlacements.length} source guide${guidesLeftWithoutPlacements.length === 1 ? "" : "s"} would remain with no placements. Guides are not deleted.`,
    });
  }

  if (location && hasInconsistentMovingPlacements(snapshot, location.id)) {
    blockers.push({
      code: "inconsistent_placements",
      message:
        "A placement on the moving location does not match its guide or account.",
    });
  }

  const activeMembers = snapshot.memberships.filter(
    (membership) => membership.active && membership.platformRole !== "OPERATOR"
  );
  const selectionByUser = new Map(
    snapshot.selections.map((selection) => [selection.userId, selection])
  );
  const missingStaff = activeMembers.filter(
    (membership) => !selectionByUser.has(membership.userId)
  );
  if (missingStaff.length > 0) {
    blockers.push({
      code: "staff_selection_missing",
      message: "Save a source or destination choice for every active member.",
    });
  }
  const dualMembers = activeMembers.filter((membership) => {
    const selection = selectionByUser.get(membership.userId);
    return (
      selection?.keepOnSource === true && selection.grantOnDestination === true
    );
  });
  if (dualMembers.length > 0) {
    blockers.push({
      code: "dual_membership",
      message:
        "A person cannot stay on the source Account and also join the destination Account.",
    });
  }
  const sourceActiveIds = new Set(
    activeMembers.map((membership) => membership.userId)
  );
  const destinationMembershipByUser = new Map(
    snapshot.destination.memberships.map((membership) => [
      membership.userId,
      membership,
    ])
  );
  const selectedDestinationAdmin = activeMembers.some((membership) => {
    const selection = selectionByUser.get(membership.userId);
    const existing = destinationMembershipByUser.get(membership.userId);
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
  const liveDualMembership = snapshot.destination.memberships.some(
    (membership) => membership.active && sourceActiveIds.has(membership.userId)
  );
  if (liveDualMembership) {
    blockers.push({
      code: "dual_membership",
      message:
        "A person cannot have an active membership on both the source Account and the destination Account.",
    });
  }
  if (!selectedDestinationAdmin && !establishedDestinationAdmin) {
    blockers.push({
      code: "destination_admin_required",
      message:
        "Destination Account requires an administrator who will not remain an active member of the source Account.",
    });
  }
  const roleConflict = destinationMembershipRoleConflict(snapshot);
  if (roleConflict) {
    blockers.push(roleConflict);
  }
  const termsAdminIds = prospectiveDestinationAdminIds(snapshot);
  if (
    snapshot.preparation.destinationClinicId &&
    termsAdminIds.length > 0 &&
    !termsAdminIds.some((userId) =>
      snapshot.destinationTermsAcceptedUserIds.includes(userId)
    )
  ) {
    blockers.push({
      code: "destination_terms_required",
      message:
        "The destination administrator must accept the Terms on the destination Account before this move can run.",
    });
  }

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

  const destinationPlan = governedPlan(snapshot.preparation.destinationPlan);
  const destinationExtras = snapshot.destination.entitlement
    ? {
        teamMembers: snapshot.destination.entitlement.extraTeamMemberAllowance,
        customGuides:
          snapshot.destination.entitlement.extraCustomGuideAllowance,
        templateAdaptations:
          snapshot.destination.entitlement.extraTemplateAdaptationAllowance,
      }
    : ZERO_ALLOWANCE_EXTRAS;
  const destinationGuideLimits = destinationPlan
    ? effectiveAllowances(
        PLAN_ENTITLEMENT_POLICIES[destinationPlan].base,
        destinationExtras
      )
    : null;
  const destinationAllowance = accountSplitDestinationAllowance({
    plan: destinationPlan,
    entitlement: snapshot.destination.entitlement,
  });
  if (
    destinationGuideLimits &&
    destinationStaff.length > destinationGuideLimits.teamMembers
  ) {
    blockers.push({
      code: "destination_team_count",
      message: `The destination plan allows ${destinationGuideLimits.teamMembers} team members. ${destinationStaff.length} would join.`,
    });
  }

  const copyCustom = copyGuides.filter((guide) =>
    isOriginalCustomGuide(guide)
  ).length;
  const copyAdapted = copyGuides.filter((guide) =>
    isAdaptedTemplateGuide(guide)
  ).length;
  if (
    destinationGuideLimits &&
    copyCustom > destinationGuideLimits.customGuides
  ) {
    blockers.push({
      code: "destination_custom_guide_allowance",
      message: `The destination plan allows ${destinationGuideLimits.customGuides} custom guides. ${copyCustom} would be copied.`,
    });
  }
  if (
    destinationGuideLimits &&
    copyAdapted > destinationGuideLimits.templateAdaptations
  ) {
    blockers.push({
      code: "destination_adapted_guide_allowance",
      message: `The destination plan allows ${destinationGuideLimits.templateAdaptations} adapted templates. ${copyAdapted} would be copied.`,
    });
  }
  if (
    destinationGuideLimits &&
    copyCustom + copyAdapted > destinationGuideLimits.combinedClinicOwnedGuides
  ) {
    blockers.push({
      code: "destination_combined_guide_allowance",
      message: `The destination plan allows ${destinationGuideLimits.combinedClinicOwnedGuides} clinic-owned guides. ${copyCustom + copyAdapted} would be copied.`,
    });
  }

  const movingActiveLocations = location?.active && sourceSite?.active ? 1 : 0;
  if (
    destinationPlan === "ESSENTIAL" &&
    (destinationAllowance.siteAllowance !== 1 ||
      destinationAllowance.locationAllowance !== 1)
  ) {
    blockers.push({
      code: "destination_location_allowance",
      message:
        "Essential destination capacity must be exactly 1 Clinic Site and 1 Location.",
    });
  }
  if (
    destinationAllowance.siteAllowance < 1 ||
    destinationAllowance.locationAllowance < movingActiveLocations
  ) {
    blockers.push({
      code: "destination_location_allowance",
      message: `The destination plan allows ${destinationAllowance.siteAllowance} Clinic Site and ${destinationAllowance.locationAllowance} Location. This move needs 1 of each.`,
    });
  }
  if (
    destinationPlan === "PRACTICE" &&
    snapshot.destination.entitlement &&
    (snapshot.destination.entitlement.purchasedAdditionalLocationQuantity ===
      null ||
      snapshot.destination.entitlement.purchasedAdditionalLocationQuantity ===
        undefined)
  ) {
    blockers.push({
      code: "destination_location_quantity_unprojected",
      message:
        "Practice destination billing must record an explicit additional location quantity, including zero. A null quantity is not ready.",
    });
  }

  const billing = classifyDestinationBilling({
    entitlement: snapshot.destination.entitlement,
    plan: destinationPlan,
    interval: snapshot.preparation.destinationBillingInterval,
    activeLocations: movingActiveLocations,
  });
  if (billing.phase !== "ready") {
    blockers.push({
      code: "billing_not_ready",
      message: billingMessage(billing),
    });
  }

  const branding = planSplitSiteBranding({
    sourceClinicId: snapshot.source.id,
    destinationClinicId: snapshot.preparation.destinationClinicId,
    site: sourceSite,
    preparationId: snapshot.preparation.id,
    assets: snapshot.brandingAssets,
  });
  if (sourceSite && !branding.ready) {
    blockers.push({
      code: "branding_assets_not_ready",
      message:
        "Prepare destination-owned branding from the source Clinic Site before execution.",
    });
  }

  pushSourceCommercialConflicts(snapshot, blockers);
  pushSourceBillingWarnings(snapshot, warnings);
  if (snapshot.invitations.length > 0) {
    warnings.push({
      code: "outstanding_source_invitations",
      message: `${snapshot.invitations.length} outstanding source invitation${snapshot.invitations.length === 1 ? "" : "s"} stay on the source Account and are not moved.`,
    });
  }
  if (
    snapshot.preparation.status === "CANCELLED" &&
    snapshot.destination.clinic
  ) {
    warnings.push({
      code: "shell_remains_after_cancel",
      message: `Destination shell ${snapshot.destination.clinic.name} (${snapshot.destination.clinic.slug}) was not deleted.`,
    });
  }

  const orderedBlockers = orderBlockers(blockers);
  const preparationComplete = !orderedBlockers.some((blocker) =>
    LOCATION_STRUCTURAL_BLOCKERS.has(blocker.code)
  );
  const ready =
    preparationComplete &&
    billing.phase === "ready" &&
    orderedBlockers.length === 0;
  const status = projectAccountSplitStatus({
    current: snapshot.preparation.status,
    preparationComplete,
    billingPhase: billing.phase,
    ready,
  });
  const confirmedSlug =
    slugIssue || !snapshot.preparation.destinationSiteSlug
      ? null
      : snapshot.preparation.destinationSiteSlug;
  const guidePreviews = copyGuides.map((guide) =>
    describeCopiedGuide(snapshot, guide, location?.id ?? null)
  );
  const activeRemainingLocations = snapshot.locations.filter(
    (row) =>
      row.active &&
      row.id !== location?.id &&
      snapshot.sites.some((site) => site.id === row.clinicSiteId && site.active)
  );
  const departingWasPrimary = location?.isPrimary === true;

  return {
    status,
    preparationComplete,
    billing,
    blockers: orderedBlockers,
    practiceDowngradeReady: false,
    practiceDowngradeBlockers: [],
    primaryPromotion: {
      required: false,
      currentPrimarySite: snapshot.sites.find((site) => site.isPrimary) ?? null,
      futurePrimarySite: sourceSite,
      message: null,
    },
    warnings,
    confirmationPhrase: confirmedSlug
      ? locationMoveConfirmationPhrase(confirmedSlug)
      : null,
    keptSite: sourceSite,
    splitSite: null,
    sourcePreview: {
      activeSiteCount: snapshot.sites.filter((site) => site.active).length,
      activeLocationCount: activeRemainingLocations.length,
      siteLimit: 1,
      locationLimit: destinationAllowance.locationAllowance,
      teamUsed: activeMembers.filter((membership) => {
        const selection = selectionByUser.get(membership.userId);
        return !selection || selection.keepOnSource;
      }).length,
      teamLimit: destinationGuideLimits?.teamMembers ?? 0,
      customGuides: 0,
      adaptedGuides: 0,
      combinedGuides: 0,
      customGuideLimit: 0,
      adaptedGuideLimit: 0,
      combinedGuideLimit: 0,
      guidesLosingAllPlacements: guidesLeftWithoutPlacements.map((guide) => ({
        id: guide.id,
        title: guide.title,
      })),
      deactivatedSiteIds: [],
      retainedSiteIds: sourceSite ? [sourceSite.id] : [],
      activeSites: snapshot.sites
        .filter((site) => site.active)
        .map((site) => ({
          id: site.id,
          displayName: site.displayName,
          slug: site.slug,
        })),
      planRemains: "PRACTICE",
    },
    locationMove: {
      sourceSiteId: sourceSite?.id ?? snapshot.preparation.keptClinicSiteId,
      location,
      oldSlug: location?.slug ?? null,
      destinationSiteSlug: confirmedSlug,
      rootRetained: Boolean(
        rootLocation?.active && rootLocation.servesSiteRoot
      ),
      departingLocationWasPrimary: departingWasPrimary,
      sourceRootBecomesPrimary: departingWasPrimary,
    },
    existingGroup: null,
    destinationPreview: {
      accountName:
        snapshot.destination.clinic?.name ??
        location?.displayName ??
        "Destination account",
      compatibilitySlug: snapshot.destination.clinic?.slug ?? null,
      compatibilitySlugNote:
        "This compatibility slug is not a patient hostname. Execution replaces it with the confirmed destination Clinic Site address.",
      siteHostname: confirmedSlug,
      brandingUnchanged: false,
      locations: location
        ? [
            {
              id: location.id,
              name: location.displayName,
              slug: null,
              servesSiteRoot: true,
              active: location.active,
            },
          ]
        : [],
      publicUrls: [],
      publicUrlsUnchanged: false,
      publicUrlStatement: null,
      guideCount: guidePreviews.length,
      revisionCount: guidePreviews.reduce(
        (sum, guide) =>
          sum +
          guide.draftRevisionIds.length +
          guide.publishedRevisionIds.length,
        0
      ),
      draftRevisionCount: guidePreviews.reduce(
        (sum, guide) => sum + guide.draftRevisionIds.length,
        0
      ),
      publishedRevisionCount: guidePreviews.reduce(
        (sum, guide) => sum + guide.publishedRevisionIds.length,
        0
      ),
      sectionCount: guidePreviews.reduce(
        (sum, guide) => sum + guide.sectionCount,
        0
      ),
      overrideCount: guidePreviews.reduce(
        (sum, guide) => sum + guide.overrideCount,
        0
      ),
      additionCount: guidePreviews.reduce(
        (sum, guide) => sum + guide.additionCount,
        0
      ),
      placementCount: guidePreviews.reduce(
        (sum, guide) => sum + guide.placementPins.length,
        0
      ),
      pinnedPlacementCount: guidePreviews.reduce(
        (sum, guide) =>
          sum +
          guide.placementPins.filter((pin) => pin.publishedRevisionId).length,
        0
      ),
      templateBackedGuideCount: guidePreviews.filter(
        (guide) => guide.templateBacked
      ).length,
      sharedWithKeptSiteCount: guidePreviews.filter(
        (guide) => guide.sharedWithKeptSite
      ).length,
      guides: guidePreviews,
      staff: destinationStaff,
      plan: destinationPlan,
      interval: snapshot.preparation.destinationBillingInterval,
      siteUsed: location ? 1 : 0,
      siteLimit: destinationAllowance.siteAllowance,
      locationUsed: movingActiveLocations,
      locationLimit: destinationAllowance.locationAllowance,
      teamUsed: destinationStaff.length,
      teamLimit: destinationGuideLimits?.teamMembers ?? 0,
    },
  };
}

function billingMessage(billing: AccountSplitAssessment["billing"]): string {
  if (billing.phase === "not_started") {
    return "Destination billing has not been prepared.";
  }
  if (billing.phase === "awaiting_payment") {
    return "Destination billing is waiting on Checkout or payment.";
  }
  if (billing.phase === "not_ready") {
    return billing.reasons.join(" ");
  }
  return "Destination billing is ready.";
}

function pushSourceCommercialConflicts(
  snapshot: AccountSplitSnapshot,
  blockers: AccountSplitBlocker[]
): void {
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
}

function pushSourceBillingWarnings(
  snapshot: AccountSplitSnapshot,
  warnings: AccountSplitWarning[]
): void {
  if (snapshot.source.billingStatus === "PAST_DUE") {
    warnings.push({
      code: "source_past_due",
      message:
        "Source billing is past due. This does not block the move. Destination billing still has to be active.",
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
}

function hasInconsistentMovingPlacements(
  snapshot: AccountSplitSnapshot,
  locationId: string
): boolean {
  const placements = snapshot.placements.filter(
    (placement) => placement.locationId === locationId
  );
  return placements.some(
    (placement) =>
      placement.clinicId !== snapshot.source.id ||
      placement.guideClinicId !== snapshot.source.id ||
      placement.locationClinicId !== snapshot.source.id ||
      placement.siteClinicId !== snapshot.source.id ||
      (placement.publishedPracticeGuideRevisionId !== null &&
        placement.publishedRevisionPracticeGuideId !==
          placement.practiceGuideId)
  );
}

function describeCopiedGuide(
  snapshot: AccountSplitSnapshot,
  guide: AccountSplitSnapshot["guides"][number],
  movingLocationId: string | null
) {
  const revisions = guide.revisions.filter(
    (revision) => revision.version === 0 || revision.status === "PUBLISHED"
  );
  const sharedWithKeptSite = snapshot.placements.some(
    (placement) =>
      placement.practiceGuideId === guide.id &&
      placement.locationId !== movingLocationId
  );
  return {
    id: guide.id,
    title: guide.title,
    publicSlug: guide.publicSlug,
    templateBacked: guide.guideTemplateId !== null,
    guideTemplateId: guide.guideTemplateId,
    pinnedTemplateRevisionId: guide.pinnedRevisionId,
    sharedWithKeptSite,
    draftRevisionIds: revisions
      .filter((revision) => revision.version === 0)
      .map((revision) => revision.id),
    publishedRevisionIds: revisions
      .filter(
        (revision) => revision.status === "PUBLISHED" && revision.version > 0
      )
      .map((revision) => revision.id),
    sectionCount: revisions.reduce(
      (sum, revision) => sum + revision.sectionCount,
      0
    ),
    overrideCount: guide.overrideCount,
    additionCount: guide.additionCount,
    historicalUserIds: [
      ...new Set(
        revisions.flatMap((revision) =>
          [revision.createdByUserId, revision.reviewAttestedByUserId].filter(
            (id): id is string => Boolean(id)
          )
        )
      ),
    ].sort(),
    placementPins: snapshot.placements
      .filter(
        (placement) =>
          placement.practiceGuideId === guide.id &&
          placement.locationId === movingLocationId
      )
      .map((placement) => ({
        placementId: placement.id,
        locationId: placement.locationId,
        publishedRevisionId: placement.publishedPracticeGuideRevisionId,
        enabled: placement.isEnabled,
      })),
    destinationCopiedFromPracticeGuideId: null as null,
  };
}
