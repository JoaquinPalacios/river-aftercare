"use client";

import { MarketingErrorRetry } from "@/app/(marketing)/components/marketing-error-retry";
import {
  MarketingStatusLink,
  MarketingStatusPage,
} from "@/app/(marketing)/components/marketing-status-page";
import {
  BACK_HOME_LABEL,
  MARKETING_ERROR_BODY,
  MARKETING_ERROR_TITLE,
} from "@/lib/errors/copy";
import {
  errorRecoveryAction,
  type AppRouterErrorProps,
} from "@/lib/errors/app-router-error";

export default function MarketingError(props: AppRouterErrorProps) {
  const recover = errorRecoveryAction(props);

  return (
    <MarketingStatusPage
      title={MARKETING_ERROR_TITLE}
      description={MARKETING_ERROR_BODY}
      actions={
        <>
          {recover ? <MarketingErrorRetry onRetry={recover} /> : null}
          <MarketingStatusLink href="/">{BACK_HOME_LABEL}</MarketingStatusLink>
        </>
      }
    />
  );
}
