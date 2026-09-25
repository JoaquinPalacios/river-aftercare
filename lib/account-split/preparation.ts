import "server-only";

import {
  Prisma,
  type BillingInterval,
  type CommercialPlan,
} from "@prisma/client";

import {
  lockAccountSplit,
  lockAccountSplitShellSlug,
} from "@/lib/account-split/locks";
import {
  assessAccountSplit,
  isTerminalAccountSplitStatus,
  splitConfirmationPhrase,
} from "@/lib/account-split/policy";
import {
  allocateSplitShellSlug,
  generateSplitShellSlug,
} from "@/lib/account-split/shell-slug";
import { loadAccountSplitSnapshot } from "@/lib/account-split/snapshot";
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
      if (clinic.entitlement?.commercialPlan !== "GROUP") {
        throw new ClinicPortalError(
          "Account split preparation starts from a Group account.",
          "invalid"
        );
      }
      const activeSites = clinic.sites.filter((site) => site.active);
      if (activeSites.length < 2) {
        throw new ClinicPortalError(
          "A split needs more than one active site.",
          "invalid"
        );
      }
      const kept = clinic.sites.find(
        (site) => site.id === input.keptClinicSiteId
      );
      if (!kept) {
        throw new ClinicPortalError(
          "Choose a site that belongs to this account.",
          "invalid"
        );
      }
      if (!kept.active) {
        throw new ClinicPortalError(
          "Choose an active site to keep on the source account.",
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
    await lockAccountSplit(tx, preparation.sourceClinicId);
    await tx.clinicAccountSplitPreparation.update({
      where: { id: preparation.id },
      data: {
        destinationPlan: input.destinationPlan,
        destinationBillingInterval: input.destinationBillingInterval,
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
        "Each site can have only one decision.",
        "invalid"
      );
    }
    if (
      otherSites.length !== input.decisions.length ||
      otherSites.some((site) => !byId.has(site.id))
    ) {
      throw new ClinicPortalError(
        "Choose Split, Deactivate, or Retain for every site that is not kept.",
        "invalid"
      );
    }
    const splitSites = otherSites.filter(
      (site) => byId.get(site.id)?.decision === "SPLIT"
    );
    if (splitSites.length !== 1) {
      throw new ClinicPortalError(
        "This preparation splits exactly one site onto one new Account.",
        "invalid"
      );
    }
    const splitSite = splitSites[0];
    if (!splitSite?.active) {
      throw new ClinicPortalError(
        "The site to split must be active.",
        "invalid"
      );
    }
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
      data: { expectedConfirmation: splitConfirmationPhrase(splitSite.slug) },
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
          "Choose the site to split before creating the destination account.",
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
          "The site to split must be active.",
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
      select: { id: true, status: true },
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
    const assessment = assessAccountSplit(snapshot);
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
  });
}

export async function previewAccountSplit(preparationId: string) {
  const snapshot = await loadAccountSplitSnapshot(preparationId);
  if (!snapshot) {
    return null;
  }
  return assessAccountSplit(snapshot);
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
    },
  });
  if (!preparation) {
    throw new ClinicPortalError("That preparation was not found.", "not_found");
  }
  if (isTerminalAccountSplitStatus(preparation.status)) {
    throw new ClinicPortalError("This preparation is closed.", "conflict");
  }
  return preparation;
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
