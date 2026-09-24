import "server-only";

import {
  ClinicMembershipRole,
  DowngradePreparationStatus,
  PracticeGuideStatus,
  type Prisma,
} from "@prisma/client";

import { clinicEntitlementIsActive } from "@/lib/billing/activation-gate";
import { logDowngradeGuideSelection } from "@/lib/entitlements/downgrade-selection-log";
import { type EssentialDowngradeReadiness } from "@/lib/entitlements/downgrade-readiness";
import {
  essentialGuideLimits,
  isSelectableClinicOwnedGuide,
  RETENTION_EXPIRED_MESSAGE,
  selectionCountsForGuides,
  selectionFitsLimits,
  type EssentialGuideLimits,
} from "@/lib/entitlements/downgrade-retention";
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
import { allowanceExtrasFrom } from "@/lib/entitlements/team-usage";
import { getPrisma } from "@/lib/prisma";
import { formatPortalDate } from "@/lib/clinic-portal/format-portal-date";

export const GUIDE_SELECTION_REQUIRED_MESSAGE =
  "Clinic guide selection required.";

export const GUIDE_SELECTION_WAITING_MESSAGE =
  "Waiting for clinic administrator to choose guides.";

export const GUIDE_SELECTION_COMPLETE_MESSAGE = "Guide selection complete.";

export const TEAM_DOWNGRADE_BLOCK_MESSAGE =
  "Team usage must be resolved before downgrade.";

export const SCHEDULED_SELECTION_EXTRA_BLOCK_MESSAGE =
  "This allowance reduction would make the confirmed Essential guide selection too large. Change the guide selection or remove the scheduled downgrade before lowering the allowance.";

export const SCHEDULED_USAGE_EXTRA_BLOCK_MESSAGE =
  "This allowance reduction would leave more active clinic-owned guides than Essential allows for the scheduled downgrade. Choose guides to keep or remove the scheduled downgrade before lowering the allowance.";

export type ConfirmedGuideKeep = {
  confirmed: true;
  customCount: number;
  adaptedCount: number;
  combinedCount: number;
};

export type KeepSelectionCode =
  | "unknown_guide"
  | "not_selectable"
  | "over_custom"
  | "over_adapted"
  | "over_combined"
  | "forbidden"
  | "preparation_required"
  | "not_practice";

export type SelectableGuideRecord = GuideOriginFields & {
  id: string;
  clinicId: string;
  downgradeRetainedAt: Date | null;
};

export function actorMayConfirmDowngradeSelection(input: {
  membershipRole: ClinicMembershipRole | null;
  membershipActive: boolean;
  operatorSupport: boolean;
}): boolean {
  if (input.operatorSupport) {
    return false;
  }
  return (
    input.membershipActive &&
    input.membershipRole === ClinicMembershipRole.ADMIN
  );
}

export function confirmedSelectionFitsReadiness(
  readiness: EssentialDowngradeReadiness,
  selection: ConfirmedGuideKeep | null | undefined
): boolean {
  if (!selection?.confirmed) {
    return false;
  }
  return selectionFitsLimits(
    {
      custom: selection.customCount,
      adapted: selection.adaptedCount,
      combined: selection.combinedCount,
    },
    {
      custom: readiness.guides.limit,
      adapted: readiness.adaptedTemplates.limit,
      combined: readiness.combinedGuides.limit,
    }
  );
}

export function validateKeepSelection(input: {
  clinicId: string;
  guides: SelectableGuideRecord[];
  selectedIds: string[];
  limits: EssentialGuideLimits;
}):
  | {
      ok: true;
      ids: string[];
      custom: number;
      adapted: number;
      combined: number;
    }
  | { ok: false; code: KeepSelectionCode } {
  const uniqueIds = [...new Set(input.selectedIds)];
  const byId = new Map(input.guides.map((guide) => [guide.id, guide]));
  const chosen: SelectableGuideRecord[] = [];
  for (const id of uniqueIds) {
    const guide = byId.get(id);
    if (!guide || guide.clinicId !== input.clinicId) {
      return { ok: false, code: "unknown_guide" };
    }
    if (!isSelectableClinicOwnedGuide(guide)) {
      return { ok: false, code: "not_selectable" };
    }
    chosen.push(guide);
  }
  const counts = selectionCountsForGuides(chosen, new Set(uniqueIds));
  if (counts.custom > input.limits.custom) {
    return { ok: false, code: "over_custom" };
  }
  if (counts.adapted > input.limits.adapted) {
    return { ok: false, code: "over_adapted" };
  }
  if (counts.combined > input.limits.combined) {
    return { ok: false, code: "over_combined" };
  }
  return { ok: true, ids: uniqueIds, ...counts };
}

export function assessOperatorExtraChangeForDowngrade(input: {
  scheduled: boolean;
  preparationConfirmed: boolean;
  selectionFitsNextLimits: boolean;
  activeUsageFitsNextLimits: boolean;
}): { blocked: boolean; unconfirmSelection: boolean; error: string | null } {
  if (
    input.scheduled &&
    input.preparationConfirmed &&
    !input.selectionFitsNextLimits
  ) {
    return {
      blocked: true,
      unconfirmSelection: false,
      error: SCHEDULED_SELECTION_EXTRA_BLOCK_MESSAGE,
    };
  }
  if (
    input.scheduled &&
    !input.preparationConfirmed &&
    !input.activeUsageFitsNextLimits
  ) {
    return {
      blocked: true,
      unconfirmSelection: false,
      error: SCHEDULED_USAGE_EXTRA_BLOCK_MESSAGE,
    };
  }
  if (
    !input.scheduled &&
    input.preparationConfirmed &&
    !input.selectionFitsNextLimits
  ) {
    return { blocked: false, unconfirmSelection: true, error: null };
  }
  return { blocked: false, unconfirmSelection: false, error: null };
}

export function keepSelectionMessage(code: KeepSelectionCode): string {
  switch (code) {
    case "unknown_guide":
      return "Choose guides that belong to this clinic.";
    case "not_selectable":
      return "Only active clinic-owned guides can be kept. River templates used as supplied stay available and are not part of this choice.";
    case "over_custom":
      return "That selection includes more custom guides than Essential allows.";
    case "over_adapted":
      return "That selection includes more edited River templates than Essential allows.";
    case "over_combined":
      return "That selection includes more clinic-owned guides than Essential allows.";
    case "forbidden":
      return "A clinic administrator needs to confirm which guides to keep.";
    case "preparation_required":
      return "Guide selection is not open for this clinic yet.";
    case "not_practice":
      return "Guide selection is only used while the clinic is on Practice.";
  }
}

const guideSelect = {
  id: true,
  clinicId: true,
  title: true,
  status: true,
  isEnabled: true,
  updatedAt: true,
  guideTemplateId: true,
  sourceGuideTemplateId: true,
  adaptedAt: true,
  downgradeRetainedAt: true,
} as const;

export async function loadConfirmedDowngradeSelection(
  clinicId: string
): Promise<ConfirmedGuideKeep | null> {
  const preparation = await getPrisma().clinicDowngradePreparation.findUnique({
    where: { clinicId },
    select: {
      status: true,
      selections: {
        select: {
          practiceGuide: { select: guideSelect },
        },
      },
    },
  });
  if (
    !preparation ||
    preparation.status !== DowngradePreparationStatus.SELECTION_CONFIRMED
  ) {
    return null;
  }
  const guides = preparation.selections.map((row) => row.practiceGuide);
  const counts = selectionCountsForGuides(
    guides,
    new Set(guides.map((guide) => guide.id))
  );
  return {
    confirmed: true,
    customCount: counts.custom,
    adaptedCount: counts.adapted,
    combinedCount: counts.combined,
  };
}

export type DowngradePreparationSnapshot = {
  status: "awaiting" | "confirmed";
  selectedIds: string[];
  selectedCustom: number;
  selectedAdapted: number;
  selectedCombined: number;
};

export async function loadDowngradePreparationSnapshot(
  clinicId: string
): Promise<DowngradePreparationSnapshot | null> {
  const preparation = await getPrisma().clinicDowngradePreparation.findUnique({
    where: { clinicId },
    select: {
      status: true,
      selections: {
        select: {
          practiceGuide: { select: guideSelect },
        },
      },
    },
  });
  if (!preparation) {
    return null;
  }
  const guides = preparation.selections.map((row) => row.practiceGuide);
  const counts = selectionCountsForGuides(
    guides,
    new Set(guides.map((guide) => guide.id))
  );
  return {
    status:
      preparation.status === DowngradePreparationStatus.SELECTION_CONFIRMED
        ? "confirmed"
        : "awaiting",
    selectedIds: guides
      .filter((guide) => isSelectableClinicOwnedGuide(guide))
      .map((guide) => guide.id),
    selectedCustom: counts.custom,
    selectedAdapted: counts.adapted,
    selectedCombined: counts.combined,
  };
}

export async function beginClinicPlanDowngrade(input: {
  clinicId: string;
}): Promise<
  | {
      ok: true;
      guideSelectionRequired: boolean;
      status: "none" | "awaiting" | "confirmed";
    }
  | { ok: false; error: string }
> {
  const prisma = getPrisma();
  const [entitlement, entitlementActive] = await Promise.all([
    prisma.clinicEntitlement.findUnique({
      where: { clinicId: input.clinicId },
      select: {
        commercialPlan: true,
        billingInterval: true,
        billingStatus: true,
        cancelAtPeriodEnd: true,
        scheduledCommercialPlan: true,
        extraCustomGuideAllowance: true,
        extraTemplateAdaptationAllowance: true,
      },
    }),
    clinicEntitlementIsActive(input.clinicId),
  ]);
  const profile = await prisma.clinicBillingProfile.findUnique({
    where: { clinicId: input.clinicId },
    select: { stripeSubscriptionId: true, stripeCheckoutSessionId: true },
  });
  if (entitlement?.commercialPlan === "GROUP") {
    return { ok: false, error: "That plan change is not available." };
  }
  if (entitlement?.commercialPlan === "ESSENTIAL") {
    return { ok: false, error: "This clinic is already on Essential." };
  }
  if (
    entitlement?.commercialPlan !== "PRACTICE" ||
    !entitlement.billingInterval ||
    !profile?.stripeSubscriptionId ||
    !entitlementActive ||
    entitlement.billingStatus !== "ACTIVE" ||
    entitlement.cancelAtPeriodEnd ||
    entitlement.scheduledCommercialPlan
  ) {
    return {
      ok: false,
      error:
        "This plan change is available once the Practice subscription is active.",
    };
  }
  const existing = await loadDowngradePreparationSnapshot(input.clinicId);
  const guides = await prisma.practiceGuide.findMany({
    where: { clinicId: input.clinicId, downgradeRetainedAt: null },
    select: guideSelect,
  });
  const activeOwned = guides.filter((guide) =>
    isSelectableClinicOwnedGuide(guide)
  );
  const counts = selectionCountsForGuides(
    activeOwned,
    new Set(activeOwned.map((guide) => guide.id))
  );
  const limits = essentialGuideLimits({
    teamMembers: 0,
    customGuides: entitlement.extraCustomGuideAllowance,
    templateAdaptations: entitlement.extraTemplateAdaptationAllowance,
  });
  if (selectionFitsLimits(counts, limits)) {
    return {
      ok: true,
      guideSelectionRequired: false,
      status: existing?.status ?? "none",
    };
  }
  if (existing) {
    return {
      ok: true,
      guideSelectionRequired: true,
      status: existing.status,
    };
  }
  await prisma.clinicDowngradePreparation.create({
    data: {
      clinicId: input.clinicId,
      targetPlan: "ESSENTIAL",
      status: DowngradePreparationStatus.AWAITING_SELECTION,
    },
  });
  return { ok: true, guideSelectionRequired: true, status: "awaiting" };
}

async function clinicAdminMayConfirm(
  tx: Prisma.TransactionClient,
  input: { actorUserId: string; clinicId: string; operatorSupport: boolean }
): Promise<boolean> {
  if (input.operatorSupport) {
    return false;
  }
  const membership = await tx.clinicMembership.findUnique({
    where: {
      clinicId_userId: {
        clinicId: input.clinicId,
        userId: input.actorUserId,
      },
    },
    select: { role: true, active: true },
  });
  return actorMayConfirmDowngradeSelection({
    membershipRole: membership?.role ?? null,
    membershipActive: membership?.active === true,
    operatorSupport: false,
  });
}

export async function confirmClinicDowngradeSelection(input: {
  actorUserId: string;
  clinicId: string;
  selectedIds: string[];
  operatorSupport?: boolean;
  now?: Date;
}): Promise<
  | { ok: true; custom: number; adapted: number; combined: number }
  | { ok: false; code: KeepSelectionCode }
> {
  const now = input.now ?? new Date();
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    await lockClinicGuideCapacity(tx, input.clinicId);
    const allowed = await clinicAdminMayConfirm(tx, {
      actorUserId: input.actorUserId,
      clinicId: input.clinicId,
      operatorSupport: input.operatorSupport === true,
    });
    if (!allowed) {
      return { ok: false as const, code: "forbidden" as const };
    }
    const entitlement = await tx.clinicEntitlement.findUnique({
      where: { clinicId: input.clinicId },
      select: {
        commercialPlan: true,
        extraCustomGuideAllowance: true,
        extraTemplateAdaptationAllowance: true,
      },
    });
    if (entitlement?.commercialPlan !== "PRACTICE") {
      return { ok: false as const, code: "not_practice" as const };
    }
    const preparation = await tx.clinicDowngradePreparation.findUnique({
      where: { clinicId: input.clinicId },
      select: { id: true },
    });
    if (!preparation) {
      return { ok: false as const, code: "preparation_required" as const };
    }
    const guides = await tx.practiceGuide.findMany({
      where: { clinicId: input.clinicId },
      select: guideSelect,
    });
    const limits = essentialGuideLimits({
      teamMembers: 0,
      customGuides: entitlement.extraCustomGuideAllowance,
      templateAdaptations: entitlement.extraTemplateAdaptationAllowance,
    });
    const validated = validateKeepSelection({
      clinicId: input.clinicId,
      guides,
      selectedIds: input.selectedIds,
      limits,
    });
    if (!validated.ok) {
      return validated;
    }
    await tx.downgradeGuideSelection.deleteMany({
      where: { preparationId: preparation.id },
    });
    if (validated.ids.length > 0) {
      await tx.downgradeGuideSelection.createMany({
        data: validated.ids.map((practiceGuideId) => ({
          preparationId: preparation.id,
          practiceGuideId,
        })),
      });
    }
    await tx.clinicDowngradePreparation.update({
      where: { id: preparation.id },
      data: {
        status: DowngradePreparationStatus.SELECTION_CONFIRMED,
        confirmedAt: now,
        confirmedByUserId: input.actorUserId,
        targetPlan: "ESSENTIAL",
      },
    });
    logDowngradeGuideSelection({
      event: "downgrade_guide_selection_confirmed",
      clinicId: input.clinicId,
      actorUserId: input.actorUserId,
      customCount: validated.custom,
      adaptedCount: validated.adapted,
      combinedCount: validated.combined,
    });
    return {
      ok: true as const,
      custom: validated.custom,
      adapted: validated.adapted,
      combined: validated.combined,
    };
  });
}

type ExtraDowngradeContext = {
  confirmed: boolean;
  scheduled: boolean;
  selection: { custom: number; adapted: number; combined: number };
  activeCustom: number;
  activeAdapted: number;
  commercialPlan: "ESSENTIAL" | "PRACTICE" | "GROUP" | null;
};

export async function loadExtraDowngradeContext(
  tx: Prisma.TransactionClient,
  clinicId: string
): Promise<ExtraDowngradeContext> {
  const [preparation, entitlement, guides] = await Promise.all([
    tx.clinicDowngradePreparation.findUnique({
      where: { clinicId },
      select: {
        status: true,
        selections: {
          select: { practiceGuide: { select: guideSelect } },
        },
      },
    }),
    tx.clinicEntitlement.findUnique({
      where: { clinicId },
      select: { scheduledCommercialPlan: true, commercialPlan: true },
    }),
    tx.practiceGuide.findMany({
      where: { clinicId, downgradeRetainedAt: null },
      select: guideSelect,
    }),
  ]);
  const selectedGuides =
    preparation?.selections.map((row) => row.practiceGuide) ?? [];
  const selection = selectionCountsForGuides(
    selectedGuides,
    new Set(selectedGuides.map((guide) => guide.id))
  );
  const activeIds = guides
    .filter((guide) => isSelectableClinicOwnedGuide(guide))
    .map((guide) => guide.id);
  const active = selectionCountsForGuides(guides, new Set(activeIds));
  const commercialPlan = entitlement?.commercialPlan ?? null;
  return {
    confirmed:
      preparation?.status === DowngradePreparationStatus.SELECTION_CONFIRMED,
    scheduled: entitlement?.scheduledCommercialPlan === "ESSENTIAL",
    selection,
    activeCustom: active.custom,
    activeAdapted: active.adapted,
    commercialPlan,
  };
}

export function nextEssentialGuideLimits(
  extras: AllowanceAmounts
): EssentialGuideLimits {
  return essentialGuideLimits(extras);
}

export function currentPlanGuideLimits(
  commercialPlan: "ESSENTIAL" | "PRACTICE",
  extras: AllowanceAmounts
): EssentialGuideLimits {
  const effective = effectiveAllowances(
    PLAN_ENTITLEMENT_POLICIES[commercialPlan].base,
    extras
  );
  return {
    custom: effective.customGuides,
    adapted: effective.templateAdaptations,
    combined: effective.combinedClinicOwnedGuides,
  };
}

export type GuideRestoreCode =
  | "not_found"
  | "forbidden"
  | "not_retained"
  | "expired"
  | "not_clinic_owned"
  | "custom_limit"
  | "adapted_limit"
  | "combined_limit";

export function assessGuideRestore(input: {
  guide: SelectableGuideRecord | null;
  clinicId: string;
  now: Date;
  activeCustom: number;
  activeAdapted: number;
  limits: EssentialGuideLimits;
  retentionOpen: boolean;
}):
  | { ok: true; consumes: "custom" | "adapted" }
  | { ok: false; code: GuideRestoreCode } {
  const guide = input.guide;
  if (!guide || guide.clinicId !== input.clinicId) {
    return { ok: false, code: "not_found" };
  }
  if (!guide.downgradeRetainedAt) {
    return { ok: false, code: "not_retained" };
  }
  if (!input.retentionOpen) {
    return { ok: false, code: "expired" };
  }
  if (isOriginalCustomGuide(guide)) {
    if (input.activeCustom + 1 > input.limits.custom) {
      return { ok: false, code: "custom_limit" };
    }
    if (input.activeCustom + input.activeAdapted + 1 > input.limits.combined) {
      return { ok: false, code: "combined_limit" };
    }
    return { ok: true, consumes: "custom" };
  }
  if (isAdaptedTemplateGuide(guide)) {
    if (input.activeAdapted + 1 > input.limits.adapted) {
      return { ok: false, code: "adapted_limit" };
    }
    if (input.activeCustom + input.activeAdapted + 1 > input.limits.combined) {
      return { ok: false, code: "combined_limit" };
    }
    return { ok: true, consumes: "adapted" };
  }
  return { ok: false, code: "not_clinic_owned" };
}

export function guideRestoreMessage(code: GuideRestoreCode): string {
  switch (code) {
    case "not_found":
      return "Guide not found.";
    case "forbidden":
      return "A clinic administrator can restore a retained guide.";
    case "not_retained":
      return "This guide is already active.";
    case "expired":
      return RETENTION_EXPIRED_MESSAGE;
    case "not_clinic_owned":
      return "This guide cannot be restored.";
    case "custom_limit":
      return "There is no free custom-guide place for this guide on the current plan.";
    case "adapted_limit":
      return "There is no free edited-template place for this guide on the current plan.";
    case "combined_limit":
      return "There is no free clinic-owned guide place for this guide on the current plan.";
  }
}

export async function restoreDowngradeRetainedGuide(input: {
  actorUserId: string;
  clinicId: string;
  guideId: string;
  operatorSupport?: boolean;
  now?: Date;
}): Promise<
  { ok: true } | { ok: false; code: GuideRestoreCode; error: string }
> {
  const now = input.now ?? new Date();
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    await lockClinicGuideCapacity(tx, input.clinicId);
    const allowed = await clinicAdminMayConfirm(tx, {
      actorUserId: input.actorUserId,
      clinicId: input.clinicId,
      operatorSupport: input.operatorSupport === true,
    });
    if (!allowed) {
      return {
        ok: false as const,
        code: "forbidden" as const,
        error: guideRestoreMessage("forbidden"),
      };
    }
    const entitlement = await tx.clinicEntitlement.findUnique({
      where: { clinicId: input.clinicId },
      select: {
        commercialPlan: true,
        extraCustomGuideAllowance: true,
        extraTemplateAdaptationAllowance: true,
        extraTeamMemberAllowance: true,
      },
    });
    const guide = await tx.practiceGuide.findFirst({
      where: { id: input.guideId, clinicId: input.clinicId },
      select: {
        ...guideSelect,
        downgradeRetentionUntil: true,
      },
    });
    if (!guide) {
      return {
        ok: false as const,
        code: "not_found" as const,
        error: guideRestoreMessage("not_found"),
      };
    }
    const open =
      guide.downgradeRetainedAt !== null &&
      guide.downgradeRetentionUntil !== null &&
      now.getTime() < guide.downgradeRetentionUntil.getTime();
    const activeGuides = await tx.practiceGuide.findMany({
      where: { clinicId: input.clinicId, downgradeRetainedAt: null },
      select: guideSelect,
    });
    const active = selectionCountsForGuides(
      activeGuides,
      new Set(
        activeGuides
          .filter((row) => isSelectableClinicOwnedGuide(row))
          .map((row) => row.id)
      )
    );
    const plan = entitlement?.commercialPlan;
    const limits =
      plan === "ESSENTIAL" || plan === "PRACTICE"
        ? currentPlanGuideLimits(plan, allowanceExtrasFrom(entitlement))
        : essentialGuideLimits({
            teamMembers: 0,
            customGuides: 0,
            templateAdaptations: 0,
          });
    if (plan !== "ESSENTIAL" && plan !== "PRACTICE") {
      return {
        ok: false as const,
        code: "not_clinic_owned" as const,
        error: guideRestoreMessage("not_clinic_owned"),
      };
    }
    const decision = assessGuideRestore({
      guide,
      clinicId: input.clinicId,
      now,
      activeCustom: active.custom,
      activeAdapted: active.adapted,
      limits,
      retentionOpen: open,
    });
    if (!decision.ok) {
      return {
        ok: false as const,
        code: decision.code,
        error: guideRestoreMessage(decision.code),
      };
    }
    await tx.practiceGuide.update({
      where: { id: guide.id },
      data: {
        downgradeRetainedAt: null,
        downgradeRetentionUntil: null,
      },
    });
    return { ok: true as const };
  });
}

export type ClinicGuideSelectionGuide = {
  id: string;
  title: string;
  kind: "custom" | "adapted";
  kindLabel: "Custom guide" | "Edited River template";
  publicationLabel: string;
  updatedLabel: string;
};

export type ClinicGuideSelectionPanel = {
  status: "awaiting" | "confirmed";
  limits: EssentialGuideLimits;
  selectedIds: string[];
  guides: ClinicGuideSelectionGuide[];
};

function publicationLabel(status: PracticeGuideStatus): string {
  if (status === PracticeGuideStatus.DRAFT) {
    return "Draft";
  }
  if (status === PracticeGuideStatus.UNPUBLISHED) {
    return "Unpublished";
  }
  return "Published";
}

export async function loadClinicGuideSelectionPanel(
  clinicId: string
): Promise<ClinicGuideSelectionPanel | null> {
  const prisma = getPrisma();
  const [preparation, entitlement, guides] = await Promise.all([
    prisma.clinicDowngradePreparation.findUnique({
      where: { clinicId },
      select: {
        status: true,
        selections: { select: { practiceGuideId: true } },
      },
    }),
    prisma.clinicEntitlement.findUnique({
      where: { clinicId },
      select: {
        commercialPlan: true,
        extraCustomGuideAllowance: true,
        extraTemplateAdaptationAllowance: true,
      },
    }),
    prisma.practiceGuide.findMany({
      where: { clinicId, downgradeRetainedAt: null },
      orderBy: [{ updatedAt: "desc" }],
      select: guideSelect,
    }),
  ]);
  if (!preparation || entitlement?.commercialPlan !== "PRACTICE") {
    return null;
  }
  const selectable = guides.filter((guide) =>
    isSelectableClinicOwnedGuide(guide)
  );
  return {
    status:
      preparation.status === DowngradePreparationStatus.SELECTION_CONFIRMED
        ? "confirmed"
        : "awaiting",
    limits: essentialGuideLimits({
      teamMembers: 0,
      customGuides: entitlement.extraCustomGuideAllowance,
      templateAdaptations: entitlement.extraTemplateAdaptationAllowance,
    }),
    selectedIds: preparation.selections.map((row) => row.practiceGuideId),
    guides: selectable.map((guide) => ({
      id: guide.id,
      title: guide.title.trim() || "Untitled guide",
      kind: isOriginalCustomGuide(guide) ? "custom" : "adapted",
      kindLabel: isOriginalCustomGuide(guide)
        ? "Custom guide"
        : "Edited River template",
      publicationLabel: publicationLabel(guide.status),
      updatedLabel: formatPortalDate(guide.updatedAt),
    })),
  };
}
