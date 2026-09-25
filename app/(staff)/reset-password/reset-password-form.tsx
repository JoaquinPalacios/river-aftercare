"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { PasswordVisibilityField } from "@/app/(staff)/components/password-visibility-field";
import { readPasswordResetTokenFromHash } from "@/lib/auth/account-token-format";
import {
  NEW_PASSWORD_MIN_MESSAGE,
  PASSWORD_RESET_INVALID_LINK_MESSAGE,
  newPasswordFieldErrors,
} from "@/lib/auth/password-policy";

const PENDING_STATUS = "Updating password. Please wait.";

export function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
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
    setToken(readPasswordResetTokenFromHash(window.location.hash));
    setReady(true);
  }, []);

  const invalidLink = ready && !token;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || !token) {
      return;
    }

    const fieldErrors = newPasswordFieldErrors(newPassword, confirmPassword);
    if (fieldErrors.newPassword || fieldErrors.confirmPassword) {
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    submittingRef.current = true;
    setIsSubmitting(true);

    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            newPassword,
            confirmPassword,
          }),
        });

        if (response.ok) {
          window.history.replaceState(null, "", "/login?reset=success");
          router.replace("/login?reset=success");
          router.refresh();
          return;
        }

        let errorMessage = PASSWORD_RESET_INVALID_LINK_MESSAGE;
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
            errorMessage = data.fieldErrors.newPassword;
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
          errorMessage = data.error || PASSWORD_RESET_INVALID_LINK_MESSAGE;
        } catch {
          errorMessage = PASSWORD_RESET_INVALID_LINK_MESSAGE;
        }

        submittingRef.current = false;
        setIsSubmitting(false);
        setErrors({ form: errorMessage });
      } catch {
        submittingRef.current = false;
        setIsSubmitting(false);
        setErrors({
          form: "Unable to reset your password right now. Try again.",
        });
      }
    });
  }

  if (!ready) {
    return (
      <p className="text-sm text-staff-muted" role="status">
        Loading reset form…
      </p>
    );
  }

  if (invalidLink || errors.form === PASSWORD_RESET_INVALID_LINK_MESSAGE) {
    return (
      <div className="flex flex-col gap-4">
        <div className="staffFormAlert" role="alert">
          {PASSWORD_RESET_INVALID_LINK_MESSAGE}
        </div>
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-staff-brand"
        >
          Request a new reset link
        </Link>
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
        id="reset-password-pending-status"
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
          <p id="new-password-error" className="staffFieldError">
            {errors.newPassword}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          className="text-sm font-medium text-staff-ink"
          htmlFor="confirm-password"
        >
          Confirm new password
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
          <p id="confirm-password-error" className="staffFieldError">
            {errors.confirmPassword}
          </p>
        ) : null}
      </div>

      {errors.form ? (
        <div className="staffFormAlert" role="alert">
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
        {pending ? "Updating…" : "Reset password"}
      </button>
    </form>
  );
}
