"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import { ExternalLinkIcon } from "@/app/(staff)/components/icons";
import { TablePagination } from "@/app/(staff)/components/table-controls/table-pagination";
import { TableSearch } from "@/app/(staff)/components/table-controls/table-search";
import { TableSettings } from "@/app/(staff)/components/table-controls/table-settings";
import {
  SortableColumnHeader,
  StaticColumnHeader,
} from "@/app/(staff)/components/table-controls/sortable-column-header";
import { useTablePresentation } from "@/app/(staff)/components/table-controls/use-table-presentation";
import {
  TemplateActivityBadge,
  TemplateDraftBadge,
  TemplateOriginBadge,
} from "@/app/(staff)/(operator)/operator/templates/template-badges";
import {
  applyCanonicalTemplateBulkAction,
  type CanonicalTemplateActionState,
} from "@/app/(staff)/(operator)/operator/templates/actions";
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
} from "@/lib/aftercare/service-category";
import { canonicalTemplatePublishedPreviewPath } from "@/lib/canonical-templates/preview-brand";
import {
  bulkTemplateActionAvailability,
  type BulkTemplateAction,
} from "@/lib/operator/canonical-templates/bulk-template-eligibility";
import {
  OPERATOR_TEMPLATE_COLUMNS,
  OPERATOR_TEMPLATE_LOCKED_COLUMNS,
} from "@/lib/operator/canonical-templates/template-table-columns";
import {
  OPERATOR_TEMPLATES_TABLE_ID,
  operatorTemplatesFilterKey,
  operatorTemplatesListHref,
  operatorTemplateSortHref,
  type OperatorTemplateTableState,
} from "@/lib/operator/canonical-templates/template-table-state";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  isColumnVisible,
  readTablePreferences,
  TABLE_SEARCH_DEBOUNCE_MS,
  type TablePageSize,
} from "@/lib/staff/table-controls";

export interface TemplateBulkTableRow {
  id: string;
  title: string;
  slug: string;
  href: string;
  serviceCategory: string;
  serviceCategoryLabel: string;
  isActive: boolean;
  isSample: boolean;
  latestPublishedVersion: number | null;
  draft: { id: string; version: number } | null;
}

/** Latest published patient preview. An open draft does not change the target. */
export function templateTablePreviewHref(template: {
  id: string;
  latestPublishedVersion: number | null;
}): string | null {
  if (template.latestPublishedVersion === null) {
    return null;
  }
  return canonicalTemplatePublishedPreviewPath(template.id);
}

const BULK_ACTIONS: readonly BulkTemplateAction[] = [
  "publish",
  "deactivate",
  "reactivate",
  "delete",
];

const initial: CanonicalTemplateActionState = {};

const defaultState: OperatorTemplateTableState = {
  category: "",
  activity: "",
  publication: "",
  q: "",
  sort: "template",
  direction: "asc",
  pageSize: DEFAULT_TABLE_PAGE_SIZE,
  pageSizeExplicit: true,
  requestedPage: 1,
};

interface TemplateFilterDraft {
  category: string;
  activity: string;
  publication: string;
}

function templateFilterDraft(
  state: Pick<
    OperatorTemplateTableState,
    "category" | "activity" | "publication"
  >
): TemplateFilterDraft {
  return {
    category: state.category,
    activity: state.activity,
    publication: state.publication,
  };
}

function templateFiltersAreDefault(filters: TemplateFilterDraft): boolean {
  return !filters.category && !filters.activity && !filters.publication;
}

export function TemplateBulkTable({
  templates,
  filterKey,
  state = defaultState,
  page = 1,
  total = templates.length,
}: {
  templates: readonly TemplateBulkTableRow[];
  filterKey?: string;
  state?: OperatorTemplateTableState;
  page?: number;
  total?: number;
}) {
  const router = useRouter();
  const { preferences, update, reset } = useTablePresentation(
    OPERATOR_TEMPLATES_TABLE_ID,
    OPERATOR_TEMPLATE_COLUMNS
  );
  const [draftQuery, setDraftQuery] = useState(state.q);
  const appliedFilters = templateFilterDraft(state);
  const appliedFilterKey = `${appliedFilters.category}|${appliedFilters.activity}|${appliedFilters.publication}`;
  const [pendingFilterKey, setPendingFilterKey] = useState(appliedFilterKey);
  const [pendingFilters, setPendingFilters] = useState(appliedFilters);
  if (pendingFilterKey !== appliedFilterKey) {
    setPendingFilterKey(appliedFilterKey);
    setPendingFilters(appliedFilters);
  }
  const displayedFilters =
    pendingFilterKey === appliedFilterKey ? pendingFilters : appliedFilters;
  const showClearFilters =
    !templateFiltersAreDefault(appliedFilters) ||
    !templateFiltersAreDefault(displayedFilters);
  const [bulkState, formAction, pending] = useActionState(
    applyCanonicalTemplateBulkAction,
    initial
  );
  const resolvedFilterKey =
    filterKey ?? operatorTemplatesFilterKey(state, page);
  const [seenFilter, setSeenFilter] = useState(resolvedFilterKey);
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [confirming, setConfirming] = useState<BulkTemplateAction | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const handled = useRef(bulkState);
  const reasonIds = {
    publish: useId(),
    deactivate: useId(),
    reactivate: useId(),
    delete: useId(),
  };

  if (seenFilter !== resolvedFilterKey) {
    setSeenFilter(resolvedFilterKey);
    setSelected(new Set());
  }

  useEffect(() => {
    setDraftQuery(state.q);
  }, [state.q]);

  useEffect(() => {
    const trimmed = draftQuery.trim();
    if (trimmed === state.q) {
      return;
    }
    const timer = window.setTimeout(() => {
      router.push(
        operatorTemplatesListHref({
          ...state,
          q: trimmed,
          page: 1,
        })
      );
    }, TABLE_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draftQuery, router, state]);

  useEffect(() => {
    if (state.pageSizeExplicit) {
      return;
    }
    const stored = readTablePreferences(
      OPERATOR_TEMPLATES_TABLE_ID,
      OPERATOR_TEMPLATE_COLUMNS
    );
    if (stored.pageSize === state.pageSize) {
      return;
    }
    router.replace(
      operatorTemplatesListHref({
        ...state,
        pageSize: stored.pageSize,
        page: 1,
      })
    );
  }, [router, state]);

  const selectedTemplates = templates.filter((template) =>
    selected.has(template.id)
  );
  const availability = bulkTemplateActionAvailability(selectedTemplates);
  const allSelected =
    templates.length > 0 && selectedTemplates.length === templates.length;
  const partiallySelected = selectedTemplates.length > 0 && !allSelected;
  const filtered = Boolean(
    state.q || state.category || state.activity || state.publication
  );
  const show = (columnId: string) =>
    isColumnVisible(columnId, OPERATOR_TEMPLATE_COLUMNS, preferences);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = partiallySelected;
    }
  }, [partiallySelected]);

  useEffect(() => {
    if (handled.current === bulkState) {
      return;
    }
    handled.current = bulkState;
    if (bulkState.ok) {
      setSelected(new Set());
    }
    if (bulkState.ok || bulkState.error) {
      setConfirming(null);
    }
  }, [bulkState]);

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleVisible() {
    setSelected(
      allSelected
        ? new Set()
        : new Set(templates.map((template) => template.id))
    );
  }

  function submit(action: BulkTemplateAction) {
    const form = document.getElementById(
      `bulk-${action}-form`
    ) as HTMLFormElement | null;
    form?.requestSubmit();
  }

  function navigate(
    next: Partial<OperatorTemplateTableState> & { page?: number }
  ) {
    router.push(
      operatorTemplatesListHref({
        ...state,
        ...next,
      })
    );
  }

  function clearFilters() {
    setPendingFilters({ category: "", activity: "", publication: "" });
    setSelected(new Set());
    navigate({
      category: "",
      activity: "",
      publication: "",
      page: 1,
    });
  }

  const publishPayload = selectedTemplates.map((template) => ({
    templateId: template.id,
    revisionId: template.draft?.id ?? "",
    expectedVersion: template.draft?.version ?? null,
  }));
  const idPayload = selectedTemplates.map((template) => ({
    templateId: template.id,
  }));
  const countLabel =
    selectedTemplates.length === 1
      ? "1 template selected"
      : `${selectedTemplates.length} templates selected`;

  return (
    <div className="flex flex-col gap-4">
      <form
        className="staffTableFilters"
        aria-label="Filter templates"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          navigate({
            category: String(data.get("category") ?? ""),
            activity: String(data.get("activity") ?? ""),
            publication: String(data.get("publication") ?? ""),
            q: draftQuery.trim(),
            page: 1,
          });
        }}
      >
        <div className="staffTableFilterFields">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="category">
              Service category
            </label>
            <select
              id="category"
              name="category"
              value={displayedFilters.category}
              className="staffSelect"
              onChange={(event) =>
                setPendingFilters((current) => ({
                  ...current,
                  category: event.target.value,
                }))
              }
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
              value={displayedFilters.activity}
              className="staffSelect"
              onChange={(event) =>
                setPendingFilters((current) => ({
                  ...current,
                  activity: event.target.value,
                }))
              }
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
              value={displayedFilters.publication}
              className="staffSelect"
              onChange={(event) =>
                setPendingFilters((current) => ({
                  ...current,
                  publication: event.target.value,
                }))
              }
            >
              <option value="">Any revision state</option>
              <option value="draft">Has a draft</option>
              <option value="published">Has a published revision</option>
              <option value="unpublished">No published revision</option>
            </select>
          </div>
        </div>
        <div className="staffTableFilterActions">
          {showClearFilters ? (
            <button
              type="button"
              className="staffBtn staffBtnQuiet"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          ) : null}
          <button type="submit" className="staffBtn staffBtnSecondary">
            Apply filters
          </button>
        </div>
      </form>
      <div className="staffTableToolbar">
        <TableSearch
          label="Search templates"
          placeholder="Search templates…"
          value={draftQuery}
          onValueChange={setDraftQuery}
          onClear={() => {
            setDraftQuery("");
            navigate({ q: "", page: 1 });
          }}
        />
        <TableSettings
          columns={OPERATOR_TEMPLATE_COLUMNS}
          preferences={preferences}
          pageSize={state.pageSize}
          lockedColumnMessage={OPERATOR_TEMPLATE_LOCKED_COLUMNS}
          onPageSizeChange={(pageSize: TablePageSize) => {
            update({ pageSize });
            navigate({ pageSize, page: 1 });
          }}
          onWrapTextChange={(wrapText) => update({ wrapText })}
          onDensityChange={(density) => update({ density })}
          onColumnVisibilityChange={(columnId, visible) => {
            const hidden = new Set(preferences.hiddenColumnIds);
            if (visible) {
              hidden.delete(columnId);
            } else {
              hidden.add(columnId);
            }
            update({ hiddenColumnIds: [...hidden] });
          }}
          onReset={() => {
            reset();
            navigate({ pageSize: DEFAULT_TABLE_PAGE_SIZE, page: 1 });
          }}
        />
      </div>
      {bulkState.message ? (
        <p className="text-sm text-staff-muted" role="status">
          {bulkState.message}
        </p>
      ) : null}
      {bulkState.error ? (
        <p className="text-sm text-red-600" role="alert">
          {bulkState.error}
        </p>
      ) : null}
      {selectedTemplates.length > 0 ? (
        <div className="staffBulkBar" role="region" aria-label="Bulk actions">
          <p className="text-sm font-medium">{countLabel}</p>
          <div className="staffBulkBarActions">
            {BULK_ACTIONS.map((action) => {
              const item = availability[action];
              return (
                <button
                  key={action}
                  type="button"
                  className={`staffBtn ${
                    action === "delete" ? "staffBtnDanger" : "staffBtnSecondary"
                  }`}
                  disabled={!item.enabled || pending}
                  aria-describedby={item.reason ? reasonIds[action] : undefined}
                  title={item.reason ?? undefined}
                  onClick={() => setConfirming(action)}
                >
                  {actionLabel(action)}
                </button>
              );
            })}
          </div>
          <div className="staffBulkBarReasons">
            {BULK_ACTIONS.map((action) => {
              const reason = availability[action].reason;
              if (!reason) {
                return null;
              }
              return (
                <p key={action} id={reasonIds[action]}>
                  {reason}
                </p>
              );
            })}
          </div>
        </div>
      ) : null}
      {templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-staff-line bg-staff-panel px-5 py-8 text-sm text-staff-muted">
          <p className="staffTableEmpty">
            {filtered
              ? "No templates match the current search and filters."
              : "No templates yet."}
          </p>
          {filtered ? (
            <button
              type="button"
              className="staffBtn staffBtnSecondary mt-4"
              onClick={() => {
                setDraftQuery("");
                navigate({
                  category: "",
                  activity: "",
                  publication: "",
                  q: "",
                  page: 1,
                });
              }}
            >
              Clear search and filters
            </button>
          ) : null}
        </div>
      ) : (
        <div className="staffOperatorTableWrap">
          <div className="staffDataTableScroll">
            <table
              className="staffDataTable"
              data-wrap={preferences.wrapText ? "on" : "off"}
              data-density={preferences.density}
            >
              <caption className="sr-only">Canonical templates</caption>
              <thead className="border-b border-staff-line text-staff-muted">
                <tr>
                  <th className="staffTableHead w-12" scope="col">
                    <label className="staffTableSelectHit">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        className="staffOperatorSelect"
                        checked={allSelected}
                        aria-label="Select all rows on this page"
                        onChange={toggleVisible}
                      />
                    </label>
                  </th>
                  {show("template") ? (
                    <SortableColumnHeader
                      label="Template"
                      active={state.sort === "template"}
                      direction={state.direction}
                      href={operatorTemplateSortHref(state, "template")}
                    />
                  ) : null}
                  {show("service") ? (
                    <SortableColumnHeader
                      label="Service"
                      active={state.sort === "service"}
                      direction={state.direction}
                      href={operatorTemplateSortHref(state, "service")}
                    />
                  ) : null}
                  {show("status") ? (
                    <SortableColumnHeader
                      label="Status"
                      active={state.sort === "status"}
                      direction={state.direction}
                      href={operatorTemplateSortHref(state, "status")}
                    />
                  ) : null}
                  {show("published") ? (
                    <StaticColumnHeader label="Latest published" />
                  ) : null}
                  {show("draft") ? <StaticColumnHeader label="Draft" /> : null}
                  {show("preview") ? (
                    <StaticColumnHeader
                      label="Preview"
                      className="staffTemplatePreviewCol"
                    />
                  ) : null}
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
                    <td>
                      <label className="staffTableSelectHit">
                        <input
                          type="checkbox"
                          className="staffOperatorSelect"
                          checked={selected.has(template.id)}
                          aria-label={`Select ${template.title}`}
                          onChange={() => toggleOne(template.id)}
                        />
                      </label>
                    </td>
                    {show("template") ? (
                      <td>
                        <Link
                          href={template.href}
                          className="staffOperatorRowLink staffTableText"
                          title={template.title}
                        >
                          {template.title}
                        </Link>
                        <p
                          className="staffTableText text-staff-muted"
                          data-lines="1"
                          title={template.slug}
                        >
                          {template.slug}
                        </p>
                      </td>
                    ) : null}
                    {show("service") ? (
                      <td>
                        <span
                          className="staffTableText"
                          title={template.serviceCategoryLabel}
                        >
                          {template.serviceCategoryLabel}
                        </span>
                      </td>
                    ) : null}
                    {show("status") ? (
                      <td>
                        <div className="staffStatusPills">
                          <TemplateOriginBadge isSample={template.isSample} />
                          <TemplateActivityBadge isActive={template.isActive} />
                        </div>
                      </td>
                    ) : null}
                    {show("published") ? (
                      <td>
                        {template.latestPublishedVersion === null ? (
                          <span className="text-staff-muted">None</span>
                        ) : (
                          <span
                            className="staffStatusPill"
                            data-tone="published"
                          >
                            Published
                          </span>
                        )}
                      </td>
                    ) : null}
                    {show("draft") ? (
                      <td>
                        {template.draft ? (
                          <TemplateDraftBadge />
                        ) : (
                          <span className="text-staff-muted">None</span>
                        )}
                      </td>
                    ) : null}
                    {show("preview") ? (
                      <td
                        className="staffTemplatePreviewCol"
                        onClick={(event) => event.stopPropagation()}
                        onAuxClick={(event) => event.stopPropagation()}
                      >
                        <TemplateTablePreview template={template} />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <TablePagination
        page={page}
        pageSize={state.pageSize}
        total={total}
        hrefForPage={(nextPage) =>
          operatorTemplatesListHref({ ...state, page: nextPage })
        }
      />
      <BulkForm
        id="bulk-publish-form"
        action={formAction}
        operation="publish"
        payload={publishPayload}
      />
      <BulkForm
        id="bulk-deactivate-form"
        action={formAction}
        operation="deactivate"
        payload={idPayload}
      />
      <BulkForm
        id="bulk-reactivate-form"
        action={formAction}
        operation="reactivate"
        payload={idPayload}
      />
      <BulkForm
        id="bulk-delete-form"
        action={formAction}
        operation="delete"
        payload={idPayload}
      />
      <ConfirmDialog
        open={confirming !== null}
        title={
          confirming ? confirmTitle(confirming, selectedTemplates.length) : ""
        }
        description={confirming ? confirmDescription(confirming) : ""}
        cancelLabel="Cancel"
        confirmLabel={confirming ? actionLabel(confirming) : "Confirm"}
        confirmTone={
          confirming === "deactivate" || confirming === "delete"
            ? "danger"
            : "primary"
        }
        pending={pending}
        pendingLabel={confirming ? pendingLabel(confirming) : undefined}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) {
            submit(confirming);
          }
        }}
      >
        <ul className="staffBulkNames">
          {selectedTemplates.map((template) => (
            <li key={template.id}>{template.title}</li>
          ))}
        </ul>
      </ConfirmDialog>
    </div>
  );
}

function TemplateTablePreview({
  template,
}: {
  template: TemplateBulkTableRow;
}) {
  const href = templateTablePreviewHref(template);
  if (!href) {
    return (
      <span className="text-staff-muted">
        <span aria-hidden="true">—</span>
        <span className="sr-only">
          Preview unavailable for {template.title}
        </span>
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="staffBtn staffBtnSecondary staffTemplatePreviewLink"
      aria-label={`Preview ${template.title} in a new tab`}
    >
      <span className="staffTemplatePreviewLabel">Preview</span>
      <ExternalLinkIcon />
    </a>
  );
}

function BulkForm({
  id,
  action,
  operation,
  payload,
}: {
  id: string;
  action: (formData: FormData) => void;
  operation: BulkTemplateAction;
  payload: readonly object[];
}) {
  return (
    <form id={id} action={action} className="hidden">
      <input type="hidden" name="operation" value={operation} />
      <input type="hidden" name="templates" value={JSON.stringify(payload)} />
    </form>
  );
}

function actionLabel(action: BulkTemplateAction): string {
  if (action === "publish") {
    return "Publish";
  }
  if (action === "deactivate") {
    return "Deactivate";
  }
  if (action === "reactivate") {
    return "Reactivate";
  }
  return "Delete";
}

function confirmTitle(action: BulkTemplateAction, count: number): string {
  const noun = count === 1 ? "template" : "templates";
  return `${actionLabel(action)} ${count} ${noun}?`;
}

function confirmDescription(action: BulkTemplateAction): string {
  if (action === "publish") {
    return "Each selected draft will become an immutable published revision.";
  }
  if (action === "deactivate") {
    return "They stop being offered for new clinic adoption. Existing clinic guides and pins remain unchanged.";
  }
  if (action === "reactivate") {
    return "Eligible clinics can discover the latest published revision again. Existing clinic pins are not changed.";
  }
  return "This permanently removes each never-published template and its unpublished draft.";
}

function pendingLabel(action: BulkTemplateAction): string {
  if (action === "publish") {
    return "Publishing…";
  }
  if (action === "deactivate") {
    return "Deactivating…";
  }
  if (action === "reactivate") {
    return "Reactivating…";
  }
  return "Deleting…";
}
