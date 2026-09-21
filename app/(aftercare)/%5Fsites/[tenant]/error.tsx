"use client";

import { ErrorRetryButton } from "@/app/components/error-retry-button";
import { PatientStatusPage } from "@/app/(aftercare)/components/patient-status-page";
import {
  CLINIC_GUIDES_HOME_LABEL,
  PATIENT_ERROR_BODY,
  PATIENT_ERROR_TITLE,
} from "@/lib/errors/copy";
import {
  errorRecoveryAction,
  type AppRouterErrorProps,
} from "@/lib/errors/app-router-error";
import { ClientErrorReporter } from "@/lib/observability/client-error-reporter";

export default function TenantError(props: AppRouterErrorProps) {
  const recover = errorRecoveryAction(props);

  return (
    <>
      <ClientErrorReporter error={props.error} />
      <PatientStatusPage
        title={PATIENT_ERROR_TITLE}
        description={PATIENT_ERROR_BODY}
        actions={
          <>
            {recover ? (
              <ErrorRetryButton onRetry={recover} className="notFoundRetry" />
            ) : null}
            <a href="/" className="notFoundHome">
              {CLINIC_GUIDES_HOME_LABEL}
            </a>
          </>
        }
      />
    </>
  );
}
