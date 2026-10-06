"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function ConfirmDialog({
  open,
  title,
  description,
  cancelLabel,
  confirmLabel,
  confirmTone = "danger",
  cancelTone = "quiet",
  actionLayout = "end",
  pending = false,
  pendingLabel,
  pendingStatus,
  confirmDisabled = false,
  alternateLabel,
  onAlternate,
  children,
  className,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  confirmTone?: "danger" | "primary";
  cancelTone?: "quiet" | "secondary";
  actionLayout?: "end" | "balanced";
  pending?: boolean;
  pendingLabel?: string;
  pendingStatus?: string;
  confirmDisabled?: boolean;
  alternateLabel?: string;
  onAlternate?: () => void;
  children?: ReactNode;
  className?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const pendingRef = useRef(pending);
  const confirmLockedRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const [confirmLocked, setConfirmLocked] = useState(false);
  const busy = pending || confirmLocked;
  const confirmText = busy && pendingLabel ? pendingLabel : confirmLabel;

  function unlockConfirm() {
    confirmLockedRef.current = false;
    setConfirmLocked(false);
  }

  useEffect(() => {
    if (!open) {
      unlockConfirm();
    }
  }, [open]);

  useEffect(() => {
    if (pendingRef.current && !pending) {
      unlockConfirm();
    }
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open) {
      restoreRef.current = document.activeElement as HTMLElement | null;
      if (!dialog.open) {
        dialog.showModal();
      }
      return;
    }

    if (dialog.open) {
      dialog.close();
    }
    restoreRef.current?.focus();
  }, [open, busy]);

  function requestClose() {
    if (busy) {
      return;
    }
    onCancel();
  }

  function handleConfirmClick() {
    if (busy || confirmDisabled || confirmLockedRef.current) {
      return;
    }
    if (pendingLabel !== undefined) {
      confirmLockedRef.current = true;
      setConfirmLocked(true);
    }
    onConfirm();
  }

  return (
    <dialog
      ref={dialogRef}
      className={className ? `staffDialog ${className}` : "staffDialog"}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={busy || undefined}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClose={() => {
        if (open && !busy) {
          onCancel();
        }
      }}
    >
      <div className="staffDialogHeader">
        <h2 id={titleId} className="staffDialogTitle">
          {title}
        </h2>
      </div>
      <p id={descriptionId} className="staffDialogBody">
        {description}
      </p>
      {children}
      <div className="sr-only" role="status" aria-live="polite">
        {busy ? (pendingStatus ?? "") : ""}
      </div>
      <div
        className={
          actionLayout === "balanced"
            ? "staffDialogActions staffDialogActionsBalanced"
            : "staffDialogActions"
        }
      >
        <button
          type="button"
          className={`staffBtn ${
            cancelTone === "secondary" ? "staffBtnSecondary" : "staffBtnQuiet"
          }`}
          autoFocus={(confirmTone === "danger" || confirmDisabled) && !busy}
          disabled={busy}
          onClick={requestClose}
        >
          {cancelLabel}
        </button>
        {alternateLabel && onAlternate ? (
          <button
            type="button"
            className="staffBtn staffBtnSecondary"
            disabled={busy}
            onClick={onAlternate}
          >
            {alternateLabel}
          </button>
        ) : null}
        <button
          type="button"
          className={`staffBtn ${
            confirmTone === "primary" ? "staffBtnPrimary" : "staffBtnDanger"
          }${pendingLabel !== undefined ? " staffLoginSubmit" : ""}`}
          autoFocus={confirmTone === "primary" && !confirmDisabled && !busy}
          disabled={busy || confirmDisabled}
          aria-busy={busy || undefined}
          onClick={handleConfirmClick}
        >
          {busy ? (
            <span className="staffLoginSpinner" aria-hidden="true" />
          ) : null}
          {confirmText}
        </button>
      </div>
    </dialog>
  );
}
