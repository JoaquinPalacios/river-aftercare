import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const previousDriver = process.env.CLINIC_ASSET_STORAGE_DRIVER;
process.env.CLINIC_ASSET_STORAGE_DRIVER = "memory";

const { settings } = vi.hoisted(() => ({
  settings: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    platformSeoSettings: settings,
  }),
}));

import { ClinicAssetStorageUnavailableError } from "@/lib/clinic-assets/errors";
import { PlatformSeoAssetError } from "@/lib/platform-assets/errors";
import { resetPlatformSeoAssetStorageCache } from "@/lib/platform-assets/get-platform-seo-asset-storage";
import {
  memoryPlatformSeoAssetKeys,
  resetMemoryPlatformSeoAssetStorage,
} from "@/lib/platform-assets/memory-platform-seo-asset-storage";
import {
  removePlatformSeoOgImage,
  uploadPlatformSeoOgImage,
} from "@/lib/platform-assets/mutate-platform-seo-og";
import { jpegBytes, pngBytes, webpBytes } from "./helpers/og-image-bytes";

const KEY_PATTERN =
  /^\/platform\/seo\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$/;

function restoreDriver(): void {
  if (previousDriver === undefined) {
    delete process.env.CLINIC_ASSET_STORAGE_DRIVER;
  } else {
    process.env.CLINIC_ASSET_STORAGE_DRIVER = previousDriver;
  }
  resetPlatformSeoAssetStorageCache();
}

describe("uploadPlatformSeoOgImage / removePlatformSeoOgImage", () => {
  beforeEach(() => {
    process.env.CLINIC_ASSET_STORAGE_DRIVER = "memory";
    delete process.env.CLINIC_ASSET_PUBLIC_ORIGIN;
    resetPlatformSeoAssetStorageCache();
    resetMemoryPlatformSeoAssetStorage();
    settings.findUnique.mockReset();
    settings.upsert.mockReset();
    settings.findUnique.mockResolvedValue({ defaultOgImagePath: null });
    settings.upsert.mockResolvedValue({});
  });

  afterEach(() => {
    restoreDriver();
    delete process.env.CLINIC_ASSET_PUBLIC_ORIGIN;
  });

  it("persists PNG, JPEG, and WebP under immutable platform SEO paths", async () => {
    const png = await uploadPlatformSeoOgImage({
      actorIsPlatformOperator: true,
      bytes: pngBytes(),
      mimeType: "image/png",
      fileName: "share.png",
    });
    expect(png.defaultOgImagePath).toMatch(KEY_PATTERN);
    expect(png.defaultOgImagePath).toMatch(/\.png$/);
    expect(png.imageSrc).toMatch(/^\/platform-seo\/.+\.png$/);
    expect(settings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { defaultOgImagePath: png.defaultOgImagePath },
      })
    );

    const jpeg = await uploadPlatformSeoOgImage({
      actorIsPlatformOperator: true,
      bytes: jpegBytes(),
      mimeType: "image/jpeg",
      fileName: "share.jpg",
    });
    expect(jpeg.defaultOgImagePath).toMatch(/\.jpg$/);

    const webp = await uploadPlatformSeoOgImage({
      actorIsPlatformOperator: true,
      bytes: webpBytes(),
      mimeType: "image/webp",
      fileName: "share.webp",
    });
    expect(webp.defaultOgImagePath).toMatch(/\.webp$/);
  });

  it("rejects unauthenticated, clinic ADMIN, and clinic STAFF mutations", async () => {
    await expect(
      uploadPlatformSeoOgImage({
        actorIsPlatformOperator: false,
        bytes: pngBytes(),
        mimeType: "image/png",
        fileName: "share.png",
      })
    ).rejects.toBeInstanceOf(PlatformSeoAssetError);
    expect(memoryPlatformSeoAssetKeys()).toEqual([]);
    expect(settings.upsert).not.toHaveBeenCalled();

    await expect(
      removePlatformSeoOgImage({ actorIsPlatformOperator: false })
    ).rejects.toBeInstanceOf(PlatformSeoAssetError);
  });

  it("replaces by uploading a new object then deleting the previous managed object", async () => {
    const first = await uploadPlatformSeoOgImage({
      actorIsPlatformOperator: true,
      bytes: pngBytes(),
      mimeType: "image/png",
      fileName: "one.png",
    });
    settings.findUnique.mockResolvedValue({
      defaultOgImagePath: first.defaultOgImagePath,
    });

    const second = await uploadPlatformSeoOgImage({
      actorIsPlatformOperator: true,
      bytes: webpBytes(),
      mimeType: "image/webp",
      fileName: "two.webp",
    });

    expect(second.defaultOgImagePath).not.toBe(first.defaultOgImagePath);
    expect(memoryPlatformSeoAssetKeys()).toEqual([
      second.defaultOgImagePath.slice(1),
    ]);
  });

  it("cleans up the newly uploaded object when persistence fails", async () => {
    settings.upsert.mockRejectedValueOnce(new Error("write failed"));

    await expect(
      uploadPlatformSeoOgImage({
        actorIsPlatformOperator: true,
        bytes: pngBytes(),
        mimeType: "image/png",
        fileName: "share.png",
      })
    ).rejects.toMatchObject({
      message: "Could not update the default social image.",
    });
    expect(memoryPlatformSeoAssetKeys()).toEqual([]);
  });

  it("does not delete a previous object until persistence succeeds", async () => {
    const first = await uploadPlatformSeoOgImage({
      actorIsPlatformOperator: true,
      bytes: pngBytes(),
      mimeType: "image/png",
      fileName: "one.png",
    });
    settings.findUnique.mockResolvedValue({
      defaultOgImagePath: first.defaultOgImagePath,
    });
    settings.upsert.mockRejectedValueOnce(new Error("write failed"));

    await expect(
      uploadPlatformSeoOgImage({
        actorIsPlatformOperator: true,
        bytes: jpegBytes(),
        mimeType: "image/jpeg",
        fileName: "two.jpg",
      })
    ).rejects.toMatchObject({
      message: "Could not update the default social image.",
    });
    expect(memoryPlatformSeoAssetKeys()).toEqual([
      first.defaultOgImagePath.slice(1),
    ]);
  });

  it("clears the setting and deletes a managed object on remove", async () => {
    const first = await uploadPlatformSeoOgImage({
      actorIsPlatformOperator: true,
      bytes: pngBytes(),
      mimeType: "image/png",
      fileName: "one.png",
    });
    settings.findUnique.mockResolvedValue({
      defaultOgImagePath: first.defaultOgImagePath,
    });
    const order: string[] = [];
    settings.upsert.mockImplementation(async () => {
      order.push("db");
      return {};
    });

    await removePlatformSeoOgImage({ actorIsPlatformOperator: true });
    expect(order[0]).toBe("db");
    expect(settings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { defaultOgImagePath: null },
      })
    );
    expect(memoryPlatformSeoAssetKeys()).toEqual([]);
  });

  it("never deletes a legacy static or external value", async () => {
    settings.findUnique.mockResolvedValue({
      defaultOgImagePath: "/brand/river-aftercare-og.png",
    });
    await removePlatformSeoOgImage({ actorIsPlatformOperator: true });
    expect(memoryPlatformSeoAssetKeys()).toEqual([]);
    expect(settings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { defaultOgImagePath: null },
      })
    );

    settings.findUnique.mockResolvedValue({
      defaultOgImagePath:
        "https://evil.example/platform/seo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png",
    });
    const png = pngBytes();
    await uploadPlatformSeoOgImage({
      actorIsPlatformOperator: true,
      bytes: png,
      mimeType: "image/png",
      fileName: "share.png",
    });
    expect(
      memoryPlatformSeoAssetKeys().some((key) =>
        key.includes("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
      )
    ).toBe(false);
  });

  it("does not pretend upload succeeded when storage is unconfigured", async () => {
    delete process.env.CLINIC_ASSET_STORAGE_DRIVER;
    resetPlatformSeoAssetStorageCache();
    await expect(
      uploadPlatformSeoOgImage({
        actorIsPlatformOperator: true,
        bytes: pngBytes(),
        mimeType: "image/png",
        fileName: "share.png",
      })
    ).rejects.toBeInstanceOf(ClinicAssetStorageUnavailableError);
  });
});
