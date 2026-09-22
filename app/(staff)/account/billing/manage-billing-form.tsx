"use client";

import { useActionState } from "react";

import {
  openCustomerPortalAction,
  type CustomerPortalActionState,
} from "@/app/(staff)/account/billing/actions";

const initial: CustomerPortalActionState = {};

export function ManageBillingForm() {
  const [state, action, pending] = useActionState(
    openCustomerPortalAction,
    initial
  );

  return (
    <form action={action} className="mt-5">
      <button
        type="submit"
        className="staffBtn staffBtnPrimary inline-flex h-11 items-center"
        disabled={pending}
      >
        {pending ? "Opening billing…" : "Manage billing"}
      </button>
      {state.error ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
