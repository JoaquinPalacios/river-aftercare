"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  cancelPendingEmailChangeAction,
  updateProfileAction,
  type UpdateProfileActionState,
} from "@/app/(staff)/account/actions";
import { PasswordVisibilityField } from "@/app/(staff)/components/password-visibility-field";
import {
  EMAIL_VERIFICATION_SENT_MESSAGE,
  PROFILE_CURRENT_PASSWORD_HINT,
  PROFILE_UPDATED_MESSAGE,
} from "@/lib/auth/account-profile-schema";

const initial: UpdateProfileActionState = {};
const PENDING_STATUS = "Saving profile. Please wait.";

export function UpdateProfileForm({
  name,
  email,
  pendingEmail = null,
}: {
  name: string;
  email: string;
  pendingEmail?: string | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(updateProfileAction, initial);
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelPendingEmailChangeAction,
    initial
  );
  const submittingRef = useRef(false);
  const [nameValue, setNameValue] = useState(name);
  const [emailValue, setEmailValue] = useState(email);
  const [shownPendingEmail, setShownPendingEmail] = useState(pendingEmail);
  const [currentPassword, setCurrentPassword] = useState("");
  const [localErrors, setLocalErrors] = useState<
    UpdateProfileActionState["fieldErrors"]
  >({});

  useEffect(() => {
    submittingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    setShownPendingEmail(pendingEmail);
  }, [pendingEmail]);

  useEffect(() => {
    if (!state.saved) {
      return;
    }
    setCurrentPassword("");
    setLocalErrors({});
    if (state.emailChanged) {
      setEmailValue(email);
      setShownPendingEmail(state.pendingEmail ?? null);
    }
    router.refresh();
  }, [router, state.saved, state.emailChanged, state.pendingEmail, email]);

  useEffect(() => {
    if (!cancelState.cancelled) {
      return;
    }
    setCurrentPassword("");
    setLocalErrors({});
    setEmailValue(email);
    setShownPendingEmail(null);
    router.refresh();
  }, [router, cancelState.cancelled, email]);

  const fieldErrors = {
    ...state.fieldErrors,
    ...localErrors,
  };

  const successMessage = state.emailChanged
    ? EMAIL_VERIFICATION_SENT_MESSAGE
    : PROFILE_UPDATED_MESSAGE;

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
          htmlFor="profile-name"
        >
          Name
        </label>
        <input
          id="profile-name"
          name="name"
          type="text"
          autoComplete="name"
          value={nameValue}
          disabled={pending}
          aria-invalid={Boolean(fieldErrors?.name) || undefined}
          aria-describedby={
            fieldErrors?.name ? "profile-name-error" : undefined
          }
          className="staffField"
          onChange={(event) => {
            if (submittingRef.current) {
              return;
            }
            setNameValue(event.target.value);
            setLocalErrors((current) => ({ ...current, name: undefined }));
          }}
        />
        {fieldErrors?.name ? (
          <p id="profile-name-error" className="text-sm text-red-600">
            {fieldErrors.name}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          className="text-sm font-medium text-staff-ink"
          htmlFor="profile-email"
        >
          Email
        </label>
        <input
          id="profile-email"
          name="email"
          type="email"
          autoComplete="email"
          value={emailValue}
          disabled={pending}
          aria-invalid={Boolean(fieldErrors?.email) || undefined}
          aria-describedby={
            fieldErrors?.email ? "profile-email-error" : "profile-email-hint"
          }
          className="staffField"
          onChange={(event) => {
            if (submittingRef.current) {
              return;
            }
            setEmailValue(event.target.value);
            setLocalErrors((current) => ({ ...current, email: undefined }));
          }}
        />
        <p id="profile-email-hint" className="text-sm text-staff-muted">
          Changing email sends a confirmation to the new address. Sign-in keeps
          using this address until you confirm.
        </p>
        {fieldErrors?.email ? (
          <p id="profile-email-error" className="text-sm text-red-600">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      {shownPendingEmail ? (
        <div
          className="rounded-md border border-staff-line bg-staff-canvas px-3 py-2 text-sm text-staff-ink"
          role="status"
          data-testid="pending-email-verification"
        >
          <p>
            Confirmation sent to <strong>{shownPendingEmail}</strong>. Your
            current email stays active until you confirm.
          </p>
          <button
            type="submit"
            formAction={cancelAction}
            disabled={cancelPending || pending}
            className="staffBtn staffBtnQuiet mt-3 h-11 w-fit"
          >
            {cancelPending ? "Cancelling…" : "Cancel pending change"}
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <label
          className="text-sm font-medium text-staff-ink"
          htmlFor="profile-current-password"
        >
          Current password
        </label>
        <PasswordVisibilityField
          id="profile-current-password"
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
            fieldErrors?.currentPassword
              ? "profile-current-password-error"
              : undefined
          }
          describedBy="profile-current-password-hint"
          disabled={pending}
        />
        <p
          id="profile-current-password-hint"
          className="text-sm text-staff-muted"
        >
          {PROFILE_CURRENT_PASSWORD_HINT}
        </p>
        {fieldErrors?.currentPassword ? (
          <p
            id="profile-current-password-error"
            className="text-sm text-red-600"
          >
            {fieldErrors.currentPassword}
          </p>
        ) : null}
      </div>

      {state.saved ? (
        <div
          className="rounded-md border border-staff-line bg-staff-canvas px-3 py-2 text-sm text-staff-ink"
          role="status"
        >
          {successMessage}
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
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
