import "server-only";

import {
  ClinicMembershipRole,
  PlatformRole,
  Prisma,
  type PrismaClient,
} from "@prisma/client";

type ClinicAuthClient = PrismaClient | Prisma.TransactionClient;

import { getPrisma } from "@/lib/prisma";

function actorIsPlatformOperator(
  actor: { platformRole: PlatformRole } | null | undefined
): boolean {
  return actor?.platformRole === PlatformRole.OPERATOR;
}

export type ClinicActor = {
  id: string;
  platformRole: PlatformRole;
};

export type ClinicAccessDecision = {
  clinicExists: boolean;
  activeMembership: {
    id: string;
    role: ClinicMembershipRole;
  } | null;
};

export async function loadClinicAccess(
  actor: ClinicActor,
  clinicId: string,
  prisma: ClinicAuthClient = getPrisma()
): Promise<ClinicAccessDecision> {
  const [clinic, membership] = await Promise.all([
    prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true },
    }),
    prisma.clinicMembership.findUnique({
      where: {
        clinicId_userId: {
          clinicId,
          userId: actor.id,
        },
      },
      select: {
        id: true,
        role: true,
        active: true,
      },
    }),
  ]);

  return {
    clinicExists: Boolean(clinic),
    activeMembership:
      membership?.active === true
        ? { id: membership.id, role: membership.role }
        : null,
  };
}

export function canAccessClinic(
  actor: ClinicActor,
  access: ClinicAccessDecision
): boolean {
  if (!access.clinicExists) {
    return false;
  }
  if (actorIsPlatformOperator(actor)) {
    return true;
  }
  return access.activeMembership !== null;
}

export function canManageClinic(
  actor: ClinicActor,
  access: ClinicAccessDecision
): boolean {
  if (!access.clinicExists) {
    return false;
  }
  if (actorIsPlatformOperator(actor)) {
    return true;
  }
  return access.activeMembership?.role === ClinicMembershipRole.ADMIN;
}

export function canManageClinicBranding(
  actor: ClinicActor,
  access: ClinicAccessDecision
): boolean {
  return canManageClinic(actor, access);
}

export function canManageClinicMembers(
  actor: ClinicActor,
  access: ClinicAccessDecision
): boolean {
  return canManageClinic(actor, access);
}

export function canManageClinicGuides(
  actor: ClinicActor,
  access: ClinicAccessDecision
): boolean {
  return canManageClinic(actor, access);
}

export async function actorCanAccessClinic(input: {
  actorUserId: string;
  clinicId: string;
  prisma?: ClinicAuthClient;
}): Promise<boolean> {
  const prisma = input.prisma ?? getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: input.actorUserId },
    select: { id: true, platformRole: true },
  });
  if (!user) {
    return false;
  }
  const access = await loadClinicAccess(user, input.clinicId, prisma);
  return canAccessClinic(user, access);
}

export async function actorCanManageClinic(input: {
  actorUserId: string;
  clinicId: string;
  prisma?: ClinicAuthClient;
}): Promise<boolean> {
  const prisma = input.prisma ?? getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: input.actorUserId },
    select: { id: true, platformRole: true },
  });
  if (!user) {
    return false;
  }
  const access = await loadClinicAccess(user, input.clinicId, prisma);
  return canManageClinic(user, access);
}
