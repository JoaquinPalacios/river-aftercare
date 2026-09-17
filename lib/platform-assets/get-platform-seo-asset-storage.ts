import "server-only";

import { clinicAssetStorageStatus } from "@/lib/clinic-assets/config";
import { createMemoryPlatformSeoAssetStorage } from "@/lib/platform-assets/memory-platform-seo-asset-storage";
import type { PlatformSeoAssetStorage } from "@/lib/platform-assets/platform-seo-asset-storage";
import { createR2PlatformSeoAssetStorage } from "@/lib/platform-assets/r2-platform-seo-asset-storage";

let memoryStorage: PlatformSeoAssetStorage | null = null;
let r2Storage: PlatformSeoAssetStorage | null = null;

export function getPlatformSeoAssetStorage(): PlatformSeoAssetStorage | null {
  const status = clinicAssetStorageStatus();
  if (!status.available) {
    return null;
  }

  if (status.driver === "r2") {
    if (!r2Storage) {
      r2Storage = createR2PlatformSeoAssetStorage();
    }
    return r2Storage;
  }

  if (!memoryStorage) {
    memoryStorage = createMemoryPlatformSeoAssetStorage();
  }
  return memoryStorage;
}

/** Test-only: drop memoized drivers. */
export function resetPlatformSeoAssetStorageCache(): void {
  memoryStorage = null;
  r2Storage = null;
}
