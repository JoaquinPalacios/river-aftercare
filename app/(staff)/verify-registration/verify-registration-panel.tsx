"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { ContactTurnstile } from "@/app/(marketing)/components/contact-turnstile";
import { OnboardingAssistance } from "@/app/(staff)/components/onboarding-assistance";
import { readAccountTokenFromHash } from "@/lib/auth/account-token-format";
import { staffEmailFieldError } from "@/lib/auth/login-input";
import {
  REGISTRATION_INTENT_GENERIC_MESSAGE,
  REGISTRATION_INTENT_INVALID_LINK_MESSAGE,
  REGISTRATION_PROVISION_RETRY_MESSAGE,
  REGISTRATION_SLUG_RECOVERY_MESSAGE,
  REGISTRATION_VERIFY_EXPIRED_MESSAGE,
  registrationSlugPolicyMessage,
} from "@/lib/auth/registration-copy";
import { CONTACT_HONEYPOT_FIELD } from "@/lib/marketing/contact-fields";

const BILLING_SETUP_PATH = "/account/billing/setup";

// Survives a development remount after the fragment has been removed.
let verificationTokenMemory = "";

type VerifyState =
  | { status: "checking" }
  | { status: "slug"; message: string; slug: string }
  | { status: "expired"; message: string }
  | { status: "invalid"; message: string }
  | { status: "retry"; message: string };

type ProvisionBody = {
  status?: string;
  message?: string;
  slug?: string;
  redirectTo?: string;
};

export function VerifyRegistrationPanel({
  turnstileSiteKey,
  contactHref,
  slugHost,
}: {
  turnstileSiteKey: string;
  contactHref: string;
  slugHost: string;
}) {
  const [state, setState] = useState<VerifyState>({ status: "checking" });
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [slug, setSlug] = useState("");
  const [slugError, setSlugError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const tokenRef = useRef("");
  const formRef = useRef<HTMLFormElement>(null);
  const pending = isSubmitting || isPending;

  useEffect(() => {
    const token =
      readAccountTokenFromHash(window.location.hash) || verificationTokenMemory;
    if (!token) {
      setState({
        status: "invalid",
        message: REGISTRATION_INTENT_INVALID_LINK_MESSAGE,
      });
      return;
    }
    verificationTokenMemory = token;
    tokenRef.current = token;
    window.history.replaceState(null, "", "/verify-registration");

    const controller = new AbortController();
    void postProvision(
      "/api/auth/register/verify",
      { token },
      controller.signal
    )
      .then((data) => {
        if (!data) {
          return;
        }
        applyProvisionResult(data, setState, setSlug);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setState({
          status: "retry",
          message: REGISTRATION_PROVISION_RETRY_MESSAGE,
        });
      });

    return () => controller.abort();
  }, []);

  function handleSlug(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = tokenRef.current || verificationTokenMemory;
    if (!token || submittingRef.current) {
      return;
    }
    const nextSlug = slug.trim().toLowerCase();
    const policy = registrationSlugPolicyMessage(nextSlug);
    if (policy) {
      setSlugError(policy);
      return;
    }
    setSlugError(undefined);
    submittingRef.current = true;
    setIsSubmitting(true);
    startTransition(async () => {
      try {
        const data = await postProvision("/api/auth/register/slug", {
          token,
          slug: nextSlug,
        });
        if (!data) {
          setState({
            status: "retry",
            message: REGISTRATION_PROVISION_RETRY_MESSAGE,
          });
          return;
        }
        applyProvisionResult(data, setState, setSlug);
      } catch {
        setState({
          status: "retry",
          message: REGISTRATION_PROVISION_RETRY_MESSAGE,
        });
      } finally {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    });
  }

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

  const assistanceStage =
    state.status === "checking" ||
    state.status === "slug" ||
    state.status === "retry"
      ? "email_verification"
      : "registration";

  return (
    <div className="flex flex-col gap-5">
      {state.status === "checking" ? (
        <p className="text-sm text-staff-muted" role="status">
          Creating your clinic.
        </p>
      ) : null}

      {state.status === "slug" ? (
        <form className="flex flex-col gap-4" onSubmit={handleSlug} noValidate>
          <p className="text-sm leading-6 text-staff-ink" role="status">
            {state.message || REGISTRATION_SLUG_RECOVERY_MESSAGE}
          </p>
          <div className="flex flex-col gap-2">
            <label
              className="text-sm font-medium text-staff-ink"
              htmlFor="slug"
            >
              Preferred clinic URL
            </label>
            <input
              id="slug"
              name="slug"
              value={slug}
              disabled={pending}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => {
                setSlug(event.target.value.trim().toLowerCase());
                setSlugError(undefined);
              }}
              aria-invalid={slugError ? "true" : "false"}
              aria-describedby={slugError ? "slug-error" : "slug-hint"}
              className="staffLoginField"
            />
            {slugError ? (
              <p id="slug-error" className="staffFieldError">
                {slugError}
              </p>
            ) : (
              <p id="slug-hint" className="text-sm text-staff-muted">
                {slug || "your-clinic"}.{slugHost}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={pending}
            className="staffBtn staffBtnPrimary staffLoginSubmit h-11"
          >
            {pending ? "Creating clinic…" : "Use this address"}
          </button>
        </form>
      ) : null}

      {state.status === "retry" ? (
        <p className="text-sm leading-6 text-staff-ink" role="alert">
          {state.message}
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
          <div
            className="rounded-md border border-staff-line bg-staff-canvas px-3 py-3 text-sm leading-6 text-staff-ink"
            role="status"
          >
            {state.message}
          </div>
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

      <OnboardingAssistance stage={assistanceStage} contactHref={contactHref} />
    </div>
  );
}

async function postProvision(
  path: string,
  body: { token: string; slug?: string },
  signal?: AbortSignal
): Promise<ProvisionBody | null> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  try {
    return (await response.json()) as ProvisionBody;
  } catch {
    return null;
  }
}

function applyProvisionResult(
  data: ProvisionBody,
  setState: (state: VerifyState) => void,
  setSlug: (slug: string) => void
) {
  if (data.status === "provisioned" && data.redirectTo === BILLING_SETUP_PATH) {
    verificationTokenMemory = "";
    window.location.assign(BILLING_SETUP_PATH);
    return;
  }
  if (data.status === "slug_unavailable") {
    const nextSlug = typeof data.slug === "string" ? data.slug : "";
    setSlug(nextSlug);
    setState({
      status: "slug",
      message: data.message ?? REGISTRATION_SLUG_RECOVERY_MESSAGE,
      slug: nextSlug,
    });
    return;
  }
  if (data.status === "expired") {
    setState({
      status: "expired",
      message: data.message ?? REGISTRATION_VERIFY_EXPIRED_MESSAGE,
    });
    return;
  }
  if (data.status === "retry") {
    setState({
      status: "retry",
      message: data.message ?? REGISTRATION_PROVISION_RETRY_MESSAGE,
    });
    return;
  }
  setState({
    status: "invalid",
    message: data.message ?? REGISTRATION_INTENT_INVALID_LINK_MESSAGE,
  });
}
