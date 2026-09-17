import type { PlatformSeoAssetStorage } from "@/lib/platform-assets/platform-seo-asset-storage";
import { isPlatformSeoStorageKey } from "@/lib/platform-assets/platform-seo-image";
import { platformSeoAssetPublicUrl } from "@/lib/platform-assets/public-url";

const store = new Map<string, Uint8Array>();

export function resetMemoryPlatformSeoAssetStorage(): void {
  store.clear();
}

export function memoryPlatformSeoAssetKeys(): string[] {
  return [...store.keys()];
}

function requireKey(storageKey: string): string {
  if (!isPlatformSeoStorageKey(storageKey)) {
    throw new Error("That social image path is not allowed.");
  }
  return storageKey;
}

export function createMemoryPlatformSeoAssetStorage(): PlatformSeoAssetStorage {
  return {
    async upload(input) {
      const storageKey = requireKey(input.storageKey);
      const publicPath = platformSeoAssetPublicUrl(storageKey);
      if (!publicPath) {
        throw new Error("Could not derive a social image URL.");
      }
      store.set(storageKey, input.bytes.slice());
      return {
        storageKey,
        publicPath,
      };
    },

    async delete(input) {
      store.delete(requireKey(input.storageKey));
    },

    async read(input) {
      const stored = store.get(requireKey(input.storageKey));
      if (!stored) {
        return null;
      }
      return { bytes: stored.slice() };
    },

    async head(input) {
      const stored = store.get(requireKey(input.storageKey));
      if (!stored) {
        return null;
      }
      return { contentLength: stored.byteLength };
    },

    getPublicUrl(input) {
      const storageKey = requireKey(input.storageKey);
      const publicPath = platformSeoAssetPublicUrl(storageKey);
      if (!publicPath) {
        throw new Error("Could not derive a social image URL.");
      }
      return publicPath;
    },
  };
}
