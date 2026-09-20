import { describe, expect, it } from "vitest";

import {
  CLINIC_FAVICON_MAX_BYTES,
  CLINIC_FAVICON_MAX_SIZE,
  validateClinicFavicon,
} from "@/lib/clinic-assets/clinic-favicon";
import { pngBytes } from "./helpers/og-image-bytes";

const PNG_32 = pngBytes(32, 32);
const PNG_512 = pngBytes(512, 512);

describe("validateClinicFavicon", () => {
  it("accepts a square PNG at or above 32px", () => {
    expect(
      validateClinicFavicon({
        bytes: PNG_32,
        mimeType: "image/png",
        fileName: "mark.png",
      })
    ).toMatchObject({ ok: true, extension: "png", width: 32, height: 32 });
    expect(
      validateClinicFavicon({
        bytes: PNG_512,
        mimeType: "image/png",
        fileName: "icon.png",
      })
    ).toMatchObject({ ok: true, width: 512, height: 512 });
  });

  it("rejects SVG, non-square, tiny, huge, and mismatched files", () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"></svg>'
    );
    expect(
      validateClinicFavicon({
        bytes: svg,
        mimeType: "image/svg+xml",
        fileName: "mark.svg",
      }).ok
    ).toBe(false);
    expect(
      validateClinicFavicon({
        bytes: pngBytes(64, 32),
        mimeType: "image/png",
        fileName: "wide.png",
      }).error
    ).toMatch(/square/i);
    expect(
      validateClinicFavicon({
        bytes: pngBytes(16, 16),
        mimeType: "image/png",
        fileName: "tiny.png",
      }).error
    ).toMatch(/32/);
    expect(
      validateClinicFavicon({
        bytes: pngBytes(
          CLINIC_FAVICON_MAX_SIZE + 1,
          CLINIC_FAVICON_MAX_SIZE + 1
        ),
        mimeType: "image/png",
        fileName: "huge.png",
      }).error
    ).toMatch(/1024/);
    expect(
      validateClinicFavicon({
        bytes: PNG_32,
        mimeType: "image/jpeg",
        fileName: "mark.png",
      }).ok
    ).toBe(false);
    expect(
      validateClinicFavicon({
        bytes: PNG_32,
        mimeType: "image/png",
        fileName: "mark.svg",
      }).ok
    ).toBe(false);
  });

  it("rejects oversized files before trusting the supplied MIME type", () => {
    const oversized = new Uint8Array(CLINIC_FAVICON_MAX_BYTES + 1);
    oversized.set(PNG_32);
    expect(
      validateClinicFavicon({
        bytes: oversized,
        mimeType: "image/png",
        fileName: "mark.png",
      })
    ).toMatchObject({
      ok: false,
      error: "Favicon files must be 512 KB or smaller.",
    });
  });
});
