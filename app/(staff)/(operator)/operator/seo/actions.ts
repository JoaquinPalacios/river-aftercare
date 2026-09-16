"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { MARKETING_SEO_PAGE_KEYS } from "@/lib/seo/page-keys";
import { MARKETING_SEO_PATHS, type MarketingSeoPath } from "@/lib/seo/types";
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

const PAGE_KEYS = MARKETING_SEO_PAGE_KEYS;

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readChecked(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
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
    defaultOgImagePath: readString(formData, "defaultOgImagePath"),
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
    revalidatePath("/", "layout");
    revalidatePath("/_marketing", "layout");
    revalidatePath("/pricing");
    revalidatePath("/contact");
    revalidatePath("/about");
    revalidatePath("/privacy");
    revalidatePath("/terms");
    revalidatePath("/dental");
    revalidatePath("/physiotherapy");
    revalidatePath("/chiropractic");
    revalidatePath("/cosmetic-clinics");
    revalidatePath("/sitemap.xml");
    revalidatePath("/llms.txt");
    revalidatePath("/operator/seo");
    return { success: "SEO & Discovery settings saved." };
  } catch {
    return { error: "Could not save SEO settings." };
  }
}
