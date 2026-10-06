import "server-only";

import { AccountTokenType, PlatformRole } from "@prisma/client";

import { findOpenAccountSplitInvolvingClinic } from "@/lib/account-split/snapshot";
import { lockAccountSplit } from "@/lib/account-split/locks";
import { CLINIC_PERMANENTLY_DELETED_REACTIVATE_MESSAGE } from "@/lib/clinics/permanent-clinic-deletion";
import { lockClinicAccountStructure } from "@/lib/entitlements/locks";
import { getPrisma } from "@/lib/prisma";

export const CLINIC_DEACTIVATION_SPLIT_MESSAGE =
  "Finish or cancel the open account split before deactivating this clinic.";

export const CLINIC_STATUS_OPERATOR_MESSAGE =
  "Only a platform operator can change clinic status.";

export const CLINIC_STATUS_NOT_FOUND_MESSAGE =
  "That clinic could not be found.";

async function operatorMayChangeClinicStatus(
  userId: string,
  tx: Parameters<typeof lockClinicAccountStructure>[0]
): Promise<boolean> {
  const operator = await tx.user.findUnique({
    where: { id: userId },
    select: { platformRole: true },
  });
  return operator?.platformRole === PlatformRole.OPERATOR;
}

/**
 * Closes customer and patient use of one clinic without changing child
 * activity, publication, membership, entitlement, or Stripe rows.
 * Outstanding invitations are revoked. Password-reset and email-change
 * tokens are left alone.
 */
export async function deactivateClinic(input: {
  clinicId: string;
  operatorUserId: string;
  now?: Date;
  /**
   * Test seam. Runs after this clinic's structure lock and split lock,
   * before the open-split re-read and the deactivation write.
   */
  afterLocks?: () => Promise<void> | void;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = input.now ?? new Date();
  const deactivate = async (
    tx: Parameters<typeof lockClinicAccountStructure>[0]
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    await lockClinicAccountStructure(tx, input.clinicId);
    await lockAccountSplit(tx, input.clinicId);
    if (input.afterLocks) {
      await input.afterLocks();
    }
    if (!(await operatorMayChangeClinicStatus(input.operatorUserId, tx))) {
      return { ok: false as const, error: CLINIC_STATUS_OPERATOR_MESSAGE };
    }

    const clinic = await tx.clinic.findUnique({
      where: { id: input.clinicId },
      select: { id: true, deactivatedAt: true },
    });
    if (!clinic) {
      return { ok: false, error: CLINIC_STATUS_NOT_FOUND_MESSAGE };
    }

    const openSplit = await findOpenAccountSplitInvolvingClinic(clinic.id, tx);
    if (openSplit) {
      return { ok: false, error: CLINIC_DEACTIVATION_SPLIT_MESSAGE };
    }

    if (!clinic.deactivatedAt) {
      await tx.clinic.update({
        where: { id: clinic.id },
        data: {
          deactivatedAt: now,
          deactivatedByUserId: input.operatorUserId,
        },
      });
    }

    await tx.accountToken.updateMany({
      where: {
        clinicId: clinic.id,
        type: AccountTokenType.INVITATION,
        consumedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });

    return { ok: true };
  };
  if (input.afterLocks) {
    return getPrisma().$transaction(deactivate, {
      maxWait: 10_000,
      timeout: 20_000,
    });
  }
  return getPrisma().$transaction(deactivate);
}

/**
 * Clears clinic deactivation. Sites, locations, guides, memberships,
 * revoked invitations, entitlements, and Stripe ids stay as they are.
 */
export async function reactivateClinic(input: {
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
      select: { id: true, deactivatedAt: true, permanentlyDeletedAt: true },
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

    if (clinic.deactivatedAt) {
      await tx.clinic.update({
        where: { id: clinic.id },
        data: {
          deactivatedAt: null,
          deactivatedByUserId: null,
        },
      });
    }

    return { ok: true };
  });
}
