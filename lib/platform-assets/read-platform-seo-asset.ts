import "server-only";

import { NextResponse } from "next/server";

import {
  CLINIC_ASSET_CACHE_CONTROL,
  requestHostMatchesClinicAssetPublicOrigin,
} from "@/lib/clinic-assets/config";
import { clinicAssetErrorClass } from "@/lib/clinic-assets/errors";
import { getPlatformSeoAssetStorage } from "@/lib/platform-assets/get-platform-seo-asset-storage";
import {
  mimeTypeForPlatformSeoExtension,
  platformSeoStorageKeyFromFilename,
} from "@/lib/platform-assets/platform-seo-image";

export const PLATFORM_SEO_ASSET_PUBLIC_RESPONSE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Disposition": "inline",
  "Cache-Control": CLINIC_ASSET_CACHE_CONTROL,
  "Cross-Origin-Resource-Policy": "same-site",
} as const;

export const PLATFORM_SEO_ASSET_FALLBACK_RESPONSE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Disposition": "inline",
  "Cache-Control": "public, max-age=3600, immutable",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; sandbox",
} as const;

export function emptyPlatformSeoAssetResponse(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

function platformSeoMimeFromFilename(filename: string): string | null {
  const extension = filename.split(".").pop() ?? "";
  return mimeTypeForPlatformSeoExtension(extension);
}

function platformSeoAssetResponse(input: {
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
      "Content-Type": input.mimeType,
      ...(typeof contentLength === "number"
        ? { "Content-Length": String(contentLength) }
        : {}),
      ...input.headers,
    },
  });
}

export async function readPlatformSeoAssetObject(input: {
  filename: string;
}): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  const storageKey = platformSeoStorageKeyFromFilename(input.filename);
  const mimeType = platformSeoMimeFromFilename(input.filename);
  if (!storageKey || !mimeType) {
    return null;
  }

  const storage = getPlatformSeoAssetStorage();
  if (!storage) {
    return null;
  }

  const stored = await storage.read({ storageKey });
  if (!stored) {
    return null;
  }

  return {
    bytes: stored.bytes,
    mimeType,
  };
}

export async function headPlatformSeoAssetObject(input: {
  filename: string;
}): Promise<{ mimeType: string; contentLength: number | null } | null> {
  const storageKey = platformSeoStorageKeyFromFilename(input.filename);
  const mimeType = platformSeoMimeFromFilename(input.filename);
  if (!storageKey || !mimeType) {
    return null;
  }

  const storage = getPlatformSeoAssetStorage();
  if (!storage) {
    return null;
  }

  const stored = await storage.head({ storageKey });
  if (!stored) {
    return null;
  }

  return {
    mimeType,
    contentLength: stored.contentLength,
  };
}

export async function servePlatformSeoAsset(input: {
  request: Request;
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
      return emptyPlatformSeoAssetResponse();
    }

    const headers =
      input.variant === "public"
        ? PLATFORM_SEO_ASSET_PUBLIC_RESPONSE_HEADERS
        : PLATFORM_SEO_ASSET_FALLBACK_RESPONSE_HEADERS;

    if (input.method === "HEAD") {
      const stored = await headPlatformSeoAssetObject({
        filename: input.filename,
      });
      if (!stored) {
        return emptyPlatformSeoAssetResponse();
      }
      return platformSeoAssetResponse({
        body: null,
        mimeType: stored.mimeType,
        headers,
        contentLength: stored.contentLength,
      });
    }

    const stored = await readPlatformSeoAssetObject({
      filename: input.filename,
    });
    if (!stored) {
      return emptyPlatformSeoAssetResponse();
    }
    return platformSeoAssetResponse({
      body: stored.bytes,
      mimeType: stored.mimeType,
      headers,
    });
  } catch (error) {
    console.warn("[platform-assets]", "seo_asset_delivery_failed", {
      class: clinicAssetErrorClass(error),
    });
    return emptyPlatformSeoAssetResponse();
  }
}
