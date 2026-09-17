import "server-only";

import { randomUUID } from "node:crypto";

import { authorizeClinicLogoMutation } from "@/lib/clinic-assets/authorize-clinic-logo";
import { getClinicAssetStorage } from "@/lib/clinic-assets/get-clinic-asset-storage";
import {
  clinicLogoObjectKey,
  clinicLogoStorageKeyFromStoredValue,
  isOwnedClinicBrandingKey,
  validateClinicLogo,
} from "@/lib/clinic-assets/clinic-logo";
import {
  ClinicAssetStorageUnavailableError,
  clinicAssetErrorClass,
} from "@/lib/clinic-assets/errors";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { getPrisma } from "@/lib/prisma";

function logClinicAsset(
  event: string,
  details: {
    clinicId?: string;
    storageKey?: string;
    class?: string;
  }
): void {
  console.warn("[clinic-assets]", event, details);
}

export async function uploadClinicLogo(input: {
  actorRole: "ADMIN" | "STAFF";
  actorClinicId: string;
  targetClinicId: string;
  bytes: Uint8Array;
  mimeType: string;
  fileName?: string;
}): Promise<{ logoUrl: string; logoSrc: string }> {
  const authorized = authorizeClinicLogoMutation({
    role: input.actorRole,
    actorClinicId: input.actorClinicId,
    targetClinicId: input.targetClinicId,
  });
  if (!authorized.ok) {
    throw new ClinicPortalError(
      "You do not have permission to change this clinic logo.",
      "forbidden"
    );
  }

  const storage = getClinicAssetStorage();
  if (!storage) {
    throw new ClinicAssetStorageUnavailableError(
      "Logo upload is unavailable because clinic object storage is not configured."
    );
  }

  const validated = validateClinicLogo({
    bytes: input.bytes,
    mimeType: input.mimeType,
    fileName: input.fileName,
  });
  if (!validated.ok) {
    throw new ClinicPortalError(validated.error, "invalid");
  }

  let bytes = input.bytes;
  let mimeType = validated.mimeType;
  if (validated.kind === "svg") {
    const { sanitizeClinicLogoSvg } =
      await import("@/lib/clinic-assets/sanitize-clinic-logo-svg");
    const sanitized = sanitizeClinicLogoSvg(input.bytes);
    if (!sanitized.ok) {
      throw new ClinicPortalError(sanitized.error, "invalid");
    }
    bytes = sanitized.bytes;
    mimeType = sanitized.mimeType;
  }

  const previous = await getPrisma().clinicProfile.findUnique({
    where: { clinicId: input.targetClinicId },
    select: { logoUrl: true, displayName: true },
  });
  if (!previous) {
    throw new ClinicPortalError("Practice profile is missing.", "not_found");
  }

  const storageKey = clinicLogoObjectKey({
    clinicId: input.targetClinicId,
    objectId: randomUUID(),
    extension: validated.extension,
  });

  let uploaded;
  try {
    uploaded = await storage.uploadLogo({
      clinicId: input.targetClinicId,
      storageKey,
      bytes,
      mimeType,
    });
  } catch (error) {
    logClinicAsset("upload_failed", {
      clinicId: input.targetClinicId,
      storageKey,
      class: clinicAssetErrorClass(error),
    });
    throw new ClinicPortalError("Could not store the clinic logo.", "invalid");
  }

  try {
    await getPrisma().clinicProfile.update({
      where: { clinicId: input.targetClinicId },
      data: { logoUrl: uploaded.storageKey },
    });
  } catch (error) {
    logClinicAsset("db_update_failed_after_upload", {
      clinicId: input.targetClinicId,
      storageKey: uploaded.storageKey,
      class: clinicAssetErrorClass(error),
    });
    try {
      await storage.deleteLogo({
        clinicId: input.targetClinicId,
        storageKey: uploaded.storageKey,
      });
    } catch (cleanupError) {
      logClinicAsset("orphan_cleanup_failed", {
        clinicId: input.targetClinicId,
        storageKey: uploaded.storageKey,
        class: clinicAssetErrorClass(cleanupError),
      });
    }
    throw new ClinicPortalError("Could not update the clinic logo.", "invalid");
  }

  const previousKey = clinicLogoStorageKeyFromStoredValue(previous.logoUrl);
  if (
    isOwnedClinicBrandingKey(input.targetClinicId, previousKey) &&
    previousKey !== uploaded.storageKey
  ) {
    try {
      await storage.deleteLogo({
        clinicId: input.targetClinicId,
        storageKey: previousKey,
      });
    } catch (error) {
      logClinicAsset("previous_object_delete_failed", {
        clinicId: input.targetClinicId,
        storageKey: previousKey,
        class: clinicAssetErrorClass(error),
      });
    }
  }

  logClinicAsset("upload_succeeded", {
    clinicId: input.targetClinicId,
    storageKey: uploaded.storageKey,
  });

  return {
    logoUrl: uploaded.storageKey,
    logoSrc: storage.getPublicLogoUrl({
      clinicId: input.targetClinicId,
      storageKey: uploaded.storageKey,
    }),
  };
}

export async function removeClinicLogo(input: {
  actorRole: "ADMIN" | "STAFF";
  actorClinicId: string;
  targetClinicId: string;
}): Promise<void> {
  const authorized = authorizeClinicLogoMutation({
    role: input.actorRole,
    actorClinicId: input.actorClinicId,
    targetClinicId: input.targetClinicId,
  });
  if (!authorized.ok) {
    throw new ClinicPortalError(
      "You do not have permission to change this clinic logo.",
      "forbidden"
    );
  }

  const storage = getClinicAssetStorage();
  if (!storage) {
    throw new ClinicAssetStorageUnavailableError(
      "Logo upload is unavailable because clinic object storage is not configured."
    );
  }

  const previous = await getPrisma().clinicProfile.findUnique({
    where: { clinicId: input.targetClinicId },
    select: { logoUrl: true },
  });
  if (!previous) {
    throw new ClinicPortalError("Practice profile is missing.", "not_found");
  }

  await getPrisma().clinicProfile.update({
    where: { clinicId: input.targetClinicId },
    data: { logoUrl: null },
  });

  const previousKey = clinicLogoStorageKeyFromStoredValue(previous.logoUrl);
  if (isOwnedClinicBrandingKey(input.targetClinicId, previousKey)) {
    try {
      await storage.deleteLogo({
        clinicId: input.targetClinicId,
        storageKey: previousKey,
      });
    } catch (error) {
      logClinicAsset("previous_object_delete_failed", {
        clinicId: input.targetClinicId,
        storageKey: previousKey,
        class: clinicAssetErrorClass(error),
      });
    }
  }

  logClinicAsset("remove_succeeded", {
    clinicId: input.targetClinicId,
    ...(previousKey ? { storageKey: previousKey } : {}),
  });
}
