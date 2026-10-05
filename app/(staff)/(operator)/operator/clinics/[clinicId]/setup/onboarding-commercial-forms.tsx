"use client";

import { useActionState, useState } from "react";

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

type Arrangement = "complimentary" | "standard";

export function OnboardingCommercialArrangement({
  clinicId,
}: {
  clinicId: string;
}) {
  const [arrangement, setArrangement] = useState<Arrangement | null>(null);

  return (
    <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
      <h2 className="text-base font-semibold">Commercial arrangement</h2>
      <fieldset className="mt-4 flex flex-col gap-3">
        <legend className="text-sm font-medium">
          How will this clinic use River Aftercare?
        </legend>
        <ArrangementChoice
          value="complimentary"
          selected={arrangement}
          onSelect={setArrangement}
          title="Complimentary collaboration"
          detail="Free Essential or Practice access for an agreed period."
        />
        <ArrangementChoice
          value="standard"
          selected={arrangement}
          onSelect={setArrangement}
          title="Standard subscription"
          detail="Standard River Aftercare pricing. The clinic authorises payment later."
        />
      </fieldset>
      {arrangement === "complimentary" ? (
        <OnboardingComplimentaryForm clinicId={clinicId} />
      ) : null}
      {arrangement === "standard" ? (
        <OnboardingStandardOfferForm clinicId={clinicId} />
      ) : null}
    </section>
  );
}

function ArrangementChoice({
  value,
  selected,
  onSelect,
  title,
  detail,
}: {
  value: Arrangement;
  selected: Arrangement | null;
  onSelect: (value: Arrangement) => void;
  title: string;
  detail: string;
}) {
  const detailId = `arrangement-${value}-detail`;
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border border-staff-line p-3">
      <input
        type="radio"
        className="mt-1"
        name="onboardingCommercialArrangement"
        value={value}
        checked={selected === value}
        aria-describedby={detailId}
        onChange={() => onSelect(value)}
      />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span id={detailId} className="mt-1 block text-sm text-staff-muted">
          {detail}
        </span>
      </span>
    </label>
  );
}

export function OnboardingComplimentaryForm({
  clinicId,
}: {
  clinicId: string;
}) {
  const [state, action, pending] = useActionState(
    saveComplimentaryAccessAction,
    complimentaryInitial
  );
  const [duration, setDuration] = useState("");

  return (
    <form
      action={action}
      className="mt-5 flex flex-col gap-4 border-t border-staff-line pt-4"
    >
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
          <input
            type="radio"
            name="duration"
            value="SIX_MONTHS"
            required
            onChange={() => setDuration("SIX_MONTHS")}
          />
          6 months
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="duration"
            value="TWELVE_MONTHS"
            required
            onChange={() => setDuration("TWELVE_MONTHS")}
          />
          12 months
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="duration"
            value="CUSTOM"
            required
            onChange={() => setDuration("CUSTOM")}
          />
          Custom
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="duration"
            value="INDEFINITE"
            required
            onChange={() => setDuration("INDEFINITE")}
          />
          Indefinite
        </label>
      </fieldset>
      {duration === "CUSTOM" ? (
        <div className="flex flex-col gap-1.5">
          <label
            className="text-sm font-medium"
            htmlFor="onboarding-custom-end"
          >
            Custom end date
          </label>
          <input
            id="onboarding-custom-end"
            name="customEndDate"
            type="date"
            required
            className="staffField"
          />
          <p className="text-sm text-staff-muted">
            The selected Sydney date is included.
          </p>
        </div>
      ) : null}
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
    <form
      action={action}
      className="mt-5 flex max-w-lg flex-col gap-4 border-t border-staff-line pt-4"
    >
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
        {pending ? "Saving…" : "Set up paid plan"}
      </button>
    </form>
  );
}
