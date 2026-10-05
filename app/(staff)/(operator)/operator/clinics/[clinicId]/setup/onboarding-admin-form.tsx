"use client";

import { useActionState } from "react";

import {
  inviteFirstClinicAdministratorAction,
  type OnboardingActionState,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/setup/actions";
import { LOGIN_EMAIL_MAX_LENGTH } from "@/lib/auth/login-input";
import { INVITED_NAME_MAX_LENGTH } from "@/lib/operator/clinic-invitation-fields";
import { TEAM_ADMIN_ROLE_LABEL } from "@/lib/clinic-portal/role-labels";

const initial: OnboardingActionState = {};

export function OnboardingAdminForm({ clinicId }: { clinicId: string }) {
  const [state, action, pending] = useActionState(
    inviteFirstClinicAdministratorAction,
    initial
  );

  return (
    <form
      action={action}
      className="mt-4 flex max-w-lg flex-col gap-4"
      noValidate
    >
      <input type="hidden" name="clinicId" value={clinicId} />
      <p className="text-sm text-staff-muted">
        Role: {TEAM_ADMIN_ROLE_LABEL}. The recipient chooses their own password.
      </p>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="onboarding-admin-name">
          Name
        </label>
        <input
          id="onboarding-admin-name"
          name="name"
          required
          maxLength={INVITED_NAME_MAX_LENGTH}
          disabled={pending}
          className="h-11 rounded-md border border-staff-line bg-staff-panel px-3 text-sm"
        />
        {state.fieldErrors?.name ? (
          <p className="text-sm text-red-600">{state.fieldErrors.name}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="onboarding-admin-email">
          Email
        </label>
        <input
          id="onboarding-admin-email"
          name="email"
          type="email"
          required
          maxLength={LOGIN_EMAIL_MAX_LENGTH}
          disabled={pending}
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
      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="staffFormStatus" role="status">
          {state.success}
        </p>
      ) : null}
      <button
        type="submit"
        className="staffBtn staffBtnPrimary h-11 w-fit"
        disabled={pending}
      >
        {pending ? "Sending invitation…" : "Invite administrator"}
      </button>
    </form>
  );
}
