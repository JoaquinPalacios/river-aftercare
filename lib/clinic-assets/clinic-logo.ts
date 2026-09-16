export const CLINIC_LOGO_RASTER_MAX_BYTES = 2 * 1024 * 1024;
export const CLINIC_LOGO_SVG_MAX_BYTES = 1024 * 1024;

export const CLINIC_LOGO_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
] as const;

export type ClinicLogoKind = "png" | "jpeg" | "webp" | "svg";
export type ClinicLogoExtension = "png" | "jpg" | "webp" | "svg";

export type ClinicLogoValidation =
  | {
      ok: true;
      kind: ClinicLogoKind;
      mimeType: (typeof CLINIC_LOGO_MIME_TYPES)[number];
      extension: ClinicLogoExtension;
    }
  | {
      ok: false;
      error: string;
    };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

const EXTENSION_BY_KIND: Record<ClinicLogoKind, ClinicLogoExtension> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
  svg: "svg",
};

const MIME_BY_KIND: Record<
  ClinicLogoKind,
  (typeof CLINIC_LOGO_MIME_TYPES)[number]
> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

function startsWith(
  bytes: Uint8Array,
  signature: number[],
  offset = 0
): boolean {
  if (bytes.length < offset + signature.length) {
    return false;
  }
  return signature.every((value, index) => bytes[offset + index] === value);
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.slice(0, 256))
    .trim()
    .toLowerCase();
  return (
    head.startsWith("<svg") || head.startsWith("<?xml") || head.includes("<svg")
  );
}

export function detectClinicLogoKind(bytes: Uint8Array): ClinicLogoKind | null {
  if (startsWith(bytes, PNG_SIGNATURE)) {
    return "png";
  }
  if (startsWith(bytes, JPEG_SIGNATURE)) {
    return "jpeg";
  }
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) {
    return "webp";
  }
  if (looksLikeSvg(bytes)) {
    return "svg";
  }
  return null;
}

function extensionFromFileName(fileName: string | undefined): string | null {
  if (!fileName) {
    return null;
  }
  const match = /\.([A-Za-z0-9]+)$/.exec(fileName.trim());
  return match ? match[1].toLowerCase() : null;
}

function kindFromExtension(extension: string | null): ClinicLogoKind | null {
  if (extension === "png") {
    return "png";
  }
  if (extension === "jpg" || extension === "jpeg") {
    return "jpeg";
  }
  if (extension === "webp") {
    return "webp";
  }
  if (extension === "svg") {
    return "svg";
  }
  return null;
}

export function validateClinicLogo(input: {
  bytes: Uint8Array;
  mimeType: string;
  fileName?: string;
}): ClinicLogoValidation {
  if (input.bytes.byteLength === 0) {
    return { ok: false, error: "Choose a PNG, JPEG, WebP, or SVG image." };
  }

  const kind = detectClinicLogoKind(input.bytes);
  if (!kind) {
    return {
      ok: false,
      error: "The file is not a valid PNG, JPEG, WebP, or SVG image.",
    };
  }

  const maxBytes =
    kind === "svg" ? CLINIC_LOGO_SVG_MAX_BYTES : CLINIC_LOGO_RASTER_MAX_BYTES;
  if (input.bytes.byteLength > maxBytes) {
    return {
      ok: false,
      error:
        kind === "svg"
          ? "SVG logos must be 1 MB or smaller."
          : "Logo files must be 2 MB or smaller.",
    };
  }

  const expectedMime = MIME_BY_KIND[kind];
  const providedMime = input.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (providedMime) {
    const mimeMatches =
      kind === "svg"
        ? providedMime === "image/svg+xml" ||
          providedMime === "image/svg" ||
          providedMime === "text/xml" ||
          providedMime === "application/xml"
        : providedMime === expectedMime;
    if (!mimeMatches) {
      return {
        ok: false,
        error: "The file type does not match the image contents.",
      };
    }
  }

  const namedKind = kindFromExtension(extensionFromFileName(input.fileName));
  if (namedKind && namedKind !== kind) {
    return {
      ok: false,
      error: "The file extension does not match the image contents.",
    };
  }

  return {
    ok: true,
    kind,
    mimeType: expectedMime,
    extension: EXTENSION_BY_KIND[kind],
  };
}

export function clinicLogoObjectKey(input: {
  clinicId: string;
  objectId: string;
  extension: ClinicLogoExtension;
}): string {
  return `clinics/${input.clinicId}/branding/${input.objectId}.${input.extension}`;
}

const PUBLIC_LOGO_PATH =
  /^\/clinic-branding\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+\.(?:png|jpe?g|webp|svg))$/;
const PUBLIC_ASSET_PATH =
  /^\/clinics\/([A-Za-z0-9._-]+)\/branding\/([A-Za-z0-9._-]+\.(?:png|jpe?g|webp|svg))$/;
const STORAGE_KEY =
  /^clinics\/([A-Za-z0-9._-]+)\/branding\/([A-Za-z0-9._-]+\.(?:png|jpe?g|webp|svg))$/;

function isSafeClinicLogoSegment(value: string): boolean {
  return (
    Boolean(value) &&
    !value.includes("..") &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes("%") &&
    !value.includes("\0")
  );
}

export function isClinicLogoStorageKey(value: string): boolean {
  if (
    !value ||
    value.includes("..") ||
    value.includes("\\") ||
    value.includes("%")
  ) {
    return false;
  }
  return STORAGE_KEY.test(value);
}

export function clinicLogoStorageKeyFromBrandingParams(
  clinicId: string,
  filename: string
): string | null {
  if (
    !isSafeClinicLogoSegment(clinicId) ||
    !isSafeClinicLogoSegment(filename)
  ) {
    return null;
  }
  const key = `clinics/${clinicId}/branding/${filename}`;
  return isClinicLogoStorageKey(key) ? key : null;
}

export function isClinicBrandingPublicPath(pathname: string): boolean {
  const match = PUBLIC_ASSET_PATH.exec(pathname);
  if (!match) {
    return false;
  }
  return clinicLogoStorageKeyFromBrandingParams(match[1], match[2]) !== null;
}

export function clinicLogoPublicPath(storageKey: string): string | null {
  if (!isClinicLogoStorageKey(storageKey)) {
    return null;
  }
  const match = STORAGE_KEY.exec(storageKey);
  if (!match) {
    return null;
  }
  return `/clinic-branding/${match[1]}/${match[2]}`;
}

export function storageKeyFromClinicLogoPath(
  logoUrl: string | null | undefined
): string | null {
  if (!logoUrl) {
    return null;
  }
  const match = PUBLIC_LOGO_PATH.exec(logoUrl.trim());
  if (!match) {
    return null;
  }
  return clinicLogoStorageKeyFromBrandingParams(match[1], match[2]);
}

export function clinicLogoStorageKeyFromStoredValue(
  value: string | null | undefined
): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (isClinicLogoStorageKey(trimmed)) {
    return trimmed;
  }
  return storageKeyFromClinicLogoPath(trimmed);
}

export function isOwnedClinicBrandingKey(
  clinicId: string,
  storageKey: string | null | undefined
): storageKey is string {
  return Boolean(
    storageKey && storageKey.startsWith(`clinics/${clinicId}/branding/`)
  );
}

export function mimeTypeForClinicLogoExtension(
  extension: string
): (typeof CLINIC_LOGO_MIME_TYPES)[number] | null {
  const normalized = extension.toLowerCase();
  if (normalized === "png") {
    return "image/png";
  }
  if (normalized === "jpg" || normalized === "jpeg") {
    return "image/jpeg";
  }
  if (normalized === "webp") {
    return "image/webp";
  }
  if (normalized === "svg") {
    return "image/svg+xml";
  }
  return null;
}
