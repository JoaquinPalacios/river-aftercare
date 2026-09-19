import "server-only";

import {
  ClinicMembershipRole,
  PlatformRole,
  type PrismaClient,
} from "@prisma/client";

import { logInvitationLifecycle } from "@/lib/auth/invitation-lifecycle-log";
import { INVITED_ROLE_INVALID_MESSAGE } from "@/lib/operator/clinic-invitation-input";
import { CLINIC_NOT_FOUND_MESSAGE } from "@/lib/operator/invite-clinic-user";
import { MEMBERSHIP_NOT_FOUND_MESSAGE } from "@/lib/operator/remove-clinic-access";
import { getPrisma } from "@/lib/prisma";

export const CANNOT_CHANGE_OPERATOR_ROLE_MESSAGE =
  "Platform operator accounts are not clinic members.";

export type ChangeClinicMembershipRoleResult =
  | { ok: true; userId: string; role: ClinicMembershipRole; unchanged: boolean }
  | { ok: false; error: string };

function parseClinicMembershipRole(role: string): ClinicMembershipRole | null {
  if (
    role === ClinicMembershipRole.ADMIN ||
    role === ClinicMembershipRole.STAFF
  ) {
    return role;
  }
  return null;
}

/**
 * Updates one ClinicMembership.role within the current clinic.
 * Does not change User.platformRole, password hash, sessions, or tokens.
 * Authorization (staff host + platform operator) lives in the Server Action.
 *
 * Clinic role is read from ClinicMembership on each request
 * (`getCurrentClinicMembership`); Auth.js sessions store user id only.
 * Changing role therefore takes effect on the next authorization read
 * without session invalidation.
 *
 * There is no last-admin guard: operator provisioning already allows
 * removing the only ADMIN and clinics with zero members.
 */
export async function changeClinicMembershipRole(input: {
  clinicId: string;
  membershipId: string;
  role: string;
  prisma?: PrismaClient;
}): Promise<ChangeClinicMembershipRoleResult> {
  const desiredRole = parseClinicMembershipRole(input.role);
  if (!desiredRole) {
    return { ok: false as const, error: INVITED_ROLE_INVALID_MESSAGE };
  }

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
        role: true,
        user: { select: { platformRole: true } },
      },
    });

    if (!membership || membership.clinicId !== clinic.id) {
      return { ok: false as const, error: MEMBERSHIP_NOT_FOUND_MESSAGE };
    }

    if (membership.user.platformRole === PlatformRole.OPERATOR) {
      return {
        ok: false as const,
        error: CANNOT_CHANGE_OPERATOR_ROLE_MESSAGE,
      };
    }

    if (membership.role === desiredRole) {
      return {
        ok: true as const,
        userId: membership.userId,
        role: desiredRole,
        unchanged: true,
      };
    }

    const updated = await tx.clinicMembership.updateMany({
      where: {
        id: membership.id,
        clinicId: clinic.id,
      },
      data: { role: desiredRole },
    });
    if (updated.count !== 1) {
      return { ok: false as const, error: MEMBERSHIP_NOT_FOUND_MESSAGE };
    }

    logInvitationLifecycle({
      event: "clinic_role_updated",
      userId: membership.userId,
      clinicId: clinic.id,
    });

    return {
      ok: true as const,
      userId: membership.userId,
      role: desiredRole,
      unchanged: false,
    };
  });
}
