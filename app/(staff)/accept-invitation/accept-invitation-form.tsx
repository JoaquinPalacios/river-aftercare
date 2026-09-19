"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { PasswordVisibilityField } from "@/app/(staff)/components/password-visibility-field";
import { acceptInvitationSchema } from "@/app/(staff)/account/security/password-form-schema";
import { readAccountTokenFromHash } from "@/lib/auth/account-token-format";
import {
  INVITATION_INVALID_LINK_GUIDANCE,
  INVITATION_INVALID_LINK_MESSAGE,
  NEW_PASSWORD_MIN_MESSAGE,
} from "@/lib/auth/password-policy";

const PENDING_STATUS = "Setting up your account. Please wait.";
const CHECKING_STATUS = "Checking invitation…";

type InvitationView = "CHECKING" | "VALID" | "INVALID";

export function AcceptInvitationForm() {
  const router = useRouter();
  const [view, setView] = useState<InvitationView>("CHECKING");
  const [token, setToken] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{
    newPassword?: string;
    confirmPassword?: string;
    form?: string;
  }>({});
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
        const response = await fetch("/api/auth/invitation-status", {
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

    const parsed = acceptInvitationSchema.safeParse({
      newPassword,
      confirmPassword,
    });
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrors({
        newPassword: fieldErrors.newPassword?.[0],
        confirmPassword: fieldErrors.confirmPassword?.[0],
      });
      return;
    }

    setErrors({});
    submittingRef.current = true;
    setIsSubmitting(true);

    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/accept-invitation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            newPassword: parsed.data.newPassword,
            confirmPassword: parsed.data.confirmPassword,
          }),
        });

        if (response.ok) {
          window.history.replaceState(null, "", "/login?invite=success");
          router.replace("/login?invite=success");
          router.refresh();
          return;
        }

        let errorMessage = INVITATION_INVALID_LINK_MESSAGE;
        try {
          const data = (await response.json()) as {
            error?: string;
            fieldErrors?: {
              newPassword?: string;
              confirmPassword?: string;
              token?: string;
            };
          };
          if (response.status === 400 && data.fieldErrors?.newPassword) {
            setErrors({
              newPassword: data.fieldErrors.newPassword,
              confirmPassword: data.fieldErrors.confirmPassword,
            });
            submittingRef.current = false;
            setIsSubmitting(false);
            return;
          }
          if (response.status === 400 && data.fieldErrors?.confirmPassword) {
            setErrors({ confirmPassword: data.fieldErrors.confirmPassword });
            submittingRef.current = false;
            setIsSubmitting(false);
            return;
          }
          errorMessage = data.error || INVITATION_INVALID_LINK_MESSAGE;
        } catch {
          errorMessage = INVITATION_INVALID_LINK_MESSAGE;
        }

        submittingRef.current = false;
        setIsSubmitting(false);
        if (errorMessage === INVITATION_INVALID_LINK_MESSAGE) {
          setView("INVALID");
          return;
        }
        setErrors({ form: errorMessage });
      } catch {
        submittingRef.current = false;
        setIsSubmitting(false);
        setErrors({
          form: "Unable to set up your account right now. Try again.",
        });
      }
    });
  }

  if (view === "CHECKING") {
    return (
      <p className="text-center text-sm text-staff-muted" role="status">
        {CHECKING_STATUS}
      </p>
    );
  }

  if (view === "INVALID" || errors.form === INVITATION_INVALID_LINK_MESSAGE) {
    return (
      <div className="flex flex-col gap-4">
        <div
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {INVITATION_INVALID_LINK_MESSAGE}
        </div>
        <p className="text-sm text-staff-muted">
          {INVITATION_INVALID_LINK_GUIDANCE}
        </p>
      </div>
    );
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
        id="accept-invitation-pending-status"
        className="sr-only"
        role="status"
        aria-live="polite"
      >
        {pending ? PENDING_STATUS : ""}
      </div>

      <div className="flex flex-col gap-2">
        <label
          className="text-sm font-medium text-staff-ink"
          htmlFor="new-password"
        >
          New password
        </label>
        <PasswordVisibilityField
          id="new-password"
          name="newPassword"
          autoComplete="new-password"
          value={newPassword}
          onChange={(value) => {
            if (submittingRef.current) {
              return;
            }
            setNewPassword(value);
            setErrors((current) => ({
              ...current,
              newPassword: undefined,
              form: undefined,
            }));
          }}
          invalid={Boolean(errors.newPassword)}
          errorId={errors.newPassword ? "new-password-error" : undefined}
          describedBy="new-password-hint"
          disabled={pending}
        />
        <p id="new-password-hint" className="text-sm text-staff-muted">
          {NEW_PASSWORD_MIN_MESSAGE}
        </p>
        {errors.newPassword ? (
          <p id="new-password-error" className="text-sm text-red-600">
            {errors.newPassword}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          className="text-sm font-medium text-staff-ink"
          htmlFor="confirm-password"
        >
          Confirm password
        </label>
        <PasswordVisibilityField
          id="confirm-password"
          name="confirmPassword"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(value) => {
            if (submittingRef.current) {
              return;
            }
            setConfirmPassword(value);
            setErrors((current) => ({
              ...current,
              confirmPassword: undefined,
              form: undefined,
            }));
          }}
          invalid={Boolean(errors.confirmPassword)}
          errorId={
            errors.confirmPassword ? "confirm-password-error" : undefined
          }
          disabled={pending}
        />
        {errors.confirmPassword ? (
          <p id="confirm-password-error" className="text-sm text-red-600">
            {errors.confirmPassword}
          </p>
        ) : null}
      </div>

      {errors.form ? (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {errors.form}
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
        {pending ? "Setting up…" : "Create password"}
      </button>
    </form>
  );
}
