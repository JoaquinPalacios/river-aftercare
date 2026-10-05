import type {
  BillingInterval,
  BillingStatus,
  CommercialArrangement,
  ClinicAccountSplitOperationKind,
  ClinicAccountSplitSiteDecisionKind,
  ClinicAccountSplitStatus,
  ClinicMembershipRole,
  CommercialPlan,
  EntitlementStatus,
  PlatformRole,
  PracticeGuideStatus,
} from "@prisma/client";

import {
  isAdaptedTemplateGuide,
  isOriginalCustomGuide,
} from "@/lib/entitlements/guide-usage";
import {
  effectiveAllowances,
  PLAN_ENTITLEMENT_POLICIES,
  type AllowanceAmounts,
  type GovernedCommercialPlan,
  ZERO_ALLOWANCE_EXTRAS,
} from "@/lib/entitlements/plan-policy";
import {
  effectiveSiteLocationAllowance,
  type SiteLocationAllowance,
} from "@/lib/clinics/site-location-allowance";
import { planSplitSiteBranding } from "@/lib/account-split/branding-plan";

export const ACCOUNT_SPLIT_TARGET_SOURCE_PLAN = "PRACTICE" as const;

export type SupportedAccountSplitAction =
  | {
      available: true;
      operation: "group_clinic_site_to_new_account";
    }
  | { available: false };

/**
 * The only split that can be started today moves one Clinic Site from a
 * Group Account with at least two active Clinic Sites onto a new Account.
 * An open preparation stays reachable so the operator can finish or cancel it.
 */
export function supportedAccountSplitAction(input: {
  commercialPlan: string | null;
  activeClinicSiteCount: number;
  hasOpenPreparation?: boolean;
}): SupportedAccountSplitAction {
  if (input.hasOpenPreparation) {
    return {
      available: true,
      operation: "group_clinic_site_to_new_account",
    };
  }
  if (input.commercialPlan === "GROUP" && input.activeClinicSiteCount > 1) {
    return {
      available: true,
      operation: "group_clinic_site_to_new_account",
    };
  }
  return { available: false };
}

export function unsupportedAccountSplitMessage(
  commercialPlan: string | null
): string {
  if (commercialPlan === "ESSENTIAL") {
    return "Essential has one Clinic Site and one Location. This Account has no split.";
  }
  if (commercialPlan === "PRACTICE") {
    return "This Account has no split. Today's split moves one Clinic Site from a Group Account onto a new Account.";
  }
  if (commercialPlan === "GROUP") {
    return "A Group split needs more than one active Clinic Site.";
  }
  return "This Account has no split.";
}

export const DESTINATION_ADMIN_BLOCKER_MESSAGE =
  "Destination Account requires an administrator who will not remain an active member of the source Account.";

export const DESTINATION_ROLE_CONFLICT_MESSAGE =
  "An existing destination membership keeps its role. Match that role, or change it on the destination Account, before this move.";

/**
 * An existing destination membership is destination-owned. A reviewed move
 * decision must not replace its role. There is no acknowledgement that
 * authorises an overwrite.
 */
export function destinationMembershipRoleConflict(
  snapshot: AccountSplitSnapshot
): AccountSplitBlocker | null {
  const destinationByUser = new Map(
    snapshot.destination.memberships.map((membership) => [
      membership.userId,
      membership,
    ])
  );
  const selectionByUser = new Map(
    snapshot.selections.map((selection) => [selection.userId, selection])
  );
  const conflict = snapshot.memberships.some((membership) => {
    if (!membership.active || membership.platformRole === "OPERATOR") {
      return false;
    }
    const selection = selectionByUser.get(membership.userId);
    if (!selection?.grantOnDestination || selection.keepOnSource) {
      return false;
    }
    const existing = destinationByUser.get(membership.userId);
    return Boolean(existing && existing.role !== selection.destinationRole);
  });
  if (!conflict) {
    return null;
  }
  return {
    code: "destination_role_conflict",
    message: DESTINATION_ROLE_CONFLICT_MESSAGE,
  };
}

export const PUBLIC_URLS_UNCHANGED_STATEMENT = "PUBLIC URLS WILL NOT CHANGE";

export const ACCOUNT_SPLIT_BLOCKER_CODES = [
  "shell_missing",
  "destination_shell_has_sites",
  "unresolved_site_decisions",
  "split_site_count",
  "split_site_inactive",
  "kept_site_missing",
  "kept_site_inactive",
  "missing_root_location",
  "source_active_site_count",
  "source_active_location_count",
  "source_team_count",
  "source_custom_guide_allowance",
  "source_adapted_guide_allowance",
  "source_combined_guide_allowance",
  "guides_lose_all_placements",
  "inconsistent_placements",
  "staff_selection_missing",
  "dual_membership",
  "destination_admin_required",
  "destination_role_conflict",
  "destination_terms_required",
  "destination_location_allowance",
  "destination_team_count",
  "destination_custom_guide_allowance",
  "destination_adapted_guide_allowance",
  "destination_combined_guide_allowance",
  "billing_not_ready",
  "operation_not_enabled",
  "branding_assets_not_ready",
  "source_plan_mismatch",
  "source_subscription_schedule",
  "source_scheduled_plan",
  "source_scheduled_capacity",
  "source_downgrade_preparation",
  "source_conflicting_preparation",
  "location_not_selected",
  "location_inactive",
  "location_is_root",
  "location_missing_slug",
  "location_wrong_site",
  "source_site_inactive",
  "source_root_missing",
  "destination_site_slug_unconfirmed",
  "destination_site_slug_invalid",
  "destination_site_slug_taken",
  "destination_location_quantity_unprojected",
  "destination_plan_rejected",
  "destination_not_new_account",
  "destination_same_account",
  "destination_not_group",
  "destination_shell_rejected",
  "moving_site_missing",
  "moving_site_inactive",
  "moving_site_foreign",
  "source_last_active_site",
  "kept_site_is_moving_site",
  "kept_site_not_current_primary",
  "destination_primary_missing",
  "destination_primary_conflict",
  "destination_site_allowance",
  "destination_subscription_schedule",
  "destination_scheduled_plan",
  "destination_scheduled_capacity",
  "destination_cancel_at_period_end",
  "destination_conflicting_preparation",
  "destination_downgrade_preparation",
  "canonical_retarget_unconfirmed",
  "canonical_retarget_incompatible",
] as const;

export type AccountSplitBlockerCode =
  (typeof ACCOUNT_SPLIT_BLOCKER_CODES)[number];

const STRUCTURAL_BLOCKERS = new Set<AccountSplitBlockerCode>([
  "shell_missing",
  "destination_shell_has_sites",
  "unresolved_site_decisions",
  "split_site_count",
  "split_site_inactive",
  "kept_site_missing",
  "kept_site_inactive",
  "staff_selection_missing",
  "operation_not_enabled",
]);

export const ACCOUNT_SPLIT_COMMERCIAL_CONFLICT_CODES = [
  "source_plan_mismatch",
  "source_subscription_schedule",
  "source_scheduled_plan",
  "source_scheduled_capacity",
  "source_downgrade_preparation",
  "source_conflicting_preparation",
  "destination_not_group",
  "destination_subscription_schedule",
  "destination_scheduled_plan",
  "destination_scheduled_capacity",
  "destination_cancel_at_period_end",
  "destination_conflicting_preparation",
  "destination_downgrade_preparation",
] as const;

/** Practice product limits after this operation. They do not block the split. */
const PRACTICE_DOWNGRADE_BLOCKERS = new Set<AccountSplitBlockerCode>([
  "source_active_site_count",
  "source_active_location_count",
  "source_team_count",
  "source_custom_guide_allowance",
  "source_adapted_guide_allowance",
  "source_combined_guide_allowance",
  "guides_lose_all_placements",
]);

export type AccountSplitBlocker = {
  code: AccountSplitBlockerCode;
  message: string;
};

export type AccountSplitWarning = {
  code:
    | "outstanding_source_invitations"
    | "guides_shared_with_kept_site"
    | "source_plan_conversion_deferred"
    | "inactive_sites_remain"
    | "shell_remains_after_cancel"
    | "source_past_due"
    | "source_cancel_at_period_end"
    | "source_restricted"
    | "source_unpaid"
    | "source_ended"
    | "source_capacity_not_reduced"
    | "guides_left_without_placements";
  message: string;
};

export type SplitBillingPhase =
  | { phase: "not_started" }
  | { phase: "awaiting_payment" }
  | { phase: "not_ready"; reasons: string[] }
  | { phase: "ready" };

export type AccountSplitSnapshot = {
  preparation: {
    id: string;
    status: ClinicAccountSplitStatus;
    sourceClinicId: string;
    destinationClinicId: string | null;
    keptClinicSiteId: string;
    destinationPlan: CommercialPlan;
    destinationBillingInterval: BillingInterval;
    targetSourcePlan: CommercialPlan;
    expectedConfirmation: string | null;
    cancelledAt: Date | null;
    operationKind: ClinicAccountSplitOperationKind;
    preparationRevision: number;
    sourceLocationId: string | null;
    destinationSiteSlug: string | null;
  };
  source: {
    id: string;
    name: string;
    slug: string;
    commercialPlan: CommercialPlan | null;
    extras: AllowanceAmounts;
    siteAllowance: number;
    locationAllowance: number;
    capacityEntitlementActive: boolean;
    purchasedAdditionalSiteQuantity: number | null;
    purchasedAdditionalLocationQuantity: number | null;
    extraSiteAllowance: number;
    extraLocationAllowance: number;
    billingStatus: BillingStatus | null;
    access: EntitlementStatus | null;
    cancelAtPeriodEnd: boolean;
    subscriptionSchedulePresent: boolean;
    scheduledCommercialPlan: CommercialPlan | null;
    scheduledAdditionalSiteQuantity: number | null;
    scheduledCapacityEffectiveAt: Date | null;
    offeredAdditionalSiteQuantity: number | null;
    openDowngradePreparation: boolean;
    conflictingOpenPreparation: boolean;
  };
  sites: Array<{
    id: string;
    name: string;
    slug: string;
    displayName: string;
    active: boolean;
    isPrimary: boolean;
    logoUrl: string | null;
    darkLogoUrl: string | null;
    faviconUrl: string | null;
    primaryColor: string | null;
    accentColor: string | null;
  }>;
  locations: Array<{
    id: string;
    clinicSiteId: string;
    name: string;
    slug: string | null;
    displayName: string;
    active: boolean;
    servesSiteRoot: boolean;
    isPrimary: boolean;
  }>;
  decisions: Array<{
    clinicSiteId: string;
    decision: ClinicAccountSplitSiteDecisionKind;
  }>;
  memberships: Array<{
    userId: string;
    role: ClinicMembershipRole;
    active: boolean;
    name: string | null;
    email: string;
    platformRole: PlatformRole;
  }>;
  selections: Array<{
    userId: string;
    keepOnSource: boolean;
    grantOnDestination: boolean;
    destinationRole: ClinicMembershipRole;
  }>;
  invitations: Array<{
    id: string;
    userId: string;
    email: string;
    role: ClinicMembershipRole | null;
  }>;
  guides: Array<{
    id: string;
    title: string;
    publicSlug: string;
    status: PracticeGuideStatus;
    guideTemplateId: string | null;
    pinnedRevisionId: string | null;
    sourceGuideTemplateId: string | null;
    adaptedAt: Date | null;
    copiedFromPracticeGuideId: string | null;
    downgradeRetainedAt: Date | null;
    isEnabled: boolean;
    pinnedRevisionStatus: "DRAFT" | "PUBLISHED" | null;
    overrideCount: number;
    additionCount: number;
    revisions: Array<{
      id: string;
      version: number;
      status: "DRAFT" | "PUBLISHED";
      createdByUserId: string | null;
      reviewAttestedByUserId: string | null;
      sectionCount: number;
    }>;
  }>;
  placements: Array<{
    id: string;
    practiceGuideId: string;
    locationId: string;
    clinicId: string;
    guideClinicId: string;
    locationClinicId: string;
    siteClinicId: string;
    publicSlug: string;
    isEnabled: boolean;
    publishedPracticeGuideRevisionId: string | null;
    publishedRevisionPracticeGuideId: string | null;
  }>;
  destination: {
    clinic: {
      id: string;
      name: string;
      slug: string;
      siteCount: number;
      locationCount: number;
    } | null;
    entitlement: {
      commercialPlan: CommercialPlan | null;
      billingInterval: BillingInterval | null;
      billingStatus: BillingStatus;
      access: EntitlementStatus;
      cancelAtPeriodEnd: boolean;
      scheduledCommercialPlan: CommercialPlan | null;
      siteAllowance: number;
      locationAllowance: number;
      capacityEntitlementActive?: boolean;
      purchasedAdditionalSiteQuantity?: number | null;
      purchasedAdditionalLocationQuantity?: number | null;
      extraSiteAllowance?: number | null;
      extraLocationAllowance?: number | null;
      extraTeamMemberAllowance: number;
      extraCustomGuideAllowance: number;
      extraTemplateAdaptationAllowance: number;
      commercialArrangement?: CommercialArrangement;
    } | null;
    memberships: Array<{
      userId: string;
      role: ClinicMembershipRole;
      active: boolean;
      platformRole: PlatformRole;
    }>;
  };
  brandingAssets: Array<{
    sourceStorageKey: string;
    destinationStorageKey: string;
  }>;
  /** ClinicSite currently using destinationSiteSlug, if any. */
  destinationSlugSiteId: string | null;
  /** Clinic.slug currently using destinationSiteSlug, if any. */
  destinationSlugClinicId: string | null;
  /**
   * Destination Account users with the current billing Terms acceptance.
   * The same clinic, user, version, and source that Checkout requires.
   */
  destinationTermsAcceptedUserIds: string[];
  guideMaps: Array<{
    sourcePracticeGuideId: string;
    destinationPracticeGuideId: string | null;
  }>;
  /**
   * Populated for every preparation. Empty sites and guides when no
   * destination Account is selected. SITE_TO_EXISTING_GROUP reads this.
   * Other operations ignore it.
   */
  destinationDetail: {
    sites: Array<{
      id: string;
      slug: string;
      displayName: string;
      active: boolean;
      isPrimary: boolean;
    }>;
    locations: Array<{
      id: string;
      clinicSiteId: string;
      active: boolean;
    }>;
    guides: AccountSplitSnapshot["guides"];
    subscriptionSchedulePresent: boolean;
    scheduledAdditionalSiteQuantity: number | null;
    scheduledCapacityEffectiveAt: Date | null;
    offeredAdditionalSiteQuantity: number | null;
    openDowngradePreparation: boolean;
    conflictingOpenPreparation: boolean;
  };
};

export type CanonicalRetargetDecision = {
  sourceGuideId: string;
  sourceTitle: string;
  guideTemplateId: string;
  pinnedRevisionId: string | null;
  pinnedRevisionStatus: "DRAFT" | "PUBLISHED" | null;
  destinationGuideId: string | null;
  destinationTitle: string | null;
  enabledOnMovingSite: boolean;
  disabledOnMovingSite: boolean;
  compatible: boolean;
  confirmed: boolean;
  reason: string | null;
};

export type ExistingGroupMove = {
  movingSiteId: string | null;
  movingSiteIsPrimary: boolean;
  destinationPrimarySiteId: string | null;
  destinationActiveSites: number;
  destinationActiveLocations: number;
  postMoveActiveSites: number;
  postMoveActiveLocations: number;
  siteAllowance: number;
  locationAllowance: number;
  guidesToCopy: number;
  guidesToRetarget: number;
  canonicalDecisions: CanonicalRetargetDecision[];
};

export type AccountSplitAssessment = {
  status: ClinicAccountSplitStatus;
  preparationComplete: boolean;
  billing: SplitBillingPhase;
  blockers: AccountSplitBlocker[];
  practiceDowngradeReady: boolean;
  practiceDowngradeBlockers: AccountSplitBlocker[];
  primaryPromotion: {
    required: boolean;
    currentPrimarySite: AccountSplitSnapshot["sites"][number] | null;
    futurePrimarySite: AccountSplitSnapshot["sites"][number] | null;
    message: string | null;
  };
  warnings: AccountSplitWarning[];
  confirmationPhrase: string | null;
  keptSite: AccountSplitSnapshot["sites"][number] | null;
  splitSite: AccountSplitSnapshot["sites"][number] | null;
  sourcePreview: {
    activeSiteCount: number;
    activeLocationCount: number;
    siteLimit: number;
    locationLimit: number;
    teamUsed: number;
    teamLimit: number;
    customGuides: number;
    adaptedGuides: number;
    combinedGuides: number;
    customGuideLimit: number;
    adaptedGuideLimit: number;
    combinedGuideLimit: number;
    guidesLosingAllPlacements: Array<{ id: string; title: string }>;
    deactivatedSiteIds: string[];
    retainedSiteIds: string[];
    activeSites: Array<{ id: string; displayName: string; slug: string }>;
    planRemains: "GROUP" | "PRACTICE";
  };
  destinationPreview: {
    accountName: string;
    compatibilitySlug: string | null;
    compatibilitySlugNote: string;
    siteHostname: string | null;
    brandingUnchanged: boolean;
    locations: Array<{
      id: string;
      name: string;
      slug: string | null;
      servesSiteRoot: boolean;
      active: boolean;
    }>;
    publicUrls: Array<{ placementId: string; hostname: string; path: string }>;
    publicUrlsUnchanged: boolean;
    publicUrlStatement: typeof PUBLIC_URLS_UNCHANGED_STATEMENT | null;
    guideCount: number;
    revisionCount: number;
    draftRevisionCount: number;
    publishedRevisionCount: number;
    sectionCount: number;
    overrideCount: number;
    additionCount: number;
    placementCount: number;
    pinnedPlacementCount: number;
    templateBackedGuideCount: number;
    sharedWithKeptSiteCount: number;
    guides: Array<{
      id: string;
      title: string;
      publicSlug: string;
      templateBacked: boolean;
      guideTemplateId: string | null;
      pinnedTemplateRevisionId: string | null;
      sharedWithKeptSite: boolean;
      draftRevisionIds: string[];
      publishedRevisionIds: string[];
      sectionCount: number;
      overrideCount: number;
      additionCount: number;
      historicalUserIds: string[];
      placementPins: Array<{
        placementId: string;
        locationId: string;
        publishedRevisionId: string | null;
        enabled: boolean;
      }>;
      destinationCopiedFromPracticeGuideId: null;
    }>;
    staff: Array<{
      userId: string;
      email: string;
      name: string | null;
      destinationRole: ClinicMembershipRole;
    }>;
    plan: GovernedCommercialPlan | null;
    interval: BillingInterval;
    siteUsed: number;
    siteLimit: number;
    locationUsed: number;
    locationLimit: number;
    teamUsed: number;
    teamLimit: number;
  };
  /**
   * Set for LOCATION_TO_NEW_ACCOUNT. Site splits leave this null so they do
   * not pass through location-promotion assumptions.
   */
  locationMove: {
    sourceSiteId: string;
    location: AccountSplitSnapshot["locations"][number] | null;
    oldSlug: string | null;
    destinationSiteSlug: string | null;
    rootRetained: boolean;
    departingLocationWasPrimary: boolean;
    sourceRootBecomesPrimary: boolean;
  } | null;
  /**
   * Set for SITE_TO_EXISTING_GROUP. Other operations leave this null.
   */
  existingGroup: ExistingGroupMove | null;
};

export function splitConfirmationPhrase(siteSlug: string): string {
  return `split ${siteSlug}`;
}

/**
 * Typed split confirmation. Surrounding whitespace is ignored.
 * The phrase must otherwise match `split {siteSlug}` exactly.
 * Account names, site display names, and any other slug are rejected.
 */
export function normalizeSplitConfirmation(value: string): string {
  return value.trim();
}

export function confirmationMatchesSplitSite(
  siteSlug: string,
  typed: string
): boolean {
  return (
    normalizeSplitConfirmation(typed) === splitConfirmationPhrase(siteSlug)
  );
}

/**
 * Practice downgrade readiness from the source Account after a split has
 * already moved the Site. Does not change a plan, entitlement, or guide.
 */
export function assessExecutedPracticeDowngrade(input: {
  activeSiteCount: number;
  activeLocationCount: number;
  locationAllowance: number;
  teamUsed: number;
  extras: AllowanceAmounts;
  customGuides: number;
  adaptedGuides: number;
  guidesLosingAllPlacements: number;
}): { ready: boolean; blockers: AccountSplitBlocker[] } {
  const blockers: AccountSplitBlocker[] = [];
  const limits = effectiveAllowances(
    PLAN_ENTITLEMENT_POLICIES.PRACTICE.base,
    input.extras
  );
  const locationLimit = Math.max(input.locationAllowance, 1);
  const retainedActiveSiteCount = Math.max(input.activeSiteCount - 1, 0);
  if (retainedActiveSiteCount > 0) {
    blockers.push({
      code: "source_active_site_count",
      message: `Source Account will remain Group because ${retainedActiveSiteCount} additional active Clinic Site${retainedActiveSiteCount === 1 ? " is" : "s are"} retained for a later split.`,
    });
  } else if (input.activeSiteCount > 1) {
    blockers.push({
      code: "source_active_site_count",
      message: `Practice allows 1 active Clinic Site. This split would leave ${input.activeSiteCount}.`,
    });
  }
  if (input.activeLocationCount > locationLimit) {
    blockers.push({
      code: "source_active_location_count",
      message: `Practice location allowance is ${locationLimit}. This split would leave ${input.activeLocationCount} active locations.`,
    });
  }
  if (input.teamUsed > limits.teamMembers) {
    blockers.push({
      code: "source_team_count",
      message: `Practice allows ${limits.teamMembers} team places. This split would leave ${input.teamUsed}.`,
    });
  }
  const combined = input.customGuides + input.adaptedGuides;
  if (input.customGuides > limits.customGuides) {
    blockers.push({
      code: "source_custom_guide_allowance",
      message: `Practice allows ${limits.customGuides} custom guides. ${input.customGuides} would remain on the source Account.`,
    });
  }
  if (input.adaptedGuides > limits.templateAdaptations) {
    blockers.push({
      code: "source_adapted_guide_allowance",
      message: `Practice allows ${limits.templateAdaptations} adapted templates. ${input.adaptedGuides} would remain on the source Account.`,
    });
  }
  if (combined > limits.combinedClinicOwnedGuides) {
    blockers.push({
      code: "source_combined_guide_allowance",
      message: `Practice allows ${limits.combinedClinicOwnedGuides} clinic-owned guides. ${combined} would remain on the source Account.`,
    });
  }
  if (input.guidesLosingAllPlacements > 0) {
    blockers.push({
      code: "guides_lose_all_placements",
      message: `${input.guidesLosingAllPlacements} source guide${input.guidesLosingAllPlacements === 1 ? "" : "s"} would remain with no placements. Guides are not deleted automatically.`,
    });
  }
  const ordered = ACCOUNT_SPLIT_BLOCKER_CODES.flatMap((code) =>
    blockers.filter((blocker) => blocker.code === code)
  );
  return { ready: ordered.length === 0, blockers: ordered };
}

export function isTerminalAccountSplitStatus(
  status: ClinicAccountSplitStatus
): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}

/**
 * Projects the preparation status from the current snapshot.
 * COMPLETED is never produced. CANCELLED and COMPLETED stay put.
 * Any earlier status may move forward or backward.
 */
export function projectAccountSplitStatus(input: {
  current: ClinicAccountSplitStatus;
  preparationComplete: boolean;
  billingPhase: SplitBillingPhase["phase"];
  ready: boolean;
}): ClinicAccountSplitStatus {
  if (input.current === "CANCELLED" || input.current === "COMPLETED") {
    return input.current;
  }
  if (!input.preparationComplete) {
    return "DRAFT";
  }
  if (input.billingPhase === "awaiting_payment") {
    return "AWAITING_PAYMENT";
  }
  if (input.billingPhase === "ready" && input.ready) {
    return "READY_TO_EXECUTE";
  }
  if (input.billingPhase === "ready") {
    return "BILLING_READY";
  }
  return "DESTINATION_READY";
}

export function assessAccountSplit(
  snapshot: AccountSplitSnapshot
): AccountSplitAssessment {
  const blockers: AccountSplitBlocker[] = [];
  const practiceDowngradeBlockers: AccountSplitBlocker[] = [];
  const warnings: AccountSplitWarning[] = [
    {
      code: "source_plan_conversion_deferred",
      message:
        "Source Group billing is not converted to Practice in this preparation. Practice is the preview target only.",
    },
  ];

  const keptSite =
    snapshot.sites.find(
      (site) => site.id === snapshot.preparation.keptClinicSiteId
    ) ?? null;
  const otherSites = snapshot.sites.filter((site) => site.id !== keptSite?.id);
  const decisionBySite = new Map(
    snapshot.decisions.map((decision) => [
      decision.clinicSiteId,
      decision.decision,
    ])
  );
  const unresolvedSites = otherSites.filter(
    (site) => !decisionBySite.has(site.id)
  );
  const decisionsOutsideSites = snapshot.decisions.filter(
    (decision) => !otherSites.some((site) => site.id === decision.clinicSiteId)
  );
  const splitSites = otherSites.filter(
    (site) => decisionBySite.get(site.id) === "SPLIT"
  );
  const splitSite = splitSites.length === 1 ? splitSites[0] : null;
  const deactivateIds = otherSites
    .filter((site) => decisionBySite.get(site.id) === "DEACTIVATE")
    .map((site) => site.id);
  const retainedSites = otherSites.filter(
    (site) => decisionBySite.get(site.id) === "RETAIN_ON_SOURCE"
  );
  const retainIds = retainedSites.map((site) => site.id);
  const retainedActiveSites = retainedSites.filter((site) => site.active);

  if (
    !snapshot.preparation.destinationClinicId ||
    !snapshot.destination.clinic
  ) {
    blockers.push({
      code: "shell_missing",
      message:
        "Create the destination shell Account before this split can proceed.",
    });
  } else if (snapshot.destination.clinic.siteCount !== 0) {
    blockers.push({
      code: "destination_shell_has_sites",
      message: "The destination shell must not contain a Site.",
    });
  }

  if (unresolvedSites.length > 0 || decisionsOutsideSites.length > 0) {
    blockers.push({
      code: "unresolved_site_decisions",
      message:
        "Choose Split, Deactivate, or Retain for every Clinic Site that is not kept.",
    });
  }
  if (splitSites.length !== 1) {
    blockers.push({
      code: "split_site_count",
      message:
        "This preparation moves exactly one Clinic Site onto one new Account.",
    });
  } else if (splitSite && !splitSite.active) {
    blockers.push({
      code: "split_site_inactive",
      message: "The Clinic Site to move must be active.",
    });
  }
  if (!keptSite) {
    blockers.push({
      code: "kept_site_missing",
      message:
        "The Clinic Site chosen to stay on the source Account is missing.",
    });
  } else if (!keptSite.active) {
    blockers.push({
      code: "kept_site_inactive",
      message:
        "The Clinic Site chosen to stay on the source Account must be active.",
    });
  }

  const currentPrimary = snapshot.sites.find((site) => site.isPrimary) ?? null;
  const primaryRemains =
    currentPrimary?.active === true &&
    currentPrimary.id !== splitSite?.id &&
    !deactivateIds.includes(currentPrimary.id);
  const futurePrimary = primaryRemains ? currentPrimary : keptSite;
  const primaryPromotionRequired = Boolean(
    futurePrimary && currentPrimary && futurePrimary.id !== currentPrimary.id
  );
  const primaryPromotion = {
    required: primaryPromotionRequired,
    currentPrimarySite: currentPrimary,
    futurePrimarySite: futurePrimary,
    message:
      primaryPromotionRequired && futurePrimary
        ? `${futurePrimary.displayName} will become the source Account primary Clinic Site during execution.`
        : null,
  };

  const removedSiteId = splitSite?.id ?? null;
  const activeRemainingSites = snapshot.sites.filter((site) => {
    if (removedSiteId && site.id === removedSiteId) {
      return false;
    }
    if (deactivateIds.includes(site.id)) {
      return false;
    }
    return site.active;
  });
  const activeRemainingSiteIds = new Set(
    activeRemainingSites.map((site) => site.id)
  );
  const activeRemainingLocations = snapshot.locations.filter(
    (location) =>
      location.active && activeRemainingSiteIds.has(location.clinicSiteId)
  );
  const sitesMissingRoot = activeRemainingSites.filter(
    (site) =>
      !snapshot.locations.some(
        (location) =>
          location.clinicSiteId === site.id &&
          location.servesSiteRoot &&
          location.active
      )
  );
  if (sitesMissingRoot.length > 0) {
    blockers.push({
      code: "missing_root_location",
      message: sitesMissingRoot
        .map((site) =>
          futurePrimary && site.id === futurePrimary.id
            ? `${site.displayName} needs an active root location before it can be the source primary Clinic Site.`
            : `${site.displayName} needs an active root location to remain on the source Account.`
        )
        .join(" "),
    });
  }
  const sourceLimits = effectiveAllowances(
    PLAN_ENTITLEMENT_POLICIES.PRACTICE.base,
    snapshot.source.extras
  );
  const sourceLocationLimit = accountSplitSourceAllowance(
    snapshot.source
  ).locationAllowance;
  if (retainedActiveSites.length > 0) {
    practiceDowngradeBlockers.push({
      code: "source_active_site_count",
      message: `Source Account will remain Group because ${retainedActiveSites.length} additional active Clinic Site${retainedActiveSites.length === 1 ? " is" : "s are"} retained for a later split.`,
    });
  } else if (activeRemainingSites.length > 1) {
    practiceDowngradeBlockers.push({
      code: "source_active_site_count",
      message: `Practice allows 1 active Clinic Site. This split would leave ${activeRemainingSites.length}.`,
    });
  }
  if (activeRemainingLocations.length > sourceLocationLimit) {
    practiceDowngradeBlockers.push({
      code: "source_active_location_count",
      message: `Practice location allowance is ${sourceLocationLimit}. This split would leave ${activeRemainingLocations.length} active locations.`,
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
  const staying = activeMembers.filter((membership) => {
    const selection = selectionByUser.get(membership.userId);
    return !selection || selection.keepOnSource;
  });
  const stayingIds = new Set(staying.map((membership) => membership.userId));
  const pendingInvites = snapshot.invitations.filter(
    (invitation) => !stayingIds.has(invitation.userId)
  );
  const sourceTeamUsed = staying.length + pendingInvites.length;
  if (sourceTeamUsed > sourceLimits.teamMembers) {
    practiceDowngradeBlockers.push({
      code: "source_team_count",
      message: `Practice allows ${sourceLimits.teamMembers} team places. This split would leave ${sourceTeamUsed}.`,
    });
  }

  const remainingGuides = snapshot.guides.filter(
    (guide) => guide.downgradeRetainedAt === null
  );
  const sourceCustom = remainingGuides.filter((guide) =>
    isOriginalCustomGuide(guide)
  ).length;
  const sourceAdapted = remainingGuides.filter((guide) =>
    isAdaptedTemplateGuide(guide)
  ).length;
  const sourceCombined = sourceCustom + sourceAdapted;
  if (sourceCustom > sourceLimits.customGuides) {
    practiceDowngradeBlockers.push({
      code: "source_custom_guide_allowance",
      message: `Practice allows ${sourceLimits.customGuides} custom guides. ${sourceCustom} would remain on the source Account.`,
    });
  }
  if (sourceAdapted > sourceLimits.templateAdaptations) {
    practiceDowngradeBlockers.push({
      code: "source_adapted_guide_allowance",
      message: `Practice allows ${sourceLimits.templateAdaptations} adapted templates. ${sourceAdapted} would remain on the source Account.`,
    });
  }
  if (sourceCombined > sourceLimits.combinedClinicOwnedGuides) {
    practiceDowngradeBlockers.push({
      code: "source_combined_guide_allowance",
      message: `Practice allows ${sourceLimits.combinedClinicOwnedGuides} clinic-owned guides. ${sourceCombined} would remain on the source Account.`,
    });
  }

  const splitLocationIds = new Set(
    splitSite
      ? snapshot.locations
          .filter((location) => location.clinicSiteId === splitSite.id)
          .map((location) => location.id)
      : []
  );
  const guidesLosingAllPlacements = splitSite
    ? remainingGuides.filter((guide) => {
        const own = snapshot.placements.filter(
          (placement) => placement.practiceGuideId === guide.id
        );
        const onSplit = own.filter((placement) =>
          splitLocationIds.has(placement.locationId)
        );
        const remaining = own.filter(
          (placement) => !splitLocationIds.has(placement.locationId)
        );
        return onSplit.length > 0 && remaining.length === 0;
      })
    : [];
  if (guidesLosingAllPlacements.length > 0) {
    practiceDowngradeBlockers.push({
      code: "guides_lose_all_placements",
      message: `${guidesLosingAllPlacements.length} source guide${guidesLosingAllPlacements.length === 1 ? "" : "s"} would remain with no placements. Guides are not deleted automatically.`,
    });
  }

  if (hasInconsistentPlacements(snapshot)) {
    blockers.push({
      code: "inconsistent_placements",
      message:
        "A placement does not match its guide, location, or root address.",
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
      message: DESTINATION_ADMIN_BLOCKER_MESSAGE,
    });
  }
  const roleConflict = destinationMembershipRoleConflict(snapshot);
  if (roleConflict) {
    blockers.push(roleConflict);
  }

  const movingLocations = splitSite
    ? snapshot.locations.filter(
        (location) => location.clinicSiteId === splitSite.id
      )
    : [];
  const movingActiveLocations = movingLocations.filter(
    (location) => location.active && splitSite?.active
  );
  const destinationPlan = governedDestinationPlan(
    snapshot.preparation.destinationPlan
  );
  const destinationExtras = destinationExtrasFrom(snapshot);
  const destinationGuideLimits = destinationPlan
    ? effectiveAllowances(
        PLAN_ENTITLEMENT_POLICIES[destinationPlan].base,
        destinationExtras
      )
    : null;
  const destinationSiteAllowance = accountSplitDestinationAllowance({
    plan: destinationPlan,
    entitlement: snapshot.destination.entitlement,
  });
  if (
    splitSite &&
    movingActiveLocations.length > destinationSiteAllowance.locationAllowance
  ) {
    blockers.push({
      code: "destination_location_allowance",
      message: `The destination plan allows ${destinationSiteAllowance.locationAllowance} active location${destinationSiteAllowance.locationAllowance === 1 ? "" : "s"}. The moving Clinic Site has ${movingActiveLocations.length}.`,
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
  if (
    destinationGuideLimits &&
    destinationStaff.length > destinationGuideLimits.teamMembers
  ) {
    blockers.push({
      code: "destination_team_count",
      message: `The destination plan allows ${destinationGuideLimits.teamMembers} team members. ${destinationStaff.length} would join.`,
    });
  }

  const copyGuides = splitSite
    ? guidesWithPlacementsOn(snapshot, splitLocationIds)
    : [];
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

  const billing = classifyDestinationBilling({
    entitlement: snapshot.destination.entitlement,
    plan: destinationPlan,
    interval: snapshot.preparation.destinationBillingInterval,
    activeLocations: movingActiveLocations.length,
  });
  if (billing.phase !== "ready") {
    blockers.push({
      code: "billing_not_ready",
      message: billingMessage(billing),
    });
  }

  if (snapshot.preparation.operationKind !== "SITE_TO_NEW_ACCOUNT") {
    blockers.push({
      code: "operation_not_enabled",
      message: "This structural operation is not available.",
    });
  }
  const branding = planSplitSiteBranding({
    sourceClinicId: snapshot.source.id,
    destinationClinicId: snapshot.preparation.destinationClinicId,
    site: splitSite,
    preparationId: snapshot.preparation.id,
    assets: snapshot.brandingAssets,
  });
  if (splitSite && !branding.ready) {
    blockers.push({
      code: "branding_assets_not_ready",
      message:
        "Prepare destination-owned branding for the moving Clinic Site before execution.",
    });
  }
  if (snapshot.source.commercialPlan !== "GROUP") {
    blockers.push({
      code: "source_plan_mismatch",
      message:
        "This split moves one Clinic Site off a Group Account. The source Account is no longer Group.",
    });
  }
  if (snapshot.source.subscriptionSchedulePresent) {
    blockers.push({
      code: "source_subscription_schedule",
      message:
        "The source Account has a subscription schedule. Clear it before this split.",
    });
  }
  if (snapshot.source.scheduledCommercialPlan) {
    blockers.push({
      code: "source_scheduled_plan",
      message:
        "The source Account has a scheduled plan change. Clear it before this split.",
    });
  }
  if (
    snapshot.source.scheduledAdditionalSiteQuantity !== null ||
    snapshot.source.scheduledCapacityEffectiveAt !== null
  ) {
    blockers.push({
      code: "source_scheduled_capacity",
      message:
        "The source Account has a scheduled capacity change. Clear it before this split.",
    });
  }
  if (snapshot.source.openDowngradePreparation) {
    blockers.push({
      code: "source_downgrade_preparation",
      message:
        "The source Account has an open downgrade preparation. Finish or cancel it before this split.",
    });
  }
  if (snapshot.source.conflictingOpenPreparation) {
    blockers.push({
      code: "source_conflicting_preparation",
      message: "This Account already has another open structural preparation.",
    });
  }
  if (snapshot.source.billingStatus === "PAST_DUE") {
    warnings.push({
      code: "source_past_due",
      message:
        "Source billing is past due. This does not block the split. Destination billing still has to be active.",
    });
  }
  if (
    snapshot.source.cancelAtPeriodEnd ||
    snapshot.source.billingStatus === "CANCEL_AT_PERIOD_END"
  ) {
    warnings.push({
      code: "source_cancel_at_period_end",
      message:
        "Source billing is set to cancel at period end. This does not block the split.",
    });
  }
  if (snapshot.source.access === "RESTRICTED") {
    warnings.push({
      code: "source_restricted",
      message:
        "Source product access is restricted. This does not block the split.",
    });
  }
  if (snapshot.source.billingStatus === "UNPAID") {
    warnings.push({
      code: "source_unpaid",
      message: "Source billing is unpaid. This does not block the split.",
    });
  }
  if (
    snapshot.source.billingStatus === "ENDED" ||
    snapshot.source.access === "ENDED"
  ) {
    warnings.push({
      code: "source_ended",
      message: "Source billing has ended. This does not block the split.",
    });
  }

  if (snapshot.invitations.length > 0) {
    warnings.push({
      code: "outstanding_source_invitations",
      message: `${snapshot.invitations.length} outstanding source invitation${snapshot.invitations.length === 1 ? "" : "s"} stay on the source Account and are not moved.`,
    });
  }
  const sharedCount = copyGuides.filter((guide) =>
    sharedWithKeptSite(snapshot, guide.id, keptSite?.id ?? null)
  ).length;
  if (sharedCount > 0) {
    warnings.push({
      code: "guides_shared_with_kept_site",
      message: `${sharedCount} guide${sharedCount === 1 ? "" : "s"} placed on the moving Clinic Site ${sharedCount === 1 ? "is" : "are"} also placed on the Clinic Site that stays. The source guide remains. The destination would receive a copy.`,
    });
  }
  const inactiveRemaining = snapshot.sites.filter(
    (site) => !site.active && site.id !== removedSiteId
  );
  if (inactiveRemaining.length > 0) {
    warnings.push({
      code: "inactive_sites_remain",
      message:
        "Historical inactive Clinic Sites can stay on the source Account. Practice allows one active Clinic Site, not one Clinic Site row.",
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

  const preparationComplete = !blockers.some((blocker) =>
    STRUCTURAL_BLOCKERS.has(blocker.code)
  );
  const decisionsComplete =
    unresolvedSites.length === 0 &&
    decisionsOutsideSites.length === 0 &&
    splitSites.length === 1 &&
    Boolean(keptSite?.active);
  const practiceDowngradeReady =
    decisionsComplete && practiceDowngradeBlockers.length === 0;
  const ready =
    preparationComplete && billing.phase === "ready" && blockers.length === 0;
  const status = projectAccountSplitStatus({
    current: snapshot.preparation.status,
    preparationComplete,
    billingPhase: billing.phase,
    ready,
  });

  const guidePreviews = copyGuides.map((guide) =>
    describeGuideCopy(snapshot, guide, splitLocationIds, keptSite?.id ?? null)
  );
  const publicUrls = splitSite
    ? movingLocations.flatMap((location) =>
        snapshot.placements
          .filter((placement) => placement.locationId === location.id)
          .map((placement) => ({
            placementId: placement.id,
            hostname: splitSite.slug,
            path: placementPath(location, placement.publicSlug),
          }))
      )
    : [];
  const movingInconsistent = splitSite
    ? hasInconsistentPlacements(snapshot, splitSite.id)
    : false;
  const publicUrlsUnchanged = Boolean(splitSite?.slug) && !movingInconsistent;

  const orderedBlockers = ACCOUNT_SPLIT_BLOCKER_CODES.flatMap((code) =>
    blockers.filter((blocker) => blocker.code === code)
  );
  const orderedPracticeBlockers = ACCOUNT_SPLIT_BLOCKER_CODES.flatMap((code) =>
    practiceDowngradeBlockers.filter((blocker) => blocker.code === code)
  );

  return {
    status,
    preparationComplete,
    billing,
    blockers: orderedBlockers,
    practiceDowngradeReady,
    practiceDowngradeBlockers: orderedPracticeBlockers,
    primaryPromotion,
    warnings,
    confirmationPhrase: splitSite
      ? splitConfirmationPhrase(splitSite.slug)
      : null,
    keptSite,
    splitSite,
    sourcePreview: {
      activeSiteCount: activeRemainingSites.length,
      activeLocationCount: activeRemainingLocations.length,
      siteLimit: 1,
      locationLimit: sourceLocationLimit,
      teamUsed: sourceTeamUsed,
      teamLimit: sourceLimits.teamMembers,
      customGuides: sourceCustom,
      adaptedGuides: sourceAdapted,
      combinedGuides: sourceCombined,
      customGuideLimit: sourceLimits.customGuides,
      adaptedGuideLimit: sourceLimits.templateAdaptations,
      combinedGuideLimit: sourceLimits.combinedClinicOwnedGuides,
      guidesLosingAllPlacements: guidesLosingAllPlacements.map((guide) => ({
        id: guide.id,
        title: guide.title,
      })),
      deactivatedSiteIds: deactivateIds,
      retainedSiteIds: retainIds,
      activeSites: activeRemainingSites.map((site) => ({
        id: site.id,
        displayName: site.displayName,
        slug: site.slug,
      })),
      planRemains: "GROUP",
    },
    locationMove: null,
    existingGroup: null,
    destinationPreview: {
      accountName:
        snapshot.destination.clinic?.name ??
        splitSite?.displayName ??
        "Destination account",
      compatibilitySlug: snapshot.destination.clinic?.slug ?? null,
      compatibilitySlugNote:
        "This compatibility slug is not a patient hostname. Execution replaces it with the moved site slug.",
      siteHostname: splitSite?.slug ?? null,
      brandingUnchanged: true,
      locations: movingLocations.map((location) => ({
        id: location.id,
        name: location.displayName,
        slug: location.slug,
        servesSiteRoot: location.servesSiteRoot,
        active: location.active,
      })),
      publicUrls,
      publicUrlsUnchanged,
      publicUrlStatement: publicUrlsUnchanged
        ? PUBLIC_URLS_UNCHANGED_STATEMENT
        : null,
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
      siteUsed: splitSite ? 1 : 0,
      siteLimit: destinationSiteAllowance.siteAllowance,
      locationUsed: movingActiveLocations.length,
      locationLimit: destinationSiteAllowance.locationAllowance,
      teamUsed: destinationStaff.length,
      teamLimit: destinationGuideLimits?.teamMembers ?? 0,
    },
  };
}

export function accountSplitSourceAllowance(
  source: AccountSplitSnapshot["source"]
): SiteLocationAllowance {
  return effectiveSiteLocationAllowance({
    entitlement: {
      commercialPlan: source.commercialPlan,
      siteAllowance: source.siteAllowance,
      locationAllowance: source.locationAllowance,
      capacityEntitlementActive: source.capacityEntitlementActive,
      purchasedAdditionalSiteQuantity: source.purchasedAdditionalSiteQuantity,
      purchasedAdditionalLocationQuantity:
        source.purchasedAdditionalLocationQuantity,
      extraSiteAllowance: source.extraSiteAllowance,
      extraLocationAllowance: source.extraLocationAllowance,
    },
  });
}

export function accountSplitDestinationAllowance(input: {
  plan: GovernedCommercialPlan | null;
  entitlement: AccountSplitSnapshot["destination"]["entitlement"];
}): SiteLocationAllowance {
  return effectiveSiteLocationAllowance({
    entitlement: input.entitlement
      ? {
          commercialPlan: input.plan,
          siteAllowance: input.entitlement.siteAllowance,
          locationAllowance: input.entitlement.locationAllowance,
          capacityEntitlementActive:
            input.entitlement.capacityEntitlementActive ??
            input.entitlement.access === "ACTIVE",
          purchasedAdditionalSiteQuantity:
            input.entitlement.purchasedAdditionalSiteQuantity,
          purchasedAdditionalLocationQuantity:
            input.entitlement.purchasedAdditionalLocationQuantity,
          extraSiteAllowance: input.entitlement.extraSiteAllowance,
          extraLocationAllowance: input.entitlement.extraLocationAllowance,
        }
      : input.plan
        ? {
            commercialPlan: input.plan,
            siteAllowance: 1,
            locationAllowance: 1,
          }
        : null,
  });
}

function governedDestinationPlan(
  plan: CommercialPlan
): GovernedCommercialPlan | null {
  if (plan === "ESSENTIAL" || plan === "PRACTICE") {
    return plan;
  }
  return null;
}

function destinationExtrasFrom(
  snapshot: AccountSplitSnapshot
): AllowanceAmounts {
  const entitlement = snapshot.destination.entitlement;
  if (!entitlement) {
    return ZERO_ALLOWANCE_EXTRAS;
  }
  return {
    teamMembers: entitlement.extraTeamMemberAllowance,
    customGuides: entitlement.extraCustomGuideAllowance,
    templateAdaptations: entitlement.extraTemplateAdaptationAllowance,
  };
}

export function classifyDestinationBilling(input: {
  entitlement: AccountSplitSnapshot["destination"]["entitlement"];
  plan: GovernedCommercialPlan | null;
  interval: BillingInterval;
  activeLocations: number;
}): SplitBillingPhase {
  const entitlement = input.entitlement;
  if (!entitlement || !input.plan) {
    return { phase: "not_started" };
  }
  if (entitlement.commercialArrangement === "COMPLIMENTARY") {
    return {
      phase: "not_ready",
      reasons: ["Complimentary access cannot satisfy paid billing readiness."],
    };
  }
  if (
    entitlement.access === "PENDING" ||
    entitlement.billingStatus === "OFFER_PREPARED" ||
    entitlement.billingStatus === "PAYMENT_PENDING"
  ) {
    return { phase: "awaiting_payment" };
  }

  const reasons: string[] = [];
  if (entitlement.access !== "ACTIVE") {
    reasons.push("Entitlement is not active.");
  }
  if (entitlement.billingStatus !== "ACTIVE") {
    reasons.push("Billing is not active.");
  }
  if (entitlement.commercialPlan !== input.plan) {
    reasons.push("Destination plan does not match the preparation.");
  }
  if (entitlement.billingInterval !== input.interval) {
    reasons.push(
      "Destination billing interval does not match the preparation."
    );
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
  const allowance = accountSplitDestinationAllowance({
    plan: input.plan,
    entitlement,
  });
  if (allowance.siteAllowance < 1) {
    reasons.push("Destination Clinic Site allowance is insufficient.");
  }
  if (allowance.locationAllowance < input.activeLocations) {
    reasons.push(
      "Destination Location allowance is insufficient for the Clinic Site that would move."
    );
  }
  if (reasons.length > 0) {
    return { phase: "not_ready", reasons };
  }
  return { phase: "ready" };
}

function billingMessage(billing: SplitBillingPhase): string {
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

function guidesWithPlacementsOn(
  snapshot: AccountSplitSnapshot,
  locationIds: Set<string>
) {
  const guideIds = new Set(
    snapshot.placements
      .filter((placement) => locationIds.has(placement.locationId))
      .map((placement) => placement.practiceGuideId)
  );
  return snapshot.guides.filter((guide) => guideIds.has(guide.id));
}

function sharedWithKeptSite(
  snapshot: AccountSplitSnapshot,
  guideId: string,
  keptSiteId: string | null
): boolean {
  if (!keptSiteId) {
    return false;
  }
  const keptLocationIds = new Set(
    snapshot.locations
      .filter((location) => location.clinicSiteId === keptSiteId)
      .map((location) => location.id)
  );
  return snapshot.placements.some(
    (placement) =>
      placement.practiceGuideId === guideId &&
      keptLocationIds.has(placement.locationId)
  );
}

function includedRevisions(
  guide: AccountSplitSnapshot["guides"][number]
): AccountSplitSnapshot["guides"][number]["revisions"] {
  return guide.revisions.filter(
    (revision) => revision.version === 0 || revision.status === "PUBLISHED"
  );
}

function describeGuideCopy(
  snapshot: AccountSplitSnapshot,
  guide: AccountSplitSnapshot["guides"][number],
  splitLocationIds: Set<string>,
  keptSiteId: string | null
) {
  const revisions = includedRevisions(guide);
  const draftRevisionIds = revisions
    .filter((revision) => revision.version === 0)
    .map((revision) => revision.id);
  const publishedRevisionIds = revisions
    .filter(
      (revision) => revision.status === "PUBLISHED" && revision.version > 0
    )
    .map((revision) => revision.id);
  const historicalUserIds = [
    ...new Set(
      revisions.flatMap((revision) =>
        [revision.createdByUserId, revision.reviewAttestedByUserId].filter(
          (id): id is string => Boolean(id)
        )
      )
    ),
  ].sort();
  return {
    id: guide.id,
    title: guide.title,
    publicSlug: guide.publicSlug,
    templateBacked: guide.guideTemplateId !== null,
    guideTemplateId: guide.guideTemplateId,
    pinnedTemplateRevisionId: guide.pinnedRevisionId,
    sharedWithKeptSite: sharedWithKeptSite(snapshot, guide.id, keptSiteId),
    draftRevisionIds,
    publishedRevisionIds,
    sectionCount: revisions.reduce(
      (sum, revision) => sum + revision.sectionCount,
      0
    ),
    overrideCount: guide.overrideCount,
    additionCount: guide.additionCount,
    historicalUserIds,
    placementPins: snapshot.placements
      .filter(
        (placement) =>
          placement.practiceGuideId === guide.id &&
          splitLocationIds.has(placement.locationId)
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

function placementPath(
  location: { servesSiteRoot: boolean; slug: string | null },
  publicSlug: string
): string {
  if (location.servesSiteRoot || !location.slug) {
    return `/${publicSlug}`;
  }
  return `/${location.slug}/${publicSlug}`;
}

function hasInconsistentPlacements(
  snapshot: AccountSplitSnapshot,
  siteId?: string
): boolean {
  const locationIds = siteId
    ? new Set(
        snapshot.locations
          .filter((location) => location.clinicSiteId === siteId)
          .map((location) => location.id)
      )
    : null;
  const placements = snapshot.placements.filter((placement) =>
    locationIds ? locationIds.has(placement.locationId) : true
  );
  for (const placement of placements) {
    if (
      placement.clinicId !== snapshot.source.id ||
      placement.guideClinicId !== snapshot.source.id ||
      placement.locationClinicId !== snapshot.source.id ||
      placement.siteClinicId !== snapshot.source.id
    ) {
      return true;
    }
    if (
      placement.publishedPracticeGuideRevisionId &&
      placement.publishedRevisionPracticeGuideId !== placement.practiceGuideId
    ) {
      return true;
    }
  }

  const sites = siteId
    ? snapshot.sites.filter((site) => site.id === siteId)
    : snapshot.sites;
  for (const site of sites) {
    const siteLocations = snapshot.locations.filter(
      (location) => location.clinicSiteId === site.id
    );
    const root = siteLocations.find((location) => location.servesSiteRoot);
    if (!root) {
      continue;
    }
    const locationSlugs = new Set(
      siteLocations.flatMap((location) =>
        location.slug ? [location.slug] : []
      )
    );
    const collision = snapshot.placements.some(
      (placement) =>
        placement.locationId === root.id &&
        placement.isEnabled &&
        locationSlugs.has(placement.publicSlug)
    );
    if (collision) {
      return true;
    }
  }
  return false;
}
