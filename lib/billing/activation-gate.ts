import "server-only";

import { BillingStatus, EntitlementStatus } from "@prisma/client";
import { redirect } from "next/navigation";

import type { ClinicMembershipContext } from "@/lib/auth/session";
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
      };
    }) => Promise<{
      entitlementStatus: EntitlementStatus;
      billingStatus?: BillingStatus | null;
    } | null>;
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
 * No entitlement row is the legacy compatibility path.
 * A billing clinic opens product routes only while entitlement is ACTIVE.
 * That includes a subscription Stripe is still retrying (PAST_DUE) and a
 * cancellation scheduled for the end of the paid period. PENDING,
 * RESTRICTED, and ENDED stay closed. Billing status chooses a recovery
 * page and never grants product access. Account billing routes are not
 * behind this gate. Operator support keeps its existing exemption.
 */
export function decideClinicProductAccess(input: {
  membershipSource: "membership" | "operator_support";
  entitlementStatus: EntitlementStatus | null;
  billingStatus: BillingStatus | null;
}): ClinicProductAccessDecision {
  if (input.membershipSource === "operator_support") {
    return { kind: "allow", reason: "operator_support" };
  }

  if (!input.entitlementStatus) {
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

export async function clinicEntitlementIsActive(
  clinicId: string,
  db?: ClinicBillingAccessDb
): Promise<boolean> {
  const row = await billingAccessDb(db).clinicEntitlement.findUnique({
    where: { clinicId },
    select: { entitlementStatus: true },
  });
  return row?.entitlementStatus === EntitlementStatus.ACTIVE;
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

  const row = await billingAccessDb(db).clinicEntitlement.findUnique({
    where: { clinicId: membership.clinic.id },
    select: { entitlementStatus: true, billingStatus: true },
  });

  const decision = decideClinicProductAccess({
    membershipSource: "membership",
    entitlementStatus: row?.entitlementStatus ?? null,
    billingStatus: row?.billingStatus ?? null,
  });

  return {
    ...decision,
    billingHref: row ? BILLING_STATUS_PATH : null,
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
