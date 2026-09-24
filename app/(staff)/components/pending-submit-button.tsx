"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit control for a Server Action form.
 * The idle and pending labels share one grid cell so the button width stays
 * put. An inert slot keeps that width while idle. The animated spinner is
 * mounted only while this form is submitting.
 */
export function PendingSubmitButton({
  label,
  pendingLabel,
  className,
  disabled = false,
}: {
  label: string;
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={["staffPendingSubmit", className].filter(Boolean).join(" ")}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
    >
      {pending ? (
        <span className="staffBtnSpinner" aria-hidden="true" />
      ) : (
        <span className="staffBtnSpinnerSlot" aria-hidden="true" />
      )}
      <span className="staffPendingLabels">
        <span
          data-active={pending ? "false" : "true"}
          aria-hidden={pending || undefined}
        >
          {label}
        </span>
        <span
          data-active={pending ? "true" : "false"}
          aria-hidden={pending ? undefined : true}
        >
          {pendingLabel}
        </span>
      </span>
    </button>
  );
}
