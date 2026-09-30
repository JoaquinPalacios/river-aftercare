import {
  DEFAULT_TABLE_PAGE_SIZE,
  firstQueryValue,
  nextSortState,
  normalizeTableSearch,
  parseRequestedPage,
  parseSortDirection,
  parseTablePageSize,
  parseTableSort,
  tableListHref,
  type SortDirection,
  type TablePageSize,
} from "@/lib/staff/table-controls";

export const CLINIC_GUIDES_TABLE_ID = "clinic-guides";

export const CLINIC_GUIDE_SORTS = ["guide", "status", "updated"] as const;

export type ClinicGuideSort = (typeof CLINIC_GUIDE_SORTS)[number];

export const CLINIC_GUIDE_DEFAULT_SORT: ClinicGuideSort = "guide";

export const CLINIC_GUIDE_DEFAULT_DIRECTION: SortDirection = "asc";

export interface ClinicGuideTableState {
  q: string;
  sort: ClinicGuideSort;
  direction: SortDirection;
  pageSize: TablePageSize;
  pageSizeExplicit: boolean;
  requestedPage: number | null;
}

export function parseClinicGuideTableState(params: {
  q?: string | string[];
  sort?: string | string[];
  direction?: string | string[];
  page?: string | string[];
  pageSize?: string | string[];
}): ClinicGuideTableState {
  const pageSizeRaw = firstQueryValue(params.pageSize);
  const pageSize = parseTablePageSize(pageSizeRaw);
  const sort = parseTableSort(firstQueryValue(params.sort), CLINIC_GUIDE_SORTS);
  const direction = parseSortDirection(firstQueryValue(params.direction));
  return {
    q: normalizeTableSearch(firstQueryValue(params.q)),
    sort: sort ?? CLINIC_GUIDE_DEFAULT_SORT,
    direction: sort && direction ? direction : CLINIC_GUIDE_DEFAULT_DIRECTION,
    pageSize: pageSize ?? DEFAULT_TABLE_PAGE_SIZE,
    pageSizeExplicit: pageSize !== null,
    requestedPage: parseRequestedPage(firstQueryValue(params.page)),
  };
}

export function clinicGuidesListHref(
  state: Partial<ClinicGuideTableState> & { page?: number }
): string {
  return tableListHref({
    pathname: "/guides",
    q: state.q,
    sort: state.sort,
    direction: state.direction,
    page: state.page,
    pageSize: state.pageSize,
    defaults: {
      sort: CLINIC_GUIDE_DEFAULT_SORT,
      direction: CLINIC_GUIDE_DEFAULT_DIRECTION,
    },
  });
}

export function clinicGuideSortHref(
  state: ClinicGuideTableState,
  columnId: ClinicGuideSort
): string {
  const next = nextSortState(
    columnId,
    state.sort,
    state.direction,
    columnId === "updated" ? "desc" : "asc"
  );
  return clinicGuidesListHref({
    ...state,
    sort: next.sort as ClinicGuideSort,
    direction: next.direction,
    page: 1,
  });
}
