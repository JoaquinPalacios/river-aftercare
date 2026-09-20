import type { Metadata } from "next";

import {
  PRODUCT_ANDROID_CHROME_192_SRC,
  PRODUCT_ANDROID_CHROME_512_SRC,
  PRODUCT_APPLE_TOUCH_ICON_SRC,
  PRODUCT_FAVICON_16_SRC,
  PRODUCT_FAVICON_32_SRC,
  PRODUCT_FAVICON_ICO_SRC,
  PRODUCT_WEB_MANIFEST_SRC,
} from "@/lib/branding/product-assets";

export const PRODUCT_ICONS: NonNullable<Metadata["icons"]> = {
  icon: [
    { url: PRODUCT_FAVICON_ICO_SRC, sizes: "any" },
    {
      url: PRODUCT_FAVICON_16_SRC,
      sizes: "16x16",
      type: "image/png",
    },
    {
      url: PRODUCT_FAVICON_32_SRC,
      sizes: "32x32",
      type: "image/png",
    },
    {
      url: PRODUCT_ANDROID_CHROME_192_SRC,
      sizes: "192x192",
      type: "image/png",
    },
    {
      url: PRODUCT_ANDROID_CHROME_512_SRC,
      sizes: "512x512",
      type: "image/png",
    },
  ],
  apple: [
    {
      url: PRODUCT_APPLE_TOUCH_ICON_SRC,
      sizes: "180x180",
      type: "image/png",
    },
  ],
};

export const PRODUCT_HEAD_METADATA = {
  icons: PRODUCT_ICONS,
  manifest: PRODUCT_WEB_MANIFEST_SRC,
} as const satisfies Pick<Metadata, "icons" | "manifest">;

export const PRODUCT_ICON_HREFS = [
  PRODUCT_FAVICON_ICO_SRC,
  PRODUCT_FAVICON_16_SRC,
  PRODUCT_FAVICON_32_SRC,
  PRODUCT_ANDROID_CHROME_192_SRC,
  PRODUCT_ANDROID_CHROME_512_SRC,
  PRODUCT_APPLE_TOUCH_ICON_SRC,
] as const;

export function isProductIconHref(href: string): boolean {
  const path = href.split("?")[0];
  return PRODUCT_ICON_HREFS.some((src) => path === src || path.endsWith(src));
}
