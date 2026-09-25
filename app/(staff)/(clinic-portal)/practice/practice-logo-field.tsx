"use client";

import {
  PracticeBrandingAssetField,
  type BrandingAssetActionState,
  type PracticeBrandingAssetCopy,
} from "@/app/(staff)/(clinic-portal)/practice/practice-branding-asset-field";
import {
  removeClinicDarkLogoAction,
  removeClinicFaviconAction,
  removeClinicLogoAction,
  uploadClinicDarkLogoAction,
  uploadClinicFaviconAction,
  uploadClinicLogoAction,
  type ClinicFaviconActionState,
  type ClinicLogoActionState,
} from "@/app/(staff)/(clinic-portal)/practice/logo-actions";

const LOGO_ACCEPT =
  "image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg";
const FAVICON_ACCEPT = "image/png,.png";

const LOGO_COPY: PracticeBrandingAssetCopy = {
  label: "Practice logo",
  help: "Shown on your patient aftercare site.",
  formats: "SVG, PNG, JPEG or WebP",
  limits: "Raster max 2 MB · SVG max 1 MB",
  noun: "practice logo",
  chooseNew: "Choose logo",
  chooseReplace: "Choose replacement",
  uploadNew: "Upload logo",
  uploadReplace: "Upload replacement",
  remove: "Remove logo",
  keep: "Keep logo",
  successUpload: "Practice logo updated.",
  successRemove: "Practice logo removed.",
  confirmTitle: "Remove practice logo?",
  confirmDescription:
    "The patient aftercare site will fall back to the practice name and default presentation.",
  unavailable:
    "Logo upload is unavailable because clinic object storage is not configured in this environment.",
  currentCaption: "Current logo",
  selectedCaption: "Selected replacement",
  emptyChoice: "Choose a PNG, JPEG, WebP, or SVG image.",
};

const DARK_LOGO_COPY: PracticeBrandingAssetCopy = {
  ...LOGO_COPY,
  label: "Dark logo",
  help: "Optional. Use an alternate logo if your standard logo is not suitable on dark backgrounds.",
  noun: "Dark-mode logo",
  chooseNew: "Choose Dark logo",
  chooseReplace: "Choose replacement",
  uploadNew: "Upload Dark logo",
  uploadReplace: "Upload replacement",
  remove: "Remove Dark logo",
  keep: "Keep Dark logo",
  successUpload: "Dark logo updated.",
  successRemove: "Dark logo removed.",
  confirmTitle: "Remove Dark logo?",
  confirmDescription:
    "Dark patient pages will use your standard practice logo.",
  currentCaption: "Current Dark logo",
  selectedCaption: "Selected replacement",
};

const FAVICON_COPY: PracticeBrandingAssetCopy = {
  label: "Favicon",
  help: "Shown in the browser tab for your patient aftercare pages.",
  formats: "Square PNG",
  limits: "At least 32 × 32 · 512 × 512 recommended · max 1024 × 1024 · 512 KB",
  noun: "clinic favicon",
  chooseNew: "Choose favicon",
  chooseReplace: "Choose replacement",
  uploadNew: "Upload favicon",
  uploadReplace: "Upload replacement",
  remove: "Remove favicon",
  keep: "Keep favicon",
  successUpload: "Favicon updated.",
  successRemove: "Favicon removed.",
  confirmTitle: "Remove favicon?",
  confirmDescription:
    "Patient aftercare tabs will use the River Aftercare favicon.",
  unavailable:
    "Favicon upload is unavailable because clinic object storage is not configured in this environment.",
  currentCaption: "Current favicon",
  selectedCaption: "Selected replacement",
  emptyChoice: "Choose a square PNG image.",
  previewClassName: "staffFaviconPreview",
};

function readLogoState(state: unknown): BrandingAssetActionState {
  const value = state as ClinicLogoActionState;
  return {
    ok: value.ok,
    error: value.error,
    storedUrl: value.logoUrl,
    previewSrc: value.logoSrc,
  };
}

function readFaviconState(state: unknown): BrandingAssetActionState {
  const value = state as ClinicFaviconActionState;
  return {
    ok: value.ok,
    error: value.error,
    storedUrl: value.faviconUrl,
    previewSrc: value.faviconSrc,
  };
}

export function PracticeLogoField({
  displayName,
  logoUrl,
  logoSrc,
  canEdit,
  storageAvailable,
  onLogoChange,
  siteId,
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
  siteId?: string;
}) {
  return (
    <PracticeBrandingAssetField
      copy={LOGO_COPY}
      storedUrl={logoUrl}
      previewSrc={logoSrc}
      hiddenName="logoUrl"
      fileInputId="clinic-logo-file"
      formId="clinic-logo-upload"
      fileFieldName="logo"
      accept={LOGO_ACCEPT}
      canEdit={canEdit}
      storageAvailable={storageAvailable}
      previewName={`${displayName || "Practice"} logo`}
      uploadAction={uploadClinicLogoAction}
      removeAction={removeClinicLogoAction}
      siteId={siteId}
      readUpload={readLogoState}
      onAssetChange={(next) =>
        onLogoChange({ logoUrl: next.storedUrl, logoSrc: next.previewSrc })
      }
    />
  );
}

export function PracticeDarkLogoField({
  displayName,
  logoUrl,
  logoSrc,
  canEdit,
  storageAvailable,
  onLogoChange,
  siteId,
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
  siteId?: string;
}) {
  return (
    <PracticeBrandingAssetField
      copy={DARK_LOGO_COPY}
      storedUrl={logoUrl}
      previewSrc={logoSrc}
      hiddenName="darkLogoUrl"
      fileInputId="clinic-dark-logo-file"
      formId="clinic-dark-logo-upload"
      fileFieldName="logo"
      accept={LOGO_ACCEPT}
      canEdit={canEdit}
      storageAvailable={storageAvailable}
      previewName={`${displayName || "Practice"} Dark-mode logo`}
      uploadAction={uploadClinicDarkLogoAction}
      removeAction={removeClinicDarkLogoAction}
      siteId={siteId}
      readUpload={readLogoState}
      onAssetChange={(next) =>
        onLogoChange({ logoUrl: next.storedUrl, logoSrc: next.previewSrc })
      }
    />
  );
}

export function PracticeFaviconField({
  displayName,
  faviconUrl,
  faviconSrc,
  canEdit,
  storageAvailable,
  onFaviconChange,
  siteId,
}: {
  displayName: string;
  faviconUrl: string | null;
  faviconSrc: string | null;
  canEdit: boolean;
  storageAvailable: boolean;
  onFaviconChange: (next: {
    faviconUrl: string | null;
    faviconSrc: string | null;
  }) => void;
  siteId?: string;
}) {
  return (
    <PracticeBrandingAssetField
      copy={FAVICON_COPY}
      storedUrl={faviconUrl}
      previewSrc={faviconSrc}
      hiddenName="faviconUrl"
      fileInputId="clinic-favicon-file"
      formId="clinic-favicon-upload"
      fileFieldName="favicon"
      accept={FAVICON_ACCEPT}
      canEdit={canEdit}
      storageAvailable={storageAvailable}
      previewName={`${displayName || "Practice"} favicon`}
      uploadAction={uploadClinicFaviconAction}
      removeAction={removeClinicFaviconAction}
      siteId={siteId}
      readUpload={readFaviconState}
      onAssetChange={(next) =>
        onFaviconChange({
          faviconUrl: next.storedUrl,
          faviconSrc: next.previewSrc,
        })
      }
    />
  );
}
