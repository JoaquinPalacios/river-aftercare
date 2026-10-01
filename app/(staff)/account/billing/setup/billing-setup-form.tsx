"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

import {
  continueToSecurePaymentAction,
  type BillingSetupActionState,
} from "@/app/(staff)/account/billing/actions";
import type { BillingSetupSubmittedValues } from "@/app/(staff)/account/billing/setup/billing-setup-values";
import {
  INVALID_ABN_MESSAGE,
  isValidAbn,
} from "@/lib/validation/australian-business-number";

type RegionOption = { value: string; label: string };

export type BillingSetupFormValues = Omit<
  BillingSetupSubmittedValues,
  "termsAccepted"
>;

const initialState: BillingSetupActionState = {};

export function BillingSetupForm({
  clinicName,
  planName,
  priceLabel,
  annualNote,
  detailLines,
  capacityNote,
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
  detailLines?: readonly string[];
  capacityNote?: string | null;
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
  const [form, setForm] = useState<BillingSetupSubmittedValues>(() => ({
    ...defaults,
    termsAccepted: false,
  }));
  const [abnTouched, setAbnTouched] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const formErrorId = useId();
  const termsErrorId = useId();

  useEffect(() => {
    if (!state.values) {
      return;
    }
    setForm(state.values);
  }, [state.values]);

  useEffect(() => {
    if (!state.error && !state.fieldErrors) {
      return;
    }
    const invalid = formRef.current?.querySelector<HTMLElement>(
      "[aria-invalid='true']"
    );
    invalid?.focus();
  }, [state]);

  function patch<Key extends keyof BillingSetupSubmittedValues>(
    key: Key,
    value: BillingSetupSubmittedValues[Key]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function switchKind(next: "abn" | "acn") {
    setForm((current) => ({
      ...current,
      businessNumberKind: next,
      abn: next === "abn" ? current.abn : "",
      acn: next === "acn" ? current.acn : "",
    }));
  }

  function shownError<Key extends keyof BillingSetupSubmittedValues>(
    key: Key
  ): string | undefined {
    const message = state.fieldErrors?.[key];
    if (!message || !state.values || state.values[key] === form[key]) {
      return message;
    }
    return undefined;
  }

  const abnError = abnFieldError({
    kind: form.businessNumberKind,
    value: form.abn,
    touched: abnTouched,
    serverError: state.fieldErrors?.abn,
    submittedValue: state.values?.abn,
  });

  return (
    <form
      ref={formRef}
      id="billing-setup-form"
      action={action}
      className="flex min-w-0 flex-col gap-8"
      noValidate
      onReset={(event) => {
        // React resets <form action> after the action resolves, including
        // when the action only returns validation errors.
        event.preventDefault();
      }}
    >
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
        {detailLines && detailLines.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm">
            {detailLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        {capacityNote ? (
          <p className="mt-3 text-sm text-staff-muted">{capacityNote}</p>
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
          value={form.legalEntityName}
          onChange={(value) => patch("legalEntityName", value)}
          autoComplete="organization"
          error={shownError("legalEntityName")}
        />
        <Field
          id="tradingName"
          name="tradingName"
          label="Trading or practice name"
          value={form.tradingName}
          onChange={(value) => patch("tradingName", value)}
          error={shownError("tradingName")}
        />
        <Field
          id="billingContactName"
          name="billingContactName"
          label="Billing contact name"
          value={form.billingContactName}
          onChange={(value) => patch("billingContactName", value)}
          autoComplete="name"
          error={shownError("billingContactName")}
        />
        <Field
          id="billingEmail"
          name="billingEmail"
          label="Billing email"
          type="email"
          value={form.billingEmail}
          onChange={(value) => patch("billingEmail", value)}
          autoComplete="email"
          error={shownError("billingEmail")}
        />

        <fieldset className="flex flex-col gap-4">
          <legend className="text-sm font-medium">Billing address</legend>
          <Field
            id="addressLine1"
            name="addressLine1"
            label="Address line 1"
            value={form.addressLine1}
            onChange={(value) => patch("addressLine1", value)}
            autoComplete="address-line1"
            error={shownError("addressLine1")}
          />
          <Field
            id="addressLine2"
            name="addressLine2"
            label="Address line 2"
            value={form.addressLine2}
            onChange={(value) => patch("addressLine2", value)}
            autoComplete="address-line2"
            optional
            error={shownError("addressLine2")}
          />
          <Field
            id="city"
            name="city"
            label="Suburb or city"
            value={form.city}
            onChange={(value) => patch("city", value)}
            autoComplete="address-level2"
            error={shownError("city")}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="region">
              State
            </label>
            <select
              id="region"
              name="region"
              value={form.region}
              onChange={(event) => patch("region", event.target.value)}
              autoComplete="address-level1"
              aria-invalid={shownError("region") ? "true" : "false"}
              aria-describedby={
                shownError("region") ? "region-error" : undefined
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
            <FieldError id="region-error" message={shownError("region")} />
          </div>
          <Field
            id="postalCode"
            name="postalCode"
            label="Postcode"
            value={form.postalCode}
            onChange={(value) => patch("postalCode", value)}
            autoComplete="postal-code"
            inputMode="numeric"
            error={shownError("postalCode")}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="country">
              Country
            </label>
            <select
              id="country"
              name="country"
              value={form.country || "AU"}
              onChange={(event) => patch("country", event.target.value)}
              autoComplete="country"
              className="staffField staffSelect"
            >
              <option value="AU">Australia</option>
            </select>
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <input
            type="hidden"
            name="businessNumberKind"
            value={form.businessNumberKind}
          />
          {form.businessNumberKind === "abn" ? (
            <Field
              id="abn"
              name="abn"
              label="ABN"
              value={form.abn}
              onChange={(value) => patch("abn", value)}
              onBlur={() => setAbnTouched(true)}
              inputMode="numeric"
              autoComplete="off"
              error={abnError}
              hint="11 digits. Spaces are fine."
            />
          ) : (
            <Field
              id="acn"
              name="acn"
              label="ACN"
              value={form.acn}
              onChange={(value) => patch("acn", value)}
              inputMode="numeric"
              autoComplete="off"
              error={shownError("acn")}
              hint="9 digits. Spaces are fine."
            />
          )}
          <button
            type="button"
            className="staffBtn staffBtnQuiet min-h-11 w-fit px-3"
            aria-pressed={form.businessNumberKind === "acn"}
            onClick={() =>
              switchKind(form.businessNumberKind === "abn" ? "acn" : "abn")
            }
          >
            {form.businessNumberKind === "abn" ? "No ABN?" : "Use ABN instead"}
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
            checked={form.termsAccepted}
            onChange={(event) => patch("termsAccepted", event.target.checked)}
            aria-invalid={shownError("termsAccepted") ? "true" : "false"}
            aria-describedby={
              shownError("termsAccepted") ? termsErrorId : undefined
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
        <FieldError id={termsErrorId} message={shownError("termsAccepted")} />
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

function abnFieldError(input: {
  kind: BillingSetupSubmittedValues["businessNumberKind"];
  value: string;
  touched: boolean;
  serverError?: string;
  submittedValue?: string;
}): string | undefined {
  if (input.kind !== "abn") {
    return undefined;
  }
  const unchanged =
    input.submittedValue === undefined || input.submittedValue === input.value;
  if (input.serverError && unchanged) {
    return input.serverError;
  }
  if (
    (input.touched || Boolean(input.serverError)) &&
    input.value.trim() &&
    !isValidAbn(input.value)
  ) {
    return INVALID_ABN_MESSAGE;
  }
  return undefined;
}

function Field({
  id,
  name,
  label,
  value,
  onChange,
  onBlur,
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
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
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
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
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
    <p id={id} className="staffFieldError text-sm text-red-600" role="alert">
      {message}
    </p>
  );
}
