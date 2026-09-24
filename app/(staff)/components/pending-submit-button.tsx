"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit control for a Server Action form.
 * Idle buttons contain only their label. The spinner is mounted only while
 * this form is submitting.
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
      {pending ? <span className="staffBtnSpinner" aria-hidden="true" /> : null}
      {pending ? pendingLabel : label}
    </button>
  );
}
