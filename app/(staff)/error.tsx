"use client";

import Link from "next/link";

import { ErrorRetryButton } from "@/app/components/error-retry-button";
import { StaffStatusPage } from "@/app/(staff)/components/staff-status-page";
import {
  BACK_DASHBOARD_LABEL,
  STAFF_ERROR_BODY,
  STAFF_ERROR_TITLE,
} from "@/lib/errors/copy";
import {
  errorRecoveryAction,
  type AppRouterErrorProps,
} from "@/lib/errors/app-router-error";
import { ClientErrorReporter } from "@/lib/observability/client-error-reporter";

export default function StaffError(props: AppRouterErrorProps) {
  const recover = errorRecoveryAction(props);

  return (
    <>
      <ClientErrorReporter error={props.error} />
      <StaffStatusPage
        title={STAFF_ERROR_TITLE}
        description={STAFF_ERROR_BODY}
        actions={
          <>
            {recover ? (
              <ErrorRetryButton
                onRetry={recover}
                className="staffBtn staffBtnPrimary"
              />
            ) : null}
            <Link href="/dashboard" className="staffBtn staffBtnSecondary">
              {BACK_DASHBOARD_LABEL}
            </Link>
          </>
        }
      />
    </>
  );
}
