import { ClinicMembershipRole } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";

import { authorizeClinicLogoMutation } from "@/lib/clinic-assets/authorize-clinic-logo";
import {
  CLINIC_LOGO_RASTER_MAX_BYTES,
  clinicLogoObjectKey,
  clinicLogoPublicPath,
  clinicLogoStorageKeyFromBrandingParams,
  isClinicBrandingPublicPath,
  isClinicLogoStorageKey,
  storageKeyFromClinicLogoPath,
  validateClinicLogo,
} from "@/lib/clinic-assets/clinic-logo";
import {
  clinicAssetStorageStatus,
  requestHostMatchesClinicAssetPublicOrigin,
} from "@/lib/clinic-assets/config";

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

describe("clinic logo validation", () => {
  it("accepts PNG, JPEG, WebP, and SVG magic/markup with matching MIME types", () => {
    expect(
      validateClinicLogo({ bytes: PNG, mimeType: "image/png" })
    ).toMatchObject({ ok: true, extension: "png" });
    expect(
      validateClinicLogo({ bytes: JPEG, mimeType: "image/jpeg" })
    ).toMatchObject({ ok: true, extension: "jpg" });
    expect(
      validateClinicLogo({ bytes: WEBP, mimeType: "image/webp" })
    ).toMatchObject({ ok: true, extension: "webp" });
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>'
    );
    expect(
      validateClinicLogo({
        bytes: svg,
        mimeType: "image/svg+xml",
        fileName: "mark.svg",
      })
    ).toMatchObject({ ok: true, extension: "svg" });
  });

  it("rejects mismatched MIME, fake extensions, and oversized files", () => {
    expect(validateClinicLogo({ bytes: PNG, mimeType: "image/jpeg" }).ok).toBe(
      false
    );
    expect(
      validateClinicLogo({
        bytes: PNG,
        mimeType: "image/png",
        fileName: "logo.svg",
      }).ok
    ).toBe(false);
    expect(
      validateClinicLogo({
        bytes: PNG,
        mimeType: "",
        fileName: "mark.png",
      })
    ).toMatchObject({ ok: true, extension: "png" });

    const oversized = new Uint8Array(CLINIC_LOGO_RASTER_MAX_BYTES + 1);
    oversized.set(PNG.slice(0, 8));
    expect(
      validateClinicLogo({ bytes: oversized, mimeType: "image/png" })
    ).toMatchObject({
      ok: false,
      error: "Logo files must be 2 MB or smaller.",
    });
  });

  it("builds generated clinic-owned keys and provider-independent public URLs", () => {
    const key = clinicLogoObjectKey({
      clinicId: "clinic_demo_rivers",
      objectId: "logo_abc123",
      extension: "webp",
    });

    expect(key).toBe("clinics/clinic_demo_rivers/branding/logo_abc123.webp");
    expect(clinicLogoPublicPath(key)).toBe(
      "/clinic-branding/clinic_demo_rivers/logo_abc123.webp"
    );
    expect(
      clinicLogoPublicPath(
        "clinics/clinic_demo_rivers/branding/logo_abc123.svg"
      )
    ).toBe("/clinic-branding/clinic_demo_rivers/logo_abc123.svg");
    expect(
      storageKeyFromClinicLogoPath(
        "/clinic-branding/clinic_demo_rivers/logo_abc123.webp"
      )
    ).toBe(key);
    expect(clinicLogoPublicPath("public/uploads/logo.png")).toBeNull();
  });

  it("rejects traversal, unexpected namespaces, and unsupported extensions", () => {
    expect(clinicLogoStorageKeyFromBrandingParams("clinic_a", "logo.png")).toBe(
      "clinics/clinic_a/branding/logo.png"
    );
    expect(
      clinicLogoStorageKeyFromBrandingParams("../clinic_a", "logo.png")
    ).toBeNull();
    expect(
      clinicLogoStorageKeyFromBrandingParams("clinic_a", "../logo.png")
    ).toBeNull();
    expect(
      clinicLogoStorageKeyFromBrandingParams("clinic_a", "logo.gif")
    ).toBeNull();
    expect(
      clinicLogoStorageKeyFromBrandingParams("clinic/a", "logo.png")
    ).toBeNull();
    expect(
      clinicLogoStorageKeyFromBrandingParams("clinic_a", "nested/logo.png")
    ).toBeNull();
    expect(
      clinicLogoStorageKeyFromBrandingParams("clinic_a", "%2e%2e%2fsecret.png")
    ).toBeNull();
    expect(isClinicLogoStorageKey("patients/clinic_a/records/logo.png")).toBe(
      false
    );
    expect(isClinicBrandingPublicPath("/clinics/clinic_a/branding")).toBe(
      false
    );
    expect(isClinicBrandingPublicPath("/clinics/clinic_a/branding/")).toBe(
      false
    );
    expect(
      isClinicBrandingPublicPath("/clinics/clinic_a/branding/logo.png")
    ).toBe(true);
    expect(
      storageKeyFromClinicLogoPath("/clinic-branding/clinic_a/..%2fsecret.png")
    ).toBeNull();
  });
});

describe("clinic logo authorization", () => {
  it("allows the authenticated clinic ADMIN only", () => {
    expect(
      authorizeClinicLogoMutation({
        role: ClinicMembershipRole.ADMIN,
        actorClinicId: "clinic_a",
        targetClinicId: "clinic_a",
      })
    ).toEqual({ ok: true });
  });

  it("forbids STAFF and cross-clinic writes", () => {
    expect(
      authorizeClinicLogoMutation({
        role: ClinicMembershipRole.STAFF,
        actorClinicId: "clinic_a",
        targetClinicId: "clinic_a",
      })
    ).toEqual({ ok: false, code: "forbidden" });
    expect(
      authorizeClinicLogoMutation({
        role: ClinicMembershipRole.ADMIN,
        actorClinicId: "clinic_a",
        targetClinicId: "clinic_b",
      })
    ).toEqual({ ok: false, code: "forbidden" });
  });
});

describe("clinic asset storage configuration", () => {
  const previous = {
    driver: process.env.CLINIC_ASSET_STORAGE_DRIVER,
    account: process.env.R2_ACCOUNT_ID,
    bucket: process.env.R2_BUCKET,
    access: process.env.R2_ACCESS_KEY_ID,
    secret: process.env.R2_SECRET_ACCESS_KEY,
    origin: process.env.CLINIC_ASSET_PUBLIC_ORIGIN,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries({
      CLINIC_ASSET_STORAGE_DRIVER: previous.driver,
      R2_ACCOUNT_ID: previous.account,
      R2_BUCKET: previous.bucket,
      R2_ACCESS_KEY_ID: previous.access,
      R2_SECRET_ACCESS_KEY: previous.secret,
      CLINIC_ASSET_PUBLIC_ORIGIN: previous.origin,
    })) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("is unconfigured without a provisioned driver and credentials", () => {
    delete process.env.CLINIC_ASSET_STORAGE_DRIVER;
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_BUCKET;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.CLINIC_ASSET_PUBLIC_ORIGIN;
    expect(clinicAssetStorageStatus()).toEqual({
      available: false,
      reason: "unconfigured",
    });
  });

  it("requires R2 credentials and a public origin before becoming available", () => {
    process.env.CLINIC_ASSET_STORAGE_DRIVER = "r2";
    process.env.R2_ACCOUNT_ID = "accountidaccountidaccountidacct";
    process.env.R2_BUCKET = "clinic-branding-assets";
    process.env.R2_ACCESS_KEY_ID = "id";
    process.env.R2_SECRET_ACCESS_KEY = "secret";
    delete process.env.CLINIC_ASSET_PUBLIC_ORIGIN;
    expect(clinicAssetStorageStatus()).toEqual({
      available: false,
      reason: "unconfigured",
    });

    process.env.CLINIC_ASSET_PUBLIC_ORIGIN = "https://assets.example.test";
    expect(clinicAssetStorageStatus()).toEqual({
      available: true,
      driver: "r2",
      bucket: "clinic-branding-assets",
    });
  });

  it("matches only the configured asset Host header", () => {
    process.env.CLINIC_ASSET_PUBLIC_ORIGIN = "https://assets.example.test";
    expect(
      requestHostMatchesClinicAssetPublicOrigin("assets.example.test")
    ).toBe(true);
    expect(
      requestHostMatchesClinicAssetPublicOrigin("ASSETS.EXAMPLE.TEST")
    ).toBe(true);
    expect(requestHostMatchesClinicAssetPublicOrigin("example.test")).toBe(
      false
    );
    expect(requestHostMatchesClinicAssetPublicOrigin("app.example.test")).toBe(
      false
    );
    expect(
      requestHostMatchesClinicAssetPublicOrigin("demodental.example.test")
    ).toBe(false);
    expect(requestHostMatchesClinicAssetPublicOrigin("evil.example")).toBe(
      false
    );
    expect(requestHostMatchesClinicAssetPublicOrigin(null)).toBe(false);
  });
});
