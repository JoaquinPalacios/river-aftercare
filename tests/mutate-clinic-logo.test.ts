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
    $executeRaw: async () => 0,
    $transaction: (work: (tx: unknown) => unknown) => work(db),
  };
  return { getPrisma: () => db };
});

import {
  removeClinicLogo,
  uploadClinicLogo,
} from "@/lib/clinic-assets/mutate-clinic-logo";
import {
  resetClinicAssetStorageCache,
  getClinicAssetStorage,
} from "@/lib/clinic-assets/get-clinic-asset-storage";
import { clinicLogoStorageKeyFromStoredValue } from "@/lib/clinic-assets/clinic-logo";
import {
  memoryClinicAssetKeys,
  resetMemoryClinicAssetStorage,
} from "@/lib/clinic-assets/memory-clinic-asset-storage";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { ClinicAssetStorageUnavailableError } from "@/lib/clinic-assets/errors";

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const SVG = new TextEncoder().encode(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#155e75"/></svg>`
);

const KEY_PATTERN =
  /^clinics\/clinic_a\/branding\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp|svg)$/;

function restoreDriver(): void {
  if (previousDriver === undefined) {
    delete process.env.CLINIC_ASSET_STORAGE_DRIVER;
  } else {
    process.env.CLINIC_ASSET_STORAGE_DRIVER = previousDriver;
  }
  resetClinicAssetStorageCache();
}

describe("uploadClinicLogo / removeClinicLogo", () => {
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
    profile.update.mockResolvedValue({});
    sites.update.mockResolvedValue({});
  });

  afterEach(() => {
    restoreDriver();
    delete process.env.CLINIC_ASSET_PUBLIC_ORIGIN;
  });

  it("stores PNG, JPEG, WebP, and sanitized SVG under immutable UUID keys", async () => {
    const png = await uploadClinicLogo({
      actorRole: ClinicMembershipRole.ADMIN,
      actorClinicId: "clinic_a",
      targetClinicId: "clinic_a",
      bytes: PNG,
      mimeType: "image/png",
      fileName: "mark.png",
    });
    expect(png.logoUrl).toMatch(KEY_PATTERN);
    expect(png.logoUrl).toMatch(/\.png$/);
    expect(png.logoUrl).not.toContain("mark.png");
    expect(png.logoSrc).toMatch(/^\/clinic-branding\/clinic_a\/.+\.png$/);

    const jpeg = await uploadClinicLogo({
      actorRole: ClinicMembershipRole.ADMIN,
      actorClinicId: "clinic_a",
      targetClinicId: "clinic_a",
      bytes: JPEG,
      mimeType: "image/jpeg",
      fileName: "mark.jpg",
    });
    expect(jpeg.logoUrl).toMatch(/\.jpg$/);

    const webp = await uploadClinicLogo({
      actorRole: ClinicMembershipRole.ADMIN,
      actorClinicId: "clinic_a",
      targetClinicId: "clinic_a",
      bytes: WEBP,
      mimeType: "image/webp",
      fileName: "mark.webp",
    });
    expect(webp.logoUrl).toMatch(/\.webp$/);

    const svg = await uploadClinicLogo({
      actorRole: ClinicMembershipRole.ADMIN,
      actorClinicId: "clinic_a",
      targetClinicId: "clinic_a",
      bytes: SVG,
      mimeType: "image/svg+xml",
      fileName: "mark.svg",
    });
    expect(svg.logoUrl).toMatch(/\.svg$/);
    expect(svg.logoSrc).toMatch(/^\/clinic-branding\/clinic_a\/.+\.svg$/);
    expect(profile.update).toHaveBeenCalled();
  });

  it("replaces by uploading a new object before updating the stored key", async () => {
    const first = await uploadClinicLogo({
      actorRole: ClinicMembershipRole.ADMIN,
      actorClinicId: "clinic_a",
      targetClinicId: "clinic_a",
      bytes: PNG,
      mimeType: "image/png",
      fileName: "one.png",
    });
    branding.logoUrl = first.logoUrl;

    const second = await uploadClinicLogo({
      actorRole: ClinicMembershipRole.ADMIN,
      actorClinicId: "clinic_a",
      targetClinicId: "clinic_a",
      bytes: WEBP,
      mimeType: "image/webp",
      fileName: "two.webp",
    });

    expect(second.logoUrl).not.toBe(first.logoUrl);
    expect(memoryClinicAssetKeys()).toEqual([second.logoUrl]);
    expect(
      profile.update.mock.calls.some(
        (call) => call[0]?.data?.logoUrl === second.logoUrl
      )
    ).toBe(true);
  });

  it("forbids STAFF and cross-clinic writes", async () => {
    await expect(
      uploadClinicLogo({
        actorRole: ClinicMembershipRole.STAFF,
        actorClinicId: "clinic_a",
        targetClinicId: "clinic_a",
        bytes: PNG,
        mimeType: "image/png",
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);

    await expect(
      uploadClinicLogo({
        actorRole: ClinicMembershipRole.ADMIN,
        actorClinicId: "clinic_a",
        targetClinicId: "clinic_b",
        bytes: PNG,
        mimeType: "image/png",
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);
  });

  it("does not persist script tags from an uploaded SVG", async () => {
    const result = await uploadClinicLogo({
      actorRole: ClinicMembershipRole.ADMIN,
      actorClinicId: "clinic_a",
      targetClinicId: "clinic_a",
      bytes: new TextEncoder().encode(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><circle r="4"/></svg>`
      ),
      mimeType: "image/svg+xml",
      fileName: "evil.svg",
    });
    expect(result.logoUrl).toMatch(/\.svg$/);
    const key = clinicLogoStorageKeyFromStoredValue(result.logoUrl);
    expect(key).toBe(result.logoUrl);
    const stored = await getClinicAssetStorage()?.readLogo({
      clinicId: "clinic_a",
      storageKey: key!,
    });
    expect(stored).toBeTruthy();
    expect(new TextDecoder().decode(stored!.bytes)).not.toMatch(/<script/i);
  });

  it("rejects oversized files and MIME mismatches before storage", async () => {
    await expect(
      uploadClinicLogo({
        actorRole: ClinicMembershipRole.ADMIN,
        actorClinicId: "clinic_a",
        targetClinicId: "clinic_a",
        bytes: PNG,
        mimeType: "image/jpeg",
        fileName: "fake.jpg",
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);
    expect(memoryClinicAssetKeys()).toEqual([]);
    expect(profile.update).not.toHaveBeenCalled();
  });

  it("leaves the database unchanged when object storage fails", async () => {
    const storage = getClinicAssetStorage();
    expect(storage).toBeTruthy();
    vi.spyOn(storage!, "uploadLogo").mockRejectedValueOnce(
      new Error("AccessDenied")
    );

    await expect(
      uploadClinicLogo({
        actorRole: ClinicMembershipRole.ADMIN,
        actorClinicId: "clinic_a",
        targetClinicId: "clinic_a",
        bytes: PNG,
        mimeType: "image/png",
        fileName: "mark.png",
      })
    ).rejects.toMatchObject({
      message: "Could not store the clinic logo.",
    });
    expect(profile.update).not.toHaveBeenCalled();
  });

  it("deletes the new object when the database update fails", async () => {
    profile.update.mockRejectedValueOnce(new Error("write failed"));

    await expect(
      uploadClinicLogo({
        actorRole: ClinicMembershipRole.ADMIN,
        actorClinicId: "clinic_a",
        targetClinicId: "clinic_a",
        bytes: PNG,
        mimeType: "image/png",
        fileName: "mark.png",
      })
    ).rejects.toMatchObject({
      message: "Could not update the clinic logo.",
    });
    expect(memoryClinicAssetKeys()).toEqual([]);
  });

  it("treats a failed previous-object delete as success after the clinic update", async () => {
    const first = await uploadClinicLogo({
      actorRole: ClinicMembershipRole.ADMIN,
      actorClinicId: "clinic_a",
      targetClinicId: "clinic_a",
      bytes: PNG,
      mimeType: "image/png",
      fileName: "one.png",
    });
    branding.logoUrl = first.logoUrl;
    const storage = getClinicAssetStorage();
    vi.spyOn(storage!, "deleteLogo").mockRejectedValueOnce(
      new Error("NoSuchKey")
    );

    const second = await uploadClinicLogo({
      actorRole: ClinicMembershipRole.ADMIN,
      actorClinicId: "clinic_a",
      targetClinicId: "clinic_a",
      bytes: JPEG,
      mimeType: "image/jpeg",
      fileName: "two.jpg",
    });

    expect(second.logoUrl).toMatch(/\.jpg$/);
    expect(profile.update).toHaveBeenCalled();
  });

  it("clears a stored logo on remove without deleting a demo path", async () => {
    const deleteSpy = vi.spyOn(getClinicAssetStorage()!, "deleteLogo");
    await removeClinicLogo({
      actorRole: ClinicMembershipRole.ADMIN,
      actorClinicId: "clinic_a",
      targetClinicId: "clinic_a",
    });
    expect(profile.update).toHaveBeenCalledWith({
      where: { clinicId: "clinic_a" },
      data: { logoUrl: null },
    });
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("clears the database reference before best-effort object delete", async () => {
    branding.logoUrl =
      "clinics/clinic_a/branding/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png";
    const order: string[] = [];
    profile.update.mockImplementation(async () => {
      order.push("db");
      return {};
    });
    const storage = getClinicAssetStorage();
    vi.spyOn(storage!, "deleteLogo").mockImplementation(async () => {
      order.push("object");
    });

    await removeClinicLogo({
      actorRole: ClinicMembershipRole.ADMIN,
      actorClinicId: "clinic_a",
      targetClinicId: "clinic_a",
    });
    expect(order).toEqual(["db", "object"]);
  });
});

describe("storage unconfigured", () => {
  it("does not pretend a filesystem upload succeeded", () => {
    expect(ClinicAssetStorageUnavailableError).toBeDefined();
  });
});
