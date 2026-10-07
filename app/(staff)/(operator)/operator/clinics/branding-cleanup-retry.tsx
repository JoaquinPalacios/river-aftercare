"use client";

import { useActionState } from "react";

import {
  retryPermanentDeletionBrandingAction,
  type ClinicStatusActionState,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/clinic-lifecycle-actions";

const initialState: ClinicStatusActionState = {};

export function BrandingCleanupRetry({ clinicId }: { clinicId: string }) {
  const [state, action, pending] = useActionState(
    retryPermanentDeletionBrandingAction,
    initialState
  );

  return (
    <form
      action={action}
      className="rounded-xl border border-staff-line bg-staff-panel p-5"
    >
      <input type="hidden" name="clinicId" value={clinicId} />
      <p className="text-sm">
        Clinic permanently deleted. Some branding files could not be removed.
      </p>
      <button
        type="submit"
        className="staffBtn staffBtnSecondary mt-3"
        disabled={pending}
      >
        {pending ? "Retrying…" : "Retry branding cleanup"}
      </button>
      {state.error ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="mt-2 text-sm text-staff-muted" role="status">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
