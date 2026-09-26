import "dotenv/config";

import {
  BillingStatus,
  ClinicMembershipRole,
  EntitlementStatus,
  GuideRevisionStatus,
  PracticeGuideStatus,
  PracticeSectionProvenance,
  GuideSectionKind,
} from "@prisma/client";
import type Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { acceptInvitationWithToken } from "@/lib/auth/accept-invitation";
import { createInvitationToken } from "@/lib/auth/account-token-service";
import { processVerifiedStripeEvent } from "@/lib/billing/webhook-processor";
import { setGuideAvailableAtLocation } from "@/lib/clinic-portal/guide-placements";
import { publishPracticeGuide } from "@/lib/clinic-portal/publish-practice-guide";
import { ensurePrimarySiteForClinic } from "@/lib/clinics/primary-site-location.mjs";
import {
  createLocationSchema,
  createSiteSchema,
} from "@/lib/clinics/site-location-schemas";
import {
  createClinicLocation,
  createClinicSiteWithRootLocation,
} from "@/lib/clinics/site-location-mutations";
import {
  clinicAccountStructureLockKey,
  lockClinicAccountStructure,
  lockClinicAccountStructures,
} from "@/lib/entitlements/locks";
import { getPrisma } from "@/lib/prisma";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const describeDb = hasDatabase ? describe : describe.skip;

const PREFIX = "aslck";

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

type LockCounts = { granted: number; waiting: number };

async function advisoryLockCounts(lockKey: string): Promise<LockCounts> {
  const rows = await getPrisma().$queryRaw<LockCounts[]>`
    SELECT
      COALESCE(SUM(CASE WHEN l.granted THEN 1 ELSE 0 END), 0)::int AS granted,
      COALESCE(SUM(CASE WHEN NOT l.granted THEN 1 ELSE 0 END), 0)::int AS waiting
    FROM pg_locks l
    WHERE l.locktype = 'advisory'
      AND l.objsubid = 1
      AND ((l.classid::bigint << 32) | l.objid::bigint) = hashtext(${lockKey})::bigint
  `;
  const row = rows[0];
  return {
    granted: Number(row?.granted ?? 0),
    waiting: Number(row?.waiting ?? 0),
  };
}

/**
 * Polls pg_locks until another session is waiting on this transaction lock.
 * The assertion is the observed waiter, not a sleep.
 */
async function waitForStructureWaiter(clinicId: string): Promise<LockCounts> {
  const lockKey = clinicAccountStructureLockKey(clinicId);
  const started = Date.now();
  let last = { granted: 0, waiting: 0 };
  while (Date.now() - started < 8_000) {
    last = await advisoryLockCounts(lockKey);
    if (last.granted >= 1 && last.waiting >= 1) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `No session was waiting on ${lockKey}. granted=${last.granted} waiting=${last.waiting}`
  );
}

async function holdStructureLock(
  clinicId: string,
  whileHeld: () => Promise<void>
): Promise<void> {
  const release = deferred();
  const ready = deferred();
  const holder = getPrisma().$transaction(
    async (tx) => {
      await lockClinicAccountStructure(tx, clinicId);
      ready.resolve();
      await release.promise;
    },
    { maxWait: 10_000, timeout: 20_000 }
  );
  try {
    await ready.promise;
    await whileHeld();
  } finally {
    release.resolve();
    await holder;
  }
}

describe("account structure lock contract", () => {
  it("derives one clinic-scoped key and does not accept a caller lock name", () => {
    expect(clinicAccountStructureLockKey("clinic_a")).toBe(
      "clinic-account-structure:clinic_a"
    );
    expect(clinicAccountStructureLockKey("clinic_b")).not.toBe(
      clinicAccountStructureLockKey("clinic_a")
    );
  });
});

describeDb("account structure lock participation", () => {
  const prisma = () => getPrisma();

  async function cleanup() {
    await prisma().stripeEventReceipt.deleteMany({
      where: { stripeEventId: { startsWith: "evt_aslck_" } },
    });
    await prisma().clinic.deleteMany({
      where: { id: { startsWith: `${PREFIX}_` } },
    });
    await prisma().user.deleteMany({
      where: { id: { startsWith: `${PREFIX}_` } },
    });
  }

  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma().$disconnect();
  });

  async function createAccount(name: string) {
    const id = `${PREFIX}_${name}`;
    const slug = `${PREFIX}-${name}`;
    await prisma().clinic.create({
      data: {
        id,
        name,
        slug,
        profile: { create: { displayName: name } },
      },
    });
    return { id, slug };
  }

  it("re-enters one account lock and deduplicates several ids", async () => {
    await prisma().$transaction(async (tx) => {
      await lockClinicAccountStructure(tx, `${PREFIX}_reenter`);
      await lockClinicAccountStructure(tx, `${PREFIX}_reenter`);
      await lockClinicAccountStructures(tx, [
        `${PREFIX}_reenter`,
        `${PREFIX}_reenter`,
      ]);
    });
  });

  it("locks opposite account lists in one sorted order without deadlocking", async () => {
    const low = `${PREFIX}_lock_a`;
    const high = `${PREFIX}_lock_b`;
    expect(low < high).toBe(true);

    const release = deferred();
    const ready = deferred();
    let multiFinished = false;
    const holder = prisma().$transaction(
      async (tx) => {
        await lockClinicAccountStructure(tx, low);
        ready.resolve();
        await release.promise;
      },
      { maxWait: 10_000, timeout: 20_000 }
    );

    try {
      await ready.promise;
      const multi = prisma()
        .$transaction(
          async (tx) => {
            await lockClinicAccountStructures(tx, [high, low]);
            multiFinished = true;
          },
          { maxWait: 10_000, timeout: 20_000 }
        )
        .finally(() => undefined);

      await waitForStructureWaiter(low);
      const highKey = clinicAccountStructureLockKey(high);
      const highState = await advisoryLockCounts(highKey);
      expect(highState.granted).toBe(0);
      expect(multiFinished).toBe(false);

      release.resolve();
      await multi;
      expect(multiFinished).toBe(true);
    } finally {
      release.resolve();
      await holder;
    }

    await Promise.all([
      prisma().$transaction((tx) =>
        lockClinicAccountStructures(tx, [high, low])
      ),
      prisma().$transaction((tx) =>
        lockClinicAccountStructures(tx, [low, high])
      ),
    ]);
  });

  it("makes a site create wait until the structure lock is released", async () => {
    const account = await createAccount("site");
    const values = createSiteSchema.parse({
      siteName: "North",
      siteSlug: "aslck-north",
      locationName: "North rooms",
      locationDisplayName: "",
      phone: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      region: "",
      postalCode: "",
      country: "",
      contactUrl: "",
      contactEmail: "",
      bookingUrl: "",
      emergencyInstructions: "",
    });
    let created = false;
    let mutation: Promise<{ siteId: string; locationId: string }> | undefined;

    await holdStructureLock(account.id, async () => {
      mutation = createClinicSiteWithRootLocation({
        clinicId: account.id,
        values,
      }).finally(() => {
        created = true;
      });
      await waitForStructureWaiter(account.id);
      expect(created).toBe(false);
      expect(
        await prisma().clinicSite.count({ where: { clinicId: account.id } })
      ).toBe(0);
    });

    if (!mutation) {
      throw new Error("Site create did not start.");
    }
    const result = await mutation;
    expect(created).toBe(true);
    expect(
      await prisma().clinicSite.findUnique({
        where: { id: result.siteId },
        select: { slug: true, clinicId: true },
      })
    ).toEqual({ slug: "aslck-north", clinicId: account.id });
  });

  it("still creates a location when no competing structure lock is held", async () => {
    const account = await createAccount("location");
    await prisma().clinicEntitlement.create({
      data: {
        clinicId: account.id,
        commercialPlan: "PRACTICE",
        billingInterval: "MONTHLY",
        billingStatus: BillingStatus.ACTIVE,
        entitlementStatus: EntitlementStatus.ACTIVE,
        siteAllowance: 1,
        locationAllowance: 5,
      },
    });
    await ensurePrimarySiteForClinic(prisma(), account.id);
    const site = await prisma().clinicSite.findFirstOrThrow({
      where: { clinicId: account.id, isPrimary: true },
      select: { id: true },
    });
    const values = createLocationSchema.parse({
      name: "West wing",
      slug: "west",
      displayName: "West wing",
      phone: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      region: "",
      postalCode: "",
      country: "",
      contactUrl: "",
      contactEmail: "",
      bookingUrl: "",
      emergencyInstructions: "",
    });
    const created = await createClinicLocation({
      clinicId: account.id,
      siteId: site.id,
      values,
    });
    expect(
      await prisma().clinicLocation.findUnique({
        where: { id: created.locationId },
        select: { slug: true, clinicId: true },
      })
    ).toEqual({ slug: "west", clinicId: account.id });
  });

  it("makes guide publish wait until the structure lock is released", async () => {
    const account = await createAccount("guide");
    const userId = `${PREFIX}_guide_admin`;
    await prisma().user.create({
      data: {
        id: userId,
        email: `${PREFIX}-guide-admin@example.test`,
        name: "Guide admin",
        platformRole: "NONE",
      },
    });
    await prisma().clinicMembership.create({
      data: {
        clinicId: account.id,
        userId,
        role: ClinicMembershipRole.ADMIN,
      },
    });
    await ensurePrimarySiteForClinic(prisma(), account.id);
    const guide = await prisma().practiceGuide.create({
      data: {
        clinicId: account.id,
        title: "Extraction care",
        publicSlug: "extraction",
        status: PracticeGuideStatus.DRAFT,
        contentRevisions: {
          create: {
            version: 0,
            status: GuideRevisionStatus.DRAFT,
            title: "Extraction care",
            sections: {
              create: {
                key: "care",
                kind: GuideSectionKind.CUSTOM,
                title: "Care",
                body: "Rest.",
                sortOrder: 0,
                provenance: PracticeSectionProvenance.PRACTICE_CUSTOM,
              },
            },
          },
        },
      },
      select: { id: true },
    });

    let published = false;
    let mutation: Promise<{ id: string; version: number }> | undefined;

    await holdStructureLock(account.id, async () => {
      mutation = publishPracticeGuide({
        clinicId: account.id,
        actorUserId: userId,
        guideId: guide.id,
        reviewAttested: true,
      }).finally(() => {
        published = true;
      });
      await waitForStructureWaiter(account.id);
      expect(published).toBe(false);
      expect(
        await prisma().practiceGuideRevision.count({
          where: {
            practiceGuideId: guide.id,
            status: GuideRevisionStatus.PUBLISHED,
          },
        })
      ).toBe(0);
    });

    if (!mutation) {
      throw new Error("Guide publish did not start.");
    }
    const result = await mutation;
    expect(result.version).toBe(1);
    expect(
      await prisma().practiceGuide.findUnique({
        where: { id: guide.id },
        select: { status: true },
      })
    ).toEqual({ status: PracticeGuideStatus.PUBLISHED });
  });

  it("makes a placement update wait until the structure lock is released", async () => {
    const account = await createAccount("place");
    await ensurePrimarySiteForClinic(prisma(), account.id);
    const location = await prisma().clinicLocation.findFirstOrThrow({
      where: { clinicId: account.id, servesSiteRoot: true },
      select: { id: true },
    });
    const guide = await prisma().practiceGuide.create({
      data: {
        clinicId: account.id,
        title: "Placement guide",
        publicSlug: "placement",
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
        contentRevisions: {
          create: {
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            title: "Placement guide",
            publishedAt: new Date(),
            sections: {
              create: {
                key: "care",
                kind: GuideSectionKind.CUSTOM,
                title: "Care",
                body: "Rest.",
                sortOrder: 0,
                provenance: PracticeSectionProvenance.PRACTICE_CUSTOM,
              },
            },
          },
        },
      },
      select: {
        id: true,
        contentRevisions: { select: { id: true } },
      },
    });
    const revisionId = guide.contentRevisions[0]?.id;
    expect(revisionId).toBeTruthy();

    let changed = false;
    let mutation:
      Promise<{ enabled: boolean; publicPath: string | null }> | undefined;

    await holdStructureLock(account.id, async () => {
      mutation = setGuideAvailableAtLocation({
        clinicId: account.id,
        guideId: guide.id,
        locationId: location.id,
        available: true,
      }).finally(() => {
        changed = true;
      });
      await waitForStructureWaiter(account.id);
      expect(changed).toBe(false);
      expect(
        await prisma().practiceGuidePlacement.count({
          where: { clinicId: account.id, practiceGuideId: guide.id },
        })
      ).toBe(0);
    });

    if (!mutation) {
      throw new Error("Placement update did not start.");
    }
    const result = await mutation;
    expect(result.enabled).toBe(true);
    expect(
      await prisma().practiceGuidePlacement.findFirst({
        where: { clinicId: account.id, practiceGuideId: guide.id },
        select: { isEnabled: true, publishedPracticeGuideRevisionId: true },
      })
    ).toEqual({
      isEnabled: true,
      publishedPracticeGuideRevisionId: revisionId,
    });
  });

  it("makes invitation acceptance wait until the structure lock is released", async () => {
    const account = await createAccount("invite");
    const userId = `${PREFIX}_invitee`;
    const email = `${PREFIX}-invitee@example.test`;
    await prisma().user.create({
      data: {
        id: userId,
        email,
        name: "Invited person",
        platformRole: "NONE",
        passwordHash: null,
      },
    });
    const invitation = await createInvitationToken({
      userId,
      clinicId: account.id,
      role: ClinicMembershipRole.ADMIN,
      email,
      invitedByUserId: userId,
    });

    let accepted = false;
    let mutation: Promise<{ ok: true } | { ok: false }> | undefined;

    await holdStructureLock(account.id, async () => {
      mutation = acceptInvitationWithToken({
        rawToken: invitation.rawToken,
        newPassword: "correct-horse-1",
        confirmPassword: "correct-horse-1",
      }).finally(() => {
        accepted = true;
      });
      await waitForStructureWaiter(account.id);
      expect(accepted).toBe(false);
      expect(
        await prisma().clinicMembership.count({
          where: { clinicId: account.id, userId },
        })
      ).toBe(0);
    });

    if (!mutation) {
      throw new Error("Invitation acceptance did not start.");
    }
    expect(await mutation).toEqual({ ok: true });
    expect(
      await prisma().clinicMembership.findFirst({
        where: { clinicId: account.id, userId },
        select: { role: true, active: true },
      })
    ).toEqual({ role: ClinicMembershipRole.ADMIN, active: true });
  });

  it("makes Stripe entitlement projection wait until the structure lock is released", async () => {
    const account = await createAccount("bill");
    const priceId = "price_aslck_essential_monthly";
    const event = {
      id: `evt_aslck_${account.id}`,
      object: "event",
      api_version: null,
      created: 1_747_000_000,
      type: "invoice.paid",
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      data: {
        object: {
          id: `in_${account.id}`,
          object: "invoice",
          status: "paid",
          customer: `cus_${account.id}`,
          metadata: { clinicId: account.id },
          parent: {
            type: "subscription_details",
            quote_details: null,
            subscription_details: {
              subscription: `sub_${account.id}`,
              metadata: { clinicId: account.id },
            },
          },
          lines: {
            object: "list",
            data: [
              {
                id: "il_aslck",
                object: "line_item",
                pricing: {
                  type: "price_details",
                  price_details: { price: priceId, product: "prod_aslck" },
                  unit_amount_decimal: "7900",
                },
              },
            ],
            has_more: false,
            url: "/v1/invoices/lines",
          },
          period_start: 1_746_000_000,
          period_end: 1_748_600_000,
        },
      },
    } as unknown as Stripe.Event;
    const env = {
      STRIPE_ESSENTIAL_MONTHLY_PRICE_ID: priceId,
      STRIPE_ESSENTIAL_YEARLY_PRICE_ID: "price_aslck_essential_yearly",
      STRIPE_PRACTICE_MONTHLY_PRICE_ID: "price_aslck_practice_monthly",
      STRIPE_PRACTICE_YEARLY_PRICE_ID: "price_aslck_practice_yearly",
    };

    let projected = false;
    let mutation: ReturnType<typeof processVerifiedStripeEvent> | undefined;

    await holdStructureLock(account.id, async () => {
      mutation = processVerifiedStripeEvent(event, {
        reader: null,
        env,
      }).finally(() => {
        projected = true;
      });
      await waitForStructureWaiter(account.id);
      expect(projected).toBe(false);
      expect(
        await prisma().clinicEntitlement.findUnique({
          where: { clinicId: account.id },
          select: { billingStatus: true },
        })
      ).toBeNull();
    });

    if (!mutation) {
      throw new Error("Billing projection did not start.");
    }
    expect(await mutation).toMatchObject({
      outcome: "processed",
      clinicId: account.id,
    });
    expect(
      await prisma().clinicEntitlement.findUnique({
        where: { clinicId: account.id },
        select: { billingStatus: true, entitlementStatus: true },
      })
    ).toEqual({
      billingStatus: BillingStatus.ACTIVE,
      entitlementStatus: EntitlementStatus.ACTIVE,
    });
  });
});
