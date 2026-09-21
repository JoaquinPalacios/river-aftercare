import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  PRODUCT_ANDROID_CHROME_192_SRC,
  PRODUCT_ANDROID_CHROME_512_SRC,
  PRODUCT_APPLE_TOUCH_ICON_SRC,
  PRODUCT_FAVICON_16_SRC,
  PRODUCT_FAVICON_32_SRC,
  PRODUCT_FAVICON_ICO_SRC,
  PRODUCT_ISOLOGO_SRC,
  PRODUCT_LOGO_SRC,
  PRODUCT_WEB_MANIFEST_SRC,
} from "@/lib/branding/product-assets";
import { PRODUCT_HEAD_METADATA, PRODUCT_ICONS } from "@/lib/seo/icons";
import { ORGANIZATION_LOGO, PRODUCT_WORDMARK_LOGO } from "@/lib/seo/og-policy";

function publicPath(src: string): string {
  return `public${src}`;
}

describe("product brand assets", () => {
  it("keeps the logo, isologo, and favicon pack on disk", () => {
    const files = [
      PRODUCT_ISOLOGO_SRC,
      PRODUCT_LOGO_SRC,
      PRODUCT_FAVICON_ICO_SRC,
      PRODUCT_FAVICON_16_SRC,
      PRODUCT_FAVICON_32_SRC,
      PRODUCT_APPLE_TOUCH_ICON_SRC,
      PRODUCT_ANDROID_CHROME_192_SRC,
      PRODUCT_ANDROID_CHROME_512_SRC,
      PRODUCT_WEB_MANIFEST_SRC,
    ];

    expect(
      files.map((src) => publicPath(src)).filter((path) => !existsSync(path))
    ).toEqual([]);
    expect(existsSync("public/favicon.ico")).toBe(false);
    expect(existsSync("app/favicon.ico")).toBe(false);
    expect(existsSync("app/icon.png")).toBe(false);
    expect(existsSync("app/apple-icon.png")).toBe(false);
  });

  it("wires the favicon pack, apple icon, and the web manifest", () => {
    const icons = PRODUCT_ICONS as {
      icon: { url: string }[];
      apple: { url: string }[];
    };

    expect(icons.icon.map((icon) => icon.url)).toEqual([
      PRODUCT_FAVICON_ICO_SRC,
      PRODUCT_FAVICON_16_SRC,
      PRODUCT_FAVICON_32_SRC,
      PRODUCT_ANDROID_CHROME_192_SRC,
      PRODUCT_ANDROID_CHROME_512_SRC,
    ]);
    expect(icons.apple.map((icon) => icon.url)).toEqual([
      PRODUCT_APPLE_TOUCH_ICON_SRC,
    ]);
    expect(PRODUCT_HEAD_METADATA.manifest).toBe(PRODUCT_WEB_MANIFEST_SRC);
  });

  it("emits River icons from layout metadata instead of app file conventions", () => {
    expect(readFileSync("app/(marketing)/layout.tsx", "utf8")).toContain(
      "PRODUCT_HEAD_METADATA"
    );
    expect(readFileSync("app/(staff)/layout.tsx", "utf8")).toContain(
      "PRODUCT_HEAD_METADATA"
    );
    expect(readFileSync("app/(aftercare)/layout.tsx", "utf8")).toContain(
      "PRODUCT_HEAD_METADATA"
    );
  });

  it("keeps logo and isologo intrinsic sizes aligned with SEO logo metadata", () => {
    const wordmark = readFileSync(publicPath(PRODUCT_LOGO_SRC), "utf8");
    const isologo = readFileSync(publicPath(PRODUCT_ISOLOGO_SRC), "utf8");

    expect(wordmark).toContain(
      `width="${PRODUCT_WORDMARK_LOGO.width}" height="${PRODUCT_WORDMARK_LOGO.height}"`
    );
    expect(isologo).toContain(
      `width="${ORGANIZATION_LOGO.width}" height="${ORGANIZATION_LOGO.height}"`
    );
  });

  it("names the installed web manifest River Aftercare and points at favicon PNGs", () => {
    const manifest = JSON.parse(
      readFileSync(publicPath(PRODUCT_WEB_MANIFEST_SRC), "utf8")
    ) as {
      name: string;
      short_name: string;
      icons: { src: string }[];
    };

    expect(manifest.name).toBe("River Aftercare");
    expect(manifest.short_name).toBe("River Aftercare");
    expect(manifest.icons.map((icon) => icon.src)).toEqual([
      PRODUCT_ANDROID_CHROME_192_SRC,
      PRODUCT_ANDROID_CHROME_512_SRC,
    ]);
  });
});
