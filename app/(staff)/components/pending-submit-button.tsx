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
  form,
}: {
  label: string;
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
  /** Associates the control with a form when it is rendered outside that form. */
  form?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      form={form}
      className={["staffPendingSubmit", className].filter(Boolean).join(" ")}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
    >
      {pending ? <span className="staffBtnSpinner" aria-hidden="true" /> : null}
      {pending ? pendingLabel : label}
    </button>
  );
}
