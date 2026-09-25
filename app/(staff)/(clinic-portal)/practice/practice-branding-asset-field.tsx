"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import { StaffFileTrigger } from "@/app/(staff)/components/staff-file-trigger";
import { useAssetFileSelection } from "@/app/(staff)/components/use-asset-file-selection";

export interface BrandingAssetActionState {
  error?: string;
  storedUrl?: string | null;
  previewSrc?: string | null;
  ok?: boolean;
}

export interface PracticeBrandingAssetCopy {
  label: string;
  help: string;
  formats: string;
  limits: string;
  noun: string;
  chooseNew: string;
  chooseReplace: string;
  uploadNew: string;
  uploadReplace: string;
  remove: string;
  keep: string;
  successUpload: string;
  successRemove: string;
  confirmTitle: string;
  confirmDescription: string;
  unavailable: string;
  currentCaption: string;
  selectedCaption: string;
  emptyChoice: string;
  previewClassName?: string;
}

const emptyState: BrandingAssetActionState = {};

export function PracticeBrandingAssetField({
  copy,
  storedUrl,
  previewSrc: initialPreviewSrc,
  hiddenName,
  fileInputId,
  formId,
  fileFieldName,
  accept,
  canEdit,
  storageAvailable,
  previewName,
  uploadAction,
  removeAction,
  readUpload,
  onAssetChange,
  siteId,
}: {
  copy: PracticeBrandingAssetCopy;
  storedUrl: string | null;
  previewSrc: string | null;
  hiddenName: string;
  fileInputId: string;
  formId: string;
  fileFieldName: string;
  accept: string;
  canEdit: boolean;
  storageAvailable: boolean;
  previewName?: string;
  uploadAction: (
    previous: never,
    formData: FormData
  ) => Promise<unknown> | unknown;
  removeAction: (
    previous: never,
    formData: FormData
  ) => Promise<unknown> | unknown;
  readUpload: (state: unknown) => BrandingAssetActionState;
  onAssetChange: (next: {
    storedUrl: string | null;
    previewSrc: string | null;
  }) => void;
  siteId?: string;
}) {
  const appliedUploadKey = useRef<string | null>(null);
  const seenUploadState = useRef<unknown>(emptyState);
  const labelId = useId();
  const helpId = useId();
  const requirementsId = useId();
  const selectedId = useId();
  const errorId = useId();
  const [mounted, setMounted] = useState(false);
  const [previewSrc, setPreviewSrc] = useState(initialPreviewSrc);
  const [hasAsset, setHasAsset] = useState(Boolean(storedUrl));
  const [success, setSuccess] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [previewBroken, setPreviewBroken] = useState(false);
  const [uploadState, boundUpload, uploading] = useActionState(
    uploadAction as (
      previous: BrandingAssetActionState,
      formData: FormData
    ) => Promise<BrandingAssetActionState> | BrandingAssetActionState,
    emptyState
  );
  const [removing, setRemoving] = useState(false);
  const {
    fileRef,
    selectedLabel,
    selectedPreviewSrc,
    hasSelection,
    clearSelection,
    onFileChange,
  } = useAssetFileSelection();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setPreviewSrc(initialPreviewSrc);
    setHasAsset(Boolean(storedUrl));
  }, [initialPreviewSrc, storedUrl]);

  useEffect(() => {
    setPreviewBroken(false);
  }, [selectedPreviewSrc]);

  useEffect(() => {
    if (seenUploadState.current === uploadState) {
      return;
    }
    seenUploadState.current = uploadState;
    const next = readUpload(uploadState);

    if (
      next.ok &&
      next.storedUrl &&
      appliedUploadKey.current !== next.storedUrl
    ) {
      appliedUploadKey.current = next.storedUrl;
      setPreviewSrc(next.previewSrc ?? null);
      setHasAsset(true);
      onAssetChange({
        storedUrl: next.storedUrl,
        previewSrc: next.previewSrc ?? null,
      });
      clearSelection();
      setError(undefined);
      setSuccess(copy.successUpload);
      return;
    }

    if (next.error) {
      setSuccess(undefined);
      setError(next.error);
    }
  }, [
    uploadState,
    onAssetChange,
    clearSelection,
    copy.successUpload,
    readUpload,
  ]);

  async function removeAsset(): Promise<void> {
    setRemoving(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const data = new FormData();
      data.set("intent", `remove-${hiddenName}`);
      if (siteId) {
        data.set("siteId", siteId);
      }
      const result = readUpload(await removeAction(emptyState as never, data));
      if (result.ok) {
        setPreviewSrc(null);
        setHasAsset(false);
        onAssetChange({ storedUrl: null, previewSrc: null });
        clearSelection();
        setSuccess(copy.successRemove);
        return;
      }
      setError(result.error ?? copy.unavailable);
    } finally {
      setRemoving(false);
    }
  }

  const busy = uploading || removing;
  const namedAsset = previewName || copy.noun;
  const previewAlt = `Current ${namedAsset}`;
  const selectedPreviewAlt = hasAsset
    ? `Selected replacement for the ${namedAsset}`
    : `Selected ${namedAsset}`;
  const chooseLabel = hasAsset ? copy.chooseReplace : copy.chooseNew;
  const comparing = hasAsset && hasSelection;
  const showSelectedPreview = Boolean(selectedPreviewSrc) && !previewBroken;
  const previewClass = copy.previewClassName ?? "staffLogoPreview";
  const requirements = `${copy.formats} · ${copy.limits}`;
  const selectedCaption = selectedLabel ? (
    <p className="text-sm text-staff-ink" id={selectedId} aria-live="polite">
      {selectedLabel}
    </p>
  ) : null;
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
          {copy.label}
        </p>
        <p className="text-sm text-staff-muted" id={helpId}>
          {copy.help}
        </p>
      </div>

      {comparing ? (
        <div className="staffLogoCompare">
          <div className="staffLogoCompareSlot">
            <p className="staffLogoCompareLabel">{copy.currentCaption}</p>
            {previewSrc ? (
              <AssetPreview
                src={previewSrc}
                alt={previewAlt}
                className={previewClass}
              />
            ) : (
              <div className="staffLogoPreviewEmpty" />
            )}
          </div>
          <span className="staffLogoCompareArrow" aria-hidden="true">
            <span className="staffLogoCompareArrowMobile">↓</span>
            <span className="staffLogoCompareArrowDesktop">→</span>
          </span>
          <div className="staffLogoCompareSlot staffLogoCompareSlotSelected">
            <p className="staffLogoCompareLabel">{copy.selectedCaption}</p>
            {showSelectedPreview && selectedPreviewSrc ? (
              <AssetPreview
                src={selectedPreviewSrc}
                alt={selectedPreviewAlt}
                className={previewClass}
                onError={() => setPreviewBroken(true)}
              />
            ) : (
              <div className="staffLogoPreviewEmpty" />
            )}
            {selectedCaption}
          </div>
        </div>
      ) : previewSrc ? (
        <AssetPreview
          src={previewSrc}
          alt={previewAlt}
          className={previewClass}
        />
      ) : showSelectedPreview && selectedPreviewSrc ? (
        <AssetPreview
          src={selectedPreviewSrc}
          alt={selectedPreviewAlt}
          className={previewClass}
          onError={() => setPreviewBroken(true)}
        />
      ) : (
        <div className="staffLogoPreviewEmpty" id={requirementsId}>
          <p className="text-sm text-staff-muted">{copy.formats}</p>
          <p className="text-sm text-staff-muted">{copy.limits}</p>
        </div>
      )}

      {previewSrc || comparing || showSelectedPreview ? (
        <p className="text-sm text-staff-muted" id={requirementsId}>
          {requirements}
        </p>
      ) : null}

      <input type="hidden" name={hiddenName} value={storedUrl ?? ""} />

      {storageAvailable && canEdit ? (
        <div className="flex min-w-0 flex-col gap-3">
          {hasSelection && !comparing ? selectedCaption : null}

          <div className="staffAssetActions">
            <StaffFileTrigger
              inputRef={fileRef}
              id={fileInputId}
              form={formId}
              name={fileFieldName}
              accept={accept}
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
                  form={formId}
                  type="submit"
                  disabled={busy}
                  className="staffBtn staffBtnPrimary"
                >
                  {uploading
                    ? "Uploading…"
                    : hasAsset
                      ? copy.uploadReplace
                      : copy.uploadNew}
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
            ) : hasAsset ? (
              <button
                type="button"
                disabled={busy}
                className="staffBtn staffBtnQuiet"
                onClick={() => setConfirmRemove(true)}
              >
                {removing ? "Removing…" : copy.remove}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!storageAvailable ? (
        <p className="staffLogoUnavailable">{copy.unavailable}</p>
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

      {canEdit && (hasAsset || confirmRemove) ? (
        <ConfirmDialog
          open={confirmRemove}
          title={copy.confirmTitle}
          description={copy.confirmDescription}
          cancelLabel={copy.keep}
          confirmLabel={removing ? "Removing…" : copy.remove}
          confirmTone="danger"
          onCancel={() => setConfirmRemove(false)}
          onConfirm={() => {
            setConfirmRemove(false);
            void removeAsset();
          }}
        />
      ) : null}

      {mounted && storageAvailable && canEdit
        ? createPortal(
            <form id={formId} action={boundUpload}>
              {siteId ? (
                <input type="hidden" name="siteId" value={siteId} />
              ) : null}
            </form>,
            document.body
          )
        : null}
    </div>
  );
}

function AssetPreview({
  src,
  alt,
  className,
  onError,
}: {
  src: string;
  alt: string;
  className: string;
  onError?: () => void;
}) {
  return (
    // Clinic mark is a same-origin path, configured assets origin, or a local object URL.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} onError={onError} />
  );
}
