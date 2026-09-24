"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";

import {
  deleteGuideAction,
  discardGuideDraftChangesAction,
  unpublishGuideAction,
  type GuideActionState,
} from "@/app/(staff)/(clinic-portal)/guides/actions";
import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import { OverflowMenu } from "@/app/(staff)/components/overflow-menu";
import type {
  ClinicGuideLifecycleStatus,
  GuideDestructiveAction,
} from "@/lib/clinic-portal/guide-status";
import type { ComposedGuideSection } from "@/lib/aftercare/types";

const empty: GuideActionState = {};

export function GuideLifecycleActions({
  guideId,
  lifecycle,
  destructiveAction,
  canUnpublish = false,
  unpublishPlacement = "menu",
  unpublishDisabled = false,
  onDiscarded,
}: {
  guideId: string;
  lifecycle?: ClinicGuideLifecycleStatus;
  destructiveAction: GuideDestructiveAction | null;
  canUnpublish?: boolean;
  /** Toolbar shows Unpublish beside the other editor actions. Menu keeps it under More actions. */
  unpublishPlacement?: "menu" | "toolbar";
  unpublishDisabled?: boolean;
  onDiscarded?: (restored: {
    title: string;
    publicSlug: string;
    introduction: string;
    sections: ComposedGuideSection[];
  }) => void;
}) {
  const router = useRouter();
  const reactId = useId().replace(/:/g, "");
  const deleteFormId = `delete-guide-${reactId}`;
  const discardFormId = `discard-draft-${reactId}`;
  const unpublishFormId = `unpublish-guide-${reactId}`;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [deleteState, deleteAction] = useActionState(deleteGuideAction, empty);
  const [discardState, discardAction, discarding] = useActionState(
    discardGuideDraftChangesAction,
    empty
  );
  const [unpublishState, unpublishAction, unpublishing] = useActionState(
    unpublishGuideAction,
    empty
  );

  useEffect(() => {
    if (discardState.ok) {
      setDiscardOpen(false);
      if (discardState.restored) {
        onDiscarded?.(discardState.restored);
      }
      router.refresh();
    }
  }, [discardState, onDiscarded, router]);

  useEffect(() => {
    if (unpublishState.ok) {
      setUnpublishOpen(false);
      router.refresh();
    }
  }, [unpublishState, router]);

  const error = deleteState.error ?? discardState.error ?? unpublishState.error;
  const unpublishedDelete = lifecycle === "unpublished";
  const deleteTitle = "Delete this guide?";
  const deleteDescription = unpublishedDelete
    ? "This guide is unpublished. Deleting it will permanently remove the clinic guide and its saved history. The patient URL is already unavailable."
    : "This guide has never been published. Deleting it will permanently remove the clinic guide.";

  if (!destructiveAction && !canUnpublish) {
    return error ? (
      <p className="text-sm text-red-600" role="alert">
        {error}
      </p>
    ) : null;
  }

  const unpublishInToolbar = canUnpublish && unpublishPlacement === "toolbar";
  const unpublishInMenu = canUnpublish && !unpublishInToolbar;
  const showMenu = Boolean(destructiveAction) || unpublishInMenu;

  return (
    <>
      {unpublishInToolbar ? (
        <button
          type="button"
          className="staffBtn staffBtnSecondary"
          disabled={unpublishing || unpublishDisabled}
          aria-busy={unpublishing || undefined}
          onClick={() => setUnpublishOpen(true)}
        >
          {unpublishing ? "Unpublishing…" : "Unpublish"}
        </button>
      ) : null}
      {showMenu ? (
        <OverflowMenu label="More actions">
          {destructiveAction === "delete_guide" ? (
            <button
              type="button"
              role="menuitem"
              className="staffOverflowItem staffOverflowItemDanger"
              onClick={() => setDeleteOpen(true)}
            >
              Delete guide
            </button>
          ) : null}
          {destructiveAction === "discard_draft_changes" ? (
            <button
              type="button"
              role="menuitem"
              className="staffOverflowItem staffOverflowItemDanger"
              onClick={() => setDiscardOpen(true)}
            >
              Discard draft changes
            </button>
          ) : null}
          {unpublishInMenu ? (
            <button
              type="button"
              role="menuitem"
              className="staffOverflowItem"
              onClick={() => setUnpublishOpen(true)}
            >
              Unpublish guide
            </button>
          ) : null}
        </OverflowMenu>
      ) : null}

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <form id={deleteFormId} action={deleteAction} className="hidden">
        <input type="hidden" name="guideId" value={guideId} />
      </form>
      <form id={discardFormId} action={discardAction} className="hidden">
        <input type="hidden" name="guideId" value={guideId} />
      </form>
      <form id={unpublishFormId} action={unpublishAction} className="hidden">
        <input type="hidden" name="guideId" value={guideId} />
      </form>

      <ConfirmDialog
        open={deleteOpen}
        title={deleteTitle}
        description={deleteDescription}
        cancelLabel="Cancel"
        confirmLabel="Delete guide"
        confirmTone="danger"
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false);
          const form = document.getElementById(
            deleteFormId
          ) as HTMLFormElement | null;
          form?.requestSubmit();
        }}
      />
      <ConfirmDialog
        open={discardOpen}
        title="Discard draft changes?"
        description="Patients will continue seeing the currently published version."
        cancelLabel="Keep editing"
        confirmLabel={discarding ? "Discarding…" : "Discard changes"}
        confirmTone="danger"
        onCancel={() => setDiscardOpen(false)}
        onConfirm={() => {
          const form = document.getElementById(
            discardFormId
          ) as HTMLFormElement | null;
          form?.requestSubmit();
        }}
      />
      <ConfirmDialog
        open={unpublishOpen}
        title="Unpublish this guide?"
        description="Patients using the current public link will no longer be able to open this guide until it is published again."
        cancelLabel="Cancel"
        confirmLabel={unpublishing ? "Unpublishing…" : "Unpublish guide"}
        confirmTone="primary"
        onCancel={() => setUnpublishOpen(false)}
        onConfirm={() => {
          const form = document.getElementById(
            unpublishFormId
          ) as HTMLFormElement | null;
          form?.requestSubmit();
        }}
      />
    </>
  );
}
