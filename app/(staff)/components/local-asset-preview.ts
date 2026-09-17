const PREVIEWABLE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

function previewableMime(file: File): string | null {
  if (PREVIEWABLE_TYPES.has(file.type)) {
    return file.type;
  }

  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) {
    return "image/png";
  }
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (name.endsWith(".webp")) {
    return "image/webp";
  }
  if (name.endsWith(".svg")) {
    return "image/svg+xml";
  }
  return null;
}

export function isPreviewableAssetFile(file: File): boolean {
  return previewableMime(file) !== null;
}

export function createLocalAssetPreviewUrl(file: File): string | null {
  const mime = previewableMime(file);
  if (
    !mime ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return null;
  }

  try {
    const blob = file.type === mime ? file : new Blob([file], { type: mime });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export function revokeLocalAssetPreviewUrl(url: string | null): void {
  if (
    !url ||
    typeof URL === "undefined" ||
    typeof URL.revokeObjectURL !== "function"
  ) {
    return;
  }

  try {
    URL.revokeObjectURL(url);
  } catch {
    // Ignore revoke failures; the selection path must still proceed.
  }
}
