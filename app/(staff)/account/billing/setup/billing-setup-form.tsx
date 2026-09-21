"use client";

import { useActionState, useEffect, useId, useState } from "react";

import {
  continueToSecurePaymentAction,
  type BillingSetupActionState,
} from "@/app/(staff)/account/billing/actions";

type RegionOption = { value: string; label: string };

export type BillingSetupFormValues = {
  legalEntityName: string;
  tradingName: string;
  billingContactName: string;
  billingEmail: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  businessNumberKind: "abn" | "acn";
  abn: string;
  acn: string;
};

const initialState: BillingSetupActionState = {};

export function BillingSetupForm({
  clinicName,
  planName,
  priceLabel,
  annualNote,
  contactHref,
  termsHref,
  privacyHref,
  regions,
  defaults,
  cancelMessage,
}: {
  clinicName: string;
  planName: string;
  priceLabel: string;
  annualNote: string | null;
  contactHref: string;
  termsHref: string;
  privacyHref: string;
  regions: readonly RegionOption[];
  defaults: BillingSetupFormValues;
  cancelMessage: string | null;
}) {
  const [state, action, pending] = useActionState(
    continueToSecurePaymentAction,
    initialState
  );
  const [kind, setKind] = useState<"abn" | "acn">(defaults.businessNumberKind);
  const [abn, setAbn] = useState(defaults.abn);
  const [acn, setAcn] = useState(defaults.acn);
  const formErrorId = useId();
  const termsErrorId = useId();

  useEffect(() => {
    if (!state.error && !state.fieldErrors) {
      return;
    }
    const invalid = document.querySelector<HTMLElement>(
      "[aria-invalid='true']"
    );
    invalid?.focus();
  }, [state]);

  function switchKind(next: "abn" | "acn") {
    setKind(next);
    if (next === "abn") {
      setAcn("");
    } else {
      setAbn("");
    }
  }

  return (
    <form action={action} className="flex min-w-0 flex-col gap-8" noValidate>
      {cancelMessage ? (
        <p className="staffFormStatus" role="status">
          {cancelMessage}
        </p>
      ) : null}
      {state.error ? (
        <p id={formErrorId} className="staffFormAlert" role="alert">
          {state.error}
        </p>
      ) : null}

      <section className="rounded-xl border border-staff-line bg-staff-panel p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
          {clinicName}
        </p>
        <h2 className="mt-3 text-lg font-semibold tracking-tight">
          Your River Aftercare plan
        </h2>
        <p className="mt-4 text-2xl font-semibold tracking-tight">{planName}</p>
        <p className="mt-1 text-base text-staff-ink">{priceLabel}</p>
        {annualNote ? (
          <p className="mt-1 text-sm text-staff-muted">{annualNote}</p>
        ) : null}
        <p className="mt-4 text-sm text-staff-muted">
          Need to change your plan?{" "}
          <a
            href={contactHref}
            className="font-medium text-staff-brand underline decoration-staff-brand/40 underline-offset-2"
          >
            Contact River Aftercare
          </a>
          .
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold">Billing details</h2>
          <p className="mt-1 text-sm text-staff-muted">
            These details are for invoices and your River Aftercare account.
            Payment details are collected securely by Stripe.
          </p>
        </div>

        <Field
          id="legalEntityName"
          name="legalEntityName"
          label="Legal entity name"
          defaultValue={defaults.legalEntityName}
          autoComplete="organization"
          error={state.fieldErrors?.legalEntityName}
        />
        <Field
          id="tradingName"
          name="tradingName"
          label="Trading or practice name"
          defaultValue={defaults.tradingName}
          error={state.fieldErrors?.tradingName}
        />
        <Field
          id="billingContactName"
          name="billingContactName"
          label="Billing contact name"
          defaultValue={defaults.billingContactName}
          autoComplete="name"
          error={state.fieldErrors?.billingContactName}
        />
        <Field
          id="billingEmail"
          name="billingEmail"
          label="Billing email"
          type="email"
          defaultValue={defaults.billingEmail}
          autoComplete="email"
          error={state.fieldErrors?.billingEmail}
        />

        <fieldset className="flex flex-col gap-4">
          <legend className="text-sm font-medium">Billing address</legend>
          <Field
            id="addressLine1"
            name="addressLine1"
            label="Address line 1"
            defaultValue={defaults.addressLine1}
            autoComplete="address-line1"
            error={state.fieldErrors?.addressLine1}
          />
          <Field
            id="addressLine2"
            name="addressLine2"
            label="Address line 2"
            defaultValue={defaults.addressLine2}
            autoComplete="address-line2"
            optional
            error={state.fieldErrors?.addressLine2}
          />
          <Field
            id="city"
            name="city"
            label="Suburb or city"
            defaultValue={defaults.city}
            autoComplete="address-level2"
            error={state.fieldErrors?.city}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="region">
              State
            </label>
            <select
              id="region"
              name="region"
              defaultValue={defaults.region}
              autoComplete="address-level1"
              aria-invalid={state.fieldErrors?.region ? "true" : "false"}
              aria-describedby={
                state.fieldErrors?.region ? "region-error" : undefined
              }
              className="staffField staffSelect"
            >
              <option value="">Choose a state</option>
              {regions.map((region) => (
                <option key={region.value} value={region.value}>
                  {region.label}
                </option>
              ))}
            </select>
            <FieldError id="region-error" message={state.fieldErrors?.region} />
          </div>
          <Field
            id="postalCode"
            name="postalCode"
            label="Postcode"
            defaultValue={defaults.postalCode}
            autoComplete="postal-code"
            inputMode="numeric"
            error={state.fieldErrors?.postalCode}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="country">
              Country
            </label>
            <select
              id="country"
              name="country"
              defaultValue={defaults.country || "AU"}
              autoComplete="country"
              className="staffField staffSelect"
            >
              <option value="AU">Australia</option>
            </select>
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <input type="hidden" name="businessNumberKind" value={kind} />
          {kind === "abn" ? (
            <Field
              id="abn"
              name="abn"
              label="ABN"
              value={abn}
              onChange={setAbn}
              inputMode="numeric"
              autoComplete="off"
              error={state.fieldErrors?.abn}
              hint="11 digits. Spaces are fine."
            />
          ) : (
            <Field
              id="acn"
              name="acn"
              label="ACN"
              value={acn}
              onChange={setAcn}
              inputMode="numeric"
              autoComplete="off"
              error={state.fieldErrors?.acn}
              hint="9 digits. Spaces are fine."
            />
          )}
          <button
            type="button"
            className="staffBtn staffBtnQuiet w-fit px-0"
            aria-pressed={kind === "acn"}
            onClick={() => switchKind(kind === "abn" ? "acn" : "abn")}
          >
            {kind === "abn" ? "No ABN?" : "Use ABN instead"}
          </button>
        </div>
      </section>

      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <input
            id="termsAccepted"
            name="termsAccepted"
            type="checkbox"
            value="on"
            aria-invalid={state.fieldErrors?.termsAccepted ? "true" : "false"}
            aria-describedby={
              state.fieldErrors?.termsAccepted ? termsErrorId : undefined
            }
            className="mt-1 h-4 w-4 shrink-0 accent-[var(--staff-brand)]"
          />
          <label htmlFor="termsAccepted" className="text-sm leading-6">
            I agree to the{" "}
            <a
              href={termsHref}
              className="font-medium text-staff-brand underline decoration-staff-brand/40 underline-offset-2"
            >
              Terms & Conditions
            </a>{" "}
            and acknowledge the{" "}
            <a
              href={privacyHref}
              className="font-medium text-staff-brand underline decoration-staff-brand/40 underline-offset-2"
            >
              Privacy Policy
            </a>
            .
          </label>
        </div>
        <FieldError
          id={termsErrorId}
          message={state.fieldErrors?.termsAccepted}
        />
      </div>

      <div className="flex flex-col gap-3">
        <button
          type="submit"
          className="staffBtn staffBtnPrimary h-11 w-full sm:w-fit"
          disabled={pending}
        >
          {pending ? "Continuing…" : "Continue to secure payment"}
        </button>
        <p className="text-sm text-staff-muted">
          You’ll complete payment on Stripe. River Aftercare never stores card
          or bank details.
        </p>
      </div>
    </form>
  );
}

function Field({
  id,
  name,
  label,
  defaultValue,
  value,
  onChange,
  type = "text",
  autoComplete,
  inputMode,
  error,
  hint,
  optional = false,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  type?: string;
  autoComplete?: string;
  inputMode?: "numeric" | "text" | "email";
  error?: string;
  hint?: string;
  optional?: boolean;
}) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
        {optional ? (
          <span className="font-normal text-staff-muted"> (optional)</span>
        ) : null}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={onChange ? undefined : defaultValue}
        value={onChange ? value : undefined}
        onChange={
          onChange ? (event) => onChange(event.target.value) : undefined
        }
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={describedBy || undefined}
        className="staffField w-full min-w-0"
      />
      {hint ? (
        <p id={hintId} className="text-sm text-staff-muted">
          {hint}
        </p>
      ) : null}
      <FieldError id={errorId} message={error} />
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <p id={id} className="text-sm text-red-600" role="alert">
      {message}
    </p>
  );
}
