import { describe, expect, it } from "vitest";

import {
  isPlatformSeoFilename,
  isPlatformSeoPublicPath,
  isPlatformSeoStorageKey,
  platformSeoObjectKey,
  platformSeoStorageKeyFromFilename,
  platformSeoStorageKeyFromStoredValue,
  validatePlatformSeoImage,
} from "@/lib/platform-assets/platform-seo-image";
import {
  jpegBytes,
  oversizedPngBytes,
  pngBytes,
  webpBytes,
} from "./helpers/og-image-bytes";

const UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("platform SEO image validation", () => {
  it("accepts exact 1200 × 630 PNG, JPEG, and WebP", () => {
    for (const [bytes, mimeType, fileName, extension] of [
      [pngBytes(), "image/png", "share.png", "png"],
      [jpegBytes(), "image/jpeg", "share.jpg", "jpg"],
      [webpBytes(), "image/webp", "share.webp", "webp"],
    ] as const) {
      const result = validatePlatformSeoImage({ bytes, mimeType, fileName });
      expect(result).toMatchObject({
        ok: true,
        extension,
        width: 1200,
        height: 630,
      });
    }
  });

  it("rejects the wrong dimensions", () => {
    const result = validatePlatformSeoImage({
      bytes: pngBytes(100, 100),
      mimeType: "image/png",
      fileName: "share.png",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("1200 × 630");
    }
  });

  it("rejects oversized files", () => {
    const result = validatePlatformSeoImage({
      bytes: oversizedPngBytes(),
      mimeType: "image/png",
      fileName: "share.png",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("2 MB");
    }
  });

  it("rejects fake extensions and invalid bytes", () => {
    const fake = validatePlatformSeoImage({
      bytes: jpegBytes(),
      mimeType: "image/png",
      fileName: "share.png",
    });
    expect(fake.ok).toBe(false);

    const invalid = validatePlatformSeoImage({
      bytes: Uint8Array.from([0x00, 0x01, 0x02, 0x03]),
      mimeType: "image/png",
      fileName: "share.png",
    });
    expect(invalid.ok).toBe(false);
  });

  it("rejects SVG and unsupported files", () => {
    const svg = validatePlatformSeoImage({
      bytes: new TextEncoder().encode(
        `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"></svg>`
      ),
      mimeType: "image/svg+xml",
      fileName: "share.svg",
    });
    expect(svg.ok).toBe(false);
    if (!svg.ok) {
      expect(svg.error).toMatch(/SVG is not allowed/i);
    }

    const gif = validatePlatformSeoImage({
      bytes: Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
      mimeType: "image/gif",
      fileName: "share.gif",
    });
    expect(gif.ok).toBe(false);
  });
});

describe("platform SEO key contract", () => {
  it("builds immutable platform/seo keys", () => {
    expect(platformSeoObjectKey({ objectId: UUID, extension: "png" })).toBe(
      `platform/seo/${UUID}.png`
    );
    expect(isPlatformSeoStorageKey(`platform/seo/${UUID}.png`)).toBe(true);
    expect(isPlatformSeoFilename(`${UUID}.png`)).toBe(true);
    expect(isPlatformSeoPublicPath(`/platform/seo/${UUID}.png`)).toBe(true);
    expect(platformSeoStorageKeyFromFilename(`${UUID}.png`)).toBe(
      `platform/seo/${UUID}.png`
    );
    expect(
      platformSeoStorageKeyFromStoredValue(`/platform/seo/${UUID}.png`)
    ).toBe(`platform/seo/${UUID}.png`);
  });

  it("rejects clinic keys, traversal, and malformed identifiers", () => {
    expect(
      isPlatformSeoStorageKey(
        "clinics/clinic_a/branding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png"
      )
    ).toBe(false);
    expect(isPlatformSeoFilename("../secret.png")).toBe(false);
    expect(isPlatformSeoFilename("%2e%2e%2fsecret.png")).toBe(false);
    expect(isPlatformSeoFilename("nested/file.png")).toBe(false);
    expect(isPlatformSeoFilename("logo.svg")).toBe(false);
    expect(isPlatformSeoFilename("not-a-uuid.png")).toBe(false);
    expect(isPlatformSeoPublicPath("/platform/seo/")).toBe(false);
    expect(isPlatformSeoPublicPath("/platform/seo")).toBe(false);
    expect(
      platformSeoStorageKeyFromFilename(
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.gif"
      )
    ).toBeNull();
  });
});
