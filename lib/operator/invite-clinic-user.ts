import "server-only";

import {
  AccountTokenType,
  ClinicMembershipRole,
  PlatformRole,
  type PrismaClient,
} from "@prisma/client";

import {
  AccountTokenError,
  createInvitationToken,
  normalizeAccountTokenEmail,
} from "@/lib/auth/account-token-service";
import { logInvitationLifecycle } from "@/lib/auth/invitation-lifecycle-log";
import { LOGIN_EMAIL_MAX_LENGTH } from "@/lib/auth/login-input";
import {
  INVITED_EMAIL_INVALID_MESSAGE,
  INVITED_EMAIL_MAX_MESSAGE,
  INVITED_EMAIL_REQUIRED_MESSAGE,
  INVITED_NAME_REQUIRED_MESSAGE,
  INVITED_ROLE_INVALID_MESSAGE,
  invitedNameError,
  normalizeInvitedName,
} from "@/lib/operator/clinic-invitation-input";
import { deliverClinicInvitationEmail } from "@/lib/operator/deliver-clinic-invitation-email";
import { reserveTeamPlace } from "@/lib/entitlements/capacity";
import {
  lockClinicAccountStructure,
  lockClinicTeamCapacity,
} from "@/lib/entitlements/locks";
import { ENTITLEMENT_CODES } from "@/lib/entitlements/messages";
import { publicPracticeName } from "@/lib/clinics/patient-profile";
import { getPrisma } from "@/lib/prisma";

export const ALREADY_MEMBER_MESSAGE =
  "This user already has access to this clinic.";
export const OTHER_CLINIC_MEMBER_MESSAGE =
  "This user already belongs to another clinic. Multi-clinic access is not supported yet.";
export const PLATFORM_OPERATOR_INVITE_MESSAGE =
  "This account is a River Aftercare platform operator.";
export const PENDING_SAME_CLINIC_MESSAGE =
  "This user already has a pending invitation. Resend it from the team list.";
export const PENDING_OTHER_CLINIC_MESSAGE =
  "This user already belongs to another clinic. Multi-clinic access is not supported yet.";
export const CLINIC_NOT_FOUND_MESSAGE = "That clinic could not be found.";
export const INVITATION_DELIVERY_FAILED_MESSAGE =
  "Invitation created, but the email could not be sent. Try resending it.";
export const INVITATION_NOT_PENDING_MESSAGE =
  "This invitation is no longer pending.";

export type InviteClinicUserErrorCode =
  | "invalid_name"
  | "invalid_email"
  | "invalid_role"
  | "clinic_not_found"
  | "already_member"
  | "other_clinic_member"
  | "platform_operator"
  | "pending_same_clinic"
  | "pending_other_clinic"
  | typeof ENTITLEMENT_CODES.TEAM_MEMBER_LIMIT_REACHED;

export type InviteClinicUserOutcome = "INVITATION_SENT" | "ACCESS_RESTORED";

export type InviteClinicUserResult =
  | {
      ok: true;
      outcome: "INVITATION_SENT";
      delivered: boolean;
      email: string;
      userId: string;
    }
  | {
      ok: true;
      outcome: "ACCESS_RESTORED";
      email: string;
      userId: string;
    }
  | {
      ok: false;
      code: InviteClinicUserErrorCode;
      error: string;
      fieldErrors?: {
        name?: string;
        email?: string;
        role?: string;
      };
    };

function invitationEmailError(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) {
    return INVITED_EMAIL_REQUIRED_MESSAGE;
  }
  if (trimmed.length > LOGIN_EMAIL_MAX_LENGTH) {
    return INVITED_EMAIL_MAX_MESSAGE;
  }
  try {
    normalizeAccountTokenEmail(email);
    return null;
  } catch (error) {
    if (error instanceof AccountTokenError) {
      return INVITED_EMAIL_INVALID_MESSAGE;
    }
    throw error;
  }
}

function parseRole(role: string): ClinicMembershipRole | null {
  if (
    role === ClinicMembershipRole.ADMIN ||
    role === ClinicMembershipRole.STAFF
  ) {
    return role;
  }
  return null;
}

function isUsableInvitation(
  token: {
    consumedAt: Date | null;
    revokedAt: Date | null;
    expiresAt: Date;
  },
  now: Date
): boolean {
  return (
    token.consumedAt === null &&
    token.revokedAt === null &&
    token.expiresAt.getTime() > now.getTime()
  );
}

export async function inviteClinicUser(input: {
  clinicId: string;
  invitedByUserId: string;
  name: string;
  email: string;
  role: string;
  now?: Date;
  prisma?: PrismaClient;
}): Promise<InviteClinicUserResult> {
  const nameError = invitedNameError(input.name);
  if (nameError) {
    return {
      ok: false,
      code: "invalid_name",
      error: nameError,
      fieldErrors: { name: nameError },
    };
  }
  const name = normalizeInvitedName(input.name);
  if (!name) {
    const fallbackNameError =
      invitedNameError(input.name) ?? INVITED_NAME_REQUIRED_MESSAGE;
    return {
      ok: false,
      code: "invalid_name",
      error: fallbackNameError,
      fieldErrors: { name: fallbackNameError },
    };
  }

  const emailError = invitationEmailError(input.email);
  if (emailError) {
    return {
      ok: false,
      code: "invalid_email",
      error: emailError,
      fieldErrors: { email: emailError },
    };
  }

  const role = parseRole(input.role);
  if (!role) {
    return {
      ok: false,
      code: "invalid_role",
      error: INVITED_ROLE_INVALID_MESSAGE,
      fieldErrors: { role: INVITED_ROLE_INVALID_MESSAGE },
    };
  }

  let email: string;
  try {
    email = normalizeAccountTokenEmail(input.email);
  } catch (error) {
    if (error instanceof AccountTokenError) {
      return {
        ok: false,
        code: "invalid_email",
        error: INVITED_EMAIL_INVALID_MESSAGE,
        fieldErrors: { email: INVITED_EMAIL_INVALID_MESSAGE },
      };
    }
    throw error;
  }

  const now = input.now ?? new Date();
  const prisma = input.prisma ?? getPrisma();

  const created = await prisma.$transaction(async (tx) => {
    await lockClinicAccountStructure(tx, input.clinicId);
    await lockClinicTeamCapacity(tx, input.clinicId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clinic-invite-email:${email}`}))`;

    const clinic = await tx.clinic.findUnique({
      where: { id: input.clinicId },
      select: {
        id: true,
        name: true,
        sites: {
          where: { isPrimary: true, active: true },
          select: { displayName: true, clinicId: true },
        },
      },
    });
    if (!clinic) {
      return { ok: false as const, code: "clinic_not_found" as const };
    }

    const existing = await tx.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        platformRole: true,
        memberships: {
          select: { clinicId: true },
        },
      },
    });

    const primarySite =
      clinic.sites.length === 1 && clinic.sites[0]?.clinicId === clinic.id
        ? clinic.sites[0]
        : null;
    const clinicName = publicPracticeName({
      siteDisplayName: primarySite?.displayName,
      accountName: clinic.name,
    });

    if (!existing) {
      const reserved = await reserveTeamPlace(tx, {
        clinicId: clinic.id,
        now,
      });
      if (!reserved.ok) {
        return {
          ok: false as const,
          code: reserved.code,
          error: reserved.error,
        };
      }

      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash: null,
          platformRole: PlatformRole.NONE,
        },
        select: { id: true, email: true, name: true },
      });

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clinic-access:${user.id}`}))`;

      const createdToken = await createInvitationToken({
        userId: user.id,
        clinicId: clinic.id,
        role,
        email: user.email,
        invitedByUserId: input.invitedByUserId,
        now,
        prisma: tx,
      });

      return {
        ok: true as const,
        outcome: "INVITATION_SENT" as const,
        rawToken: createdToken.rawToken,
        userId: user.id,
        email: user.email,
        name: user.name,
        clinicId: clinic.id,
        clinicName,
        role,
      };
    }

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clinic-access:${existing.id}`}))`;

    const latestUser = await tx.user.findUnique({
      where: { id: existing.id },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        platformRole: true,
        memberships: {
          select: { clinicId: true },
        },
      },
    });
    if (!latestUser) {
      return { ok: false as const, code: "clinic_not_found" as const };
    }

    if (latestUser.platformRole === PlatformRole.OPERATOR) {
      return { ok: false as const, code: "platform_operator" as const };
    }

    const sameClinic = latestUser.memberships.some(
      (membership) => membership.clinicId === clinic.id
    );
    if (sameClinic) {
      return { ok: false as const, code: "already_member" as const };
    }
    if (latestUser.memberships.length > 0) {
      return { ok: false as const, code: "other_clinic_member" as const };
    }

    if (latestUser.passwordHash) {
      const reserved = await reserveTeamPlace(tx, {
        clinicId: clinic.id,
        now,
      });
      if (!reserved.ok) {
        return {
          ok: false as const,
          code: reserved.code,
          error: reserved.error,
        };
      }

      await tx.clinicMembership.create({
        data: {
          clinicId: clinic.id,
          userId: latestUser.id,
          role,
        },
      });

      return {
        ok: true as const,
        outcome: "ACCESS_RESTORED" as const,
        userId: latestUser.id,
        email: latestUser.email,
        clinicId: clinic.id,
      };
    }

    const invitations = await tx.accountToken.findMany({
      where: {
        userId: latestUser.id,
        type: AccountTokenType.INVITATION,
      },
      orderBy: { createdAt: "desc" },
      select: {
        clinicId: true,
        consumedAt: true,
        revokedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    const latest = invitations[0];
    const thisClinicHistory = invitations.some(
      (token) => token.clinicId === clinic.id
    );
    const otherClinicHistory = invitations.some(
      (token) => token.clinicId && token.clinicId !== clinic.id
    );

    if (latest?.clinicId === clinic.id && isUsableInvitation(latest, now)) {
      return { ok: false as const, code: "pending_same_clinic" as const };
    }

    if (latest?.clinicId && latest.clinicId !== clinic.id) {
      return { ok: false as const, code: "pending_other_clinic" as const };
    }

    if (otherClinicHistory && !thisClinicHistory) {
      return { ok: false as const, code: "pending_other_clinic" as const };
    }

    if (latestUser.name !== name) {
      await tx.user.update({
        where: { id: latestUser.id },
        data: { name },
      });
    }

    const reserved = await reserveTeamPlace(tx, {
      clinicId: clinic.id,
      now,
    });
    if (!reserved.ok) {
      return {
        ok: false as const,
        code: reserved.code,
        error: reserved.error,
      };
    }

    const createdToken = await createInvitationToken({
      userId: latestUser.id,
      clinicId: clinic.id,
      role,
      email: latestUser.email,
      invitedByUserId: input.invitedByUserId,
      now,
      prisma: tx,
    });

    return {
      ok: true as const,
      outcome: "INVITATION_SENT" as const,
      rawToken: createdToken.rawToken,
      userId: latestUser.id,
      email: latestUser.email,
      name,
      clinicId: clinic.id,
      clinicName,
      role,
    };
  });

  if (!created.ok) {
    if (created.code === ENTITLEMENT_CODES.TEAM_MEMBER_LIMIT_REACHED) {
      return {
        ok: false,
        code: created.code,
        error: created.error,
      };
    }

    const messages: Record<
      Exclude<
        InviteClinicUserErrorCode,
        | "invalid_name"
        | "invalid_email"
        | "invalid_role"
        | typeof ENTITLEMENT_CODES.TEAM_MEMBER_LIMIT_REACHED
      >,
      string
    > = {
      clinic_not_found: CLINIC_NOT_FOUND_MESSAGE,
      already_member: ALREADY_MEMBER_MESSAGE,
      other_clinic_member: OTHER_CLINIC_MEMBER_MESSAGE,
      platform_operator: PLATFORM_OPERATOR_INVITE_MESSAGE,
      pending_same_clinic: PENDING_SAME_CLINIC_MESSAGE,
      pending_other_clinic: PENDING_OTHER_CLINIC_MESSAGE,
    };
    return {
      ok: false,
      code: created.code,
      error: messages[created.code],
    };
  }

  if (created.outcome === "ACCESS_RESTORED") {
    logInvitationLifecycle({
      event: "clinic_access_restored",
      userId: created.userId,
      clinicId: created.clinicId,
    });
    return {
      ok: true,
      outcome: "ACCESS_RESTORED",
      email: created.email,
      userId: created.userId,
    };
  }

  const delivered = await deliverClinicInvitationEmail({
    to: created.email,
    rawToken: created.rawToken,
    clinicName: created.clinicName,
    role: created.role,
    inviteeName: created.name,
    userId: created.userId,
    clinicId: created.clinicId,
  });

  logInvitationLifecycle({
    event: "invitation_created",
    userId: created.userId,
    clinicId: created.clinicId,
  });

  return {
    ok: true,
    outcome: "INVITATION_SENT",
    delivered,
    email: created.email,
    userId: created.userId,
  };
}
