"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { ContactTurnstile } from "@/app/(marketing)/components/contact-turnstile";
import { OnboardingAssistance } from "@/app/(staff)/components/onboarding-assistance";
import { readAccountTokenFromHash } from "@/lib/auth/account-token-format";
import { staffEmailFieldError } from "@/lib/auth/login-input";
import {
  REGISTRATION_INTENT_GENERIC_MESSAGE,
  REGISTRATION_INTENT_INVALID_LINK_MESSAGE,
  REGISTRATION_VERIFY_CONFIRMED_MESSAGE,
  REGISTRATION_VERIFY_EXPIRED_MESSAGE,
} from "@/lib/auth/registration-copy";
import { CONTACT_HONEYPOT_FIELD } from "@/lib/marketing/contact-fields";

type VerifyState =
  | { status: "checking" }
  | { status: "valid"; message: string }
  | { status: "expired"; message: string }
  | { status: "invalid"; message: string };

export function VerifyRegistrationPanel({
  turnstileSiteKey,
  contactHref,
}: {
  turnstileSiteKey: string;
  contactHref: string;
}) {
  const [state, setState] = useState<VerifyState>({ status: "checking" });
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const pending = isSubmitting || isPending;

  useEffect(() => {
    const token = readAccountTokenFromHash(window.location.hash);
    if (!token) {
      setState({
        status: "invalid",
        message: REGISTRATION_INTENT_INVALID_LINK_MESSAGE,
      });
      return;
    }

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/auth/register/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          status?: string;
          message?: string;
        };
        if (data.status === "valid") {
          setState({
            status: "valid",
            message: data.message ?? REGISTRATION_VERIFY_CONFIRMED_MESSAGE,
          });
          window.history.replaceState(null, "", "/verify-registration");
          return;
        }
        if (data.status === "expired") {
          setState({
            status: "expired",
            message: data.message ?? REGISTRATION_VERIFY_EXPIRED_MESSAGE,
          });
          window.history.replaceState(null, "", "/verify-registration");
          return;
        }
        setState({
          status: "invalid",
          message: data.message ?? REGISTRATION_INTENT_INVALID_LINK_MESSAGE,
        });
        window.history.replaceState(null, "", "/verify-registration");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setState({
          status: "invalid",
          message: REGISTRATION_INTENT_INVALID_LINK_MESSAGE,
        });
      }
    })();

    return () => controller.abort();
  }, []);

  function handleResend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || !formRef.current) {
      return;
    }
    const nextEmailError = staffEmailFieldError(email);
    if (nextEmailError) {
      setEmailError(nextEmailError);
      setSent(false);
      return;
    }
    setEmailError(undefined);
    setFormError(undefined);
    submittingRef.current = true;
    setIsSubmitting(true);
    const body = new FormData(formRef.current);

    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/register/resend", {
          method: "POST",
          body,
        });
        if (response.ok) {
          setSent(true);
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
          return;
        }
        setSent(true);
      } catch {
        setSent(true);
      } finally {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {state.status === "checking" ? (
        <p className="text-sm text-staff-muted" role="status">
          Checking this verification link.
        </p>
      ) : (
        <div
          className="rounded-md border border-staff-line bg-staff-canvas px-3 py-3 text-sm leading-6 text-staff-ink"
          role="status"
        >
          {state.message}
        </div>
      )}

      {state.status === "valid" ? (
        <p className="text-sm leading-6 text-staff-muted">
          Keep this email address. Clinic setup will continue from the
          confirmation you just completed.
        </p>
      ) : null}

      {state.status === "expired" || state.status === "invalid" ? (
        <form
          ref={formRef}
          className="flex flex-col gap-4"
          method="post"
          onSubmit={handleResend}
          noValidate
          aria-busy={pending || undefined}
        >
          <p className="text-sm leading-6 text-staff-muted">
            Request another verification email. If a registration is waiting for
            this address, we'll send a new link.
          </p>
          <div className="flex flex-col gap-2">
            <label
              className="text-sm font-medium text-staff-ink"
              htmlFor="email"
            >
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
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={emailError ? "true" : "false"}
              aria-describedby={emailError ? "email-error" : undefined}
              className="staffLoginField"
            />
            {emailError ? (
              <p id="email-error" className="staffFieldError">
                {emailError}
              </p>
            ) : null}
          </div>
          <div className="sr-only" aria-hidden="true">
            <label htmlFor="verification-website">Website</label>
            <input
              id="verification-website"
              name={CONTACT_HONEYPOT_FIELD}
              type="text"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>
          <ContactTurnstile siteKey={turnstileSiteKey} resetSignal={0} />
          {formError ? (
            <div className="staffFormAlert" role="alert">
              {formError}
            </div>
          ) : null}
          {sent ? (
            <p className="text-sm leading-6 text-staff-ink" role="status">
              {REGISTRATION_INTENT_GENERIC_MESSAGE}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="staffBtn staffBtnPrimary staffLoginSubmit h-11"
          >
            {pending ? "Sending…" : "Email a new link"}
          </button>
        </form>
      ) : null}

      <OnboardingAssistance
        stage={state.status === "valid" ? "email_verification" : "registration"}
        contactHref={contactHref}
      />
    </div>
  );
}
