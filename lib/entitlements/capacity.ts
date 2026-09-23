import "server-only";

import type { Prisma } from "@prisma/client";

import { lockClinicTeamCapacity } from "@/lib/entitlements/locks";
import {
  ENTITLEMENT_CODES,
  teamMemberLimitMessage,
} from "@/lib/entitlements/messages";
import { effectiveAllowances } from "@/lib/entitlements/plan-policy";
import {
  countTeamUsage,
  readStoredEntitlement,
} from "@/lib/entitlements/team-usage";
import { planGovernanceFromEntitlement } from "@/lib/entitlements/plan-policy";

export type TeamCapacityResult =
  | { ok: true }
  | {
      ok: false;
      code: typeof ENTITLEMENT_CODES.TEAM_MEMBER_LIMIT_REACHED;
      error: string;
    };

/**
 * Call inside the transaction that inserts the new occupied place, after
 * `lockClinicTeamCapacity` is held (this function takes that lock again;
 * PostgreSQL advisory locks are re-entrant in the same transaction).
 *
 * The check uses the effective allowance: base plan plus persistent
 * operator-granted extras. An operator does not bypass that limit.
 */
export async function reserveTeamPlace(
  tx: Prisma.TransactionClient,
  input: {
    clinicId: string;
    now: Date;
  }
): Promise<TeamCapacityResult> {
  await lockClinicTeamCapacity(tx, input.clinicId);
  const entitlement = await readStoredEntitlement(input.clinicId, tx);
  const governance = planGovernanceFromEntitlement({ entitlement });
  if (!governance.governed) {
    return { ok: true };
  }

  const usage = await countTeamUsage(tx, input.clinicId, input.now);
  const effective = effectiveAllowances(governance.policy.base, {
    teamMembers: entitlement?.extraTeamMemberAllowance ?? 0,
    customGuides: entitlement?.extraCustomGuideAllowance ?? 0,
    templateAdaptations: entitlement?.extraTemplateAdaptationAllowance ?? 0,
  });
  if (usage.occupiedPlaces < effective.teamMembers) {
    return { ok: true };
  }

  return {
    ok: false,
    code: ENTITLEMENT_CODES.TEAM_MEMBER_LIMIT_REACHED,
    error: teamMemberLimitMessage(effective.teamMembers),
  };
}
