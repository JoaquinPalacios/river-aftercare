import "server-only";

import {
  Prisma,
  type BillingInterval,
  type CommercialPlan,
} from "@prisma/client";

import {
  lockAccountSplit,
  lockAccountSplits,
  lockAccountSplitShellSlug,
} from "@/lib/account-split/locks";
import { assessPreparedAccountStructure } from "@/lib/account-split/assess";
import {
  locationDestinationSlugIssue,
  locationMoveConfirmationPhrase,
  locationMoveEligibility,
} from "@/lib/account-split/location-policy";
import {
  ACCOUNT_SPLIT_COMMERCIAL_CONFLICT_CODES,
  isTerminalAccountSplitStatus,
  splitConfirmationPhrase,
  supportedAccountSplitAction,
  unsupportedAccountSplitMessage,
} from "@/lib/account-split/policy";
import {
  allocateSplitShellSlug,
  generateSplitShellSlug,
  isSplitShellCompatibilitySlug,
} from "@/lib/account-split/shell-slug";
import { existingGroupMoveConfirmationPhrase } from "@/lib/account-split/site-to-existing-group-policy";
import { loadAccountSplitSnapshot } from "@/lib/account-split/snapshot";
import { recordAccountSplitEvent } from "@/lib/account-split/events";
import { assertNoOpenNegotiatedOffer } from "@/lib/billing/negotiated-offer";
import {
  assertClinicActive,
  CLINIC_INACTIVE_MESSAGE,
} from "@/lib/clinics/clinic-activity";
import { assertTenantSlugNotRetired } from "@/lib/clinics/retired-tenant-slug";
import { lockClinicAccountStructures } from "@/lib/entitlements/locks";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { getPrisma } from "@/lib/prisma";

const DESTINATION_PLANS = new Set<CommercialPlan>(["ESSENTIAL", "PRACTICE"]);

export async function createAccountSplitPreparation(input: {
  sourceClinicId: string;
  keptClinicSiteId: string;
  destinationPlan: CommercialPlan;
  destinationBillingInterval: BillingInterval;
  operatorUserId: string;
}): Promise<{ id: string }> {
  if (!DESTINATION_PLANS.has(input.destinationPlan)) {
    throw new ClinicPortalError(
      "Choose Essential or Practice for the destination Account.",
      "invalid"
    );
  }

  try {
    return await getPrisma().$transaction(async (tx) => {
      await lockAccountSplit(tx, input.sourceClinicId);
      const operator = await tx.user.findUnique({
        where: { id: input.operatorUserId },
        select: { platformRole: true },
      });
      if (operator?.platformRole !== "OPERATOR") {
        throw new ClinicPortalError(
          "Only a platform operator can prepare an account split.",
          "forbidden"
        );
      }
      await assertClinicActive(tx, input.sourceClinicId);
      await assertNoOpenNegotiatedOffer(tx, input.sourceClinicId);
      const clinic = await tx.clinic.findUnique({
        where: { id: input.sourceClinicId },
        select: {
          id: true,
          entitlement: { select: { commercialPlan: true } },
          sites: { select: { id: true, active: true } },
        },
      });
      if (!clinic) {
        throw new ClinicPortalError("That account was not found.", "not_found");
      }
      const activeSites = clinic.sites.filter((site) => site.active);
      const plan = clinic.entitlement?.commercialPlan ?? null;
      if (
        !supportedAccountSplitAction({
          commercialPlan: plan,
          activeClinicSiteCount: activeSites.length,
        }).available
      ) {
        throw new ClinicPortalError(
          unsupportedAccountSplitMessage(plan),
          "invalid"
        );
      }
      const kept = clinic.sites.find(
        (site) => site.id === input.keptClinicSiteId
      );
      if (!kept) {
        throw new ClinicPortalError(
          "Choose a Clinic Site that belongs to this Account.",
          "invalid"
        );
      }
      if (!kept.active) {
        throw new ClinicPortalError(
          "Choose an active Clinic Site to keep on the source Account.",
          "invalid"
        );
      }
      const open = await tx.clinicAccountSplitPreparation.findFirst({
        where: {
          sourceClinicId: clinic.id,
          status: {
            notIn: ["COMPLETED", "CANCELLED"],
          },
        },
        select: { id: true },
      });
      if (open) {
        throw new ClinicPortalError(
          "This account already has an open split preparation.",
          "conflict"
        );
      }
      const memberships = await tx.clinicMembership.findMany({
        where: { clinicId: clinic.id, active: true },
        select: { userId: true, role: true },
      });
      const created = await tx.clinicAccountSplitPreparation.create({
        data: {
          sourceClinicId: clinic.id,
          keptClinicSiteId: kept.id,
          status: "DRAFT",
          destinationPlan: input.destinationPlan,
          destinationBillingInterval: input.destinationBillingInterval,
          targetSourcePlan: "PRACTICE",
          operationKind: "SITE_TO_NEW_ACCOUNT",
          preparedByUserId: input.operatorUserId,
          staffSelections: {
            create: memberships.map((membership) => ({
              userId: membership.userId,
              keepOnSource: true,
              grantOnDestination: false,
              destinationRole: membership.role,
            })),
          },
        },
        select: { id: true },
      });
      await recordAccountSplitEvent(tx, {
        preparationId: created.id,
        kind: "PREPARATION_CREATED",
        toStatus: "DRAFT",
        actorUserId: input.operatorUserId,
        sourceClinicId: clinic.id,
        category: "preparation_created",
      });
      return created;
    });
  } catch (error) {
    throw mapKnownConflict(error);
  }
}

export async function updateAccountSplitDestinationTarget(input: {
  preparationId: string;
  destinationPlan: CommercialPlan;
  destinationBillingInterval: BillingInterval;
}): Promise<void> {
  if (!DESTINATION_PLANS.has(input.destinationPlan)) {
    throw new ClinicPortalError(
      "Choose Essential or Practice for the destination Account.",
      "invalid"
    );
  }
  await getPrisma().$transaction(async (tx) => {
    const preparation = await loadWritablePreparation(tx, input.preparationId);
    if (preparation.operationKind === "SITE_TO_EXISTING_GROUP") {
      throw new ClinicPortalError(
        "This move uses the destination Group that already exists.",
        "invalid"
      );
    }
    await lockAccountSplit(tx, preparation.sourceClinicId);
    const changed =
      preparation.destinationPlan !== input.destinationPlan ||
      preparation.destinationBillingInterval !==
        input.destinationBillingInterval;
    await tx.clinicAccountSplitPreparation.update({
      where: { id: preparation.id },
      data: {
        destinationPlan: input.destinationPlan,
        destinationBillingInterval: input.destinationBillingInterval,
        ...(changed ? { preparationRevision: { increment: 1 } } : {}),
      },
    });
  });
  await revalidateAccountSplitPreparation(input.preparationId);
}

export async function saveAccountSplitSiteDecisions(input: {
  preparationId: string;
  decisions: Array<{
    clinicSiteId: string;
    decision: "SPLIT" | "DEACTIVATE" | "RETAIN_ON_SOURCE";
  }>;
}): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    const preparation = await loadWritablePreparation(tx, input.preparationId);
    if (preparation.operationKind !== "SITE_TO_NEW_ACCOUNT") {
      throw new ClinicPortalError(
        "This structural operation is not available.",
        "invalid"
      );
    }
    await lockAccountSplit(tx, preparation.sourceClinicId);
    const fresh = await loadWritablePreparation(tx, preparation.id);
    const sites = await tx.clinicSite.findMany({
      where: { clinicId: fresh.sourceClinicId },
      select: { id: true, slug: true, active: true },
    });
    const otherSites = sites.filter(
      (site) => site.id !== fresh.keptClinicSiteId
    );
    const byId = new Map(
      input.decisions.map((decision) => [decision.clinicSiteId, decision])
    );
    if (byId.size !== input.decisions.length) {
      throw new ClinicPortalError(
        "Each Clinic Site can have only one decision.",
        "invalid"
      );
    }
    if (
      otherSites.length !== input.decisions.length ||
      otherSites.some((site) => !byId.has(site.id))
    ) {
      throw new ClinicPortalError(
        "Choose Split, Deactivate, or Retain for every Clinic Site that is not kept.",
        "invalid"
      );
    }
    const splitSites = otherSites.filter(
      (site) => byId.get(site.id)?.decision === "SPLIT"
    );
    if (splitSites.length !== 1) {
      throw new ClinicPortalError(
        "This preparation moves exactly one Clinic Site onto one new Account.",
        "invalid"
      );
    }
    const splitSite = splitSites[0];
    if (!splitSite?.active) {
      throw new ClinicPortalError(
        "The Clinic Site to move must be active.",
        "invalid"
      );
    }
    const previousDecisions = await tx.clinicAccountSplitSiteDecision.findMany({
      where: { preparationId: fresh.id },
      select: { clinicSiteId: true, decision: true },
    });
    const decisionsChanged = decisionsDiffer(
      previousDecisions,
      input.decisions
    );
    await tx.clinicAccountSplitSiteDecision.deleteMany({
      where: { preparationId: fresh.id },
    });
    await tx.clinicAccountSplitSiteDecision.createMany({
      data: otherSites.map((site) => ({
        preparationId: fresh.id,
        clinicSiteId: site.id,
        decision: byId.get(site.id)!.decision,
      })),
    });
    await tx.clinicAccountSplitPreparation.update({
      where: { id: fresh.id },
      data: {
        expectedConfirmation: splitConfirmationPhrase(splitSite.slug),
        ...(decisionsChanged ? { preparationRevision: { increment: 1 } } : {}),
      },
    });
    if (fresh.destinationClinicId) {
      const display = await tx.clinicSite.findFirst({
        where: { id: splitSite.id, clinicId: fresh.sourceClinicId },
        select: { displayName: true },
      });
      if (display) {
        await tx.clinic.update({
          where: { id: fresh.destinationClinicId },
          data: { name: display.displayName },
        });
        await tx.clinicProfile.update({
          where: { clinicId: fresh.destinationClinicId },
          data: { displayName: display.displayName },
        });
      }
    }
  });
  await revalidateAccountSplitPreparation(input.preparationId);
}

export async function saveAccountSplitStaffSelections(input: {
  preparationId: string;
  selections: Array<{
    userId: string;
    keepOnSource: boolean;
    grantOnDestination: boolean;
    destinationRole: "ADMIN" | "STAFF";
  }>;
}): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    const preparation = await loadWritablePreparation(tx, input.preparationId);
    await lockAccountSplit(tx, preparation.sourceClinicId);
    const fresh = await loadWritablePreparation(tx, preparation.id);
    const memberships = await tx.clinicMembership.findMany({
      where: { clinicId: fresh.sourceClinicId, active: true },
      select: { userId: true },
    });
    const byUser = new Map(
      input.selections.map((selection) => [selection.userId, selection])
    );
    if (byUser.size !== input.selections.length) {
      throw new ClinicPortalError(
        "Each person can have only one staff decision.",
        "invalid"
      );
    }
    const memberIds = new Set(
      memberships.map((membership) => membership.userId)
    );
    if (
      input.selections.some((selection) => !memberIds.has(selection.userId)) ||
      memberships.some((membership) => !byUser.has(membership.userId))
    ) {
      throw new ClinicPortalError(
        "Staff decisions must match the source account memberships.",
        "invalid"
      );
    }
    const previousSelections =
      await tx.clinicAccountSplitStaffSelection.findMany({
        where: { preparationId: fresh.id },
        select: {
          userId: true,
          keepOnSource: true,
          grantOnDestination: true,
          destinationRole: true,
        },
      });
    const selectionsChanged = selectionsDiffer(
      previousSelections,
      input.selections
    );
    await tx.clinicAccountSplitStaffSelection.deleteMany({
      where: { preparationId: fresh.id },
    });
    await tx.clinicAccountSplitStaffSelection.createMany({
      data: memberships.map((membership) => {
        const selection = byUser.get(membership.userId)!;
        return {
          preparationId: fresh.id,
          userId: membership.userId,
          keepOnSource: selection.keepOnSource,
          grantOnDestination: selection.grantOnDestination,
          destinationRole: selection.destinationRole,
        };
      }),
    });
    if (selectionsChanged) {
      await tx.clinicAccountSplitPreparation.update({
        where: { id: fresh.id },
        data: { preparationRevision: { increment: 1 } },
      });
    }
  });
  await revalidateAccountSplitPreparation(input.preparationId);
}

/**
 * Creates a shell Clinic and ClinicProfile for the split destination.
 * Does not create a Site, Location, guide, placement, or billing row.
 * The shell slug is compatibility data, not a patient hostname.
 */
export async function createSplitDestinationAccount(
  preparationId: string
): Promise<{ id: string; slug: string }> {
  try {
    return await getPrisma().$transaction(async (tx) => {
      const preparation = await loadWritablePreparation(tx, preparationId);
      await lockAccountSplit(tx, preparation.sourceClinicId);
      const fresh = await loadWritablePreparation(tx, preparation.id);
      if (fresh.operationKind === "SITE_TO_EXISTING_GROUP") {
        throw new ClinicPortalError(
          "This move uses an existing Group Account. It does not create a destination Account.",
          "invalid"
        );
      }
      if (fresh.operationKind === "LOCATION_TO_NEW_ACCOUNT") {
        return createLocationDestinationShell(tx, fresh);
      }
      if (fresh.operationKind !== "SITE_TO_NEW_ACCOUNT") {
        throw new ClinicPortalError(
          "This structural operation is not available.",
          "invalid"
        );
      }
      if (fresh.destinationClinicId) {
        const existing = await tx.clinic.findUnique({
          where: { id: fresh.destinationClinicId },
          select: { id: true, slug: true },
        });
        if (!existing) {
          throw new ClinicPortalError(
            "The destination shell could not be found.",
            "not_found"
          );
        }
        return existing;
      }
      const splitDecision = await tx.clinicAccountSplitSiteDecision.findFirst({
        where: { preparationId: fresh.id, decision: "SPLIT" },
        select: { clinicSiteId: true },
      });
      if (!splitDecision) {
        throw new ClinicPortalError(
          "Choose the Clinic Site to move before creating the destination Account.",
          "invalid"
        );
      }
      const site = await tx.clinicSite.findFirst({
        where: {
          id: splitDecision.clinicSiteId,
          clinicId: fresh.sourceClinicId,
        },
        select: { id: true, displayName: true, active: true, slug: true },
      });
      if (!site || !site.active) {
        throw new ClinicPortalError(
          "The Clinic Site to move must be active.",
          "invalid"
        );
      }
      await lockAccountSplitShellSlug(tx);
      const slug = await allocateSplitShellSlug(tx, [
        generateSplitShellSlug(),
        generateSplitShellSlug(),
        generateSplitShellSlug(),
        generateSplitShellSlug(),
        generateSplitShellSlug(),
        generateSplitShellSlug(),
        generateSplitShellSlug(),
        generateSplitShellSlug(),
      ]);
      const clinic = await tx.clinic.create({
        data: {
          name: site.displayName,
          slug,
        },
        select: { id: true, slug: true },
      });
      await tx.clinicProfile.create({
        data: {
          clinicId: clinic.id,
          displayName: site.displayName,
        },
      });
      await tx.clinicAccountSplitPreparation.update({
        where: { id: fresh.id },
        data: {
          destinationClinicId: clinic.id,
          expectedConfirmation: splitConfirmationPhrase(site.slug),
          preparationRevision: { increment: 1 },
        },
      });
      return clinic;
    });
  } catch (error) {
    throw mapKnownConflict(error);
  }
}

export async function cancelAccountSplitPreparation(
  preparationId: string
): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    const preparation = await tx.clinicAccountSplitPreparation.findUnique({
      where: { id: preparationId },
      select: { id: true, sourceClinicId: true, status: true },
    });
    if (!preparation) {
      throw new ClinicPortalError(
        "That preparation was not found.",
        "not_found"
      );
    }
    await lockAccountSplit(tx, preparation.sourceClinicId);
    const fresh = await tx.clinicAccountSplitPreparation.findUnique({
      where: { id: preparation.id },
      select: {
        id: true,
        status: true,
        sourceClinicId: true,
        destinationClinicId: true,
      },
    });
    if (!fresh) {
      throw new ClinicPortalError(
        "That preparation was not found.",
        "not_found"
      );
    }
    if (fresh.status === "CANCELLED") {
      return;
    }
    if (
      fresh.status === "COMPLETED" ||
      isTerminalAccountSplitStatus(fresh.status)
    ) {
      throw new ClinicPortalError("This preparation is closed.", "conflict");
    }
    await tx.clinicAccountSplitPreparation.update({
      where: { id: fresh.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await recordAccountSplitEvent(tx, {
      preparationId: fresh.id,
      kind: "STATUS_TRANSITION",
      fromStatus: fresh.status,
      toStatus: "CANCELLED",
      sourceClinicId: fresh.sourceClinicId,
      destinationClinicId: fresh.destinationClinicId,
      category: "cancelled",
    });
    await recordAccountSplitEvent(tx, {
      preparationId: fresh.id,
      kind: "CANCELLED",
      fromStatus: fresh.status,
      toStatus: "CANCELLED",
      sourceClinicId: fresh.sourceClinicId,
      destinationClinicId: fresh.destinationClinicId,
      category: "cancelled",
    });
  });
}

/**
 * Recalculates status from current account data and stores that status.
 * Does not move sites, copy guides, change memberships, or call Stripe.
 */
export async function revalidateAccountSplitPreparation(
  preparationId: string
): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    const preparation = await tx.clinicAccountSplitPreparation.findUnique({
      where: { id: preparationId },
      select: { id: true, sourceClinicId: true, status: true },
    });
    if (!preparation || isTerminalAccountSplitStatus(preparation.status)) {
      return;
    }
    await lockAccountSplit(tx, preparation.sourceClinicId);
    const snapshot = await loadAccountSplitSnapshot(preparation.id, tx);
    if (
      !snapshot ||
      isTerminalAccountSplitStatus(snapshot.preparation.status)
    ) {
      return;
    }
    const assessment = assessPreparedAccountStructure(snapshot);
    if (assessment.status === "COMPLETED") {
      throw new ClinicPortalError(
        "Preparation cannot be marked completed.",
        "invalid"
      );
    }
    if (
      assessment.status === snapshot.preparation.status &&
      assessment.confirmationPhrase ===
        snapshot.preparation.expectedConfirmation
    ) {
      return;
    }
    await tx.clinicAccountSplitPreparation.update({
      where: { id: snapshot.preparation.id },
      data: {
        status: assessment.status,
        expectedConfirmation: assessment.confirmationPhrase,
      },
    });
    await recordAccountSplitEvent(tx, {
      preparationId: snapshot.preparation.id,
      kind: "STATUS_TRANSITION",
      fromStatus: snapshot.preparation.status,
      toStatus: assessment.status,
      sourceClinicId: snapshot.source.id,
      destinationClinicId: snapshot.preparation.destinationClinicId,
      siteId:
        assessment.splitSite?.id ??
        assessment.locationMove?.sourceSiteId ??
        null,
      locationId: assessment.locationMove?.location?.id ?? null,
      category: "status_transition",
    });
    for (const code of ACCOUNT_SPLIT_COMMERCIAL_CONFLICT_CODES) {
      if (assessment.blockers.some((blocker) => blocker.code === code)) {
        await recordAccountSplitEvent(tx, {
          preparationId: snapshot.preparation.id,
          kind: "COMMERCIAL_CONFLICT",
          fromStatus: snapshot.preparation.status,
          toStatus: assessment.status,
          sourceClinicId: snapshot.source.id,
          destinationClinicId: snapshot.preparation.destinationClinicId,
          siteId:
            assessment.splitSite?.id ??
            assessment.locationMove?.sourceSiteId ??
            null,
          locationId: assessment.locationMove?.location?.id ?? null,
          category: code,
        });
      }
    }
  });
}

export async function previewAccountSplit(preparationId: string) {
  const snapshot = await loadAccountSplitSnapshot(preparationId);
  if (!snapshot) {
    return null;
  }
  return assessPreparedAccountStructure(snapshot);
}

export async function createLocationToNewAccountPreparation(input: {
  sourceClinicId: string;
  sourceClinicSiteId: string;
  sourceLocationId: string;
  destinationPlan: CommercialPlan;
  destinationBillingInterval: BillingInterval;
  operatorUserId: string;
}): Promise<{ id: string }> {
  if (!DESTINATION_PLANS.has(input.destinationPlan)) {
    throw new ClinicPortalError(
      "Choose Essential or Practice for the destination Account.",
      "invalid"
    );
  }
  try {
    return await getPrisma().$transaction(async (tx) => {
      await lockAccountSplit(tx, input.sourceClinicId);
      const operator = await tx.user.findUnique({
        where: { id: input.operatorUserId },
        select: { platformRole: true },
      });
      if (operator?.platformRole !== "OPERATOR") {
        throw new ClinicPortalError(
          "Only a platform operator can prepare an account split.",
          "forbidden"
        );
      }
      await assertClinicActive(tx, input.sourceClinicId);
      await assertNoOpenNegotiatedOffer(tx, input.sourceClinicId);
      const clinic = await tx.clinic.findUnique({
        where: { id: input.sourceClinicId },
        select: {
          id: true,
          entitlement: { select: { commercialPlan: true } },
        },
      });
      if (!clinic) {
        throw new ClinicPortalError("That account was not found.", "not_found");
      }
      const site = await tx.clinicSite.findFirst({
        where: { id: input.sourceClinicSiteId },
        select: { id: true, clinicId: true, active: true },
      });
      const location = await tx.clinicLocation.findUnique({
        where: { id: input.sourceLocationId },
        select: {
          id: true,
          clinicId: true,
          clinicSiteId: true,
          active: true,
          servesSiteRoot: true,
          slug: true,
        },
      });
      const root = site
        ? await tx.clinicLocation.findFirst({
            where: {
              clinicSiteId: site.id,
              clinicId: site.clinicId,
              servesSiteRoot: true,
            },
            select: { id: true, active: true, servesSiteRoot: true },
          })
        : null;
      const rejection = locationMoveEligibility({
        commercialPlan: clinic.entitlement?.commercialPlan ?? null,
        sourceSite:
          site && site.clinicId === clinic.id
            ? { id: site.id, clinicId: site.clinicId, active: site.active }
            : null,
        location,
        rootLocation: root,
      });
      if (rejection) {
        throw new ClinicPortalError(rejection.message, "invalid");
      }
      const open = await tx.clinicAccountSplitPreparation.findFirst({
        where: {
          sourceClinicId: clinic.id,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        select: { id: true },
      });
      if (open) {
        throw new ClinicPortalError(
          "This account already has an open split preparation.",
          "conflict"
        );
      }
      const memberships = await tx.clinicMembership.findMany({
        where: { clinicId: clinic.id, active: true },
        select: { userId: true, role: true },
      });
      const created = await tx.clinicAccountSplitPreparation.create({
        data: {
          sourceClinicId: clinic.id,
          keptClinicSiteId: input.sourceClinicSiteId,
          sourceLocationId: input.sourceLocationId,
          status: "DRAFT",
          destinationPlan: input.destinationPlan,
          destinationBillingInterval: input.destinationBillingInterval,
          targetSourcePlan: "PRACTICE",
          operationKind: "LOCATION_TO_NEW_ACCOUNT",
          preparedByUserId: input.operatorUserId,
          staffSelections: {
            create: memberships.map((membership) => ({
              userId: membership.userId,
              keepOnSource: true,
              grantOnDestination: false,
              destinationRole: membership.role,
            })),
          },
        },
        select: { id: true },
      });
      await recordAccountSplitEvent(tx, {
        preparationId: created.id,
        kind: "PREPARATION_CREATED",
        toStatus: "DRAFT",
        actorUserId: input.operatorUserId,
        sourceClinicId: clinic.id,
        siteId: input.sourceClinicSiteId,
        locationId: input.sourceLocationId,
        category: "preparation_created",
      });
      return created;
    });
  } catch (error) {
    throw mapKnownConflict(error);
  }
}

export async function saveLocationToNewAccountSelection(input: {
  preparationId: string;
  sourceLocationId: string;
}): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    const preparation = await loadWritablePreparation(tx, input.preparationId);
    if (preparation.operationKind !== "LOCATION_TO_NEW_ACCOUNT") {
      throw new ClinicPortalError(
        "This structural operation is not available.",
        "invalid"
      );
    }
    await lockAccountSplit(tx, preparation.sourceClinicId);
    const fresh = await loadWritablePreparation(tx, preparation.id);
    const selected = await loadEligibleLocation(tx, {
      sourceClinicId: fresh.sourceClinicId,
      sourceClinicSiteId: fresh.keptClinicSiteId,
      sourceLocationId: input.sourceLocationId,
    });
    if (fresh.sourceLocationId === selected.id) {
      return;
    }
    await tx.clinicAccountSplitPreparation.update({
      where: { id: fresh.id },
      data: {
        sourceLocationId: selected.id,
        preparationRevision: { increment: 1 },
      },
    });
    if (fresh.destinationClinicId) {
      await tx.clinic.update({
        where: { id: fresh.destinationClinicId },
        data: { name: selected.displayName },
      });
      await tx.clinicProfile.update({
        where: { clinicId: fresh.destinationClinicId },
        data: { displayName: selected.displayName },
      });
    }
  });
  await revalidateAccountSplitPreparation(input.preparationId);
}

export async function confirmLocationDestinationSiteSlug(input: {
  preparationId: string;
  destinationSiteSlug: string;
}): Promise<void> {
  const slug = input.destinationSiteSlug.trim();
  const issue = locationDestinationSlugIssue(slug);
  if (issue) {
    throw new ClinicPortalError(issue.message, "invalid");
  }
  await getPrisma().$transaction(async (tx) => {
    const preparation = await loadWritablePreparation(tx, input.preparationId);
    if (preparation.operationKind !== "LOCATION_TO_NEW_ACCOUNT") {
      throw new ClinicPortalError(
        "This structural operation is not available.",
        "invalid"
      );
    }
    await lockAccountSplit(tx, preparation.sourceClinicId);
    await lockAccountSplitShellSlug(tx);
    const fresh = await tx.clinicAccountSplitPreparation.findUnique({
      where: { id: preparation.id },
      select: {
        id: true,
        sourceClinicId: true,
        destinationClinicId: true,
        destinationSiteSlug: true,
        status: true,
        operationKind: true,
      },
    });
    if (!fresh || fresh.operationKind !== "LOCATION_TO_NEW_ACCOUNT") {
      throw new ClinicPortalError(
        "This structural operation is not available.",
        "invalid"
      );
    }
    if (isTerminalAccountSplitStatus(fresh.status)) {
      throw new ClinicPortalError("This preparation is closed.", "conflict");
    }
    await assertConfirmedDestinationSlugAvailable(tx, {
      slug,
      sourceClinicId: fresh.sourceClinicId,
      destinationClinicId: fresh.destinationClinicId,
    });
    if (fresh.destinationSiteSlug === slug) {
      return;
    }
    await tx.clinicAccountSplitPreparation.update({
      where: { id: fresh.id },
      data: {
        destinationSiteSlug: slug,
        expectedConfirmation: locationMoveConfirmationPhrase(slug),
        preparationRevision: { increment: 1 },
      },
    });
  });
  await revalidateAccountSplitPreparation(input.preparationId);
}

async function createLocationDestinationShell(
  tx: Prisma.TransactionClient,
  preparation: {
    id: string;
    sourceClinicId: string;
    destinationClinicId: string | null;
    keptClinicSiteId: string;
    destinationSiteSlug: string | null;
  }
): Promise<{ id: string; slug: string }> {
  if (preparation.destinationClinicId) {
    const existing = await tx.clinic.findUnique({
      where: { id: preparation.destinationClinicId },
      select: { id: true, slug: true },
    });
    if (!existing) {
      throw new ClinicPortalError(
        "The destination shell could not be found.",
        "not_found"
      );
    }
    return existing;
  }
  const location = await loadEligibleLocation(tx, {
    sourceClinicId: preparation.sourceClinicId,
    sourceClinicSiteId: preparation.keptClinicSiteId,
    sourceLocationId: (
      await tx.clinicAccountSplitPreparation.findUniqueOrThrow({
        where: { id: preparation.id },
        select: { sourceLocationId: true },
      })
    ).sourceLocationId,
  });
  await lockAccountSplitShellSlug(tx);
  const slug = await allocateSplitShellSlug(tx, [
    generateSplitShellSlug(),
    generateSplitShellSlug(),
    generateSplitShellSlug(),
    generateSplitShellSlug(),
    generateSplitShellSlug(),
    generateSplitShellSlug(),
    generateSplitShellSlug(),
    generateSplitShellSlug(),
  ]);
  const clinic = await tx.clinic.create({
    data: {
      name: location.displayName,
      slug,
    },
    select: { id: true, slug: true },
  });
  await tx.clinicProfile.create({
    data: {
      clinicId: clinic.id,
      displayName: location.displayName,
    },
  });
  await tx.clinicAccountSplitPreparation.update({
    where: { id: preparation.id },
    data: {
      destinationClinicId: clinic.id,
      expectedConfirmation: preparation.destinationSiteSlug
        ? locationMoveConfirmationPhrase(preparation.destinationSiteSlug)
        : null,
      preparationRevision: { increment: 1 },
    },
  });
  const sites = await tx.clinicSite.count({ where: { clinicId: clinic.id } });
  if (sites !== 0) {
    throw new ClinicPortalError(
      "The destination shell must not contain a Site.",
      "conflict"
    );
  }
  return clinic;
}

async function loadEligibleLocation(
  tx: Prisma.TransactionClient,
  input: {
    sourceClinicId: string;
    sourceClinicSiteId: string;
    sourceLocationId: string | null;
  }
) {
  if (!input.sourceLocationId) {
    throw new ClinicPortalError(
      "Choose the location to move onto the new account.",
      "invalid"
    );
  }
  const clinic = await tx.clinic.findUnique({
    where: { id: input.sourceClinicId },
    select: { entitlement: { select: { commercialPlan: true } } },
  });
  const site = await tx.clinicSite.findFirst({
    where: { id: input.sourceClinicSiteId },
    select: { id: true, clinicId: true, active: true },
  });
  const location = await tx.clinicLocation.findUnique({
    where: { id: input.sourceLocationId },
    select: {
      id: true,
      clinicId: true,
      clinicSiteId: true,
      active: true,
      servesSiteRoot: true,
      slug: true,
      displayName: true,
    },
  });
  const root = site
    ? await tx.clinicLocation.findFirst({
        where: {
          clinicSiteId: site.id,
          servesSiteRoot: true,
        },
        select: { id: true, active: true, servesSiteRoot: true },
      })
    : null;
  const rejection = locationMoveEligibility({
    commercialPlan: clinic?.entitlement?.commercialPlan ?? null,
    sourceSite:
      site && site.clinicId === input.sourceClinicId
        ? { id: site.id, clinicId: site.clinicId, active: site.active }
        : null,
    location,
    rootLocation: root,
  });
  if (rejection || !location) {
    throw new ClinicPortalError(
      rejection?.message ?? "Choose the location to move onto the new account.",
      "invalid"
    );
  }
  return location;
}

async function assertConfirmedDestinationSlugAvailable(
  tx: Prisma.TransactionClient,
  input: {
    slug: string;
    sourceClinicId: string;
    destinationClinicId: string | null;
  }
): Promise<void> {
  await assertTenantSlugNotRetired(tx, input.slug);
  const site = await tx.clinicSite.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  if (site) {
    throw new ClinicPortalError(
      "That destination Clinic Site address is already in use. Confirm a different one.",
      "conflict"
    );
  }
  const holder = await tx.clinic.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  if (!holder) {
    return;
  }
  if (input.destinationClinicId && holder.id === input.destinationClinicId) {
    return;
  }
  if (holder.id === input.sourceClinicId) {
    const primary = await tx.clinicSite.findFirst({
      where: { clinicId: input.sourceClinicId, isPrimary: true },
      select: { slug: true },
    });
    if (primary && primary.slug !== input.slug) {
      return;
    }
  }
  throw new ClinicPortalError(
    "That destination Clinic Site address is already in use. Confirm a different one.",
    "conflict"
  );
}

export async function createSiteToExistingGroupPreparation(input: {
  sourceClinicId: string;
  movingClinicSiteId: string;
  keptClinicSiteId?: string | null;
  operatorUserId: string;
}): Promise<{ id: string }> {
  try {
    return await getPrisma().$transaction(async (tx) => {
      await lockAccountSplit(tx, input.sourceClinicId);
      await assertOperator(tx, input.operatorUserId);
      await assertClinicActive(tx, input.sourceClinicId);
      await assertNoOpenNegotiatedOffer(tx, input.sourceClinicId);
      const clinic = await tx.clinic.findUnique({
        where: { id: input.sourceClinicId },
        select: {
          id: true,
          entitlement: {
            select: { commercialPlan: true, billingInterval: true },
          },
          sites: {
            select: { id: true, active: true, isPrimary: true, slug: true },
          },
        },
      });
      if (!clinic) {
        throw new ClinicPortalError("That account was not found.", "not_found");
      }
      if (clinic.entitlement?.commercialPlan !== "GROUP") {
        throw new ClinicPortalError(
          clinic.entitlement?.commercialPlan === "ESSENTIAL"
            ? "Essential cannot move a Clinic Site into an existing Group."
            : clinic.entitlement?.commercialPlan === "PRACTICE"
              ? "Practice cannot move a Clinic Site into an existing Group."
              : "This move starts from a Group Account.",
          "invalid"
        );
      }
      const moving = clinic.sites.find(
        (site) => site.id === input.movingClinicSiteId
      );
      if (!moving) {
        throw new ClinicPortalError(
          "Choose a Clinic Site that belongs to this Account.",
          "invalid"
        );
      }
      if (!moving.active) {
        throw new ClinicPortalError(
          "The Clinic Site to move must be active.",
          "invalid"
        );
      }
      const otherActive = clinic.sites.filter(
        (site) => site.active && site.id !== moving.id
      );
      if (otherActive.length < 1) {
        throw new ClinicPortalError(
          "The source Group must keep at least one other active Clinic Site.",
          "invalid"
        );
      }
      const currentPrimary =
        clinic.sites.find((site) => site.isPrimary) ?? null;
      const kept = moving.isPrimary
        ? clinic.sites.find((site) => site.id === input.keptClinicSiteId)
        : currentPrimary;
      if (!kept || !kept.active || kept.id === moving.id) {
        throw new ClinicPortalError(
          moving.isPrimary
            ? "Choose the active Clinic Site that will become the source primary."
            : "The source primary Clinic Site must stay in place.",
          "invalid"
        );
      }
      const open = await tx.clinicAccountSplitPreparation.findFirst({
        where: {
          sourceClinicId: clinic.id,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        select: { id: true },
      });
      if (open) {
        throw new ClinicPortalError(
          "This account already has an open split preparation.",
          "conflict"
        );
      }
      const memberships = await tx.clinicMembership.findMany({
        where: { clinicId: clinic.id, active: true },
        select: { userId: true, role: true },
      });
      const created = await tx.clinicAccountSplitPreparation.create({
        data: {
          sourceClinicId: clinic.id,
          keptClinicSiteId: kept.id,
          status: "DRAFT",
          destinationPlan: "GROUP",
          destinationBillingInterval:
            clinic.entitlement.billingInterval ?? "MONTHLY",
          targetSourcePlan: "GROUP",
          operationKind: "SITE_TO_EXISTING_GROUP",
          preparedByUserId: input.operatorUserId,
          expectedConfirmation: existingGroupMoveConfirmationPhrase(
            moving.slug
          ),
          siteDecisions: {
            create: { clinicSiteId: moving.id, decision: "SPLIT" },
          },
          staffSelections: {
            create: memberships.map((membership) => ({
              userId: membership.userId,
              keepOnSource: true,
              grantOnDestination: false,
              destinationRole: membership.role,
            })),
          },
        },
        select: { id: true },
      });
      await recordAccountSplitEvent(tx, {
        preparationId: created.id,
        kind: "PREPARATION_CREATED",
        toStatus: "DRAFT",
        actorUserId: input.operatorUserId,
        sourceClinicId: clinic.id,
        siteId: moving.id,
        category: "preparation_created",
      });
      return created;
    });
  } catch (error) {
    throw mapKnownConflict(error);
  }
}

export async function selectExistingGroupDestination(input: {
  preparationId: string;
  destinationClinicId: string;
  /**
   * Test seam. Runs after both accounts' structure and split locks are held
   * and before the destination is re-read or written.
   */
  afterLocks?: () => Promise<void> | void;
}): Promise<void> {
  try {
    const selectDestination = async (
      tx: Prisma.TransactionClient
    ): Promise<void> => {
      const preparation = await loadExistingGroupPreparation(
        tx,
        input.preparationId
      );
      if (input.destinationClinicId === preparation.sourceClinicId) {
        throw new ClinicPortalError(
          "Choose a different Group Account.",
          "invalid"
        );
      }
      // Structure locks for every account, sorted, then split locks sorted.
      // Deactivation and execution use that same order, so neither can
      // commit a destination the other has not re-read.
      await lockClinicAccountStructures(tx, [
        preparation.sourceClinicId,
        input.destinationClinicId,
      ]);
      await lockAccountSplits(tx, [
        preparation.sourceClinicId,
        input.destinationClinicId,
      ]);
      if (input.afterLocks) {
        await input.afterLocks();
      }

      const fresh = await loadExistingGroupPreparation(tx, preparation.id);
      if (input.destinationClinicId === fresh.sourceClinicId) {
        throw new ClinicPortalError(
          "Choose a different Group Account.",
          "invalid"
        );
      }
      const source = await tx.clinic.findUnique({
        where: { id: fresh.sourceClinicId },
        select: {
          id: true,
          deactivatedAt: true,
          entitlement: { select: { commercialPlan: true } },
        },
      });
      if (!source) {
        throw new ClinicPortalError("That account was not found.", "not_found");
      }
      if (source.deactivatedAt) {
        throw new ClinicPortalError(CLINIC_INACTIVE_MESSAGE, "conflict");
      }
      if (source.entitlement?.commercialPlan !== "GROUP") {
        throw new ClinicPortalError(
          "This move starts from a Group Account.",
          "invalid"
        );
      }
      const destination = await tx.clinic.findUnique({
        where: { id: input.destinationClinicId },
        select: {
          id: true,
          slug: true,
          deactivatedAt: true,
          entitlement: {
            select: { commercialPlan: true, billingInterval: true },
          },
        },
      });
      if (!destination) {
        throw new ClinicPortalError("That account was not found.", "not_found");
      }
      if (destination.deactivatedAt) {
        throw new ClinicPortalError(
          "Reactivate that clinic before choosing it as a destination.",
          "conflict"
        );
      }
      if (isSplitShellCompatibilitySlug(destination.slug)) {
        throw new ClinicPortalError(
          "This move does not create a destination Account. Choose a Group that already exists.",
          "invalid"
        );
      }
      if (destination.entitlement?.commercialPlan !== "GROUP") {
        throw new ClinicPortalError(
          destination.entitlement?.commercialPlan === "ESSENTIAL"
            ? "Essential cannot receive a Clinic Site from another Group."
            : destination.entitlement?.commercialPlan === "PRACTICE"
              ? "Practice cannot receive a Clinic Site from another Group."
              : "Choose an existing Group Account.",
          "invalid"
        );
      }
      const conflicting = await tx.clinicAccountSplitPreparation.findFirst({
        where: {
          id: { not: fresh.id },
          status: { notIn: ["COMPLETED", "CANCELLED"] },
          OR: [
            { sourceClinicId: destination.id },
            { destinationClinicId: destination.id },
          ],
        },
        select: { id: true },
      });
      if (conflicting) {
        throw new ClinicPortalError(
          "The destination Account already has another open structural preparation.",
          "conflict"
        );
      }
      const changed = fresh.destinationClinicId !== destination.id;
      await tx.clinicAccountSplitPreparation.update({
        where: { id: fresh.id },
        data: {
          destinationClinicId: destination.id,
          destinationPlan: "GROUP",
          destinationBillingInterval:
            destination.entitlement.billingInterval ??
            fresh.destinationBillingInterval,
          ...(changed ? { preparationRevision: { increment: 1 } } : {}),
        },
      });
    };
    if (input.afterLocks) {
      await getPrisma().$transaction(selectDestination, {
        maxWait: 10_000,
        timeout: 20_000,
      });
    } else {
      await getPrisma().$transaction(selectDestination);
    }
  } catch (error) {
    throw mapKnownConflict(error);
  }
  await revalidateAccountSplitPreparation(input.preparationId);
}

export async function saveSiteToExistingGroupSelection(input: {
  preparationId: string;
  movingClinicSiteId: string;
  keptClinicSiteId?: string | null;
}): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    const preparation = await loadExistingGroupPreparation(
      tx,
      input.preparationId
    );
    await lockAccountSplit(tx, preparation.sourceClinicId);
    const fresh = await loadExistingGroupPreparation(tx, preparation.id);
    const sites = await tx.clinicSite.findMany({
      where: { clinicId: fresh.sourceClinicId },
      select: { id: true, active: true, isPrimary: true },
    });
    const moving = sites.find((site) => site.id === input.movingClinicSiteId);
    if (!moving) {
      throw new ClinicPortalError(
        "Choose a Clinic Site that belongs to this Account.",
        "invalid"
      );
    }
    if (!moving.active) {
      throw new ClinicPortalError(
        "The Clinic Site to move must be active.",
        "invalid"
      );
    }
    if (
      sites.filter((site) => site.active && site.id !== moving.id).length < 1
    ) {
      throw new ClinicPortalError(
        "The source Group must keep at least one other active Clinic Site.",
        "invalid"
      );
    }
    const currentPrimary = sites.find((site) => site.isPrimary) ?? null;
    const kept = moving.isPrimary
      ? sites.find((site) => site.id === input.keptClinicSiteId)
      : currentPrimary;
    if (!kept || !kept.active || kept.id === moving.id) {
      throw new ClinicPortalError(
        moving.isPrimary
          ? "Choose the active Clinic Site that will become the source primary."
          : "The source primary Clinic Site must stay in place.",
        "invalid"
      );
    }
    const previous = await tx.clinicAccountSplitSiteDecision.findMany({
      where: { preparationId: fresh.id },
      select: { clinicSiteId: true, decision: true },
    });
    const changed =
      fresh.keptClinicSiteId !== kept.id ||
      previous.length !== 1 ||
      previous[0]?.clinicSiteId !== moving.id ||
      previous[0]?.decision !== "SPLIT";
    await tx.clinicAccountSplitSiteDecision.deleteMany({
      where: { preparationId: fresh.id },
    });
    await tx.clinicAccountSplitSiteDecision.create({
      data: {
        preparationId: fresh.id,
        clinicSiteId: moving.id,
        decision: "SPLIT",
      },
    });
    await tx.clinicAccountSplitPreparation.update({
      where: { id: fresh.id },
      data: {
        keptClinicSiteId: kept.id,
        ...(changed ? { preparationRevision: { increment: 1 } } : {}),
      },
    });
  });
  await revalidateAccountSplitPreparation(input.preparationId);
}

export async function saveCanonicalRetargetConfirmations(input: {
  preparationId: string;
  sourcePracticeGuideIds: string[];
}): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    const preparation = await loadExistingGroupPreparation(
      tx,
      input.preparationId
    );
    await lockAccountSplit(tx, preparation.sourceClinicId);
    const fresh = await loadExistingGroupPreparation(tx, preparation.id);
    const snapshot = await loadAccountSplitSnapshot(fresh.id, tx);
    if (!snapshot) {
      throw new ClinicPortalError(
        "That preparation was not found.",
        "not_found"
      );
    }
    const { assessSiteToExistingGroup } =
      await import("@/lib/account-split/site-to-existing-group-policy");
    const assessment = assessSiteToExistingGroup(snapshot);
    const decisions = assessment.existingGroup?.canonicalDecisions ?? [];
    const requested = [...new Set(input.sourcePracticeGuideIds)];
    const desired = new Map<string, string>();
    for (const sourceGuideId of requested) {
      const decision = decisions.find(
        (row) => row.sourceGuideId === sourceGuideId
      );
      if (!decision?.compatible || !decision.destinationGuideId) {
        throw new ClinicPortalError(
          "Confirm only a destination guide that is an exact canonical match.",
          "invalid"
        );
      }
      desired.set(sourceGuideId, decision.destinationGuideId);
    }
    const existing = await tx.clinicAccountSplitGuideMap.findMany({
      where: { preparationId: fresh.id },
      select: {
        sourcePracticeGuideId: true,
        destinationPracticeGuideId: true,
      },
    });
    const same =
      existing.length === desired.size &&
      existing.every(
        (row) =>
          desired.get(row.sourcePracticeGuideId) ===
          row.destinationPracticeGuideId
      );
    if (same) {
      return;
    }
    await tx.clinicAccountSplitGuideMap.deleteMany({
      where: { preparationId: fresh.id },
    });
    if (desired.size > 0) {
      await tx.clinicAccountSplitGuideMap.createMany({
        data: [...desired.entries()].map(
          ([sourcePracticeGuideId, destinationPracticeGuideId]) => ({
            preparationId: fresh.id,
            sourcePracticeGuideId,
            destinationPracticeGuideId,
          })
        ),
      });
    }
    await tx.clinicAccountSplitPreparation.update({
      where: { id: fresh.id },
      data: { preparationRevision: { increment: 1 } },
    });
    await recordAccountSplitEvent(tx, {
      preparationId: fresh.id,
      kind: "STATUS_TRANSITION",
      fromStatus: fresh.status,
      toStatus: fresh.status,
      sourceClinicId: fresh.sourceClinicId,
      destinationClinicId: fresh.destinationClinicId,
      siteId: assessment.splitSite?.id ?? null,
      category:
        desired.size > 0
          ? "canonical_retarget_confirmed"
          : "canonical_retarget_cleared",
    });
  });
  await revalidateAccountSplitPreparation(input.preparationId);
}

async function assertOperator(
  tx: Prisma.TransactionClient,
  operatorUserId: string
): Promise<void> {
  const operator = await tx.user.findUnique({
    where: { id: operatorUserId },
    select: { platformRole: true },
  });
  if (operator?.platformRole !== "OPERATOR") {
    throw new ClinicPortalError(
      "Only a platform operator can prepare an account split.",
      "forbidden"
    );
  }
}

async function loadExistingGroupPreparation(
  tx: Prisma.TransactionClient,
  preparationId: string
) {
  const preparation = await tx.clinicAccountSplitPreparation.findUnique({
    where: { id: preparationId },
    select: {
      id: true,
      sourceClinicId: true,
      destinationClinicId: true,
      keptClinicSiteId: true,
      status: true,
      operationKind: true,
      destinationBillingInterval: true,
    },
  });
  if (!preparation) {
    throw new ClinicPortalError("That preparation was not found.", "not_found");
  }
  if (preparation.operationKind !== "SITE_TO_EXISTING_GROUP") {
    throw new ClinicPortalError(
      "This structural operation is not available.",
      "invalid"
    );
  }
  if (isTerminalAccountSplitStatus(preparation.status)) {
    throw new ClinicPortalError("This preparation is closed.", "conflict");
  }
  return preparation;
}

async function loadWritablePreparation(
  tx: Prisma.TransactionClient,
  preparationId: string
) {
  const preparation = await tx.clinicAccountSplitPreparation.findUnique({
    where: { id: preparationId },
    select: {
      id: true,
      sourceClinicId: true,
      destinationClinicId: true,
      keptClinicSiteId: true,
      status: true,
      operationKind: true,
      destinationPlan: true,
      destinationBillingInterval: true,
      sourceLocationId: true,
      destinationSiteSlug: true,
    },
  });
  if (!preparation) {
    throw new ClinicPortalError("That preparation was not found.", "not_found");
  }
  if (
    preparation.operationKind !== "SITE_TO_NEW_ACCOUNT" &&
    preparation.operationKind !== "LOCATION_TO_NEW_ACCOUNT" &&
    preparation.operationKind !== "SITE_TO_EXISTING_GROUP"
  ) {
    throw new ClinicPortalError(
      "This structural operation is not available.",
      "invalid"
    );
  }
  if (isTerminalAccountSplitStatus(preparation.status)) {
    throw new ClinicPortalError("This preparation is closed.", "conflict");
  }
  return preparation;
}

function decisionsDiffer(
  previous: Array<{ clinicSiteId: string; decision: string }>,
  next: Array<{ clinicSiteId: string; decision: string }>
): boolean {
  const left = previous
    .map((row) => `${row.clinicSiteId}:${row.decision}`)
    .sort()
    .join("|");
  const right = next
    .map((row) => `${row.clinicSiteId}:${row.decision}`)
    .sort()
    .join("|");
  return left !== right;
}

function selectionsDiffer(
  previous: Array<{
    userId: string;
    keepOnSource: boolean;
    grantOnDestination: boolean;
    destinationRole: string;
  }>,
  next: Array<{
    userId: string;
    keepOnSource: boolean;
    grantOnDestination: boolean;
    destinationRole: string;
  }>
): boolean {
  const shape = (rows: typeof previous) =>
    rows
      .map(
        (row) =>
          `${row.userId}:${row.keepOnSource}:${row.grantOnDestination}:${row.destinationRole}`
      )
      .sort()
      .join("|");
  return shape(previous) !== shape(next);
}

function mapKnownConflict(error: unknown): unknown {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return new ClinicPortalError(
      "This account already has an open split preparation.",
      "conflict"
    );
  }
  return error;
}
