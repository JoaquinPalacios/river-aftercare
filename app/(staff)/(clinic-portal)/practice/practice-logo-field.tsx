"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  removeClinicLogoAction,
  uploadClinicLogoAction,
  type ClinicLogoActionState,
} from "@/app/(staff)/(clinic-portal)/practice/logo-actions";

const empty: ClinicLogoActionState = {};

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
  const fileRef = useRef<HTMLInputElement>(null);
  const appliedUploadKey = useRef<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [logoSrc, setLogoSrc] = useState(initialLogoSrc);
  const [uploadState, uploadAction, uploading] = useActionState(
    uploadClinicLogoAction,
    empty
  );
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | undefined>();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setLogoSrc(initialLogoSrc);
  }, [initialLogoSrc]);

  useEffect(() => {
    if (
      !uploadState.ok ||
      !uploadState.logoUrl ||
      appliedUploadKey.current === uploadState.logoUrl
    ) {
      return;
    }
    appliedUploadKey.current = uploadState.logoUrl;
    setLogoSrc(uploadState.logoSrc ?? null);
    onLogoChange({
      logoUrl: uploadState.logoUrl,
      logoSrc: uploadState.logoSrc ?? null,
    });
    if (fileRef.current) {
      fileRef.current.value = "";
    }
  }, [uploadState, onLogoChange]);

  async function removeLogo(): Promise<void> {
    setRemoving(true);
    setRemoveError(undefined);
    try {
      const data = new FormData();
      data.set("intent", "remove-logo");
      const result = await removeClinicLogoAction(empty, data);
      if (result.ok) {
        setLogoSrc(null);
        onLogoChange({ logoUrl: null, logoSrc: null });
        return;
      }
      setRemoveError(result.error ?? "Could not update the clinic logo.");
    } finally {
      setRemoving(false);
    }
  }

  const error = uploadState.error ?? removeError;
  const previewSrc = logoSrc;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm font-medium" id="logo-label">
        Logo
      </p>
      {previewSrc ? (
        // Clinic mark is a same-origin path or the configured assets origin.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewSrc}
          alt={`${displayName || "Practice"} logo`}
          width={48}
          height={48}
          className="staffLogoPreview"
        />
      ) : (
        <p className="text-sm text-staff-muted">No logo configured.</p>
      )}
      <p className="text-sm text-staff-muted">Current logo preview</p>
      <input type="hidden" name="logoUrl" value={logoUrl ?? ""} />

      {storageAvailable && canEdit ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            id="clinic-logo-file"
            form="clinic-logo-upload"
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
            aria-labelledby="logo-label"
            className="min-w-0 max-w-full text-sm"
          />
          <button
            form="clinic-logo-upload"
            type="submit"
            disabled={uploading || removing}
            className="staffBtn staffBtnSecondary"
          >
            {uploading
              ? "Uploading…"
              : logoUrl
                ? "Replace logo"
                : "Upload logo"}
          </button>
          {logoUrl ? (
            <button
              type="button"
              disabled={uploading || removing}
              className="staffBtn staffBtnQuiet"
              onClick={() => {
                void removeLogo();
              }}
            >
              {removing ? "Removing…" : "Remove"}
            </button>
          ) : null}
        </div>
      ) : null}

      {storageAvailable && canEdit ? (
        <p className="text-sm text-staff-muted">
          SVG, PNG, JPEG or WebP. Raster files up to 2 MB; SVG up to 1 MB.
          Uploaded SVG is sanitized and rendered as an image.
        </p>
      ) : null}
      {!storageAvailable ? (
        <p className="staffLogoUnavailable">
          Logo upload is unavailable because clinic object storage is not
          configured in this environment.
        </p>
      ) : null}

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

      {mounted && storageAvailable && canEdit
        ? createPortal(
            <form id="clinic-logo-upload" action={uploadAction} />,
            document.body
          )
        : null}
    </div>
  );
}
