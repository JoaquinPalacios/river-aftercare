import "server-only";

import {
  BillingStatus,
  EntitlementStatus,
  type CommercialArrangement,
} from "@prisma/client";
import { redirect } from "next/navigation";

import type { ClinicMembershipContext } from "@/lib/auth/session";
import { complimentaryProductStatus } from "@/lib/billing/complimentary-term";
import { getPrisma } from "@/lib/prisma";

/**
 * Narrow entitlement lookup. Production callers omit it and the helpers
 * use getPrisma(). In-process tests may pass a reader so the activation
 * gate still runs without a live database. A value whose findUnique is
 * not a function is ignored, so a serialized server-action argument
 * cannot replace the database.
 */
export type ClinicBillingAccessDb = {
  clinicEntitlement: {
    findUnique: (args: {
      where: { clinicId: string };
      select?: {
        entitlementStatus?: boolean;
        billingStatus?: boolean;
        commercialArrangement?: boolean;
        complimentaryExpiresAt?: boolean;
      };
    }) => Promise<{
      entitlementStatus: EntitlementStatus;
      billingStatus?: BillingStatus | null;
      commercialArrangement?: CommercialArrangement | null;
      complimentaryExpiresAt?: Date | null;
    } | null>;
    updateMany?: (args: {
      where: {
        clinicId: string;
        commercialArrangement: "COMPLIMENTARY";
        entitlementStatus: EntitlementStatus;
        complimentaryExpiresAt: { lte: Date };
      };
      data: { entitlementStatus: EntitlementStatus };
    }) => Promise<unknown>;
  };
};

function billingAccessDb(db?: ClinicBillingAccessDb): ClinicBillingAccessDb {
  if (typeof db?.clinicEntitlement?.findUnique === "function") {
    return db;
  }
  // Prisma's findUnique overloads are not structurally identical to this
  // narrow reader. Production still executes the real delegate.
  return getPrisma() as unknown as ClinicBillingAccessDb;
}

export const BILLING_SETUP_PATH = "/account/billing/setup";
export const BILLING_COMPLETE_PATH = "/account/billing/complete";
export const BILLING_STATUS_PATH = "/account/billing";

export type BillingRecoveryPath =
  | typeof BILLING_SETUP_PATH
  | typeof BILLING_COMPLETE_PATH
  | typeof BILLING_STATUS_PATH;

export type ClinicProductAccessDecision =
  | {
      kind: "allow";
      reason: "legacy" | "active" | "operator_support";
    }
  | {
      kind: "billing_required";
      reason: "not_active";
      href: BillingRecoveryPath;
    };

/**
 * Product access gate.
 *
 * No entitlement row is the legacy compatibility path for a historical clinic.
 * A clinic created through assisted onboarding is not on that path until an
 * explicit entitlement exists.
 * A billing clinic opens product routes only while entitlement is ACTIVE.
 * That includes a subscription Stripe is still retrying (PAST_DUE) and a
 * cancellation scheduled for the end of the paid period. PENDING,
 * RESTRICTED, and ENDED stay closed. An expired complimentary grant is
 * evaluated at request time and uses the same closed path. It does not
 * fall back to the legacy row. Billing status chooses a recovery page and
 * never grants product access. Account billing routes are not behind this
 * gate. Operator support keeps its existing exemption.
 */
export function decideClinicProductAccess(input: {
  membershipSource: "membership" | "operator_support";
  entitlementStatus: EntitlementStatus | null;
  billingStatus: BillingStatus | null;
  /**
   * Clinics created through assisted onboarding are not on the legacy path
   * while they have no entitlement. Historical clinics leave this unset.
   */
  assistedOnboarding?: boolean;
}): ClinicProductAccessDecision {
  if (input.membershipSource === "operator_support") {
    return { kind: "allow", reason: "operator_support" };
  }

  if (!input.entitlementStatus) {
    if (input.assistedOnboarding) {
      return {
        kind: "billing_required",
        reason: "not_active",
        href: BILLING_SETUP_PATH,
      };
    }
    return { kind: "allow", reason: "legacy" };
  }

  if (input.entitlementStatus === EntitlementStatus.ACTIVE) {
    return { kind: "allow", reason: "active" };
  }

  return {
    kind: "billing_required",
    reason: "not_active",
    href: billingRecoveryPath(input.entitlementStatus, input.billingStatus),
  };
}

function billingRecoveryPath(
  entitlementStatus: EntitlementStatus,
  billingStatus: BillingStatus | null
): BillingRecoveryPath {
  if (
    entitlementStatus === EntitlementStatus.ENDED ||
    entitlementStatus === EntitlementStatus.RESTRICTED
  ) {
    return BILLING_STATUS_PATH;
  }
  if (billingStatus === BillingStatus.PAYMENT_PENDING) {
    return BILLING_COMPLETE_PATH;
  }
  return BILLING_SETUP_PATH;
}

async function readEffectiveEntitlement(
  clinicId: string,
  db?: ClinicBillingAccessDb
): Promise<{
  entitlementStatus: EntitlementStatus | null;
  billingStatus: BillingStatus | null;
  hasRow: boolean;
}> {
  const database = billingAccessDb(db);
  const now = new Date();
  const row = await database.clinicEntitlement.findUnique({
    where: { clinicId },
    select: {
      entitlementStatus: true,
      billingStatus: true,
      commercialArrangement: true,
      complimentaryExpiresAt: true,
    },
  });
  const entitlementStatus = complimentaryProductStatus({
    entitlementStatus: row?.entitlementStatus ?? null,
    commercialArrangement: row?.commercialArrangement,
    complimentaryExpiresAt: row?.complimentaryExpiresAt,
    now,
  });
  if (
    row &&
    entitlementStatus === EntitlementStatus.ENDED &&
    row.entitlementStatus === EntitlementStatus.ACTIVE &&
    typeof database.clinicEntitlement.updateMany === "function"
  ) {
    await database.clinicEntitlement.updateMany({
      where: {
        clinicId,
        commercialArrangement: "COMPLIMENTARY",
        entitlementStatus: EntitlementStatus.ACTIVE,
        complimentaryExpiresAt: { lte: now },
      },
      data: { entitlementStatus: EntitlementStatus.ENDED },
    });
  }
  return {
    entitlementStatus,
    billingStatus: row?.billingStatus ?? null,
    hasRow: Boolean(row),
  };
}

/**
 * In-process test doubles that only stub clinicEntitlement stay on the
 * historical path. Production Prisma includes clinic.findUnique.
 */
async function readAssistedOnboarding(
  clinicId: string,
  db: ClinicBillingAccessDb
): Promise<boolean> {
  const clinic = (
    db as {
      clinic?: {
        findUnique?: (args: {
          where: { id: string };
          select: { assistedOnboarding: true };
        }) => Promise<{ assistedOnboarding: boolean } | null>;
      };
    }
  ).clinic;
  if (typeof clinic?.findUnique !== "function") {
    return false;
  }
  const row = await clinic.findUnique({
    where: { id: clinicId },
    select: { assistedOnboarding: true },
  });
  return row?.assistedOnboarding === true;
}

export async function clinicEntitlementIsActive(
  clinicId: string,
  db?: ClinicBillingAccessDb
): Promise<boolean> {
  const row = await readEffectiveEntitlement(clinicId, db);
  return row.entitlementStatus === EntitlementStatus.ACTIVE;
}

export async function readClinicBillingAccess(
  membership: Pick<ClinicMembershipContext, "clinic" | "source">,
  db?: ClinicBillingAccessDb
): Promise<ClinicProductAccessDecision & { billingHref: string | null }> {
  if (membership.source === "operator_support") {
    return {
      ...decideClinicProductAccess({
        membershipSource: "operator_support",
        entitlementStatus: null,
        billingStatus: null,
      }),
      billingHref: null,
    };
  }

  const row = await readEffectiveEntitlement(membership.clinic.id, db);
  const assistedOnboarding = await readAssistedOnboarding(
    membership.clinic.id,
    billingAccessDb(db)
  );

  const decision = decideClinicProductAccess({
    membershipSource: "membership",
    entitlementStatus: row.entitlementStatus,
    billingStatus: row.billingStatus,
    assistedOnboarding,
  });

  return {
    ...decision,
    billingHref: row.hasRow ? BILLING_STATUS_PATH : null,
  };
}

export async function enforcePrePaymentActivationGate(
  membership: Pick<ClinicMembershipContext, "clinic" | "source">,
  db?: ClinicBillingAccessDb
): Promise<Awaited<ReturnType<typeof readClinicBillingAccess>>> {
  const access = await readClinicBillingAccess(membership, db);
  if (access.kind === "billing_required") {
    redirect(access.href);
  }
  return access;
}

export async function clinicProductApiBlocked(
  membership: Pick<ClinicMembershipContext, "clinic" | "source">,
  db?: ClinicBillingAccessDb
): Promise<boolean> {
  const access = await readClinicBillingAccess(membership, db);
  return access.kind === "billing_required";
}
