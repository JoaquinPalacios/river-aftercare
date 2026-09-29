import type { Metadata } from "next";
import Link from "next/link";

import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";
import {
  TemplateActivityBadge,
  TemplateDraftBadge,
  TemplateOriginBadge,
} from "@/app/(staff)/(operator)/operator/templates/template-badges";
import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
} from "@/lib/aftercare/service-category";
import {
  filterOperatorTemplates,
  listOperatorCanonicalTemplates,
} from "@/lib/operator/canonical-templates/list-operator-canonical-templates";
import { operatorTemplateNotice } from "@/lib/operator/canonical-templates/notices";

export const metadata: Metadata = {
  title: `Templates · ${PRODUCT_NAME}`,
};

export default async function OperatorTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    activity?: string;
    publication?: string;
    notice?: string;
  }>;
}) {
  await requirePlatformOperator();
  const params = await searchParams;
  const templates = filterOperatorTemplates(
    await listOperatorCanonicalTemplates(),
    {
      serviceCategory: params.category,
      activity: params.activity,
      publication: params.publication,
    }
  );
  const notice = operatorTemplateNotice(params.notice);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <PortalBreadcrumb items={[{ label: "Templates" }]} />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
            Platform
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Templates
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-staff-muted">
            Production canonical templates for eligible clinics. Save keeps a
            draft. Publish releases it. The sample template stays demo-only.
          </p>
        </div>
        <Link
          href="/operator/templates/new"
          className="staffBtn staffBtnPrimary w-full whitespace-nowrap sm:w-auto sm:shrink-0"
        >
          Create template
        </Link>
      </header>
      {notice ? (
        <p className="text-sm text-staff-muted" role="status">
          {notice}
        </p>
      ) : null}
      <form
        method="get"
        className="grid gap-3 sm:grid-cols-3"
        aria-label="Filter templates"
      >
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="category">
            Service category
          </label>
          <select
            id="category"
            name="category"
            defaultValue={params.category ?? ""}
            className="staffSelect"
          >
            <option value="">All categories</option>
            {SERVICE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {SERVICE_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="activity">
            Availability
          </label>
          <select
            id="activity"
            name="activity"
            defaultValue={params.activity ?? ""}
            className="staffSelect"
          >
            <option value="">Active and inactive</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="publication">
            Revision state
          </label>
          <select
            id="publication"
            name="publication"
            defaultValue={params.publication ?? ""}
            className="staffSelect"
          >
            <option value="">Any revision state</option>
            <option value="draft">Has a draft</option>
            <option value="published">Has a published revision</option>
            <option value="unpublished">No published revision</option>
          </select>
        </div>
        <button type="submit" className="staffBtn staffBtnSecondary w-fit">
          Apply filters
        </button>
      </form>
      {templates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-staff-line bg-staff-panel px-5 py-8 text-sm text-staff-muted">
          No canonical templates match this view.
        </p>
      ) : (
        <div className="staffOperatorTableWrap">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">Canonical templates</caption>
            <thead className="border-b border-staff-line text-staff-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Template</th>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Latest published</th>
                <th className="px-4 py-3 font-medium">Draft</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr
                  key={template.id}
                  className="staffOperatorRow border-b border-staff-line last:border-0"
                  data-sample={template.isSample ? "true" : "false"}
                  data-active={template.isActive ? "true" : "false"}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/operator/templates/${template.id}`}
                      className="staffOperatorRowLink"
                    >
                      {template.title}
                    </Link>
                    <p className="text-staff-muted">{template.slug}</p>
                  </td>
                  <td className="px-4 py-3">{template.serviceCategoryLabel}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <TemplateOriginBadge isSample={template.isSample} />
                      <TemplateActivityBadge isActive={template.isActive} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {template.latestPublishedVersion === null ? (
                      <span className="text-staff-muted">None</span>
                    ) : (
                      <span className="staffStatusPill" data-tone="published">
                        v{template.latestPublishedVersion} Published
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {template.draft ? (
                      <TemplateDraftBadge version={template.draft.version} />
                    ) : (
                      <span className="text-staff-muted">None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
