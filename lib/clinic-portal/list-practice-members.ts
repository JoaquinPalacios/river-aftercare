import "server-only";

import { ClinicMembershipRole } from "@prisma/client";

import { getPrisma } from "@/lib/prisma";

export type PracticeMemberRow = {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  role: ClinicMembershipRole;
  active: boolean;
};

export async function listPracticeMembers(
  clinicId: string
): Promise<PracticeMemberRow[]> {
  const memberships = await getPrisma().clinicMembership.findMany({
    where: { clinicId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      active: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return memberships.map((membership) => ({
    membershipId: membership.id,
    userId: membership.user.id,
    name: membership.user.name,
    email: membership.user.email,
    role: membership.role,
    active: membership.active,
  }));
}
