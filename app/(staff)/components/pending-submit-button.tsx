"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit control for a Server Action form.
 * The idle and pending labels share one grid cell so the button width stays
 * put, and a same-size spinner slot stays reserved.
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
      <span
        className="staffBtnSpinner"
        data-visible={pending ? "true" : "false"}
        aria-hidden="true"
      />
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
