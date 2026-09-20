"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { readAccountTokenFromHash } from "@/lib/auth/account-token-format";
import {
  EMAIL_CHANGE_INVALID_LINK_GUIDANCE,
  EMAIL_CHANGE_INVALID_LINK_MESSAGE,
} from "@/lib/auth/account-profile-schema";

const CHECKING_STATUS = "Checking confirmation link…";
const PENDING_STATUS = "Confirming email. Please wait.";

type ConfirmView = "CHECKING" | "VALID" | "INVALID";

export function ConfirmEmailChangeForm() {
  const router = useRouter();
  const [view, setView] = useState<ConfirmView>("CHECKING");
  const [token, setToken] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [formError, setFormError] = useState<string | undefined>();
  const pending = isSubmitting || isPending;

  useEffect(() => {
    const rawToken = readAccountTokenFromHash(window.location.hash);
    if (!rawToken) {
      setToken(null);
      setView("INVALID");
      return;
    }

    setToken(rawToken);
    let cancelled = false;

    async function validateToken(currentToken: string) {
      try {
        const response = await fetch("/api/auth/email-change-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: currentToken }),
        });
        const data = (await response.json()) as { valid?: boolean };
        if (cancelled) {
          return;
        }
        setView(response.ok && data.valid === true ? "VALID" : "INVALID");
      } catch {
        if (!cancelled) {
          setView("INVALID");
        }
      }
    }

    void validateToken(rawToken);

    return () => {
      cancelled = true;
    };
  }, []);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || !token) {
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setFormError(undefined);

    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/confirm-email-change", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = (await response.json()) as {
          error?: string;
          signedIn?: boolean;
        };

        if (response.ok) {
          window.history.replaceState(null, "", "/login?email=updated");
          if (data.signedIn) {
            router.replace("/account?email=updated");
          } else {
            router.replace("/login?email=updated");
          }
          router.refresh();
          return;
        }

        setFormError(data.error || EMAIL_CHANGE_INVALID_LINK_MESSAGE);
        if (data.error === EMAIL_CHANGE_INVALID_LINK_MESSAGE) {
          setView("INVALID");
        }
      } catch {
        setFormError(EMAIL_CHANGE_INVALID_LINK_MESSAGE);
        setView("INVALID");
      } finally {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    });
  }

  if (view === "CHECKING") {
    return (
      <p className="text-sm text-staff-muted" role="status">
        {CHECKING_STATUS}
      </p>
    );
  }

  if (view === "INVALID") {
    return (
      <div className="flex flex-col gap-3" role="alert">
        <p className="text-sm text-red-700">
          {EMAIL_CHANGE_INVALID_LINK_MESSAGE}
        </p>
        <p className="text-sm text-staff-muted">
          {EMAIL_CHANGE_INVALID_LINK_GUIDANCE}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5"
      noValidate
      aria-busy={pending || undefined}
    >
      <div className="sr-only" role="status" aria-live="polite">
        {pending ? PENDING_STATUS : ""}
      </div>
      {formError ? (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {formError}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="staffBtn staffBtnPrimary staffLoginSubmit h-11 w-fit"
      >
        {pending ? (
          <span className="staffLoginSpinner" aria-hidden="true" />
        ) : null}
        {pending ? "Confirming…" : "Confirm email change"}
      </button>
    </form>
  );
}
