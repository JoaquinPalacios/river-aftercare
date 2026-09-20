import type { ReactNode } from "react";

import { StatusPage } from "@/app/components/status-page";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

export function StaffStatusPage({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="staffAuthPage flex flex-1 items-center justify-center bg-staff-canvas px-6 py-16">
      <div className="w-full max-w-md">
        <StatusPage
          brand={PRODUCT_NAME}
          title={title}
          description={description}
          actions={actions}
          className="staffAuthCard w-full rounded-2xl border border-staff-line bg-staff-panel p-8"
          brandClassName="mb-2 flex items-center gap-2 text-sm font-semibold text-staff-brand"
          markClassName="h-5 w-5"
          titleClassName="text-3xl font-semibold tracking-tight text-staff-ink"
          descriptionClassName="mt-2 text-sm leading-6 text-staff-muted"
          actionsClassName="mt-8 flex flex-wrap items-center gap-3"
        />
      </div>
    </div>
  );
}
