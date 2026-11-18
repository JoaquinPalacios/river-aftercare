import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import {
  endOfSydneyDay,
  parseSydneyCalendarDate,
} from "@/lib/billing/complimentary-term";
import type { Env } from "@/lib/billing/env";
import { logStripeBilling } from "@/lib/billing/log";
import {
  envFlagEnabled,
  STRIPE_PROMOTION_WITH_TRIAL_ENABLED_ENV,
} from "@/lib/billing/promotion-config";
import {
  isPromotionTerm,
  promotionQuote,
  promotionTermLabel,
  sydneyDateInputValue,
  type PromotionInterval,
  type PromotionPlan,
  type PromotionQuote,
  type PromotionTerm,
} from "@/lib/billing/promotion-terms";
import { lockClinicAccountStructure } from "@/lib/entitlements/locks";
import { getPrisma } from "@/lib/prisma";
import {
  CLINIC_ARCHIVED_MESSAGE,
  CLINIC_INACTIVE_MESSAGE,
  clinicIsClosed,
} from "@/lib/clinics/clinic-activity";
import {
  getStripeClient,
  getStripeClientConfig,
} from "@/lib/billing/stripe-client";

const OPEN_PROMOTION_STATUSES = ["AUTHORISED", "CHECKOUT_OPEN"] as const;

export type OpenPromotionalOffer = {
  id: string;
  term: PromotionTerm;
  status: "AUTHORISED" | "CHECKOUT_OPEN";
  authorisationExpiresAt: Date | null;
  stripeCouponId: string | null;
  discountDeferred: boolean;
};

type PromotionDb = Pick<PrismaClient, "clinicPromotionalOffer"> & {
  clinicEntitlement?: PrismaClient["clinicEntitlement"];
  clinicBillingProfile?: PrismaClient["clinicBillingProfile"];
  clinic?: PrismaClient["clinic"];
  $transaction?: PrismaClient["$transaction"];
  $executeRaw?: PrismaClient["$executeRaw"];
};

function addUtcMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

export function parsePromotionExpiry(
  value: unknown,
  now: Date
): { ok: true; expiresAt: Date | null } | { ok: false; error: string } {
  if (value == null) {
    return { ok: true, expiresAt: null };
  }
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: true, expiresAt: null };
  }
  const parts = parseSydneyCalendarDate(value);
  if (!parts) {
    return {
      ok: false,
      error: "Enter a valid expiry date, or leave it blank.",
    };
  }
  const expiresAt = endOfSydneyDay(parts.year, parts.month, parts.day);
  if (expiresAt.getTime() <= now.getTime()) {
    return {
      ok: false,
      error: "The introductory offer expiry must be a future Sydney date.",
    };
  }
  if (expiresAt.getTime() > addUtcMonths(now, 24).getTime()) {
    return {
      ok: false,
      error: "The introductory offer expiry must be within two years.",
    };
  }
  return { ok: true, expiresAt };
}

export function promotionalOfferStillOpen(
  offer: { authorisationExpiresAt: Date | null },
  now = new Date()
): boolean {
  return (
    offer.authorisationExpiresAt == null ||
    offer.authorisationExpiresAt.getTime() > now.getTime()
  );
}

export type ClinicPromotionPresentation = {
  term: PromotionTerm;
  expiresOn: string;
  quote: PromotionQuote | null;
  checkoutBlockedMessage: string | null;
  applied: boolean;
  summary: string;
};

const TRIAL_COMBINATION_CLOSED =
  "An introductory discount is authorised, and this clinic is also eligible for 14 free days. Those offers are not being combined yet, so payment stays closed. You have not been charged.";

export async function loadClinicPromotionPresentation(
  input: {
    clinicId: string;
    plan: string | null;
    interval: string | null;
    trialEligible: boolean;
    includeRedeemed?: boolean;
    env?: Env;
  },
  db: PromotionDb = getPrisma()
): Promise<ClinicPromotionPresentation | null> {
  if (typeof db.clinicPromotionalOffer?.findFirst !== "function") {
    return null;
  }
  const open = await loadOpenPromotionalOffer(input.clinicId, db);
  let term: PromotionTerm | null = open?.term ?? null;
  let expiresAt = open?.authorisationExpiresAt ?? null;
  let applied = false;
  if (!open && input.includeRedeemed) {
    const redeemed = await db.clinicPromotionalOffer.findFirst({
      where: { clinicId: input.clinicId, status: "REDEEMED" },
      orderBy: { redeemedAt: "desc" },
      select: { term: true },
    });
    if (redeemed && isPromotionTerm(redeemed.term)) {
      term = redeemed.term;
      expiresAt = null;
      applied = true;
    }
  }
  if (!term) {
    return null;
  }
  const expired = Boolean(open && !promotionalOfferStillOpen(open));
  const combinationClosed =
    Boolean(open) &&
    !expired &&
    input.trialEligible &&
    !envFlagEnabled(STRIPE_PROMOTION_WITH_TRIAL_ENABLED_ENV, input.env);
  const quotable =
    (input.plan === "ESSENTIAL" || input.plan === "PRACTICE") &&
    (input.interval === "MONTHLY" || input.interval === "YEARLY");
  const quote = quotable
    ? promotionQuote({
        plan: input.plan as PromotionPlan,
        interval: input.interval as PromotionInterval,
        term,
        trial: input.trialEligible && !applied && !combinationClosed,
      })
    : null;
  const summary = applied
    ? `${promotionTermLabel(term)} is on this subscription. ${quote?.renewalLabel ?? "Later invoices use the catalogue price."}`
    : expired
      ? `${promotionTermLabel(term)} has expired.`
      : `${promotionTermLabel(term)}. ${quote?.priceLabel ?? "It applies only to Essential or Practice catalogue billing."} ${quote?.renewalLabel ?? ""}`.trim();
  return {
    term,
    expiresOn: expiresAt ? sydneyDateInputValue(expiresAt) : "",
    quote,
    checkoutBlockedMessage: expired
      ? "This introductory offer has expired. Payment stays closed until River Aftercare prepares billing again."
      : combinationClosed
        ? TRIAL_COMBINATION_CLOSED
        : null,
    applied,
    summary,
  };
}

export async function loadOpenPromotionalOffer(
  clinicId: string,
  db: PromotionDb = getPrisma()
): Promise<OpenPromotionalOffer | null> {
  if (typeof db.clinicPromotionalOffer?.findFirst !== "function") {
    return null;
  }
  const row = await db.clinicPromotionalOffer.findFirst({
    where: { clinicId, status: { in: [...OPEN_PROMOTION_STATUSES] } },
    select: {
      id: true,
      term: true,
      status: true,
      authorisationExpiresAt: true,
      stripeCouponId: true,
      discountDeferred: true,
    },
  });
  if (!row || !isPromotionTerm(row.term)) {
    return null;
  }
  if (row.status !== "AUTHORISED" && row.status !== "CHECKOUT_OPEN") {
    return null;
  }
  return {
    id: row.id,
    term: row.term,
    status: row.status,
    authorisationExpiresAt: row.authorisationExpiresAt,
    stripeCouponId: row.stripeCouponId,
    discountDeferred: row.discountDeferred,
  };
}

async function withOfferLock<T>(
  db: PromotionDb,
  clinicId: string,
  write: (writer: PromotionDb) => Promise<T>
): Promise<T> {
  if (
    typeof db.$transaction === "function" &&
    typeof db.$executeRaw === "function"
  ) {
    return db.$transaction(async (tx) => {
      await lockClinicAccountStructure(
        tx as Parameters<typeof lockClinicAccountStructure>[0],
        clinicId
      );
      return write(tx as PromotionDb);
    });
  }
  return write(db);
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

export async function setClinicPromotionalTerm(
  input: {
    clinicId: string;
    actorUserId: string;
    term: PromotionTerm | null;
    expiresAt: Date | null;
    commercialPlan: "ESSENTIAL" | "PRACTICE" | "GROUP";
  },
  db: PromotionDb = getPrisma()
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof db.clinicPromotionalOffer?.findFirst !== "function") {
    return { ok: false, error: "Introductory offers are not available." };
  }
  if (input.commercialPlan === "GROUP" && input.term) {
    return {
      ok: false,
      error:
        "Group billing does not include an introductory discount. Leave that offer blank.",
    };
  }

  const result = await withOfferLock(db, input.clinicId, async (writer) => {
    const clinicDelegate = writer.clinic;
    if (typeof clinicDelegate?.findUnique === "function") {
      const clinic = await clinicDelegate.findUnique({
        where: { id: input.clinicId },
        select: { deactivatedAt: true, archivedAt: true },
      });
      if (clinic?.archivedAt) {
        return { ok: false as const, error: CLINIC_ARCHIVED_MESSAGE };
      }
      if (clinicIsClosed(clinic)) {
        return { ok: false as const, error: CLINIC_INACTIVE_MESSAGE };
      }
    }
    const entitlement = await writer.clinicEntitlement?.findUnique({
      where: { clinicId: input.clinicId },
    });
    const profile = await writer.clinicBillingProfile?.findUnique({
      where: { clinicId: input.clinicId },
      select: {
        stripeSubscriptionId: true,
        stripeCheckoutSessionId: true,
      },
    });
    if (profile?.stripeSubscriptionId) {
      return {
        ok: false as const,
        error:
          "This clinic already has a subscription. An introductory offer cannot be added.",
      };
    }
    if (entitlement?.commercialArrangement === "COMPLIMENTARY") {
      return {
        ok: false as const,
        error:
          "Complimentary clinics use a negotiated price. The introductory catalogue discount stays closed.",
      };
    }
    if (entitlement?.trialEndsAt) {
      return {
        ok: false as const,
        error:
          "This clinic has already had a catalogue trial. An introductory offer cannot be added.",
      };
    }
    const redeemed = await writer.clinicPromotionalOffer.findFirst({
      where: { clinicId: input.clinicId, status: "REDEEMED" },
      select: { id: true },
    });
    if (redeemed && input.term) {
      return {
        ok: false as const,
        error: "This clinic has already used an introductory offer.",
      };
    }
    const open = await writer.clinicPromotionalOffer.findFirst({
      where: {
        clinicId: input.clinicId,
        status: { in: [...OPEN_PROMOTION_STATUSES] },
      },
    });
    const sameOpen =
      open &&
      input.term &&
      open.term === input.term &&
      (open.authorisationExpiresAt?.getTime() ?? null) ===
        (input.expiresAt?.getTime() ?? null);
    if (sameOpen) {
      return { ok: true as const, expireSessionId: null };
    }
    if (open) {
      await writer.clinicPromotionalOffer.update({
        where: { id: open.id },
        data: {
          status: "WITHDRAWN",
          withdrawnAt: new Date(),
        },
      });
    }
    if (input.term && input.commercialPlan !== "GROUP") {
      await writer.clinicPromotionalOffer.create({
        data: {
          clinicId: input.clinicId,
          preparedByUserId: input.actorUserId,
          term: input.term,
          status: "AUTHORISED",
          authorisationExpiresAt: input.expiresAt,
        },
      });
    }
    return {
      ok: true as const,
      expireSessionId: open ? (profile?.stripeCheckoutSessionId ?? null) : null,
    };
  });

  if (!result.ok) {
    return result;
  }
  if (result.expireSessionId) {
    await expireOpenCheckoutSession(result.expireSessionId, input.clinicId);
    if (typeof db.clinicBillingProfile?.update === "function") {
      await withOfferLock(db, input.clinicId, async (writer) => {
        await writer.clinicBillingProfile?.update({
          where: { clinicId: input.clinicId },
          data: { stripeCheckoutSessionId: null },
        });
      });
    }
  }
  return { ok: true };
}

export async function markPromotionalOfferCheckoutOpen(
  input: {
    offerId: string;
    clinicId: string;
    stripeCouponId: string;
    discountDeferred: boolean;
  },
  db: Pick<PrismaClient, "clinicPromotionalOffer">
): Promise<void> {
  await db.clinicPromotionalOffer.updateMany({
    where: {
      id: input.offerId,
      clinicId: input.clinicId,
      status: { in: [...OPEN_PROMOTION_STATUSES] },
    },
    data: {
      status: "CHECKOUT_OPEN",
      stripeCouponId: input.stripeCouponId,
      discountDeferred: input.discountDeferred,
    },
  });
}

export async function markPromotionalOfferRedeemed(
  input: {
    offerId: string;
    clinicId: string;
    stripeSubscriptionId: string;
    stripeCouponId: string;
    discountDeferred: boolean;
  },
  db: Pick<PrismaClient, "clinicPromotionalOffer">
): Promise<boolean> {
  const updated = await db.clinicPromotionalOffer.updateMany({
    where: {
      id: input.offerId,
      clinicId: input.clinicId,
      status: { in: [...OPEN_PROMOTION_STATUSES] },
      OR: [{ stripeCouponId: input.stripeCouponId }, { stripeCouponId: null }],
    },
    data: {
      status: "REDEEMED",
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripeCouponId: input.stripeCouponId,
      discountDeferred: input.discountDeferred,
      redeemedAt: new Date(),
    },
  });
  return updated.count === 1;
}

export async function expirePromotionalOffer(
  input: { offerId: string; clinicId: string },
  db: Pick<PrismaClient, "clinicPromotionalOffer">
): Promise<void> {
  await db.clinicPromotionalOffer.updateMany({
    where: {
      id: input.offerId,
      clinicId: input.clinicId,
      status: { in: [...OPEN_PROMOTION_STATUSES] },
    },
    data: { status: "EXPIRED", withdrawnAt: new Date() },
  });
}

export type PromotionOfferWriter = Pick<
  Prisma.TransactionClient,
  "clinicPromotionalOffer"
>;
