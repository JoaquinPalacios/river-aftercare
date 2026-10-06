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
import { RETIRED_TENANT_CACHE_CONTROL } from "@/lib/aftercare/retired-tenant-http";
import { getPrisma } from "@/lib/prisma";

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
  "Cross-Origin-Resource-Policy": "same-site",
} as const;

function clinicLogoContentType(mimeType: string): string {
  return mimeType === "image/svg+xml"
    ? "image/svg+xml; charset=utf-8"
    : mimeType;
}

export function emptyClinicLogoResponse(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

function permanentlyDeletedLogoResponse(): NextResponse {
  return new NextResponse(null, {
    status: 404,
    headers: {
      "Cache-Control": RETIRED_TENANT_CACHE_CONTROL,
      "X-Robots-Tag": "noindex",
    },
  });
}

/**
 * Unit tests and local `next dev` can serve a clinic logo without a database.
 * Production and any Vercel runtime cannot. A lookup error also refuses the
 * object so a permanently deleted clinic is not served by accident.
 */
function clinicBrandingLookupMaySkipDatabase(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    !process.env.VERCEL &&
    !process.env.VERCEL_ENV &&
    !process.env.DATABASE_URL
  );
}

async function clinicOwnedBrandingIsUnavailable(
  clinicId: string
): Promise<boolean> {
  if (clinicBrandingLookupMaySkipDatabase()) {
    return false;
  }
  if (!process.env.DATABASE_URL) {
    console.warn("[clinic-assets]", "deleted_clinic_branding_check_failed", {
      class: "missing_database",
    });
    return true;
  }
  try {
    const clinic = await getPrisma().clinic.findUnique({
      where: { id: clinicId },
      select: { permanentlyDeletedAt: true },
    });
    return clinic?.permanentlyDeletedAt != null;
  } catch (error) {
    console.warn("[clinic-assets]", "deleted_clinic_branding_check_failed", {
      class: clinicAssetErrorClass(error),
    });
    return true;
  }
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

    if (await clinicOwnedBrandingIsUnavailable(input.clinicId)) {
      return permanentlyDeletedLogoResponse();
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
