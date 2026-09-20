import { rasterImageSize } from "@/lib/platform-assets/image-size";

export const CLINIC_FAVICON_MAX_BYTES = 512 * 1024;
export const CLINIC_FAVICON_MIN_SIZE = 32;
export const CLINIC_FAVICON_MAX_SIZE = 1024;
export const CLINIC_FAVICON_RECOMMENDED_SIZE = 512;

export type ClinicFaviconValidation =
  | {
      ok: true;
      kind: "png";
      mimeType: "image/png";
      extension: "png";
      width: number;
      height: number;
    }
  | {
      ok: false;
      error: string;
    };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) {
    return false;
  }
  return signature.every((value, index) => bytes[index] === value);
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

function extensionFromFileName(fileName: string | undefined): string | null {
  if (!fileName) {
    return null;
  }
  const match = /\.([A-Za-z0-9]+)$/.exec(fileName.trim());
  return match ? match[1].toLowerCase() : null;
}

export function validateClinicFavicon(input: {
  bytes: Uint8Array;
  mimeType: string;
  fileName?: string;
}): ClinicFaviconValidation {
  if (input.bytes.byteLength === 0) {
    return { ok: false, error: "Choose a square PNG image." };
  }

  if (looksLikeSvg(input.bytes)) {
    return {
      ok: false,
      error: "SVG is not allowed for favicons. Use a square PNG.",
    };
  }

  if (!startsWith(input.bytes, PNG_SIGNATURE)) {
    return {
      ok: false,
      error: "The file is not a valid PNG image.",
    };
  }

  if (input.bytes.byteLength > CLINIC_FAVICON_MAX_BYTES) {
    return {
      ok: false,
      error: "Favicon files must be 512 KB or smaller.",
    };
  }

  const providedMime = input.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (providedMime && providedMime !== "image/png") {
    return {
      ok: false,
      error: "The file type does not match the image contents.",
    };
  }

  const namedExtension = extensionFromFileName(input.fileName);
  if (namedExtension && namedExtension !== "png") {
    return {
      ok: false,
      error: "The file extension does not match the image contents.",
    };
  }

  const size = rasterImageSize(input.bytes);
  if (!size) {
    return {
      ok: false,
      error: "The file is not a valid PNG image.",
    };
  }

  if (size.width !== size.height) {
    return {
      ok: false,
      error: "Favicon must be a square PNG.",
    };
  }

  if (size.width < CLINIC_FAVICON_MIN_SIZE) {
    return {
      ok: false,
      error: "Favicon must be at least 32 × 32 pixels.",
    };
  }

  if (size.width > CLINIC_FAVICON_MAX_SIZE) {
    return {
      ok: false,
      error: "Favicon must be 1024 × 1024 pixels or smaller.",
    };
  }

  return {
    ok: true,
    kind: "png",
    mimeType: "image/png",
    extension: "png",
    width: size.width,
    height: size.height,
  };
}
