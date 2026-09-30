import { isServiceCategory } from "@/lib/aftercare/service-category";
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

export const OPERATOR_TEMPLATES_TABLE_ID = "operator-templates";

export const OPERATOR_TEMPLATE_SORTS = [
  "template",
  "service",
  "status",
] as const;

export type OperatorTemplateSort = (typeof OPERATOR_TEMPLATE_SORTS)[number];

export const OPERATOR_TEMPLATE_DEFAULT_SORT: OperatorTemplateSort = "template";

export const OPERATOR_TEMPLATE_DEFAULT_DIRECTION: SortDirection = "asc";

export interface OperatorTemplateTableState {
  category: string;
  activity: string;
  publication: string;
  q: string;
  sort: OperatorTemplateSort;
  direction: SortDirection;
  pageSize: TablePageSize;
  pageSizeExplicit: boolean;
  requestedPage: number | null;
}

const ACTIVITIES = new Set(["active", "inactive"]);
const PUBLICATIONS = new Set(["draft", "published", "unpublished"]);

export function parseOperatorTemplateTableState(params: {
  category?: string | string[];
  activity?: string | string[];
  publication?: string | string[];
  q?: string | string[];
  sort?: string | string[];
  direction?: string | string[];
  page?: string | string[];
  pageSize?: string | string[];
}): OperatorTemplateTableState {
  const category = firstQueryValue(params.category) ?? "";
  const activity = firstQueryValue(params.activity) ?? "";
  const publication = firstQueryValue(params.publication) ?? "";
  const pageSizeRaw = firstQueryValue(params.pageSize);
  const pageSize = parseTablePageSize(pageSizeRaw);
  const sort = parseTableSort(
    firstQueryValue(params.sort),
    OPERATOR_TEMPLATE_SORTS
  );
  const direction = parseSortDirection(firstQueryValue(params.direction));
  return {
    category: isServiceCategory(category) ? category : "",
    activity: ACTIVITIES.has(activity) ? activity : "",
    publication: PUBLICATIONS.has(publication) ? publication : "",
    q: normalizeTableSearch(firstQueryValue(params.q)),
    sort: sort ?? OPERATOR_TEMPLATE_DEFAULT_SORT,
    direction:
      sort && direction ? direction : OPERATOR_TEMPLATE_DEFAULT_DIRECTION,
    pageSize: pageSize ?? DEFAULT_TABLE_PAGE_SIZE,
    pageSizeExplicit: pageSize !== null,
    requestedPage: parseRequestedPage(firstQueryValue(params.page)),
  };
}

export function operatorTemplatesListHref(
  state: Partial<OperatorTemplateTableState> & { page?: number }
): string {
  return tableListHref({
    pathname: "/operator/templates",
    q: state.q,
    sort: state.sort,
    direction: state.direction,
    page: state.page,
    pageSize: state.pageSize,
    defaults: {
      sort: OPERATOR_TEMPLATE_DEFAULT_SORT,
      direction: OPERATOR_TEMPLATE_DEFAULT_DIRECTION,
    },
    extra: {
      category: state.category,
      activity: state.activity,
      publication: state.publication,
    },
  });
}

export function operatorTemplateSortHref(
  state: OperatorTemplateTableState,
  columnId: OperatorTemplateSort
): string {
  const next = nextSortState(columnId, state.sort, state.direction, "asc");
  return operatorTemplatesListHref({
    ...state,
    sort: next.sort as OperatorTemplateSort,
    direction: next.direction,
    page: 1,
  });
}

export function operatorTemplatesFilterKey(
  state: OperatorTemplateTableState,
  page: number
): string {
  return [
    state.category,
    state.activity,
    state.publication,
    state.q,
    state.sort,
    state.direction,
    state.pageSize,
    page,
  ].join("|");
}
