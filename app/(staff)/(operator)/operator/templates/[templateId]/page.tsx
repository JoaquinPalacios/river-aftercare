import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";
import {
  TemplateActivityBadge,
  TemplateDraftBadge,
  TemplateOriginBadge,
} from "@/app/(staff)/(operator)/operator/templates/template-badges";
import { DuplicateTemplateAction } from "@/app/(staff)/(operator)/operator/templates/duplicate-template-action";
import { TemplateEditAction } from "@/app/(staff)/(operator)/operator/templates/template-edit-action";
import { TemplateDemoAdoption } from "@/app/(staff)/(operator)/operator/templates/template-demo-adoption";
import { TemplateLifecycleActions } from "@/app/(staff)/(operator)/operator/templates/template-lifecycle-actions";
import { TemplateMetadataForm } from "@/app/(staff)/(operator)/operator/templates/template-metadata-form";
import { designatedDemoPublicUrl } from "@/app/(staff)/(operator)/operator/templates/request-host";
import { TemplatePreviewCard } from "@/app/(staff)/(operator)/operator/templates/template-preview-card";
import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import {
  canonicalTemplatePublishedPreviewPath,
  canonicalTemplateRevisionPreviewPath,
} from "@/lib/canonical-templates/preview-brand";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { listActiveCanonicalSamples } from "@/lib/canonical-templates/sample-slot";
import { loadDesignatedDemoAdoption } from "@/lib/demo-adoption/load-designated-demo-adoption";
import { loadOperatorCanonicalTemplate } from "@/lib/operator/canonical-templates/load-operator-canonical-template";
import { operatorTemplateNotice } from "@/lib/operator/canonical-templates/notices";

export const metadata: Metadata = {
  title: `Template · ${PRODUCT_NAME}`,
};

function sectionCountLabel(count: number): string {
  return `${count} ${count === 1 ? "section" : "sections"}`;
}

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
  const [template, activeSamples, adoption] = await Promise.all([
    loadOperatorCanonicalTemplate(templateId),
    listActiveCanonicalSamples(),
    loadDesignatedDemoAdoption(templateId),
  ]);
  if (!template) {
    notFound();
  }
  const notice = operatorTemplateNotice(query.notice);
  const publicUrl = await designatedDemoPublicUrl(adoption);
  const latestPublished = template.revisions.find(
    (revision) => revision.isLatestPublished
  );
  const canOpenWorkspace =
    template.openDraft !== null || latestPublished !== undefined;
  const canEdit = canOpenWorkspace;
  const previewHref = latestPublished
    ? canonicalTemplatePublishedPreviewPath(template.id)
    : template.openDraft
      ? canonicalTemplateRevisionPreviewPath(template.id, template.openDraft.id)
      : null;

  return (
    <div className="templateOverview" data-template-overview="">
      <header className="templateOverviewHeader">
        <PortalBreadcrumb
          items={[
            { href: "/operator/templates", label: "Templates" },
            { label: template.title },
          ]}
        />
        <div className="templateOverviewIdentity">
          <div className="templateOverviewTitle">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
              Platform
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              {template.title}
            </h1>
            <p className="templateOverviewMeta">
              {template.slug} · {template.serviceCategoryLabel}
            </p>
          </div>
          <div className="templateOverviewBadges">
            <TemplateOriginBadge isSample={template.isSample} />
            <TemplateActivityBadge isActive={template.isActive} />
            {latestPublished ? (
              <span className="staffStatusPill" data-tone="published">
                Published
              </span>
            ) : null}
            {template.openDraft ? <TemplateDraftBadge /> : null}
          </div>
        </div>
        <div className="templateOverviewActions">
          {canOpenWorkspace ? (
            <Link
              href={`/operator/templates/${template.id}/draft`}
              className="staffBtn staffBtnSecondary"
            >
              View content
            </Link>
          ) : null}
          {previewHref ? (
            <Link href={previewHref} className="staffBtn staffBtnSecondary">
              Preview patient guide
            </Link>
          ) : null}
          {canEdit ? (
            <TemplateEditAction
              templateId={template.id}
              hasOpenDraft={template.openDraft !== null}
            />
          ) : null}
          <DuplicateTemplateAction
            sourceTemplateId={template.id}
            sourceTitle={template.title}
            serviceCategory={template.serviceCategory}
            serviceCategoryLabel={template.serviceCategoryLabel}
            published={latestPublished !== undefined}
            activeSamples={activeSamples}
          />
        </div>
      </header>
      {notice ? (
        <p className="text-sm text-staff-muted" role="status">
          {notice}
        </p>
      ) : null}
      {template.isSample ? (
        <p className="rounded-xl border border-staff-line bg-staff-panel px-4 py-3 text-sm">
          Sample templates use the same editing and publishing workflow as
          production templates. They stay out of the production library. Each
          service category has one active sample.
          {template.clinicGuideCount > 0
            ? ` ${template.clinicGuideCount} clinic ${
                template.clinicGuideCount === 1 ? "guide uses" : "guides use"
              } this template. Deactivating it stops new adoption and leaves those guides and published revisions in place.`
            : ""}
        </p>
      ) : null}
      <div className="templateOverviewGrid">
        <div className="templateOverviewMain">
          <TemplatePreviewCard
            templateId={template.id}
            published={latestPublished !== undefined}
            draftId={template.openDraft?.id ?? null}
          />
          <section
            className="templateOverviewCard"
            aria-labelledby="revision-history-heading"
          >
            <h2 id="revision-history-heading">Revision history</h2>
            {template.revisions.length === 0 ? (
              <p className="mt-3 text-sm text-staff-muted">No revisions yet.</p>
            ) : (
              <ol className="templateRevisionList mt-4">
                {template.revisions.map((revision) => (
                  <li
                    key={revision.id}
                    className="templateRevision"
                    data-revision-id={revision.id}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">
                        Revision {revision.version}
                      </h3>
                      <span
                        className="staffStatusPill"
                        data-tone={
                          revision.status === "PUBLISHED"
                            ? "published"
                            : "draft"
                        }
                      >
                        {revision.status === "PUBLISHED"
                          ? "Published"
                          : "Draft"}
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
                        <dd>{sectionCountLabel(revision.sectionCount)}</dd>
                      </div>
                      {revision.publishedAtLabel ? (
                        <div>
                          <dt className="font-medium text-staff-ink">
                            Published
                          </dt>
                          <dd>
                            {revision.publishedAtLabel}
                            {revision.publisherLabel
                              ? ` · ${revision.publisherLabel}`
                              : ""}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                    <div className="templateOverviewActions mt-3">
                      <Link
                        href={canonicalTemplateRevisionPreviewPath(
                          template.id,
                          revision.id
                        )}
                        className="staffBtn staffBtnSecondary"
                      >
                        Preview revision
                      </Link>
                      {revision.status === "DRAFT" ? (
                        <Link
                          href={`/operator/templates/${template.id}/draft`}
                          className="staffBtn staffBtnSecondary"
                        >
                          Edit
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
        <div className="templateOverviewSide">
          <section
            className="templateOverviewCard"
            aria-labelledby="template-status-heading"
          >
            <h2 id="template-status-heading">Status</h2>
            <dl className="mt-3 grid gap-3 text-sm">
              <div>
                <dt className="font-medium">Availability</dt>
                <dd className="mt-1 text-staff-muted">
                  {template.isActive ? "Active" : "Inactive"}
                  {!template.isActive && template.deactivatedAtLabel
                    ? ` since ${template.deactivatedAtLabel}`
                    : ""}
                  {!template.isActive && template.deactivatedByLabel
                    ? ` · Deactivated by ${template.deactivatedByLabel}`
                    : ""}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Latest published</dt>
                <dd className="mt-1 text-staff-muted">
                  {latestPublished ? "Published" : "None"}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Open draft</dt>
                <dd className="mt-1 text-staff-muted">
                  {template.openDraft ? "Draft" : "None"}
                </dd>
              </div>
            </dl>
            {!template.isActive ? (
              <p className="mt-3 text-sm text-staff-muted">
                New clinic adoption is stopped. Existing clinic guides and
                patient pages are unchanged.
              </p>
            ) : null}
          </section>
          {adoption ? (
            <TemplateDemoAdoption
              templateId={template.id}
              adoption={adoption}
              publicUrl={publicUrl}
            />
          ) : null}
          <section
            className="templateOverviewCard"
            aria-labelledby="template-lifecycle-heading"
          >
            <h2 id="template-lifecycle-heading">Lifecycle</h2>
            <p className="mt-2 text-sm text-staff-muted">
              Deactivate stops new clinic adoption. Published revisions stay
              immutable.
              {template.isSample
                ? " Deactivating a sample frees its service category for a replacement. An older sample is not reactivated automatically."
                : ""}
            </p>
            <div className="mt-4">
              <TemplateLifecycleActions
                templateId={template.id}
                draftId={template.openDraft?.id ?? null}
                neverPublished={template.latestPublishedVersion === null}
                isActive={template.isActive}
                canCreateRevision={false}
              />
            </div>
          </section>
          <section
            className="templateOverviewCard"
            aria-labelledby="template-details-heading"
          >
            <h2 id="template-details-heading">Template details</h2>
            <div className="mt-4">
              <TemplateMetadataForm
                templateId={template.id}
                title={template.title}
                slug={template.slug}
                serviceCategory={template.serviceCategory}
                isSample={template.isSample}
                metadataLocked={template.metadataLocked}
                activeSamples={activeSamples}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
