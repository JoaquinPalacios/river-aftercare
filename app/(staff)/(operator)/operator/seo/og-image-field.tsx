"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  removePlatformSeoOgImageAction,
  uploadPlatformSeoOgImageAction,
  type PlatformSeoOgActionState,
} from "@/app/(staff)/(operator)/operator/seo/actions";
import {
  PLATFORM_SEO_IMAGE_HEIGHT,
  PLATFORM_SEO_IMAGE_WIDTH,
} from "@/lib/platform-assets/platform-seo-image";

const empty: PlatformSeoOgActionState = {};

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
  const [mounted, setMounted] = useState(false);
  const [imageSrc, setImageSrc] = useState(initialImageSrc);
  const [hasImage, setHasImage] = useState(Boolean(imagePath));
  const [uploadState, uploadAction, uploading] = useActionState(
    uploadPlatformSeoOgImageAction,
    empty
  );
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | undefined>();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setImageSrc(initialImageSrc);
    setHasImage(Boolean(imagePath));
  }, [initialImageSrc, imagePath]);

  useEffect(() => {
    if (
      !uploadState.ok ||
      !uploadState.defaultOgImagePath ||
      appliedUploadKey.current === uploadState.defaultOgImagePath
    ) {
      return;
    }
    appliedUploadKey.current = uploadState.defaultOgImagePath;
    setImageSrc(uploadState.imageSrc ?? null);
    setHasImage(true);
    if (fileRef.current) {
      fileRef.current.value = "";
    }
  }, [uploadState]);

  async function removeImage(): Promise<void> {
    setRemoving(true);
    setRemoveError(undefined);
    try {
      const result = await removePlatformSeoOgImageAction(
        empty,
        new FormData()
      );
      if (result.ok) {
        setImageSrc(null);
        setHasImage(false);
        return;
      }
      setRemoveError(
        result.error ?? "Could not update the default social image."
      );
    } finally {
      setRemoving(false);
    }
  }

  const error = uploadState.error ?? removeError;
  const previewSrc = imageSrc;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm font-medium" id="default-og-image-label">
        Default social sharing image
      </p>
      {previewSrc ? (
        // Social image is a same-origin fallback path or the configured assets origin.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewSrc}
          alt="Default social sharing image"
          width={PLATFORM_SEO_IMAGE_WIDTH}
          height={PLATFORM_SEO_IMAGE_HEIGHT}
          className="staffOgPreview"
        />
      ) : (
        <p className="text-sm text-staff-muted">No social image configured.</p>
      )}

      {storageAvailable ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            id="platform-og-file"
            form="platform-og-upload"
            name="ogImage"
            type="file"
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            aria-labelledby="default-og-image-label"
            className="min-w-0 max-w-full text-sm"
          />
          <button
            form="platform-og-upload"
            type="submit"
            disabled={uploading || removing}
            className="staffBtn staffBtnSecondary"
          >
            {uploading
              ? "Uploading…"
              : hasImage
                ? "Replace image"
                : "Upload image"}
          </button>
          {hasImage ? (
            <button
              type="button"
              disabled={uploading || removing}
              className="staffBtn staffBtnQuiet"
              onClick={() => {
                void removeImage();
              }}
            >
              {removing ? "Removing…" : "Remove image"}
            </button>
          ) : null}
        </div>
      ) : null}

      {storageAvailable ? (
        <p className="text-sm text-staff-muted">
          Required size: {PLATFORM_SEO_IMAGE_WIDTH} ×{" "}
          {PLATFORM_SEO_IMAGE_HEIGHT} pixels. PNG, JPEG, or WebP up to 2 MB. SVG
          is not accepted.
        </p>
      ) : (
        <p className="staffLogoUnavailable">
          Social image upload is unavailable because object storage is not
          configured in this environment.
        </p>
      )}

      {uploadState.ok && !error && previewSrc ? (
        <p className="text-sm text-staff-muted" role="status">
          Uploaded
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {mounted && storageAvailable
        ? createPortal(
            <form id="platform-og-upload" action={uploadAction} />,
            document.body
          )
        : null}
    </div>
  );
}
