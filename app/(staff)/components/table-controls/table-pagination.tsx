import Link from "next/link";

import { paginationItems, tableRangeLabel } from "@/lib/staff/table-controls";

export function TablePagination({
  page,
  pageSize,
  total,
  hrefForPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefForPage: (page: number) => string;
}) {
  if (total <= 0) {
    return null;
  }
  const items = paginationItems(page, Math.ceil(total / pageSize));
  const onFirst = page <= 1;
  const onLast = page >= Math.ceil(total / pageSize);

  return (
    <nav className="staffTablePagination" aria-label="Pagination">
      <p className="staffTablePaginationSummary">
        {tableRangeLabel(page, pageSize, total)}
      </p>
      <div className="staffTablePaginationControls">
        {onFirst ? (
          <button type="button" className="staffTablePageButton" disabled>
            <span aria-hidden="true">‹</span> Previous
          </button>
        ) : (
          <Link
            href={hrefForPage(page - 1)}
            className="staffTablePageButton"
            rel="prev"
          >
            <span aria-hidden="true">‹</span> Previous
          </Link>
        )}
        <ol className="staffTablePages">
          {items.map((item, index) =>
            item === "gap" ? (
              <li
                key={`gap-${index}`}
                className="staffTablePageGap"
                aria-hidden="true"
              >
                …
              </li>
            ) : (
              <li key={item}>
                {item === page ? (
                  <span className="staffTablePageButton" aria-current="page">
                    {item}
                  </span>
                ) : (
                  <Link
                    href={hrefForPage(item)}
                    className="staffTablePageButton"
                    aria-label={`Page ${item}`}
                  >
                    {item}
                  </Link>
                )}
              </li>
            )
          )}
        </ol>
        {onLast ? (
          <button type="button" className="staffTablePageButton" disabled>
            Next <span aria-hidden="true">›</span>
          </button>
        ) : (
          <Link
            href={hrefForPage(page + 1)}
            className="staffTablePageButton"
            rel="next"
          >
            Next <span aria-hidden="true">›</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
