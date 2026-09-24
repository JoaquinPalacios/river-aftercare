import "server-only";

import type { Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/prisma";
import {
  adaptedTemplateLimitMessage,
  adaptedTemplateUsageLabel,
  combinedGuideLimitMessage,
  combinedGuideUsageLabel,
  customGuideLimitMessage,
  customGuideUsageLabel,
  ENTITLEMENT_CODES,
  templateAdaptationRequiredMessage,
  templateAdaptationUnavailableMessage,
  type EntitlementCode,
} from "@/lib/entitlements/messages";
import { ACTIVE_PRACTICE_GUIDE_WHERE } from "@/lib/entitlements/active-guide";
import { lockClinicGuideCapacity } from "@/lib/entitlements/locks";
import {
  allowanceDimension,
  canCreateTemplateAdaptation,
  combinedGuideExtra,
  effectiveAllowances,
  planGovernanceFromEntitlement,
  type AllowanceAmounts,
  type PlanGovernance,
} from "@/lib/entitlements/plan-policy";
import {
  allowanceExtrasFrom,
  readStoredEntitlement,
} from "@/lib/entitlements/team-usage";

type UsageClient = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

export type GuideOriginFields = {
  guideTemplateId: string | null;
  sourceGuideTemplateId: string | null;
  adaptedAt?: Date | null;
};

/** River template enabled for the clinic and still pinned to the canonical revision. */
export function isPinnedRiverTemplate(guide: {
  guideTemplateId: string | null;
}): boolean {
  return guide.guideTemplateId !== null;
}

/** Clinic-owned guide that did not originate from a River template. */
export function isOriginalCustomGuide(guide: GuideOriginFields): boolean {
  return guide.guideTemplateId === null && guide.sourceGuideTemplateId === null;
}

/**
 * Clinic-owned editable copy of a River template.
 * The pin is cleared. sourceGuideTemplateId keeps the origin.
 */
export function isAdaptedTemplateGuide(guide: GuideOriginFields): boolean {
  return (
    guide.guideTemplateId === null &&
    guide.sourceGuideTemplateId !== null &&
    guide.adaptedAt != null
  );
}

export async function countOriginalCustomGuides(
  prisma: UsageClient,
  clinicId: string
): Promise<number> {
  return prisma.practiceGuide.count({
    where: {
      clinicId,
      guideTemplateId: null,
      sourceGuideTemplateId: null,
      ...ACTIVE_PRACTICE_GUIDE_WHERE,
    },
  });
}

export async function countAdaptedTemplateGuides(
  prisma: UsageClient,
  clinicId: string
): Promise<number> {
  return prisma.practiceGuide.count({
    where: {
      clinicId,
      guideTemplateId: null,
      sourceGuideTemplateId: { not: null },
      ...ACTIVE_PRACTICE_GUIDE_WHERE,
    },
  });
}

export type GuidePoolSummary = {
  used: number;
  baseLimit: number | null;
  extraAllowance: number | null;
  /** Effective allowance shown to the clinic. */
  planLimit: number | null;
  remainingPlaces: number | null;
  atLimit: boolean;
  usageLabel: string | null;
  limitMessage: string | null;
};

export type GuideAllowanceSummary = {
  governed: boolean;
  commercialPlan: "ESSENTIAL" | "PRACTICE" | null;
  customGuides: GuidePoolSummary;
  adaptedTemplates: GuidePoolSummary;
  combinedGuides: GuidePoolSummary;
};

function emptyPool(used: number): GuidePoolSummary {
  return {
    used,
    baseLimit: null,
    extraAllowance: null,
    planLimit: null,
    remainingPlaces: null,
    atLimit: false,
    usageLabel: null,
    limitMessage: null,
  };
}

export async function loadGuideAllowance(
  clinicId: string
): Promise<GuideAllowanceSummary> {
  const prisma = getPrisma();
  const entitlement = await readStoredEntitlement(clinicId, prisma);
  const governance = planGovernanceFromEntitlement({ entitlement });
  const customGuideCount = await countOriginalCustomGuides(prisma, clinicId);
  const adaptedCount = await countAdaptedTemplateGuides(prisma, clinicId);
  return guideAllowanceFrom(
    governance,
    allowanceExtrasFrom(entitlement),
    customGuideCount,
    adaptedCount
  );
}

export function guideAllowanceFrom(
  governance: PlanGovernance,
  extras: AllowanceAmounts,
  customGuideCount: number,
  adaptedCount: number
): GuideAllowanceSummary {
  const combinedUsed = customGuideCount + adaptedCount;
  if (!governance.governed) {
    return {
      governed: false,
      commercialPlan: null,
      customGuides: emptyPool(customGuideCount),
      adaptedTemplates: emptyPool(adaptedCount),
      combinedGuides: emptyPool(combinedUsed),
    };
  }

  const effective = effectiveAllowances(governance.policy.base, extras);
  const custom = allowanceDimension({
    used: customGuideCount,
    base: governance.policy.base.customGuides,
    extra: extras.customGuides,
  });
  const adapted = allowanceDimension({
    used: adaptedCount,
    base: governance.policy.base.templateAdaptations,
    extra: extras.templateAdaptations,
  });
  const combined = allowanceDimension({
    used: combinedUsed,
    base: governance.policy.base.combinedClinicOwnedGuides,
    extra: combinedGuideExtra(extras),
  });
  return {
    governed: true,
    commercialPlan: governance.policy.commercialPlan,
    customGuides: {
      used: custom.used,
      baseLimit: custom.base,
      extraAllowance: custom.extra,
      planLimit: custom.effective,
      remainingPlaces: custom.remaining,
      atLimit: custom.atLimit,
      usageLabel: customGuideUsageLabel(custom.used, custom.effective),
      limitMessage: customGuideLimitMessage(
        governance.policy.commercialPlan,
        effective.customGuides
      ),
    },
    adaptedTemplates: {
      used: adapted.used,
      baseLimit: adapted.base,
      extraAllowance: adapted.extra,
      planLimit: adapted.effective,
      remainingPlaces: adapted.remaining,
      atLimit: adapted.atLimit,
      usageLabel: adaptedTemplateUsageLabel(adapted.used, adapted.effective),
      limitMessage: adaptedTemplateLimitMessage(
        governance.policy.commercialPlan,
        effective.templateAdaptations
      ),
    },
    combinedGuides: {
      used: combined.used,
      baseLimit: combined.base,
      extraAllowance: combined.extra,
      planLimit: combined.effective,
      remainingPlaces: combined.remaining,
      atLimit: combined.atLimit,
      usageLabel: combinedGuideUsageLabel(combined.used, combined.effective),
      limitMessage: combinedGuideLimitMessage(
        governance.policy.commercialPlan,
        effective.combinedClinicOwnedGuides
      ),
    },
  };
}

export type GuideCapacityResult =
  { ok: true } | { ok: false; code: EntitlementCode; error: string };

export async function reserveCustomGuidePlace(
  tx: Prisma.TransactionClient,
  clinicId: string
): Promise<GuideCapacityResult> {
  await lockClinicGuideCapacity(tx, clinicId);
  const entitlement = await readStoredEntitlement(clinicId, tx);
  const governance = planGovernanceFromEntitlement({ entitlement });
  if (!governance.governed) {
    return { ok: true };
  }

  const extras = allowanceExtrasFrom(entitlement);
  const effective = effectiveAllowances(governance.policy.base, extras);
  const customGuideCount = await countOriginalCustomGuides(tx, clinicId);
  if (customGuideCount >= effective.customGuides) {
    return {
      ok: false,
      code: ENTITLEMENT_CODES.CUSTOM_GUIDE_LIMIT_REACHED,
      error: customGuideLimitMessage(
        governance.policy.commercialPlan,
        effective.customGuides
      ),
    };
  }

  const adaptedCount = await countAdaptedTemplateGuides(tx, clinicId);
  if (customGuideCount + adaptedCount >= effective.combinedClinicOwnedGuides) {
    return {
      ok: false,
      code: ENTITLEMENT_CODES.COMBINED_GUIDE_LIMIT_REACHED,
      error: combinedGuideLimitMessage(
        governance.policy.commercialPlan,
        effective.combinedClinicOwnedGuides
      ),
    };
  }

  return { ok: true };
}

export type TemplateAdaptationDecision =
  { ok: true } | { ok: false; code: EntitlementCode; error: string };

/**
 * First edit of a pinned River template forks a clinic-owned copy.
 * Essential and Practice both may do this while the editable-template
 * category and the combined clinic-owned ceiling both have room. The copy
 * does not consume an original custom-guide place. Group and legacy clinics
 * keep in-place editing and are not given this fork.
 *
 * Custom creation and this fork share `clinic-guide-capacity`. Both re-check
 * category usage and combined usage after taking that lock.
 */
export async function decideTemplateAdaptation(
  tx: Prisma.TransactionClient,
  clinicId: string
): Promise<TemplateAdaptationDecision> {
  await lockClinicGuideCapacity(tx, clinicId);
  const entitlement = await readStoredEntitlement(clinicId, tx);
  const governance = planGovernanceFromEntitlement({ entitlement });
  if (!governance.governed) {
    return {
      ok: false,
      code: ENTITLEMENT_CODES.TEMPLATE_ADAPTATION_NOT_AVAILABLE,
      error: templateAdaptationUnavailableMessage(),
    };
  }

  const extras = allowanceExtrasFrom(entitlement);
  const effective = effectiveAllowances(governance.policy.base, extras);
  const adaptedCount = await countAdaptedTemplateGuides(tx, clinicId);
  if (
    !canCreateTemplateAdaptation({
      used: adaptedCount,
      effective: effective.templateAdaptations,
    })
  ) {
    return {
      ok: false,
      code: ENTITLEMENT_CODES.ADAPTED_TEMPLATE_LIMIT_REACHED,
      error: adaptedTemplateLimitMessage(
        governance.policy.commercialPlan,
        effective.templateAdaptations
      ),
    };
  }

  const customGuideCount = await countOriginalCustomGuides(tx, clinicId);
  if (customGuideCount + adaptedCount >= effective.combinedClinicOwnedGuides) {
    return {
      ok: false,
      code: ENTITLEMENT_CODES.COMBINED_GUIDE_LIMIT_REACHED,
      error: combinedGuideLimitMessage(
        governance.policy.commercialPlan,
        effective.combinedClinicOwnedGuides
      ),
    };
  }

  return { ok: true };
}

export function governedTemplateEditBlock(input: {
  governance: PlanGovernance;
  contentChanged: boolean;
  templateBacked: boolean;
}): { code: EntitlementCode; error: string } | null {
  if (!input.templateBacked || !input.contentChanged) {
    return null;
  }
  if (!input.governance.governed) {
    return null;
  }
  return {
    code: ENTITLEMENT_CODES.TEMPLATE_ADAPTATION_REQUIRED,
    error: templateAdaptationRequiredMessage(),
  };
}
