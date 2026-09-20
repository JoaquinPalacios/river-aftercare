import "server-only";

import { randomUUID } from "node:crypto";

import {
  ClinicMembershipRole,
  PlatformRole,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { cache } from "react";

import { auth } from "@/auth";
import { AUTH_SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session-cookie";
import {
  OPERATOR_SUPPORT_MEMBERSHIP_ID,
  readOperatorSupportClinic,
} from "@/lib/auth/operator-support-clinic";
import { getPrisma } from "@/lib/prisma";

type SessionClient = PrismaClient | Prisma.TransactionClient;

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  platformRole: PlatformRole;
}

export interface ClinicMembershipContext {
  membershipId: string;
  role: ClinicMembershipRole;
  clinic: {
    id: string;
    name: string;
  };
  source?: "membership" | "operator_support";
}

export interface AuthContext {
  user: AuthenticatedUser | null;
  clinicMembership: ClinicMembershipContext | null;
}

export interface DatabaseSessionRecord {
  sessionToken: string;
  expires: Date;
}

export class MultipleClinicMembershipsError extends Error {
  constructor(userId: string, clinicIds: string[]) {
    super(
      `Expected exactly one effective clinic membership for user "${userId}" during MVP auth resolution, but found memberships for clinics: ${clinicIds.join(", ")}.`
    );
    this.name = "MultipleClinicMembershipsError";
  }
}

export function isPlatformOperator(
  user: { platformRole: PlatformRole } | null | undefined
): boolean {
  return user?.platformRole === PlatformRole.OPERATOR;
}

export function postLoginPath(input: {
  platformRole: PlatformRole;
  hasClinicMembership: boolean;
}): string {
  if (
    !input.hasClinicMembership &&
    input.platformRole === PlatformRole.OPERATOR
  ) {
    return "/operator/clinics";
  }

  return "/dashboard";
}

export async function createDatabaseSession(
  userId: string,
  client: SessionClient = getPrisma()
): Promise<DatabaseSessionRecord> {
  return client.session.create({
    data: {
      sessionToken: randomUUID(),
      userId,
      expires: new Date(Date.now() + AUTH_SESSION_MAX_AGE_SECONDS * 1000),
    },
    select: {
      sessionToken: true,
      expires: true,
    },
  });
}

export async function deleteDatabaseSession(sessionToken: string) {
  await getPrisma().session.deleteMany({
    where: { sessionToken },
  });
}

export async function deleteDatabaseSessionsForUser(
  userId: string,
  client: SessionClient = getPrisma()
) {
  await client.session.deleteMany({
    where: { userId },
  });
}

export const getCurrentUser = cache(
  async (): Promise<AuthenticatedUser | null> => {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return null;
    }

    return getPrisma().user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        platformRole: true,
      },
    });
  }
);

export const getCurrentClinicMembership = cache(
  async (): Promise<ClinicMembershipContext | null> => {
    const user = await getCurrentUser();

    if (!user) {
      return null;
    }

    const memberships = await getPrisma().clinicMembership.findMany({
      where: { userId: user.id, active: true },
      select: {
        id: true,
        role: true,
        clinic: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (memberships.length === 0) {
      return null;
    }

    if (memberships.length > 1) {
      throw new MultipleClinicMembershipsError(
        user.id,
        memberships.map((membership) => membership.clinic.id)
      );
    }

    const [membership] = memberships;

    return {
      membershipId: membership.id,
      role: membership.role,
      clinic: membership.clinic,
      source: "membership",
    };
  }
);

export const getAuthContext = cache(async (): Promise<AuthContext> => {
  const user = await getCurrentUser();

  if (!user) {
    return {
      user: null,
      clinicMembership: null,
    };
  }

  return {
    user,
    clinicMembership: await resolveClinicMembershipContext(user),
  };
});

async function resolveClinicMembershipContext(
  user: AuthenticatedUser
): Promise<ClinicMembershipContext | null> {
  const membership = await getCurrentClinicMembership();
  if (membership) {
    return membership;
  }

  if (!isPlatformOperator(user)) {
    return null;
  }

  const supportClinic = await readOperatorSupportClinic();
  if (!supportClinic) {
    return null;
  }

  return {
    membershipId: OPERATOR_SUPPORT_MEMBERSHIP_ID,
    role: ClinicMembershipRole.ADMIN,
    clinic: supportClinic,
    source: "operator_support",
  };
}
