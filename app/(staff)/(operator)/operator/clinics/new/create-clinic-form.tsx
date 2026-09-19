"use client";

import { useActionState } from "react";

import {
  createClinicAction,
  type OperatorActionState,
} from "@/app/(staff)/(operator)/operator/actions";

const initial: OperatorActionState = {};

export function CreateClinicForm() {
  const [state, action, pending] = useActionState(createClinicAction, initial);

  return (
    <form action={action} className="flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="name">
          Practice name
        </label>
        <input
          id="name"
          name="name"
          required
          className="h-11 rounded-md border border-staff-line bg-staff-panel px-3 text-sm"
        />
        {state.fieldErrors?.name ? (
          <p className="text-sm text-red-600">{state.fieldErrors.name}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="slug">
          Tenant slug
        </label>
        <input
          id="slug"
          name="slug"
          required
          placeholder="riverside-dental"
          className="h-11 rounded-md border border-staff-line bg-staff-panel px-3 text-sm"
        />
        {state.fieldErrors?.slug ? (
          <p className="text-sm text-red-600">{state.fieldErrors.slug}</p>
        ) : null}
      </div>
      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="staffBtn staffBtnPrimary w-fit"
      >
        {pending ? "Creating…" : "Create clinic"}
      </button>
      <p className="text-sm text-staff-muted">
        After creating the clinic, invite users from Team. They choose their own
        password.
      </p>
    </form>
  );
}
