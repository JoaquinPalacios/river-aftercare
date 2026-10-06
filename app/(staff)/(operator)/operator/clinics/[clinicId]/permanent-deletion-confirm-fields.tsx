"use client";

import { useEffect, useId, useRef, useState } from "react";

import { CopyIcon } from "@/app/(staff)/components/icons";

export function PermanentDeletionConfirmFields({
  clinicName,
  confirmation,
  onConfirmationChange,
}: {
  clinicName: string;
  confirmation: string;
  onConfirmationChange: (value: string) => void;
}) {
  const inputId = useId();
  const instructionId = useId();
  const resetTimer = useRef<number | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );

  useEffect(() => {
    return () => {
      if (resetTimer.current != null) {
        window.clearTimeout(resetTimer.current);
      }
    };
  }, []);

  async function copyClinicName() {
    try {
      if (!navigator.clipboard?.writeText) {
        setCopyState("failed");
      } else {
        await navigator.clipboard.writeText(clinicName);
        setCopyState("copied");
      }
    } catch {
      setCopyState("failed");
    }
    if (resetTimer.current != null) {
      window.clearTimeout(resetTimer.current);
    }
    resetTimer.current = window.setTimeout(() => setCopyState("idle"), 2000);
  }

  const feedback =
    copyState === "copied"
      ? "Copied"
      : copyState === "failed"
        ? "Copy unavailable. Type the clinic name instead."
        : "";

  return (
    <div className="permanentDeleteConfirm">
      <p id={instructionId} className="permanentDeleteInstruction">
        Type {clinicName} to confirm
      </p>
      <div className="permanentDeleteCopy">
        <button
          type="button"
          className="permanentDeleteCopyName"
          aria-label="Copy clinic name"
          onClick={() => {
            void copyClinicName();
          }}
        >
          {clinicName}
        </button>
        <button
          type="button"
          className="permanentDeleteCopyIcon"
          aria-label="Copy clinic name"
          onClick={() => {
            void copyClinicName();
          }}
        >
          <CopyIcon />
        </button>
        <span className="permanentDeleteCopied" aria-live="polite">
          {feedback}
        </span>
      </div>
      <label className="permanentDeleteField" htmlFor={inputId}>
        <span className="sr-only">Clinic name</span>
        <input
          id={inputId}
          className="h-11 w-full rounded-md border border-staff-line bg-staff-panel px-3 text-sm"
          value={confirmation}
          onChange={(event) => onConfirmationChange(event.target.value)}
          autoComplete="off"
          aria-describedby={instructionId}
        />
      </label>
    </div>
  );
}
