import "server-only";

export const RIVER_CLINIC_ID_METADATA_KEY = "clinicId";

export function clinicIdFromMetadata(
  metadata: Record<string, string> | null | undefined
): string | null {
  const value = metadata?.[RIVER_CLINIC_ID_METADATA_KEY]?.trim();
  return value ? value : null;
}

export function clinicIdFromClientReference(
  clientReferenceId: string | null | undefined
): string | null {
  const value = clientReferenceId?.trim();
  return value ? value : null;
}

export function firstClinicId(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

export function stripeObjectId(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof (value as { id: unknown }).id === "string"
  ) {
    const trimmed = (value as { id: string }).id.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}
