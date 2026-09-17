"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import { StaffFileTrigger } from "@/app/(staff)/components/staff-file-trigger";
import { useAssetFileSelection } from "@/app/(staff)/components/use-asset-file-selection";
import {
  removeClinicLogoAction,
  uploadClinicLogoAction,
  type ClinicLogoActionState,
} from "@/app/(staff)/(clinic-portal)/practice/logo-actions";

const empty: ClinicLogoActionState = {};
const ACCEPT =
  "image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg";
const REQUIREMENTS_FORMATS = "SVG, PNG, JPEG or WebP";
const REQUIREMENTS_LIMITS = "Raster max 2 MB · SVG max 1 MB";
const REQUIREMENTS = `${REQUIREMENTS_FORMATS} · ${REQUIREMENTS_LIMITS}`;

export function PracticeLogoField({
  displayName,
  logoUrl,
  logoSrc: initialLogoSrc,
  canEdit,
  storageAvailable,
  onLogoChange,
}: {
  displayName: string;
  logoUrl: string | null;
  logoSrc: string | null;
  canEdit: boolean;
  storageAvailable: boolean;
  onLogoChange: (next: {
    logoUrl: string | null;
    logoSrc: string | null;
  }) => void;
}) {
  const appliedUploadKey = useRef<string | null>(null);
  const seenUploadState = useRef<ClinicLogoActionState>(empty);
  const labelId = useId();
  const helpId = useId();
  const requirementsId = useId();
  const selectedId = useId();
  const errorId = useId();
  const [mounted, setMounted] = useState(false);
  const [logoSrc, setLogoSrc] = useState(initialLogoSrc);
  const [hasLogo, setHasLogo] = useState(Boolean(logoUrl));
  const [success, setSuccess] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [uploadState, uploadAction, uploading] = useActionState(
    uploadClinicLogoAction,
    empty
  );
  const [removing, setRemoving] = useState(false);
  const { fileRef, selectedLabel, hasSelection, clearSelection, onFileChange } =
    useAssetFileSelection();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setLogoSrc(initialLogoSrc);
    setHasLogo(Boolean(logoUrl));
  }, [initialLogoSrc, logoUrl]);

  useEffect(() => {
    if (seenUploadState.current === uploadState) {
      return;
    }
    seenUploadState.current = uploadState;

    if (
      uploadState.ok &&
      uploadState.logoUrl &&
      appliedUploadKey.current !== uploadState.logoUrl
    ) {
      appliedUploadKey.current = uploadState.logoUrl;
      setLogoSrc(uploadState.logoSrc ?? null);
      setHasLogo(true);
      onLogoChange({
        logoUrl: uploadState.logoUrl,
        logoSrc: uploadState.logoSrc ?? null,
      });
      clearSelection();
      setError(undefined);
      setSuccess("Practice logo updated.");
      return;
    }

    if (uploadState.error) {
      setSuccess(undefined);
      setError(uploadState.error);
    }
  }, [uploadState, onLogoChange, clearSelection]);

  async function removeLogo(): Promise<void> {
    setRemoving(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const data = new FormData();
      data.set("intent", "remove-logo");
      const result = await removeClinicLogoAction(empty, data);
      if (result.ok) {
        setLogoSrc(null);
        setHasLogo(false);
        onLogoChange({ logoUrl: null, logoSrc: null });
        clearSelection();
        setSuccess("Practice logo removed.");
        return;
      }
      setError(result.error ?? "Could not update the clinic logo.");
    } finally {
      setRemoving(false);
    }
  }

  const previewSrc = logoSrc;
  const busy = uploading || removing;
  const previewAlt = `Current ${displayName || "Practice"} logo`;
  const chooseLabel = hasLogo ? "Choose replacement" : "Choose logo";
  const describedBy = [
    helpId,
    requirementsId,
    hasSelection ? selectedId : null,
    error ? errorId : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className="staffAssetControl"
      role="group"
      aria-labelledby={labelId}
      aria-busy={busy || undefined}
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium" id={labelId}>
          Practice logo
        </p>
        <p className="text-sm text-staff-muted" id={helpId}>
          Shown on your patient aftercare site.
        </p>
      </div>

      {previewSrc ? (
        // Clinic mark is a same-origin path or the configured assets origin.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewSrc} alt={previewAlt} className="staffLogoPreview" />
      ) : (
        <div className="staffLogoPreviewEmpty" id={requirementsId}>
          <p className="text-sm text-staff-muted">{REQUIREMENTS_FORMATS}</p>
          <p className="text-sm text-staff-muted">{REQUIREMENTS_LIMITS}</p>
        </div>
      )}

      {previewSrc ? (
        <p className="text-sm text-staff-muted" id={requirementsId}>
          {REQUIREMENTS}
        </p>
      ) : null}

      <input type="hidden" name="logoUrl" value={logoUrl ?? ""} />

      {storageAvailable && canEdit ? (
        <div className="flex min-w-0 flex-col gap-3">
          {hasSelection ? (
            <p
              className="text-sm text-staff-ink"
              id={selectedId}
              aria-live="polite"
            >
              {selectedLabel}
            </p>
          ) : null}

          <div className="staffAssetActions">
            <StaffFileTrigger
              inputRef={fileRef}
              id="clinic-logo-file"
              form="clinic-logo-upload"
              name="logo"
              accept={ACCEPT}
              disabled={busy}
              ariaLabel={chooseLabel}
              ariaDescribedBy={describedBy}
              ariaInvalid={Boolean(error)}
              pending={hasSelection}
              buttonLabel={chooseLabel}
              onChange={(event) => {
                setSuccess(undefined);
                setError(undefined);
                void onFileChange(event);
              }}
            />

            {hasSelection ? (
              <>
                <button
                  form="clinic-logo-upload"
                  type="submit"
                  disabled={busy}
                  className="staffBtn staffBtnPrimary"
                >
                  {uploading
                    ? "Uploading…"
                    : hasLogo
                      ? "Upload replacement"
                      : "Upload logo"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="staffBtn staffBtnQuiet"
                  onClick={() => {
                    clearSelection();
                    setError(undefined);
                    setSuccess(undefined);
                  }}
                >
                  Cancel
                </button>
              </>
            ) : hasLogo ? (
              <button
                type="button"
                disabled={busy}
                className="staffBtn staffBtnQuiet"
                onClick={() => setConfirmRemove(true)}
              >
                {removing ? "Removing…" : "Remove logo"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!storageAvailable ? (
        <p className="staffLogoUnavailable">
          Logo upload is unavailable because clinic object storage is not
          configured in this environment.
        </p>
      ) : null}

      {success && !error ? (
        <p className="text-sm text-staff-muted" role="status">
          {success}
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-red-600" id={errorId} role="alert">
          {error}
        </p>
      ) : null}

      {canEdit && (hasLogo || confirmRemove) ? (
        <ConfirmDialog
          open={confirmRemove}
          title="Remove practice logo?"
          description="The patient aftercare site will fall back to the practice name and default presentation."
          cancelLabel="Keep logo"
          confirmLabel={removing ? "Removing…" : "Remove logo"}
          confirmTone="danger"
          onCancel={() => setConfirmRemove(false)}
          onConfirm={() => {
            setConfirmRemove(false);
            void removeLogo();
          }}
        />
      ) : null}

      {mounted && storageAvailable && canEdit
        ? createPortal(
            <form id="clinic-logo-upload" action={uploadAction} />,
            document.body
          )
        : null}
    </div>
  );
}
