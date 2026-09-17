"use client";

import type { ChangeEvent, RefObject } from "react";

export function StaffFileTrigger({
  inputRef,
  id,
  form,
  name,
  accept,
  disabled,
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid,
  pending,
  buttonLabel,
  onChange,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  id: string;
  form: string;
  name: string;
  accept: string;
  disabled: boolean;
  ariaLabel: string;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  pending: boolean;
  buttonLabel: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className={pending ? "staffFileTriggerPending" : "staffFileTrigger"}>
      <input
        ref={inputRef}
        id={id}
        form={form}
        name={name}
        type="file"
        accept={accept}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid ? "true" : undefined}
        className="staffFileInput"
        onChange={onChange}
      />
      {pending ? null : (
        <span className="staffBtn staffBtnSecondary">{buttonLabel}</span>
      )}
    </label>
  );
}
