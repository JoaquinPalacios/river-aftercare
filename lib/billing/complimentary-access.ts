import "server-only";

import {
  BillingStatus,
  EntitlementStatus,
  PlatformRole,
  type Prisma,
} from "@prisma/client";

import { findOpenAccountSplitInvolvingClinic } from "@/lib/account-split/snapshot";
import { formatBillingDate } from "@/lib/billing/billing-presentation";
import { commercialPlanLabel } from "@/lib/billing/offer-display";
import {
  nextComplimentaryExpiry,
  parseComplimentaryDuration,
  parseComplimentaryPlan,
  parseComplimentaryReason,
  parseCustomEndDate,
  parseOptionalReviewDate,
  type ComplimentaryDuration,
  type ComplimentaryPlan,
  type ComplimentaryTerm,
} from "@/lib/billing/complimentary-term";
import { lockClinicAccountStructure } from "@/lib/entitlements/locks";
import { getPrisma } from "@/lib/prisma";

const PAID_BILLING_STATUSES = new Set<BillingStatus>([
  BillingStatus.ACTIVE,
  BillingStatus.PAST_DUE,
  BillingStatus.CANCEL_AT_PERIOD_END,
  BillingStatus.UNPAID,
  BillingStatus.PAYMENT_PENDING,
]);

const SPLIT_BLOCK =
  "An account split is open for this clinic. Finish or cancel it before changing complimentary access.";
const CHECKOUT_BLOCK = "Checkout is in progress for this clinic.";
const NEGOTIATED_BLOCK =
  "A negotiated price is open for this clinic. Withdraw it before changing complimentary access.";
const PAID_BLOCK = "This clinic has a paid Stripe subscription.";
const EXTEND_INSTEAD =
  "This clinic already has complimentary access. Extend that agreement.";
const NOTHING_TO_EXTEND =
  "This clinic has no complimentary agreement to extend.";
const CONCURRENT_BLOCK =
  "Complimentary access changed while this request was saving. Review the current agreement and try again.";

export type ComplimentaryMutationResult =
  | {
      ok: true;
      commercialPlan: ComplimentaryPlan;
      expiresAt: Date | null;
      indefinite: boolean;
    }
  | { ok: false; error: string };

export type ComplimentaryAccessEventView = {
  id: string;
  kindLabel: "Grant" | "Extension";
  planLabel: string;
  actorLabel: string;
  previousExpiryLabel: string;
  nextExpiryLabel: string;
  reason: string;
  reviewLabel: string | null;
  recordedLabel: string;
};

export type ComplimentaryAccessView = {
  mode: "grant" | "extend";
  plan: ComplimentaryPlan | null;
  planLabel: string;
  phase: "none" | "active" | "expired";
  indefinite: boolean;
  expiresLabel: string | null;
  reviewLabel: string | null;
  events: ComplimentaryAccessEventView[];
};

type MutationInput = {
  actorUserId: string;
  actorPlatformRole: PlatformRole;
  clinicId: string;
  duration: unknown;
  customEndDate?: unknown;
  reviewDate?: unknown;
  reason: unknown;
  now?: Date;
};

type GrantInput = MutationInput & {
  commercialPlan: unknown;
};

type Db = Prisma.TransactionClient;

function operatorGuard(role: PlatformRole): string | null {
  if (role !== PlatformRole.OPERATOR) {
    return "Only a platform operator can change complimentary access.";
  }
  return null;
}

function parsedMutation(
  input: MutationInput,
  now: Date
):
  | {
      ok: true;
      duration: ComplimentaryDuration;
      customExpiresAt: Date | null;
      reviewAt: Date | null;
      reason: string;
    }
  | { ok: false; error: string } {
  const duration = parseComplimentaryDuration(input.duration);
  if (!duration) {
    return {
      ok: false,
      error: "Choose a six-month, 12-month, custom, or indefinite duration.",
    };
  }
  const reason = parseComplimentaryReason(input.reason);
  if (!reason.ok) {
    return reason;
  }
  const review = parseOptionalReviewDate(input.reviewDate, now);
  if (!review.ok) {
    return review;
  }
  let customExpiresAt: Date | null = null;
  if (duration === "CUSTOM") {
    const custom = parseCustomEndDate(input.customEndDate, now);
    if (!custom.ok) {
      return custom;
    }
    customExpiresAt = custom.expiresAt;
  }
  return {
    ok: true,
    duration,
    customExpiresAt,
    reviewAt: review.reviewAt,
    reason: reason.reason,
  };
}

async function readContext(tx: Db, clinicId: string) {
  const [clinic, openSplit, profile, entitlement, openNegotiatedOffer] =
    await Promise.all([
      tx.clinic.findUnique({ where: { id: clinicId }, select: { id: true } }),
      findOpenAccountSplitInvolvingClinic(clinicId, tx),
      tx.clinicBillingProfile.findUnique({
        where: { clinicId },
        select: {
          stripeSubscriptionId: true,
          stripeCheckoutSessionId: true,
        },
      }),
      tx.clinicEntitlement.findUnique({ where: { clinicId } }),
      tx.clinicNegotiatedOffer.findFirst({
        where: {
          clinicId,
          status: { in: ["PREPARED", "CHECKOUT_OPEN"] },
        },
        select: { id: true },
      }),
    ]);
  return { clinic, openSplit, profile, entitlement, openNegotiatedOffer };
}

function sharedCommercialBlock(input: {
  clinic: { id: string } | null;
  openSplit: { id: string } | null;
  profile: {
    stripeSubscriptionId: string | null;
    stripeCheckoutSessionId: string | null;
  } | null;
  entitlement: {
    billingStatus: BillingStatus;
    commercialArrangement: "PAID" | "COMPLIMENTARY";
  } | null;
  openNegotiatedOffer: { id: string } | null;
}): string | null {
  if (!input.clinic) {
    return "Clinic not found.";
  }
  if (input.openNegotiatedOffer) {
    return NEGOTIATED_BLOCK;
  }
  if (input.openSplit) {
    return SPLIT_BLOCK;
  }
  if (
    input.profile?.stripeCheckoutSessionId ||
    input.entitlement?.billingStatus === BillingStatus.PAYMENT_PENDING
  ) {
    return CHECKOUT_BLOCK;
  }
  return null;
}

function complimentaryLocationAllowance(
  plan: ComplimentaryPlan,
  extraLocationAllowance: number | null | undefined
): number {
  if (plan !== "PRACTICE") {
    return 1;
  }
  const extra =
    typeof extraLocationAllowance === "number" &&
    Number.isInteger(extraLocationAllowance) &&
    extraLocationAllowance > 0
      ? extraLocationAllowance
      : 0;
  return 1 + extra;
}

function grantBlock(
  context: Awaited<ReturnType<typeof readContext>>
): string | null {
  const shared = sharedCommercialBlock(context);
  if (shared) {
    return shared;
  }
  const entitlement = context.entitlement;
  if (entitlement?.commercialArrangement === "COMPLIMENTARY") {
    return EXTEND_INSTEAD;
  }
  if (entitlement && PAID_BILLING_STATUSES.has(entitlement.billingStatus)) {
    return PAID_BLOCK;
  }
  if (
    context.profile?.stripeSubscriptionId &&
    entitlement?.billingStatus !== BillingStatus.ENDED
  ) {
    return PAID_BLOCK;
  }
  if (entitlement?.entitlementStatus === EntitlementStatus.ACTIVE) {
    return "This clinic already has active paid access.";
  }
  return null;
}

function extendBlock(
  context: Awaited<ReturnType<typeof readContext>>
): string | null {
  const shared = sharedCommercialBlock(context);
  if (shared) {
    return shared;
  }
  const entitlement = context.entitlement;
  if (entitlement?.commercialArrangement !== "COMPLIMENTARY") {
    return NOTHING_TO_EXTEND;
  }
  if (
    entitlement.commercialPlan !== "ESSENTIAL" &&
    entitlement.commercialPlan !== "PRACTICE"
  ) {
    return "This complimentary agreement has no Essential or Practice plan to extend.";
  }
  return null;
}

async function writeEvent(
  tx: Db,
  input: {
    clinicId: string;
    actorUserId: string;
    kind: "GRANT" | "EXTENSION";
    commercialPlan: ComplimentaryPlan;
    previousExpiresAt: Date | null;
    previousIndefinite: boolean;
    term: ComplimentaryTerm;
    reviewAt: Date | null;
    reason: string;
  }
) {
  await tx.clinicComplimentaryAccessEvent.create({
    data: {
      clinicId: input.clinicId,
      actorUserId: input.actorUserId,
      kind: input.kind,
      commercialPlan: input.commercialPlan,
      previousExpiresAt: input.previousExpiresAt,
      previousIndefinite: input.previousIndefinite,
      expiresAt: input.term.expiresAt,
      indefinite: input.term.indefinite,
      commercialReviewAt: input.reviewAt,
      reason: input.reason,
    },
  });
}

export async function grantComplimentaryAccess(
  input: GrantInput
): Promise<ComplimentaryMutationResult> {
  const denied = operatorGuard(input.actorPlatformRole);
  if (denied) {
    return { ok: false, error: denied };
  }
  const now = input.now ?? new Date();
  const plan = parseComplimentaryPlan(input.commercialPlan);
  if (!plan) {
    return { ok: false, error: "Choose Essential or Practice." };
  }
  const parsed = parsedMutation(input, now);
  if (!parsed.ok) {
    return parsed;
  }

  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    await lockClinicAccountStructure(tx, input.clinicId);
    const context = await readContext(tx, input.clinicId);
    const blocked = grantBlock(context);
    if (blocked) {
      return { ok: false as const, error: blocked };
    }
    const termResult = nextComplimentaryExpiry({
      duration: parsed.duration,
      now,
      currentExpiresAt: null,
      currentIndefinite: false,
      customExpiresAt: parsed.customExpiresAt,
    });
    if (!termResult.ok) {
      return { ok: false as const, error: termResult.error };
    }
    const term = termResult.term;
    const data = {
      commercialPlan: plan,
      commercialArrangement: "COMPLIMENTARY" as const,
      billingStatus: BillingStatus.NOT_BILLED,
      entitlementStatus: EntitlementStatus.ACTIVE,
      billingInterval: null,
      stripePriceId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      paidThrough: null,
      cancelAtPeriodEnd: false,
      subscriptionEndedAt: null,
      publicGuideRetentionUntil: null,
      complimentaryExpiresAt: term.expiresAt,
      commercialReviewAt: parsed.reviewAt,
      scheduledCommercialPlan: null,
      scheduledPlanEffectiveAt: null,
      offeredAdditionalSiteQuantity: null,
      scheduledAdditionalSiteQuantity: null,
      scheduledCapacityEffectiveAt: null,
      purchasedAdditionalSiteQuantity: null,
      purchasedAdditionalLocationQuantity: null,
      siteAllowance: 1,
      locationAllowance: complimentaryLocationAllowance(
        plan,
        context.entitlement?.extraLocationAllowance
      ),
    };
    if (context.entitlement) {
      const updated = await tx.clinicEntitlement.updateMany({
        where: {
          clinicId: input.clinicId,
          commercialArrangement: "PAID",
          billingStatus: context.entitlement.billingStatus,
          entitlementStatus: context.entitlement.entitlementStatus,
        },
        data,
      });
      if (updated.count !== 1) {
        return { ok: false as const, error: CONCURRENT_BLOCK };
      }
    } else {
      await tx.clinicEntitlement.create({
        data: { clinicId: input.clinicId, ...data },
      });
    }
    await writeEvent(tx, {
      clinicId: input.clinicId,
      actorUserId: input.actorUserId,
      kind: "GRANT",
      commercialPlan: plan,
      previousExpiresAt: null,
      previousIndefinite: false,
      term,
      reviewAt: parsed.reviewAt,
      reason: parsed.reason,
    });
    return {
      ok: true as const,
      commercialPlan: plan,
      expiresAt: term.expiresAt,
      indefinite: term.indefinite,
    };
  });
}

export async function extendComplimentaryAccess(
  input: MutationInput
): Promise<ComplimentaryMutationResult> {
  const denied = operatorGuard(input.actorPlatformRole);
  if (denied) {
    return { ok: false, error: denied };
  }
  const now = input.now ?? new Date();
  const parsed = parsedMutation(input, now);
  if (!parsed.ok) {
    return parsed;
  }

  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    await lockClinicAccountStructure(tx, input.clinicId);
    const context = await readContext(tx, input.clinicId);
    const blocked = extendBlock(context);
    if (blocked) {
      return { ok: false as const, error: blocked };
    }
    const entitlement = context.entitlement;
    if (!entitlement) {
      return { ok: false as const, error: NOTHING_TO_EXTEND };
    }
    const plan = entitlement.commercialPlan;
    if (plan !== "ESSENTIAL" && plan !== "PRACTICE") {
      return {
        ok: false as const,
        error:
          "This complimentary agreement has no Essential or Practice plan to extend.",
      };
    }
    const currentIndefinite = entitlement.complimentaryExpiresAt === null;
    const termResult = nextComplimentaryExpiry({
      duration: parsed.duration,
      now,
      currentExpiresAt: entitlement.complimentaryExpiresAt,
      currentIndefinite,
      customExpiresAt: parsed.customExpiresAt,
    });
    if (!termResult.ok) {
      return { ok: false as const, error: termResult.error };
    }
    const term = termResult.term;
    const updated = await tx.clinicEntitlement.updateMany({
      where: {
        clinicId: input.clinicId,
        commercialArrangement: "COMPLIMENTARY",
        complimentaryExpiresAt: entitlement.complimentaryExpiresAt,
        entitlementStatus: entitlement.entitlementStatus,
        commercialPlan: plan,
      },
      data: {
        entitlementStatus: EntitlementStatus.ACTIVE,
        complimentaryExpiresAt: term.expiresAt,
        commercialReviewAt: parsed.reviewAt,
      },
    });
    if (updated.count !== 1) {
      return { ok: false as const, error: CONCURRENT_BLOCK };
    }
    await writeEvent(tx, {
      clinicId: input.clinicId,
      actorUserId: input.actorUserId,
      kind: "EXTENSION",
      commercialPlan: plan,
      previousExpiresAt: entitlement.complimentaryExpiresAt,
      previousIndefinite: currentIndefinite,
      term,
      reviewAt: parsed.reviewAt,
      reason: parsed.reason,
    });
    return {
      ok: true as const,
      commercialPlan: plan,
      expiresAt: term.expiresAt,
      indefinite: term.indefinite,
    };
  });
}

export async function persistExpiredComplimentaryAccess(
  clinicId: string,
  now: Date = new Date()
): Promise<void> {
  await getPrisma().clinicEntitlement.updateMany({
    where: {
      clinicId,
      commercialArrangement: "COMPLIMENTARY",
      entitlementStatus: EntitlementStatus.ACTIVE,
      complimentaryExpiresAt: { lte: now },
    },
    data: { entitlementStatus: EntitlementStatus.ENDED },
  });
}

function expiryLabel(input: {
  indefinite: boolean;
  expiresAt: Date | null;
}): string {
  if (input.indefinite || !input.expiresAt) {
    return "Indefinite";
  }
  return formatBillingDate(input.expiresAt);
}

export async function loadComplimentaryAccessView(
  clinicId: string,
  now: Date = new Date()
): Promise<ComplimentaryAccessView | null> {
  const prisma = getPrisma();
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true },
  });
  if (!clinic) {
    return null;
  }
  await persistExpiredComplimentaryAccess(clinicId, now);
  const [entitlement, events] = await Promise.all([
    prisma.clinicEntitlement.findUnique({ where: { clinicId } }),
    prisma.clinicComplimentaryAccessEvent.findMany({
      where: { clinicId },
      orderBy: { createdAt: "asc" },
      include: {
        actor: { select: { name: true, email: true } },
      },
    }),
  ]);
  const complimentary = entitlement?.commercialArrangement === "COMPLIMENTARY";
  const plan =
    complimentary &&
    (entitlement.commercialPlan === "ESSENTIAL" ||
      entitlement.commercialPlan === "PRACTICE")
      ? entitlement.commercialPlan
      : null;
  const indefinite = Boolean(
    complimentary && entitlement.complimentaryExpiresAt === null
  );
  const expired = Boolean(
    complimentary &&
    entitlement.complimentaryExpiresAt &&
    entitlement.complimentaryExpiresAt.getTime() <= now.getTime()
  );
  return {
    mode: complimentary ? "extend" : "grant",
    plan,
    planLabel: plan ? commercialPlanLabel(plan) : "Not granted",
    phase: !complimentary ? "none" : expired ? "expired" : "active",
    indefinite,
    expiresLabel: complimentary
      ? expiryLabel({
          indefinite,
          expiresAt: entitlement.complimentaryExpiresAt,
        })
      : null,
    reviewLabel:
      complimentary && entitlement.commercialReviewAt
        ? formatBillingDate(entitlement.commercialReviewAt)
        : null,
    events: events.map((event) => ({
      id: event.id,
      kindLabel: event.kind === "GRANT" ? "Grant" : "Extension",
      planLabel: commercialPlanLabel(event.commercialPlan),
      actorLabel: event.actor.name?.trim() || event.actor.email,
      previousExpiryLabel: event.previousIndefinite
        ? "Indefinite"
        : event.previousExpiresAt
          ? formatBillingDate(event.previousExpiresAt)
          : "None",
      nextExpiryLabel: expiryLabel({
        indefinite: event.indefinite,
        expiresAt: event.expiresAt,
      }),
      reason: event.reason,
      reviewLabel: event.commercialReviewAt
        ? formatBillingDate(event.commercialReviewAt)
        : null,
      recordedLabel: formatBillingDate(event.createdAt),
    })),
  };
}
