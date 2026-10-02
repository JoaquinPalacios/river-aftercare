"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

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
  onCancel,
  onConfirm,
  dialogClassName,
  layoutClassName,
  scrollRegionClassName,
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
  onCancel: () => void;
  onConfirm: () => void;
  dialogClassName?: string;
  layoutClassName?: string;
  scrollRegionClassName?: string;
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

  const descriptionNode = (
    <p id={descriptionId} className="staffDialogBody">
      {description}
    </p>
  );
  const details = scrollRegionClassName ? (
    <div className={scrollRegionClassName}>
      {descriptionNode}
      {children}
    </div>
  ) : (
    <>
      {descriptionNode}
      {children}
    </>
  );

  return (
    <dialog
      ref={dialogRef}
      className={
        dialogClassName ? `staffDialog ${dialogClassName}` : "staffDialog"
      }
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={busy || undefined}
      onKeyDown={keepFocusInDialog}
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
      <DialogFrame className={layoutClassName}>
        <div className="staffDialogHeader">
          <h2 id={titleId} className="staffDialogTitle">
            {title}
          </h2>
        </div>
        {details}
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
      </DialogFrame>
    </dialog>
  );
}

function keepFocusInDialog(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") {
    return;
  }
  const dialog = event.currentTarget;
  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      "a[href], button, input, select, textarea"
    )
  ).filter(
    (element) => !element.hasAttribute("disabled") && element.tabIndex >= 0
  );
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  const inside = active instanceof Node && dialog.contains(active);
  if (
    event.shiftKey ? !inside || active === first : !inside || active === last
  ) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}

function DialogFrame({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  if (!className) {
    return children;
  }
  return <div className={className}>{children}</div>;
}
