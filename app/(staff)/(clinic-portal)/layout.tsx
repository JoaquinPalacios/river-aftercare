import type { ReactNode } from "react";

import { PortalChrome } from "@/app/(staff)/components/portal-chrome";
import { requireStaffSession } from "@/lib/auth/require-staff-session";
import { enforcePrePaymentActivationGate } from "@/lib/billing/activation-gate";
import { getClinicPortalOverview } from "@/lib/clinic-portal/get-clinic-portal";
import {
  clinicMembershipRoleLabel,
  PLATFORM_OPERATOR_ROLE_LABEL,
} from "@/lib/clinic-portal/role-labels";

export default async function ClinicPortalLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const { user, clinicMembership } = await requireStaffSession();
  const billingAccess = await enforcePrePaymentActivationGate(clinicMembership);
  const overview = await getClinicPortalOverview(clinicMembership.clinic.id);
  const assisting = clinicMembership.source === "operator_support";
  const displayName = overview?.displayName ?? clinicMembership.clinic.name;

  return (
    <PortalChrome
      displayName={displayName}
      userLabel={user.name?.trim() || user.email}
      roleLabel={
        assisting
          ? PLATFORM_OPERATOR_ROLE_LABEL
          : clinicMembershipRoleLabel(clinicMembership.role)
      }
      patientSiteHref={overview?.patientSiteHref ?? null}
      canManagePractice={assisting || clinicMembership.role === "ADMIN"}
      assistingClinicName={assisting ? displayName : null}
      billingHref={billingAccess.billingHref}
    >
      {children}
    </PortalChrome>
  );
}
