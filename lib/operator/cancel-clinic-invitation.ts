import "server-only";

import {
  AccountTokenType,
  PlatformRole,
  type PrismaClient,
} from "@prisma/client";

import { revokeOutstandingInvitations } from "@/lib/auth/account-token-service";
import { logInvitationLifecycle } from "@/lib/auth/invitation-lifecycle-log";
import {
  CLINIC_NOT_FOUND_MESSAGE,
  INVITATION_NOT_PENDING_MESSAGE,
} from "@/lib/operator/invite-clinic-user";
import { canResendClinicInvitation } from "@/lib/operator/resend-clinic-invitation";
import { getPrisma } from "@/lib/prisma";

export type CancelClinicInvitationResult =
  { ok: true; userId: string } | { ok: false; error: string };

export async function cancelClinicInvitation(input: {
  clinicId: string;
  userId: string;
  now?: Date;
  prisma?: PrismaClient;
}): Promise<CancelClinicInvitationResult> {
  const now = input.now ?? new Date();
  const prisma = input.prisma ?? getPrisma();

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clinic-access:${input.userId}`}))`;

    const clinic = await tx.clinic.findUnique({
      where: { id: input.clinicId },
      select: { id: true },
    });
    if (!clinic) {
      return { ok: false as const, error: CLINIC_NOT_FOUND_MESSAGE };
    }

    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
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
      })
    ) {
      return { ok: false as const, error: INVITATION_NOT_PENDING_MESSAGE };
    }

    await revokeOutstandingInvitations({
      userId: user.id,
      clinicId: clinic.id,
      now,
      prisma: tx,
    });

    logInvitationLifecycle({
      event: "invitation_cancelled",
      userId: user.id,
      clinicId: clinic.id,
    });

    return { ok: true as const, userId: user.id };
  });
}
