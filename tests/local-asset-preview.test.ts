import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createLocalAssetPreviewUrl,
  isPreviewableAssetFile,
  revokeLocalAssetPreviewUrl,
} from "@/app/(staff)/components/local-asset-preview";

describe("local asset preview URLs", () => {
  const createObjectURL = vi.fn((blob: Blob) => {
    const name = blob instanceof File ? blob.name : "blob";
    return `blob:http://localhost/${encodeURIComponent(name)}`;
  });
  const revokeObjectURL = vi.fn();

  afterEach(() => {
    createObjectURL.mockReset();
    revokeObjectURL.mockReset();
    createObjectURL.mockImplementation((blob: Blob) => {
      const name = blob instanceof File ? blob.name : "blob";
      return `blob:http://localhost/${encodeURIComponent(name)}`;
    });
  });

  it("creates object URLs for raster and SVG files", () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: createObjectURL,
    });

    const png = new File(["png"], "mark.png", { type: "image/png" });
    const svg = new File(["<svg />"], "mark.svg", { type: "image/svg+xml" });
    const text = new File(["nope"], "notes.txt", { type: "text/plain" });

    expect(isPreviewableAssetFile(png)).toBe(true);
    expect(isPreviewableAssetFile(svg)).toBe(true);
    expect(isPreviewableAssetFile(text)).toBe(false);
    expect(createLocalAssetPreviewUrl(png)).toBe(
      "blob:http://localhost/mark.png"
    );
    expect(createLocalAssetPreviewUrl(svg)).toBe(
      "blob:http://localhost/mark.svg"
    );
    expect(createLocalAssetPreviewUrl(text)).toBeNull();
    expect(createObjectURL).toHaveBeenCalledTimes(2);
  });

  it("returns null when object URL creation throws", () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: () => {
        throw new Error("not supported");
      },
    });

    expect(
      createLocalAssetPreviewUrl(
        new File(["png"], "mark.png", { type: "image/png" })
      )
    ).toBeNull();
  });

  it("revokes object URLs without throwing", () => {
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: revokeObjectURL,
    });

    revokeLocalAssetPreviewUrl("blob:http://localhost/mark.png");
    revokeLocalAssetPreviewUrl(null);
    expect(revokeObjectURL).toHaveBeenCalledWith(
      "blob:http://localhost/mark.png"
    );
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);

    revokeObjectURL.mockImplementation(() => {
      throw new Error("already revoked");
    });
    expect(() =>
      revokeLocalAssetPreviewUrl("blob:http://localhost/mark.png")
    ).not.toThrow();
  });
});
