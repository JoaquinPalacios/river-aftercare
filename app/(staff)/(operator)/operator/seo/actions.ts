"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { isPlatformOperator } from "@/lib/auth/session";
import { ClinicAssetStorageUnavailableError } from "@/lib/clinic-assets/errors";
import { isPlatformSeoAssetError } from "@/lib/platform-assets/errors";
import {
  removePlatformSeoOgImage,
  uploadPlatformSeoOgImage,
} from "@/lib/platform-assets/mutate-platform-seo-og";
import { MARKETING_SEO_PAGE_KEYS } from "@/lib/seo/page-keys";
import { MARKETING_SEO_PATHS } from "@/lib/seo/types";
import { savePlatformSeoSettings } from "@/lib/seo/save-platform-seo";
import {
  parseSameAsUrls,
  validatePlatformSeoInput,
} from "@/lib/seo/validation";

export interface SeoActionState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

export interface PlatformSeoOgActionState {
  error?: string;
  defaultOgImagePath?: string | null;
  imageSrc?: string | null;
  ok?: boolean;
}

const PAGE_KEYS = MARKETING_SEO_PAGE_KEYS;

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readChecked(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

function revalidateSeoSurfaces(): void {
  revalidatePath("/", "layout");
  revalidatePath("/_marketing", "layout");
  revalidatePath("/pricing");
  revalidatePath("/contact");
  revalidatePath("/about");
  revalidatePath("/privacy");
  revalidatePath("/terms");
  revalidatePath("/clinics");
  revalidatePath("/dental");
  revalidatePath("/physiotherapy");
  revalidatePath("/chiropractic");
  revalidatePath("/cosmetic-clinics");
  revalidatePath("/sitemap.xml");
  revalidatePath("/llms.txt");
  revalidatePath("/operator/seo");
}

function ogError(error: unknown): string {
  if (error instanceof ClinicAssetStorageUnavailableError) {
    return error.message;
  }
  if (isPlatformSeoAssetError(error)) {
    return error.message;
  }
  return "Could not update the default social image.";
}

export async function savePlatformSeoAction(
  _previous: SeoActionState,
  formData: FormData
): Promise<SeoActionState> {
  await requirePlatformOperator();

  const parsed = validatePlatformSeoInput({
    siteName: readString(formData, "siteName"),
    defaultDescription: readString(formData, "defaultDescription"),
    organizationName: readString(formData, "organizationName"),
    organizationDescription: readString(formData, "organizationDescription"),
    publicContactEmail: readString(formData, "publicContactEmail"),
    defaultOgImagePath: null,
    sameAsUrls: parseSameAsUrls(readString(formData, "sameAsUrls")),
    pages: MARKETING_SEO_PATHS.map((path) => {
      const key = PAGE_KEYS[path];
      return {
        path,
        seoTitle: readString(formData, `${key}SeoTitle`),
        metaDescription: readString(formData, `${key}MetaDescription`),
        ogTitle: readString(formData, `${key}OgTitle`),
        ogDescription: readString(formData, `${key}OgDescription`),
        ogImagePath: readString(formData, `${key}OgImagePath`),
        index: readChecked(formData, `${key}Index`),
        follow: readChecked(formData, `${key}Follow`),
      };
    }),
  });

  if (!parsed.value) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.issues) {
      if (!fieldErrors[issue.field]) {
        fieldErrors[issue.field] = issue.message;
      }
    }
    return {
      error: "Please review the SEO fields.",
      fieldErrors,
    };
  }

  try {
    await savePlatformSeoSettings(parsed.value);
    revalidateSeoSurfaces();
    return { success: "SEO & Discovery settings saved." };
  } catch {
    return { error: "Could not save SEO settings." };
  }
}

export async function uploadPlatformSeoOgImageAction(
  _previous: PlatformSeoOgActionState,
  formData: FormData
): Promise<PlatformSeoOgActionState> {
  const { user } = await requirePlatformOperator();
  const file = formData.get("ogImage");
  if (!(file instanceof File) || file.size === 0) {
    return {
      error: "Choose a PNG, JPEG, or WebP image that is exactly 1200 × 630.",
    };
  }

  try {
    const uploaded = await uploadPlatformSeoOgImage({
      actorIsPlatformOperator: isPlatformOperator(user),
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: file.type,
      fileName: file.name,
    });
    revalidateSeoSurfaces();
    return {
      ok: true,
      defaultOgImagePath: uploaded.defaultOgImagePath,
      imageSrc: uploaded.imageSrc,
    };
  } catch (error) {
    return { error: ogError(error) };
  }
}

export async function removePlatformSeoOgImageAction(
  _previous: PlatformSeoOgActionState,
  _formData: FormData
): Promise<PlatformSeoOgActionState> {
  const { user } = await requirePlatformOperator();
  try {
    await removePlatformSeoOgImage({
      actorIsPlatformOperator: isPlatformOperator(user),
    });
    revalidateSeoSurfaces();
    return { ok: true, defaultOgImagePath: null, imageSrc: null };
  } catch (error) {
    return { error: ogError(error) };
  }
}
