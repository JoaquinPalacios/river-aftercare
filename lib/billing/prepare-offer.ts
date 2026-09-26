import "server-only";

import {
  BillingStatus,
  EntitlementStatus,
  type BillingInterval,
  type CommercialPlan,
  type PrismaClient,
} from "@prisma/client";

import { logStripeBilling } from "@/lib/billing/log";
import { lockClinicAccountStructure } from "@/lib/entitlements/locks";
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

/**
 * Locks account structure around the local entitlement write when the client
 * is a real Prisma transaction host. Narrow test doubles write directly.
 * Stripe Checkout expiry stays outside this transaction.
 */
async function writePreparedOffer(
  db: OfferDb,
  clinicId: string,
  write: (writer: OfferDb) => Promise<unknown>
): Promise<void> {
  const transactional = db as OfferDb & {
    $executeRaw?: unknown;
    $transaction?: (
      fn: (tx: OfferDb & { $executeRaw: unknown }) => Promise<void>
    ) => Promise<void>;
  };
  if (
    typeof transactional.$transaction === "function" &&
    typeof transactional.$executeRaw === "function"
  ) {
    await transactional.$transaction(async (tx) => {
      await lockClinicAccountStructure(
        tx as Parameters<typeof lockClinicAccountStructure>[0],
        clinicId
      );
      await write(tx);
    });
    return;
  }
  await write(db);
}

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

  const usageDb = db as {
    clinicSite?: { count?: (args: unknown) => Promise<number> };
    clinicLocation?: { count?: (args: unknown) => Promise<number> };
  };
  if (usageDb.clinicSite?.count && usageDb.clinicLocation?.count) {
    const { countActiveSiteLocationUsage, readAccountSiteLocationAllowance } =
      await import("@/lib/clinics/site-location-capacity");
    const allowance = effectiveOfferAllowance(
      input.commercialPlan,
      await readAccountSiteLocationAllowance(db as never, input.clinicId)
    );
    const usage = await countActiveSiteLocationUsage(
      db as never,
      input.clinicId
    );
    if (
      usage.activeSites > allowance.sites ||
      usage.activeLocations > allowance.locations
    ) {
      return {
        ok: false,
        message:
          "This plan cannot cover the account's active clinic sites and locations. Deactivate the extra sites or locations first. Nothing was removed.",
      };
    }
  }

  const planChanged = Boolean(
    existing &&
    (existing.commercialPlan !== input.commercialPlan ||
      existing.billingInterval !== input.billingInterval)
  );

  await writePreparedOffer(db, input.clinicId, (writer) =>
    writer.clinicEntitlement.upsert({
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
    })
  );

  if (planChanged && profile?.stripeCheckoutSessionId) {
    await expireOpenCheckoutSession(
      profile.stripeCheckoutSessionId,
      input.clinicId
    );
    await writePreparedOffer(db, input.clinicId, (writer) =>
      writer.clinicBillingProfile.update({
        where: { clinicId: input.clinicId },
        data: { stripeCheckoutSessionId: null },
      })
    );
  }

  logStripeBilling({
    event: "billing_onboarding_prepared",
    clinicId: input.clinicId,
    commercialPlan: input.commercialPlan,
    billingInterval: input.billingInterval,
  });

  return { ok: true };
}

function effectiveOfferAllowance(
  plan: "ESSENTIAL" | "PRACTICE",
  stored: { locationAllowance: number }
): { sites: number; locations: number } {
  if (plan === "PRACTICE") {
    return {
      sites: 1,
      locations: Math.max(1, stored.locationAllowance),
    };
  }
  return { sites: 1, locations: 1 };
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
