"use server";

import { requireClinicAdmin } from "@/lib/auth/require-clinic-admin";
import { enforcePrePaymentActivationGate } from "@/lib/billing/activation-gate";
import {
  removeClinicDarkLogo,
  removeClinicFavicon,
  removeClinicLogo,
  uploadClinicDarkLogo,
  uploadClinicFavicon,
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

export interface ClinicFaviconActionState {
  error?: string;
  faviconUrl?: string | null;
  faviconSrc?: string | null;
  ok?: boolean;
}

function assetError(error: unknown, fallback: string): string {
  if (error instanceof ClinicAssetStorageUnavailableError) {
    return error.message;
  }
  if (isClinicPortalError(error)) {
    return error.message;
  }
  return fallback;
}

async function clinicAssetActor() {
  const { user, clinicMembership } = await requireClinicAdmin();
  await enforcePrePaymentActivationGate(clinicMembership);
  return {
    actorRole: clinicMembership.role,
    actorClinicId: clinicMembership.clinic.id,
    targetClinicId: clinicMembership.clinic.id,
    platformRole: user.platformRole,
  } as const;
}

export async function uploadClinicLogoAction(
  _previous: ClinicLogoActionState,
  formData: FormData
): Promise<ClinicLogoActionState> {
  const actor = await clinicAssetActor();
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PNG, JPEG, WebP, or SVG image." };
  }

  try {
    const uploaded = await uploadClinicLogo({
      ...actor,
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
    return { error: assetError(error, "Could not update the clinic logo.") };
  }
}

export async function removeClinicLogoAction(
  _previous: ClinicLogoActionState,
  _formData: FormData
): Promise<ClinicLogoActionState> {
  const actor = await clinicAssetActor();
  try {
    await removeClinicLogo(actor);
    return { ok: true, logoUrl: null, logoSrc: null };
  } catch (error) {
    return { error: assetError(error, "Could not update the clinic logo.") };
  }
}

export async function uploadClinicDarkLogoAction(
  _previous: ClinicLogoActionState,
  formData: FormData
): Promise<ClinicLogoActionState> {
  const actor = await clinicAssetActor();
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PNG, JPEG, WebP, or SVG image." };
  }

  try {
    const uploaded = await uploadClinicDarkLogo({
      ...actor,
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
    return { error: assetError(error, "Could not update the Dark-mode logo.") };
  }
}

export async function removeClinicDarkLogoAction(
  _previous: ClinicLogoActionState,
  _formData: FormData
): Promise<ClinicLogoActionState> {
  const actor = await clinicAssetActor();
  try {
    await removeClinicDarkLogo(actor);
    return { ok: true, logoUrl: null, logoSrc: null };
  } catch (error) {
    return { error: assetError(error, "Could not update the Dark-mode logo.") };
  }
}

export async function uploadClinicFaviconAction(
  _previous: ClinicFaviconActionState,
  formData: FormData
): Promise<ClinicFaviconActionState> {
  const actor = await clinicAssetActor();
  const file = formData.get("favicon");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a square PNG image." };
  }

  try {
    const uploaded = await uploadClinicFavicon({
      ...actor,
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: file.type,
      fileName: file.name,
    });
    return {
      ok: true,
      faviconUrl: uploaded.faviconUrl,
      faviconSrc: uploaded.faviconSrc,
    };
  } catch (error) {
    return { error: assetError(error, "Could not update the clinic favicon.") };
  }
}

export async function removeClinicFaviconAction(
  _previous: ClinicFaviconActionState,
  _formData: FormData
): Promise<ClinicFaviconActionState> {
  const actor = await clinicAssetActor();
  try {
    await removeClinicFavicon(actor);
    return { ok: true, faviconUrl: null, faviconSrc: null };
  } catch (error) {
    return { error: assetError(error, "Could not update the clinic favicon.") };
  }
}
