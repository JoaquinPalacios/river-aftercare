"use client";

import { useActionState } from "react";

import {
  inviteClinicUserAction,
  type ClinicTeamActionState,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/team/actions";
import { INVITED_NAME_MAX_LENGTH } from "@/lib/operator/clinic-invitation-fields";
import { LOGIN_EMAIL_MAX_LENGTH } from "@/lib/auth/login-input";
import {
  TEAM_ADMIN_ROLE_LABEL,
  TEAM_STAFF_ROLE_LABEL,
} from "@/lib/clinic-portal/role-labels";
import {
  PENDING_INVITATION_RESERVATION_NOTE,
  teamMemberLimitMessage,
} from "@/lib/entitlements/messages";

const initial: ClinicTeamActionState = {};
const PENDING_STATUS = "Sending invitation. Please wait.";

export function InviteUserForm({
  clinicId,
  atLimit,
  usageLabel,
  limitMessage,
}: {
  clinicId: string;
  atLimit: boolean;
  usageLabel: string | null;
  limitMessage: string | null;
}) {
  const [state, action, pending] = useActionState(
    inviteClinicUserAction,
    initial
  );

  return (
    <form
      action={action}
      className="flex max-w-lg flex-col gap-4"
      noValidate
      aria-busy={pending || undefined}
    >
      <div
        id="invite-user-pending-status"
        className="sr-only"
        role="status"
        aria-live="polite"
      >
        {pending ? PENDING_STATUS : ""}
      </div>
      <input type="hidden" name="clinicId" value={clinicId} />
      {usageLabel ? (
        <p className="text-sm font-medium text-staff-ink">{usageLabel}</p>
      ) : null}
      {atLimit ? (
        <p className="text-sm leading-6 text-staff-muted">
          {limitMessage ?? teamMemberLimitMessage(0)}{" "}
          {PENDING_INVITATION_RESERVATION_NOTE} Grant extra team allowance on
          the clinic page before inviting another person.
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="invite-name">
          Name
        </label>
        <input
          id="invite-name"
          name="name"
          required
          maxLength={INVITED_NAME_MAX_LENGTH}
          disabled={pending || atLimit}
          className="h-11 rounded-md border border-staff-line bg-staff-panel px-3 text-sm"
        />
        {state.fieldErrors?.name ? (
          <p className="text-sm text-red-600">{state.fieldErrors.name}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="invite-email">
          Email
        </label>
        <input
          id="invite-email"
          name="email"
          type="email"
          required
          maxLength={LOGIN_EMAIL_MAX_LENGTH}
          disabled={pending || atLimit}
          autoComplete="email"
          className="h-11 rounded-md border border-staff-line bg-staff-panel px-3 text-sm"
        />
        {state.fieldErrors?.email ? (
          <p className="text-sm text-red-600">{state.fieldErrors.email}</p>
        ) : (
          <p className="text-sm text-staff-muted">
            We&apos;ll email a one-time setup link to this address.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="invite-role">
          Role
        </label>
        <select
          id="invite-role"
          name="role"
          required
          disabled={pending || atLimit}
          defaultValue="STAFF"
          className="staffSelect h-11 rounded-md border border-staff-line bg-staff-panel px-3 text-sm"
        >
          <option value="ADMIN">{TEAM_ADMIN_ROLE_LABEL}</option>
          <option value="STAFF">{TEAM_STAFF_ROLE_LABEL}</option>
        </select>
        {state.fieldErrors?.role ? (
          <p className="text-sm text-red-600">{state.fieldErrors.role}</p>
        ) : null}
      </div>
      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-staff-ink" role="status">
          {state.success}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || atLimit}
        className="staffBtn staffBtnPrimary staffLoginSubmit h-11 w-fit"
        aria-busy={pending || undefined}
      >
        {pending ? (
          <span className="staffLoginSpinner" aria-hidden="true" />
        ) : null}
        {pending ? "Sending…" : "Send invitation"}
      </button>
    </form>
  );
}
