import "server-only";

import { BillingStatus, EntitlementStatus } from "@prisma/client";

import { getPrisma } from "@/lib/prisma";

import { assessCommercialOfferRevision } from "@/lib/billing/prepare-offer";
import { clinicSupportsCustomerPortal } from "@/lib/billing/customer-portal";
import { assessOperatorPlanUpgrade } from "@/lib/billing/plan-change";
import {
  billingIntervalLabel,
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
  type BillingReturnPresentation,
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
  downgradeDeferred: boolean;
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
  const downgrade = assessOperatorPlanUpgrade(
    {
      clinicId,
      commercialPlan: entitlement?.commercialPlan ?? null,
      billingInterval: entitlement?.billingInterval ?? null,
      entitlementStatus: entitlement?.entitlementStatus ?? null,
      billingStatus: entitlement?.billingStatus ?? null,
      cancelAtPeriodEnd: entitlement?.cancelAtPeriodEnd ?? false,
      stripeSubscriptionId: profile?.stripeSubscriptionId ?? null,
    },
    "ESSENTIAL"
  );
  const downgradeDeferred =
    !downgrade.ok && downgrade.code === "downgrade_deferred";
  const planChangeVisible = planChange.ok || downgradeDeferred;
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
    downgradeDeferred,
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
    identity,
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
