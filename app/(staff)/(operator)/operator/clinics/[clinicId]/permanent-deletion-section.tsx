"use client";

import { useActionState, useRef, useState } from "react";

import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import {
  permanentlyDeleteOperatorClinicAction,
  type ClinicStatusActionState,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/clinic-lifecycle-actions";
import { PermanentDeletionConfirmFields } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/permanent-deletion-confirm-fields";

const initialState: ClinicStatusActionState = {};

export function PermanentDeletionSection({
  clinicId,
  clinicName,
  eligible,
  blockers,
}: {
  clinicId: string;
  clinicName: string;
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
  const confirmed = confirmation.trim() === clinicName;

  return (
    <section className="rounded-xl border border-red-200 bg-staff-panel p-5">
      <h2 className="text-base font-semibold text-red-800">Danger zone</h2>
      <h3 className="mt-3 text-sm font-semibold">Delete clinic</h3>
      <div className="mt-3 max-w-2xl space-y-2 text-sm text-staff-muted">
        <p>This cannot be undone.</p>
        <p>
          All clinic data will be permanently removed. Former tenant addresses
          remain reserved so old patient links cannot be reassigned.
        </p>
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
            Delete permanently
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
            className="permanentDeleteDialog"
            title="Delete this archived clinic permanently?"
            description="This cannot be undone."
            cancelLabel="Cancel"
            confirmLabel="Delete permanently"
            confirmTone="danger"
            pending={pending}
            confirmDisabled={!confirmed}
            onCancel={() => setOpen(false)}
            onConfirm={() => {
              setOpen(false);
              formRef.current?.requestSubmit();
            }}
          >
            <p>
              All clinic data will be permanently removed. Former tenant
              addresses remain reserved so old patient links cannot be
              reassigned.
            </p>
            <PermanentDeletionConfirmFields
              clinicName={clinicName}
              confirmation={confirmation}
              onConfirmationChange={setConfirmation}
            />
          </ConfirmDialog>
        </form>
      ) : null}
    </section>
  );
}
