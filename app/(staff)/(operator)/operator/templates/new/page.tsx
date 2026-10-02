import type { Metadata } from "next";

import { CreateTemplateForm } from "@/app/(staff)/(operator)/operator/templates/create-template-form";
import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";
import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { listActiveCanonicalSamples } from "@/lib/canonical-templates/sample-slot";

export const metadata: Metadata = {
  title: `Create template · ${PRODUCT_NAME}`,
};

export default async function NewCanonicalTemplatePage() {
  await requirePlatformOperator();
  const activeSamples = await listActiveCanonicalSamples();

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6">
      <header>
        <PortalBreadcrumb
          items={[
            { href: "/operator/templates", label: "Templates" },
            { label: "Create template" },
          ]}
        />
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
          Platform
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Create template
        </h1>
        <p className="mt-2 text-sm text-staff-muted">
          Creates a canonical template and draft version 1. Choose Production or
          Sample. Save the draft, then Publish when it is ready. Each service
          category can have one active sample.
        </p>
      </header>
      <CreateTemplateForm activeSamples={activeSamples} />
    </div>
  );
}
