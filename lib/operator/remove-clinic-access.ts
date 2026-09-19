import "server-only";

import { PlatformRole, type PrismaClient } from "@prisma/client";

import { logInvitationLifecycle } from "@/lib/auth/invitation-lifecycle-log";
import { deleteDatabaseSessionsForUser } from "@/lib/auth/session";
import { CLINIC_NOT_FOUND_MESSAGE } from "@/lib/operator/invite-clinic-user";
import { getPrisma } from "@/lib/prisma";

export const MEMBERSHIP_NOT_FOUND_MESSAGE =
  "That clinic access could not be found.";
export const CANNOT_REMOVE_OPERATOR_ACCESS_MESSAGE =
  "Platform operator accounts are not clinic members.";

export type RemoveClinicAccessResult =
  { ok: true; userId: string } | { ok: false; error: string };

export async function removeClinicAccess(input: {
  clinicId: string;
  membershipId: string;
  prisma?: PrismaClient;
}): Promise<RemoveClinicAccessResult> {
  const prisma = input.prisma ?? getPrisma();

  return prisma.$transaction(async (tx) => {
    const clinic = await tx.clinic.findUnique({
      where: { id: input.clinicId },
      select: { id: true },
    });
    if (!clinic) {
      return { ok: false as const, error: CLINIC_NOT_FOUND_MESSAGE };
    }

    const membership = await tx.clinicMembership.findUnique({
      where: { id: input.membershipId },
      select: {
        id: true,
        clinicId: true,
        userId: true,
        user: { select: { platformRole: true } },
      },
    });

    if (!membership || membership.clinicId !== clinic.id) {
      return { ok: false as const, error: MEMBERSHIP_NOT_FOUND_MESSAGE };
    }

    if (membership.user.platformRole === PlatformRole.OPERATOR) {
      return {
        ok: false as const,
        error: CANNOT_REMOVE_OPERATOR_ACCESS_MESSAGE,
      };
    }

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clinic-access:${membership.userId}`}))`;

    const deleted = await tx.clinicMembership.deleteMany({
      where: {
        id: membership.id,
        clinicId: clinic.id,
      },
    });
    if (deleted.count !== 1) {
      return { ok: false as const, error: MEMBERSHIP_NOT_FOUND_MESSAGE };
    }

    await deleteDatabaseSessionsForUser(membership.userId, tx);

    logInvitationLifecycle({
      event: "clinic_access_removed",
      userId: membership.userId,
      clinicId: clinic.id,
    });

    return { ok: true as const, userId: membership.userId };
  });
}
