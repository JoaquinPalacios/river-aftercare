"use client";

import { useActionState } from "react";

import {
  cancelClinicInvitationAction,
  resendClinicInvitationAction,
  type ClinicTeamActionState,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/team/actions";
import { INACTIVE_CLINIC_EDIT_NOTE } from "@/lib/clinics/inactive-clinic-copy";

const initial: ClinicTeamActionState = {};

export function OnboardingInvitationActions({
  clinicId,
  userId,
  allowResend = true,
}: {
  clinicId: string;
  userId: string;
  allowResend?: boolean;
}) {
  const [resendState, resendAction, resending] = useActionState(
    resendClinicInvitationAction,
    initial
  );
  const [cancelState, cancelAction, cancelling] = useActionState(
    cancelClinicInvitationAction,
    initial
  );

  return (
    <div className="mt-4 flex flex-col gap-3">
      {allowResend ? (
        <form action={resendAction}>
          <input type="hidden" name="clinicId" value={clinicId} />
          <input type="hidden" name="userId" value={userId} />
          <button
            type="submit"
            className="staffBtn staffBtnSecondary h-11"
            disabled={resending || cancelling}
          >
            {resending ? "Sending…" : "Resend invitation"}
          </button>
        </form>
      ) : (
        <p className="text-sm text-staff-muted">{INACTIVE_CLINIC_EDIT_NOTE}</p>
      )}
      {resendState.error ? (
        <p className="text-sm text-red-600" role="alert">
          {resendState.error}
        </p>
      ) : null}
      {resendState.success ? (
        <p className="staffFormStatus" role="status">
          {resendState.success}
        </p>
      ) : null}
      <form action={cancelAction}>
        <input type="hidden" name="clinicId" value={clinicId} />
        <input type="hidden" name="userId" value={userId} />
        <button
          type="submit"
          className="staffBtn staffBtnQuiet h-11 px-0"
          disabled={resending || cancelling}
        >
          {cancelling ? "Cancelling…" : "Cancel invitation"}
        </button>
      </form>
      {cancelState.error ? (
        <p className="text-sm text-red-600" role="alert">
          {cancelState.error}
        </p>
      ) : null}
      {cancelState.success ? (
        <p className="staffFormStatus" role="status">
          {cancelState.success}
        </p>
      ) : null}
    </div>
  );
}
