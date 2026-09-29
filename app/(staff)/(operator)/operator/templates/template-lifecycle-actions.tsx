"use client";

import { useActionState, useState, type MouseEvent } from "react";

import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import { OverflowMenu } from "@/app/(staff)/components/overflow-menu";
import {
  abandonCanonicalTemplateDraftAction,
  createCanonicalTemplateDraftAction,
  deactivateCanonicalTemplateAction,
  reactivateCanonicalTemplateAction,
  type CanonicalTemplateActionState,
} from "@/app/(staff)/(operator)/operator/templates/actions";

const initial: CanonicalTemplateActionState = {};

export function TemplateLifecycleActions({
  templateId,
  draftId,
  neverPublished,
  isActive,
  canCreateRevision,
  presentation = "buttons",
}: {
  templateId: string;
  draftId: string | null;
  neverPublished: boolean;
  isActive: boolean;
  canCreateRevision: boolean;
  presentation?: "buttons" | "menu";
}) {
  const [createState, createAction, creating] = useActionState(
    createCanonicalTemplateDraftAction,
    initial
  );
  const [abandonState, abandonAction, abandoning] = useActionState(
    abandonCanonicalTemplateDraftAction,
    initial
  );
  const [deactivateState, deactivateAction, deactivating] = useActionState(
    deactivateCanonicalTemplateAction,
    initial
  );
  const [reactivateState, reactivateAction, reactivating] = useActionState(
    reactivateCanonicalTemplateAction,
    initial
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const error =
    createState.error ??
    abandonState.error ??
    deactivateState.error ??
    reactivateState.error;

  function closeMenu(event: MouseEvent<HTMLButtonElement>) {
    const popover = event.currentTarget.closest("[popover]");
    if (popover && "hidePopover" in popover) {
      (popover as HTMLElement & { hidePopover: () => void }).hidePopover();
    }
  }

  const menu = (
    <OverflowMenu label="More actions">
      {canCreateRevision ? (
        <button
          type="button"
          role="menuitem"
          className="staffOverflowItem"
          onClick={(event) => {
            closeMenu(event);
            setCreateOpen(true);
          }}
        >
          Create new revision
        </button>
      ) : null}
      {draftId ? (
        <button
          type="button"
          role="menuitem"
          className="staffOverflowItem staffOverflowItemDanger"
          onClick={(event) => {
            closeMenu(event);
            setAbandonOpen(true);
          }}
        >
          Abandon draft
        </button>
      ) : null}
      {isActive ? (
        <button
          type="button"
          role="menuitem"
          className="staffOverflowItem staffOverflowItemDanger"
          onClick={(event) => {
            closeMenu(event);
            setDeactivateOpen(true);
          }}
        >
          Deactivate
        </button>
      ) : (
        <button
          type="button"
          role="menuitem"
          className="staffOverflowItem"
          onClick={(event) => {
            closeMenu(event);
            setReactivateOpen(true);
          }}
        >
          Reactivate
        </button>
      )}
    </OverflowMenu>
  );

  return (
    <div className="flex flex-col gap-3">
      {presentation === "menu" ? (
        menu
      ) : (
        <div className="flex flex-wrap gap-2">
          {canCreateRevision ? (
            <button
              type="button"
              className="staffBtn staffBtnPrimary"
              onClick={() => setCreateOpen(true)}
            >
              Create new revision
            </button>
          ) : null}
          {draftId ? (
            <button
              type="button"
              className="staffBtn staffBtnSecondary"
              onClick={() => setAbandonOpen(true)}
            >
              Abandon draft
            </button>
          ) : null}
          {isActive ? (
            <button
              type="button"
              className="staffBtn staffBtnSecondary"
              onClick={() => setDeactivateOpen(true)}
            >
              Deactivate
            </button>
          ) : (
            <button
              type="button"
              className="staffBtn staffBtnPrimary"
              onClick={() => setReactivateOpen(true)}
            >
              Reactivate
            </button>
          )}
        </div>
      )}
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <form id="create-revision-form" action={createAction} className="hidden">
        <input type="hidden" name="templateId" value={templateId} />
      </form>
      <form id="abandon-draft-form" action={abandonAction} className="hidden">
        <input type="hidden" name="templateId" value={templateId} />
        <input type="hidden" name="revisionId" value={draftId ?? ""} />
      </form>
      <form
        id="deactivate-template-form"
        action={deactivateAction}
        className="hidden"
      >
        <input type="hidden" name="templateId" value={templateId} />
      </form>
      <form
        id="reactivate-template-form"
        action={reactivateAction}
        className="hidden"
      >
        <input type="hidden" name="templateId" value={templateId} />
      </form>
      <ConfirmDialog
        open={createOpen}
        title="Create a new revision?"
        description="This opens one draft from the latest published revision. Review evidence is not copied. The published revision stays unchanged."
        cancelLabel="Cancel"
        confirmLabel="Create new revision"
        confirmTone="primary"
        pending={creating}
        pendingLabel="Creating…"
        onCancel={() => setCreateOpen(false)}
        onConfirm={() => {
          const form = document.getElementById(
            "create-revision-form"
          ) as HTMLFormElement | null;
          form?.requestSubmit();
        }}
      />
      <ConfirmDialog
        open={abandonOpen}
        title="Abandon this draft?"
        description={
          neverPublished
            ? "This template has never been published. Abandoning the draft also removes the template. Published revisions are never deleted."
            : "Only this draft is removed. Published revisions stay available to clinics that already use them."
        }
        cancelLabel="Keep draft"
        confirmLabel="Abandon draft"
        confirmTone="danger"
        cancelTone="secondary"
        actionLayout="balanced"
        pending={abandoning}
        pendingLabel="Removing…"
        onCancel={() => setAbandonOpen(false)}
        onConfirm={() => {
          const form = document.getElementById(
            "abandon-draft-form"
          ) as HTMLFormElement | null;
          form?.requestSubmit();
        }}
      />
      <ConfirmDialog
        open={deactivateOpen}
        title="Deactivate this template?"
        description="The template will stop appearing for new clinic adoption. Existing clinic guides and patient pages are not changed."
        cancelLabel="Cancel"
        confirmLabel="Deactivate"
        confirmTone="danger"
        pending={deactivating}
        pendingLabel="Deactivating…"
        onCancel={() => setDeactivateOpen(false)}
        onConfirm={() => {
          const form = document.getElementById(
            "deactivate-template-form"
          ) as HTMLFormElement | null;
          form?.requestSubmit();
        }}
      />
      <ConfirmDialog
        open={reactivateOpen}
        title="Reactivate this template?"
        description="Eligible clinics can discover the latest published revision again. Existing clinic pins are not changed."
        cancelLabel="Cancel"
        confirmLabel="Reactivate"
        confirmTone="primary"
        pending={reactivating}
        pendingLabel="Reactivating…"
        onCancel={() => setReactivateOpen(false)}
        onConfirm={() => {
          const form = document.getElementById(
            "reactivate-template-form"
          ) as HTMLFormElement | null;
          form?.requestSubmit();
        }}
      />
    </div>
  );
}
