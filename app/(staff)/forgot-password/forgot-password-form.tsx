"use client";

import { useRef, useState, useTransition } from "react";

import { forgotPasswordSchema } from "@/app/(staff)/forgot-password/forgot-password-schema";
import { FORGOT_PASSWORD_GENERIC_MESSAGE } from "@/lib/auth/password-policy";

const PENDING_STATUS = "Sending reset instructions. Please wait.";

export function ForgotPasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState(false);
  const pending = isSubmitting || isPending;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setEmailError(parsed.error.flatten().fieldErrors.email?.[0]);
      setSubmitted(false);
      return;
    }

    setEmailError(undefined);
    setFormError(undefined);
    submittingRef.current = true;
    setIsSubmitting(true);

    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: parsed.data.email }),
        });

        if (response.ok) {
          setSubmitted(true);
          submittingRef.current = false;
          setIsSubmitting(false);
          return;
        }

        if (response.status === 400) {
          try {
            const data = (await response.json()) as {
              error?: string;
              fieldErrors?: { email?: string };
            };
            setEmailError(data.fieldErrors?.email);
            setFormError(data.error);
          } catch {
            setFormError("Enter a valid email address.");
          }
          submittingRef.current = false;
          setIsSubmitting(false);
          return;
        }

        setSubmitted(true);
        submittingRef.current = false;
        setIsSubmitting(false);
      } catch {
        setSubmitted(true);
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-5"
      method="post"
      onSubmit={handleSubmit}
      noValidate
      aria-busy={pending || undefined}
    >
      <div
        id="forgot-password-pending-status"
        className="sr-only"
        role="status"
        aria-live="polite"
      >
        {pending ? PENDING_STATUS : ""}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-staff-ink" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          disabled={pending}
          onChange={(event) => {
            if (submittingRef.current) {
              return;
            }
            setEmail(event.target.value);
            setEmailError(undefined);
            setFormError(undefined);
            setSubmitted(false);
          }}
          aria-invalid={emailError ? "true" : "false"}
          aria-describedby={emailError ? "email-error" : undefined}
          className="staffLoginField"
        />
        {emailError ? (
          <p id="email-error" className="text-sm text-red-600">
            {emailError}
          </p>
        ) : null}
      </div>

      {formError ? (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {formError}
        </div>
      ) : null}

      {submitted ? (
        <div
          className="rounded-md border border-staff-line bg-staff-canvas px-3 py-2 text-sm text-staff-ink"
          role="status"
        >
          {FORGOT_PASSWORD_GENERIC_MESSAGE}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="staffBtn staffBtnPrimary staffLoginSubmit h-11"
      >
        {pending ? (
          <span className="staffLoginSpinner" aria-hidden="true" />
        ) : null}
        {pending ? "Sending…" : "Send reset instructions"}
      </button>
    </form>
  );
}
