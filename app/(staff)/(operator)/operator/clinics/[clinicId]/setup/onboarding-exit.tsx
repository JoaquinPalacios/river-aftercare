"use client";

import Link from "next/link";
import { useState } from "react";
import { useActionState } from "react";

import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import {
  discardAssistedClinicAction,
  type OnboardingActionState,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/setup/actions";

const initial: OnboardingActionState = {};

export function OnboardingExit({
  clinicId,
  clinicName,
  canDiscard,
}: {
  clinicId: string;
  clinicName: string;
  canDiscard: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    discardAssistedClinicAction,
    initial
  );
  const discardDescription = `This permanently removes ${clinicName} and frees the tenant address. It cannot be undone.`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/operator/clinics/${clinicId}`}
          className="text-sm font-medium text-staff-brand"
        >
          Exit setup
        </Link>
        <p className="mt-1 text-sm text-staff-muted">Your progress is saved.</p>
      </div>
      {canDiscard ? (
        <form
          id={`discard-clinic-${clinicId}`}
          action={action}
          className="flex flex-col gap-2"
        >
          <input type="hidden" name="clinicId" value={clinicId} />
          <button
            type="button"
            className="staffBtn staffBtnDanger h-11 w-fit"
            disabled={pending}
            onClick={() => setOpen(true)}
          >
            Discard this clinic
          </button>
          <p className="text-sm text-staff-muted">{discardDescription}</p>
          {state.error ? (
            <p className="text-sm text-red-600" role="alert">
              {state.error}
            </p>
          ) : null}
          <ConfirmDialog
            open={open}
            title={`Discard ${clinicName}`}
            description={discardDescription}
            cancelLabel="Keep clinic"
            confirmLabel="Discard this clinic"
            pending={pending}
            pendingLabel="Discarding…"
            onCancel={() => setOpen(false)}
            onConfirm={() => {
              const form = document.getElementById(
                `discard-clinic-${clinicId}`
              );
              if (form instanceof HTMLFormElement) {
                form.requestSubmit();
              }
            }}
          />
        </form>
      ) : null}
    </div>
  );
}
