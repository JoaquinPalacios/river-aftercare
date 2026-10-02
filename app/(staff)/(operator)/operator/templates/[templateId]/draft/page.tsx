import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";
import { CanonicalDraftEditor } from "@/app/(staff)/(operator)/operator/templates/canonical-draft-editor";
import { designatedDemoPublicUrl } from "@/app/(staff)/(operator)/operator/templates/request-host";
import { TemplateOriginBadge } from "@/app/(staff)/(operator)/operator/templates/template-badges";
import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { loadDesignatedDemoAdoption } from "@/lib/demo-adoption/load-designated-demo-adoption";
import { loadOperatorCanonicalTemplate } from "@/lib/operator/canonical-templates/load-operator-canonical-template";
import { operatorTemplateNotice } from "@/lib/operator/canonical-templates/notices";

export const metadata: Metadata = {
  title: `Template · ${PRODUCT_NAME}`,
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
  const latestPublished = template.revisions.find(
    (revision) => revision.isLatestPublished
  );
  const workspace = draft !== null || latestPublished !== undefined;
  const publishedWorkspace = draft === null && latestPublished !== undefined;
  const demoAdoption = publishedWorkspace
    ? await loadDesignatedDemoAdoption(template.id)
    : null;
  const demoPublicUrl = await designatedDemoPublicUrl(demoAdoption);

  return (
    <div className="canonicalDraftPage">
      {workspace ? null : (
        <header>
          <PortalBreadcrumb
            items={[
              { href: "/operator/templates", label: "Templates" },
              {
                href: `/operator/templates/${template.id}`,
                label: template.title,
              },
              { label: "Draft" },
            ]}
          />
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
            Platform
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {template.title}
            </h1>
            <TemplateOriginBadge isSample={template.isSample} />
            <span className="staffStatusPill" data-tone="draft">
              Draft
            </span>
          </div>
        </header>
      )}
      {notice ? (
        <p className="text-sm text-staff-muted" role="status">
          {notice}
        </p>
      ) : null}
      {draft ? (
        <CanonicalDraftEditor
          templateId={template.id}
          templateTitle={template.title}
          revisionId={draft.id}
          version={draft.version}
          savedContentSignature={draft.savedContentSignature}
          initialSections={draft.sections}
          isActive={template.isActive}
          isSample={template.isSample}
          neverPublished={template.latestPublishedVersion === null}
        />
      ) : latestPublished ? (
        <CanonicalDraftEditor
          mode="published"
          templateId={template.id}
          templateTitle={template.title}
          initialSections={latestPublished.sections}
          isActive={template.isActive}
          isSample={template.isSample}
          demoAdoption={demoAdoption}
          demoPublicUrl={demoPublicUrl}
        />
      ) : (
        <p className="text-sm text-staff-muted">
          {draft ? null : "This template has no open draft. "}
          <Link
            href={`/operator/templates/${template.id}`}
            className="staffOperatorRowLink"
          >
            Back to the template
          </Link>
        </p>
      )}
    </div>
  );
}
