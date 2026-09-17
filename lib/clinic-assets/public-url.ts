import { toSafeLogoSrc } from "@/lib/aftercare/safe-href";
import {
  clinicLogoPublicPath,
  clinicLogoStorageKeyFromStoredValue,
  isClinicLogoStorageKey,
} from "@/lib/clinic-assets/clinic-logo";
import { clinicAssetPublicOrigin } from "@/lib/clinic-assets/public-origin";

export function clinicAssetPublicUrl(storageKey: string): string | null {
  if (!isClinicLogoStorageKey(storageKey)) {
    return null;
  }

  const origin = clinicAssetPublicOrigin();
  if (origin) {
    return `${origin}/${storageKey}`;
  }

  return clinicLogoPublicPath(storageKey);
}

export function resolveClinicLogoSrc(
  stored: string | null | undefined
): string | null {
  if (typeof stored !== "string") {
    return null;
  }

  const trimmed = stored.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.includes("\\")) {
    return null;
  }

  const storageKey = clinicLogoStorageKeyFromStoredValue(trimmed);
  if (storageKey) {
    return clinicAssetPublicUrl(storageKey);
  }

  return toSafeLogoSrc(trimmed);
}

export function isClinicLogoStoredReference(
  value: string | null | undefined
): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  if (clinicLogoStorageKeyFromStoredValue(trimmed)) {
    return true;
  }
  return Boolean(toSafeLogoSrc(trimmed));
}
