import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CreateGuideForm } from "@/app/(staff)/(clinic-portal)/guides/create-guide-form";
import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";
import { requireClinicAdmin } from "@/lib/auth/require-clinic-admin";
import { listCanonicalGuideTemplates } from "@/lib/clinic-portal/list-canonical-templates";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

export const metadata: Metadata = {
  title: `Create guide · ${PRODUCT_NAME}`,
  description:
    "Create a clinic aftercare guide from a template or as custom content.",
};

export default async function CreateGuidePage() {
  const { clinicMembership } = await requireClinicAdmin();
  const { templates, isDemoTenant } = await listCanonicalGuideTemplates(
    clinicMembership.clinic.id
  );

  if (!clinicMembership) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6">
      <header>
        <PortalBreadcrumb
          items={[{ href: "/guides", label: "Guides" }, { label: "Create" }]}
        />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Create guide
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-staff-muted">
          {isDemoTenant
            ? "Start from a template, or create a custom guide for this demo."
            : "Start from a reviewed template, or create a custom guide for this practice."}
        </p>
      </header>
      <CreateGuideForm templates={templates} isDemoTenant={isDemoTenant} />
    </div>
  );
}
