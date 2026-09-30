"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { GuideRowActions } from "@/app/(staff)/(clinic-portal)/guides/guide-row-actions";
import { GuideStatusPills } from "@/app/(staff)/components/guide-status-pills";
import { TablePagination } from "@/app/(staff)/components/table-controls/table-pagination";
import { TableSearch } from "@/app/(staff)/components/table-controls/table-search";
import { TableSettings } from "@/app/(staff)/components/table-controls/table-settings";
import {
  SortableColumnHeader,
  StaticColumnHeader,
} from "@/app/(staff)/components/table-controls/sortable-column-header";
import { useTablePresentation } from "@/app/(staff)/components/table-controls/use-table-presentation";
import type {
  ClinicGuideLifecycleStatus,
  GuideDestructiveAction,
} from "@/lib/clinic-portal/guide-status-view";
import {
  CLINIC_GUIDE_COLUMNS,
  CLINIC_GUIDE_LOCKED_COLUMNS,
} from "@/lib/clinic-portal/guide-table-columns";
import {
  CLINIC_GUIDES_TABLE_ID,
  clinicGuidesListHref,
  clinicGuideSortHref,
  type ClinicGuideTableState,
} from "@/lib/clinic-portal/guide-table-state";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  isColumnVisible,
  readTablePreferences,
  TABLE_SEARCH_DEBOUNCE_MS,
  type TablePageSize,
} from "@/lib/staff/table-controls";

export interface ClinicGuideTableRow {
  id: string;
  title: string;
  publicSlug: string;
  sourceLabel: string;
  updatedLabel: string;
  lifecycle: ClinicGuideLifecycleStatus;
  canManage: boolean;
  isPublishedPublic: boolean;
  previewHref: string | null;
  destructiveAction: GuideDestructiveAction | null;
  canUnpublish: boolean;
}

export function ClinicGuidesTable({
  guides,
  state,
  page,
  total,
  suppressEmpty = false,
}: {
  guides: readonly ClinicGuideTableRow[];
  state: ClinicGuideTableState;
  page: number;
  total: number;
  suppressEmpty?: boolean;
}) {
  const router = useRouter();
  const { preferences, update, reset } = useTablePresentation(
    CLINIC_GUIDES_TABLE_ID,
    CLINIC_GUIDE_COLUMNS
  );
  const [draftQuery, setDraftQuery] = useState(state.q);
  const show = (columnId: string) =>
    isColumnVisible(columnId, CLINIC_GUIDE_COLUMNS, preferences);

  useEffect(() => {
    setDraftQuery(state.q);
  }, [state.q]);

  useEffect(() => {
    const trimmed = draftQuery.trim();
    if (trimmed === state.q) {
      return;
    }
    const timer = window.setTimeout(() => {
      router.push(clinicGuidesListHref({ ...state, q: trimmed, page: 1 }));
    }, TABLE_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draftQuery, router, state]);

  useEffect(() => {
    if (state.pageSizeExplicit) {
      return;
    }
    const stored = readTablePreferences(
      CLINIC_GUIDES_TABLE_ID,
      CLINIC_GUIDE_COLUMNS
    );
    if (stored.pageSize === state.pageSize) {
      return;
    }
    router.replace(
      clinicGuidesListHref({
        ...state,
        pageSize: stored.pageSize,
        page: 1,
      })
    );
  }, [router, state]);

  function navigate(next: Partial<ClinicGuideTableState> & { page?: number }) {
    router.push(clinicGuidesListHref({ ...state, ...next }));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="staffTableToolbar">
        <TableSearch
          label="Search guides"
          placeholder="Search guides…"
          value={draftQuery}
          onValueChange={setDraftQuery}
          onClear={() => {
            setDraftQuery("");
            navigate({ q: "", page: 1 });
          }}
        />
        <TableSettings
          columns={CLINIC_GUIDE_COLUMNS}
          preferences={preferences}
          pageSize={state.pageSize}
          lockedColumnMessage={CLINIC_GUIDE_LOCKED_COLUMNS}
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
      {guides.length === 0 &&
      suppressEmpty &&
      !state.q ? null : guides.length === 0 ? (
        <div className="rounded-xl border border-dashed border-staff-line bg-staff-panel px-5 py-8 text-sm leading-6 text-staff-muted">
          <p className="staffTableEmpty">
            {state.q
              ? "No guides match the current search."
              : "No guides have been configured for this practice yet."}
          </p>
          {state.q ? (
            <button
              type="button"
              className="staffBtn staffBtnSecondary mt-4"
              onClick={() => {
                setDraftQuery("");
                navigate({ q: "", page: 1 });
              }}
            >
              Clear search
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
              <caption className="sr-only">Practice guides</caption>
              <thead className="border-b border-staff-line text-staff-muted">
                <tr>
                  {show("guide") ? (
                    <SortableColumnHeader
                      label="Guide"
                      active={state.sort === "guide"}
                      direction={state.direction}
                      href={clinicGuideSortHref(state, "guide")}
                    />
                  ) : null}
                  {show("status") ? (
                    <SortableColumnHeader
                      label="Status"
                      active={state.sort === "status"}
                      direction={state.direction}
                      href={clinicGuideSortHref(state, "status")}
                    />
                  ) : null}
                  {show("source") ? (
                    <StaticColumnHeader label="Source" />
                  ) : null}
                  {show("updated") ? (
                    <SortableColumnHeader
                      label="Updated"
                      active={state.sort === "updated"}
                      direction={state.direction}
                      href={clinicGuideSortHref(state, "updated")}
                    />
                  ) : null}
                  <StaticColumnHeader label="Actions" />
                </tr>
              </thead>
              <tbody>
                {guides.map((guide) => (
                  <tr
                    key={guide.id}
                    className="border-b border-staff-line last:border-0"
                    data-guide-row="true"
                  >
                    {show("guide") ? (
                      <td>
                        <p
                          className="staffTableText font-medium"
                          title={guide.title}
                        >
                          {guide.title}
                        </p>
                        <p
                          className="staffTableText text-staff-muted"
                          data-lines="1"
                          title={`/${guide.publicSlug}`}
                        >
                          /{guide.publicSlug}
                        </p>
                      </td>
                    ) : null}
                    {show("status") ? (
                      <td>
                        <GuideStatusPills lifecycle={guide.lifecycle} />
                      </td>
                    ) : null}
                    {show("source") ? (
                      <td>
                        <span
                          className="staffTableText"
                          title={guide.sourceLabel}
                        >
                          {guide.sourceLabel}
                        </span>
                      </td>
                    ) : null}
                    {show("updated") ? (
                      <td className="text-staff-muted">{guide.updatedLabel}</td>
                    ) : null}
                    <td>
                      <GuideRowActions
                        guideId={guide.id}
                        canManage={guide.canManage}
                        isPublishedPublic={guide.isPublishedPublic}
                        previewHref={guide.previewHref}
                        destructiveAction={guide.destructiveAction}
                        canUnpublish={guide.canUnpublish}
                        lifecycle={guide.lifecycle}
                      />
                    </td>
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
          clinicGuidesListHref({ ...state, page: nextPage })
        }
      />
    </div>
  );
}
