import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";
import { TemplateBulkTable } from "@/app/(staff)/(operator)/operator/templates/template-bulk-table";
import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import {
  operatorTemplateHref,
  queryOperatorCanonicalTemplates,
} from "@/lib/operator/canonical-templates/list-operator-canonical-templates";
import { operatorTemplateNotice } from "@/lib/operator/canonical-templates/notices";
import {
  operatorTemplatesFilterKey,
  operatorTemplatesListHref,
  parseOperatorTemplateTableState,
} from "@/lib/operator/canonical-templates/template-table-state";

export const metadata: Metadata = {
  title: `Templates · ${PRODUCT_NAME}`,
};

export default async function OperatorTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string | string[];
    activity?: string | string[];
    publication?: string | string[];
    q?: string | string[];
    sort?: string | string[];
    direction?: string | string[];
    page?: string | string[];
    pageSize?: string | string[];
    notice?: string | string[];
  }>;
}) {
  await requirePlatformOperator();
  const params = await searchParams;
  const state = parseOperatorTemplateTableState(params);
  const result = await queryOperatorCanonicalTemplates({
    serviceCategory: state.category,
    activity: state.activity,
    publication: state.publication,
    q: state.q,
    sort: state.sort,
    direction: state.direction,
    requestedPage: state.requestedPage,
    pageSize: state.pageSize,
  });
  if (result.redirect) {
    redirect(
      operatorTemplatesListHref({
        ...state,
        page: result.page,
      })
    );
  }
  const notice = operatorTemplateNotice(
    Array.isArray(params.notice) ? params.notice[0] : params.notice
  );

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
      <TemplateBulkTable
        filterKey={operatorTemplatesFilterKey(state, result.page)}
        state={{ ...state, requestedPage: result.page }}
        page={result.page}
        total={result.total}
        templates={result.rows.map((template) => ({
          ...template,
          href: operatorTemplateHref(template),
        }))}
      />
    </div>
  );
}
