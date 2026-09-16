import type {
  ClinicAssetStorage,
  ClinicLogoReadResult,
} from "@/lib/clinic-assets/clinic-asset-storage";
import { clinicAssetPublicUrl } from "@/lib/clinic-assets/public-url";

const store = new Map<string, ClinicLogoReadResult>();

export function resetMemoryClinicAssetStorage(): void {
  store.clear();
}

export function memoryClinicAssetKeys(): string[] {
  return [...store.keys()];
}

export function createMemoryClinicAssetStorage(): ClinicAssetStorage {
  return {
    async uploadLogo(input) {
      const publicPath = clinicAssetPublicUrl(input.storageKey);
      if (!publicPath) {
        throw new Error("Could not derive a clinic logo URL.");
      }
      store.set(input.storageKey, {
        bytes: input.bytes.slice(),
        mimeType: input.mimeType,
      });
      return {
        clinicId: input.clinicId,
        storageKey: input.storageKey,
        publicPath,
      };
    },

    async deleteLogo(input) {
      store.delete(input.storageKey);
    },

    async readLogo(input) {
      const stored = store.get(input.storageKey);
      if (!stored) {
        return null;
      }
      return {
        bytes: stored.bytes.slice(),
        mimeType: stored.mimeType,
      };
    },

    async headLogo(input) {
      const stored = store.get(input.storageKey);
      if (!stored) {
        return null;
      }
      return {
        contentLength: stored.bytes.byteLength,
      };
    },

    getPublicLogoUrl(input) {
      const publicPath = clinicAssetPublicUrl(input.storageKey);
      if (!publicPath) {
        throw new Error("Could not derive a clinic logo URL.");
      }
      return publicPath;
    },
  };
}
