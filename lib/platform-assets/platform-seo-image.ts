import { OG_IMAGE_TARGET } from "@/lib/seo/og-policy";

import { rasterImageSize } from "@/lib/platform-assets/image-size";

export const PLATFORM_SEO_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const PLATFORM_SEO_IMAGE_WIDTH = OG_IMAGE_TARGET.width;
export const PLATFORM_SEO_IMAGE_HEIGHT = OG_IMAGE_TARGET.height;

export const PLATFORM_SEO_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type PlatformSeoImageKind = "png" | "jpeg" | "webp";
export type PlatformSeoImageExtension = "png" | "jpg" | "webp";

export type PlatformSeoImageValidation =
  | {
      ok: true;
      kind: PlatformSeoImageKind;
      mimeType: (typeof PLATFORM_SEO_IMAGE_MIME_TYPES)[number];
      extension: PlatformSeoImageExtension;
      width: number;
      height: number;
    }
  | {
      ok: false;
      error: string;
    };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

const FILENAME =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(png|jpe?g|webp)$/;
const STORAGE_KEY =
  /^platform\/seo\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpe?g|webp))$/;
const PUBLIC_PATH =
  /^\/platform\/seo\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpe?g|webp))$/;
const FALLBACK_PATH =
  /^\/platform-seo\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpe?g|webp))$/;

const EXTENSION_BY_KIND: Record<
  PlatformSeoImageKind,
  PlatformSeoImageExtension
> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
};

const MIME_BY_KIND: Record<
  PlatformSeoImageKind,
  (typeof PLATFORM_SEO_IMAGE_MIME_TYPES)[number]
> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
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

function detectKind(bytes: Uint8Array): PlatformSeoImageKind | "svg" | null {
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

function kindFromExtension(
  extension: string | null
): PlatformSeoImageKind | "svg" | null {
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

export function validatePlatformSeoImage(input: {
  bytes: Uint8Array;
  mimeType: string;
  fileName?: string;
}): PlatformSeoImageValidation {
  if (input.bytes.byteLength === 0) {
    return {
      ok: false,
      error: "Choose a PNG, JPEG, or WebP image that is exactly 1200 × 630.",
    };
  }

  const namedKind = kindFromExtension(extensionFromFileName(input.fileName));
  const kind = detectKind(input.bytes);

  if (kind === "svg" || namedKind === "svg") {
    return {
      ok: false,
      error:
        "SVG is not allowed for the default social image. Use PNG, JPEG, or WebP.",
    };
  }

  if (!kind) {
    return {
      ok: false,
      error: "The file is not a valid PNG, JPEG, or WebP image.",
    };
  }

  if (input.bytes.byteLength > PLATFORM_SEO_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      error: "Social images must be 2 MB or smaller.",
    };
  }

  const expectedMime = MIME_BY_KIND[kind];
  const providedMime = input.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (providedMime && providedMime !== expectedMime) {
    return {
      ok: false,
      error: "The file type does not match the image contents.",
    };
  }

  if (namedKind && namedKind !== kind) {
    return {
      ok: false,
      error: "The file extension does not match the image contents.",
    };
  }

  const size = rasterImageSize(input.bytes);
  if (!size) {
    return {
      ok: false,
      error: "Could not read the image dimensions.",
    };
  }
  if (
    size.width !== PLATFORM_SEO_IMAGE_WIDTH ||
    size.height !== PLATFORM_SEO_IMAGE_HEIGHT
  ) {
    return {
      ok: false,
      error: `Social images must be exactly ${PLATFORM_SEO_IMAGE_WIDTH} × ${PLATFORM_SEO_IMAGE_HEIGHT} pixels.`,
    };
  }

  return {
    ok: true,
    kind,
    mimeType: expectedMime,
    extension: EXTENSION_BY_KIND[kind],
    width: size.width,
    height: size.height,
  };
}

function isSafeSegment(value: string): boolean {
  return (
    Boolean(value) &&
    !value.includes("..") &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes("%") &&
    !value.includes("\0")
  );
}

export function platformSeoObjectKey(input: {
  objectId: string;
  extension: PlatformSeoImageExtension;
}): string {
  return `platform/seo/${input.objectId}.${input.extension}`;
}

export function isPlatformSeoFilename(value: string): boolean {
  if (!isSafeSegment(value)) {
    return false;
  }
  return FILENAME.test(value);
}

export function isPlatformSeoStorageKey(
  value: string | null | undefined
): value is string {
  if (!value) {
    return false;
  }
  if (
    value.includes("..") ||
    value.includes("\\") ||
    value.includes("%") ||
    value.includes("\0")
  ) {
    return false;
  }
  return STORAGE_KEY.test(value);
}

export function platformSeoStorageKeyFromFilename(
  filename: string
): string | null {
  if (!isPlatformSeoFilename(filename)) {
    return null;
  }
  const key = `platform/seo/${filename}`;
  return isPlatformSeoStorageKey(key) ? key : null;
}

export function isPlatformSeoPublicPath(pathname: string): boolean {
  const match = PUBLIC_PATH.exec(pathname);
  if (!match) {
    return false;
  }
  return platformSeoStorageKeyFromFilename(match[1]) !== null;
}

export function platformSeoPublicPath(storageKey: string): string | null {
  if (!isPlatformSeoStorageKey(storageKey)) {
    return null;
  }
  return `/${storageKey}`;
}

export function platformSeoFallbackPath(storageKey: string): string | null {
  if (!isPlatformSeoStorageKey(storageKey)) {
    return null;
  }
  const match = STORAGE_KEY.exec(storageKey);
  if (!match) {
    return null;
  }
  return `/platform-seo/${match[1]}`;
}

export function platformSeoStorageKeyFromStoredValue(
  value: string | null | undefined
): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (isPlatformSeoStorageKey(trimmed)) {
    return trimmed;
  }

  const publicMatch = PUBLIC_PATH.exec(trimmed);
  if (publicMatch) {
    return platformSeoStorageKeyFromFilename(publicMatch[1]);
  }

  const fallbackMatch = FALLBACK_PATH.exec(trimmed);
  if (fallbackMatch) {
    return platformSeoStorageKeyFromFilename(fallbackMatch[1]);
  }

  try {
    const url = new URL(trimmed);
    if (url.username || url.password) {
      return null;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return platformSeoStorageKeyFromStoredValue(url.pathname);
  } catch {
    return null;
  }
}

export function mimeTypeForPlatformSeoExtension(
  extension: string
): (typeof PLATFORM_SEO_IMAGE_MIME_TYPES)[number] | null {
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
  return null;
}
