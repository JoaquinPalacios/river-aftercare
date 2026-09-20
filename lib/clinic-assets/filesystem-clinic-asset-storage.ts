import {
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  isOwnedClinicBrandingKey,
  mimeTypeForClinicLogoExtension,
} from "@/lib/clinic-assets/clinic-logo";
import type {
  ClinicAssetStorage,
  ClinicLogoReadResult,
} from "@/lib/clinic-assets/clinic-asset-storage";
import { clinicAssetPublicUrl } from "@/lib/clinic-assets/public-url";

export const DEFAULT_CLINIC_ASSET_FILESYSTEM_ROOT = path.join(
  process.cwd(),
  ".data",
  "clinic-assets"
);

export function clinicAssetFilesystemRoot(): string {
  const override = process.env.CLINIC_ASSET_FILESYSTEM_ROOT?.trim();
  return path.resolve(override || DEFAULT_CLINIC_ASSET_FILESYSTEM_ROOT);
}

/**
 * Map a clinic branding object key onto a file under `root`.
 * Rejects absolute keys, `..`, and any path that would escape the root.
 */
export function resolveClinicAssetFilesystemPath(
  root: string,
  storageKey: string
): string | null {
  if (!storageKey || path.isAbsolute(storageKey)) {
    return null;
  }
  if (
    storageKey.includes("\0") ||
    storageKey.includes("\\") ||
    storageKey.includes("%")
  ) {
    return null;
  }

  const segments = storageKey.split("/");
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        path.isAbsolute(segment)
    )
  ) {
    return null;
  }

  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...segments);
  const relative = path.relative(resolvedRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return resolved;
}

function mimeTypeForStorageKey(storageKey: string): string | null {
  const extension = storageKey.split(".").pop() ?? "";
  return mimeTypeForClinicLogoExtension(extension);
}

function publicPathForKey(storageKey: string): string {
  const publicPath = clinicAssetPublicUrl(storageKey);
  if (!publicPath) {
    throw new Error("Could not derive a clinic logo URL.");
  }
  return publicPath;
}

async function assertInsideRoot(
  root: string,
  candidate: string
): Promise<string | null> {
  const resolved = resolveClinicAssetFilesystemPath(root, candidate);
  if (!resolved) {
    return null;
  }

  try {
    const realRoot = await realpath(root);
    const realCandidate = await realpath(resolved);
    const relative = path.relative(realRoot, realCandidate);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      return null;
    }
    return realCandidate;
  } catch {
    return resolved;
  }
}

export function createFilesystemClinicAssetStorage(options?: {
  root?: string;
}): ClinicAssetStorage {
  const root = path.resolve(options?.root ?? clinicAssetFilesystemRoot());

  return {
    async uploadLogo(input) {
      if (!isOwnedClinicBrandingKey(input.clinicId, input.storageKey)) {
        throw new Error("Clinic asset key is not owned by this clinic.");
      }
      const destination = resolveClinicAssetFilesystemPath(
        root,
        input.storageKey
      );
      if (!destination) {
        throw new Error("Clinic asset key is not allowed.");
      }

      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, input.bytes);

      return {
        clinicId: input.clinicId,
        storageKey: input.storageKey,
        publicPath: publicPathForKey(input.storageKey),
      };
    },

    async deleteLogo(input) {
      if (!isOwnedClinicBrandingKey(input.clinicId, input.storageKey)) {
        return;
      }
      const destination = resolveClinicAssetFilesystemPath(
        root,
        input.storageKey
      );
      if (!destination) {
        return;
      }
      try {
        await unlink(destination);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return;
        }
        throw error;
      }
    },

    async readLogo(input) {
      if (!isOwnedClinicBrandingKey(input.clinicId, input.storageKey)) {
        return null;
      }
      const mimeType = mimeTypeForStorageKey(input.storageKey);
      const destination = await assertInsideRoot(root, input.storageKey);
      if (!destination || !mimeType) {
        return null;
      }

      try {
        const bytes = await readFile(destination);
        return {
          bytes: new Uint8Array(bytes),
          mimeType,
        } satisfies ClinicLogoReadResult;
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return null;
        }
        throw error;
      }
    },

    async headLogo(input) {
      if (!isOwnedClinicBrandingKey(input.clinicId, input.storageKey)) {
        return null;
      }
      const destination = await assertInsideRoot(root, input.storageKey);
      if (!destination) {
        return null;
      }
      try {
        const info = await stat(destination);
        if (!info.isFile()) {
          return null;
        }
        return { contentLength: info.size };
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return null;
        }
        throw error;
      }
    },

    getPublicLogoUrl(input) {
      if (!isOwnedClinicBrandingKey(input.clinicId, input.storageKey)) {
        throw new Error("Clinic asset key is not owned by this clinic.");
      }
      if (!resolveClinicAssetFilesystemPath(root, input.storageKey)) {
        throw new Error("Clinic asset key is not allowed.");
      }
      return publicPathForKey(input.storageKey);
    },
  };
}

function isSafeFilesystemRootToReset(root: string): boolean {
  const resolved = path.resolve(root);
  const dataRoot = path.resolve(process.cwd(), ".data");
  const tmpRoot = path.resolve(os.tmpdir());
  const relativeToData = path.relative(dataRoot, resolved);
  const relativeToTmp = path.relative(tmpRoot, resolved);
  const insideData =
    relativeToData !== "" &&
    !relativeToData.startsWith("..") &&
    !path.isAbsolute(relativeToData);
  const insideTmp =
    relativeToTmp !== "" &&
    !relativeToTmp.startsWith("..") &&
    !path.isAbsolute(relativeToTmp);
  return insideData || insideTmp;
}

/** Test / E2E cleanup: delete a gitignored or tmp clinic-asset root. */
export async function resetFilesystemClinicAssetStorage(
  root = clinicAssetFilesystemRoot()
): Promise<void> {
  const resolved = path.resolve(root);
  if (!isSafeFilesystemRootToReset(resolved)) {
    throw new Error(
      "Refusing to delete a clinic asset root outside .data or the system temp directory."
    );
  }
  await rm(resolved, { recursive: true, force: true });
}
