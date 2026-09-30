"use client";

import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";

export function UnsavedChangesDialog({
  open,
  pending = false,
  canSave = true,
  saveDisabledReason,
  onStay,
  onLeave,
  onSave,
}: {
  open: boolean;
  pending?: boolean;
  canSave?: boolean;
  saveDisabledReason?: string;
  onStay: () => void;
  onLeave: () => void;
  onSave: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      title="Save changes before leaving?"
      description="You have unsaved changes. Save them before leaving this page?"
      cancelLabel="Stay"
      confirmLabel="Save and leave"
      confirmTone="primary"
      alternateLabel="Leave without saving"
      pending={pending}
      pendingLabel="Saving…"
      pendingStatus="Saving your changes. Please wait."
      confirmDisabled={!canSave}
      onCancel={onStay}
      onAlternate={onLeave}
      onConfirm={onSave}
    >
      {!canSave && saveDisabledReason ? (
        <p className="staffDialogNote">{saveDisabledReason}</p>
      ) : null}
    </ConfirmDialog>
  );
}
