"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { PasswordVisibilityField } from "@/app/(staff)/components/password-visibility-field";
import {
  changePasswordAction,
  type ChangePasswordActionState,
} from "@/app/(staff)/account/security/actions";
import {
  NEW_PASSWORD_MIN_MESSAGE,
  PASSWORD_UPDATED_MESSAGE,
} from "@/lib/auth/password-policy";

const initial: ChangePasswordActionState = {};
const PENDING_STATUS = "Updating password. Please wait.";

export function ChangePasswordForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    changePasswordAction,
    initial
  );
  const submittingRef = useRef(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localErrors, setLocalErrors] = useState<
    ChangePasswordActionState["fieldErrors"]
  >({});

  useEffect(() => {
    submittingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    if (state.saved) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setLocalErrors({});
    }
  }, [state.saved]);

  useEffect(() => {
    if (state.signedOut) {
      router.replace("/login");
      router.refresh();
    }
  }, [router, state.signedOut]);

  const fieldErrors = {
    ...state.fieldErrors,
    ...localErrors,
  };

  return (
    <form
      action={action}
      className="flex max-w-md flex-col gap-5"
      noValidate
      aria-busy={pending || undefined}
    >
      <div className="sr-only" role="status" aria-live="polite">
        {pending ? PENDING_STATUS : ""}
      </div>

      <div className="flex flex-col gap-2">
        <label
          className="text-sm font-medium text-staff-ink"
          htmlFor="current-password"
        >
          Current password
        </label>
        <PasswordVisibilityField
          id="current-password"
          name="currentPassword"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(value) => {
            if (submittingRef.current) {
              return;
            }
            setCurrentPassword(value);
            setLocalErrors((current) => ({
              ...current,
              currentPassword: undefined,
            }));
          }}
          invalid={Boolean(fieldErrors?.currentPassword)}
          errorId={
            fieldErrors?.currentPassword ? "current-password-error" : undefined
          }
          disabled={pending}
        />
        {fieldErrors?.currentPassword ? (
          <p id="current-password-error" className="text-sm text-red-600">
            {fieldErrors.currentPassword}
          </p>
        ) : null}
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
            setLocalErrors((current) => ({
              ...current,
              newPassword: undefined,
            }));
          }}
          invalid={Boolean(fieldErrors?.newPassword)}
          errorId={fieldErrors?.newPassword ? "new-password-error" : undefined}
          describedBy="new-password-hint"
          disabled={pending}
        />
        <p id="new-password-hint" className="text-sm text-staff-muted">
          {NEW_PASSWORD_MIN_MESSAGE}
        </p>
        {fieldErrors?.newPassword ? (
          <p id="new-password-error" className="text-sm text-red-600">
            {fieldErrors.newPassword}
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
            setLocalErrors((current) => ({
              ...current,
              confirmPassword: undefined,
            }));
          }}
          invalid={Boolean(fieldErrors?.confirmPassword)}
          errorId={
            fieldErrors?.confirmPassword ? "confirm-password-error" : undefined
          }
          disabled={pending}
        />
        {fieldErrors?.confirmPassword ? (
          <p id="confirm-password-error" className="text-sm text-red-600">
            {fieldErrors.confirmPassword}
          </p>
        ) : null}
      </div>

      {state.saved ? (
        <div
          className="rounded-md border border-staff-line bg-staff-canvas px-3 py-2 text-sm text-staff-ink"
          role="status"
        >
          {PASSWORD_UPDATED_MESSAGE}
        </div>
      ) : null}

      {state.error && !state.saved ? (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {state.error}
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
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
