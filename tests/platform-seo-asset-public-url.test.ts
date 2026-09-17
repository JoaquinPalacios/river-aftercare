import { afterEach, describe, expect, it } from "vitest";

import {
  managedPlatformSeoStorageKeyForDeletion,
  platformSeoAssetPublicUrl,
  resolvePlatformSeoOgImageUrl,
} from "@/lib/platform-assets/public-url";

const KEY = "platform/seo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";
const previousOrigin = process.env.CLINIC_ASSET_PUBLIC_ORIGIN;

afterEach(() => {
  if (previousOrigin === undefined) {
    delete process.env.CLINIC_ASSET_PUBLIC_ORIGIN;
  } else {
    process.env.CLINIC_ASSET_PUBLIC_ORIGIN = previousOrigin;
  }
});

describe("platform SEO public URL", () => {
  it("prefixes the configured asset origin and never exposes an S3 endpoint", () => {
    process.env.CLINIC_ASSET_PUBLIC_ORIGIN = "https://assets.example.test";
    expect(platformSeoAssetPublicUrl(KEY)).toBe(
      `https://assets.example.test/${KEY}`
    );
    expect(resolvePlatformSeoOgImageUrl(`/${KEY}`)).toBe(
      `https://assets.example.test/${KEY}`
    );
    expect(platformSeoAssetPublicUrl(KEY)).not.toContain(
      "r2.cloudflarestorage"
    );
    expect(platformSeoAssetPublicUrl(KEY)).not.toContain("r2.dev");
  });

  it("falls back to a same-origin preview path when origin is unset", () => {
    delete process.env.CLINIC_ASSET_PUBLIC_ORIGIN;
    expect(platformSeoAssetPublicUrl(KEY)).toBe(
      "/platform-seo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png"
    );
  });

  it("leaves legacy static paths unchanged", () => {
    expect(resolvePlatformSeoOgImageUrl("/brand/platform-og.png")).toBe(
      "/brand/platform-og.png"
    );
    expect(
      managedPlatformSeoStorageKeyForDeletion("/brand/platform-og.png")
    ).toBeNull();
    expect(
      managedPlatformSeoStorageKeyForDeletion("https://evil.example/" + KEY)
    ).toBeNull();
  });

  it("only treats matching asset-origin URLs as managed objects", () => {
    process.env.CLINIC_ASSET_PUBLIC_ORIGIN = "https://assets.example.test";
    expect(
      managedPlatformSeoStorageKeyForDeletion(
        `https://assets.example.test/${KEY}`
      )
    ).toBe(KEY);
    expect(managedPlatformSeoStorageKeyForDeletion(`/${KEY}`)).toBe(KEY);
  });
});
