export const TABLE_PAGE_SIZES = [10, 25, 50, 100] as const;

export type TablePageSize = (typeof TABLE_PAGE_SIZES)[number];

export const DEFAULT_TABLE_PAGE_SIZE: TablePageSize = 25;

export const TABLE_SEARCH_DEBOUNCE_MS = 300;

export const TABLE_SEARCH_MAX_LENGTH = 200;

export type SortDirection = "asc" | "desc";

export type TableDensity = "comfortable" | "compact";

export interface TableColumnDefinition {
  id: string;
  label: string;
  required: boolean;
  defaultVisible: boolean;
  sortable: boolean;
}

export interface TablePresentationPreferences {
  pageSize: TablePageSize;
  wrapText: boolean;
  density: TableDensity;
  hiddenColumnIds: string[];
}

export function isTablePageSize(value: number): value is TablePageSize {
  return (TABLE_PAGE_SIZES as readonly number[]).includes(value);
}

export function parseTablePageSize(
  value: string | undefined
): TablePageSize | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return isTablePageSize(parsed) ? parsed : null;
}

export function parseRequestedPage(value: string | undefined): number | null {
  if (value === undefined || value === "") {
    return 1;
  }
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    return null;
  }
  return parsed;
}

export function resolveTablePage(
  requested: number | null,
  total: number,
  pageSize: number
): { page: number; totalPages: number; redirect: boolean } {
  const safeSize = pageSize > 0 ? pageSize : DEFAULT_TABLE_PAGE_SIZE;
  const totalPages = total <= 0 ? 0 : Math.ceil(total / safeSize);
  if (requested === null || requested < 1) {
    return { page: 1, totalPages, redirect: true };
  }
  if (totalPages === 0) {
    return { page: 1, totalPages: 0, redirect: requested !== 1 };
  }
  if (requested > totalPages) {
    return { page: totalPages, totalPages, redirect: true };
  }
  return { page: requested, totalPages, redirect: false };
}

export function tableRange(page: number, pageSize: number, total: number) {
  if (total <= 0) {
    return { from: 0, to: 0 };
  }
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return { from, to };
}

export function tableRangeLabel(
  page: number,
  pageSize: number,
  total: number
): string {
  const { from, to } = tableRange(page, pageSize, total);
  return `Showing ${from}–${to} of ${total}`;
}

export type PaginationItem = number | "gap";

/** Numbered pages with end caps and a one-page window around the current page. */
export function paginationItems(
  page: number,
  totalPages: number
): PaginationItem[] {
  if (totalPages <= 0) {
    return [];
  }
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const items: PaginationItem[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) {
    items.push("gap");
  }
  for (let current = start; current <= end; current += 1) {
    items.push(current);
  }
  if (end < totalPages - 1) {
    items.push("gap");
  }
  items.push(totalPages);
  return items;
}

export function defaultTablePreferences(
  columns: readonly TableColumnDefinition[]
): TablePresentationPreferences {
  return {
    pageSize: DEFAULT_TABLE_PAGE_SIZE,
    wrapText: true,
    density: "comfortable",
    hiddenColumnIds: columns
      .filter((column) => !column.required && !column.defaultVisible)
      .map((column) => column.id),
  };
}

export function sanitizeTablePreferences(
  value: unknown,
  columns: readonly TableColumnDefinition[]
): TablePresentationPreferences {
  const defaults = defaultTablePreferences(columns);
  if (!value || typeof value !== "object") {
    return defaults;
  }
  const record = value as Record<string, unknown>;
  const optional = new Set(
    columns.filter((column) => !column.required).map((column) => column.id)
  );
  const hidden = Array.isArray(record.hiddenColumnIds)
    ? [
        ...new Set(
          record.hiddenColumnIds.filter(
            (id): id is string => typeof id === "string" && optional.has(id)
          )
        ),
      ]
    : defaults.hiddenColumnIds;
  const pageSize =
    typeof record.pageSize === "number" || typeof record.pageSize === "string"
      ? parseTablePageSize(String(record.pageSize))
      : null;
  return {
    pageSize: pageSize ?? defaults.pageSize,
    wrapText:
      typeof record.wrapText === "boolean"
        ? record.wrapText
        : defaults.wrapText,
    density:
      record.density === "compact" || record.density === "comfortable"
        ? record.density
        : defaults.density,
    hiddenColumnIds: hidden,
  };
}

export function tablePreferenceStorageKey(tableId: string): string {
  return `river-aftercare:table:${tableId}`;
}

export function readTablePreferences(
  tableId: string,
  columns: readonly TableColumnDefinition[]
): TablePresentationPreferences {
  if (typeof window === "undefined") {
    return defaultTablePreferences(columns);
  }
  try {
    const raw = window.localStorage.getItem(tablePreferenceStorageKey(tableId));
    if (!raw) {
      return defaultTablePreferences(columns);
    }
    return sanitizeTablePreferences(JSON.parse(raw), columns);
  } catch {
    return defaultTablePreferences(columns);
  }
}

export function writeTablePreferences(
  tableId: string,
  columns: readonly TableColumnDefinition[],
  preferences: TablePresentationPreferences
): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      tablePreferenceStorageKey(tableId),
      JSON.stringify(sanitizeTablePreferences(preferences, columns))
    );
  } catch {
    // Private mode and quota failures leave the current view unchanged.
  }
}

export function visibleColumns(
  columns: readonly TableColumnDefinition[],
  preferences: TablePresentationPreferences
): TableColumnDefinition[] {
  const hidden = new Set(preferences.hiddenColumnIds);
  return columns.filter((column) => column.required || !hidden.has(column.id));
}

export function isColumnVisible(
  columnId: string,
  columns: readonly TableColumnDefinition[],
  preferences: TablePresentationPreferences
): boolean {
  return visibleColumns(columns, preferences).some(
    (column) => column.id === columnId
  );
}

export function firstQueryValue(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function normalizeTableSearch(value: string | undefined): string {
  return (value ?? "").trim().slice(0, TABLE_SEARCH_MAX_LENGTH);
}

export function parseSortDirection(
  value: string | undefined
): SortDirection | null {
  if (value === "asc" || value === "desc") {
    return value;
  }
  return null;
}

export function parseTableSort<T extends string>(
  value: string | undefined,
  allowed: readonly T[]
): T | null {
  if (value && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  return null;
}

export function nextSortState(
  columnId: string,
  currentSort: string,
  currentDirection: SortDirection,
  initialDirection: SortDirection = "asc"
): { sort: string; direction: SortDirection } {
  if (currentSort !== columnId) {
    return { sort: columnId, direction: initialDirection };
  }
  return {
    sort: columnId,
    direction: currentDirection === "asc" ? "desc" : "asc",
  };
}

export interface TableHrefState {
  pathname: string;
  q?: string;
  sort?: string;
  direction?: SortDirection;
  page?: number;
  pageSize?: TablePageSize;
  extra?: Record<string, string | undefined>;
  defaults?: {
    sort?: string;
    direction?: SortDirection;
  };
}

export function tableListHref(state: TableHrefState): string {
  const params = new URLSearchParams();
  const extra = state.extra ?? {};
  for (const [key, value] of Object.entries(extra)) {
    if (value) {
      params.set(key, value);
    }
  }
  const q = normalizeTableSearch(state.q);
  if (q) {
    params.set("q", q);
  }
  const defaultSort = state.defaults?.sort;
  const defaultDirection = state.defaults?.direction ?? "asc";
  const sort = state.sort;
  const direction = state.direction ?? defaultDirection;
  const sortIsDefault =
    !sort || (sort === defaultSort && direction === defaultDirection);
  if (sort && !sortIsDefault) {
    params.set("sort", sort);
    params.set("direction", direction);
  }
  if (state.pageSize && state.pageSize !== DEFAULT_TABLE_PAGE_SIZE) {
    params.set("pageSize", String(state.pageSize));
  }
  if (state.page && state.page > 1) {
    params.set("page", String(state.page));
  }
  const query = params.toString();
  return query ? `${state.pathname}?${query}` : state.pathname;
}
