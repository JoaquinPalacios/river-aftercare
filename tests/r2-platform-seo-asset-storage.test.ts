import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it } from "vitest";

import { CLINIC_ASSET_CACHE_CONTROL } from "@/lib/clinic-assets/config";
import { createR2PlatformSeoAssetStorage } from "@/lib/platform-assets/r2-platform-seo-asset-storage";
import { pngBytes } from "./helpers/og-image-bytes";

const KEY = "platform/seo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";
const PNG = pngBytes();

const previousOrigin = process.env.CLINIC_ASSET_PUBLIC_ORIGIN;

afterEach(() => {
  if (previousOrigin === undefined) {
    delete process.env.CLINIC_ASSET_PUBLIC_ORIGIN;
  } else {
    process.env.CLINIC_ASSET_PUBLIC_ORIGIN = previousOrigin;
  }
});

function r2Config() {
  return {
    accountId: "accountidaccountidaccountidacct",
    bucket: "clinic-branding-assets",
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
    endpoint:
      "https://accountidaccountidaccountidacct.r2.cloudflarestorage.com",
    publicOrigin: "https://assets.example.test",
  };
}

describe("R2PlatformSeoAssetStorage", () => {
  it("puts immutable platform SEO keys with Cache-Control and Content-Type", async () => {
    process.env.CLINIC_ASSET_PUBLIC_ORIGIN = "https://assets.example.test";
    const puts: unknown[] = [];
    const storage = createR2PlatformSeoAssetStorage({
      config: r2Config(),
      client: {
        async send(command) {
          if (command instanceof PutObjectCommand) {
            puts.push(command.input);
            return {};
          }
          throw new Error(`unexpected ${command.constructor.name}`);
        },
      },
    });

    const uploaded = await storage.upload({
      storageKey: KEY,
      bytes: PNG,
      mimeType: "image/png",
    });

    expect(uploaded.storageKey).toBe(KEY);
    expect(uploaded.publicPath).toBe(`https://assets.example.test/${KEY}`);
    expect(puts).toEqual([
      {
        Bucket: "clinic-branding-assets",
        Key: KEY,
        Body: PNG,
        ContentType: "image/png",
        CacheControl: CLINIC_ASSET_CACHE_CONTROL,
      },
    ]);
    expect(storage.getPublicUrl({ storageKey: KEY })).toBe(
      `https://assets.example.test/${KEY}`
    );
  });

  it("rejects clinic branding keys", async () => {
    const storage = createR2PlatformSeoAssetStorage({
      config: r2Config(),
      client: {
        async send() {
          throw new Error("should not talk to R2");
        },
      },
    });

    await expect(
      storage.upload({
        storageKey:
          "clinics/clinic_a/branding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png",
        bytes: PNG,
        mimeType: "image/png",
      })
    ).rejects.toThrow("That social image path is not allowed.");
  });

  it("reads with GetObject and heads without GetObject or ListObjects", async () => {
    const commands: string[] = [];
    const storage = createR2PlatformSeoAssetStorage({
      config: r2Config(),
      client: {
        async send(command) {
          commands.push(command.constructor.name);
          if (command instanceof GetObjectCommand) {
            return { Body: PNG, ContentType: "application/octet-stream" };
          }
          if (command instanceof HeadObjectCommand) {
            return { ContentLength: PNG.byteLength };
          }
          if (command instanceof ListObjectsV2Command) {
            throw new Error("listing is forbidden");
          }
          throw new Error(`unexpected ${command.constructor.name}`);
        },
      },
    });

    const read = await storage.read({ storageKey: KEY });
    expect(Array.from(read?.bytes ?? [])).toEqual(Array.from(PNG));
    expect(commands).toEqual(["GetObjectCommand"]);

    commands.length = 0;
    const head = await storage.head({ storageKey: KEY });
    expect(head).toEqual({ contentLength: PNG.byteLength });
    expect(commands).toEqual(["HeadObjectCommand"]);
  });

  it("deletes by object key", async () => {
    const deleted: string[] = [];
    const storage = createR2PlatformSeoAssetStorage({
      config: r2Config(),
      client: {
        async send(command) {
          if (command instanceof DeleteObjectCommand) {
            deleted.push(String(command.input.Key));
            return {};
          }
          throw new Error(`unexpected ${command.constructor.name}`);
        },
      },
    });

    await storage.delete({ storageKey: KEY });
    expect(deleted).toEqual([KEY]);
  });

  it("does not leak AWS errors from a failed put", async () => {
    const storage = createR2PlatformSeoAssetStorage({
      config: r2Config(),
      client: {
        async send() {
          throw new Error("AccessDenied: SignatureDoesNotMatch secret=abc");
        },
      },
    });

    await expect(
      storage.upload({
        storageKey: KEY,
        bytes: PNG,
        mimeType: "image/png",
      })
    ).rejects.toThrow("Could not store the social image.");
  });
});
