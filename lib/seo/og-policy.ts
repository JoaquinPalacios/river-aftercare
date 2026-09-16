import {
  PRODUCT_ISOLOGO_SRC,
  PRODUCT_LOGO_SRC,
} from "@/lib/branding/product-assets";

/** Ideal Open Graph share image. Do not stretch a square logo into this size. */
export const OG_IMAGE_TARGET = {
  width: 1200,
  height: 630,
} as const;

export const DEDICATED_OG_IMAGE_REQUIRED =
  "DEDICATED RIVER AFTERCARE OG IMAGE STILL REQUIRED";

export const ORGANIZATION_LOGO = {
  path: PRODUCT_ISOLOGO_SRC,
  width: 180,
  height: 180,
  type: "image/svg+xml",
} as const;

export const PRODUCT_WORDMARK_LOGO = {
  path: PRODUCT_LOGO_SRC,
  width: 771,
  height: 123,
  type: "image/svg+xml",
} as const;

export function isDedicatedOgImageConfigured(
  imagePath: string | null | undefined
): boolean {
  const path = imagePath?.trim();
  if (!path) {
    return false;
  }
  return path !== PRODUCT_ISOLOGO_SRC && path !== PRODUCT_LOGO_SRC;
}
