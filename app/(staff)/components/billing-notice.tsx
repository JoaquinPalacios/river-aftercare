import Link from "next/link";

import type { OverviewBillingNotice } from "@/lib/billing/notices/types";

export function BillingNotice({ notice }: { notice: OverviewBillingNotice }) {
  const urgent = notice.id === "payment_issue";
  return (
    <aside
      className={
        urgent
          ? "min-w-0 rounded-xl border border-staff-line border-l-4 border-l-staff-danger bg-staff-panel px-4 py-3 shadow-sm sm:px-5"
          : "min-w-0 rounded-xl border border-staff-line bg-staff-panel px-4 py-3 shadow-sm sm:px-5"
      }
      data-notice={notice.id}
      role="status"
    >
      <p className="text-sm font-medium leading-6 text-staff-ink">
        {notice.title}
      </p>
      <p className="mt-1 text-sm leading-6 text-staff-muted">{notice.body}</p>
      <Link
        href={notice.actionHref}
        className="mt-2 inline-flex text-sm font-medium text-staff-brand underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff-brand"
      >
        {notice.actionLabel}
      </Link>
    </aside>
  );
}
