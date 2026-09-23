import "server-only";

import type { Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/prisma";
import {
  customGuideLimitMessage,
  customGuideUsageLabel,
  ENTITLEMENT_CODES,
  templateAdaptationRequiredMessage,
  templateAdaptationUnavailableMessage,
  type EntitlementCode,
} from "@/lib/entitlements/messages";
import { lockClinicGuideCapacity } from "@/lib/entitlements/locks";
import type { PlanGovernance } from "@/lib/entitlements/plan-policy";
import { readPlanGovernance } from "@/lib/entitlements/team-usage";

type UsageClient = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

/**
 * A counted custom clinic guide is any PracticeGuide that is not pinned to a
 * canonical River template. That includes blank custom guides, adapted
 * copies (the pin is cleared), drafts, published guides, and disabled or
 * unpublished guides that still exist. Deleting the row frees the place.
 * Platform GuideTemplate rows are not PracticeGuides and do not count.
 */
export function practiceGuideCountsAsCustom(guide: {
  guideTemplateId: string | null;
}): boolean {
  return guide.guideTemplateId === null;
}

export async function countCustomGuides(
  prisma: UsageClient,
  clinicId: string
): Promise<number> {
  return prisma.practiceGuide.count({
    where: {
      clinicId,
      guideTemplateId: null,
    },
  });
}

export type GuideAllowanceSummary = {
  governed: boolean;
  commercialPlan: "ESSENTIAL" | "PRACTICE" | null;
  customGuideCount: number;
  planLimit: number | null;
  remainingPlaces: number | null;
  atLimit: boolean;
  canAdaptRiverTemplates: boolean;
  usageLabel: string | null;
  limitMessage: string | null;
};

export async function loadGuideAllowance(
  clinicId: string
): Promise<GuideAllowanceSummary> {
  const prisma = getPrisma();
  const governance = await readPlanGovernance(clinicId, prisma);
  const customGuideCount = await countCustomGuides(prisma, clinicId);
  return guideAllowanceFrom(governance, customGuideCount);
}

export function guideAllowanceFrom(
  governance: PlanGovernance,
  customGuideCount: number
): GuideAllowanceSummary {
  if (!governance.governed) {
    return {
      governed: false,
      commercialPlan: null,
      customGuideCount,
      planLimit: null,
      remainingPlaces: null,
      atLimit: false,
      canAdaptRiverTemplates: false,
      usageLabel: null,
      limitMessage: null,
    };
  }

  const planLimit = governance.policy.customGuideLimit;
  return {
    governed: true,
    commercialPlan: governance.policy.commercialPlan,
    customGuideCount,
    planLimit,
    remainingPlaces: Math.max(planLimit - customGuideCount, 0),
    atLimit: customGuideCount >= planLimit,
    canAdaptRiverTemplates: governance.policy.canAdaptRiverTemplates,
    usageLabel: customGuideUsageLabel(customGuideCount, planLimit),
    limitMessage: customGuideLimitMessage(
      governance.policy.commercialPlan,
      planLimit
    ),
  };
}

export type CustomGuideCapacityResult =
  { ok: true } | { ok: false; code: EntitlementCode; error: string };

export async function reserveCustomGuidePlace(
  tx: Prisma.TransactionClient,
  clinicId: string
): Promise<CustomGuideCapacityResult> {
  await lockClinicGuideCapacity(tx, clinicId);
  const governance = await readPlanGovernance(clinicId, tx);
  if (!governance.governed) {
    return { ok: true };
  }

  const customGuideCount = await countCustomGuides(tx, clinicId);
  if (customGuideCount < governance.policy.customGuideLimit) {
    return { ok: true };
  }

  return {
    ok: false,
    code: ENTITLEMENT_CODES.CUSTOM_GUIDE_LIMIT_REACHED,
    error: customGuideLimitMessage(
      governance.policy.commercialPlan,
      governance.policy.customGuideLimit
    ),
  };
}

export type TemplateAdaptationDecision =
  { ok: true } | { ok: false; code: EntitlementCode; error: string };

/**
 * Explicit adaptation is a Practice capability. Essential is refused.
 * Group and legacy clinics are not given a new adapt/fork action; they keep
 * in-place template editing. Practice also needs a free custom-guide place
 * because the adapted copy becomes a counted clinic-owned guide.
 */
export async function decideTemplateAdaptation(
  tx: Prisma.TransactionClient,
  clinicId: string
): Promise<TemplateAdaptationDecision> {
  await lockClinicGuideCapacity(tx, clinicId);
  const governance = await readPlanGovernance(clinicId, tx);
  if (!governance.governed || !governance.policy.canAdaptRiverTemplates) {
    return {
      ok: false,
      code: ENTITLEMENT_CODES.TEMPLATE_ADAPTATION_NOT_AVAILABLE,
      error: templateAdaptationUnavailableMessage(),
    };
  }

  const customGuideCount = await countCustomGuides(tx, clinicId);
  if (customGuideCount >= governance.policy.customGuideLimit) {
    return {
      ok: false,
      code: ENTITLEMENT_CODES.CUSTOM_GUIDE_LIMIT_REACHED,
      error: customGuideLimitMessage(
        governance.policy.commercialPlan,
        governance.policy.customGuideLimit
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
  if (!input.governance.policy.canAdaptRiverTemplates) {
    return {
      code: ENTITLEMENT_CODES.TEMPLATE_ADAPTATION_NOT_AVAILABLE,
      error: templateAdaptationUnavailableMessage(),
    };
  }
  return {
    code: ENTITLEMENT_CODES.TEMPLATE_ADAPTATION_REQUIRED,
    error: templateAdaptationRequiredMessage(),
  };
}
