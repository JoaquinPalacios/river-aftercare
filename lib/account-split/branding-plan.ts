import { createHash } from "node:crypto";

import {
  clinicLogoStorageKeyFromStoredValue,
  isClinicLogoStorageKey,
  isOwnedClinicBrandingKey,
} from "@/lib/clinic-assets/clinic-logo";

const STORAGE_EXTENSION = /\.(png|jpe?g|webp|svg)$/;
const SAFE_ID = /^[A-Za-z0-9._-]+$/;

export const SPLIT_BRANDING_FIELDS = [
  "logoUrl",
  "darkLogoUrl",
  "faviconUrl",
] as const;

export type SplitBrandingField = (typeof SPLIT_BRANDING_FIELDS)[number];

export type SplitBrandingSite = {
  logoUrl: string | null;
  darkLogoUrl: string | null;
  faviconUrl: string | null;
};

export type SplitBrandingAssetRow = {
  sourceStorageKey: string;
  destinationStorageKey: string;
};

type ClassifiedBrandingValue =
  | { kind: "empty" }
  | { kind: "static"; value: string }
  | { kind: "owned"; sourceStorageKey: string }
  | { kind: "unready" };

export function splitDestinationBrandingKey(input: {
  destinationClinicId: string;
  preparationId: string;
  sourceStorageKey: string;
}): string | null {
  if (
    !SAFE_ID.test(input.destinationClinicId) ||
    !SAFE_ID.test(input.preparationId) ||
    !isOwnedClinicBrandingKey(
      sourceClinicIdFromKey(input.sourceStorageKey) ?? "",
      input.sourceStorageKey
    )
  ) {
    return null;
  }
  const extension = STORAGE_EXTENSION.exec(input.sourceStorageKey)?.[1];
  if (!extension) {
    return null;
  }
  const digest = createHash("sha256")
    .update(input.sourceStorageKey)
    .digest("hex")
    .slice(0, 16);
  const key = `clinics/${input.destinationClinicId}/branding/split-${input.preparationId}-${digest}.${extension}`;
  if (!isClinicLogoStorageKey(key)) {
    return null;
  }
  if (!isOwnedClinicBrandingKey(input.destinationClinicId, key)) {
    return null;
  }
  return key;
}

export function classifySplitBrandingValue(
  sourceClinicId: string,
  value: string | null
): ClassifiedBrandingValue {
  if (!value || value.trim() === "") {
    return { kind: "empty" };
  }
  const trimmed = value.trim();
  const storageKey = clinicLogoStorageKeyFromStoredValue(trimmed);
  if (storageKey) {
    if (isOwnedClinicBrandingKey(sourceClinicId, storageKey)) {
      return { kind: "owned", sourceStorageKey: storageKey };
    }
    return { kind: "unready" };
  }
  if (
    trimmed.startsWith("clinics/") ||
    trimmed.startsWith("/clinics/") ||
    trimmed.startsWith("/clinic-branding/")
  ) {
    return { kind: "unready" };
  }
  return { kind: "static", value: trimmed };
}

export function planSplitSiteBranding(input: {
  sourceClinicId: string;
  destinationClinicId: string | null;
  site: SplitBrandingSite | null;
  preparationId: string;
  assets: SplitBrandingAssetRow[];
}): {
  ready: boolean;
  values: SplitBrandingSite | null;
} {
  if (!input.site) {
    return { ready: true, values: null };
  }
  const assets = new Map(
    input.assets.map((asset) => [
      asset.sourceStorageKey,
      asset.destinationStorageKey,
    ])
  );
  const values: SplitBrandingSite = {
    logoUrl: null,
    darkLogoUrl: null,
    faviconUrl: null,
  };
  for (const field of SPLIT_BRANDING_FIELDS) {
    const classified = classifySplitBrandingValue(
      input.sourceClinicId,
      input.site[field]
    );
    if (classified.kind === "empty") {
      values[field] = null;
      continue;
    }
    if (classified.kind === "static") {
      values[field] = classified.value;
      continue;
    }
    if (classified.kind === "unready" || !input.destinationClinicId) {
      return { ready: false, values: null };
    }
    const destinationKey = splitDestinationBrandingKey({
      destinationClinicId: input.destinationClinicId,
      preparationId: input.preparationId,
      sourceStorageKey: classified.sourceStorageKey,
    });
    const mapped = assets.get(classified.sourceStorageKey);
    if (
      !destinationKey ||
      mapped !== destinationKey ||
      !isOwnedClinicBrandingKey(input.destinationClinicId, mapped)
    ) {
      return { ready: false, values: null };
    }
    values[field] = destinationKey;
  }
  return { ready: true, values };
}

export function ownedSourceBrandingKeys(
  sourceClinicId: string,
  site: SplitBrandingSite
): string[] {
  const keys: string[] = [];
  for (const field of SPLIT_BRANDING_FIELDS) {
    const classified = classifySplitBrandingValue(sourceClinicId, site[field]);
    if (
      classified.kind === "owned" &&
      !keys.includes(classified.sourceStorageKey)
    ) {
      keys.push(classified.sourceStorageKey);
    }
  }
  return keys;
}

function sourceClinicIdFromKey(storageKey: string): string | null {
  const match = /^clinics\/([A-Za-z0-9._-]+)\/branding\//.exec(storageKey);
  return match?.[1] ?? null;
}
