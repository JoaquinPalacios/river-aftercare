import { clinicAssetPublicOrigin } from "@/lib/clinic-assets/public-origin";
import {
  isPlatformSeoPublicPath,
  isPlatformSeoStorageKey,
  platformSeoFallbackPath,
  platformSeoPublicPath,
  platformSeoStorageKeyFromStoredValue,
} from "@/lib/platform-assets/platform-seo-image";

export function platformSeoAssetPublicUrl(storageKey: string): string | null {
  if (!isPlatformSeoStorageKey(storageKey)) {
    return null;
  }

  const origin = clinicAssetPublicOrigin();
  if (origin) {
    return `${origin}/${storageKey}`;
  }

  return platformSeoFallbackPath(storageKey);
}

export function resolvePlatformSeoOgImageUrl(
  stored: string | null | undefined
): string | null {
  if (typeof stored !== "string") {
    return null;
  }
  const trimmed = stored.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.includes("\\")) {
    return null;
  }

  const storageKey = platformSeoStorageKeyFromStoredValue(trimmed);
  if (!storageKey) {
    return trimmed;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      const origin = clinicAssetPublicOrigin();
      if (
        origin &&
        url.origin === origin &&
        isPlatformSeoPublicPath(url.pathname)
      ) {
        return `${origin}/${storageKey}`;
      }
    } catch {
      return platformSeoAssetPublicUrl(storageKey);
    }
  }

  return (
    platformSeoAssetPublicUrl(storageKey) ?? platformSeoPublicPath(storageKey)
  );
}

export function managedPlatformSeoStorageKeyForDeletion(
  stored: string | null | undefined
): string | null {
  if (typeof stored !== "string") {
    return null;
  }
  const trimmed = stored.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      const origin = clinicAssetPublicOrigin();
      if (!origin || url.origin !== origin) {
        return null;
      }
      if (url.username || url.password) {
        return null;
      }
    } catch {
      return null;
    }
  }

  return platformSeoStorageKeyFromStoredValue(trimmed);
}
