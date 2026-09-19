import "server-only";

import {
  AccountTokenType,
  ClinicMembershipRole,
  PlatformRole,
} from "@prisma/client";

import { getPrisma } from "@/lib/prisma";

export type ClinicTeamStatus = "active" | "pending" | "expired";

export type ClinicTeamMember = {
  kind: "member";
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  role: ClinicMembershipRole;
  status: "active";
};

export type ClinicTeamInvitation = {
  kind: "invitation";
  userId: string;
  name: string | null;
  email: string;
  role: ClinicMembershipRole;
  status: "pending" | "expired";
  invitedAt: Date;
  expiresAt: Date;
};

export type ClinicTeamRow = ClinicTeamMember | ClinicTeamInvitation;

export type ClinicTeam = {
  clinicId: string;
  clinicName: string;
  rows: ClinicTeamRow[];
};

export async function listClinicTeam(
  clinicId: string,
  now: Date = new Date()
): Promise<ClinicTeam | null> {
  const prisma = getPrisma();
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: {
      id: true,
      name: true,
      profile: { select: { displayName: true } },
      memberships: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!clinic) {
    return null;
  }

  const invitationTokens = await prisma.accountToken.findMany({
    where: {
      clinicId: clinic.id,
      type: AccountTokenType.INVITATION,
      consumedAt: null,
      revokedAt: null,
      user: {
        passwordHash: null,
        platformRole: PlatformRole.NONE,
        memberships: { none: {} },
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      userId: true,
      role: true,
      createdAt: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  const latestByUser = new Map<string, (typeof invitationTokens)[number]>();
  for (const token of invitationTokens) {
    if (!latestByUser.has(token.userId)) {
      latestByUser.set(token.userId, token);
    }
  }

  const memberRows: ClinicTeamMember[] = clinic.memberships.map(
    (membership) => ({
      kind: "member",
      membershipId: membership.id,
      userId: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
      role: membership.role,
      status: "active",
    })
  );

  const invitationRows: ClinicTeamInvitation[] = [];
  for (const token of latestByUser.values()) {
    if (!token.role) {
      continue;
    }
    invitationRows.push({
      kind: "invitation",
      userId: token.user.id,
      name: token.user.name,
      email: token.user.email,
      role: token.role,
      status:
        token.expiresAt.getTime() <= now.getTime() ? "expired" : "pending",
      invitedAt: token.createdAt,
      expiresAt: token.expiresAt,
    });
  }

  invitationRows.sort((a, b) => a.email.localeCompare(b.email));

  return {
    clinicId: clinic.id,
    clinicName: clinic.profile?.displayName?.trim() || clinic.name,
    rows: [...memberRows, ...invitationRows],
  };
}
