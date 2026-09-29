import type { Metadata } from "next";
import Link from "next/link";

import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";
import { TemplateBulkTable } from "@/app/(staff)/(operator)/operator/templates/template-bulk-table";
import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
} from "@/lib/aftercare/service-category";
import {
  filterOperatorTemplates,
  listOperatorCanonicalTemplates,
  operatorTemplateHref,
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
  const filterKey = [
    params.category ?? "",
    params.activity ?? "",
    params.publication ?? "",
  ].join("|");

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
        <TemplateBulkTable
          filterKey={filterKey}
          templates={templates.map((template) => ({
            ...template,
            href: operatorTemplateHref(template),
          }))}
        />
      )}
    </div>
  );
}
