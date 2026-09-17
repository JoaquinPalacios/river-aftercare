import "server-only";

import { randomUUID } from "node:crypto";

import {
  ClinicAssetStorageUnavailableError,
  clinicAssetErrorClass,
} from "@/lib/clinic-assets/errors";
import { getPlatformSeoAssetStorage } from "@/lib/platform-assets/get-platform-seo-asset-storage";
import { PlatformSeoAssetError } from "@/lib/platform-assets/errors";
import {
  platformSeoObjectKey,
  platformSeoPublicPath,
  validatePlatformSeoImage,
} from "@/lib/platform-assets/platform-seo-image";
import { managedPlatformSeoStorageKeyForDeletion } from "@/lib/platform-assets/public-url";
import { getPrisma } from "@/lib/prisma";
import { DEFAULT_PLATFORM_SEO } from "@/lib/seo/defaults";
import { PLATFORM_SEO_ID } from "@/lib/seo/types";

function logPlatformAsset(
  event: string,
  details: {
    storageKey?: string;
    class?: string;
  }
): void {
  console.warn("[platform-assets]", event, details);
}

function storedOgPath(storageKey: string): string {
  const path = platformSeoPublicPath(storageKey);
  if (!path) {
    throw new PlatformSeoAssetError(
      "Could not derive a social image path.",
      "invalid"
    );
  }
  return path;
}

async function persistDefaultOgImagePath(path: string | null): Promise<void> {
  await getPrisma().platformSeoSettings.upsert({
    where: { id: PLATFORM_SEO_ID },
    create: {
      id: PLATFORM_SEO_ID,
      siteName: DEFAULT_PLATFORM_SEO.siteName,
      defaultDescription: DEFAULT_PLATFORM_SEO.defaultDescription,
      organizationName: DEFAULT_PLATFORM_SEO.organizationName,
      organizationDescription: DEFAULT_PLATFORM_SEO.organizationDescription,
      publicContactEmail: DEFAULT_PLATFORM_SEO.publicContactEmail,
      defaultOgImagePath: path,
      sameAsUrls: DEFAULT_PLATFORM_SEO.sameAsUrls,
    },
    update: {
      defaultOgImagePath: path,
    },
  });
}

export async function uploadPlatformSeoOgImage(input: {
  actorIsPlatformOperator: boolean;
  bytes: Uint8Array;
  mimeType: string;
  fileName?: string;
}): Promise<{ defaultOgImagePath: string; imageSrc: string }> {
  if (!input.actorIsPlatformOperator) {
    throw new PlatformSeoAssetError(
      "You do not have permission to change the default social image.",
      "forbidden"
    );
  }

  const storage = getPlatformSeoAssetStorage();
  if (!storage) {
    throw new ClinicAssetStorageUnavailableError(
      "Social image upload is unavailable because object storage is not configured."
    );
  }

  const validated = validatePlatformSeoImage({
    bytes: input.bytes,
    mimeType: input.mimeType,
    fileName: input.fileName,
  });
  if (!validated.ok) {
    throw new PlatformSeoAssetError(validated.error, "invalid");
  }

  const previous = await getPrisma().platformSeoSettings.findUnique({
    where: { id: PLATFORM_SEO_ID },
    select: { defaultOgImagePath: true },
  });

  const storageKey = platformSeoObjectKey({
    objectId: randomUUID(),
    extension: validated.extension,
  });

  let uploaded;
  try {
    uploaded = await storage.upload({
      storageKey,
      bytes: input.bytes,
      mimeType: validated.mimeType,
    });
  } catch (error) {
    logPlatformAsset("upload_failed", {
      storageKey,
      class: clinicAssetErrorClass(error),
    });
    throw new PlatformSeoAssetError(
      "Could not store the social image.",
      "invalid"
    );
  }

  const defaultOgImagePath = storedOgPath(uploaded.storageKey);

  try {
    await persistDefaultOgImagePath(defaultOgImagePath);
  } catch (error) {
    logPlatformAsset("db_update_failed_after_upload", {
      storageKey: uploaded.storageKey,
      class: clinicAssetErrorClass(error),
    });
    try {
      await storage.delete({ storageKey: uploaded.storageKey });
    } catch (cleanupError) {
      logPlatformAsset("orphan_cleanup_failed", {
        storageKey: uploaded.storageKey,
        class: clinicAssetErrorClass(cleanupError),
      });
    }
    throw new PlatformSeoAssetError(
      "Could not update the default social image.",
      "invalid"
    );
  }

  const previousKey = managedPlatformSeoStorageKeyForDeletion(
    previous?.defaultOgImagePath
  );
  if (previousKey && previousKey !== uploaded.storageKey) {
    try {
      await storage.delete({ storageKey: previousKey });
    } catch (error) {
      logPlatformAsset("previous_object_delete_failed", {
        storageKey: previousKey,
        class: clinicAssetErrorClass(error),
      });
    }
  }

  logPlatformAsset("upload_succeeded", {
    storageKey: uploaded.storageKey,
  });

  return {
    defaultOgImagePath,
    imageSrc: storage.getPublicUrl({ storageKey: uploaded.storageKey }),
  };
}

export async function removePlatformSeoOgImage(input: {
  actorIsPlatformOperator: boolean;
}): Promise<void> {
  if (!input.actorIsPlatformOperator) {
    throw new PlatformSeoAssetError(
      "You do not have permission to change the default social image.",
      "forbidden"
    );
  }

  const storage = getPlatformSeoAssetStorage();
  if (!storage) {
    throw new ClinicAssetStorageUnavailableError(
      "Social image upload is unavailable because object storage is not configured."
    );
  }

  const previous = await getPrisma().platformSeoSettings.findUnique({
    where: { id: PLATFORM_SEO_ID },
    select: { defaultOgImagePath: true },
  });
  if (!previous) {
    return;
  }

  await persistDefaultOgImagePath(null);

  const previousKey = managedPlatformSeoStorageKeyForDeletion(
    previous.defaultOgImagePath
  );
  if (previousKey) {
    try {
      await storage.delete({ storageKey: previousKey });
    } catch (error) {
      logPlatformAsset("previous_object_delete_failed", {
        storageKey: previousKey,
        class: clinicAssetErrorClass(error),
      });
    }
  }

  logPlatformAsset("remove_succeeded", {
    ...(previousKey ? { storageKey: previousKey } : {}),
  });
}
