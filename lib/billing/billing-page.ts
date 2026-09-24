import "server-only";

import { BillingStatus, EntitlementStatus } from "@prisma/client";

import { getPrisma } from "@/lib/prisma";

import { assessCommercialOfferRevision } from "@/lib/billing/prepare-offer";
import { clinicSupportsCustomerPortal } from "@/lib/billing/customer-portal";
import { assessOperatorPlanUpgrade } from "@/lib/billing/plan-change";
import {
  assessClinicPlanDowngrade,
  customerPlanDowngradeMessage,
  planDowngradeMessage,
  type PlanDowngradeState,
} from "@/lib/billing/plan-downgrade";
import {
  loadEssentialDowngradeReadiness,
  readinessHasGuideOverage,
} from "@/lib/entitlements/downgrade-readiness";
import {
  loadClinicGuideSelectionPanel,
  loadDowngradePreparationSnapshot,
  type ClinicGuideSelectionPanel,
} from "@/lib/entitlements/downgrade-selection";
import {
  billingIntervalLabel,
  commercialOfferSummary,
  commercialPlanLabel,
  type SelfServePlanCode,
} from "@/lib/billing/offer-display";
import {
  billingPeriodLabel,
  billingStateLabel,
  entitlementStateLabel,
  formatBillingDate,
  offerSummaryForEntitlement,
  presentBillingReturn,
  presentOperatorOfferBlock,
  presentScheduledPlanChange,
  type BillingReturnPresentation,
  type ScheduledPlanChangePresentation,
} from "@/lib/billing/billing-presentation";

export type OperatorBillingPanel = {
  prepared: boolean;
  plan: SelfServePlanCode | null;
  interval: "MONTHLY" | "YEARLY" | null;
  planLabel: string;
  intervalLabel: string;
  entitlementLabel: string;
  billingLabel: string;
  customerLinked: "Yes" | "No";
  subscriptionLinked: "Yes" | "No";
  paidThroughLabel: string | null;
  cancellationScheduled: "Yes" | "No";
  cancellationDateLabel: string | null;
  canUpgradeToPractice: boolean;
  showDowngrade: boolean;
  downgradeEffectiveLabel: string | null;
  downgradeBlockedReason: string | null;
  openDowngradeAttemptId: string | null;
  guidePreparation: {
    status: "none" | "awaiting" | "confirmed";
    selectedCustom: number;
    selectedAdapted: number;
    selectedCombined: number;
  } | null;
  scheduledPlanChange: ScheduledPlanChangePresentation | null;
  downgradeReadiness: {
    ready: boolean;
    teamCurrent: number;
    teamLimit: number;
    guideCurrent: number;
    guideLimit: number;
    adaptedCurrent: number;
    adaptedLimit: number;
    combinedCurrent: number;
    combinedLimit: number;
  } | null;
  canRevise: boolean;
  reviseBlockedReason: string | null;
};

export async function loadOperatorBillingPanel(
  clinicId: string
): Promise<OperatorBillingPanel> {
  const entitlement = await getPrisma().clinicEntitlement.findUnique({
    where: { clinicId },
  });
  const profile = await getPrisma().clinicBillingProfile.findUnique({
    where: { clinicId },
    select: {
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripeSubscriptionScheduleId: true,
      stripePlanDowngradeAttemptId: true,
      stripeCheckoutSessionId: true,
    },
  });
  const revision = assessCommercialOfferRevision({
    entitlementStatus: entitlement?.entitlementStatus ?? null,
    billingStatus: entitlement?.billingStatus ?? null,
    stripeSubscriptionId: profile?.stripeSubscriptionId ?? null,
  });
  const planChange = assessOperatorPlanUpgrade(
    {
      clinicId,
      commercialPlan: entitlement?.commercialPlan ?? null,
      billingInterval: entitlement?.billingInterval ?? null,
      entitlementStatus: entitlement?.entitlementStatus ?? null,
      billingStatus: entitlement?.billingStatus ?? null,
      cancelAtPeriodEnd: entitlement?.cancelAtPeriodEnd ?? false,
      stripeSubscriptionId: profile?.stripeSubscriptionId ?? null,
    },
    "PRACTICE"
  );
  const downgradeReadiness =
    entitlement?.commercialPlan === "PRACTICE"
      ? await loadEssentialDowngradeReadiness(clinicId)
      : null;
  const preparation =
    entitlement?.commercialPlan === "PRACTICE"
      ? await loadDowngradePreparationSnapshot(clinicId)
      : null;
  const guideSelection =
    preparation?.status === "confirmed"
      ? {
          confirmed: true as const,
          customCount: preparation.selectedCustom,
          adaptedCount: preparation.selectedAdapted,
          combinedCount: preparation.selectedCombined,
        }
      : null;
  const downgradeState: PlanDowngradeState = {
    clinicId,
    commercialPlan: entitlement?.commercialPlan ?? null,
    billingInterval: entitlement?.billingInterval ?? null,
    entitlementStatus: entitlement?.entitlementStatus ?? null,
    billingStatus: entitlement?.billingStatus ?? null,
    cancelAtPeriodEnd: entitlement?.cancelAtPeriodEnd ?? false,
    stripeSubscriptionId: profile?.stripeSubscriptionId ?? null,
    stripeSubscriptionScheduleId: profile?.stripeSubscriptionScheduleId ?? null,
    stripePlanDowngradeAttemptId: profile?.stripePlanDowngradeAttemptId ?? null,
    stripeCheckoutSessionId: profile?.stripeCheckoutSessionId ?? null,
    scheduledCommercialPlan: entitlement?.scheduledCommercialPlan ?? null,
    scheduledPlanEffectiveAt: entitlement?.scheduledPlanEffectiveAt ?? null,
  };
  const downgradeAssessed = downgradeReadiness
    ? assessClinicPlanDowngrade({
        state: downgradeState,
        readiness: downgradeReadiness,
        guideSelection,
      })
    : { ok: false as const, code: "unsupported" as const };
  const scheduledPlanChange = presentScheduledPlanChange({
    commercialPlan: entitlement?.commercialPlan ?? null,
    scheduledCommercialPlan: entitlement?.scheduledCommercialPlan ?? null,
    effectiveAt: entitlement?.scheduledPlanEffectiveAt ?? null,
    cancelAtPeriodEnd: entitlement?.cancelAtPeriodEnd ?? false,
  });
  const showDowngrade = entitlement?.commercialPlan === "PRACTICE";
  const planChangeVisible = planChange.ok || showDowngrade;
  const periodDate =
    entitlement?.paidThrough ?? entitlement?.currentPeriodEnd ?? null;
  const plan =
    entitlement?.commercialPlan === "ESSENTIAL" ||
    entitlement?.commercialPlan === "PRACTICE"
      ? entitlement.commercialPlan
      : null;
  const interval =
    entitlement?.billingInterval === "MONTHLY" ||
    entitlement?.billingInterval === "YEARLY"
      ? entitlement.billingInterval
      : null;

  return {
    prepared: Boolean(entitlement),
    plan,
    interval,
    planLabel: commercialPlanLabel(entitlement?.commercialPlan ?? null),
    intervalLabel: billingIntervalLabel(entitlement?.billingInterval ?? null),
    entitlementLabel: entitlementStateLabel(
      entitlement?.entitlementStatus ?? null
    ),
    billingLabel: entitlement?.cancelAtPeriodEnd
      ? "Scheduled to end"
      : billingStateLabel(entitlement?.billingStatus ?? null),
    customerLinked: profile?.stripeCustomerId ? "Yes" : "No",
    subscriptionLinked: profile?.stripeSubscriptionId ? "Yes" : "No",
    paidThroughLabel: periodDate ? formatBillingDate(periodDate) : null,
    cancellationScheduled: entitlement?.cancelAtPeriodEnd ? "Yes" : "No",
    cancellationDateLabel:
      entitlement?.cancelAtPeriodEnd && periodDate
        ? formatBillingDate(periodDate)
        : null,
    canUpgradeToPractice: planChange.ok,
    showDowngrade,
    downgradeEffectiveLabel: periodDate ? formatBillingDate(periodDate) : null,
    downgradeBlockedReason:
      showDowngrade &&
      !scheduledPlanChange &&
      !downgradeAssessed.ok &&
      downgradeAssessed.code !== "not_ready" &&
      downgradeAssessed.code !== "selection_required"
        ? planDowngradeMessage(
            downgradeAssessed.code,
            downgradeReadiness ?? undefined
          )
        : null,
    openDowngradeAttemptId:
      profile?.stripePlanDowngradeAttemptId && !scheduledPlanChange
        ? profile.stripePlanDowngradeAttemptId
        : null,
    scheduledPlanChange,
    downgradeReadiness: downgradeReadiness
      ? {
          ready: downgradeReadiness.ready,
          teamCurrent: downgradeReadiness.team.current,
          teamLimit: downgradeReadiness.team.limit,
          guideCurrent: downgradeReadiness.guides.current,
          guideLimit: downgradeReadiness.guides.limit,
          adaptedCurrent: downgradeReadiness.adaptedTemplates.current,
          adaptedLimit: downgradeReadiness.adaptedTemplates.limit,
          combinedCurrent: downgradeReadiness.combinedGuides.current,
          combinedLimit: downgradeReadiness.combinedGuides.limit,
        }
      : null,
    guidePreparation: downgradeReadiness
      ? {
          status: preparation?.status ?? "none",
          selectedCustom: preparation?.selectedCustom ?? 0,
          selectedAdapted: preparation?.selectedAdapted ?? 0,
          selectedCombined: preparation?.selectedCombined ?? 0,
        }
      : null,
    canRevise: revision.ok,
    reviseBlockedReason: revision.ok
      ? null
      : presentOperatorOfferBlock({
          domainMessage: revision.message,
          planChangeVisible,
        }),
  };
}

export type ClinicBillingView = {
  clinicName: string;
  presentation: BillingReturnPresentation;
  summary: ReturnType<typeof offerSummaryForEntitlement>;
  billingLabel: string;
  planLabel: string;
  intervalLabel: string;
  paidThroughLabel: string | null;
  periodLabel: string;
  portalEligible: boolean;
  entitlementStatus: EntitlementStatus | null;
  billingStatus: BillingStatus | null;
  publicGuideRetentionLabel: string | null;
  scheduledPlanChange: ScheduledPlanChangePresentation | null;
  guideSelection: ClinicGuideSelectionPanel | null;
  selfServeDowngrade: ClinicSelfServeDowngrade | null;
  identity: {
    legalEntityName: string;
    tradingName: string;
    billingContactName: string;
    billingEmail: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
    businessNumberKind: "abn" | "acn";
    abn: string;
    acn: string;
  } | null;
};

async function loadClinicBillingRecord(clinicId: string) {
  const clinic = await getPrisma().clinic.findUnique({
    where: { id: clinicId },
    select: {
      name: true,
      entitlement: true,
      billingProfile: true,
    },
  });
  return clinic;
}

export async function loadClinicBillingView(
  clinicId: string
): Promise<ClinicBillingView | null> {
  const clinic = await loadClinicBillingRecord(clinicId);
  if (!clinic) {
    return null;
  }

  const entitlement = clinic.entitlement;
  const profile = clinic.billingProfile;
  const presentation = presentBillingReturn({
    entitlementStatus: entitlement?.entitlementStatus ?? null,
    billingStatus: entitlement?.billingStatus ?? null,
    commercialPlan: entitlement?.commercialPlan ?? null,
    billingInterval: entitlement?.billingInterval ?? null,
    checkoutStarted: Boolean(profile?.stripeCheckoutSessionId),
    stripeSubscriptionId: profile?.stripeSubscriptionId ?? null,
    paidThrough: entitlement?.paidThrough ?? null,
    currentPeriodEnd: entitlement?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: entitlement?.cancelAtPeriodEnd ?? false,
  });
  const periodDate =
    entitlement?.paidThrough ?? entitlement?.currentPeriodEnd ?? null;
  const cancelScheduled = Boolean(entitlement?.cancelAtPeriodEnd);

  const identity = profile
    ? {
        legalEntityName: profile.legalEntityName ?? "",
        tradingName: profile.tradingName ?? clinic.name,
        billingContactName: profile.billingContactName ?? "",
        billingEmail: profile.billingEmail ?? "",
        addressLine1: profile.addressLine1 ?? "",
        addressLine2: profile.addressLine2 ?? "",
        city: profile.city ?? "",
        region: profile.region ?? "",
        postalCode: profile.postalCode ?? "",
        country: profile.country ?? "AU",
        businessNumberKind:
          profile.acn && !profile.abn ? ("acn" as const) : ("abn" as const),
        abn: profile.abn ?? "",
        acn: profile.acn ?? "",
      }
    : null;

  return {
    clinicName: clinic.name,
    presentation,
    summary: offerSummaryForEntitlement(
      entitlement?.commercialPlan ?? null,
      entitlement?.billingInterval ?? null
    ),
    billingLabel: billingStateLabel(entitlement?.billingStatus ?? null),
    planLabel: commercialPlanLabel(entitlement?.commercialPlan ?? null),
    intervalLabel: billingIntervalLabel(entitlement?.billingInterval ?? null),
    paidThroughLabel: periodDate ? formatBillingDate(periodDate) : null,
    periodLabel: billingPeriodLabel(cancelScheduled),
    portalEligible: clinicSupportsCustomerPortal({
      stripeCustomerId: profile?.stripeCustomerId ?? null,
      entitlementStatus: entitlement?.entitlementStatus ?? null,
      billingStatus: entitlement?.billingStatus ?? null,
    }),
    entitlementStatus: entitlement?.entitlementStatus ?? null,
    billingStatus: entitlement?.billingStatus ?? null,
    publicGuideRetentionLabel: entitlement?.publicGuideRetentionUntil
      ? formatBillingDate(entitlement.publicGuideRetentionUntil)
      : null,
    scheduledPlanChange: presentScheduledPlanChange({
      commercialPlan: entitlement?.commercialPlan ?? null,
      scheduledCommercialPlan: entitlement?.scheduledCommercialPlan ?? null,
      effectiveAt: entitlement?.scheduledPlanEffectiveAt ?? null,
      cancelAtPeriodEnd: entitlement?.cancelAtPeriodEnd ?? false,
    }),
    guideSelection:
      entitlement?.commercialPlan === "PRACTICE"
        ? await loadClinicGuideSelectionPanel(clinicId)
        : null,
    selfServeDowngrade: await loadSelfServeDowngrade({
      clinicId,
      commercialPlan: entitlement?.commercialPlan ?? null,
      billingInterval: entitlement?.billingInterval ?? null,
      entitlementStatus: entitlement?.entitlementStatus ?? null,
      billingStatus: entitlement?.billingStatus ?? null,
      cancelAtPeriodEnd: entitlement?.cancelAtPeriodEnd ?? false,
      scheduledCommercialPlan: entitlement?.scheduledCommercialPlan ?? null,
      stripeSubscriptionId: profile?.stripeSubscriptionId ?? null,
      stripeSubscriptionScheduleId:
        profile?.stripeSubscriptionScheduleId ?? null,
      stripePlanDowngradeAttemptId:
        profile?.stripePlanDowngradeAttemptId ?? null,
      stripeCheckoutSessionId: profile?.stripeCheckoutSessionId ?? null,
      paidThrough: entitlement?.paidThrough ?? null,
      currentPeriodEnd: entitlement?.currentPeriodEnd ?? null,
    }),
    identity,
  };
}

export type ClinicSelfServeDowngrade = {
  entryAvailable: boolean;
  essentialPriceLabel: string;
  intervalLabel: string;
  effectiveLabel: string | null;
  teamCurrent: number;
  teamLimit: number;
  guidesFit: boolean;
  combinedCurrent: number;
  combinedLimit: number;
  preparationStatus: "none" | "awaiting" | "confirmed";
  selectedCombined: number;
  scheduleReady: boolean;
  blockedMessage: string | null;
  canCancelPreparation: boolean;
  attemptOpen: boolean;
};

async function loadSelfServeDowngrade(input: {
  clinicId: string;
  commercialPlan: PlanDowngradeState["commercialPlan"];
  billingInterval: PlanDowngradeState["billingInterval"];
  entitlementStatus: PlanDowngradeState["entitlementStatus"];
  billingStatus: PlanDowngradeState["billingStatus"];
  cancelAtPeriodEnd: boolean;
  scheduledCommercialPlan: PlanDowngradeState["scheduledCommercialPlan"];
  stripeSubscriptionId: string | null;
  stripeSubscriptionScheduleId: string | null;
  stripePlanDowngradeAttemptId: string | null;
  stripeCheckoutSessionId: string | null;
  paidThrough: Date | null;
  currentPeriodEnd: Date | null;
}): Promise<ClinicSelfServeDowngrade | null> {
  if (
    input.commercialPlan !== "PRACTICE" ||
    (input.billingInterval !== "MONTHLY" && input.billingInterval !== "YEARLY")
  ) {
    return null;
  }
  const readiness = await loadEssentialDowngradeReadiness(input.clinicId);
  const preparation = await loadDowngradePreparationSnapshot(input.clinicId);
  const guideSelection =
    preparation?.status === "confirmed"
      ? {
          confirmed: true as const,
          customCount: preparation.selectedCustom,
          adaptedCount: preparation.selectedAdapted,
          combinedCount: preparation.selectedCombined,
        }
      : null;
  const assessed = assessClinicPlanDowngrade({
    state: {
      clinicId: input.clinicId,
      commercialPlan: input.commercialPlan,
      billingInterval: input.billingInterval,
      entitlementStatus: input.entitlementStatus,
      billingStatus: input.billingStatus,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripeSubscriptionScheduleId: input.stripeSubscriptionScheduleId,
      stripePlanDowngradeAttemptId: input.stripePlanDowngradeAttemptId,
      stripeCheckoutSessionId: input.stripeCheckoutSessionId,
      scheduledCommercialPlan: input.scheduledCommercialPlan,
      scheduledPlanEffectiveAt: null,
    },
    readiness,
    guideSelection,
  });
  const offer = commercialOfferSummary("ESSENTIAL", input.billingInterval);
  const periodDate = input.paidThrough ?? input.currentPeriodEnd;
  const guidesFit = !readinessHasGuideOverage(readiness);
  const scheduled =
    input.scheduledCommercialPlan === "ESSENTIAL" && !input.cancelAtPeriodEnd;
  const entryAvailable =
    input.entitlementStatus === "ACTIVE" &&
    input.billingStatus === "ACTIVE" &&
    Boolean(input.stripeSubscriptionId) &&
    !input.cancelAtPeriodEnd &&
    !input.scheduledCommercialPlan;
  if (
    !entryAvailable &&
    !preparation &&
    !scheduled &&
    !input.stripePlanDowngradeAttemptId
  ) {
    return null;
  }
  return {
    entryAvailable,
    essentialPriceLabel: offer.priceLabel,
    intervalLabel: offer.intervalLabel,
    effectiveLabel: periodDate ? formatBillingDate(periodDate) : null,
    teamCurrent: readiness.team.current,
    teamLimit: readiness.team.limit,
    guidesFit,
    combinedCurrent: readiness.combinedGuides.current,
    combinedLimit: readiness.combinedGuides.limit,
    preparationStatus: preparation?.status ?? "none",
    selectedCombined: preparation?.selectedCombined ?? 0,
    scheduleReady: assessed.ok,
    blockedMessage:
      assessed.ok ||
      assessed.code === "not_ready" ||
      assessed.code === "selection_required"
        ? null
        : customerPlanDowngradeMessage(assessed.code),
    canCancelPreparation: Boolean(
      !input.scheduledCommercialPlan &&
      (preparation || input.stripePlanDowngradeAttemptId)
    ),
    attemptOpen: Boolean(input.stripePlanDowngradeAttemptId && !scheduled),
  };
}

export async function loadBillingStatusState(clinicId: string): Promise<{
  state: BillingReturnPresentation["kind"];
} | null> {
  const view = await loadClinicBillingView(clinicId);
  if (!view) {
    return null;
  }
  return { state: view.presentation.kind };
}
