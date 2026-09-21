import "server-only";

import { BillingStatus, EntitlementStatus } from "@prisma/client";
import { redirect } from "next/navigation";

import type { ClinicMembershipContext } from "@/lib/auth/session";
import { getPrisma } from "@/lib/prisma";

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
 * Phase 2 activation gate.
 *
 * No entitlement row is the legacy compatibility path.
 * A billing-onboarding clinic opens product routes only while entitlement
 * is ACTIVE. Every other entitlement state stays closed. Billing status
 * chooses a recovery page and never grants product access.
 * Operator support keeps its existing exemption.
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

export async function readClinicBillingAccess(
  membership: Pick<ClinicMembershipContext, "clinic" | "source">
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

  const row = await getPrisma().clinicEntitlement.findUnique({
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
  membership: Pick<ClinicMembershipContext, "clinic" | "source">
): Promise<Awaited<ReturnType<typeof readClinicBillingAccess>>> {
  const access = await readClinicBillingAccess(membership);
  if (access.kind === "billing_required") {
    redirect(access.href);
  }
  return access;
}

export async function clinicProductApiBlocked(
  membership: Pick<ClinicMembershipContext, "clinic" | "source">
): Promise<boolean> {
  const access = await readClinicBillingAccess(membership);
  return access.kind === "billing_required";
}
