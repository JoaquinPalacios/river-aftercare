import { ClinicMembershipRole } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const previousDriver = process.env.CLINIC_ASSET_STORAGE_DRIVER;
process.env.CLINIC_ASSET_STORAGE_DRIVER = "memory";

const { profile } = vi.hoisted(() => ({
  profile: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    clinicProfile: profile,
  }),
}));

import {
  removeClinicDarkLogo,
  uploadClinicDarkLogo,
  uploadClinicFavicon,
  uploadClinicLogo,
} from "@/lib/clinic-assets/mutate-clinic-logo";
import {
  getClinicAssetStorage,
  resetClinicAssetStorageCache,
} from "@/lib/clinic-assets/get-clinic-asset-storage";
import {
  memoryClinicAssetKeys,
  resetMemoryClinicAssetStorage,
} from "@/lib/clinic-assets/memory-clinic-asset-storage";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { pngBytes } from "./helpers/og-image-bytes";

const PNG = pngBytes(32, 32);

function restoreDriver(): void {
  if (previousDriver === undefined) {
    delete process.env.CLINIC_ASSET_STORAGE_DRIVER;
  } else {
    process.env.CLINIC_ASSET_STORAGE_DRIVER = previousDriver;
  }
  resetClinicAssetStorageCache();
}

describe("clinic Dark logo and favicon assets", () => {
  beforeEach(() => {
    process.env.CLINIC_ASSET_STORAGE_DRIVER = "memory";
    delete process.env.CLINIC_ASSET_PUBLIC_ORIGIN;
    resetClinicAssetStorageCache();
    resetMemoryClinicAssetStorage();
    profile.findUnique.mockReset();
    profile.update.mockReset();
    profile.findUnique.mockResolvedValue({
      logoUrl: "/demo/riverside-mark.svg",
      darkLogoUrl: null,
      faviconUrl: null,
    });
    profile.update.mockResolvedValue({});
  });

  afterEach(() => {
    restoreDriver();
    delete process.env.CLINIC_ASSET_PUBLIC_ORIGIN;
  });

  it("stores a Dark logo under a distinct immutable key", async () => {
    const uploaded = await uploadClinicDarkLogo({
      actorRole: ClinicMembershipRole.ADMIN,
      actorClinicId: "clinic_a",
      targetClinicId: "clinic_a",
      bytes: PNG,
      mimeType: "image/png",
      fileName: "dark.png",
    });
    expect(uploaded.logoUrl).toMatch(/^clinics\/clinic_a\/branding\/.+\.png$/);
    expect(uploaded.logoSrc).toMatch(/^\/clinic-branding\/clinic_a\/.+\.png$/);
    expect(profile.update).toHaveBeenCalledWith({
      where: { clinicId: "clinic_a" },
      data: { darkLogoUrl: uploaded.logoUrl },
    });
  });

  it("stores a favicon under a new key and changes the URL on replace", async () => {
    const first = await uploadClinicFavicon({
      actorRole: ClinicMembershipRole.ADMIN,
      actorClinicId: "clinic_a",
      targetClinicId: "clinic_a",
      bytes: PNG,
      mimeType: "image/png",
      fileName: "icon.png",
    });
    profile.findUnique.mockResolvedValue({
      logoUrl: "/demo/riverside-mark.svg",
      darkLogoUrl: null,
      faviconUrl: first.faviconUrl,
    });
    const second = await uploadClinicFavicon({
      actorRole: ClinicMembershipRole.ADMIN,
      actorClinicId: "clinic_a",
      targetClinicId: "clinic_a",
      bytes: pngBytes(64, 64),
      mimeType: "image/png",
      fileName: "icon-2.png",
    });
    expect(second.faviconUrl).not.toBe(first.faviconUrl);
    expect(second.faviconSrc).not.toBe(first.faviconSrc);
    expect(memoryClinicAssetKeys()).toEqual([second.faviconUrl]);
  });

  it("does not delete a logo object still referenced as the standard logo", async () => {
    const logo = await uploadClinicLogo({
      actorRole: ClinicMembershipRole.ADMIN,
      actorClinicId: "clinic_a",
      targetClinicId: "clinic_a",
      bytes: PNG,
      mimeType: "image/png",
      fileName: "mark.png",
    });
    profile.findUnique.mockResolvedValue({
      logoUrl: logo.logoUrl,
      darkLogoUrl: logo.logoUrl,
      faviconUrl: null,
    });
    await removeClinicDarkLogo({
      actorRole: ClinicMembershipRole.ADMIN,
      actorClinicId: "clinic_a",
      targetClinicId: "clinic_a",
    });
    expect(memoryClinicAssetKeys()).toEqual([logo.logoUrl]);
  });

  it("keeps Clinic B from writing Clinic A's favicon", async () => {
    await expect(
      uploadClinicFavicon({
        actorRole: ClinicMembershipRole.ADMIN,
        actorClinicId: "clinic_b",
        targetClinicId: "clinic_a",
        bytes: PNG,
        mimeType: "image/png",
        fileName: "icon.png",
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);
    expect(getClinicAssetStorage()).toBeTruthy();
    expect(memoryClinicAssetKeys()).toEqual([]);
  });

  it("rejects a non-square favicon before storage", async () => {
    await expect(
      uploadClinicFavicon({
        actorRole: ClinicMembershipRole.ADMIN,
        actorClinicId: "clinic_a",
        targetClinicId: "clinic_a",
        bytes: pngBytes(64, 32),
        mimeType: "image/png",
        fileName: "wide.png",
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);
    expect(memoryClinicAssetKeys()).toEqual([]);
  });
});
