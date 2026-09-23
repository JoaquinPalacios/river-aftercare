import "server-only";

import { PlatformRole, type Prisma } from "@prisma/client";

import { logInvitationLifecycle } from "@/lib/auth/invitation-lifecycle-log";
import { lockClinicTeamCapacity } from "@/lib/entitlements/locks";
import {
  ENTITLEMENT_CODES,
  operatorOverrideRequiredMessage,
  teamMemberLimitMessage,
} from "@/lib/entitlements/messages";
import {
  countTeamUsage,
  readPlanGovernance,
} from "@/lib/entitlements/team-usage";

export type TeamCapacityAction =
  "invitation" | "access_restored" | "reactivation";

export type TeamEntitlementCode =
  | typeof ENTITLEMENT_CODES.TEAM_MEMBER_LIMIT_REACHED
  | typeof ENTITLEMENT_CODES.OPERATOR_OVERRIDE_REQUIRED;

export type TeamCapacityResult =
  { ok: true } | { ok: false; code: TeamEntitlementCode; error: string };

/**
 * Call inside the transaction that inserts the new occupied place, after
 * `lockClinicTeamCapacity` is held (this function takes that lock again;
 * PostgreSQL advisory locks are re-entrant in the same transaction).
 *
 * An operator override is explicit and applies only to this call. It does
 * not change the clinic plan, Stripe, or future operations.
 * A clinic administrator who sends an override flag is still refused.
 */
export async function reserveTeamPlace(
  tx: Prisma.TransactionClient,
  input: {
    clinicId: string;
    now: Date;
    actorUserId: string;
    actorPlatformRole: PlatformRole;
    operatorOverride: boolean;
    action: TeamCapacityAction;
  }
): Promise<TeamCapacityResult> {
  await lockClinicTeamCapacity(tx, input.clinicId);
  const governance = await readPlanGovernance(input.clinicId, tx);
  if (!governance.governed) {
    return { ok: true };
  }

  const usage = await countTeamUsage(tx, input.clinicId, input.now);
  if (usage.occupiedPlaces < governance.policy.teamMemberLimit) {
    return { ok: true };
  }

  const explicitOperatorOverride =
    input.actorPlatformRole === PlatformRole.OPERATOR && input.operatorOverride;

  if (explicitOperatorOverride) {
    logInvitationLifecycle({
      event: "operator_team_allowance_override",
      actorUserId: input.actorUserId,
      clinicId: input.clinicId,
      action: input.action,
      occupiedPlaces: usage.occupiedPlaces,
      planLimit: governance.policy.teamMemberLimit,
    });
    return { ok: true };
  }

  if (input.actorPlatformRole === PlatformRole.OPERATOR) {
    return {
      ok: false,
      code: ENTITLEMENT_CODES.OPERATOR_OVERRIDE_REQUIRED,
      error: operatorOverrideRequiredMessage(),
    };
  }

  return {
    ok: false,
    code: ENTITLEMENT_CODES.TEAM_MEMBER_LIMIT_REACHED,
    error: teamMemberLimitMessage(governance.policy.teamMemberLimit),
  };
}
