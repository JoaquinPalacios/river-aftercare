import { readFileSync } from "node:fs";

import { ClinicMembershipRole } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loaded = vi.hoisted(() => ({
  jsdom: false,
  sanitizer: false,
}));
const loadedAtImport = vi.hoisted(() => ({
  jsdom: false,
  sanitizer: false,
}));

const previousDriver = process.env.CLINIC_ASSET_STORAGE_DRIVER;
process.env.CLINIC_ASSET_STORAGE_DRIVER = "memory";

const { profile, sites } = vi.hoisted(() => ({
  profile: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  sites: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("jsdom", () => {
  loaded.jsdom = true;
  loadedAtImport.jsdom = true;
  return {
    JSDOM: class JSDOM {
      constructor() {
        throw new Error("jsdom must not construct for raster logo uploads");
      }
    },
  };
});

vi.mock("@/lib/clinic-assets/sanitize-clinic-logo-svg", () => {
  loaded.sanitizer = true;
  loadedAtImport.sanitizer = true;
  return {
    sanitizeClinicLogoSvg: () => {
      throw new Error("SVG sanitizer must not run for raster logo uploads");
    },
  };
});

vi.mock("@/lib/prisma", () => {
  const db = {
    clinicProfile: profile,
    clinicSite: sites,
    $transaction: (work: (tx: unknown) => unknown) => work(db),
  };
  return { getPrisma: () => db };
});

import { resetClinicAssetStorageCache } from "@/lib/clinic-assets/get-clinic-asset-storage";
import { resetMemoryClinicAssetStorage } from "@/lib/clinic-assets/memory-clinic-asset-storage";
import { uploadClinicLogo } from "@/lib/clinic-assets/mutate-clinic-logo";

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

function restoreDriver(): void {
  if (previousDriver === undefined) {
    delete process.env.CLINIC_ASSET_STORAGE_DRIVER;
  } else {
    process.env.CLINIC_ASSET_STORAGE_DRIVER = previousDriver;
  }
  resetClinicAssetStorageCache();
}

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Practice save / logo upload jsdom isolation", () => {
  beforeEach(() => {
    process.env.CLINIC_ASSET_STORAGE_DRIVER = "memory";
    delete process.env.CLINIC_ASSET_PUBLIC_ORIGIN;
    resetClinicAssetStorageCache();
    resetMemoryClinicAssetStorage();
    profile.findUnique.mockReset();
    profile.update.mockReset();
    sites.findMany.mockReset();
    sites.update.mockReset();
    profile.findUnique.mockResolvedValue({ clinicId: "clinic_a" });
    sites.findMany.mockResolvedValue([
      {
        id: "site_a",
        clinicId: "clinic_a",
        logoUrl: "/demo/riverside-mark.svg",
        darkLogoUrl: null,
        faviconUrl: null,
      },
    ]);
    profile.update.mockResolvedValue({});
    sites.update.mockResolvedValue({});
    loaded.jsdom = false;
    loaded.sanitizer = false;
  });

  afterEach(() => {
    restoreDriver();
    delete process.env.CLINIC_ASSET_PUBLIC_ORIGIN;
  });

  it("keeps ordinary Practice save off the SVG sanitizer module graph", () => {
    const actions = source("app/(staff)/(clinic-portal)/practice/actions.ts");
    expect(actions).toContain("savePracticeSettingsAction");
    expect(actions).not.toContain("mutate-clinic-logo");
    expect(actions).not.toContain("sanitize-clinic-logo-svg");
    expect(actions).not.toContain("jsdom");
    expect(actions).not.toContain("dompurify");
    expect(actions).not.toContain("uploadClinicLogo");
    expect(actions).not.toContain("get-clinic-asset-storage");
  });

  it("loads the sanitizer only from the SVG branch of mutate-clinic-logo", () => {
    const mutate = source("lib/clinic-assets/mutate-clinic-logo.ts");
    expect(mutate).not.toMatch(
      /import\s+\{[^}]*sanitizeClinicLogoSvg[^}]*\}\s+from/
    );
    expect(mutate).toMatch(
      /await import\(\s*["']@\/lib\/clinic-assets\/sanitize-clinic-logo-svg["']\s*\)/
    );
    expect(mutate).toContain('validated.kind === "svg"');
  });

  it("keeps logo actions in a separate server-action module", () => {
    const logoActions = source(
      "app/(staff)/(clinic-portal)/practice/logo-actions.ts"
    );
    const field = source(
      "app/(staff)/(clinic-portal)/practice/practice-logo-field.tsx"
    );
    expect(logoActions).toContain("uploadClinicLogoAction");
    expect(logoActions).toContain("mutate-clinic-logo");
    expect(field).toContain("practice/logo-actions");
    expect(field).not.toContain(
      'from "@/app/(staff)/(clinic-portal)/practice/actions"'
    );
  });

  it("does not change clinic R2 or platform OG upload modules", () => {
    const r2 = source("lib/clinic-assets/r2-clinic-asset-storage.ts");
    const og = source("lib/platform-assets/mutate-platform-seo-og.ts");
    expect(r2).toContain("@aws-sdk/client-s3");
    expect(r2).not.toContain("jsdom");
    expect(r2).not.toContain("sanitize-clinic-logo-svg");
    expect(og).not.toContain("jsdom");
    expect(og).not.toContain("sanitize-clinic-logo-svg");
    expect(og).not.toContain("mutate-clinic-logo");
  });

  it("uploads PNG, JPEG, and WebP without loading jsdom or the SVG sanitizer", async () => {
    expect(loadedAtImport.jsdom).toBe(false);
    expect(loadedAtImport.sanitizer).toBe(false);
    for (const [bytes, mimeType, fileName] of [
      [PNG, "image/png", "mark.png"],
      [JPEG, "image/jpeg", "mark.jpg"],
      [WEBP, "image/webp", "mark.webp"],
    ] as const) {
      loaded.jsdom = false;
      loaded.sanitizer = false;
      const uploaded = await uploadClinicLogo({
        actorRole: ClinicMembershipRole.ADMIN,
        actorClinicId: "clinic_a",
        targetClinicId: "clinic_a",
        bytes,
        mimeType,
        fileName,
      });
      expect(uploaded.logoUrl).toMatch(
        /^clinics\/clinic_a\/branding\/.+\.(png|jpg|webp)$/
      );
      expect(loaded.jsdom).toBe(false);
      expect(loaded.sanitizer).toBe(false);
    }
  });
});
