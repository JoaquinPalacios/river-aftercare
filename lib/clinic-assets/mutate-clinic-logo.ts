import "server-only";

import { randomUUID } from "node:crypto";

import type { PlatformRole } from "@prisma/client";

import { authorizeClinicLogoMutation } from "@/lib/clinic-assets/authorize-clinic-logo";
import { getClinicAssetStorage } from "@/lib/clinic-assets/get-clinic-asset-storage";
import {
  clinicLogoObjectKey,
  clinicLogoStorageKeyFromStoredValue,
  isOwnedClinicBrandingKey,
  validateClinicLogo,
  type ClinicLogoExtension,
} from "@/lib/clinic-assets/clinic-logo";
import { validateClinicFavicon } from "@/lib/clinic-assets/clinic-favicon";
import {
  ClinicAssetStorageUnavailableError,
  clinicAssetErrorClass,
} from "@/lib/clinic-assets/errors";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { syncBrandingAssetReference } from "@/lib/clinic-portal/sync-practice-chrome";
import { getPrisma } from "@/lib/prisma";

export type ClinicBrandingAssetField = "logoUrl" | "darkLogoUrl" | "faviconUrl";

const BRANDING_ASSET_FIELDS = [
  "logoUrl",
  "darkLogoUrl",
  "faviconUrl",
] as const satisfies readonly ClinicBrandingAssetField[];

const FIELD_COPY: Record<
  ClinicBrandingAssetField,
  { permission: string; store: string; update: string; missing: string }
> = {
  logoUrl: {
    permission: "You do not have permission to change this clinic logo.",
    store: "Could not store the clinic logo.",
    update: "Could not update the clinic logo.",
    missing: "Practice profile is missing.",
  },
  darkLogoUrl: {
    permission: "You do not have permission to change this clinic logo.",
    store: "Could not store the Dark-mode logo.",
    update: "Could not update the Dark-mode logo.",
    missing: "Practice profile is missing.",
  },
  faviconUrl: {
    permission: "You do not have permission to change this clinic favicon.",
    store: "Could not store the clinic favicon.",
    update: "Could not update the clinic favicon.",
    missing: "Practice profile is missing.",
  },
};

function logClinicAsset(
  event: string,
  details: {
    clinicId?: string;
    storageKey?: string;
    field?: ClinicBrandingAssetField;
    class?: string;
  }
): void {
  console.warn("[clinic-assets]", event, details);
}

type BrandingAssetProfile = {
  logoUrl: string | null;
  darkLogoUrl: string | null;
  faviconUrl: string | null;
};

function storedKeyForField(
  profile: BrandingAssetProfile,
  field: ClinicBrandingAssetField
): string | null {
  return clinicLogoStorageKeyFromStoredValue(profile[field]);
}

function otherFieldsStillUseKey(
  profile: BrandingAssetProfile,
  field: ClinicBrandingAssetField,
  storageKey: string
): boolean {
  return BRANDING_ASSET_FIELDS.some(
    (candidate) =>
      candidate !== field &&
      storedKeyForField(profile, candidate) === storageKey
  );
}

async function loadBrandingProfile(
  clinicId: string
): Promise<BrandingAssetProfile | null> {
  const [profile, sites] = await Promise.all([
    getPrisma().clinicProfile.findUnique({
      where: { clinicId },
      select: { clinicId: true },
    }),
    getPrisma().clinicSite.findMany({
      where: { clinicId, isPrimary: true, active: true },
      select: {
        clinicId: true,
        logoUrl: true,
        darkLogoUrl: true,
        faviconUrl: true,
      },
    }),
  ]);

  const site = sites.length === 1 ? sites[0] : null;
  if (!profile || !site || site.clinicId !== clinicId) {
    return null;
  }

  return {
    logoUrl: site.logoUrl,
    darkLogoUrl: site.darkLogoUrl,
    faviconUrl: site.faviconUrl,
  };
}

export async function uploadClinicBrandingAsset(input: {
  field: ClinicBrandingAssetField;
  actorRole: "ADMIN" | "STAFF";
  actorClinicId: string;
  targetClinicId: string;
  platformRole?: PlatformRole | "NONE" | "OPERATOR";
  bytes: Uint8Array;
  mimeType: string;
  fileName?: string;
}): Promise<{ storageKey: string; publicSrc: string }> {
  const copy = FIELD_COPY[input.field];
  const authorized = authorizeClinicLogoMutation({
    role: input.actorRole,
    actorClinicId: input.actorClinicId,
    targetClinicId: input.targetClinicId,
    platformRole: input.platformRole,
  });
  if (!authorized.ok) {
    throw new ClinicPortalError(copy.permission, "forbidden");
  }

  const storage = getClinicAssetStorage();
  if (!storage) {
    throw new ClinicAssetStorageUnavailableError(
      "Logo upload is unavailable because clinic object storage is not configured."
    );
  }

  let extension: ClinicLogoExtension;
  let mimeType: string;
  let bytes = input.bytes;

  if (input.field === "faviconUrl") {
    const validated = validateClinicFavicon({
      bytes: input.bytes,
      mimeType: input.mimeType,
      fileName: input.fileName,
    });
    if (!validated.ok) {
      throw new ClinicPortalError(validated.error, "invalid");
    }
    extension = validated.extension;
    mimeType = validated.mimeType;
  } else {
    const validated = validateClinicLogo({
      bytes: input.bytes,
      mimeType: input.mimeType,
      fileName: input.fileName,
    });
    if (!validated.ok) {
      throw new ClinicPortalError(validated.error, "invalid");
    }
    extension = validated.extension;
    mimeType = validated.mimeType;
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
  }

  const previous = await loadBrandingProfile(input.targetClinicId);
  if (!previous) {
    throw new ClinicPortalError(copy.missing, "not_found");
  }

  const storageKey = clinicLogoObjectKey({
    clinicId: input.targetClinicId,
    objectId: randomUUID(),
    extension,
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
      field: input.field,
      class: clinicAssetErrorClass(error),
    });
    throw new ClinicPortalError(copy.store, "invalid");
  }

  try {
    await getPrisma().$transaction((tx) =>
      syncBrandingAssetReference(tx, {
        clinicId: input.targetClinicId,
        field: input.field,
        storageKey: uploaded.storageKey,
      })
    );
  } catch (error) {
    logClinicAsset("db_update_failed_after_upload", {
      clinicId: input.targetClinicId,
      storageKey: uploaded.storageKey,
      field: input.field,
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
        field: input.field,
        class: clinicAssetErrorClass(cleanupError),
      });
    }
    throw new ClinicPortalError(copy.update, "invalid");
  }

  const previousKey = storedKeyForField(previous, input.field);
  if (
    isOwnedClinicBrandingKey(input.targetClinicId, previousKey) &&
    previousKey !== uploaded.storageKey &&
    !otherFieldsStillUseKey(previous, input.field, previousKey)
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
        field: input.field,
        class: clinicAssetErrorClass(error),
      });
    }
  }

  logClinicAsset("upload_succeeded", {
    clinicId: input.targetClinicId,
    storageKey: uploaded.storageKey,
    field: input.field,
  });

  return {
    storageKey: uploaded.storageKey,
    publicSrc: storage.getPublicLogoUrl({
      clinicId: input.targetClinicId,
      storageKey: uploaded.storageKey,
    }),
  };
}

export async function removeClinicBrandingAsset(input: {
  field: ClinicBrandingAssetField;
  actorRole: "ADMIN" | "STAFF";
  actorClinicId: string;
  targetClinicId: string;
  platformRole?: PlatformRole | "NONE" | "OPERATOR";
}): Promise<void> {
  const copy = FIELD_COPY[input.field];
  const authorized = authorizeClinicLogoMutation({
    role: input.actorRole,
    actorClinicId: input.actorClinicId,
    targetClinicId: input.targetClinicId,
    platformRole: input.platformRole,
  });
  if (!authorized.ok) {
    throw new ClinicPortalError(copy.permission, "forbidden");
  }

  const storage = getClinicAssetStorage();
  if (!storage) {
    throw new ClinicAssetStorageUnavailableError(
      "Logo upload is unavailable because clinic object storage is not configured."
    );
  }

  const previous = await loadBrandingProfile(input.targetClinicId);
  if (!previous) {
    throw new ClinicPortalError(copy.missing, "not_found");
  }

  await getPrisma().$transaction((tx) =>
    syncBrandingAssetReference(tx, {
      clinicId: input.targetClinicId,
      field: input.field,
      storageKey: null,
    })
  );

  const previousKey = storedKeyForField(previous, input.field);
  if (
    isOwnedClinicBrandingKey(input.targetClinicId, previousKey) &&
    !otherFieldsStillUseKey(previous, input.field, previousKey)
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
        field: input.field,
        class: clinicAssetErrorClass(error),
      });
    }
  }

  logClinicAsset("remove_succeeded", {
    clinicId: input.targetClinicId,
    field: input.field,
    ...(previousKey ? { storageKey: previousKey } : {}),
  });
}

export async function uploadClinicLogo(input: {
  actorRole: "ADMIN" | "STAFF";
  actorClinicId: string;
  targetClinicId: string;
  platformRole?: PlatformRole | "NONE" | "OPERATOR";
  bytes: Uint8Array;
  mimeType: string;
  fileName?: string;
}): Promise<{ logoUrl: string; logoSrc: string }> {
  const uploaded = await uploadClinicBrandingAsset({
    ...input,
    field: "logoUrl",
  });
  return {
    logoUrl: uploaded.storageKey,
    logoSrc: uploaded.publicSrc,
  };
}

export async function removeClinicLogo(input: {
  actorRole: "ADMIN" | "STAFF";
  actorClinicId: string;
  targetClinicId: string;
  platformRole?: PlatformRole | "NONE" | "OPERATOR";
}): Promise<void> {
  await removeClinicBrandingAsset({
    ...input,
    field: "logoUrl",
  });
}

export async function uploadClinicDarkLogo(input: {
  actorRole: "ADMIN" | "STAFF";
  actorClinicId: string;
  targetClinicId: string;
  platformRole?: PlatformRole | "NONE" | "OPERATOR";
  bytes: Uint8Array;
  mimeType: string;
  fileName?: string;
}): Promise<{ logoUrl: string; logoSrc: string }> {
  const uploaded = await uploadClinicBrandingAsset({
    ...input,
    field: "darkLogoUrl",
  });
  return {
    logoUrl: uploaded.storageKey,
    logoSrc: uploaded.publicSrc,
  };
}

export async function removeClinicDarkLogo(input: {
  actorRole: "ADMIN" | "STAFF";
  actorClinicId: string;
  targetClinicId: string;
  platformRole?: PlatformRole | "NONE" | "OPERATOR";
}): Promise<void> {
  await removeClinicBrandingAsset({
    ...input,
    field: "darkLogoUrl",
  });
}

export async function uploadClinicFavicon(input: {
  actorRole: "ADMIN" | "STAFF";
  actorClinicId: string;
  targetClinicId: string;
  platformRole?: PlatformRole | "NONE" | "OPERATOR";
  bytes: Uint8Array;
  mimeType: string;
  fileName?: string;
}): Promise<{ faviconUrl: string; faviconSrc: string }> {
  const uploaded = await uploadClinicBrandingAsset({
    ...input,
    field: "faviconUrl",
  });
  return {
    faviconUrl: uploaded.storageKey,
    faviconSrc: uploaded.publicSrc,
  };
}

export async function removeClinicFavicon(input: {
  actorRole: "ADMIN" | "STAFF";
  actorClinicId: string;
  targetClinicId: string;
  platformRole?: PlatformRole | "NONE" | "OPERATOR";
}): Promise<void> {
  await removeClinicBrandingAsset({
    ...input,
    field: "faviconUrl",
  });
}
