import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";
import { CanonicalDraftEditor } from "@/app/(staff)/(operator)/operator/templates/canonical-draft-editor";
import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { loadOperatorCanonicalTemplate } from "@/lib/operator/canonical-templates/load-operator-canonical-template";
import { operatorTemplateNotice } from "@/lib/operator/canonical-templates/notices";

export const metadata: Metadata = {
  title: `Template draft · ${PRODUCT_NAME}`,
};

export default async function OperatorTemplateDraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  await requirePlatformOperator();
  const { templateId } = await params;
  const query = await searchParams;
  const template = await loadOperatorCanonicalTemplate(templateId);
  if (!template) {
    notFound();
  }
  const notice = operatorTemplateNotice(query.notice);
  const draft = template.openDraft;

  return (
    <div className="canonicalDraftPage">
      <header>
        {draft && !template.isSample ? null : (
          <PortalBreadcrumb
            items={[
              { href: "/operator/templates", label: "Templates" },
              {
                href: `/operator/templates/${template.id}`,
                label: template.title,
              },
              { label: draft ? `Draft v${draft.version}` : "Draft" },
            ]}
          />
        )}
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
          Platform
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {draft ? `Draft v${draft.version}` : "Draft"} · {template.title}
        </h1>
      </header>
      {notice ? (
        <p className="text-sm text-staff-muted" role="status">
          {notice}
        </p>
      ) : null}
      {template.isSample ? (
        <p className="rounded-xl border border-staff-line bg-staff-panel px-4 py-3 text-sm">
          Sample templates stay outside the production draft and publish
          workflow.
        </p>
      ) : null}
      {!draft ? (
        <p className="text-sm text-staff-muted">
          This template has no open draft.{" "}
          <Link
            href={`/operator/templates/${template.id}`}
            className="staffOperatorRowLink"
          >
            Back to the template
          </Link>
        </p>
      ) : template.isSample ? (
        <p className="text-sm text-staff-muted">
          <Link
            href={`/operator/templates/${template.id}`}
            className="staffOperatorRowLink"
          >
            Back to the template
          </Link>
        </p>
      ) : (
        <>
          <CanonicalDraftEditor
            templateId={template.id}
            templateTitle={template.title}
            revisionId={draft.id}
            version={draft.version}
            savedContentSignature={draft.savedContentSignature}
            initialSections={draft.sections}
            isActive={template.isActive}
            neverPublished={template.latestPublishedVersion === null}
          />
        </>
      )}
    </div>
  );
}
