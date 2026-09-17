"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { createPortal } from "react-dom";

import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import {
  removePlatformSeoOgImageAction,
  uploadPlatformSeoOgImageAction,
  type PlatformSeoOgActionState,
} from "@/app/(staff)/(operator)/operator/seo/actions";
import { formatSelectedOgFileLabel } from "@/app/(staff)/(operator)/operator/seo/og-image-selection";
import { rasterImageSize } from "@/lib/platform-assets/image-size";
import {
  PLATFORM_SEO_IMAGE_HEIGHT,
  PLATFORM_SEO_IMAGE_WIDTH,
} from "@/lib/platform-assets/platform-seo-image";

const empty: PlatformSeoOgActionState = {};
const REQUIREMENTS = "1200 × 630 · PNG, JPEG or WebP · max 2 MB";
const ACCEPT = "image/png,image/jpeg,image/webp";

export function DefaultOgImageField({
  imagePath,
  imageSrc: initialImageSrc,
  storageAvailable,
}: {
  imagePath: string | null;
  imageSrc: string | null;
  storageAvailable: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const appliedUploadKey = useRef<string | null>(null);
  const seenUploadState = useRef<PlatformSeoOgActionState>(empty);
  const selectionRead = useRef(0);
  const labelId = useId();
  const helpId = useId();
  const requirementsId = useId();
  const selectedId = useId();
  const errorId = useId();
  const [mounted, setMounted] = useState(false);
  const [imageSrc, setImageSrc] = useState(initialImageSrc);
  const [hasImage, setHasImage] = useState(Boolean(imagePath));
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [uploadState, uploadAction, uploading] = useActionState(
    uploadPlatformSeoOgImageAction,
    empty
  );
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setImageSrc(initialImageSrc);
    setHasImage(Boolean(imagePath));
  }, [initialImageSrc, imagePath]);

  useEffect(() => {
    if (seenUploadState.current === uploadState) {
      return;
    }
    seenUploadState.current = uploadState;

    if (
      uploadState.ok &&
      uploadState.defaultOgImagePath &&
      appliedUploadKey.current !== uploadState.defaultOgImagePath
    ) {
      appliedUploadKey.current = uploadState.defaultOgImagePath;
      setImageSrc(uploadState.imageSrc ?? null);
      setHasImage(true);
      clearSelection();
      setError(undefined);
      setSuccess("Default social sharing image updated.");
      return;
    }

    if (uploadState.error) {
      setSuccess(undefined);
      setError(uploadState.error);
    }
  }, [uploadState]);

  function clearSelection(): void {
    selectionRead.current += 1;
    setSelectedName(null);
    setSelectedLabel(null);
    if (fileRef.current) {
      fileRef.current.value = "";
    }
  }

  async function onFileChange(
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const file = event.target.files?.[0];
    setSuccess(undefined);
    setError(undefined);
    if (!file) {
      clearSelection();
      return;
    }

    const readId = selectionRead.current + 1;
    selectionRead.current = readId;
    setSelectedName(file.name);
    setSelectedLabel(
      formatSelectedOgFileLabel({
        name: file.name,
        byteLength: file.size,
        width: null,
        height: null,
      })
    );

    const size = rasterImageSize(new Uint8Array(await file.arrayBuffer()));
    if (selectionRead.current !== readId) {
      return;
    }
    setSelectedLabel(
      formatSelectedOgFileLabel({
        name: file.name,
        byteLength: file.size,
        width: size?.width ?? null,
        height: size?.height ?? null,
      })
    );
  }

  async function removeImage(): Promise<void> {
    setRemoving(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const result = await removePlatformSeoOgImageAction(
        empty,
        new FormData()
      );
      if (result.ok) {
        setImageSrc(null);
        setHasImage(false);
        clearSelection();
        setSuccess("Default social sharing image removed.");
        return;
      }
      setError(result.error ?? "Could not update the default social image.");
    } finally {
      setRemoving(false);
    }
  }

  const previewSrc = imageSrc;
  const busy = uploading || removing;
  const hasSelection = Boolean(selectedName);
  const chooseLabel = hasImage ? "Choose replacement" : "Choose image";
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
      className="staffOgAsset"
      role="group"
      aria-labelledby={labelId}
      aria-busy={busy || undefined}
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium" id={labelId}>
          Default social sharing image
        </p>
        <p className="text-sm text-staff-muted" id={helpId}>
          Used when a page does not have its own social image.
        </p>
      </div>

      {previewSrc ? (
        // Social image is a same-origin fallback path or the configured assets origin.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewSrc}
          alt="Configured default social sharing image"
          width={PLATFORM_SEO_IMAGE_WIDTH}
          height={PLATFORM_SEO_IMAGE_HEIGHT}
          className="staffOgPreview"
        />
      ) : (
        <div className="staffOgPreviewEmpty">
          <p className="text-sm font-medium">Social sharing image</p>
          <p className="text-sm text-staff-muted" id={requirementsId}>
            {REQUIREMENTS}
          </p>
        </div>
      )}

      {previewSrc ? (
        <div className="flex flex-col gap-0.5" id={requirementsId}>
          <p className="text-sm text-staff-muted">
            Recommended: {PLATFORM_SEO_IMAGE_WIDTH} ×{" "}
            {PLATFORM_SEO_IMAGE_HEIGHT} · PNG, JPEG or WebP
          </p>
          <p className="text-sm text-staff-muted">Max 2 MB</p>
        </div>
      ) : null}

      {storageAvailable ? (
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

          <div className="staffOgActions">
            <label
              className={
                hasSelection ? "staffFileTriggerPending" : "staffFileTrigger"
              }
            >
              <input
                ref={fileRef}
                id="platform-og-file"
                form="platform-og-upload"
                name="ogImage"
                type="file"
                accept={ACCEPT}
                disabled={busy}
                aria-label={chooseLabel}
                aria-describedby={describedBy}
                className="staffFileInput"
                onChange={(event) => {
                  void onFileChange(event);
                }}
              />
              {hasSelection ? null : (
                <span className="staffBtn staffBtnSecondary">
                  {chooseLabel}
                </span>
              )}
            </label>

            {hasSelection ? (
              <>
                <button
                  form="platform-og-upload"
                  type="submit"
                  disabled={busy}
                  className="staffBtn staffBtnPrimary"
                >
                  {uploading
                    ? "Uploading…"
                    : hasImage
                      ? "Upload replacement"
                      : "Upload image"}
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
            ) : hasImage ? (
              <button
                type="button"
                disabled={busy}
                className="staffBtn staffBtnQuiet"
                onClick={() => setConfirmRemove(true)}
              >
                {removing ? "Removing…" : "Remove image"}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="staffLogoUnavailable">
          Social image upload is unavailable because object storage is not
          configured in this environment.
        </p>
      )}

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

      <ConfirmDialog
        open={confirmRemove}
        title="Remove default social image?"
        description="This removes the configured default social sharing image. Page-level social image overrides are not affected."
        cancelLabel="Keep image"
        confirmLabel={removing ? "Removing…" : "Remove image"}
        confirmTone="danger"
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          void removeImage();
        }}
      />

      {mounted && storageAvailable
        ? createPortal(
            <form id="platform-og-upload" action={uploadAction} />,
            document.body
          )
        : null}
    </div>
  );
}
