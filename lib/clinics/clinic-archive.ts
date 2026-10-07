import "server-only";

import { AccountTokenType, PlatformRole } from "@prisma/client";

import { findOpenAccountSplitInvolvingClinic } from "@/lib/account-split/snapshot";
import { lockAccountSplit } from "@/lib/account-split/locks";
import {
  CLINIC_DEACTIVATION_SPLIT_MESSAGE,
  CLINIC_STATUS_NOT_FOUND_MESSAGE,
  CLINIC_STATUS_OPERATOR_MESSAGE,
} from "@/lib/clinics/clinic-deactivation";
import {
  CLINIC_PERMANENTLY_DELETED_REACTIVATE_MESSAGE,
  confirmationMatchesClinic,
} from "@/lib/clinics/permanent-clinic-deletion";
import { lockClinicAccountStructure } from "@/lib/entitlements/locks";
import { getPrisma } from "@/lib/prisma";

export const CLINIC_ARCHIVE_CONFIRMATION_MESSAGE =
  "Type the clinic name to confirm archive.";

export const CLINIC_NOT_ARCHIVED_MESSAGE = "This clinic is not archived.";

export const CLINIC_ALREADY_TERMINAL_MESSAGE =
  "This clinic was permanently deleted and cannot be archived.";

type ArchiveTx = Parameters<typeof lockClinicAccountStructure>[0];

async function operatorMayChangeClinicStatus(
  userId: string,
  tx: ArchiveTx
): Promise<boolean> {
  const operator = await tx.user.findUnique({
    where: { id: userId },
    select: { platformRole: true },
  });
  return operator?.platformRole === PlatformRole.OPERATOR;
}

/**
 * Archives a clinic and preserves its operational data.
 * From Active, this also deactivates the clinic and revokes outstanding
 * invitations in the same transaction. From Inactive, deactivation is left
 * as it is and child rows are not changed. Stripe is not called.
 */
export async function archiveClinic(input: {
  clinicId: string;
  operatorUserId: string;
  confirmation: string;
  now?: Date;
  /**
   * Test seam. Runs after the structure and split locks, before the
   * open-split re-read and the archive write.
   */
  afterLocks?: () => Promise<void> | void;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = input.now ?? new Date();
  const archive = async (
    tx: ArchiveTx
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    await lockClinicAccountStructure(tx, input.clinicId);
    await lockAccountSplit(tx, input.clinicId);
    if (input.afterLocks) {
      await input.afterLocks();
    }
    if (!(await operatorMayChangeClinicStatus(input.operatorUserId, tx))) {
      return { ok: false, error: CLINIC_STATUS_OPERATOR_MESSAGE };
    }

    const clinic = await tx.clinic.findUnique({
      where: { id: input.clinicId },
      select: {
        id: true,
        name: true,
        deactivatedAt: true,
        deactivatedByUserId: true,
        archivedAt: true,
        permanentlyDeletedAt: true,
        sites: {
          select: { displayName: true, isPrimary: true, active: true },
        },
      },
    });
    if (!clinic) {
      return { ok: false, error: CLINIC_STATUS_NOT_FOUND_MESSAGE };
    }
    if (clinic.permanentlyDeletedAt) {
      return { ok: false, error: CLINIC_ALREADY_TERMINAL_MESSAGE };
    }
    if (!confirmationMatchesClinic(clinic, input.confirmation)) {
      return { ok: false, error: CLINIC_ARCHIVE_CONFIRMATION_MESSAGE };
    }

    const openSplit = await findOpenAccountSplitInvolvingClinic(clinic.id, tx);
    if (openSplit) {
      return { ok: false, error: CLINIC_DEACTIVATION_SPLIT_MESSAGE };
    }

    const wasActive = clinic.deactivatedAt == null;
    if (!clinic.archivedAt) {
      await tx.clinic.update({
        where: { id: clinic.id },
        data: {
          archivedAt: now,
          archivedByUserId: input.operatorUserId,
          ...(wasActive
            ? {
                deactivatedAt: now,
                deactivatedByUserId: input.operatorUserId,
              }
            : {}),
        },
      });
    }

    if (wasActive) {
      await tx.accountToken.updateMany({
        where: {
          clinicId: clinic.id,
          type: AccountTokenType.INVITATION,
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
    }

    return { ok: true };
  };

  if (input.afterLocks) {
    return getPrisma().$transaction(archive, {
      maxWait: 10_000,
      timeout: 20_000,
    });
  }
  return getPrisma().$transaction(archive);
}

/**
 * Returns an archived clinic to Inactive.
 * Clears archive fields only. Deactivation, invitations, sites, locations,
 * guides, billing, and entitlements stay as they are. Stripe is not called.
 */
export async function unarchiveClinic(input: {
  clinicId: string;
  operatorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return getPrisma().$transaction(async (tx) => {
    await lockClinicAccountStructure(tx, input.clinicId);
    if (!(await operatorMayChangeClinicStatus(input.operatorUserId, tx))) {
      return { ok: false, error: CLINIC_STATUS_OPERATOR_MESSAGE };
    }

    const clinic = await tx.clinic.findUnique({
      where: { id: input.clinicId },
      select: {
        id: true,
        archivedAt: true,
        permanentlyDeletedAt: true,
      },
    });
    if (!clinic) {
      return { ok: false, error: CLINIC_STATUS_NOT_FOUND_MESSAGE };
    }
    if (clinic.permanentlyDeletedAt) {
      return {
        ok: false,
        error: CLINIC_PERMANENTLY_DELETED_REACTIVATE_MESSAGE,
      };
    }
    if (!clinic.archivedAt) {
      return { ok: false, error: CLINIC_NOT_ARCHIVED_MESSAGE };
    }

    await tx.clinic.update({
      where: { id: clinic.id },
      data: {
        archivedAt: null,
        archivedByUserId: null,
      },
    });

    return { ok: true };
  });
}
