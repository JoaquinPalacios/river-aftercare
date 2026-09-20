import "server-only";

import type { ClinicAssetStorage } from "@/lib/clinic-assets/clinic-asset-storage";
import { clinicAssetStorageStatus } from "@/lib/clinic-assets/config";
import { createFilesystemClinicAssetStorage } from "@/lib/clinic-assets/filesystem-clinic-asset-storage";
import { createMemoryClinicAssetStorage } from "@/lib/clinic-assets/memory-clinic-asset-storage";
import { createR2ClinicAssetStorage } from "@/lib/clinic-assets/r2-clinic-asset-storage";

let memoryStorage: ClinicAssetStorage | null = null;
let filesystemStorage: ClinicAssetStorage | null = null;
let r2Storage: ClinicAssetStorage | null = null;

export function getClinicAssetStorage(): ClinicAssetStorage | null {
  const status = clinicAssetStorageStatus();
  if (!status.available) {
    return null;
  }

  if (status.driver === "r2") {
    if (!r2Storage) {
      r2Storage = createR2ClinicAssetStorage();
    }
    return r2Storage;
  }

  if (status.driver === "filesystem") {
    if (!filesystemStorage) {
      filesystemStorage = createFilesystemClinicAssetStorage();
    }
    return filesystemStorage;
  }

  if (!memoryStorage) {
    memoryStorage = createMemoryClinicAssetStorage();
  }
  return memoryStorage;
}

/** Test-only: drop memoized drivers. */
export function resetClinicAssetStorageCache(): void {
  memoryStorage = null;
  filesystemStorage = null;
  r2Storage = null;
}
