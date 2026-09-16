import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it } from "vitest";

import { CLINIC_ASSET_CACHE_CONTROL } from "@/lib/clinic-assets/config";
import { createR2ClinicAssetStorage } from "@/lib/clinic-assets/r2-clinic-asset-storage";

const KEY =
  "clinics/clinic_a/branding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

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

describe("R2ClinicAssetStorage", () => {
  it("puts immutable UUID keys with Cache-Control and Content-Type", async () => {
    process.env.CLINIC_ASSET_PUBLIC_ORIGIN = "https://assets.example.test";
    const puts: unknown[] = [];
    const storage = createR2ClinicAssetStorage({
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

    const uploaded = await storage.uploadLogo({
      clinicId: "clinic_a",
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
    expect(CLINIC_ASSET_CACHE_CONTROL).toBe(
      "public, max-age=31536000, immutable"
    );
    expect(
      storage.getPublicLogoUrl({ clinicId: "clinic_a", storageKey: KEY })
    ).toBe(`https://assets.example.test/${KEY}`);
  });

  it("sets image/svg+xml for sanitized SVG objects", async () => {
    const puts: Array<{ ContentType?: string }> = [];
    const storage = createR2ClinicAssetStorage({
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

    await storage.uploadLogo({
      clinicId: "clinic_a",
      storageKey: KEY.replace(/png$/, "svg"),
      bytes: new TextEncoder().encode(
        "<svg xmlns='http://www.w3.org/2000/svg'/>"
      ),
      mimeType: "image/svg+xml",
    });

    expect(puts[0]?.ContentType).toBe("image/svg+xml");
  });

  it("deletes by object key and reads stored bytes", async () => {
    const objects = new Map<
      string,
      { Body: Uint8Array; ContentType: string }
    >();
    const storage = createR2ClinicAssetStorage({
      config: r2Config(),
      client: {
        async send(command) {
          if (command instanceof PutObjectCommand) {
            objects.set(String(command.input.Key), {
              Body: command.input.Body as Uint8Array,
              ContentType: String(command.input.ContentType),
            });
            return {};
          }
          if (command instanceof GetObjectCommand) {
            const stored = objects.get(String(command.input.Key));
            if (!stored) {
              const error = new Error("missing");
              error.name = "NoSuchKey";
              throw error;
            }
            return stored;
          }
          if (command instanceof DeleteObjectCommand) {
            objects.delete(String(command.input.Key));
            return {};
          }
          throw new Error(`unexpected ${command.constructor.name}`);
        },
      },
    });

    await storage.uploadLogo({
      clinicId: "clinic_a",
      storageKey: KEY,
      bytes: PNG,
      mimeType: "image/png",
    });
    const read = await storage.readLogo({
      clinicId: "clinic_a",
      storageKey: KEY,
    });
    expect(read?.mimeType).toBe("image/png");
    expect(Array.from(read?.bytes ?? [])).toEqual(Array.from(PNG));

    await storage.deleteLogo({ clinicId: "clinic_a", storageKey: KEY });
    expect(
      await storage.readLogo({ clinicId: "clinic_a", storageKey: KEY })
    ).toBeNull();
  });

  it("heads object metadata without GetObject or ListObjects", async () => {
    const commands: string[] = [];
    const storage = createR2ClinicAssetStorage({
      config: r2Config(),
      client: {
        async send(command) {
          commands.push(command.constructor.name);
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

    const head = await storage.headLogo({
      clinicId: "clinic_a",
      storageKey: KEY,
    });
    expect(head).toEqual({ contentLength: PNG.byteLength });
    expect(commands).toEqual(["HeadObjectCommand"]);
  });

  it("returns null for a missing head without leaking provider details", async () => {
    const storage = createR2ClinicAssetStorage({
      config: r2Config(),
      client: {
        async send(command) {
          if (command instanceof HeadObjectCommand) {
            const error = new Error("NoSuchKey secret=abc");
            error.name = "NotFound";
            throw error;
          }
          throw new Error(`unexpected ${command.constructor.name}`);
        },
      },
    });

    await expect(
      storage.headLogo({ clinicId: "clinic_a", storageKey: KEY })
    ).resolves.toBeNull();
  });

  it("does not leak AWS errors from a failed put", async () => {
    const storage = createR2ClinicAssetStorage({
      config: r2Config(),
      client: {
        async send() {
          throw new Error("AccessDenied: SignatureDoesNotMatch secret=abc");
        },
      },
    });

    await expect(
      storage.uploadLogo({
        clinicId: "clinic_a",
        storageKey: KEY,
        bytes: PNG,
        mimeType: "image/png",
      })
    ).rejects.toThrow("Could not store the clinic logo.");
  });
});
