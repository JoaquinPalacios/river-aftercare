import { ClinicMembershipRole } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const previousDriver = process.env.CLINIC_ASSET_STORAGE_DRIVER;
process.env.CLINIC_ASSET_STORAGE_DRIVER = "memory";

const { profile, sites, branding } = vi.hoisted(() => ({
  profile: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  sites: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  branding: {
    logoUrl: "/demo/riverside-mark.svg" as string | null,
    darkLogoUrl: null as string | null,
    faviconUrl: null as string | null,
  },
}));

vi.mock("@/lib/prisma", () => {
  const db = {
    clinicProfile: profile,
    clinicSite: sites,
    $transaction: (work: (tx: unknown) => unknown) => work(db),
  };
  return { getPrisma: () => db };
});

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
    branding.logoUrl = "/demo/riverside-mark.svg";
    branding.darkLogoUrl = null;
    branding.faviconUrl = null;
    profile.findUnique.mockReset();
    profile.update.mockReset();
    sites.findMany.mockReset();
    sites.update.mockReset();
    profile.findUnique.mockResolvedValue({ clinicId: "clinic_a" });
    sites.findMany.mockImplementation(async () => [
      {
        id: "site_a",
        clinicId: "clinic_a",
        logoUrl: branding.logoUrl,
        darkLogoUrl: branding.darkLogoUrl,
        faviconUrl: branding.faviconUrl,
      },
    ]);
    profile.update.mockImplementation(async ({ data }) => {
      if (data && typeof data === "object") {
        if ("logoUrl" in data) branding.logoUrl = data.logoUrl;
        if ("darkLogoUrl" in data) branding.darkLogoUrl = data.darkLogoUrl;
        if ("faviconUrl" in data) branding.faviconUrl = data.faviconUrl;
      }
      return {};
    });
    sites.update.mockResolvedValue({});
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
    branding.faviconUrl = first.faviconUrl;
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
    branding.logoUrl = logo.logoUrl;
    branding.darkLogoUrl = logo.logoUrl;
    branding.faviconUrl = null;
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
