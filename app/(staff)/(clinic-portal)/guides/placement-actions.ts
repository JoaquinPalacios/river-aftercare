"use server";

import { revalidatePath } from "next/cache";

import { requireClinicAdmin } from "@/lib/auth/require-clinic-admin";
import { enforcePrePaymentActivationGate } from "@/lib/billing/activation-gate";
import { isClinicPortalError } from "@/lib/clinic-portal/errors";
import {
  detachPlacementGuide,
  setGuideAvailableAtLocation,
  useLatestPlacementVersion,
} from "@/lib/clinic-portal/guide-placements";

export interface PlacementActionState {
  error?: string;
  saved?: boolean;
  guideId?: string;
}

async function clinicId(): Promise<{ clinicId: string; userId: string }> {
  const { user, clinicMembership } = await requireClinicAdmin();
  await enforcePrePaymentActivationGate(clinicMembership);
  return { clinicId: clinicMembership.clinic.id, userId: user.id };
}

function message(error: unknown, fallback: string): string {
  return isClinicPortalError(error) ? error.message : fallback;
}

export async function setPlacementAvailabilityAction(
  _previous: PlacementActionState,
  formData: FormData
): Promise<PlacementActionState> {
  const actor = await clinicId();
  const guideId = String(formData.get("guideId") ?? "");
  const locationId = String(formData.get("locationId") ?? "");
  const available = formData.get("available") === "true";
  if (!guideId || !locationId) {
    return { error: "Location not found." };
  }
  try {
    const result = await setGuideAvailableAtLocation({
      clinicId: actor.clinicId,
      guideId,
      locationId,
      available,
    });
    revalidatePath(`/guides/${guideId}/edit`);
    revalidatePath("/guides");
    return {
      saved: true,
      error:
        result.enabled || !available
          ? undefined
          : "Saved for this location without publishing it. Publish the guide before patients can open it here.",
    };
  } catch (error) {
    return { error: message(error, "Could not update this location.") };
  }
}

export async function useLatestPlacementAction(
  _previous: PlacementActionState,
  formData: FormData
): Promise<PlacementActionState> {
  const actor = await clinicId();
  const placementId = String(formData.get("placementId") ?? "");
  const guideId = String(formData.get("guideId") ?? "");
  if (!placementId) {
    return { error: "Placement not found." };
  }
  try {
    await useLatestPlacementVersion({
      clinicId: actor.clinicId,
      placementId,
    });
    if (guideId) {
      revalidatePath(`/guides/${guideId}/edit`);
    }
    return { saved: true };
  } catch (error) {
    return { error: message(error, "Could not use the latest version.") };
  }
}

export async function detachPlacementAction(
  _previous: PlacementActionState,
  formData: FormData
): Promise<PlacementActionState> {
  const actor = await clinicId();
  const placementId = String(formData.get("placementId") ?? "");
  if (!placementId) {
    return { error: "Placement not found." };
  }
  try {
    const created = await detachPlacementGuide({
      clinicId: actor.clinicId,
      actorUserId: actor.userId,
      placementId,
    });
    revalidatePath("/guides");
    revalidatePath(`/guides/${created.guideId}/edit`);
    return { saved: true, guideId: created.guideId };
  } catch (error) {
    return {
      error: message(error, "Could not create a location-specific copy."),
    };
  }
}
