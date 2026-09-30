import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CanonicalGuidePreview } from "@/app/(staff)/components/canonical-guide-preview";
import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";
import {
  TemplateActivityBadge,
  TemplateDraftBadge,
  TemplateOriginBadge,
} from "@/app/(staff)/(operator)/operator/templates/template-badges";
import { TemplateLifecycleActions } from "@/app/(staff)/(operator)/operator/templates/template-lifecycle-actions";
import { TemplateMetadataForm } from "@/app/(staff)/(operator)/operator/templates/template-metadata-form";
import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { editorSectionsToComposedGuide } from "@/lib/aftercare/editor-sections-to-document";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { loadOperatorCanonicalTemplate } from "@/lib/operator/canonical-templates/load-operator-canonical-template";
import { operatorTemplateNotice } from "@/lib/operator/canonical-templates/notices";

export const metadata: Metadata = {
  title: `Template · ${PRODUCT_NAME}`,
};

export default async function OperatorTemplateDetailPage({
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
  const latestPublished = template.revisions.find(
    (revision) => revision.isLatestPublished
  );

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-4">
        <PortalBreadcrumb
          items={[
            { href: "/operator/templates", label: "Templates" },
            { label: template.title },
          ]}
        />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
              Platform
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              {template.title}
            </h1>
            <p className="mt-2 text-sm text-staff-muted">
              {template.slug} · {template.serviceCategoryLabel}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TemplateOriginBadge isSample={template.isSample} />
            <TemplateActivityBadge isActive={template.isActive} />
            {template.openDraft ? <TemplateDraftBadge /> : null}
          </div>
        </div>
      </header>
      {notice ? (
        <p className="text-sm text-staff-muted" role="status">
          {notice}
        </p>
      ) : null}
      {template.isSample ? (
        <p className="rounded-xl border border-staff-line bg-staff-panel px-4 py-3 text-sm">
          Sample. This demo template is not a production canonical template. It
          cannot be converted or published through this workflow.
        </p>
      ) : null}
      {!template.isActive ? (
        <p className="text-sm text-staff-muted">
          Inactive
          {template.deactivatedAtLabel
            ? ` since ${template.deactivatedAtLabel}`
            : ""}
          {template.deactivatedByLabel
            ? ` · Deactivated by ${template.deactivatedByLabel}`
            : ""}
          . New clinic adoption is stopped. Existing clinic guides and patient
          pages are unchanged.
        </p>
      ) : null}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Current state</h2>
        <p className="text-sm">
          Latest published:{" "}
          {latestPublished ? (
            "Published"
          ) : (
            <span className="text-staff-muted">None</span>
          )}
        </p>
        <p className="text-sm">
          Open draft:{" "}
          {template.openDraft ? (
            <Link
              href={`/operator/templates/${template.id}/draft`}
              className="staffOperatorRowLink"
            >
              Draft
            </Link>
          ) : (
            <span className="text-staff-muted">None</span>
          )}
        </p>
        {template.openDraft && !template.isSample ? (
          <Link
            href={`/operator/templates/${template.id}/draft`}
            className="staffBtn staffBtnPrimary w-fit"
          >
            Edit draft
          </Link>
        ) : null}
      </section>
      {template.isSample ? null : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">Template details</h2>
            <TemplateMetadataForm
              templateId={template.id}
              title={template.title}
              slug={template.slug}
              serviceCategory={template.serviceCategory}
              metadataLocked={template.metadataLocked}
            />
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">Lifecycle</h2>
            <TemplateLifecycleActions
              templateId={template.id}
              draftId={template.openDraft?.id ?? null}
              neverPublished={template.latestPublishedVersion === null}
              isActive={template.isActive}
              canCreateRevision={
                template.latestPublishedVersion !== null &&
                template.openDraft === null
              }
            />
          </section>
        </>
      )}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Revision history</h2>
        {template.revisions.length === 0 ? (
          <p className="text-sm text-staff-muted">No revisions yet.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {template.revisions.map((revision) => (
              <li
                key={revision.id}
                className="rounded-xl border border-staff-line bg-staff-panel p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold">
                    Revision {revision.version}
                  </h3>
                  <span
                    className="staffStatusPill"
                    data-tone={
                      revision.status === "PUBLISHED" ? "published" : "draft"
                    }
                  >
                    {revision.status === "PUBLISHED" ? "Published" : "Draft"}
                  </span>
                  {revision.isLatestPublished ? (
                    <span className="staffStatusPill">Latest</span>
                  ) : null}
                </div>
                <dl className="mt-3 grid gap-2 text-sm text-staff-muted sm:grid-cols-2">
                  <div>
                    <dt className="font-medium text-staff-ink">Created</dt>
                    <dd>
                      {revision.createdAtLabel}
                      {revision.createdByLabel
                        ? ` · ${revision.createdByLabel}`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-staff-ink">Sections</dt>
                    <dd>{revision.sectionCount}</dd>
                  </div>
                  {revision.publishedAtLabel ? (
                    <div>
                      <dt className="font-medium text-staff-ink">Published</dt>
                      <dd>
                        {revision.publishedAtLabel}
                        {revision.publisherLabel
                          ? ` · ${revision.publisherLabel}`
                          : ""}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                {revision.status === "PUBLISHED" ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-medium">
                      Preview published content
                    </summary>
                    <div className="mt-3">
                      <CanonicalGuidePreview
                        sections={editorSectionsToComposedGuide(
                          revision.sections
                        )}
                      />
                    </div>
                  </details>
                ) : template.isSample ? null : (
                  <Link
                    href={`/operator/templates/${template.id}/draft`}
                    className="staffBtn staffBtnSecondary mt-3 w-fit"
                  >
                    Edit draft
                  </Link>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
