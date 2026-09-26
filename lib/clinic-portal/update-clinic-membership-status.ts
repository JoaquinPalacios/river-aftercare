import "server-only";

import {
  ClinicMembershipRole,
  PlatformRole,
  type PrismaClient,
} from "@prisma/client";

import { logInvitationLifecycle } from "@/lib/auth/invitation-lifecycle-log";
import {
  actorCanManageClinic,
  type ClinicActor,
} from "@/lib/auth/clinic-authorization";
import { reserveTeamPlace } from "@/lib/entitlements/capacity";
import {
  lockClinicAccountStructure,
  lockClinicTeamCapacity,
} from "@/lib/entitlements/locks";
import { CLINIC_NOT_FOUND_MESSAGE } from "@/lib/operator/invite-clinic-user";
import { MEMBERSHIP_NOT_FOUND_MESSAGE } from "@/lib/operator/remove-clinic-access";
import { getPrisma } from "@/lib/prisma";

export const CANNOT_CHANGE_OPERATOR_MEMBERSHIP_MESSAGE =
  "Platform operator accounts are not clinic members.";
export const ONLY_STAFF_STATUS_MESSAGE =
  "Only clinic staff memberships can be activated or deactivated.";
export const FORBIDDEN_MEMBERSHIP_STATUS_MESSAGE =
  "You cannot change membership status for this clinic.";

export type UpdateClinicMembershipStatusResult =
  | { ok: true; membershipId: string; active: boolean; unchanged: boolean }
  | { ok: false; error: string; code?: string };

export async function updateClinicMembershipStatus(input: {
  actor: ClinicActor;
  clinicId: string;
  membershipId: string;
  active: boolean;
  now?: Date;
  prisma?: PrismaClient;
}): Promise<UpdateClinicMembershipStatusResult> {
  const prisma = input.prisma ?? getPrisma();

  const now = input.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    await lockClinicAccountStructure(tx, input.clinicId);
    await lockClinicTeamCapacity(tx, input.clinicId);
    const clinic = await tx.clinic.findUnique({
      where: { id: input.clinicId },
      select: { id: true },
    });
    if (!clinic) {
      return { ok: false as const, error: CLINIC_NOT_FOUND_MESSAGE };
    }

    const allowed = await actorCanManageClinic({
      actorUserId: input.actor.id,
      clinicId: clinic.id,
      prisma: tx,
    });
    if (!allowed) {
      return {
        ok: false as const,
        error: FORBIDDEN_MEMBERSHIP_STATUS_MESSAGE,
      };
    }

    const membership = await tx.clinicMembership.findUnique({
      where: { id: input.membershipId },
      select: {
        id: true,
        clinicId: true,
        userId: true,
        role: true,
        active: true,
        user: { select: { platformRole: true } },
      },
    });

    if (!membership || membership.clinicId !== clinic.id) {
      return { ok: false as const, error: MEMBERSHIP_NOT_FOUND_MESSAGE };
    }

    if (membership.user.platformRole === PlatformRole.OPERATOR) {
      return {
        ok: false as const,
        error: CANNOT_CHANGE_OPERATOR_MEMBERSHIP_MESSAGE,
      };
    }

    if (membership.role !== ClinicMembershipRole.STAFF) {
      return { ok: false as const, error: ONLY_STAFF_STATUS_MESSAGE };
    }

    if (membership.active === input.active) {
      return {
        ok: true as const,
        membershipId: membership.id,
        active: membership.active,
        unchanged: true,
      };
    }

    if (input.active) {
      const reserved = await reserveTeamPlace(tx, {
        clinicId: clinic.id,
        now,
      });
      if (!reserved.ok) {
        return {
          ok: false as const,
          error: reserved.error,
          code: reserved.code,
        };
      }
    }

    const updated = await tx.clinicMembership.updateMany({
      where: {
        id: membership.id,
        clinicId: clinic.id,
        role: ClinicMembershipRole.STAFF,
      },
      data: { active: input.active },
    });
    if (updated.count !== 1) {
      return { ok: false as const, error: MEMBERSHIP_NOT_FOUND_MESSAGE };
    }

    logInvitationLifecycle({
      event: input.active
        ? "clinic_membership_reactivated"
        : "clinic_membership_deactivated",
      userId: membership.userId,
      clinicId: clinic.id,
      actorUserId: input.actor.id,
    });

    return {
      ok: true as const,
      membershipId: membership.id,
      active: input.active,
      unchanged: false,
    };
  });
}
