import "dotenv/config";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";

import { BillingStatus, EntitlementStatus } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  default: () => ({
    auth: vi.fn(),
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: vi.fn(() => ({})),
}));

import {
  copyOwnedBrandingObject,
  prepareAccountSplitBranding,
} from "@/lib/account-split/branding";
import { splitDestinationBrandingKey } from "@/lib/account-split/branding-plan";
import { listCrossOwnedCompletedSplits } from "@/lib/account-split/branding-ownership-audit.mjs";
import { executeClinicAccountSplit } from "@/lib/account-split/execute";
import {
  createAccountSplitPreparation,
  createSplitDestinationAccount,
  previewAccountSplit,
  revalidateAccountSplitPreparation,
  saveAccountSplitSiteDecisions,
  saveAccountSplitStaffSelections,
  updateAccountSplitDestinationTarget,
} from "@/lib/account-split/preparation";
import { isOwnedClinicBrandingKey } from "@/lib/clinic-assets/clinic-logo";
import { createFilesystemClinicAssetStorage } from "@/lib/clinic-assets/filesystem-clinic-asset-storage";
import {
  createMemoryClinicAssetStorage,
  memoryClinicAssetKeys,
  resetMemoryClinicAssetStorage,
} from "@/lib/clinic-assets/memory-clinic-asset-storage";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { getPrisma } from "@/lib/prisma";

const PREFIX = "asfn_";

function publicSlug(value: string): string {
  return value.replaceAll("_", "-").slice(0, 40);
}
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function db() {
  return getPrisma();
}

async function cleanup() {
  const preparations = await db().clinicAccountSplitPreparation.findMany({
    where: { sourceClinicId: { startsWith: PREFIX } },
    select: { destinationClinicId: true },
  });
  const destinationIds = preparations.flatMap((row) =>
    row.destinationClinicId ? [row.destinationClinicId] : []
  );
  await db().clinic.deleteMany({ where: { id: { startsWith: PREFIX } } });
  if (destinationIds.length > 0) {
    await db().clinic.deleteMany({ where: { id: { in: destinationIds } } });
  }
  await db().user.deleteMany({
    where: {
      OR: [{ id: { startsWith: PREFIX } }, { email: { startsWith: PREFIX } }],
    },
  });
}

async function seedBundle(key: string) {
  const clinicId = `${PREFIX}${key}`;
  const operatorId = `${PREFIX}op_${key}`;
  const adminId = `${PREFIX}admin_${key}`;
  const siteId = `${PREFIX}site_${key}`;
  const locationId = `${PREFIX}loc_${key}`;
  await db().user.create({
    data: {
      id: operatorId,
      email: `${operatorId}@example.test`,
      name: "Operator",
      platformRole: "OPERATOR",
    },
  });
  await db().user.create({
    data: {
      id: adminId,
      email: `${adminId}@example.test`,
      name: "Admin",
      platformRole: "NONE",
    },
  });
  await db().clinic.create({
    data: {
      id: clinicId,
      name: key,
      slug: publicSlug(`${PREFIX}acct-${key}`),
      profile: { create: { displayName: key } },
      memberships: { create: { userId: adminId, role: "ADMIN" } },
    },
  });
  await db().clinicSite.create({
    data: {
      id: siteId,
      clinicId,
      name: key,
      slug: publicSlug(`${PREFIX}site-${key}`),
      displayName: key,
      active: true,
      isPrimary: true,
    },
  });
  await db().clinicLocation.create({
    data: {
      id: locationId,
      clinicSiteId: siteId,
      clinicId,
      name: key,
      displayName: key,
      slug: null,
      servesSiteRoot: true,
      isPrimary: true,
      active: true,
    },
  });
  return { clinicId, operatorId, adminId, siteId, locationId };
}

async function seedGroup(key: string) {
  const clinicId = `${PREFIX}g_${key}`;
  const operatorId = `${PREFIX}gop_${key}`;
  const adminId = `${PREFIX}gadmin_${key}`;
  await db().user.createMany({
    data: [
      {
        id: operatorId,
        email: `${operatorId}@example.test`,
        platformRole: "OPERATOR",
      },
      {
        id: adminId,
        email: `${adminId}@example.test`,
        platformRole: "NONE",
      },
    ],
  });
  await db().clinic.create({
    data: {
      id: clinicId,
      name: `Group ${key}`,
      slug: publicSlug(`${PREFIX}g-${key}`),
      profile: { create: { displayName: `Group ${key}` } },
      memberships: { create: { userId: adminId, role: "ADMIN" } },
      entitlement: {
        create: {
          commercialPlan: "GROUP",
          billingInterval: "MONTHLY",
          billingStatus: BillingStatus.ACTIVE,
          entitlementStatus: EntitlementStatus.ACTIVE,
          siteAllowance: 3,
          locationAllowance: 5,
          purchasedAdditionalSiteQuantity: 1,
        },
      },
    },
  });
  const kept = await db().clinicSite.create({
    data: {
      id: `${PREFIX}kept_${key}`,
      clinicId,
      name: "Kept",
      slug: publicSlug(`${PREFIX}kept-${key}`),
      displayName: "Kept",
      active: true,
      isPrimary: true,
    },
  });
  const moving = await db().clinicSite.create({
    data: {
      id: `${PREFIX}move_${key}`,
      clinicId,
      name: "Move",
      slug: publicSlug(`${PREFIX}move-${key}`),
      displayName: "Move",
      active: true,
      isPrimary: false,
    },
  });
  for (const site of [kept, moving]) {
    await db().clinicLocation.create({
      data: {
        id: `${PREFIX}loc_${site.id}`,
        clinicSiteId: site.id,
        clinicId,
        name: site.name,
        displayName: site.name,
        slug: null,
        servesSiteRoot: true,
        isPrimary: true,
        active: true,
      },
    });
  }
  return { clinicId, operatorId, adminId, kept, moving };
}

async function openReady(key: string) {
  const account = await seedGroup(key);
  const preparation = await createAccountSplitPreparation({
    sourceClinicId: account.clinicId,
    keptClinicSiteId: account.kept.id,
    destinationPlan: "PRACTICE",
    destinationBillingInterval: "MONTHLY",
    operatorUserId: account.operatorId,
  });
  await saveAccountSplitSiteDecisions({
    preparationId: preparation.id,
    decisions: [{ clinicSiteId: account.moving.id, decision: "SPLIT" }],
  });
  await saveAccountSplitStaffSelections({
    preparationId: preparation.id,
    selections: [
      {
        userId: account.adminId,
        keepOnSource: false,
        grantOnDestination: true,
        destinationRole: "ADMIN",
      },
    ],
  });
  const shell = await createSplitDestinationAccount(preparation.id);
  await db().clinicEntitlement.create({
    data: {
      clinicId: shell.id,
      commercialPlan: "PRACTICE",
      billingInterval: "MONTHLY",
      billingStatus: BillingStatus.ACTIVE,
      entitlementStatus: EntitlementStatus.ACTIVE,
      siteAllowance: 1,
      locationAllowance: 1,
      cancelAtPeriodEnd: false,
    },
  });
  await revalidateAccountSplitPreparation(preparation.id);
  return { account, preparationId: preparation.id, destinationId: shell.id };
}

async function revisionOf(preparationId: string) {
  const row = await db().clinicAccountSplitPreparation.findUniqueOrThrow({
    where: { id: preparationId },
    select: { preparationRevision: true },
  });
  return row.preparationRevision;
}

describe("account structure foundation", () => {
  beforeEach(async () => {
    resetMemoryClinicAssetStorage();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await db().$disconnect();
  });

  it("defaults existing-shaped rows to the current operation", async () => {
    const account = await seedBundle("default");
    const row = await db().clinicAccountSplitPreparation.create({
      data: {
        sourceClinicId: account.clinicId,
        keptClinicSiteId: account.siteId,
        destinationPlan: "ESSENTIAL",
        destinationBillingInterval: "YEARLY",
        preparedByUserId: account.operatorId,
      },
    });
    expect(row.operationKind).toBe("SITE_TO_NEW_ACCOUNT");
    expect(row.preparationRevision).toBe(0);
    expect(row.sourceLocationId).toBeNull();
    expect(row.destinationSiteSlug).toBeNull();
  });

  it("rejects a forged location operation on a Group site split", async () => {
    const { account, preparationId } = await openReady("future");
    await db().clinicAccountSplitPreparation.update({
      where: { id: preparationId },
      data: {
        operationKind: "LOCATION_TO_NEW_ACCOUNT",
        status: "READY_TO_EXECUTE",
      },
    });
    await expect(
      saveAccountSplitSiteDecisions({
        preparationId,
        decisions: [{ clinicSiteId: account.moving.id, decision: "SPLIT" }],
      })
    ).rejects.toThrow(/not available/);
    await expect(
      executeClinicAccountSplit({
        preparationId,
        confirmation: `split ${account.moving.slug}`,
        operatorUserId: account.operatorId,
        reviewedRevision: await revisionOf(preparationId),
      })
    ).rejects.toThrow();
    await db().clinicAccountSplitPreparation.update({
      where: { id: preparationId },
      data: {
        operationKind: "SITE_TO_NEW_GROUP",
        status: "READY_TO_EXECUTE",
      },
    });
    await expect(
      executeClinicAccountSplit({
        preparationId,
        confirmation: `split ${account.moving.slug}`,
        operatorUserId: account.operatorId,
        reviewedRevision: await revisionOf(preparationId),
      })
    ).rejects.toThrow(/not available/);
    await db().clinicAccountSplitPreparation.update({
      where: { id: preparationId },
      data: {
        operationKind: "SITE_TO_EXISTING_GROUP",
        status: "READY_TO_EXECUTE",
      },
    });
    await expect(
      executeClinicAccountSplit({
        preparationId,
        confirmation: `split ${account.moving.slug}`,
        operatorUserId: account.operatorId,
        reviewedRevision: await revisionOf(preparationId),
      })
    ).rejects.toThrow();
    const actions = readFileSync(
      "app/(staff)/(operator)/operator/clinics/[clinicId]/split/actions.ts",
      "utf8"
    );
    expect(actions).not.toContain("LOCATION_TO_NEW_ACCOUNT");
    expect(actions).not.toContain("SITE_TO_EXISTING_GROUP");
    expect(actions).not.toContain("SITE_TO_NEW_GROUP");
    const site = await db().clinicSite.findUniqueOrThrow({
      where: { id: account.moving.id },
    });
    expect(site.clinicId).toBe(account.clinicId);
  });

  it("allows a completed destination to be used again and rejects a second open one", async () => {
    const sourceA = await seedBundle("dsta");
    const sourceB = await seedBundle("dstb");
    const sourceC = await seedBundle("dstc");
    const destination = await seedBundle("dstd");
    await db().clinicAccountSplitPreparation.create({
      data: {
        sourceClinicId: sourceA.clinicId,
        keptClinicSiteId: sourceA.siteId,
        destinationClinicId: destination.clinicId,
        destinationPlan: "PRACTICE",
        destinationBillingInterval: "MONTHLY",
        preparedByUserId: sourceA.operatorId,
        status: "COMPLETED",
      },
    });
    await db().clinicAccountSplitPreparation.create({
      data: {
        sourceClinicId: sourceB.clinicId,
        keptClinicSiteId: sourceB.siteId,
        destinationClinicId: destination.clinicId,
        destinationPlan: "PRACTICE",
        destinationBillingInterval: "MONTHLY",
        preparedByUserId: sourceB.operatorId,
        status: "COMPLETED",
      },
    });
    await db().clinicAccountSplitPreparation.create({
      data: {
        sourceClinicId: sourceA.clinicId,
        keptClinicSiteId: sourceA.siteId,
        destinationClinicId: destination.clinicId,
        destinationPlan: "PRACTICE",
        destinationBillingInterval: "MONTHLY",
        preparedByUserId: sourceA.operatorId,
        status: "CANCELLED",
      },
    });
    await db().clinicAccountSplitPreparation.create({
      data: {
        sourceClinicId: sourceC.clinicId,
        keptClinicSiteId: sourceC.siteId,
        destinationClinicId: destination.clinicId,
        destinationPlan: "PRACTICE",
        destinationBillingInterval: "MONTHLY",
        preparedByUserId: sourceC.operatorId,
        status: "DRAFT",
      },
    });
    await expect(
      db().clinicAccountSplitPreparation.create({
        data: {
          sourceClinicId: sourceB.clinicId,
          keptClinicSiteId: sourceB.siteId,
          destinationClinicId: destination.clinicId,
          destinationPlan: "PRACTICE",
          destinationBillingInterval: "MONTHLY",
          preparedByUserId: sourceB.operatorId,
          status: "BILLING_READY",
        },
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("reserves one open preparation per source location and allows nulls", async () => {
    const sourceA = await seedBundle("loca");
    const sourceB = await seedBundle("locb");
    const sourceC = await seedBundle("locc");
    await db().clinicAccountSplitPreparation.create({
      data: {
        sourceClinicId: sourceA.clinicId,
        keptClinicSiteId: sourceA.siteId,
        sourceLocationId: sourceA.locationId,
        destinationPlan: "PRACTICE",
        destinationBillingInterval: "MONTHLY",
        preparedByUserId: sourceA.operatorId,
      },
    });
    await expect(
      db().clinicAccountSplitPreparation.create({
        data: {
          sourceClinicId: sourceB.clinicId,
          keptClinicSiteId: sourceB.siteId,
          sourceLocationId: sourceA.locationId,
          destinationPlan: "PRACTICE",
          destinationBillingInterval: "MONTHLY",
          preparedByUserId: sourceB.operatorId,
        },
      })
    ).rejects.toMatchObject({ code: "P2002" });
    await db().clinicAccountSplitPreparation.create({
      data: {
        sourceClinicId: sourceB.clinicId,
        keptClinicSiteId: sourceB.siteId,
        destinationPlan: "ESSENTIAL",
        destinationBillingInterval: "MONTHLY",
        preparedByUserId: sourceB.operatorId,
      },
    });
    await db().clinicAccountSplitPreparation.create({
      data: {
        sourceClinicId: sourceC.clinicId,
        keptClinicSiteId: sourceC.siteId,
        destinationPlan: "ESSENTIAL",
        destinationBillingInterval: "MONTHLY",
        preparedByUserId: sourceC.operatorId,
      },
    });
  });

  it("still rejects Group as a destination plan", async () => {
    const { preparationId } = await openReady("groupdest");
    await expect(
      updateAccountSplitDestinationTarget({
        preparationId,
        destinationPlan: "GROUP",
        destinationBillingInterval: "MONTHLY",
      })
    ).rejects.toThrow(/Essential or Practice/);
  });

  it("copies each owned branding field once and leaves static and null values", async () => {
    const { account, preparationId, destinationId } = await openReady("brand");
    const shared = `clinics/${account.clinicId}/branding/shared.png`;
    const dark = `clinics/${account.clinicId}/branding/dark.png`;
    await db().clinicSite.update({
      where: { id: account.moving.id },
      data: {
        logoUrl: shared,
        darkLogoUrl: dark,
        faviconUrl: shared,
      },
    });
    const storage = createMemoryClinicAssetStorage();
    await storage.uploadLogo({
      clinicId: account.clinicId,
      storageKey: shared,
      bytes: PNG,
      mimeType: "image/png",
    });
    await storage.uploadLogo({
      clinicId: account.clinicId,
      storageKey: dark,
      bytes: PNG,
      mimeType: "image/png",
    });
    const deleted: string[] = [];
    const wrapped = {
      ...storage,
      async deleteLogo(input: { clinicId: string; storageKey: string }) {
        deleted.push(input.storageKey);
        await storage.deleteLogo(input);
      },
    };
    const first = await prepareAccountSplitBranding({
      preparationId,
      operatorUserId: account.operatorId,
      storage: wrapped,
    });
    expect(first.copied).toBe(2);
    const second = await prepareAccountSplitBranding({
      preparationId,
      operatorUserId: account.operatorId,
      storage: wrapped,
    });
    expect(second.copied).toBe(2);
    const maps = await db().clinicAccountSplitBrandingAsset.findMany({
      where: { preparationId },
    });
    expect(maps).toHaveLength(2);
    const logoKey = splitDestinationBrandingKey({
      destinationClinicId: destinationId,
      preparationId,
      sourceStorageKey: shared,
    });
    expect(logoKey).toBeTruthy();
    expect(isOwnedClinicBrandingKey(destinationId, logoKey)).toBe(true);
    expect(maps.map((row) => row.destinationStorageKey).sort()).toEqual(
      [
        logoKey,
        splitDestinationBrandingKey({
          destinationClinicId: destinationId,
          preparationId,
          sourceStorageKey: dark,
        }),
      ].sort()
    );
    expect(deleted).toEqual([]);
    expect(memoryClinicAssetKeys()).toEqual(
      expect.arrayContaining([shared, dark, logoKey])
    );
    await revalidateAccountSplitPreparation(preparationId);
    const preview = await previewAccountSplit(preparationId);
    expect(preview?.status).toBe("READY_TO_EXECUTE");
    const before = memoryClinicAssetKeys().slice();
    await executeClinicAccountSplit({
      preparationId,
      confirmation: `split ${account.moving.slug}`,
      operatorUserId: account.operatorId,
      reviewedRevision: await revisionOf(preparationId),
    });
    expect(memoryClinicAssetKeys().sort()).toEqual(before.sort());
    const moved = await db().clinicSite.findUniqueOrThrow({
      where: { id: account.moving.id },
    });
    expect(moved.logoUrl).toBe(logoKey);
    expect(moved.faviconUrl).toBe(logoKey);
    expect(moved.darkLogoUrl).not.toBe(dark);
    expect(isOwnedClinicBrandingKey(destinationId, moved.darkLogoUrl)).toBe(
      true
    );
    expect(isOwnedClinicBrandingKey(account.clinicId, moved.logoUrl)).toBe(
      false
    );
    const profile = await db().clinicProfile.findUniqueOrThrow({
      where: { clinicId: destinationId },
    });
    expect(profile.logoUrl).toBe(logoKey);
    expect(profile.darkLogoUrl).toBe(moved.darkLogoUrl);
    const sourceEntitlement = await db().clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: account.clinicId },
    });
    expect(sourceEntitlement.purchasedAdditionalSiteQuantity).toBe(1);
    expect(sourceEntitlement.siteAllowance).toBe(3);
    expect(sourceEntitlement.commercialPlan).toBe("GROUP");
  });

  it("keeps a static path and skips null branding fields", async () => {
    const { account, preparationId } = await openReady("static");
    await db().clinicSite.update({
      where: { id: account.moving.id },
      data: { logoUrl: "/brand/logo.png", darkLogoUrl: null, faviconUrl: null },
    });
    const storage = createMemoryClinicAssetStorage();
    const result = await prepareAccountSplitBranding({
      preparationId,
      operatorUserId: account.operatorId,
      storage,
    });
    expect(result.copied).toBe(0);
    await revalidateAccountSplitPreparation(preparationId);
    const preview = await previewAccountSplit(preparationId);
    expect(preview?.status).toBe("READY_TO_EXECUTE");
    await executeClinicAccountSplit({
      preparationId,
      confirmation: `split ${account.moving.slug}`,
      operatorUserId: account.operatorId,
      reviewedRevision: await revisionOf(preparationId),
    });
    const moved = await db().clinicSite.findUniqueOrThrow({
      where: { id: account.moving.id },
    });
    expect(moved.logoUrl).toBe("/brand/logo.png");
    expect(moved.darkLogoUrl).toBeNull();
    expect(moved.faviconUrl).toBeNull();
  });

  it("rejects a foreign source key and a destination key outside the destination prefix", async () => {
    const storage = createMemoryClinicAssetStorage();
    const calls: string[] = [];
    const probe = {
      ...storage,
      async readLogo(input: { clinicId: string; storageKey: string }) {
        calls.push(`read:${input.storageKey}`);
        return storage.readLogo(input);
      },
      async uploadLogo(input: {
        clinicId: string;
        storageKey: string;
        bytes: Uint8Array;
        mimeType: string;
      }) {
        calls.push(`write:${input.storageKey}`);
        return storage.uploadLogo(input);
      },
      async deleteLogo() {
        throw new Error("delete should not run");
      },
    };
    await expect(
      copyOwnedBrandingObject({
        storage: probe,
        sourceClinicId: "source",
        destinationClinicId: "dest",
        sourceStorageKey: "clinics/other/branding/logo.png",
        destinationStorageKey:
          "clinics/dest/branding/split-prep-abcdabcdabcdabcd.png",
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);
    await expect(
      copyOwnedBrandingObject({
        storage: probe,
        sourceClinicId: "source",
        destinationClinicId: "dest",
        sourceStorageKey: "clinics/source/branding/logo.png",
        destinationStorageKey:
          "clinics/other/branding/split-prep-abcdabcdabcdabcd.png",
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);
    expect(calls).toEqual([]);
    await storage.uploadLogo({
      clinicId: "source",
      storageKey: "clinics/source/branding/logo.png",
      bytes: PNG,
      mimeType: "image/png",
    });
    await copyOwnedBrandingObject({
      storage: probe,
      sourceClinicId: "source",
      destinationClinicId: "dest",
      sourceStorageKey: "clinics/source/branding/logo.png",
      destinationStorageKey:
        "clinics/dest/branding/split-prep-abcdabcdabcdabcd.png",
    });
    expect(
      memoryClinicAssetKeys().includes("clinics/source/branding/logo.png")
    ).toBe(true);
    expect(
      memoryClinicAssetKeys().includes(
        "clinics/dest/branding/split-prep-abcdabcdabcdabcd.png"
      )
    ).toBe(true);
  });

  it("enforces destination ownership before the filesystem adapter writes", async () => {
    const root = await mkdtemp(join(tmpdir(), "split-branding-"));
    try {
      const storage = createFilesystemClinicAssetStorage({ root });
      await storage.uploadLogo({
        clinicId: "source",
        storageKey: "clinics/source/branding/logo.png",
        bytes: PNG,
        mimeType: "image/png",
      });
      await expect(
        copyOwnedBrandingObject({
          storage,
          sourceClinicId: "source",
          destinationClinicId: "dest",
          sourceStorageKey: "clinics/source/branding/logo.png",
          destinationStorageKey: "clinics/source/branding/logo.png",
        })
      ).rejects.toBeInstanceOf(ClinicPortalError);
      const r2 = readFileSync(
        "lib/clinic-assets/r2-clinic-asset-storage.ts",
        "utf8"
      );
      expect(r2).not.toContain("isOwnedClinicBrandingKey");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("blocks execution when branding is missing and when the source key changes", async () => {
    const { account, preparationId } = await openReady("stalebytes");
    const original = `clinics/${account.clinicId}/branding/logo.png`;
    await db().clinicSite.update({
      where: { id: account.moving.id },
      data: { logoUrl: original },
    });
    await revalidateAccountSplitPreparation(preparationId);
    const blocked = await previewAccountSplit(preparationId);
    expect(blocked?.blockers.map((blocker) => blocker.code)).toContain(
      "branding_assets_not_ready"
    );
    expect(blocked?.status).not.toBe("READY_TO_EXECUTE");
    await expect(
      executeClinicAccountSplit({
        preparationId,
        confirmation: `split ${account.moving.slug}`,
        operatorUserId: account.operatorId,
        reviewedRevision: await revisionOf(preparationId),
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);
    const storage = createMemoryClinicAssetStorage();
    await storage.uploadLogo({
      clinicId: account.clinicId,
      storageKey: original,
      bytes: PNG,
      mimeType: "image/png",
    });
    await prepareAccountSplitBranding({
      preparationId,
      operatorUserId: account.operatorId,
      storage,
    });
    const changed = `clinics/${account.clinicId}/branding/changed.png`;
    await db().clinicSite.update({
      where: { id: account.moving.id },
      data: { logoUrl: changed },
    });
    await revalidateAccountSplitPreparation(preparationId);
    const regressed = await previewAccountSplit(preparationId);
    expect(regressed?.status).not.toBe("READY_TO_EXECUTE");
    expect(regressed?.blockers.map((blocker) => blocker.code)).toContain(
      "branding_assets_not_ready"
    );
    const site = await db().clinicSite.findUniqueOrThrow({
      where: { id: account.moving.id },
    });
    expect(site.clinicId).toBe(account.clinicId);
    expect(site.logoUrl).toBe(changed);
  });

  it("leaves a prepared destination object in place when cutover rolls back", async () => {
    const { account, preparationId, destinationId } =
      await openReady("rollback");
    const sourceKey = `clinics/${account.clinicId}/branding/logo.png`;
    await db().clinicSite.update({
      where: { id: account.moving.id },
      data: { logoUrl: sourceKey },
    });
    const storage = createMemoryClinicAssetStorage();
    await storage.uploadLogo({
      clinicId: account.clinicId,
      storageKey: sourceKey,
      bytes: PNG,
      mimeType: "image/png",
    });
    await prepareAccountSplitBranding({
      preparationId,
      operatorUserId: account.operatorId,
      storage,
    });
    await revalidateAccountSplitPreparation(preparationId);
    const destinationKey = splitDestinationBrandingKey({
      destinationClinicId: destinationId,
      preparationId,
      sourceStorageKey: sourceKey,
    });
    await expect(
      executeClinicAccountSplit({
        preparationId,
        confirmation: `split ${account.moving.slug}`,
        operatorUserId: account.operatorId,
        reviewedRevision: await revisionOf(preparationId),
        hooks: { interruptAfter: "after_guide_copies" },
      })
    ).rejects.toMatchObject({ name: "AccountSplitExecutionInterrupted" });
    const site = await db().clinicSite.findUniqueOrThrow({
      where: { id: account.moving.id },
    });
    expect(site.clinicId).toBe(account.clinicId);
    expect(site.logoUrl).toBe(sourceKey);
    expect(memoryClinicAssetKeys()).toEqual(
      expect.arrayContaining([sourceKey, destinationKey])
    );
    const status = await db().clinicAccountSplitPreparation.findUniqueOrThrow({
      where: { id: preparationId },
    });
    expect(status.status).toBe("READY_TO_EXECUTE");
  });

  it("does not copy again when a completed split is retried", async () => {
    const { account, preparationId } = await openReady("retry");
    const sourceKey = `clinics/${account.clinicId}/branding/logo.png`;
    await db().clinicSite.update({
      where: { id: account.moving.id },
      data: { logoUrl: sourceKey },
    });
    const storage = createMemoryClinicAssetStorage();
    await storage.uploadLogo({
      clinicId: account.clinicId,
      storageKey: sourceKey,
      bytes: PNG,
      mimeType: "image/png",
    });
    await prepareAccountSplitBranding({
      preparationId,
      operatorUserId: account.operatorId,
      storage,
    });
    await revalidateAccountSplitPreparation(preparationId);
    const reviewedRevision = await revisionOf(preparationId);
    const first = await executeClinicAccountSplit({
      preparationId,
      confirmation: `split ${account.moving.slug}`,
      operatorUserId: account.operatorId,
      reviewedRevision,
    });
    const keys = memoryClinicAssetKeys().slice().sort();
    const second = await executeClinicAccountSplit({
      preparationId,
      confirmation: `split ${account.moving.slug}`,
      operatorUserId: account.operatorId,
      reviewedRevision: 0,
    });
    expect(first.alreadyCompleted).toBe(false);
    expect(second.alreadyCompleted).toBe(true);
    expect(memoryClinicAssetKeys().sort()).toEqual(keys);
    const events = await db().clinicAccountSplitEvent.findMany({
      where: { preparationId, kind: "COMPLETED_RETRY" },
    });
    expect(events).toHaveLength(1);
  });

  it("warns on past due and cancellation and blocks real commercial conflicts", async () => {
    const pastDue = await openReady("pastdue");
    await db().clinicEntitlement.update({
      where: { clinicId: pastDue.account.clinicId },
      data: { billingStatus: BillingStatus.PAST_DUE },
    });
    await revalidateAccountSplitPreparation(pastDue.preparationId);
    const pastDuePreview = await previewAccountSplit(pastDue.preparationId);
    expect(pastDuePreview?.status).toBe("READY_TO_EXECUTE");
    expect(pastDuePreview?.warnings.map((warning) => warning.code)).toContain(
      "source_past_due"
    );

    const cancel = await openReady("cancel");
    await db().clinicEntitlement.update({
      where: { clinicId: cancel.account.clinicId },
      data: { cancelAtPeriodEnd: true },
    });
    await revalidateAccountSplitPreparation(cancel.preparationId);
    const cancelPreview = await previewAccountSplit(cancel.preparationId);
    expect(cancelPreview?.status).toBe("READY_TO_EXECUTE");
    expect(cancelPreview?.warnings.map((warning) => warning.code)).toContain(
      "source_cancel_at_period_end"
    );

    const offered = await openReady("offered");
    await db().clinicEntitlement.update({
      where: { clinicId: offered.account.clinicId },
      data: { offeredAdditionalSiteQuantity: 4 },
    });
    await revalidateAccountSplitPreparation(offered.preparationId);
    const offeredPreview = await previewAccountSplit(offered.preparationId);
    expect(offeredPreview?.status).toBe("READY_TO_EXECUTE");
    expect(
      offeredPreview?.blockers.some((blocker) =>
        blocker.code.startsWith("source_")
      )
    ).toBe(false);

    const cases: Array<{
      key: string;
      code: string;
      apply: (clinicId: string) => Promise<void>;
    }> = [
      {
        key: "schedule",
        code: "source_subscription_schedule",
        apply: async (clinicId) => {
          await db().clinicBillingProfile.create({
            data: {
              clinicId,
              stripeSubscriptionScheduleId: `sched_${clinicId}`,
            },
          });
        },
      },
      {
        key: "plan",
        code: "source_scheduled_plan",
        apply: async (clinicId) => {
          await db().clinicEntitlement.update({
            where: { clinicId },
            data: { scheduledCommercialPlan: "PRACTICE" },
          });
        },
      },
      {
        key: "capacity",
        code: "source_scheduled_capacity",
        apply: async (clinicId) => {
          await db().clinicEntitlement.update({
            where: { clinicId },
            data: { scheduledAdditionalSiteQuantity: 1 },
          });
        },
      },
      {
        key: "when",
        code: "source_scheduled_capacity",
        apply: async (clinicId) => {
          await db().clinicEntitlement.update({
            where: { clinicId },
            data: { scheduledCapacityEffectiveAt: new Date("2026-10-01") },
          });
        },
      },
      {
        key: "down",
        code: "source_downgrade_preparation",
        apply: async (clinicId) => {
          await db().clinicDowngradePreparation.create({
            data: {
              clinicId,
              targetPlan: "ESSENTIAL",
              status: "AWAITING_SELECTION",
            },
          });
        },
      },
      {
        key: "mismatch",
        code: "source_plan_mismatch",
        apply: async (clinicId) => {
          await db().clinicEntitlement.update({
            where: { clinicId },
            data: { commercialPlan: "PRACTICE" },
          });
        },
      },
    ];
    for (const entry of cases) {
      const ready = await openReady(entry.key);
      await entry.apply(ready.account.clinicId);
      await revalidateAccountSplitPreparation(ready.preparationId);
      const preview = await previewAccountSplit(ready.preparationId);
      expect(preview?.status).not.toBe("READY_TO_EXECUTE");
      expect(preview?.blockers.map((blocker) => blocker.code)).toContain(
        entry.code
      );
    }
  });

  it("increments the review revision and refuses a stale one without skipping live checks", async () => {
    const { account, preparationId } = await openReady("revision");
    const before = await revisionOf(preparationId);
    await saveAccountSplitStaffSelections({
      preparationId,
      selections: [
        {
          userId: account.adminId,
          keepOnSource: false,
          grantOnDestination: true,
          destinationRole: "ADMIN",
        },
      ],
    });
    expect(await revisionOf(preparationId)).toBe(before);
    await saveAccountSplitStaffSelections({
      preparationId,
      selections: [
        {
          userId: account.adminId,
          keepOnSource: true,
          grantOnDestination: false,
          destinationRole: "STAFF",
        },
      ],
    });
    const next = await revisionOf(preparationId);
    expect(next).toBe(before + 1);
    await saveAccountSplitStaffSelections({
      preparationId,
      selections: [
        {
          userId: account.adminId,
          keepOnSource: false,
          grantOnDestination: true,
          destinationRole: "ADMIN",
        },
      ],
    });
    await revalidateAccountSplitPreparation(preparationId);
    const current = await revisionOf(preparationId);
    await expect(
      executeClinicAccountSplit({
        preparationId,
        confirmation: `split ${account.moving.slug}`,
        operatorUserId: account.operatorId,
        reviewedRevision: before,
      })
    ).rejects.toThrow(/Review it again/);
    const staleEvents = await db().clinicAccountSplitEvent.findMany({
      where: { preparationId, kind: "STALE_REVISION_REFUSED" },
    });
    expect(staleEvents.length).toBeGreaterThan(0);
    expect(
      (
        await db().clinicSite.findUniqueOrThrow({
          where: { id: account.moving.id },
        })
      ).clinicId
    ).toBe(account.clinicId);
    await db().clinicEntitlement.update({
      where: { clinicId: account.clinicId },
      data: { scheduledCommercialPlan: "ESSENTIAL" },
    });
    await expect(
      executeClinicAccountSplit({
        preparationId,
        confirmation: `split ${account.moving.slug}`,
        operatorUserId: account.operatorId,
        reviewedRevision: current,
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);
    const status = await db().clinicAccountSplitPreparation.findUniqueOrThrow({
      where: { id: preparationId },
    });
    expect(status.status).not.toBe("COMPLETED");
    expect(status.preparationRevision).toBe(current);
  });

  it("reports cross-owned completed branding without writing", async () => {
    const source = await seedBundle("audit-src");
    const destination = await seedBundle("audit-dst");
    const site = await db().clinicSite.update({
      where: { id: destination.siteId },
      data: {
        logoUrl: `clinics/${source.clinicId}/branding/logo.png`,
        darkLogoUrl: `clinics/${destination.clinicId}/branding/dark.png`,
        faviconUrl: null,
      },
    });
    const preparation = await db().clinicAccountSplitPreparation.create({
      data: {
        sourceClinicId: source.clinicId,
        destinationClinicId: destination.clinicId,
        keptClinicSiteId: source.siteId,
        destinationPlan: "PRACTICE",
        destinationBillingInterval: "MONTHLY",
        preparedByUserId: source.operatorId,
        status: "COMPLETED",
        siteDecisions: {
          create: { clinicSiteId: destination.siteId, decision: "SPLIT" },
        },
      },
    });
    const before = site.updatedAt;
    const affected = await listCrossOwnedCompletedSplits(db());
    const finding = affected.find(
      (row) => row.preparationId === preparation.id
    );
    expect(finding).toMatchObject({
      preparationId: preparation.id,
      sourceClinicId: source.clinicId,
      destinationClinicId: destination.clinicId,
      siteId: destination.siteId,
      fields: ["logoUrl"],
    });
    const reread = await db().clinicSite.findUniqueOrThrow({
      where: { id: destination.siteId },
    });
    expect(reread.updatedAt).toEqual(before);
    expect(reread.logoUrl).toBe(site.logoUrl);

    await db().clinicSite.update({
      where: { id: destination.siteId },
      data: {
        logoUrl: `clinics/${destination.clinicId}/branding/logo.png`,
        darkLogoUrl: `clinics/${source.clinicId}/branding/dark.png`,
        faviconUrl: `clinics/${source.clinicId}/branding/favicon.png`,
      },
    });
    const dark = await listCrossOwnedCompletedSplits(db());
    expect(
      dark.find((row) => row.preparationId === preparation.id)?.fields
    ).toEqual(["darkLogoUrl", "faviconUrl"]);

    await db().clinicSite.update({
      where: { id: destination.siteId },
      data: {
        logoUrl: `clinics/${destination.clinicId}/branding/logo.png`,
        darkLogoUrl: null,
        faviconUrl: "/brand/icon.png",
      },
    });
    const clean = await listCrossOwnedCompletedSplits(db());
    expect(
      clean.find((row) => row.preparationId === preparation.id)
    ).toBeUndefined();
  });
});
