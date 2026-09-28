import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";
import { CanonicalDraftEditor } from "@/app/(staff)/(operator)/operator/templates/canonical-draft-editor";
import { EditorSectionHeading } from "@/app/(staff)/components/guide-section-editors";
import { RecordReviewForm } from "@/app/(staff)/(operator)/operator/templates/record-review-form";
import { TemplateLifecycleActions } from "@/app/(staff)/(operator)/operator/templates/template-lifecycle-actions";
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
    <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-6">
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
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
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
          Sample templates stay outside the production draft, review, and
          publish workflow.
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
            revisionId={draft.id}
            version={draft.version}
            reviewed={draft.reviewed}
            reviewSummary={
              draft.reviewed && draft.reviewerName
                ? {
                    reviewerName: draft.reviewerName,
                    reviewerCredential: draft.reviewerCredential,
                    reviewNote: draft.reviewNote,
                    reviewedAtLabel: draft.reviewedAtLabel,
                    recordedByLabel: draft.recordedByLabel,
                  }
                : null
            }
            savedContentSignature={draft.savedContentSignature}
            initialSections={draft.sections}
            isActive={template.isActive}
          />
          <EditorSectionHeading title="Record review">
            <p className="text-sm text-staff-muted">
              Recording review does not publish the revision. Publishing makes a
              reviewed revision available to eligible clinics.
            </p>
            <RecordReviewForm
              templateId={template.id}
              revisionId={draft.id}
              reviewerName={draft.reviewerName ?? ""}
              reviewerCredential={draft.reviewerCredential ?? ""}
              reviewNote={draft.reviewNote ?? ""}
              reviewed={draft.reviewed}
            />
          </EditorSectionHeading>
          <EditorSectionHeading title="Draft actions">
            <TemplateLifecycleActions
              templateId={template.id}
              draftId={draft.id}
              neverPublished={template.latestPublishedVersion === null}
              isActive={template.isActive}
              canCreateRevision={false}
            />
          </EditorSectionHeading>
        </>
      )}
    </div>
  );
}
