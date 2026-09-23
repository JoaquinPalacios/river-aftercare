import "server-only";

import { ClinicMembershipRole, PlatformRole } from "@prisma/client";

import {
  loadClinicAccess,
  type ClinicAccessDecision,
  type ClinicActor,
} from "@/lib/auth/clinic-authorization";

export const FORBIDDEN_MEMBER_INVITE_MESSAGE =
  "You cannot invite members for this clinic.";

/**
 * Who may invite a clinic member.
 *
 * `clinic_admin` is a normal clinic administrator of this clinic.
 * `platform_operator` is a platform operator. Operators do not need, and
 * this check does not create, a ClinicMembership.
 *
 * Plan allowances are enforced inside the membership transaction
 * (`reserveTeamPlace`), not by skipping the check for every operator.
 * Clinic administrators follow the included allowance. A platform operator
 * may pass an explicit override for that one operation. A posted override
 * flag from a clinic administrator is ignored. Operators do not become
 * clinic members and are not silently exempt from unrelated clinic rules.
 */
export type ClinicMemberInviteAuthority = {
  kind: "clinic_admin" | "platform_operator";
  userId: string;
  clinicId: string;
};

export function decideClinicMemberInvite(input: {
  actor: ClinicActor;
  clinicId: string;
  access: ClinicAccessDecision;
}): ClinicMemberInviteAuthority | null {
  if (!input.access.clinicExists) {
    return null;
  }

  if (input.actor.platformRole === PlatformRole.OPERATOR) {
    return {
      kind: "platform_operator",
      userId: input.actor.id,
      clinicId: input.clinicId,
    };
  }

  if (input.access.activeMembership?.role === ClinicMembershipRole.ADMIN) {
    return {
      kind: "clinic_admin",
      userId: input.actor.id,
      clinicId: input.clinicId,
    };
  }

  return null;
}

export async function authorizeClinicMemberInvite(input: {
  actor: ClinicActor;
  clinicId: string;
}): Promise<ClinicMemberInviteAuthority | null> {
  const access = await loadClinicAccess(input.actor, input.clinicId);
  return decideClinicMemberInvite({
    actor: input.actor,
    clinicId: input.clinicId,
    access,
  });
}
