import "server-only";

import {
  AccountTokenType,
  ClinicMembershipRole,
  PlatformRole,
  type Prisma,
} from "@prisma/client";

import { getPrisma } from "@/lib/prisma";
import { teamUsageDetail, teamUsageLabel } from "@/lib/entitlements/messages";
import {
  effectiveAllowances,
  planGovernanceFromEntitlement,
  ZERO_ALLOWANCE_EXTRAS,
  type AllowanceAmounts,
  type PlanGovernance,
} from "@/lib/entitlements/plan-policy";

type UsageClient = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

export type TeamUsageCounts = {
  activeMemberCount: number;
  pendingInvitationCount: number;
  occupiedPlaces: number;
};

/**
 * Occupied team places for one clinic.
 *
 * Counts active ADMIN and STAFF memberships, excluding platform OPERATOR
 * accounts. Adds one reservation per distinct user who has a valid pending
 * invitation and does not already have an active membership. Revoked,
 * consumed, and expired tokens do not reserve a place. Several historical
 * tokens for the same user still reserve one place.
 */
export async function countTeamUsage(
  prisma: UsageClient,
  clinicId: string,
  now: Date = new Date()
): Promise<TeamUsageCounts> {
  const memberships = await prisma.clinicMembership.findMany({
    where: {
      clinicId,
      active: true,
      role: { in: [ClinicMembershipRole.ADMIN, ClinicMembershipRole.STAFF] },
      user: { platformRole: { not: PlatformRole.OPERATOR } },
    },
    select: { userId: true },
  });
  const invitations = await prisma.accountToken.findMany({
    where: {
      clinicId,
      type: AccountTokenType.INVITATION,
      consumedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    select: { userId: true },
    distinct: ["userId"],
  });

  const activeUserIds = new Set(
    memberships.map((membership) => membership.userId)
  );
  let pendingInvitationCount = 0;
  for (const invitation of invitations) {
    if (!activeUserIds.has(invitation.userId)) {
      pendingInvitationCount += 1;
    }
  }

  return {
    activeMemberCount: activeUserIds.size,
    pendingInvitationCount,
    occupiedPlaces: activeUserIds.size + pendingInvitationCount,
  };
}

export type StoredEntitlement = {
  commercialPlan: "ESSENTIAL" | "PRACTICE" | "GROUP" | null;
  extraTeamMemberAllowance: number;
  extraCustomGuideAllowance: number;
  extraTemplateAdaptationAllowance: number;
};

export async function readStoredEntitlement(
  clinicId: string,
  prisma: UsageClient = getPrisma()
): Promise<StoredEntitlement | null> {
  return prisma.clinicEntitlement.findUnique({
    where: { clinicId },
    select: {
      commercialPlan: true,
      extraTeamMemberAllowance: true,
      extraCustomGuideAllowance: true,
      extraTemplateAdaptationAllowance: true,
    },
  });
}

export function allowanceExtrasFrom(
  entitlement: StoredEntitlement | null
): AllowanceAmounts {
  if (!entitlement) {
    return ZERO_ALLOWANCE_EXTRAS;
  }
  return {
    teamMembers: entitlement.extraTeamMemberAllowance,
    customGuides: entitlement.extraCustomGuideAllowance,
    templateAdaptations: entitlement.extraTemplateAdaptationAllowance,
  };
}

export async function readPlanGovernance(
  clinicId: string,
  prisma: UsageClient = getPrisma()
): Promise<PlanGovernance> {
  const entitlement = await readStoredEntitlement(clinicId, prisma);
  return planGovernanceFromEntitlement({ entitlement });
}

export type TeamAllowanceSummary = {
  governed: boolean;
  occupiedPlaces: number;
  activeMemberCount: number;
  pendingInvitationCount: number;
  baseLimit: number | null;
  extraAllowance: number | null;
  /** Effective allowance: base plus persistent operator extras. */
  planLimit: number | null;
  remainingPlaces: number | null;
  atLimit: boolean;
  usageLabel: string | null;
  detailLabel: string | null;
};

export async function loadTeamAllowance(
  clinicId: string,
  now: Date = new Date()
): Promise<TeamAllowanceSummary> {
  const prisma = getPrisma();
  const entitlement = await readStoredEntitlement(clinicId, prisma);
  const governance = planGovernanceFromEntitlement({ entitlement });
  const usage = await countTeamUsage(prisma, clinicId, now);

  if (!governance.governed) {
    return {
      governed: false,
      ...usage,
      baseLimit: null,
      extraAllowance: null,
      planLimit: null,
      remainingPlaces: null,
      atLimit: false,
      usageLabel: null,
      detailLabel: null,
    };
  }

  const extras = allowanceExtrasFrom(entitlement);
  const effective = effectiveAllowances(governance.policy.base, extras);
  const planLimit = effective.teamMembers;
  const remainingPlaces = Math.max(planLimit - usage.occupiedPlaces, 0);
  return {
    governed: true,
    ...usage,
    baseLimit: governance.policy.base.teamMembers,
    extraAllowance: extras.teamMembers,
    planLimit,
    remainingPlaces,
    atLimit: usage.occupiedPlaces >= planLimit,
    usageLabel: teamUsageLabel(usage.occupiedPlaces, planLimit),
    detailLabel: teamUsageDetail(
      usage.activeMemberCount,
      usage.pendingInvitationCount
    ),
  };
}
