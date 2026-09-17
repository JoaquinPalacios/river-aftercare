import { describe, expect, it } from "vitest";

import {
  formatFileSize,
  formatSelectedOgFileLabel,
} from "@/app/(staff)/(operator)/operator/seo/og-image-selection";

describe("social image selection labels", () => {
  it("formats byte sizes in compact units", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(196 * 1024)).toBe("196 KB");
    expect(formatFileSize(9.5 * 1024)).toBe("9.5 KB");
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2 MB");
  });

  it("includes dimensions only when they are known", () => {
    expect(
      formatSelectedOgFileLabel({
        name: "share.png",
        byteLength: 196 * 1024,
        width: 1200,
        height: 630,
      })
    ).toBe("share.png · 1200 × 630 · 196 KB");
    expect(
      formatSelectedOgFileLabel({
        name: "share.png",
        byteLength: 196 * 1024,
        width: null,
        height: null,
      })
    ).toBe("share.png · 196 KB");
  });
});
