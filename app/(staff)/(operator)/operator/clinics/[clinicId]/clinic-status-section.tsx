"use client";

import { useActionState, useRef, useState } from "react";

import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import {
  archiveOperatorClinicAction,
  setOperatorClinicActiveAction,
  unarchiveOperatorClinicAction,
  type ClinicStatusActionState,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/clinic-lifecycle-actions";
import { PermanentDeletionConfirmFields } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/permanent-deletion-confirm-fields";

const initialState: ClinicStatusActionState = {};

const ARCHIVE_DESCRIPTION =
  "Archiving closes the clinic and removes it from normal operational views. Its data is preserved and it can later be unarchived.";

const ARCHIVE_UNARCHIVE_NOTE =
  "An unarchived clinic returns as Inactive and must be explicitly reactivated.";

export function ClinicStatusSection({
  clinicId,
  lifecycle,
  clinicName,
  deactivatedLabel,
  archivedLabel,
}: {
  clinicId: string;
  lifecycle: "active" | "inactive" | "archived";
  clinicName: string;
  deactivatedLabel: string | null;
  archivedLabel: string | null;
}) {
  const [statusState, statusAction, statusPending] = useActionState(
    setOperatorClinicActiveAction,
    initialState
  );
  const [archiveState, archiveAction, archivePending] = useActionState(
    lifecycle === "archived"
      ? unarchiveOperatorClinicAction
      : archiveOperatorClinicAction,
    initialState
  );
  const [statusOpen, setStatusOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const statusFormRef = useRef<HTMLFormElement>(null);
  const archiveFormRef = useRef<HTMLFormElement>(null);
  const inactive = lifecycle === "inactive";
  const archived = lifecycle === "archived";
  const confirmed = confirmation.trim() === clinicName;
  const statusLabel = archived ? "Archived" : inactive ? "Inactive" : "Active";

  return (
    <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
      <h2 className="text-base font-semibold">Clinic status</h2>
      <p className="mt-3 text-sm">Status: {statusLabel}</p>
      {inactive && deactivatedLabel ? (
        <p className="mt-1 text-sm text-staff-muted">
          Deactivated {deactivatedLabel}
        </p>
      ) : null}
      {archived && archivedLabel ? (
        <p className="mt-1 text-sm text-staff-muted">
          Archived {archivedLabel}
        </p>
      ) : null}
      {archived ? (
        <p className="mt-3 max-w-2xl text-sm text-staff-muted">
          This clinic is in long-term storage. Its data is preserved. Unarchive
          returns it to Inactive. Reactivate is a separate step after that.
          Archive does not call Stripe.
        </p>
      ) : (
        <p className="mt-3 max-w-2xl text-sm text-staff-muted">
          Deactivating a clinic stops patient pages and clinic staff access. It
          does not cancel Stripe, change the subscription, or delete sites,
          locations, or guides. Billing continues until you use the existing
          billing controls.
        </p>
      )}
      {archived ? null : (
        <form ref={statusFormRef} action={statusAction} className="mt-4">
          <input type="hidden" name="clinicId" value={clinicId} />
          <input
            type="hidden"
            name="active"
            value={inactive ? "true" : "false"}
          />
          <button
            type="button"
            className="staffBtn staffBtnSecondary"
            onClick={() => setStatusOpen(true)}
          >
            {inactive ? "Reactivate clinic" : "Deactivate clinic"}
          </button>
          {statusState.error ? (
            <p className="mt-2 text-sm text-red-700" role="alert">
              {statusState.error}
            </p>
          ) : null}
          {statusState.success ? (
            <p className="mt-2 text-sm text-staff-muted" role="status">
              {statusState.success}
            </p>
          ) : null}
          <ConfirmDialog
            open={statusOpen}
            title={
              inactive ? "Reactivate this clinic?" : "Deactivate this clinic?"
            }
            description={
              inactive
                ? "Patient pages and clinic staff access follow the clinic's current sites and billing status. Invitations revoked during deactivation stay revoked. This does not change Stripe."
                : "Patient pages stop resolving and clinic staff cannot use the portal. Sites, locations, guides, memberships, and Stripe stay as they are. Billing continues until you use the existing billing controls. You can reactivate this clinic later."
            }
            cancelLabel="Cancel"
            confirmLabel={inactive ? "Reactivate clinic" : "Deactivate clinic"}
            confirmTone={inactive ? "primary" : "danger"}
            pending={statusPending}
            onCancel={() => setStatusOpen(false)}
            onConfirm={() => {
              setStatusOpen(false);
              statusFormRef.current?.requestSubmit();
            }}
          />
        </form>
      )}
      <form ref={archiveFormRef} action={archiveAction} className="mt-4">
        <input type="hidden" name="clinicId" value={clinicId} />
        {archived ? null : (
          <input type="hidden" name="confirmation" value={confirmation} />
        )}
        <button
          type="button"
          className="staffBtn staffBtnSecondary"
          onClick={() => setArchiveOpen(true)}
        >
          {archived ? "Unarchive clinic" : "Archive clinic"}
        </button>
        {archiveState.error ? (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {archiveState.error}
          </p>
        ) : null}
        {archiveState.success ? (
          <p className="mt-2 text-sm text-staff-muted" role="status">
            {archiveState.success}
          </p>
        ) : null}
        <ConfirmDialog
          open={archiveOpen}
          className={archived ? undefined : "permanentDeleteDialog"}
          title={archived ? "Unarchive this clinic?" : "Archive this clinic?"}
          description={
            archived
              ? "Unarchive returns this clinic to Inactive. Patient pages stay unavailable until you reactivate it. Invitations, sites, locations, guides, billing, and entitlements stay as they are. This does not call Stripe."
              : ARCHIVE_DESCRIPTION
          }
          cancelLabel="Cancel"
          confirmLabel={archived ? "Unarchive clinic" : "Archive clinic"}
          confirmTone={archived ? "primary" : "danger"}
          pending={archivePending}
          confirmDisabled={archived ? false : !confirmed}
          onCancel={() => setArchiveOpen(false)}
          onConfirm={() => {
            setArchiveOpen(false);
            archiveFormRef.current?.requestSubmit();
          }}
        >
          {archived ? null : (
            <>
              <p>{ARCHIVE_UNARCHIVE_NOTE}</p>
              {lifecycle === "active" ? (
                <p>
                  Archiving an active clinic also makes it inactive. Billing may
                  continue until you use the existing billing controls. This
                  does not call Stripe.
                </p>
              ) : (
                <p>
                  This clinic is already inactive. Archiving keeps that state
                  and preserves its data. This does not call Stripe or change
                  billing.
                </p>
              )}
              <PermanentDeletionConfirmFields
                clinicName={clinicName}
                confirmation={confirmation}
                onConfirmationChange={setConfirmation}
              />
            </>
          )}
        </ConfirmDialog>
      </form>
    </section>
  );
}
