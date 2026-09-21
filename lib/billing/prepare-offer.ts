import "server-only";

import {
  BillingStatus,
  EntitlementStatus,
  type BillingInterval,
  type CommercialPlan,
  type PrismaClient,
} from "@prisma/client";

import { logStripeBilling } from "@/lib/billing/log";
import type {
  BillingIntervalCode,
  SelfServeCommercialPlan,
} from "@/lib/billing/price-map";
import {
  getStripeClient,
  getStripeClientConfig,
} from "@/lib/billing/stripe-client";
import { getPrisma } from "@/lib/prisma";

const ACTIVE_BILLING = new Set<BillingStatus>([
  BillingStatus.ACTIVE,
  BillingStatus.PAST_DUE,
  BillingStatus.CANCEL_AT_PERIOD_END,
]);

export type OfferRevision = { ok: true } | { ok: false; message: string };

export function assessCommercialOfferRevision(input: {
  entitlementStatus: EntitlementStatus | null;
  billingStatus: BillingStatus | null;
  stripeSubscriptionId: string | null;
}): OfferRevision {
  if (input.stripeSubscriptionId) {
    return {
      ok: false,
      message:
        "This clinic already has a Stripe subscription. Plan changes are a later workflow.",
    };
  }

  if (
    input.entitlementStatus === EntitlementStatus.ACTIVE ||
    (input.billingStatus && ACTIVE_BILLING.has(input.billingStatus))
  ) {
    return {
      ok: false,
      message:
        "This clinic already has an active subscription. Plan changes are a later workflow.",
    };
  }

  if (
    input.billingStatus === BillingStatus.PAYMENT_PENDING ||
    input.billingStatus === BillingStatus.UNPAID ||
    input.billingStatus === BillingStatus.ENDED ||
    input.entitlementStatus === EntitlementStatus.RESTRICTED ||
    input.entitlementStatus === EntitlementStatus.ENDED
  ) {
    return {
      ok: false,
      message:
        "Billing is already underway for this clinic. The prepared offer can't be changed here.",
    };
  }

  return { ok: true };
}

type OfferDb = Pick<PrismaClient, "clinicEntitlement" | "clinicBillingProfile">;

export async function prepareClinicCommercialOffer(
  input: {
    clinicId: string;
    commercialPlan: SelfServeCommercialPlan;
    billingInterval: BillingIntervalCode;
  },
  db: OfferDb = getPrisma()
): Promise<{ ok: true } | { ok: false; message: string }> {
  const existing = await db.clinicEntitlement.findUnique({
    where: { clinicId: input.clinicId },
    select: {
      commercialPlan: true,
      billingInterval: true,
      billingStatus: true,
      entitlementStatus: true,
    },
  });
  const profile = await db.clinicBillingProfile.findUnique({
    where: { clinicId: input.clinicId },
    select: {
      stripeSubscriptionId: true,
      stripeCheckoutSessionId: true,
    },
  });

  const revision = assessCommercialOfferRevision({
    entitlementStatus: existing?.entitlementStatus ?? null,
    billingStatus: existing?.billingStatus ?? null,
    stripeSubscriptionId: profile?.stripeSubscriptionId ?? null,
  });
  if (!revision.ok) {
    return revision;
  }

  const planChanged = Boolean(
    existing &&
    (existing.commercialPlan !== input.commercialPlan ||
      existing.billingInterval !== input.billingInterval)
  );

  await db.clinicEntitlement.upsert({
    where: { clinicId: input.clinicId },
    create: {
      clinicId: input.clinicId,
      commercialPlan: input.commercialPlan as CommercialPlan,
      billingInterval: input.billingInterval as BillingInterval,
      billingStatus: BillingStatus.OFFER_PREPARED,
      entitlementStatus: EntitlementStatus.PENDING,
    },
    update: {
      commercialPlan: input.commercialPlan as CommercialPlan,
      billingInterval: input.billingInterval as BillingInterval,
      billingStatus: BillingStatus.OFFER_PREPARED,
      entitlementStatus: EntitlementStatus.PENDING,
    },
  });

  if (planChanged && profile?.stripeCheckoutSessionId) {
    await expireOpenCheckoutSession(
      profile.stripeCheckoutSessionId,
      input.clinicId
    );
    await db.clinicBillingProfile.update({
      where: { clinicId: input.clinicId },
      data: { stripeCheckoutSessionId: null },
    });
  }

  logStripeBilling({
    event: "billing_onboarding_prepared",
    clinicId: input.clinicId,
    commercialPlan: input.commercialPlan,
    billingInterval: input.billingInterval,
  });

  return { ok: true };
}

async function expireOpenCheckoutSession(
  sessionId: string,
  clinicId: string
): Promise<void> {
  const config = getStripeClientConfig();
  if (!config.ready) {
    return;
  }

  try {
    await getStripeClient().checkout.sessions.expire(sessionId);
  } catch {
    logStripeBilling({
      event: "checkout_session_failed",
      clinicId,
      reason: "expire_open_session_failed",
    });
  }
}
