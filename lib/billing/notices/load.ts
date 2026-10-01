import "server-only";

import type {
  BillingInterval,
  BillingStatus,
  CommercialPlan,
  EntitlementStatus,
} from "@prisma/client";

import { inspectStripeCatalogue } from "@/lib/billing/price-map";
import {
  ANNUAL_RENEWAL_NOTICE_DAYS,
  BILLING_NOTICE_DAY_MS,
  BILLING_NOTICE_PAGE_PATH,
} from "@/lib/billing/notices/constants";
import { evaluateBillingNotices } from "@/lib/billing/notices/evaluate";
import { canViewCommercialBillingNotices } from "@/lib/billing/notices/permissions";
import type {
  BillingNoticeCandidate,
  BillingNoticeDeliveryState,
  BillingNoticeEvaluation,
  BillingNoticeInterval,
  BillingNoticePlan,
  BillingNoticeSubscription,
  BillingPriceChangeRecord,
  OverviewBillingNotice,
} from "@/lib/billing/notices/types";
import { getPrisma } from "@/lib/prisma";
import { staffAppOrigin } from "@/lib/tenancy/staff-app-origin";
import { getRootDomain } from "@/lib/tenancy/root-domain";

type Env = Record<string, string | undefined>;

const PRICE_CHANGE_SELECT = {
  id: true,
  stripeSubscriptionId: true,
  stripeSubscriptionItemId: true,
  affectedLabel: true,
  billingInterval: true,
  currentAmountCents: true,
  newAmountCents: true,
  effectiveAt: true,
  status: true,
  individuallyAgreed: true,
  createdAt: true,
} as const;

const DELIVERY_SELECT = {
  kind: true,
  eventKey: true,
  status: true,
  sentAt: true,
} as const;

function asPlan(plan: CommercialPlan | null): BillingNoticePlan | null {
  if (plan === "ESSENTIAL" || plan === "PRACTICE" || plan === "GROUP") {
    return plan;
  }
  return null;
}

function asInterval(
  interval: BillingInterval | null
): BillingNoticeInterval | null {
  if (interval === "MONTHLY" || interval === "YEARLY") {
    return interval;
  }
  return null;
}

export function cataloguePriceIdsForSubscription(
  plan: BillingNoticePlan | null,
  interval: BillingNoticeInterval | null,
  env: Env = process.env
): {
  catalogueBasePriceId: string | null;
  catalogueAddonPriceId: string | null;
} {
  if (!plan || !interval) {
    return { catalogueBasePriceId: null, catalogueAddonPriceId: null };
  }
  const inspection = inspectStripeCatalogue(env);
  if (inspection.duplicate) {
    return { catalogueBasePriceId: null, catalogueAddonPriceId: null };
  }
  const base = inspection.slots.find(
    (slot) =>
      slot.role === "BASE_PLAN" &&
      slot.plan === plan &&
      slot.interval === interval
  );
  const addonRole =
    plan === "PRACTICE"
      ? "PRACTICE_LOCATION_ADDON"
      : plan === "GROUP"
        ? "GROUP_SITE_ADDON"
        : null;
  const addon = addonRole
    ? inspection.slots.find(
        (slot) => slot.role === addonRole && slot.interval === interval
      )
    : null;
  return {
    catalogueBasePriceId: base?.priceId ?? null,
    catalogueAddonPriceId: addon?.priceId ?? null,
  };
}

export function billingNoticeLinks(env: Env = process.env): {
  billingUrl: string;
  contactUrl: string;
} {
  const processEnv = env as NodeJS.ProcessEnv;
  const root = getRootDomain(processEnv);
  const protocol =
    root === "localhost" || root.endsWith(".localhost") ? "http" : "https";
  return {
    billingUrl: `${staffAppOrigin(processEnv)}${BILLING_NOTICE_PAGE_PATH}`,
    contactUrl: `${protocol}://${root}/contact`,
  };
}

type LoadedClinic = NonNullable<
  Awaited<ReturnType<typeof loadClinicNoticeRecord>>
>;

async function loadClinicNoticeRecord(clinicId: string) {
  return getPrisma().clinic.findUnique({
    where: { id: clinicId },
    select: {
      id: true,
      billingProfile: {
        select: {
          billingEmail: true,
          stripeSubscriptionId: true,
          stripeSubscriptionScheduleId: true,
        },
      },
      entitlement: true,
      billingPriceChanges: { select: PRICE_CHANGE_SELECT },
      billingNoticeDeliveries: { select: DELIVERY_SELECT },
    },
  });
}

function toCandidate(clinic: LoadedClinic, env: Env): BillingNoticeCandidate {
  const entitlement = clinic.entitlement;
  const plan = asPlan(entitlement?.commercialPlan ?? null);
  const interval = asInterval(entitlement?.billingInterval ?? null);
  const catalogue = cataloguePriceIdsForSubscription(plan, interval, env);
  const subscription: BillingNoticeSubscription = {
    entitlementStatus: (entitlement?.entitlementStatus ??
      null) as EntitlementStatus | null,
    billingStatus: (entitlement?.billingStatus ?? null) as BillingStatus | null,
    commercialPlan: plan,
    billingInterval: interval,
    stripePriceId: entitlement?.stripePriceId ?? null,
    stripeSubscriptionId: clinic.billingProfile?.stripeSubscriptionId ?? null,
    currentPeriodStart: entitlement?.currentPeriodStart ?? null,
    currentPeriodEnd: entitlement?.currentPeriodEnd ?? null,
    paidThrough: entitlement?.paidThrough ?? null,
    cancelAtPeriodEnd: entitlement?.cancelAtPeriodEnd ?? false,
    scheduledCommercialPlan: asPlan(
      entitlement?.scheduledCommercialPlan ?? null
    ),
    scheduledAdditionalSiteQuantity:
      entitlement?.scheduledAdditionalSiteQuantity ?? null,
    stripeSubscriptionScheduleId:
      clinic.billingProfile?.stripeSubscriptionScheduleId ?? null,
    purchasedAdditionalLocationQuantity:
      entitlement?.purchasedAdditionalLocationQuantity ?? null,
    purchasedAdditionalSiteQuantity:
      entitlement?.purchasedAdditionalSiteQuantity ?? null,
    ...catalogue,
  };
  const priceChanges: BillingPriceChangeRecord[] =
    clinic.billingPriceChanges.map((row) => ({
      id: row.id,
      stripeSubscriptionId: row.stripeSubscriptionId,
      stripeSubscriptionItemId: row.stripeSubscriptionItemId,
      affectedLabel: row.affectedLabel,
      billingInterval: row.billingInterval,
      currentAmountCents: row.currentAmountCents,
      newAmountCents: row.newAmountCents,
      effectiveAt: row.effectiveAt,
      status: row.status,
      individuallyAgreed: row.individuallyAgreed,
      createdAt: row.createdAt,
    }));
  const deliveries: BillingNoticeDeliveryState[] =
    clinic.billingNoticeDeliveries.map((row) => ({
      kind: row.kind,
      eventKey: row.eventKey,
      status: row.status,
      sentAt: row.sentAt,
    }));
  return {
    clinicId: clinic.id,
    billingEmail: clinic.billingProfile?.billingEmail ?? null,
    subscription,
    priceChanges,
    deliveries,
  };
}

export async function loadBillingNoticeCandidate(
  clinicId: string,
  env: Env = process.env
): Promise<BillingNoticeCandidate | null> {
  const clinic = await loadClinicNoticeRecord(clinicId);
  if (!clinic) {
    return null;
  }
  return toCandidate(clinic, env);
}

export function evaluateCandidate(
  candidate: BillingNoticeCandidate,
  now: Date,
  env: Env = process.env
): BillingNoticeEvaluation {
  const links = billingNoticeLinks(env);
  return evaluateBillingNotices({
    subscription: candidate.subscription,
    priceChanges: candidate.priceChanges,
    deliveries: candidate.deliveries,
    now,
    billingUrl: links.billingUrl,
    contactUrl: links.contactUrl,
  });
}

export async function loadOverviewBillingNotices(input: {
  clinicId: string;
  role: "ADMIN" | "STAFF";
  source?: "membership" | "operator_support";
  now?: Date;
  env?: Env;
}): Promise<OverviewBillingNotice[]> {
  if (
    !canViewCommercialBillingNotices({
      role: input.role,
      source: input.source,
    })
  ) {
    return [];
  }
  const candidate = await loadBillingNoticeCandidate(input.clinicId, input.env);
  if (!candidate) {
    return [];
  }
  return evaluateCandidate(candidate, input.now ?? new Date(), input.env)
    .overviewNotices;
}

export async function findBillingNoticeCandidates(
  now: Date,
  env: Env = process.env
): Promise<BillingNoticeCandidate[]> {
  const horizon = new Date(
    now.getTime() + ANNUAL_RENEWAL_NOTICE_DAYS * BILLING_NOTICE_DAY_MS
  );
  const clinics = await getPrisma().clinic.findMany({
    where: {
      OR: [
        {
          entitlement: {
            entitlementStatus: "ACTIVE",
            billingStatus: "ACTIVE",
            billingInterval: "YEARLY",
            cancelAtPeriodEnd: false,
            currentPeriodStart: { not: null },
            currentPeriodEnd: { gt: now, lte: horizon },
            paidThrough: { not: null },
          },
        },
        {
          billingPriceChanges: {
            some: { status: "SCHEDULED", effectiveAt: { gt: now } },
          },
        },
      ],
    },
    select: {
      id: true,
      billingProfile: {
        select: {
          billingEmail: true,
          stripeSubscriptionId: true,
          stripeSubscriptionScheduleId: true,
        },
      },
      entitlement: true,
      billingPriceChanges: { select: PRICE_CHANGE_SELECT },
      billingNoticeDeliveries: { select: DELIVERY_SELECT },
    },
  });
  return clinics.map((clinic) => toCandidate(clinic, env));
}
