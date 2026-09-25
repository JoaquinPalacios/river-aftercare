import "server-only";

import { notFound, redirect } from "next/navigation";
import { ClinicMembershipRole, PlatformRole } from "@prisma/client";

import { getAuthContext, type AuthContext } from "@/lib/auth/session";

export type AccountSplitAuthReason =
  | "unauthenticated"
  | "clinic_admin"
  | "clinic_staff"
  | "operator_support"
  | "not_operator";

export type AccountSplitAuthDecision =
  { ok: true } | { ok: false; reason: AccountSplitAuthReason };

export function decideAccountSplitAuthorization(input: {
  user: { platformRole: PlatformRole } | null;
  clinicMembership: {
    role: ClinicMembershipRole;
    source?: "membership" | "operator_support";
  } | null;
}): AccountSplitAuthDecision {
  if (!input.user) {
    return { ok: false, reason: "unauthenticated" };
  }
  if (input.clinicMembership?.source === "operator_support") {
    return { ok: false, reason: "operator_support" };
  }
  if (input.user.platformRole !== PlatformRole.OPERATOR) {
    if (input.clinicMembership?.role === ClinicMembershipRole.ADMIN) {
      return { ok: false, reason: "clinic_admin" };
    }
    if (input.clinicMembership?.role === ClinicMembershipRole.STAFF) {
      return { ok: false, reason: "clinic_staff" };
    }
    return { ok: false, reason: "not_operator" };
  }
  return { ok: true };
}

export async function requireAccountSplitOperator(): Promise<{
  user: NonNullable<AuthContext["user"]>;
}> {
  const auth = await getAuthContext();
  const decision = decideAccountSplitAuthorization({
    user: auth.user,
    clinicMembership: auth.clinicMembership,
  });
  if (
    !auth.user ||
    (decision.ok === false && decision.reason === "unauthenticated")
  ) {
    redirect("/login");
  }
  if (!decision.ok) {
    notFound();
  }
  return { user: auth.user };
}
