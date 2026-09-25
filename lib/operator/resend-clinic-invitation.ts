import "server-only";

import {
  AccountTokenType,
  PlatformRole,
  type PrismaClient,
} from "@prisma/client";

import { createInvitationToken } from "@/lib/auth/account-token-service";
import { logInvitationLifecycle } from "@/lib/auth/invitation-lifecycle-log";
import { lockClinicTeamCapacity } from "@/lib/entitlements/locks";
import { deliverClinicInvitationEmail } from "@/lib/operator/deliver-clinic-invitation-email";
import {
  CLINIC_NOT_FOUND_MESSAGE,
  INVITATION_NOT_PENDING_MESSAGE,
} from "@/lib/operator/invite-clinic-user";
import { publicPracticeName } from "@/lib/clinics/patient-profile";
import { getPrisma } from "@/lib/prisma";

export type ResendClinicInvitationResult =
  | { ok: true; delivered: boolean; email: string; userId: string }
  | { ok: false; error: string };

export function canResendClinicInvitation(input: {
  passwordHash: string | null;
  platformRole: PlatformRole;
  membershipCount: number;
  latestInvitation: {
    clinicId: string | null;
    consumedAt: Date | null;
    revokedAt: Date | null;
    role: string | null;
  } | null;
  clinicId: string;
}): boolean {
  if (input.passwordHash !== null) {
    return false;
  }
  if (input.platformRole !== PlatformRole.NONE) {
    return false;
  }
  if (input.membershipCount > 0) {
    return false;
  }
  const latest = input.latestInvitation;
  if (!latest || latest.clinicId !== input.clinicId) {
    return false;
  }
  if (latest.consumedAt || latest.revokedAt || !latest.role) {
    return false;
  }
  return true;
}

export async function resendClinicInvitation(input: {
  clinicId: string;
  userId: string;
  invitedByUserId: string;
  now?: Date;
  prisma?: PrismaClient;
}): Promise<ResendClinicInvitationResult> {
  const now = input.now ?? new Date();
  const prisma = input.prisma ?? getPrisma();

  const created = await prisma.$transaction(async (tx) => {
    await lockClinicTeamCapacity(tx, input.clinicId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clinic-access:${input.userId}`}))`;

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
      return { ok: false as const, error: CLINIC_NOT_FOUND_MESSAGE };
    }

    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        platformRole: true,
        memberships: { select: { id: true } },
        accountTokens: {
          where: { type: AccountTokenType.INVITATION },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            clinicId: true,
            role: true,
            consumedAt: true,
            revokedAt: true,
          },
        },
      },
    });

    const latest = user?.accountTokens[0] ?? null;
    if (
      !user ||
      !canResendClinicInvitation({
        passwordHash: user.passwordHash,
        platformRole: user.platformRole,
        membershipCount: user.memberships.length,
        latestInvitation: latest,
        clinicId: clinic.id,
      }) ||
      !latest?.role
    ) {
      return { ok: false as const, error: INVITATION_NOT_PENDING_MESSAGE };
    }

    const createdToken = await createInvitationToken({
      userId: user.id,
      clinicId: clinic.id,
      role: latest.role,
      email: user.email,
      invitedByUserId: input.invitedByUserId,
      now,
      prisma: tx,
    });

    return {
      ok: true as const,
      rawToken: createdToken.rawToken,
      userId: user.id,
      email: user.email,
      name: user.name,
      clinicId: clinic.id,
      clinicName: publicPracticeName({
        siteDisplayName:
          clinic.sites.length === 1 && clinic.sites[0]?.clinicId === clinic.id
            ? clinic.sites[0].displayName
            : null,
        accountName: clinic.name,
      }),
      role: latest.role,
    };
  });

  if (!created.ok) {
    return created;
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
    event: "invitation_resent",
    userId: created.userId,
    clinicId: created.clinicId,
  });

  return {
    ok: true,
    delivered,
    email: created.email,
    userId: created.userId,
  };
}
