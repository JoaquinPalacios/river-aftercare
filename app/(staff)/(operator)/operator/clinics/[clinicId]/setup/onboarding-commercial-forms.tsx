"use client";

import { useActionState } from "react";

import {
  prepareOnboardingStandardOfferAction,
  type OnboardingActionState,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/setup/actions";
import {
  saveComplimentaryAccessAction,
  type ComplimentaryAccessActionState,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/complimentary-actions";

const complimentaryInitial: ComplimentaryAccessActionState = {};
const offerInitial: OnboardingActionState = {};

export function OnboardingComplimentaryForm({
  clinicId,
}: {
  clinicId: string;
}) {
  const [state, action, pending] = useActionState(
    saveComplimentaryAccessAction,
    complimentaryInitial
  );

  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="clinicId" value={clinicId} />
      <input type="hidden" name="mode" value="grant" />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Plan</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="commercialPlan"
            value="ESSENTIAL"
            required
          />
          Essential
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="commercialPlan" value="PRACTICE" required />
          Practice
        </label>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Duration</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="duration" value="SIX_MONTHS" required />
          Six months
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="duration" value="TWELVE_MONTHS" required />
          12 months
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="duration" value="CUSTOM" required />
          Custom end date
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="duration" value="INDEFINITE" required />
          Indefinite
        </label>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="onboarding-custom-end">
          Custom end date
        </label>
        <input
          id="onboarding-custom-end"
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
        <label className="text-sm font-medium" htmlFor="onboarding-review-date">
          Commercial review date
        </label>
        <input
          id="onboarding-review-date"
          name="reviewDate"
          type="date"
          className="staffField"
        />
        <p className="text-sm text-staff-muted">
          Optional. This is not the end date.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="onboarding-reason">
          Reason
        </label>
        <textarea
          id="onboarding-reason"
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
        {pending ? "Saving…" : "Grant complimentary access"}
      </button>
    </form>
  );
}

export function OnboardingStandardOfferForm({
  clinicId,
}: {
  clinicId: string;
}) {
  const [state, action, pending] = useActionState(
    prepareOnboardingStandardOfferAction,
    offerInitial
  );

  return (
    <form action={action} className="mt-4 flex max-w-lg flex-col gap-4">
      <input type="hidden" name="clinicId" value={clinicId} />
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="onboarding-plan">
          Plan
        </label>
        <select
          id="onboarding-plan"
          name="commercialPlan"
          required
          defaultValue=""
          className="staffField staffSelect"
          aria-invalid={state.fieldErrors?.commercialPlan ? "true" : "false"}
        >
          <option value="" disabled>
            Choose a plan
          </option>
          <option value="ESSENTIAL">Essential</option>
          <option value="PRACTICE">Practice</option>
        </select>
        {state.fieldErrors?.commercialPlan ? (
          <p className="text-sm text-red-600">
            {state.fieldErrors.commercialPlan}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="onboarding-interval">
          Billing
        </label>
        <select
          id="onboarding-interval"
          name="billingInterval"
          required
          defaultValue=""
          className="staffField staffSelect"
          aria-invalid={state.fieldErrors?.billingInterval ? "true" : "false"}
        >
          <option value="" disabled>
            Choose monthly or annual billing
          </option>
          <option value="MONTHLY">Monthly</option>
          <option value="YEARLY">Annual</option>
        </select>
        {state.fieldErrors?.billingInterval ? (
          <p className="text-sm text-red-600">
            {state.fieldErrors.billingInterval}
          </p>
        ) : null}
      </div>
      <p className="text-sm text-staff-muted">
        This prepares the existing catalogue offer. The clinic administrator
        accepts the current legal terms and authorises payment later. Checkout
        does not start from this page.
      </p>
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
        {pending ? "Saving…" : "Prepare standard offer"}
      </button>
    </form>
  );
}
