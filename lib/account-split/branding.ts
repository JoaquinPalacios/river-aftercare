import "server-only";

import type { ClinicAssetStorage } from "@/lib/clinic-assets/clinic-asset-storage";
import { mimeTypeForClinicLogoExtension } from "@/lib/clinic-assets/clinic-logo";
import { isOwnedClinicBrandingKey } from "@/lib/clinic-assets/clinic-logo";
import { getClinicAssetStorage } from "@/lib/clinic-assets/get-clinic-asset-storage";
import {
  classifySplitBrandingValue,
  ownedSourceBrandingKeys,
  SPLIT_BRANDING_FIELDS,
  splitDestinationBrandingKey,
  type SplitBrandingSite,
} from "@/lib/account-split/branding-plan";
import { recordAccountSplitEvent } from "@/lib/account-split/events";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { getPrisma } from "@/lib/prisma";

const ENABLED_OPERATION = "SITE_TO_NEW_ACCOUNT" as const;

export async function prepareAccountSplitBranding(input: {
  preparationId: string;
  operatorUserId: string;
  storage?: ClinicAssetStorage;
}): Promise<{ copied: number }> {
  const operator = await getPrisma().user.findUnique({
    where: { id: input.operatorUserId },
    select: { platformRole: true },
  });
  if (operator?.platformRole !== "OPERATOR") {
    throw new ClinicPortalError(
      "Only a platform operator can prepare split branding.",
      "forbidden"
    );
  }

  const loaded = await getPrisma().$transaction(async (tx) => {
    const preparation = await tx.clinicAccountSplitPreparation.findUnique({
      where: { id: input.preparationId },
      select: {
        id: true,
        status: true,
        operationKind: true,
        sourceClinicId: true,
        destinationClinicId: true,
      },
    });
    if (!preparation) {
      throw new ClinicPortalError(
        "That preparation was not found.",
        "not_found"
      );
    }
    if (
      preparation.status === "COMPLETED" ||
      preparation.status === "CANCELLED"
    ) {
      return { kind: "closed" as const };
    }
    if (preparation.operationKind !== ENABLED_OPERATION) {
      throw new ClinicPortalError(
        "This structural operation is not available.",
        "invalid"
      );
    }
    if (!preparation.destinationClinicId) {
      throw new ClinicPortalError(
        "Create the destination shell Account before preparing branding.",
        "conflict"
      );
    }
    const decision = await tx.clinicAccountSplitSiteDecision.findFirst({
      where: { preparationId: preparation.id, decision: "SPLIT" },
      select: { clinicSiteId: true },
    });
    if (!decision) {
      throw new ClinicPortalError(
        "Choose the Clinic Site to move before preparing branding.",
        "conflict"
      );
    }
    const site = await tx.clinicSite.findFirst({
      where: {
        id: decision.clinicSiteId,
        clinicId: preparation.sourceClinicId,
      },
      select: {
        id: true,
        logoUrl: true,
        darkLogoUrl: true,
        faviconUrl: true,
      },
    });
    if (!site) {
      throw new ClinicPortalError(
        "The Clinic Site to move could not be found.",
        "not_found"
      );
    }
    return {
      kind: "open" as const,
      preparationId: preparation.id,
      sourceClinicId: preparation.sourceClinicId,
      destinationClinicId: preparation.destinationClinicId,
      site,
    };
  });

  if (loaded.kind === "closed") {
    return { copied: 0 };
  }

  let sourceKeys: string[];
  try {
    sourceKeys = assertCopyableBranding({
      sourceClinicId: loaded.sourceClinicId,
      destinationClinicId: loaded.destinationClinicId,
      preparationId: loaded.preparationId,
      site: loaded.site,
    });
  } catch (error) {
    await recordBrandingFailure(loaded, "branding_ownership_rejected");
    throw error;
  }
  if (sourceKeys.length === 0) {
    return { copied: 0 };
  }

  const storage = input.storage ?? getClinicAssetStorage();
  if (!storage) {
    await recordBrandingFailure(loaded, "branding_storage_unavailable");
    throw new ClinicPortalError(
      "Clinic branding storage is not available.",
      "conflict"
    );
  }

  const copied: Array<{
    sourceStorageKey: string;
    destinationStorageKey: string;
  }> = [];
  try {
    for (const sourceStorageKey of sourceKeys) {
      const destinationStorageKey = splitDestinationBrandingKey({
        destinationClinicId: loaded.destinationClinicId,
        preparationId: loaded.preparationId,
        sourceStorageKey,
      });
      if (
        !destinationStorageKey ||
        !isOwnedClinicBrandingKey(loaded.sourceClinicId, sourceStorageKey) ||
        !isOwnedClinicBrandingKey(
          loaded.destinationClinicId,
          destinationStorageKey
        )
      ) {
        throw new ClinicPortalError(
          "Destination branding could not be prepared.",
          "conflict"
        );
      }
      await copyOwnedBrandingObject({
        storage,
        sourceClinicId: loaded.sourceClinicId,
        destinationClinicId: loaded.destinationClinicId,
        sourceStorageKey,
        destinationStorageKey,
      });
      copied.push({ sourceStorageKey, destinationStorageKey });
    }
  } catch (error) {
    const category =
      error instanceof ClinicPortalError &&
      error.message === "A source branding file could not be read."
        ? "branding_source_missing"
        : "branding_copy_failed";
    await recordBrandingFailure(loaded, category);
    if (error instanceof ClinicPortalError) {
      throw error;
    }
    throw new ClinicPortalError(
      "Destination branding could not be prepared.",
      "conflict"
    );
  }

  await getPrisma().$transaction(async (tx) => {
    const preparation = await tx.clinicAccountSplitPreparation.findUnique({
      where: { id: loaded.preparationId },
      select: {
        id: true,
        status: true,
        sourceClinicId: true,
        destinationClinicId: true,
      },
    });
    if (
      !preparation ||
      preparation.status === "COMPLETED" ||
      preparation.status === "CANCELLED" ||
      preparation.destinationClinicId !== loaded.destinationClinicId
    ) {
      return;
    }
    const site = await tx.clinicSite.findFirst({
      where: { id: loaded.site.id, clinicId: preparation.sourceClinicId },
      select: { logoUrl: true, darkLogoUrl: true, faviconUrl: true },
    });
    if (!site) {
      return;
    }
    const currentKeys = new Set(
      ownedSourceBrandingKeys(preparation.sourceClinicId, site)
    );
    let changed = false;
    for (const copy of copied) {
      if (!currentKeys.has(copy.sourceStorageKey)) {
        continue;
      }
      const existing = await tx.clinicAccountSplitBrandingAsset.findUnique({
        where: {
          preparationId_sourceStorageKey: {
            preparationId: preparation.id,
            sourceStorageKey: copy.sourceStorageKey,
          },
        },
        select: { destinationStorageKey: true },
      });
      if (!existing) {
        await tx.clinicAccountSplitBrandingAsset.create({
          data: {
            preparationId: preparation.id,
            sourceStorageKey: copy.sourceStorageKey,
            destinationStorageKey: copy.destinationStorageKey,
          },
        });
        changed = true;
      } else if (
        existing.destinationStorageKey !== copy.destinationStorageKey
      ) {
        await tx.clinicAccountSplitBrandingAsset.update({
          where: {
            preparationId_sourceStorageKey: {
              preparationId: preparation.id,
              sourceStorageKey: copy.sourceStorageKey,
            },
          },
          data: {
            destinationStorageKey: copy.destinationStorageKey,
            copiedAt: new Date(),
          },
        });
        changed = true;
      } else {
        await tx.clinicAccountSplitBrandingAsset.update({
          where: {
            preparationId_sourceStorageKey: {
              preparationId: preparation.id,
              sourceStorageKey: copy.sourceStorageKey,
            },
          },
          data: { copiedAt: new Date() },
        });
      }
    }
    if (changed) {
      await tx.clinicAccountSplitPreparation.update({
        where: { id: preparation.id },
        data: { preparationRevision: { increment: 1 } },
      });
    }
    await recordAccountSplitEvent(tx, {
      preparationId: preparation.id,
      kind: "BRANDING_PREPARED",
      actorUserId: input.operatorUserId,
      sourceClinicId: preparation.sourceClinicId,
      destinationClinicId: preparation.destinationClinicId,
      siteId: loaded.site.id,
      category: "branding_prepared",
    });
  });

  return { copied: copied.length };
}

export async function copyOwnedBrandingObject(input: {
  storage: ClinicAssetStorage;
  sourceClinicId: string;
  destinationClinicId: string;
  sourceStorageKey: string;
  destinationStorageKey: string;
}): Promise<void> {
  if (!isOwnedClinicBrandingKey(input.sourceClinicId, input.sourceStorageKey)) {
    throw new ClinicPortalError(
      "Destination branding could not be prepared.",
      "conflict"
    );
  }
  if (
    !isOwnedClinicBrandingKey(
      input.destinationClinicId,
      input.destinationStorageKey
    )
  ) {
    throw new ClinicPortalError(
      "Destination branding could not be prepared.",
      "conflict"
    );
  }
  const object = await input.storage.readLogo({
    clinicId: input.sourceClinicId,
    storageKey: input.sourceStorageKey,
  });
  if (!object) {
    throw new ClinicPortalError(
      "A source branding file could not be read.",
      "conflict"
    );
  }
  const extension = input.destinationStorageKey.split(".").pop() ?? "";
  await input.storage.uploadLogo({
    clinicId: input.destinationClinicId,
    storageKey: input.destinationStorageKey,
    bytes: object.bytes,
    mimeType: mimeTypeForClinicLogoExtension(extension) ?? object.mimeType,
  });
}

function assertCopyableBranding(input: {
  sourceClinicId: string;
  destinationClinicId: string;
  preparationId: string;
  site: SplitBrandingSite;
}): string[] {
  const keys: string[] = [];
  for (const field of SPLIT_BRANDING_FIELDS) {
    const classified = classifySplitBrandingValue(
      input.sourceClinicId,
      input.site[field]
    );
    if (classified.kind === "unready") {
      throw new ClinicPortalError(
        "Destination branding could not be prepared.",
        "conflict"
      );
    }
    if (classified.kind !== "owned") {
      continue;
    }
    const destinationKey = splitDestinationBrandingKey({
      destinationClinicId: input.destinationClinicId,
      preparationId: input.preparationId,
      sourceStorageKey: classified.sourceStorageKey,
    });
    if (
      !destinationKey ||
      !isOwnedClinicBrandingKey(
        input.sourceClinicId,
        classified.sourceStorageKey
      ) ||
      !isOwnedClinicBrandingKey(input.destinationClinicId, destinationKey)
    ) {
      throw new ClinicPortalError(
        "Destination branding could not be prepared.",
        "conflict"
      );
    }
    if (!keys.includes(classified.sourceStorageKey)) {
      keys.push(classified.sourceStorageKey);
    }
  }
  return keys;
}

async function recordBrandingFailure(
  loaded: {
    preparationId: string;
    sourceClinicId: string;
    destinationClinicId: string;
    site: { id: string };
  },
  category: string
): Promise<void> {
  try {
    await recordAccountSplitEvent(getPrisma(), {
      preparationId: loaded.preparationId,
      kind: "BRANDING_PREPARATION_FAILED",
      sourceClinicId: loaded.sourceClinicId,
      destinationClinicId: loaded.destinationClinicId,
      siteId: loaded.site.id,
      category,
    });
  } catch {
    // The copy failure is the operator-facing result. Audit write failure
    // must not hide it.
  }
}
