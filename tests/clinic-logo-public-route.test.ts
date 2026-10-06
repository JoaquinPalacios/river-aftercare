import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findClinicRetirement = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    clinic: {
      findUnique: findClinicRetirement,
    },
  }),
}));

import {
  GET as getPublicClinicLogo,
  HEAD as headPublicClinicLogo,
} from "@/app/clinics/[clinicId]/branding/[filename]/route";
import {
  GET as getFallbackClinicLogo,
  HEAD as headFallbackClinicLogo,
} from "@/app/clinic-branding/[clinicId]/[filename]/route";
import {
  getClinicAssetStorage,
  resetClinicAssetStorageCache,
} from "@/lib/clinic-assets/get-clinic-asset-storage";
import { resetMemoryClinicAssetStorage } from "@/lib/clinic-assets/memory-clinic-asset-storage";

const CLINIC_ID = "clinic_a";
const FILENAME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";
const STORAGE_KEY = `clinics/${CLINIC_ID}/branding/${FILENAME}`;
const ASSET_ORIGIN = "https://assets.example.test";
const PUBLIC_URL = `${ASSET_ORIGIN}/${STORAGE_KEY}`;
const SECRET = "super-secret-r2-credential-xyz";
const ACCESS_KEY = "AKIA_TEST_LEAK_KEY";

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

const previous = {
  driver: process.env.CLINIC_ASSET_STORAGE_DRIVER,
  origin: process.env.CLINIC_ASSET_PUBLIC_ORIGIN,
  access: process.env.R2_ACCESS_KEY_ID,
  secret: process.env.R2_SECRET_ACCESS_KEY,
  databaseUrl: process.env.DATABASE_URL,
  nodeEnv: process.env.NODE_ENV,
  vercel: process.env.VERCEL,
  vercelEnv: process.env.VERCEL_ENV,
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries({
    CLINIC_ASSET_STORAGE_DRIVER: previous.driver,
    CLINIC_ASSET_PUBLIC_ORIGIN: previous.origin,
    R2_ACCESS_KEY_ID: previous.access,
    R2_SECRET_ACCESS_KEY: previous.secret,
    DATABASE_URL: previous.databaseUrl,
    NODE_ENV: previous.nodeEnv,
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
  resetMemoryClinicAssetStorage();
}

async function seedLogo(): Promise<void> {
  const storage = getClinicAssetStorage();
  if (!storage) {
    throw new Error("expected memory clinic asset storage");
  }
  await storage.uploadLogo({
    clinicId: CLINIC_ID,
    storageKey: STORAGE_KEY,
    bytes: PNG,
    mimeType: "image/png",
  });
}

function publicContext(clinicId = CLINIC_ID, filename = FILENAME) {
  return { params: Promise.resolve({ clinicId, filename }) };
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

describe("public clinic branding asset route", () => {
  beforeEach(async () => {
    findClinicRetirement.mockReset();
    findClinicRetirement.mockResolvedValue(null);
    process.env.CLINIC_ASSET_STORAGE_DRIVER = "memory";
    process.env.CLINIC_ASSET_PUBLIC_ORIGIN = ASSET_ORIGIN;
    process.env.R2_ACCESS_KEY_ID = ACCESS_KEY;
    process.env.R2_SECRET_ACCESS_KEY = SECRET;
    resetClinicAssetStorageCache();
    resetMemoryClinicAssetStorage();
    await seedLogo();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("serves a valid branding key from the configured asset host", async () => {
    const response = await getPublicClinicLogo(
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
    expect(new TextDecoder().decode(body)).not.toContain(SECRET);
    expect(new TextDecoder().decode(body)).not.toContain(ACCESS_KEY);
  });

  it("returns HEAD 200 with the same headers and no body", async () => {
    const response = await headPublicClinicLogo(
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
    expect(response.headers.get("cross-origin-resource-policy")).not.toBe(
      "same-origin"
    );
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(headerBag(response)).not.toContain(SECRET);
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
        await getPublicClinicLogo(
          publicRequest(PUBLIC_URL, { host }),
          publicContext()
        )
      );
    }

    await expectGenericNotFound(
      await getPublicClinicLogo(
        publicRequest("https://app.example.test/" + STORAGE_KEY, {
          host: "app.example.test",
          "x-forwarded-host": "assets.example.test",
        }),
        publicContext()
      )
    );
  });

  it("returns a generic 404 for malformed keys, traversal, and unsupported types", async () => {
    const cases: Array<{ clinicId: string; filename: string }> = [
      { clinicId: "../clinic_a", filename: FILENAME },
      { clinicId: "clinic/a", filename: FILENAME },
      { clinicId: "clinic_a", filename: "../secret.png" },
      { clinicId: "clinic_a", filename: "nested/logo.png" },
      { clinicId: "clinic_a", filename: "..png" },
      { clinicId: "clinic_a", filename: "logo.gif" },
      { clinicId: "clinic_a", filename: "logo.pdf" },
      { clinicId: "clinic_a", filename: "logo.html" },
      { clinicId: "clinic_a", filename: "%2e%2e%2fsecret.png" },
      { clinicId: "%2e%2e", filename: FILENAME },
    ];

    for (const params of cases) {
      await expectGenericNotFound(
        await getPublicClinicLogo(
          publicRequest(
            `${ASSET_ORIGIN}/clinics/${params.clinicId}/branding/${params.filename}`,
            { host: "assets.example.test" }
          ),
          publicContext(params.clinicId, params.filename)
        )
      );
    }
  });

  it("returns a generic 404 when the object is missing or storage is unconfigured", async () => {
    await expectGenericNotFound(
      await getPublicClinicLogo(
        publicRequest(
          `${ASSET_ORIGIN}/clinics/${CLINIC_ID}/branding/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png`,
          { host: "assets.example.test" }
        ),
        publicContext(CLINIC_ID, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png")
      )
    );

    delete process.env.CLINIC_ASSET_STORAGE_DRIVER;
    resetClinicAssetStorageCache();
    await expectGenericNotFound(
      await getPublicClinicLogo(
        publicRequest(PUBLIC_URL, { host: "assets.example.test" }),
        publicContext()
      )
    );
  });

  it("does not serve branding for a permanently deleted clinic", async () => {
    process.env.DATABASE_URL = "postgresql://127.0.0.1:5432/care_guide";
    findClinicRetirement.mockResolvedValue({
      permanentlyDeletedAt: new Date("2026-10-06T00:00:00.000Z"),
    });

    const response = await getPublicClinicLogo(
      publicRequest(PUBLIC_URL, { host: "assets.example.test" }),
      publicContext()
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type") ?? "").not.toMatch(/image\//);
  });

  it("fails closed when the retirement lookup throws", async () => {
    process.env.DATABASE_URL = "postgresql://127.0.0.1:5432/care_guide";
    findClinicRetirement.mockRejectedValue(new Error("database unavailable"));

    const response = await getPublicClinicLogo(
      publicRequest(PUBLIC_URL, { host: "assets.example.test" }),
      publicContext()
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type") ?? "").not.toMatch(/image\//);
  });

  it("still serves branding when the clinic is active", async () => {
    process.env.DATABASE_URL = "postgresql://127.0.0.1:5432/care_guide";
    findClinicRetirement.mockResolvedValue({ permanentlyDeletedAt: null });

    const response = await getPublicClinicLogo(
      publicRequest(PUBLIC_URL, { host: "assets.example.test" }),
      publicContext()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
  });

  it("fails closed on Vercel when the database is unset", async () => {
    delete process.env.DATABASE_URL;
    process.env.VERCEL_ENV = "production";

    const response = await getPublicClinicLogo(
      publicRequest(PUBLIC_URL, { host: "assets.example.test" }),
      publicContext()
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(findClinicRetirement).not.toHaveBeenCalled();
  });

  it("leaves static demo and platform marks outside the clinic branding lookup", () => {
    const demo = readFileSync("public/demo/riverside-mark.svg", "utf8");
    const platform = readFileSync(
      "public/brand/river-aftercare-logo.svg",
      "utf8"
    );
    const routes = [
      readFileSync(
        "app/clinics/[clinicId]/branding/[filename]/route.ts",
        "utf8"
      ),
      readFileSync(
        "app/clinic-branding/[clinicId]/[filename]/route.ts",
        "utf8"
      ),
    ].join("\n");

    expect(demo).toContain("<svg");
    expect(platform).toContain("<svg");
    expect(routes).not.toContain("public/demo");
    expect(routes).not.toContain("public/brand");
    expect(routes).not.toContain("riverside-mark");
  });

  it("does not list objects from the public branding route", () => {
    const adapter = readFileSync(
      "lib/clinic-assets/r2-clinic-asset-storage.ts",
      "utf8"
    );
    const publicRoute = readFileSync(
      "app/clinics/[clinicId]/branding/[filename]/route.ts",
      "utf8"
    );
    expect(publicRoute).not.toMatch(/ListObjects/);
    expect(publicRoute).not.toMatch(/listLogo/);
    expect(adapter).toContain("Prefix: prefix");
    expect(adapter).toContain("clinics/${clinicId}/branding/");
  });
});

describe("fallback /clinic-branding route", () => {
  beforeEach(async () => {
    findClinicRetirement.mockReset();
    findClinicRetirement.mockResolvedValue(null);
    process.env.CLINIC_ASSET_STORAGE_DRIVER = "memory";
    delete process.env.CLINIC_ASSET_PUBLIC_ORIGIN;
    process.env.R2_ACCESS_KEY_ID = ACCESS_KEY;
    process.env.R2_SECRET_ACCESS_KEY = SECRET;
    resetClinicAssetStorageCache();
    resetMemoryClinicAssetStorage();
    await seedLogo();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("still serves the same-origin fallback with nosniff", async () => {
    const response = await getFallbackClinicLogo(
      publicRequest(
        `http://localhost:3000/clinic-branding/${CLINIC_ID}/${FILENAME}`,
        { host: "localhost:3000" }
      ),
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
    const response = await headFallbackClinicLogo(
      publicRequest(
        `http://localhost:3000/clinic-branding/${CLINIC_ID}/${FILENAME}`,
        { host: "localhost:3000" },
        "HEAD"
      ),
      publicContext()
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(headerBag(response)).not.toContain(SECRET);
  });
});
