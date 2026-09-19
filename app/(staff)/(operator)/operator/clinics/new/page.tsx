import type { Metadata } from "next";

import { CreateClinicForm } from "@/app/(staff)/(operator)/operator/clinics/new/create-clinic-form";
import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";
import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

export const metadata: Metadata = {
  title: `Create clinic · ${PRODUCT_NAME}`,
};

export default async function CreateClinicPage() {
  await requirePlatformOperator();

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6">
      <header>
        <PortalBreadcrumb
          items={[
            { href: "/operator/clinics", label: "All Clinics" },
            { label: "Create clinic" },
          ]}
        />
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
          Platform
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Create clinic
        </h1>
        <p className="mt-2 text-sm text-staff-muted">
          Minimal identity only. Invite clinic users from Team after the clinic
          exists.
        </p>
      </header>
      <CreateClinicForm />
    </div>
  );
}
