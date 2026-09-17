import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GET as getPublicPlatformSeoAsset,
  HEAD as headPublicPlatformSeoAsset,
} from "@/app/platform/seo/[filename]/route";
import {
  GET as getFallbackPlatformSeoAsset,
  HEAD as headFallbackPlatformSeoAsset,
} from "@/app/platform-seo/[filename]/route";
import {
  getPlatformSeoAssetStorage,
  resetPlatformSeoAssetStorageCache,
} from "@/lib/platform-assets/get-platform-seo-asset-storage";
import { resetMemoryPlatformSeoAssetStorage } from "@/lib/platform-assets/memory-platform-seo-asset-storage";
import { pngBytes } from "./helpers/og-image-bytes";

const FILENAME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";
const STORAGE_KEY = `platform/seo/${FILENAME}`;
const ASSET_ORIGIN = "https://assets.example.test";
const PUBLIC_URL = `${ASSET_ORIGIN}/${STORAGE_KEY}`;
const SECRET = "super-secret-r2-credential-xyz";
const ACCESS_KEY = "AKIA_TEST_LEAK_KEY";
const PNG = pngBytes();

const previous = {
  driver: process.env.CLINIC_ASSET_STORAGE_DRIVER,
  origin: process.env.CLINIC_ASSET_PUBLIC_ORIGIN,
  access: process.env.R2_ACCESS_KEY_ID,
  secret: process.env.R2_SECRET_ACCESS_KEY,
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries({
    CLINIC_ASSET_STORAGE_DRIVER: previous.driver,
    CLINIC_ASSET_PUBLIC_ORIGIN: previous.origin,
    R2_ACCESS_KEY_ID: previous.access,
    R2_SECRET_ACCESS_KEY: previous.secret,
  })) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  resetPlatformSeoAssetStorageCache();
  resetMemoryPlatformSeoAssetStorage();
}

async function seedAsset(): Promise<void> {
  const storage = getPlatformSeoAssetStorage();
  if (!storage) {
    throw new Error("expected memory platform SEO asset storage");
  }
  await storage.upload({
    storageKey: STORAGE_KEY,
    bytes: PNG,
    mimeType: "image/png",
  });
}

function publicContext(filename = FILENAME) {
  return { params: Promise.resolve({ filename }) };
}

function publicRequest(
  url: string,
  headers: Record<string, string>,
  method: "GET" | "HEAD" = "GET"
): Request {
  return new Request(url, { method, headers });
}

function headerBag(response: Response): string {
  const pairs: string[] = [];
  response.headers.forEach((value, key) => {
    pairs.push(`${key}:${value}`);
  });
  return pairs.join("\n");
}

async function expectGenericNotFound(response: Response): Promise<void> {
  expect(response.status).toBe(404);
  expect(await response.text()).toBe("");
  expect(response.headers.get("content-type") ?? "").not.toMatch(/image\//);
  expect(response.headers.get("cache-control") ?? "").not.toContain(
    "max-age=31536000"
  );
  expect(headerBag(response)).not.toContain(SECRET);
  expect(headerBag(response)).not.toContain(ACCESS_KEY);
}

describe("public platform SEO asset route", () => {
  beforeEach(async () => {
    process.env.CLINIC_ASSET_STORAGE_DRIVER = "memory";
    process.env.CLINIC_ASSET_PUBLIC_ORIGIN = ASSET_ORIGIN;
    process.env.R2_ACCESS_KEY_ID = ACCESS_KEY;
    process.env.R2_SECRET_ACCESS_KEY = SECRET;
    resetPlatformSeoAssetStorageCache();
    resetMemoryPlatformSeoAssetStorage();
    await seedAsset();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("serves a valid platform SEO key from the configured asset host", async () => {
    const storage = getPlatformSeoAssetStorage();
    const read = vi.spyOn(storage!, "read");
    const head = vi.spyOn(storage!, "head");
    const response = await getPublicPlatformSeoAsset(
      publicRequest(PUBLIC_URL, { host: "assets.example.test" }),
      publicContext()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable"
    );
    expect(response.headers.get("cross-origin-resource-policy")).toBe(
      "same-site"
    );
    expect(response.headers.get("cross-origin-resource-policy")).not.toBe(
      "same-origin"
    );
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(headerBag(response)).not.toContain(SECRET);
    expect(headerBag(response)).not.toContain(ACCESS_KEY);
    const body = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(body)).toEqual(Array.from(PNG));
    expect(read).toHaveBeenCalledOnce();
    expect(head).not.toHaveBeenCalled();
  });

  it("returns HEAD 200 with the same headers and no body", async () => {
    const storage = getPlatformSeoAssetStorage();
    const read = vi.spyOn(storage!, "read");
    const head = vi.spyOn(storage!, "head");
    const response = await headPublicPlatformSeoAsset(
      publicRequest(PUBLIC_URL, { host: "assets.example.test" }, "HEAD"),
      publicContext()
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable"
    );
    expect(response.headers.get("cross-origin-resource-policy")).toBe(
      "same-site"
    );
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(head).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled();
  });

  it("returns a generic 404 for the wrong host, including forwarded spoofs", async () => {
    const wrongHosts = [
      "example.test",
      "app.example.test",
      "demodental.example.test",
      "evil.example",
      "assets.example.test.evil.example",
    ];

    for (const host of wrongHosts) {
      await expectGenericNotFound(
        await getPublicPlatformSeoAsset(
          publicRequest(PUBLIC_URL, { host }),
          publicContext()
        )
      );
    }

    await expectGenericNotFound(
      await getPublicPlatformSeoAsset(
        publicRequest("https://app.example.test/" + STORAGE_KEY, {
          host: "app.example.test",
          "x-forwarded-host": "assets.example.test",
        }),
        publicContext()
      )
    );
  });

  it("returns a generic 404 for malformed keys, traversal, and unsupported types", async () => {
    const filenames = [
      "../secret.png",
      "nested/file.png",
      "..png",
      "logo.gif",
      "logo.pdf",
      "logo.html",
      "logo.svg",
      "%2e%2e%2fsecret.png",
      "not-a-uuid.png",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpeg.exe",
    ];

    for (const filename of filenames) {
      await expectGenericNotFound(
        await getPublicPlatformSeoAsset(
          publicRequest(`${ASSET_ORIGIN}/platform/seo/${filename}`, {
            host: "assets.example.test",
          }),
          publicContext(filename)
        )
      );
    }
  });

  it("returns a generic 404 when the object is missing or storage is unconfigured", async () => {
    await expectGenericNotFound(
      await getPublicPlatformSeoAsset(
        publicRequest(
          `${ASSET_ORIGIN}/platform/seo/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png`,
          { host: "assets.example.test" }
        ),
        publicContext("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png")
      )
    );

    delete process.env.CLINIC_ASSET_STORAGE_DRIVER;
    resetPlatformSeoAssetStorageCache();
    await expectGenericNotFound(
      await getPublicPlatformSeoAsset(
        publicRequest(PUBLIC_URL, { host: "assets.example.test" }),
        publicContext()
      )
    );
  });

  it("does not implement object listing", () => {
    const adapter = readFileSync(
      "lib/platform-assets/r2-platform-seo-asset-storage.ts",
      "utf8"
    );
    const publicRoute = readFileSync(
      "app/platform/seo/[filename]/route.ts",
      "utf8"
    );
    expect(adapter).not.toMatch(/ListObjects/);
    expect(publicRoute).not.toMatch(/ListObjects/);
  });
});

describe("fallback /platform-seo route", () => {
  beforeEach(async () => {
    process.env.CLINIC_ASSET_STORAGE_DRIVER = "memory";
    delete process.env.CLINIC_ASSET_PUBLIC_ORIGIN;
    process.env.R2_ACCESS_KEY_ID = ACCESS_KEY;
    process.env.R2_SECRET_ACCESS_KEY = SECRET;
    resetPlatformSeoAssetStorageCache();
    resetMemoryPlatformSeoAssetStorage();
    await seedAsset();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("still serves the same-origin fallback with nosniff", async () => {
    const response = await getFallbackPlatformSeoAsset(
      publicRequest(`http://localhost:3000/platform-seo/${FILENAME}`, {
        host: "localhost:3000",
      }),
      publicContext()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cross-origin-resource-policy")).toBe(
      "same-origin"
    );
    const body = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(body)).toEqual(Array.from(PNG));
    expect(headerBag(response)).not.toContain(SECRET);
  });

  it("supports HEAD on the fallback route without a body", async () => {
    const response = await headFallbackPlatformSeoAsset(
      publicRequest(
        `http://localhost:3000/platform-seo/${FILENAME}`,
        { host: "localhost:3000" },
        "HEAD"
      ),
      publicContext()
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(response.headers.get("content-type")).toBe("image/png");
  });
});
