import "server-only";

import { EntitlementStatus, type CommercialPlan } from "@prisma/client";

export type GroupCapacityMode =
  | "new_or_transitioning_into_group"
  | "established_legacy_group"
  | "established_converted_group"
  | "outside_group_quantity";

export type GroupSiteProjection =
  | {
      action: "project";
      mode: "new_or_transitioning_into_group" | "established_converted_group";
      quantity: number;
    }
  | {
      action: "preserve_legacy";
      mode: "established_legacy_group";
    }
  | {
      action: "require_subscription";
      mode: "new_or_transitioning_into_group" | "established_converted_group";
    }
  | {
      action: "omit";
      mode: GroupCapacityMode;
    };

type CapacityPrevious = {
  commercialPlan: CommercialPlan | null;
  entitlementStatus: EntitlementStatus;
  purchasedAdditionalSiteQuantity: number | null;
};

/**
 * Classifies the previous persisted row. The current event must not be
 * written before this runs, or a partial Group update could be read back
 * as legacy.
 *
 * Established Group means commercial plan Group and an entitlement that has
 * already left PENDING: ACTIVE, RESTRICTED, or ENDED.
 * Converted means that row stores a number, including 0.
 * Legacy means that row still stores null.
 * Every other previous row is outside Group until the projected plan is
 * Group, which is a new activation or a transition into Group.
 */
export function groupCapacityMode(input: {
  previous: CapacityPrevious | null;
  projectedPlan: CommercialPlan | null;
}): GroupCapacityMode {
  if (isConvertedGroup(input.previous)) {
    return input.projectedPlan === "GROUP"
      ? "established_converted_group"
      : "outside_group_quantity";
  }
  if (isLegacyUnconvertedGroup(input.previous)) {
    return input.projectedPlan === "GROUP"
      ? "established_legacy_group"
      : "outside_group_quantity";
  }
  if (input.projectedPlan === "GROUP") {
    return "new_or_transitioning_into_group";
  }
  return "outside_group_quantity";
}

/**
 * An ACTIVE Group projection can store N only from a retrieved valid Group
 * shape, including N=0 when the add-on item is absent.
 *
 * A new activation or a transition into Group, and an already converted
 * Group row, require that shape. Without it the caller must not apply the
 * projection: doing so would save ACTIVE Group with a null quantity and
 * make the next event treat the row as legacy.
 *
 * An established legacy Group keeps its stored totals and does not gain N.
 */
export function decideGroupSiteProjection(input: {
  projectedPlan: CommercialPlan | null;
  projectedEntitlementStatus: EntitlementStatus;
  classifiedQuantity: number | null;
  previous: CapacityPrevious | null;
}): GroupSiteProjection {
  const mode = groupCapacityMode({
    previous: input.previous,
    projectedPlan: input.projectedPlan,
  });
  const activeGroup =
    input.projectedPlan === "GROUP" &&
    input.projectedEntitlementStatus === EntitlementStatus.ACTIVE;

  if (
    activeGroup &&
    (mode === "new_or_transitioning_into_group" ||
      mode === "established_converted_group")
  ) {
    if (input.classifiedQuantity === null) {
      return { action: "require_subscription", mode };
    }
    return { action: "project", mode, quantity: input.classifiedQuantity };
  }

  if (
    mode === "established_legacy_group" &&
    activeGroup &&
    input.classifiedQuantity !== null
  ) {
    return { action: "preserve_legacy", mode };
  }

  return { action: "omit", mode };
}

export function isEstablishedGroup(
  previous: {
    commercialPlan: CommercialPlan | null;
    entitlementStatus: EntitlementStatus;
  } | null
): boolean {
  if (!previous) {
    return false;
  }
  return (
    previous.commercialPlan === "GROUP" &&
    previous.entitlementStatus !== EntitlementStatus.PENDING
  );
}

export function isConvertedGroup(previous: CapacityPrevious | null): boolean {
  return (
    isEstablishedGroup(previous) &&
    typeof previous?.purchasedAdditionalSiteQuantity === "number"
  );
}

export function isLegacyUnconvertedGroup(
  previous: CapacityPrevious | null
): boolean {
  return (
    isEstablishedGroup(previous) &&
    previous?.purchasedAdditionalSiteQuantity === null
  );
}
