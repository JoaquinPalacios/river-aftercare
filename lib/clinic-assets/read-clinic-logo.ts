import "server-only";

import { NextResponse } from "next/server";

import {
  clinicLogoStorageKeyFromBrandingParams,
  mimeTypeForClinicLogoExtension,
} from "@/lib/clinic-assets/clinic-logo";
import {
  CLINIC_ASSET_CACHE_CONTROL,
  requestHostMatchesClinicAssetPublicOrigin,
} from "@/lib/clinic-assets/config";
import { clinicAssetErrorClass } from "@/lib/clinic-assets/errors";
import { getClinicAssetStorage } from "@/lib/clinic-assets/get-clinic-asset-storage";

export const CLINIC_LOGO_RESPONSE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Disposition": "inline",
  "Cache-Control": "public, max-age=3600, immutable",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; sandbox",
} as const;

export const CLINIC_LOGO_PUBLIC_RESPONSE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Disposition": "inline",
  "Cache-Control": CLINIC_ASSET_CACHE_CONTROL,
} as const;

function clinicLogoContentType(mimeType: string): string {
  return mimeType === "image/svg+xml"
    ? "image/svg+xml; charset=utf-8"
    : mimeType;
}

export function emptyClinicLogoResponse(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

function clinicLogoResponse(input: {
  body: Uint8Array | null;
  mimeType: string;
  headers: Record<string, string>;
  contentLength?: number | null;
}): NextResponse {
  const contentLength =
    input.contentLength ?? (input.body ? input.body.byteLength : null);
  return new NextResponse(input.body ? Buffer.from(input.body) : null, {
    status: 200,
    headers: {
      "Content-Type": clinicLogoContentType(input.mimeType),
      ...(typeof contentLength === "number"
        ? { "Content-Length": String(contentLength) }
        : {}),
      ...input.headers,
    },
  });
}

function clinicLogoMimeFromFilename(filename: string): string | null {
  const extension = filename.split(".").pop() ?? "";
  return mimeTypeForClinicLogoExtension(extension);
}

export async function readClinicLogoObject(input: {
  clinicId: string;
  filename: string;
}): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  const storageKey = clinicLogoStorageKeyFromBrandingParams(
    input.clinicId,
    input.filename
  );
  const mimeType = clinicLogoMimeFromFilename(input.filename);
  if (!storageKey || !mimeType) {
    return null;
  }

  const storage = getClinicAssetStorage();
  if (!storage) {
    return null;
  }

  const stored = await storage.readLogo({
    clinicId: input.clinicId,
    storageKey,
  });
  if (!stored) {
    return null;
  }

  return {
    bytes: stored.bytes,
    mimeType,
  };
}

export async function headClinicLogoObject(input: {
  clinicId: string;
  filename: string;
}): Promise<{ mimeType: string; contentLength: number | null } | null> {
  const storageKey = clinicLogoStorageKeyFromBrandingParams(
    input.clinicId,
    input.filename
  );
  const mimeType = clinicLogoMimeFromFilename(input.filename);
  if (!storageKey || !mimeType) {
    return null;
  }

  const storage = getClinicAssetStorage();
  if (!storage) {
    return null;
  }

  const stored = await storage.headLogo({
    clinicId: input.clinicId,
    storageKey,
  });
  if (!stored) {
    return null;
  }

  return {
    mimeType,
    contentLength: stored.contentLength,
  };
}

export async function serveClinicLogo(input: {
  request: Request;
  clinicId: string;
  filename: string;
  method: "GET" | "HEAD";
  variant: "public" | "fallback";
}): Promise<NextResponse> {
  try {
    if (
      input.variant === "public" &&
      !requestHostMatchesClinicAssetPublicOrigin(
        input.request.headers.get("host")
      )
    ) {
      return emptyClinicLogoResponse();
    }

    const headers =
      input.variant === "public"
        ? CLINIC_LOGO_PUBLIC_RESPONSE_HEADERS
        : CLINIC_LOGO_RESPONSE_HEADERS;

    if (input.method === "HEAD") {
      const stored = await headClinicLogoObject({
        clinicId: input.clinicId,
        filename: input.filename,
      });
      if (!stored) {
        return emptyClinicLogoResponse();
      }
      return clinicLogoResponse({
        body: null,
        mimeType: stored.mimeType,
        headers,
        contentLength: stored.contentLength,
      });
    }

    const stored = await readClinicLogoObject({
      clinicId: input.clinicId,
      filename: input.filename,
    });
    if (!stored) {
      return emptyClinicLogoResponse();
    }
    return clinicLogoResponse({
      body: stored.bytes,
      mimeType: stored.mimeType,
      headers,
    });
  } catch (error) {
    console.warn("[clinic-assets]", "logo_delivery_failed", {
      class: clinicAssetErrorClass(error),
    });
    return emptyClinicLogoResponse();
  }
}
