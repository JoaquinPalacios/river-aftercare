import Link from "next/link";

import type { SortDirection } from "@/lib/staff/table-controls";

export function SortableColumnHeader({
  label,
  active,
  direction,
  href,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  href: string;
}) {
  const ariaSort = active
    ? direction === "asc"
      ? "ascending"
      : "descending"
    : "none";
  return (
    <th className="staffTableHead" scope="col" aria-sort={ariaSort}>
      <Link href={href} className="staffTableSort">
        <span>{label}</span>
        <span className="staffTableSortIcon" aria-hidden="true">
          {active ? (direction === "asc" ? "↑" : "↓") : "↕"}
        </span>
        <span className="sr-only">
          {active
            ? direction === "asc"
              ? ", sorted ascending"
              : ", sorted descending"
            : ", not sorted"}
        </span>
      </Link>
    </th>
  );
}

export function StaticColumnHeader({ label }: { label: string }) {
  return (
    <th className="staffTableHead" scope="col">
      {label}
    </th>
  );
}
