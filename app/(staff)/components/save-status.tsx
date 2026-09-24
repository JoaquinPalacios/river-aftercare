"use client";

import { useEffect, useRef, useState } from "react";

import {
  formSaveStatusLabel,
  type FormSaveStatus,
} from "@/lib/clinic-portal/form-save-status";

/** How long a successful save confirmation stays visible. */
export const SAVED_CONFIRMATION_MS = 2500;

export function SaveStatus({
  status,
  error,
  success,
  confirmSaved = false,
}: {
  status: FormSaveStatus;
  error?: string;
  success?: string;
  /** Show "Saved" only after a save finishes, then hide it. */
  confirmSaved?: boolean;
}) {
  const [live, setLive] = useState("");
  const [savedVisible, setSavedVisible] = useState(false);
  const seenSaving = useRef(false);

  useEffect(() => {
    if (status === "saving") {
      seenSaving.current = true;
      setLive("Saving");
      return;
    }

    if (status === "saved" && seenSaving.current) {
      setLive("Saved");
    }
  }, [status]);

  useEffect(() => {
    if (!confirmSaved) {
      return;
    }

    const completedSave = status === "saved" && seenSaving.current;
    if (!completedSave && !success) {
      setSavedVisible(false);
      return;
    }

    if (status === "saving" || status === "unsaved") {
      setSavedVisible(false);
      return;
    }

    setSavedVisible(true);
    const timeout = window.setTimeout(() => {
      setSavedVisible(false);
      setLive("");
    }, SAVED_CONFIRMATION_MS);
    return () => window.clearTimeout(timeout);
  }, [confirmSaved, status, success]);

  const showSaved = confirmSaved ? savedVisible && status === "saved" : true;
  const visibleStatus: FormSaveStatus | null =
    status === "saving" || status === "unsaved"
      ? status
      : showSaved
        ? "saved"
        : null;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {visibleStatus ? (
        <p className="text-sm text-staff-muted" data-save-state={visibleStatus}>
          {formSaveStatusLabel(visibleStatus)}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
      {error ? (
        <p className="text-sm text-red-600" role="alert" tabIndex={-1}>
          {error}
        </p>
      ) : null}
      {success && !error && (!confirmSaved || savedVisible) ? (
        <p className="text-sm text-staff-muted" role="status">
          {success}
        </p>
      ) : null}
    </div>
  );
}
