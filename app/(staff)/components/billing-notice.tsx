import Link from "next/link";

import type { OverviewBillingNotice } from "@/lib/billing/notices/types";

export function BillingNotice({ notice }: { notice: OverviewBillingNotice }) {
  const severity =
    notice.severity ?? (notice.id === "payment_issue" ? "past_due" : undefined);
  const pastDue = severity === "past_due";
  const unpaid = severity === "unpaid";
  const actionRequired = pastDue || unpaid;
  const headingId = `billing-notice-${notice.id}`;
  return (
    <section
      className={
        pastDue
          ? "min-w-0 rounded-xl border border-staff-warning-line border-l-4 bg-staff-warning-surface px-4 py-3 text-staff-warning-text shadow-sm sm:px-5"
          : unpaid
            ? "min-w-0 rounded-xl border border-staff-line border-l-4 border-l-staff-danger bg-staff-panel px-4 py-3 shadow-sm sm:px-5"
            : "min-w-0 rounded-xl border border-staff-line bg-staff-panel px-4 py-3 shadow-sm sm:px-5"
      }
      data-notice={notice.id}
      data-severity={severity ?? "information"}
      role={actionRequired ? "region" : "status"}
      aria-labelledby={actionRequired ? headingId : undefined}
    >
      {actionRequired ? (
        <h2
          id={headingId}
          className={
            pastDue
              ? "text-sm font-medium leading-6 text-staff-warning-text"
              : "text-sm font-medium leading-6 text-staff-ink"
          }
        >
          {notice.title}
        </h2>
      ) : (
        <p className="text-sm font-medium leading-6 text-staff-ink">
          {notice.title}
        </p>
      )}
      <p
        className={
          pastDue
            ? "mt-1 text-sm leading-6 text-staff-warning-text"
            : "mt-1 text-sm leading-6 text-staff-muted"
        }
      >
        {notice.body}
      </p>
      <Link
        href={notice.actionHref}
        className="mt-2 inline-flex text-sm font-medium text-staff-brand underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff-brand"
      >
        {notice.actionLabel}
      </Link>
    </section>
  );
}
