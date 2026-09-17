"use server";

import { requireClinicAdmin } from "@/lib/auth/require-clinic-admin";
import {
  removeClinicLogo,
  uploadClinicLogo,
} from "@/lib/clinic-assets/mutate-clinic-logo";
import { ClinicAssetStorageUnavailableError } from "@/lib/clinic-assets/errors";
import { isClinicPortalError } from "@/lib/clinic-portal/errors";

export interface ClinicLogoActionState {
  error?: string;
  logoUrl?: string | null;
  logoSrc?: string | null;
  ok?: boolean;
}

function logoError(error: unknown): string {
  if (error instanceof ClinicAssetStorageUnavailableError) {
    return error.message;
  }
  if (isClinicPortalError(error)) {
    return error.message;
  }
  return "Could not update the clinic logo.";
}

export async function uploadClinicLogoAction(
  _previous: ClinicLogoActionState,
  formData: FormData
): Promise<ClinicLogoActionState> {
  const { clinicMembership } = await requireClinicAdmin();
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PNG, JPEG, WebP, or SVG image." };
  }

  try {
    const uploaded = await uploadClinicLogo({
      actorRole: clinicMembership.role,
      actorClinicId: clinicMembership.clinic.id,
      targetClinicId: clinicMembership.clinic.id,
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: file.type,
      fileName: file.name,
    });
    return {
      ok: true,
      logoUrl: uploaded.logoUrl,
      logoSrc: uploaded.logoSrc,
    };
  } catch (error) {
    return { error: logoError(error) };
  }
}

export async function removeClinicLogoAction(
  _previous: ClinicLogoActionState,
  _formData: FormData
): Promise<ClinicLogoActionState> {
  const { clinicMembership } = await requireClinicAdmin();
  try {
    await removeClinicLogo({
      actorRole: clinicMembership.role,
      actorClinicId: clinicMembership.clinic.id,
      targetClinicId: clinicMembership.clinic.id,
    });
    return { ok: true, logoUrl: null, logoSrc: null };
  } catch (error) {
    return { error: logoError(error) };
  }
}
