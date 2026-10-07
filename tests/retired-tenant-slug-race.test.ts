import "dotenv/config";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

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

import { PlatformRole, type PrismaClient } from "@prisma/client";

import { lockAccountSplitShellSlug } from "@/lib/account-split/locks";
import { writeCompatibilitySlugs } from "@/lib/account-split/execute";
import { publishLocationDestinationSite } from "@/lib/account-split/location-execute";
import { allocateSplitShellSlug } from "@/lib/account-split/shell-slug";
import { hashPassword } from "@/lib/auth/password";
import { createMemoryClinicAssetStorage } from "@/lib/clinic-assets/memory-clinic-asset-storage";
import type { ClinicAssetStorage } from "@/lib/clinic-assets/clinic-asset-storage";
import { archiveClinic } from "@/lib/clinics/clinic-archive";
import { deactivateClinic } from "@/lib/clinics/clinic-deactivation";
import {
  permanentlyDeleteClinic,
  permanentDeletionConfirmationName,
} from "@/lib/clinics/permanent-clinic-deletion";
import { RETIRED_TENANT_SLUG_MESSAGE } from "@/lib/clinics/retired-tenant-slug";
import { createClinicSiteWithRootLocation } from "@/lib/clinics/site-location-mutations";
import type { CreateSiteInput } from "@/lib/clinics/site-location-schemas";
import { isLocalDevelopmentDatabase } from "@/lib/dev/database-target";
import { createOperatorClinic } from "@/lib/operator/create-operator-clinic";
import { discardAssistedClinic } from "@/lib/operator/discard-assisted-clinic";
import { getPrisma } from "@/lib/prisma";

const PREFIX = "rslug-";
const OPERATOR_ID = "rslug_operator";
const ADDRESS_CHANGED =
  "This clinic's address changed during deletion. It was not deleted.";
const SHELL_SLUGS = [
  "xspabc12345",
  "xsp2222bbbb",
  "xsp3333cccc",
  "xsp3333dddd",
  "xsp4444eeee",
] as const;

const local = isLocalDevelopmentDatabase(process.env.DATABASE_URL);
const describeDb = local ? describe : describe.skip;

function db(): PrismaClient {
  return getPrisma();
}

function memoryStorage(): ClinicAssetStorage {
  return createMemoryClinicAssetStorage();
}

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function siteInput(siteSlug: string): CreateSiteInput {
  return {
    siteName: "Extra",
    siteSlug,
    locationName: "Extra",
    locationDisplayName: null,
    phone: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    region: null,
    postalCode: null,
    country: null,
    contactUrl: null,
    contactEmail: null,
    bookingUrl: null,
    emergencyInstructions: null,
    serviceCategories: [],
  };
}

function destinationTheme() {
  return {
    primaryColor: null,
    accentColor: null,
    darkPrimaryColor: null,
    darkAccentColor: null,
    useCustomDarkBranding: false,
    neutralColor: null,
    radiusPreset: "MEDIUM" as const,
    typeface: null,
    instructionTerminology: "AFTERCARE" as const,
    themeMode: "SYSTEM" as const,
    allowPatientThemeToggle: false,
    showCareGuideAttribution: true,
  };
}

async function cleanup(): Promise<void> {
  const prisma = db();
  const clinics = await prisma.clinic.findMany({
    where: {
      OR: [
        { slug: { startsWith: PREFIX } },
        { slug: { in: [...SHELL_SLUGS] } },
      ],
    },
    select: { id: true },
  });
  const ids = clinics.map((clinic) => clinic.id);
  if (ids.length > 0) {
    await prisma.retiredTenantSlug.deleteMany({
      where: {
        OR: [
          { formerClinicId: { in: ids } },
          { slug: { startsWith: PREFIX } },
          { slug: { in: [...SHELL_SLUGS] } },
        ],
      },
    });
    await prisma.clinic.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.retiredTenantSlug.deleteMany({
    where: {
      OR: [
        { slug: { startsWith: PREFIX } },
        { slug: { in: [...SHELL_SLUGS] } },
      ],
    },
  });
}

async function ensureOperator(): Promise<void> {
  await db().user.upsert({
    where: { id: OPERATOR_ID },
    update: { platformRole: PlatformRole.OPERATOR },
    create: {
      id: OPERATOR_ID,
      email: `${PREFIX}operator@example.com`,
      name: "Rslug Operator",
      platformRole: PlatformRole.OPERATOR,
      passwordHash: hashPassword("rslug-operator-password"),
    },
  });
}

async function fresh(slug: string, name: string) {
  return createOperatorClinic({
    name,
    slug,
    serviceCategories: ["DENTAL"],
  });
}

async function deactivate(clinicId: string) {
  const result = await deactivateClinic({
    clinicId,
    operatorUserId: OPERATOR_ID,
  });
  expect(result).toEqual({ ok: true });
  const clinic = await db().clinic.findUniqueOrThrow({
    where: { id: clinicId },
    select: {
      name: true,
      sites: { select: { displayName: true, isPrimary: true, active: true } },
    },
  });
  expect(
    await archiveClinic({
      clinicId,
      operatorUserId: OPERATOR_ID,
      confirmation: permanentDeletionConfirmationName(clinic),
    })
  ).toEqual({ ok: true });
}

async function addExtraSite(clinicId: string, slug: string) {
  await db().clinicSite.create({
    data: {
      clinicId,
      name: "Extra",
      slug,
      displayName: "Extra",
      active: true,
      isPrimary: false,
    },
  });
}

async function tenantSlugWaiters(slug: string): Promise<number> {
  const key = `tenant-slug:${slug}`;
  const [hashRow] = await db().$queryRaw<Array<{ hash: string }>>`
    SELECT hashtext(${key})::text AS hash
  `;
  const hash = BigInt(hashRow?.hash ?? "0");
  const shift = BigInt(32);
  const mask = BigInt("4294967295");
  const classid = ((hash >> shift) & mask).toString();
  const objid = (hash & mask).toString();
  const locks = await db().$queryRaw<
    Array<{ classid: string; objid: string; granted: boolean }>
  >`
    SELECT classid::text AS classid, objid::text AS objid, granted
    FROM pg_locks
    WHERE locktype = 'advisory' AND objsubid = 1 AND granted = false
  `;
  return locks.filter(
    (lock) => lock.classid === classid && lock.objid === objid
  ).length;
}

async function waitForWaiters(slug: string, minimum: number): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if ((await tenantSlugWaiters(slug)) >= minimum) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(
    `expected at least ${minimum} waiter(s) on tenant-slug:${slug}`
  );
}

async function holdTombstone(clinicId: string, name: string) {
  const archived = await archiveClinic({
    clinicId,
    operatorUserId: OPERATOR_ID,
    confirmation: name,
  });
  expect(archived).toEqual({ ok: true });
  const release = deferred();
  const holding = deferred();
  const done = permanentlyDeleteClinic({
    clinicId,
    operatorUserId: OPERATOR_ID,
    confirmation: name,
    storage: memoryStorage(),
    afterSlugLocks: async () => {
      holding.resolve();
      await release.promise;
    },
  });
  const timed = Promise.race([
    holding.promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("deletion did not reach the slug locks")),
        15_000
      )
    ),
  ]);
  await timed;
  return { release: () => release.resolve(), done };
}

async function expectSlugOnlyRetired(slug: string, _formerClinicId: string) {
  const retired = await db().retiredTenantSlug.findUnique({
    where: { slug },
    select: { formerClinicId: true },
  });
  expect(retired).not.toBeNull();
  expect(retired?.formerClinicId).toBeNull();
  expect(await db().clinic.findUnique({ where: { slug } })).toBeNull();
  expect(await db().clinicSite.findUnique({ where: { slug } })).toBeNull();
}

describeDb("retired tenant slug issuance races", () => {
  beforeAll(async () => {
    await ensureOperator();
  });

  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await db().user.deleteMany({ where: { id: OPERATOR_ID } });
    await db().$disconnect();
  });

  it("refuses a shell slug tombstoned while allocation waits", async () => {
    const candidate = "xspabc12345";
    const clinic = await fresh(`${PREFIX}shell-src`, "Rslug Shell Source");
    await addExtraSite(clinic.id, candidate);
    await deactivate(clinic.id);
    const held = await holdTombstone(clinic.id, "Rslug Shell Source");
    const allocation = db().$transaction(
      async (tx) => {
        await lockAccountSplitShellSlug(tx);
        const slug = await allocateSplitShellSlug(tx, [candidate]);
        await tx.clinic.create({
          data: {
            name: "Leaked shell",
            slug,
            assistedOnboarding: true,
          },
        });
        return slug;
      },
      { maxWait: 10_000, timeout: 20_000 }
    );

    try {
      await waitForWaiters(candidate, 1);
      held.release();
      await expect(allocation).rejects.toThrow(RETIRED_TENANT_SLUG_MESSAGE);
      await expect(held.done).resolves.toMatchObject({ ok: true });
      await expectSlugOnlyRetired(candidate, clinic.id);
      expect(
        await db().clinic.findFirst({ where: { name: "Leaked shell" } })
      ).toBeNull();
    } finally {
      held.release();
    }
  });

  it("refuses a compatibility slug tombstoned while the write waits", async () => {
    const retiredSlug = `${PREFIX}compat`;
    const source = await fresh(`${PREFIX}csrc`, "Rslug Compat Source");
    const destination = await fresh(`${PREFIX}cdst`, "Rslug Compat Dest");
    const retiring = await fresh(`${PREFIX}cold`, "Rslug Compat Old");
    await addExtraSite(retiring.id, retiredSlug);
    await deactivate(retiring.id);
    const held = await holdTombstone(retiring.id, "Rslug Compat Old");
    const write = db().$transaction(
      (tx) =>
        writeCompatibilitySlugs(tx, {
          sourceClinicId: source.id,
          destinationClinicId: destination.id,
          sourceTarget: `${PREFIX}csrc`,
          destinationTarget: retiredSlug,
        }),
      { maxWait: 10_000, timeout: 20_000 }
    );

    try {
      await waitForWaiters(retiredSlug, 1);
      held.release();
      await expect(write).rejects.toThrow(RETIRED_TENANT_SLUG_MESSAGE);
      await expect(held.done).resolves.toMatchObject({ ok: true });
      await expectSlugOnlyRetired(retiredSlug, retiring.id);
      expect(
        await db().clinic.findUniqueOrThrow({
          where: { id: destination.id },
          select: { slug: true },
        })
      ).toMatchObject({ slug: `${PREFIX}cdst` });
    } finally {
      held.release();
    }
  });

  it("refuses a destination site slug tombstoned while publication waits", async () => {
    const retiredSlug = `${PREFIX}moved`;
    const destination = await fresh(`${PREFIX}ldst`, "Rslug Location Dest");
    const retiring = await fresh(`${PREFIX}lold`, "Rslug Location Old");
    await addExtraSite(retiring.id, retiredSlug);
    await deactivate(retiring.id);
    const held = await holdTombstone(retiring.id, "Rslug Location Old");
    const publish = db().$transaction(
      (tx) =>
        publishLocationDestinationSite(tx, {
          destinationClinicId: destination.id,
          slug: retiredSlug,
          name: "Moved",
          displayName: "Moved",
          logoUrl: null,
          darkLogoUrl: null,
          faviconUrl: null,
          theme: destinationTheme(),
        }),
      { maxWait: 10_000, timeout: 20_000 }
    );

    try {
      await waitForWaiters(retiredSlug, 1);
      held.release();
      await expect(publish).rejects.toThrow(RETIRED_TENANT_SLUG_MESSAGE);
      await expect(held.done).resolves.toMatchObject({ ok: true });
      await expectSlugOnlyRetired(retiredSlug, retiring.id);
    } finally {
      held.release();
    }
  });

  it("refuses create clinic and add site while the tombstone lock is held", async () => {
    const retiredSlug = `${PREFIX}reuse`;
    const retiring = await fresh(`${PREFIX}down`, "Rslug Down");
    const active = await fresh(`${PREFIX}live`, "Rslug Live");
    await addExtraSite(retiring.id, retiredSlug);
    await deactivate(retiring.id);
    const held = await holdTombstone(retiring.id, "Rslug Down");
    const created = createOperatorClinic({
      name: "Rslug Reuse",
      slug: retiredSlug,
      serviceCategories: ["DENTAL"],
    });
    const added = createClinicSiteWithRootLocation({
      clinicId: active.id,
      values: siteInput(retiredSlug),
    });

    try {
      await waitForWaiters(retiredSlug, 2);
      held.release();
      await expect(created).rejects.toThrow(RETIRED_TENANT_SLUG_MESSAGE);
      await expect(added).rejects.toThrow(RETIRED_TENANT_SLUG_MESSAGE);
      await expect(held.done).resolves.toMatchObject({ ok: true });
      await expectSlugOnlyRetired(retiredSlug, retiring.id);
      expect(
        await db().clinicSite.count({ where: { clinicId: active.id } })
      ).toBe(1);
    } finally {
      held.release();
    }
  });

  it("does not tombstone a shell slug a split published first", async () => {
    const candidate = "xsp2222bbbb";
    const retiring = await fresh(`${PREFIX}hold`, "Rslug Hold");
    await deactivate(retiring.id);
    const release = deferred();
    const published = deferred();
    const publisher = db().$transaction(
      async (tx) => {
        await lockAccountSplitShellSlug(tx);
        const slug = await allocateSplitShellSlug(tx, [candidate]);
        const created = await tx.clinic.create({
          data: {
            name: "Rslug Shell Wins",
            slug,
            assistedOnboarding: true,
          },
        });
        published.resolve();
        await release.promise;
        return created.id;
      },
      { maxWait: 10_000, timeout: 20_000 }
    );

    try {
      await published.promise;
      const primary = await db().clinicSite.findFirstOrThrow({
        where: { clinicId: retiring.id, isPrimary: true },
        select: { id: true },
      });
      await db().clinicSite.update({
        where: { id: primary.id },
        data: { slug: candidate },
      });
      const deletion = permanentlyDeleteClinic({
        clinicId: retiring.id,
        operatorUserId: OPERATOR_ID,
        confirmation: "Rslug Hold",
        storage: memoryStorage(),
      });
      await waitForWaiters(candidate, 1);
      release.resolve();
      const shellId = await publisher;
      await expect(deletion).rejects.toThrow(ADDRESS_CHANGED);
      expect(
        await db().retiredTenantSlug.findUnique({ where: { slug: candidate } })
      ).toBeNull();
      expect(
        await db().clinic.findUnique({
          where: { slug: candidate },
          select: { id: true },
        })
      ).toMatchObject({ id: shellId });
      expect(
        await db().clinic.findUniqueOrThrow({
          where: { id: retiring.id },
          select: { permanentlyDeletedAt: true },
        })
      ).toMatchObject({ permanentlyDeletedAt: null });
    } finally {
      release.resolve();
    }
  });

  it("does not tombstone a compatibility slug a split published first", async () => {
    const issued = `${PREFIX}issued`;
    const source = await fresh(`${PREFIX}isrc`, "Rslug Issued Source");
    const destination = await fresh(`${PREFIX}idst`, "Rslug Issued Dest");
    const retiring = await fresh(`${PREFIX}iold`, "Rslug Issued Old");
    await deactivate(retiring.id);
    const release = deferred();
    const published = deferred();
    const publisher = db().$transaction(
      async (tx) => {
        const parked = await writeCompatibilitySlugs(tx, {
          sourceClinicId: source.id,
          destinationClinicId: destination.id,
          sourceTarget: `${PREFIX}isrc`,
          destinationTarget: issued,
        });
        published.resolve();
        await release.promise;
        return parked;
      },
      { maxWait: 10_000, timeout: 20_000 }
    );

    try {
      await published.promise;
      const primary = await db().clinicSite.findFirstOrThrow({
        where: { clinicId: retiring.id, isPrimary: true },
        select: { id: true },
      });
      await db().clinicSite.update({
        where: { id: primary.id },
        data: { slug: issued },
      });
      const deletion = permanentlyDeleteClinic({
        clinicId: retiring.id,
        operatorUserId: OPERATOR_ID,
        confirmation: "Rslug Issued Old",
        storage: memoryStorage(),
      });
      await waitForWaiters(issued, 1);
      release.resolve();
      await expect(publisher).resolves.toBe(false);
      await expect(deletion).rejects.toThrow(ADDRESS_CHANGED);
      expect(
        await db().retiredTenantSlug.findUnique({ where: { slug: issued } })
      ).toBeNull();
      expect(
        await db().clinic.findUnique({
          where: { slug: issued },
          select: { id: true },
        })
      ).toMatchObject({ id: destination.id });
      expect(
        await db().clinic.findUniqueOrThrow({
          where: { id: retiring.id },
          select: { permanentlyDeletedAt: true },
        })
      ).toMatchObject({ permanentlyDeletedAt: null });
    } finally {
      release.resolve();
    }
  });

  it("does not tombstone a destination site slug a split published first", async () => {
    const issued = `${PREFIX}psite`;
    const destination = await db().clinic.create({
      data: {
        name: "Rslug Publish Dest",
        slug: `${PREFIX}pdst`,
        assistedOnboarding: true,
      },
      select: { id: true },
    });
    const retiring = await fresh(`${PREFIX}pold`, "Rslug Publish Old");
    await deactivate(retiring.id);
    const release = deferred();
    const published = deferred();
    const publisher = db().$transaction(
      async (tx) => {
        const site = await publishLocationDestinationSite(tx, {
          destinationClinicId: destination.id,
          slug: issued,
          name: "Published",
          displayName: "Published",
          logoUrl: null,
          darkLogoUrl: null,
          faviconUrl: null,
          theme: destinationTheme(),
        });
        published.resolve();
        await release.promise;
        return site.id;
      },
      { maxWait: 10_000, timeout: 20_000 }
    );

    try {
      await published.promise;
      await db().clinic.update({
        where: { id: retiring.id },
        data: { slug: issued },
      });
      const deletion = permanentlyDeleteClinic({
        clinicId: retiring.id,
        operatorUserId: OPERATOR_ID,
        confirmation: "Rslug Publish Old",
        storage: memoryStorage(),
      });
      await waitForWaiters(issued, 1);
      release.resolve();
      const siteId = await publisher;
      await expect(deletion).rejects.toThrow(ADDRESS_CHANGED);
      expect(
        await db().retiredTenantSlug.findUnique({ where: { slug: issued } })
      ).toBeNull();
      expect(
        await db().clinicSite.findUnique({
          where: { slug: issued },
          select: { id: true, clinicId: true },
        })
      ).toMatchObject({ id: siteId, clinicId: destination.id });
      expect(
        await db().clinic.findUniqueOrThrow({
          where: { id: retiring.id },
          select: { permanentlyDeletedAt: true, slug: true },
        })
      ).toMatchObject({ permanentlyDeletedAt: null, slug: issued });
    } finally {
      release.resolve();
    }
  });

  it("skips a retired shell candidate and still refuses when every candidate is retired", async () => {
    const retired = "xsp3333cccc";
    const free = "xsp3333dddd";
    const clinic = await fresh(`${PREFIX}skip`, "Rslug Skip");
    await addExtraSite(clinic.id, retired);
    await deactivate(clinic.id);
    expect(
      await archiveClinic({
        clinicId: clinic.id,
        operatorUserId: OPERATOR_ID,
        confirmation: "Rslug Skip",
      })
    ).toEqual({ ok: true });
    const deleted = await permanentlyDeleteClinic({
      clinicId: clinic.id,
      operatorUserId: OPERATOR_ID,
      confirmation: "Rslug Skip",
      storage: memoryStorage(),
    });
    expect(deleted.ok).toBe(true);

    const reserved = await db().$transaction(async (tx) => {
      await lockAccountSplitShellSlug(tx);
      return allocateSplitShellSlug(tx, [retired, "not-a-shell", free]);
    });
    expect(reserved).toBe(free);
    expect(await db().clinic.findUnique({ where: { slug: free } })).toBeNull();
    expect(
      await db().clinicSite.findUnique({ where: { slug: free } })
    ).toBeNull();

    await expect(
      db().$transaction(async (tx) => {
        await lockAccountSplitShellSlug(tx);
        return allocateSplitShellSlug(tx, [retired]);
      })
    ).rejects.toThrow(RETIRED_TENANT_SLUG_MESSAGE);
  });

  it("keeps a retired slug rejected and still frees a pristine Discard slug", async () => {
    const retiredSlug = `${PREFIX}closed`;
    const retiredShell = "xsp4444eeee";
    const retiring = await fresh(`${PREFIX}closed-acct`, "Rslug Closed");
    const active = await fresh(`${PREFIX}closed-live`, "Rslug Closed Live");
    const source = await fresh(`${PREFIX}closed-src`, "Rslug Closed Source");
    const destination = await fresh(`${PREFIX}closed-dst`, "Rslug Closed Dest");
    await addExtraSite(retiring.id, retiredSlug);
    await addExtraSite(retiring.id, retiredShell);
    await deactivate(retiring.id);
    expect(
      await archiveClinic({
        clinicId: retiring.id,
        operatorUserId: OPERATOR_ID,
        confirmation: "Rslug Closed",
      })
    ).toEqual({ ok: true });
    const deleted = await permanentlyDeleteClinic({
      clinicId: retiring.id,
      operatorUserId: OPERATOR_ID,
      confirmation: "Rslug Closed",
      storage: memoryStorage(),
    });
    expect(deleted.ok).toBe(true);

    await expect(
      createOperatorClinic({
        name: "Rslug Closed Again",
        slug: retiredSlug,
        serviceCategories: ["DENTAL"],
      })
    ).rejects.toThrow(RETIRED_TENANT_SLUG_MESSAGE);
    await expect(
      createClinicSiteWithRootLocation({
        clinicId: active.id,
        values: siteInput(retiredSlug),
      })
    ).rejects.toThrow(RETIRED_TENANT_SLUG_MESSAGE);
    await expect(
      db().$transaction(async (tx) => {
        await lockAccountSplitShellSlug(tx);
        return allocateSplitShellSlug(tx, [retiredShell]);
      })
    ).rejects.toThrow(RETIRED_TENANT_SLUG_MESSAGE);
    await expect(
      db().$transaction((tx) =>
        writeCompatibilitySlugs(tx, {
          sourceClinicId: source.id,
          destinationClinicId: destination.id,
          sourceTarget: `${PREFIX}closed-src`,
          destinationTarget: retiredSlug,
        })
      )
    ).rejects.toThrow(RETIRED_TENANT_SLUG_MESSAGE);
    await expect(
      db().$transaction((tx) =>
        publishLocationDestinationSite(tx, {
          destinationClinicId: destination.id,
          slug: retiredSlug,
          name: "Closed",
          displayName: "Closed",
          logoUrl: null,
          darkLogoUrl: null,
          faviconUrl: null,
          theme: destinationTheme(),
        })
      )
    ).rejects.toThrow(RETIRED_TENANT_SLUG_MESSAGE);
    await expectSlugOnlyRetired(retiredSlug, retiring.id);
    await expectSlugOnlyRetired(retiredShell, retiring.id);

    const discardedSlug = `${PREFIX}discard`;
    const pristine = await fresh(discardedSlug, "Rslug Discard");
    await expect(discardAssistedClinic(pristine.id)).resolves.toEqual({
      ok: true,
    });
    expect(
      await db().retiredTenantSlug.findUnique({
        where: { slug: discardedSlug },
      })
    ).toBeNull();
    const again = await fresh(discardedSlug, "Rslug Discard");
    expect(again.id).not.toBe(pristine.id);
  });
});
