"use client";

import { useActionState, useRef, useState } from "react";

import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import {
  setOperatorClinicActiveAction,
  type ClinicStatusActionState,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/clinic-lifecycle-actions";

const initialState: ClinicStatusActionState = {};

export function ClinicStatusSection({
  clinicId,
  inactive,
  deactivatedLabel,
}: {
  clinicId: string;
  inactive: boolean;
  deactivatedLabel: string | null;
}) {
  const [state, action, pending] = useActionState(
    setOperatorClinicActiveAction,
    initialState
  );
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
      <h2 className="text-base font-semibold">Clinic status</h2>
      <p className="mt-3 text-sm">Status: {inactive ? "Inactive" : "Active"}</p>
      {inactive && deactivatedLabel ? (
        <p className="mt-1 text-sm text-staff-muted">
          Deactivated {deactivatedLabel}
        </p>
      ) : null}
      <p className="mt-3 max-w-2xl text-sm text-staff-muted">
        Deactivating a clinic stops patient pages and clinic staff access. It
        does not cancel Stripe, change the subscription, or delete sites,
        locations, or guides. Billing continues until you use the existing
        billing controls.
      </p>
      <form ref={formRef} action={action} className="mt-4">
        <input type="hidden" name="clinicId" value={clinicId} />
        <input
          type="hidden"
          name="active"
          value={inactive ? "true" : "false"}
        />
        <button
          type="button"
          className="staffBtn staffBtnSecondary"
          onClick={() => setOpen(true)}
        >
          {inactive ? "Reactivate clinic" : "Deactivate clinic"}
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
          title={
            inactive ? "Reactivate this clinic?" : "Deactivate this clinic?"
          }
          description={
            inactive
              ? "Patient pages and clinic staff access follow the clinic's current sites and billing status. Invitations revoked during deactivation stay revoked. This does not change Stripe."
              : "Patient pages stop resolving and clinic staff cannot use the portal. Sites, locations, guides, memberships, and Stripe stay as they are. Billing continues until you use the existing billing controls. You can reactivate this clinic later."
          }
          cancelLabel="Cancel"
          confirmLabel={inactive ? "Reactivate clinic" : "Deactivate clinic"}
          confirmTone={inactive ? "primary" : "danger"}
          pending={pending}
          onCancel={() => setOpen(false)}
          onConfirm={() => {
            setOpen(false);
            formRef.current?.requestSubmit();
          }}
        />
      </form>
    </section>
  );
}
