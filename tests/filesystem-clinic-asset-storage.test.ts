import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { GET as getFallbackClinicLogo } from "@/app/clinic-branding/[clinicId]/[filename]/route";
import {
  createFilesystemClinicAssetStorage,
  resetFilesystemClinicAssetStorage,
  resolveClinicAssetFilesystemPath,
} from "@/lib/clinic-assets/filesystem-clinic-asset-storage";
import { clinicAssetStorageStatus } from "@/lib/clinic-assets/config";
import {
  getClinicAssetStorage,
  resetClinicAssetStorageCache,
} from "@/lib/clinic-assets/get-clinic-asset-storage";

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const KEY =
  "clinics/clinic_a/branding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";
const OTHER_CLINIC_KEY =
  "clinics/clinic_b/branding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";

const previous = {
  driver: process.env.CLINIC_ASSET_STORAGE_DRIVER,
  root: process.env.CLINIC_ASSET_FILESYSTEM_ROOT,
  origin: process.env.CLINIC_ASSET_PUBLIC_ORIGIN,
  vercel: process.env.VERCEL,
  vercelEnv: process.env.VERCEL_ENV,
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries({
    CLINIC_ASSET_STORAGE_DRIVER: previous.driver,
    CLINIC_ASSET_FILESYSTEM_ROOT: previous.root,
    CLINIC_ASSET_PUBLIC_ORIGIN: previous.origin,
    VERCEL: previous.vercel,
    VERCEL_ENV: previous.vercelEnv,
  })) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  resetClinicAssetStorageCache();
}

describe("filesystem clinic asset storage", () => {
  let tempRoot: string | null = null;

  afterEach(async () => {
    restoreEnv();
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
      tempRoot = null;
    }
  });

  async function makeRoot(): Promise<string> {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "clinic-assets-"));
    return tempRoot;
  }

  it("rejects traversal, absolute paths, and escaped keys", () => {
    const root = path.join(os.tmpdir(), "clinic-assets-root");
    expect(resolveClinicAssetFilesystemPath(root, "/etc/passwd")).toBeNull();
    expect(
      resolveClinicAssetFilesystemPath(root, "clinics/../etc/passwd")
    ).toBeNull();
    expect(
      resolveClinicAssetFilesystemPath(
        root,
        "clinics/clinic_a/branding/../../secret.png"
      )
    ).toBeNull();
    expect(
      resolveClinicAssetFilesystemPath(
        root,
        "clinics/clinic_a/branding/foo/../bar.png"
      )
    ).toBeNull();
    expect(resolveClinicAssetFilesystemPath(root, KEY)).toBe(
      path.resolve(
        root,
        "clinics/clinic_a/branding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png"
      )
    );
  });

  it("persists bytes across separate storage instances at the same root", async () => {
    const root = await makeRoot();
    const writer = createFilesystemClinicAssetStorage({ root });
    const reader = createFilesystemClinicAssetStorage({ root });

    await writer.uploadLogo({
      clinicId: "clinic_a",
      storageKey: KEY,
      bytes: PNG,
      mimeType: "image/png",
    });

    const stored = await reader.readLogo({
      clinicId: "clinic_a",
      storageKey: KEY,
    });
    expect(stored?.mimeType).toBe("image/png");
    expect(Array.from(stored?.bytes ?? [])).toEqual(Array.from(PNG));

    const head = await reader.headLogo({
      clinicId: "clinic_a",
      storageKey: KEY,
    });
    expect(head?.contentLength).toBe(PNG.byteLength);
  });

  it("does not serve Clinic A bytes through Clinic B's key", async () => {
    const root = await makeRoot();
    const storage = createFilesystemClinicAssetStorage({ root });
    await storage.uploadLogo({
      clinicId: "clinic_a",
      storageKey: KEY,
      bytes: PNG,
      mimeType: "image/png",
    });

    await expect(
      storage.uploadLogo({
        clinicId: "clinic_b",
        storageKey: KEY,
        bytes: PNG,
        mimeType: "image/png",
      })
    ).rejects.toThrow(/not owned/);

    expect(
      await storage.readLogo({
        clinicId: "clinic_b",
        storageKey: KEY,
      })
    ).toBeNull();
    expect(
      await storage.readLogo({
        clinicId: "clinic_b",
        storageKey: OTHER_CLINIC_KEY,
      })
    ).toBeNull();
  });

  it("replaces by writing a new key and deleting the previous file", async () => {
    const root = await makeRoot();
    const storage = createFilesystemClinicAssetStorage({ root });
    const firstKey =
      "clinics/clinic_a/branding/11111111-1111-4111-8111-111111111111.png";
    const secondKey =
      "clinics/clinic_a/branding/22222222-2222-4222-8222-222222222222.png";

    await storage.uploadLogo({
      clinicId: "clinic_a",
      storageKey: firstKey,
      bytes: PNG,
      mimeType: "image/png",
    });
    await storage.uploadLogo({
      clinicId: "clinic_a",
      storageKey: secondKey,
      bytes: PNG,
      mimeType: "image/png",
    });
    await storage.deleteLogo({
      clinicId: "clinic_a",
      storageKey: firstKey,
    });

    expect(
      await storage.readLogo({ clinicId: "clinic_a", storageKey: firstKey })
    ).toBeNull();
    expect(
      await storage.readLogo({ clinicId: "clinic_a", storageKey: secondKey })
    ).toBeTruthy();
  });

  it("ignores a symlink that would escape the storage root", async () => {
    const root = await makeRoot();
    const outside = path.join(root, "..", `outside-${path.basename(root)}.png`);
    await writeFile(outside, PNG);
    const destination = resolveClinicAssetFilesystemPath(root, KEY);
    expect(destination).toBeTruthy();
    await mkdir(path.dirname(destination!), { recursive: true });
    await symlink(outside, destination!);

    const storage = createFilesystemClinicAssetStorage({ root });
    expect(
      await storage.readLogo({ clinicId: "clinic_a", storageKey: KEY })
    ).toBeNull();
    await rm(outside, { force: true });
  });

  it("serves bytes through the fallback route from a separate storage instance", async () => {
    const root = await makeRoot();
    process.env.CLINIC_ASSET_STORAGE_DRIVER = "filesystem";
    process.env.CLINIC_ASSET_FILESYSTEM_ROOT = root;
    delete process.env.CLINIC_ASSET_PUBLIC_ORIGIN;
    resetClinicAssetStorageCache();

    const writer = createFilesystemClinicAssetStorage({ root });
    await writer.uploadLogo({
      clinicId: "clinic_a",
      storageKey: KEY,
      bytes: PNG,
      mimeType: "image/png",
    });

    expect(getClinicAssetStorage()).toBeTruthy();
    const response = await getFallbackClinicLogo(
      new Request(
        `http://localhost:3000/clinic-branding/clinic_a/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png`,
        { headers: { host: "localhost:3000" } }
      ),
      {
        params: Promise.resolve({
          clinicId: "clinic_a",
          filename: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png",
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual(
      Array.from(PNG)
    );
  });

  it("refuses the filesystem driver on Vercel", () => {
    process.env.CLINIC_ASSET_STORAGE_DRIVER = "filesystem";
    process.env.VERCEL = "1";
    expect(clinicAssetStorageStatus()).toEqual({
      available: false,
      reason: "unconfigured",
    });
    delete process.env.VERCEL;
    process.env.VERCEL_ENV = "production";
    expect(clinicAssetStorageStatus()).toEqual({
      available: false,
      reason: "unconfigured",
    });
    delete process.env.VERCEL_ENV;
    expect(clinicAssetStorageStatus()).toEqual({
      available: true,
      driver: "filesystem",
      bucket: ".data/clinic-assets",
    });
  });

  it("only resets roots under .data or tmp", async () => {
    await expect(resetFilesystemClinicAssetStorage("/etc")).rejects.toThrow(
      /Refusing to delete/
    );
    const root = await makeRoot();
    await writeFile(path.join(root, "keep.txt"), "x");
    await resetFilesystemClinicAssetStorage(root);
    await expect(readFile(path.join(root, "keep.txt"))).rejects.toThrow();
  });
});
