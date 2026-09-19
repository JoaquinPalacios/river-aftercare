import type { ReactNode } from "react";

import { OperatorAccountChrome } from "@/app/(staff)/components/operator-account-chrome";
import { PortalChrome } from "@/app/(staff)/components/portal-chrome";
import { StaffAccountPanel } from "@/app/(staff)/components/staff-account-panel";
import { requireAuthenticatedUser } from "@/lib/auth/require-authenticated-user";
import {
  getCurrentClinicMembership,
  isPlatformOperator,
  MultipleClinicMembershipsError,
} from "@/lib/auth/session";
import { getClinicPortalOverview } from "@/lib/clinic-portal/get-clinic-portal";
import { clinicMembershipRoleLabel } from "@/lib/clinic-portal/role-labels";
import { ProductMark } from "@/lib/branding/product-mark";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { PortalAppearanceControl } from "@/app/(staff)/components/portal-appearance-control";

export default async function AccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireAuthenticatedUser();
  const userLabel = user.name?.trim() || user.email;

  let clinicMembership = null;
  try {
    clinicMembership = await getCurrentClinicMembership();
  } catch (error) {
    if (!(error instanceof MultipleClinicMembershipsError)) {
      throw error;
    }
  }

  if (clinicMembership) {
    const overview = await getClinicPortalOverview(clinicMembership.clinic.id);
    const displayName = overview?.displayName ?? clinicMembership.clinic.name;
    return (
      <PortalChrome
        displayName={displayName}
        userLabel={userLabel}
        roleLabel={clinicMembershipRoleLabel(clinicMembership.role)}
        patientSiteHref={overview?.patientSiteHref ?? null}
        canManagePractice={clinicMembership.role === "ADMIN"}
      >
        {children}
      </PortalChrome>
    );
  }

  if (isPlatformOperator(user)) {
    return (
      <OperatorAccountChrome userLabel={userLabel}>
        {children}
      </OperatorAccountChrome>
    );
  }

  return (
    <div className="staffAppShell">
      <aside className="staffAppSidebar">
        <div className="border-b border-staff-line px-5 py-5">
          <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <ProductMark className="h-5 w-5 text-staff-brand" />
            {PRODUCT_NAME}
          </p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <div className="mt-auto">
            <div className="staffNavRule" role="presentation" />
            <div className="staffNavGroup" aria-label="Preferences">
              <PortalAppearanceControl />
            </div>
            <div className="staffNavRule" role="presentation" />
            <StaffAccountPanel userLabel={userLabel} roleLabel="Account" />
          </div>
        </div>
      </aside>
      <div className="staffAppMain">
        <main className="staffAppScroller">
          <div className="staffAppContent">{children}</div>
        </main>
      </div>
    </div>
  );
}
