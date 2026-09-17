import "server-only";

import { clinicAssetPublicOrigin } from "@/lib/clinic-assets/public-origin";

export { clinicAssetPublicOrigin } from "@/lib/clinic-assets/public-origin";

export const CLINIC_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";

export type ClinicAssetStorageStatus =
  | { available: true; driver: "r2"; bucket: string }
  | { available: true; driver: "memory"; bucket: string }
  | { available: false; reason: "unconfigured" };

export interface R2ClinicAssetConfig {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  publicOrigin: string;
}

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/**
 * Compare the request `Host` header to `CLINIC_ASSET_PUBLIC_ORIGIN`.
 * Uses `Host` only — the same header the hostname proxy trusts.
 * Do not consult `x-forwarded-host` or other forwarded hostname headers.
 */
export function requestHostMatchesClinicAssetPublicOrigin(
  hostHeader: string | null | undefined
): boolean {
  const origin = clinicAssetPublicOrigin();
  if (!origin || !hostHeader) {
    return false;
  }

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  const raw = hostHeader.trim().toLowerCase();
  if (
    !raw ||
    raw.includes("/") ||
    raw.includes("?") ||
    raw.includes("#") ||
    raw.includes("@") ||
    raw.includes("\\")
  ) {
    return false;
  }

  let requestUrl: URL;
  try {
    requestUrl = new URL(`${originUrl.protocol}//${raw}`);
  } catch {
    return false;
  }

  if (requestUrl.hostname !== originUrl.hostname) {
    return false;
  }

  const defaultPort = originUrl.protocol === "https:" ? "443" : "80";
  const originPort = originUrl.port || defaultPort;
  const requestPort = requestUrl.port || defaultPort;
  return originPort === requestPort;
}

function r2S3Endpoint(accountId: string): string | null {
  const override = readEnv("R2_S3_ENDPOINT");
  if (override) {
    try {
      const url = new URL(override);
      if (url.protocol !== "https:") {
        return null;
      }
      if (url.username || url.password) {
        return null;
      }
      return url.origin;
    } catch {
      return null;
    }
  }

  if (!/^[A-Za-z0-9_-]{1,64}$/.test(accountId)) {
    return null;
  }

  return `https://${accountId}.r2.cloudflarestorage.com`;
}

export function r2ClinicAssetConfig(): R2ClinicAssetConfig | null {
  if (readEnv("CLINIC_ASSET_STORAGE_DRIVER") !== "r2") {
    return null;
  }

  const accountId = readEnv("R2_ACCOUNT_ID");
  const bucket = readEnv("R2_BUCKET");
  const accessKeyId = readEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = readEnv("R2_SECRET_ACCESS_KEY");
  const publicOrigin = clinicAssetPublicOrigin();

  if (
    !accountId ||
    !bucket ||
    !accessKeyId ||
    !secretAccessKey ||
    !publicOrigin
  ) {
    return null;
  }

  if (!/^[A-Za-z0-9_-]{1,64}$/.test(accountId)) {
    return null;
  }
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(bucket)) {
    return null;
  }

  const endpoint = r2S3Endpoint(accountId);
  if (!endpoint) {
    return null;
  }

  return {
    accountId,
    bucket,
    accessKeyId,
    secretAccessKey,
    endpoint,
    publicOrigin,
  };
}

export function clinicAssetStorageStatus(): ClinicAssetStorageStatus {
  const driver = readEnv("CLINIC_ASSET_STORAGE_DRIVER");

  if (driver === "memory") {
    return { available: true, driver: "memory", bucket: "memory" };
  }

  const r2 = r2ClinicAssetConfig();
  if (driver === "r2" && r2) {
    return { available: true, driver: "r2", bucket: r2.bucket };
  }

  return { available: false, reason: "unconfigured" };
}

export function isClinicAssetStorageConfigured(): boolean {
  return clinicAssetStorageStatus().available;
}
