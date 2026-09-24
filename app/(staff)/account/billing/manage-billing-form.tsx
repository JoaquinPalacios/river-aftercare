"use client";

import { useActionState } from "react";

import {
  openCustomerPortalAction,
  type CustomerPortalActionState,
} from "@/app/(staff)/account/billing/actions";
import { PendingSubmitButton } from "@/app/(staff)/components/pending-submit-button";

const initial: CustomerPortalActionState = {};

export function ManageBillingForm() {
  const [state, action, pending] = useActionState(
    openCustomerPortalAction,
    initial
  );

  return (
    <form action={action} className="mt-5" aria-busy={pending || undefined}>
      <PendingSubmitButton
        label="Manage billing"
        pendingLabel="Opening billing…"
        className="staffBtn staffBtnPrimary inline-flex h-11 w-full items-center sm:w-auto"
        disabled={pending}
      />
      {state.error ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
