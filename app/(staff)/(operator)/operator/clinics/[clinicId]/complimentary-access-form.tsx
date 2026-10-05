"use client";

import { useActionState } from "react";

import {
  saveComplimentaryAccessAction,
  type ComplimentaryAccessActionState,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/complimentary-actions";

const initial: ComplimentaryAccessActionState = {};

export function ComplimentaryAccessForm({
  clinicId,
  mode,
  plan,
}: {
  clinicId: string;
  mode: "grant" | "extend";
  plan: "ESSENTIAL" | "PRACTICE" | null;
}) {
  const [state, action, pending] = useActionState(
    saveComplimentaryAccessAction,
    initial
  );
  const extending = mode === "extend";

  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="clinicId" value={clinicId} />
      <input type="hidden" name="mode" value={mode} />
      {extending ? (
        <input type="hidden" name="commercialPlan" value={plan ?? ""} />
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Plan</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="commercialPlan"
              value="ESSENTIAL"
              defaultChecked
              required
            />
            Essential
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="commercialPlan" value="PRACTICE" />
            Practice
          </label>
        </fieldset>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Duration</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="duration"
            value="SIX_MONTHS"
            defaultChecked
            required
          />
          Six months
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="duration" value="TWELVE_MONTHS" />
          12 months
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="duration" value="CUSTOM" />
          Custom end date
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="duration" value="INDEFINITE" />
          Indefinite
        </label>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="customEndDate">
          Custom end date
        </label>
        <input
          id="customEndDate"
          name="customEndDate"
          type="date"
          className="staffField"
        />
        <p className="text-sm text-staff-muted">
          Required when the duration is Custom. The selected Sydney date is
          included.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="reviewDate">
          Commercial review date
        </label>
        <input
          id="reviewDate"
          name="reviewDate"
          type="date"
          className="staffField"
        />
        <p className="text-sm text-staff-muted">
          Optional. This is not the end date.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="complimentaryReason">
          Reason
        </label>
        <textarea
          id="complimentaryReason"
          name="reason"
          required
          rows={3}
          maxLength={1000}
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
        {pending
          ? "Saving…"
          : extending
            ? "Extend complimentary access"
            : "Grant complimentary access"}
      </button>
    </form>
  );
}
