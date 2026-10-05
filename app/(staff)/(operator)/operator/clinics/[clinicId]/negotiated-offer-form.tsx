"use client";

import { useActionState } from "react";

import {
  saveNegotiatedOfferAction,
  withdrawNegotiatedOfferAction,
  type NegotiatedOfferActionState,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/negotiated-actions";

const initial: NegotiatedOfferActionState = {};

export function NegotiatedOfferForm({
  clinicId,
  planLabel,
}: {
  clinicId: string;
  planLabel: string;
}) {
  const [state, action, pending] = useActionState(
    saveNegotiatedOfferAction,
    initial
  );

  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="clinicId" value={clinicId} />
      <p className="text-sm text-staff-muted">
        The functional plan stays {planLabel}. This records the agreed price. It
        does not charge the clinic.
      </p>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Billing interval</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="billingInterval"
            value="MONTHLY"
            defaultChecked
            required
          />
          Monthly
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="billingInterval" value="YEARLY" />
          Annual
        </label>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="negotiatedAmount">
          Price (AUD)
        </label>
        <input
          id="negotiatedAmount"
          name="amount"
          inputMode="decimal"
          required
          className="staffField"
          placeholder="49.00"
        />
        <p className="text-sm text-staff-muted">
          Dollars and cents. The smallest charge is A$0.50.
        </p>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">When payment can start</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="startMode"
            value="CUSTOMER_INITIATED"
            defaultChecked
            required
          />
          When the administrator pays
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="startMode" value="AGREED_DATE" />
          On an agreed date
        </label>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="billingStartDate">
          Agreed start date
        </label>
        <input
          id="billingStartDate"
          name="billingStartDate"
          type="date"
          className="staffField"
        />
        <p className="text-sm text-staff-muted">
          Required for an agreed date. Checkout stays closed until that Sydney
          day. Nothing is charged automatically. Complimentary expiry does not
          start a charge.
        </p>
      </div>
      <p className="text-sm text-staff-muted">
        The negotiated price continues until a later written change or
        cancellation. It does not increase to the standard price.
      </p>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="commercialTerms">
          Agreed commercial terms
        </label>
        <textarea
          id="commercialTerms"
          name="commercialTerms"
          required
          rows={4}
          maxLength={2000}
          className="staffField"
        />
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
        {pending ? "Saving…" : "Prepare negotiated price"}
      </button>
    </form>
  );
}

export function WithdrawNegotiatedOfferForm({
  clinicId,
}: {
  clinicId: string;
}) {
  const [state, action, pending] = useActionState(
    withdrawNegotiatedOfferAction,
    initial
  );

  return (
    <form action={action} className="mt-4 flex flex-col gap-3">
      <input type="hidden" name="clinicId" value={clinicId} />
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
      <button type="submit" className="staffBtn h-11 w-fit" disabled={pending}>
        {pending ? "Withdrawing…" : "Withdraw negotiated price"}
      </button>
    </form>
  );
}
