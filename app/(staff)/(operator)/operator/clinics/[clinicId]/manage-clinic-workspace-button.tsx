"use client";

import { useFormStatus } from "react-dom";

const LABEL = "Manage clinic workspace";

/**
 * The idle label stays in the grid so the spinner does not change the
 * button width. `aria-label` keeps the control name stable for assistive tech.
 */
export function ManageClinicWorkspaceButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className="staffBtn staffBtnPrimary staffPendingSubmit"
      disabled={pending}
      aria-busy={pending || undefined}
      aria-label={pending ? "Opening clinic workspace" : LABEL}
    >
      <span className="inline-grid place-items-center">
        <span
          className={
            pending
              ? "invisible col-start-1 row-start-1"
              : "col-start-1 row-start-1"
          }
          aria-hidden={pending || undefined}
        >
          {LABEL}
        </span>
        {pending ? (
          <span className="col-start-1 row-start-1 inline-flex items-center justify-center gap-2">
            <span className="staffBtnSpinner" aria-hidden="true" />
            Opening
          </span>
        ) : null}
      </span>
    </button>
  );
}
