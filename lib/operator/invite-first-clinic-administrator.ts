import "server-only";

import { ClinicMembershipRole, type PrismaClient } from "@prisma/client";

import {
  inviteClinicUser,
  type InviteClinicUserResult,
} from "@/lib/operator/invite-clinic-user";

/**
 * First clinic administrator for assisted onboarding.
 * The role is fixed here. Callers do not supply it.
 */
export async function inviteFirstClinicAdministrator(input: {
  clinicId: string;
  invitedByUserId: string;
  name: string;
  email: string;
  now?: Date;
  prisma?: PrismaClient;
}): Promise<InviteClinicUserResult> {
  return inviteClinicUser({
    clinicId: input.clinicId,
    invitedByUserId: input.invitedByUserId,
    name: input.name,
    email: input.email,
    role: ClinicMembershipRole.ADMIN,
    now: input.now,
    prisma: input.prisma,
  });
}
