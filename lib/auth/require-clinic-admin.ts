import "server-only";

import { ClinicMembershipRole, PlatformRole } from "@prisma/client";
import { notFound } from "next/navigation";

import { requireStaffSession } from "@/lib/auth/require-staff-session";

export async function requireClinicAdmin() {
  const session = await requireStaffSession();

  if (session.clinicMembership.source === "operator_support") {
    if (session.user.platformRole !== PlatformRole.OPERATOR) {
      notFound();
    }
    return session;
  }

  if (session.clinicMembership.role !== ClinicMembershipRole.ADMIN) {
    notFound();
  }

  return session;
}
