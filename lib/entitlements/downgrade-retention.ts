import "server-only";

import type { CommercialPlan, Prisma } from "@prisma/client";

import {
  isAdaptedTemplateGuide,
  isOriginalCustomGuide,
  type GuideOriginFields,
} from "@/lib/entitlements/guide-usage";
import { lockClinicGuideCapacity } from "@/lib/entitlements/locks";
import {
  effectiveAllowances,
  PLAN_ENTITLEMENT_POLICIES,
  type AllowanceAmounts,
} from "@/lib/entitlements/plan-policy";
import { logDowngradeRetentionAnomaly } from "@/lib/entitlements/downgrade-selection-log";
import { getPrisma } from "@/lib/prisma";

export { ACTIVE_PRACTICE_GUIDE_WHERE } from "@/lib/entitlements/active-guide";

/**
 * Excess clinic-owned guides stay recoverable for 60 days after the
 * Practice → Essential price actually changes. This is separate from
 * ClinicEntitlement.publicGuideRetentionUntil, which starts when a
 * subscription ends.
 */
export const DOWNGRADE_GUIDE_RETENTION_DAYS = 60;

export const RETAINED_GUIDE_READ_ONLY_MESSAGE =
  "This guide is retained after the move to Essential and cannot be edited.";

export const RETENTION_EXPIRED_MESSAGE =
  "The 60-day recovery period for this guide has ended.";

export type RetentionGuideFields = GuideOriginFields & {
  id: string;
  downgradeRetainedAt: Date | null;
  downgradeRetentionUntil: Date | null;
};

export type EssentialGuideLimits = {
  custom: number;
  adapted: number;
  combined: number;
};

export function isDowngradeRetained(guide: {
  downgradeRetainedAt: Date | null;
}): boolean {
  return guide.downgradeRetainedAt !== null;
}

export function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function downgradeRetentionUntilFrom(transitionAt: Date): Date {
  return addUtcDays(transitionAt, DOWNGRADE_GUIDE_RETENTION_DAYS);
}

/** Open while now is strictly before retentionUntil. The deadline itself is expired. */
export function downgradeRetentionIsOpen(
  guide: {
    downgradeRetainedAt: Date | null;
    downgradeRetentionUntil: Date | null;
  },
  now: Date
): boolean {
  if (!guide.downgradeRetainedAt || !guide.downgradeRetentionUntil) {
    return false;
  }
  return now.getTime() < guide.downgradeRetentionUntil.getTime();
}

/**
 * Direct patient URL visibility is the stricter of clinic-level public-guide
 * access and this guide's downgrade window.
 * A longer clinic retention period does not extend a downgrade-retained guide.
 * A downgrade window does not keep a guide public after the clinic's own
 * public-guide access has ended.
 */
export function downgradeRetainedDirectUrlVisible(input: {
  downgradeRetainedAt: Date | null;
  downgradeRetentionUntil: Date | null;
  clinicGuidesRemainPublic: boolean;
  now: Date;
}): boolean {
  if (!input.clinicGuidesRemainPublic) {
    return false;
  }
  if (!input.downgradeRetainedAt) {
    return true;
  }
  return downgradeRetentionIsOpen(
    {
      downgradeRetainedAt: input.downgradeRetainedAt,
      downgradeRetentionUntil: input.downgradeRetentionUntil,
    },
    input.now
  );
}

export function essentialGuideLimits(
  extras: AllowanceAmounts
): EssentialGuideLimits {
  const effective = effectiveAllowances(
    PLAN_ENTITLEMENT_POLICIES.ESSENTIAL.base,
    extras
  );
  return {
    custom: effective.customGuides,
    adapted: effective.templateAdaptations,
    combined: effective.combinedClinicOwnedGuides,
  };
}

export function isSelectableClinicOwnedGuide(
  guide: GuideOriginFields & { downgradeRetainedAt?: Date | null }
): boolean {
  if (guide.downgradeRetainedAt) {
    return false;
  }
  return isOriginalCustomGuide(guide) || isAdaptedTemplateGuide(guide);
}

export type RetentionPlan = {
  retainGuideIds: string[];
  retentionUntil: Date | null;
  clearPreparation: boolean;
  anomaly: "none" | "missing_selection" | "invalid_selection";
  selectedCustom: number;
  selectedAdapted: number;
  selectedCombined: number;
};

function classifyOwned(guides: RetentionGuideFields[]): {
  active: RetentionGuideFields[];
  custom: number;
  adapted: number;
} {
  const active = guides.filter(
    (guide) =>
      guide.downgradeRetainedAt === null &&
      (isOriginalCustomGuide(guide) || isAdaptedTemplateGuide(guide))
  );
  return {
    active,
    custom: active.filter((guide) => isOriginalCustomGuide(guide)).length,
    adapted: active.filter((guide) => isAdaptedTemplateGuide(guide)).length,
  };
}

export function selectionCountsForGuides(
  guides: Array<
    GuideOriginFields & { id: string; downgradeRetainedAt?: Date | null }
  >,
  selectedIds: ReadonlySet<string>
): { custom: number; adapted: number; combined: number } {
  let custom = 0;
  let adapted = 0;
  for (const guide of guides) {
    if (!selectedIds.has(guide.id) || !isSelectableClinicOwnedGuide(guide)) {
      continue;
    }
    if (isOriginalCustomGuide(guide)) {
      custom += 1;
    } else if (isAdaptedTemplateGuide(guide)) {
      adapted += 1;
    }
  }
  return { custom, adapted, combined: custom + adapted };
}

export function selectionFitsLimits(
  counts: { custom: number; adapted: number; combined: number },
  limits: EssentialGuideLimits
): boolean {
  return (
    counts.custom <= limits.custom &&
    counts.adapted <= limits.adapted &&
    counts.combined <= limits.combined
  );
}

/**
 * Decides which active clinic-owned guides become retained at the Essential
 * transition. Already-retained guides are left untouched. Pinned River
 * templates are ignored. A fitting active set keeps every clinic-owned guide.
 */
export function planDowngradeGuideRetention(input: {
  previousPlan: CommercialPlan | null;
  projectedPlan: CommercialPlan | null;
  cancellationSuperseded: boolean;
  transitionAt: Date;
  limits: EssentialGuideLimits;
  guides: RetentionGuideFields[];
  confirmedSelectedIds: string[] | null;
}): RetentionPlan {
  const empty: RetentionPlan = {
    retainGuideIds: [],
    retentionUntil: null,
    clearPreparation: false,
    anomaly: "none",
    selectedCustom: 0,
    selectedAdapted: 0,
    selectedCombined: 0,
  };

  if (input.cancellationSuperseded && input.projectedPlan !== "ESSENTIAL") {
    return { ...empty, clearPreparation: true };
  }

  if (
    input.previousPlan !== "PRACTICE" ||
    input.projectedPlan !== "ESSENTIAL"
  ) {
    return empty;
  }

  const owned = classifyOwned(input.guides);
  const activeFits = selectionFitsLimits(
    {
      custom: owned.custom,
      adapted: owned.adapted,
      combined: owned.custom + owned.adapted,
    },
    input.limits
  );
  if (activeFits) {
    return { ...empty, clearPreparation: true };
  }

  if (!input.confirmedSelectedIds) {
    return {
      ...empty,
      clearPreparation: true,
      anomaly: "missing_selection",
      selectedCustom: owned.custom,
      selectedAdapted: owned.adapted,
      selectedCombined: owned.custom + owned.adapted,
    };
  }

  const selectedIds = new Set(input.confirmedSelectedIds);
  const counts = selectionCountsForGuides(owned.active, selectedIds);
  const valid = selectionFitsLimits(counts, input.limits);
  const retainGuideIds = owned.active
    .filter((guide) => !selectedIds.has(guide.id))
    .map((guide) => guide.id);

  return {
    retainGuideIds,
    retentionUntil: downgradeRetentionUntilFrom(input.transitionAt),
    clearPreparation: true,
    anomaly: valid ? "none" : "invalid_selection",
    selectedCustom: counts.custom,
    selectedAdapted: counts.adapted,
    selectedCombined: counts.combined,
  };
}

type RetentionClient = Prisma.TransactionClient;

function hasRetentionDelegates(db: object): db is RetentionClient {
  return (
    "practiceGuide" in db &&
    "clinicDowngradePreparation" in db &&
    "clinicEntitlement" in db &&
    "$executeRaw" in db
  );
}

/**
 * Applies retention inside the caller's transaction.
 * Replays do not move retainedAt: only rows that are still null are updated.
 * No-ops when the client cannot see guide tables (narrow webhook test doubles).
 */
export async function applyDowngradeGuideTransition(input: {
  db: object;
  clinicId: string;
  previousPlan: CommercialPlan | null;
  projectedPlan: CommercialPlan | null;
  transitionAt: Date;
  cancellationSuperseded: boolean;
}): Promise<void> {
  if (!hasRetentionDelegates(input.db)) {
    return;
  }
  const db = input.db;

  const shouldConsider =
    (input.cancellationSuperseded && input.projectedPlan !== "ESSENTIAL") ||
    (input.previousPlan === "PRACTICE" && input.projectedPlan === "ESSENTIAL");
  if (!shouldConsider) {
    return;
  }

  await lockClinicGuideCapacity(db, input.clinicId);

  const entitlement = await db.clinicEntitlement.findUnique({
    where: { clinicId: input.clinicId },
    select: {
      extraCustomGuideAllowance: true,
      extraTemplateAdaptationAllowance: true,
    },
  });
  const limits = essentialGuideLimits({
    teamMembers: 0,
    customGuides: entitlement?.extraCustomGuideAllowance ?? 0,
    templateAdaptations: entitlement?.extraTemplateAdaptationAllowance ?? 0,
  });
  const guides = await db.practiceGuide.findMany({
    where: { clinicId: input.clinicId },
    select: {
      id: true,
      guideTemplateId: true,
      sourceGuideTemplateId: true,
      adaptedAt: true,
      downgradeRetainedAt: true,
      downgradeRetentionUntil: true,
    },
  });
  const preparation = await db.clinicDowngradePreparation.findUnique({
    where: { clinicId: input.clinicId },
    select: {
      status: true,
      selections: { select: { practiceGuideId: true } },
    },
  });
  const confirmedSelectedIds =
    preparation?.status === "SELECTION_CONFIRMED"
      ? preparation.selections.map((row) => row.practiceGuideId)
      : null;
  const plan = planDowngradeGuideRetention({
    previousPlan: input.previousPlan,
    projectedPlan: input.projectedPlan,
    cancellationSuperseded: input.cancellationSuperseded,
    transitionAt: input.transitionAt,
    limits,
    guides,
    confirmedSelectedIds,
  });

  if (plan.anomaly !== "none") {
    logDowngradeRetentionAnomaly({
      event:
        plan.anomaly === "invalid_selection"
          ? "downgrade_retention_selection_invalid"
          : "downgrade_retention_missing_selection",
      clinicId: input.clinicId,
      customCount: plan.selectedCustom,
      adaptedCount: plan.selectedAdapted,
      combinedCount: plan.selectedCombined,
      customLimit: limits.custom,
      adaptedLimit: limits.adapted,
      combinedLimit: limits.combined,
    });
  }

  if (plan.retainGuideIds.length > 0 && plan.retentionUntil) {
    await db.practiceGuide.updateMany({
      where: {
        clinicId: input.clinicId,
        id: { in: plan.retainGuideIds },
        downgradeRetainedAt: null,
      },
      data: {
        downgradeRetainedAt: input.transitionAt,
        downgradeRetentionUntil: plan.retentionUntil,
      },
    });
  }

  if (plan.clearPreparation) {
    await db.clinicDowngradePreparation.deleteMany({
      where: { clinicId: input.clinicId },
    });
  }
}

export async function clearClinicDowngradePreparation(
  clinicId: string,
  db:
    | Pick<Prisma.TransactionClient, "clinicDowngradePreparation">
    | ReturnType<typeof getPrisma> = getPrisma()
): Promise<void> {
  await db.clinicDowngradePreparation.deleteMany({ where: { clinicId } });
}
