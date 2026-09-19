import type { ReactNode } from "react";

import { PortalAppearanceControl } from "@/app/(staff)/components/portal-appearance-control";
import { StaffAccountPanel } from "@/app/(staff)/components/staff-account-panel";
import { OperatorPlatformNav } from "@/app/(staff)/(operator)/components/operator-platform-nav";
import { ProductMark } from "@/lib/branding/product-mark";
import { PLATFORM_OPERATOR_ROLE_LABEL } from "@/lib/clinic-portal/role-labels";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

export function OperatorAccountChrome({
  userLabel,
  children,
}: {
  userLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="staffAppShell">
      <aside className="staffAppSidebar">
        <div className="border-b border-staff-line px-5 py-5">
          <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <ProductMark className="h-5 w-5 text-staff-brand" />
            {PRODUCT_NAME}
          </p>
          <p className="mt-1 text-sm text-staff-muted">
            {PLATFORM_OPERATOR_ROLE_LABEL}
          </p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <OperatorPlatformNav />
          <div className="mt-auto">
            <div className="staffNavRule" role="presentation" />
            <div className="staffNavGroup" aria-label="Preferences">
              <PortalAppearanceControl />
            </div>
            <div className="staffNavRule" role="presentation" />
            <StaffAccountPanel
              userLabel={userLabel}
              roleLabel={PLATFORM_OPERATOR_ROLE_LABEL}
            />
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
