import type { Metadata } from "next";

import { CreateTemplateForm } from "@/app/(staff)/(operator)/operator/templates/create-template-form";
import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";
import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

export const metadata: Metadata = {
  title: `Create template · ${PRODUCT_NAME}`,
};

export default async function NewCanonicalTemplatePage() {
  await requirePlatformOperator();

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
          Creates a production template and draft version 1. Publication and
          review come later. Sample templates cannot be created here.
        </p>
      </header>
      <CreateTemplateForm />
    </div>
  );
}
