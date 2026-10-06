"use client";

import { useActionState, useRef, useState } from "react";

import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import {
  permanentlyDeleteOperatorClinicAction,
  type ClinicStatusActionState,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/clinic-lifecycle-actions";

const initialState: ClinicStatusActionState = {};

export function PermanentDeletionSection({
  clinicId,
  clinicName,
  clinicSlug,
  eligible,
  blockers,
}: {
  clinicId: string;
  clinicName: string;
  clinicSlug: string;
  eligible: boolean;
  blockers: readonly { code: string; message: string }[];
}) {
  const [state, action, pending] = useActionState(
    permanentlyDeleteOperatorClinicAction,
    initialState
  );
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const confirmed =
    confirmation.trim() === clinicName || confirmation.trim() === clinicSlug;

  return (
    <section className="rounded-xl border border-red-200 bg-staff-panel p-5">
      <h2 className="text-base font-semibold text-red-800">Danger zone</h2>
      <h3 className="mt-3 text-sm font-semibold">Permanently delete clinic</h3>
      <div className="mt-3 max-w-2xl space-y-2 text-sm text-staff-muted">
        <p>This is irreversible.</p>
        <p>Customer and staff access is removed.</p>
        <p>Operational clinic content is removed.</p>
        <p>Billing and legal audit records are retained.</p>
        <p>The tenant address is permanently retired and cannot be reused.</p>
      </div>
      {blockers.length > 0 ? (
        <ul className="mt-4 max-w-2xl list-disc space-y-1 pl-5 text-sm text-red-800">
          {blockers.map((blocker) => (
            <li key={blocker.code}>{blocker.message}</li>
          ))}
        </ul>
      ) : null}
      {eligible ? (
        <form ref={formRef} action={action} className="mt-4">
          <input type="hidden" name="clinicId" value={clinicId} />
          <input type="hidden" name="confirmation" value={confirmation} />
          <button
            type="button"
            className="staffBtn staffBtnDanger"
            onClick={() => setOpen(true)}
          >
            Permanently delete clinic
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
          <ConfirmDialog
            open={open}
            title="Permanently delete this clinic?"
            description="This is irreversible. Customer and staff access is removed. Operational clinic content is removed. Billing and legal audit records are retained. The tenant address is permanently retired and cannot be reused."
            cancelLabel="Cancel"
            confirmLabel="Permanently delete clinic"
            confirmTone="danger"
            pending={pending}
            confirmDisabled={!confirmed}
            onCancel={() => setOpen(false)}
            onConfirm={() => {
              setOpen(false);
              formRef.current?.requestSubmit();
            }}
          >
            <label className="mt-4 block text-sm">
              Type {clinicName} or {clinicSlug} to confirm
              <input
                className="mt-2 h-11 w-full rounded-md border border-staff-line bg-staff-panel px-3 text-sm"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
              />
            </label>
          </ConfirmDialog>
        </form>
      ) : null}
    </section>
  );
}
