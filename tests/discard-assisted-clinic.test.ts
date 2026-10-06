import "dotenv/config";

import { readFileSync } from "node:fs";

import {
  AccountTokenType,
  ClinicMembershipRole,
  GuideRevisionStatus,
  PlatformRole,
  PracticeGuideStatus,
  type PrismaClient,
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { locationMoveEligibility } from "@/lib/account-split/location-policy";
import {
  lockAccountSplit,
  accountSplitLockKey,
} from "@/lib/account-split/locks";
import {
  createAccountSplitPreparation,
  selectExistingGroupDestination,
} from "@/lib/account-split/preparation";
import { supportedAccountSplitAction } from "@/lib/account-split/policy";
import { grantComplimentaryAccess } from "@/lib/billing/complimentary-access";
import { prepareClinicCommercialOffer } from "@/lib/billing/prepare-offer";
import { isLocalDevelopmentDatabase } from "@/lib/dev/database-target";
import {
  clinicAccountStructureLockKey,
  lockClinicAccountStructure,
} from "@/lib/entitlements/locks";
import { COMMERCIAL_SETUP_REQUIRED_MESSAGE } from "@/lib/operator/clinic-onboarding";
import { createOperatorClinic } from "@/lib/operator/create-operator-clinic";
import {
  DISCARD_NOT_ASSISTED_MESSAGE,
  DISCARD_NOT_FOUND_MESSAGE,
  DISCARD_NOT_PRISTINE_MESSAGE,
  canDiscardAssistedClinic,
  discardAssistedClinic,
} from "@/lib/operator/discard-assisted-clinic";
import { inviteFirstClinicAdministrator } from "@/lib/operator/invite-first-clinic-administrator";
import { getPrisma } from "@/lib/prisma";

const PREFIX = "dscd70-";
const EMAIL_PREFIX = "dscd70-";
const OPERATOR_ID = "dscd70_operator";
const MEMBER_ID = "dscd70_member";
const local = isLocalDevelopmentDatabase(process.env.DATABASE_URL);
const describeDb = local ? describe : describe.skip;

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

async function waitForLock(lockKey: string): Promise<LockCounts> {
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

describe("discard assisted clinic authorization and lock order", () => {
  it("keeps discard behind the staff host and a platform operator", () => {
    const actions = readFileSync(
      "app/(staff)/(operator)/operator/clinics/[clinicId]/setup/actions.ts",
      "utf8"
    );
    const session = readFileSync("lib/auth/session.ts", "utf8");
    const body = actions.slice(
      actions.indexOf("export async function discardAssistedClinicAction")
    );
    expect(body.indexOf("requireOperatorOnStaffHost()")).toBeLessThan(
      body.indexOf("discardAssistedClinic(")
    );
    expect(actions).toContain("isStaffAppHost");
    expect(actions).toContain("requirePlatformOperator");
    expect(session).toContain("user?.platformRole === PlatformRole.OPERATOR");
  });

  it("takes the structure lock before this clinic's split lock and then re-reads", () => {
    const source = readFileSync(
      "lib/operator/discard-assisted-clinic.ts",
      "utf8"
    );
    const body = source.slice(
      source.indexOf("export async function discardAssistedClinic")
    );
    expect(body.indexOf("await lockClinicAccountStructure")).toBeLessThan(
      body.indexOf("await lockAccountSplit")
    );
    expect(body.indexOf("await lockAccountSplit")).toBeLessThan(
      body.indexOf("readDiscardSnapshot")
    );
    expect(body.indexOf("readDiscardSnapshot")).toBeLessThan(
      body.indexOf("clinic.delete")
    );
    const preparation = readFileSync(
      "lib/account-split/preparation.ts",
      "utf8"
    );
    const selection = preparation.slice(
      preparation.indexOf(
        "export async function selectExistingGroupDestination"
      )
    );
    expect(selection.indexOf("lockClinicAccountStructures")).toBeLessThan(
      selection.indexOf("lockAccountSplits")
    );
    expect(selection.indexOf("lockAccountSplits")).toBeLessThan(
      selection.indexOf("clinic.findUnique")
    );
    expect(selection.indexOf('commercialPlan !== "GROUP"')).toBeLessThan(
      selection.indexOf("clinicAccountSplitPreparation.update")
    );
    expect(preparation).not.toContain("assistedOnboarding: true");
  });
});

describeDb("discard assisted clinic safety", () => {
  let prisma: PrismaClient | null = null;
  const previousFrom = process.env.AUTH_EMAIL_FROM;
  const previousReply = process.env.AUTH_EMAIL_REPLY_TO;
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  function db(): PrismaClient {
    if (!prisma) {
      throw new Error("Prisma is not connected.");
    }
    return prisma;
  }

  async function cleanup() {
    await db().clinicLocationRedirect.deleteMany({
      where: {
        OR: [
          { sourceClinicSite: { slug: { startsWith: PREFIX } } },
          { destinationClinicSite: { slug: { startsWith: PREFIX } } },
        ],
      },
    });
    await db().stripeEventReceipt.deleteMany({
      where: { stripeEventId: { startsWith: PREFIX } },
    });
    await db().clinic.deleteMany({
      where: { slug: { startsWith: PREFIX } },
    });
    await db().user.deleteMany({
      where: {
        OR: [
          { id: { in: [OPERATOR_ID, MEMBER_ID] } },
          { email: { startsWith: EMAIL_PREFIX } },
        ],
      },
    });
  }

  async function fresh(slug: string, name = "Dscd70 Clinic") {
    return createOperatorClinic({
      name,
      slug,
      serviceCategories: ["DENTAL"],
    });
  }

  async function refuse(
    slug: string,
    mutate: (clinicId: string) => Promise<void>
  ) {
    const clinic = await fresh(slug);
    await mutate(clinic.id);
    expect(await canDiscardAssistedClinic(clinic.id)).toBe(false);
    expect(await discardAssistedClinic(clinic.id)).toEqual({
      ok: false,
      error: DISCARD_NOT_PRISTINE_MESSAGE,
    });
    expect(
      await db().clinic.findUnique({ where: { id: clinic.id } })
    ).not.toBeNull();
    return clinic;
  }

  function operatorInput(clinicId: string) {
    return {
      actorUserId: OPERATOR_ID,
      actorPlatformRole: PlatformRole.OPERATOR,
      clinicId,
      reason: "Design partner for the first year.",
      now: new Date("2026-10-05T01:00:00.000Z"),
    };
  }

  beforeAll(async () => {
    process.env.AUTH_EMAIL_FROM = "River Aftercare <accounts@example.test>";
    process.env.AUTH_EMAIL_REPLY_TO = "hello@example.test";
    process.env.CARE_GUIDE_ROOT_DOMAIN = "example.test";
    prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    await cleanup();
    await db().user.create({
      data: {
        id: OPERATOR_ID,
        email: `${EMAIL_PREFIX}operator@example.test`,
        name: "River Operator",
        platformRole: PlatformRole.OPERATOR,
      },
    });
    await db().user.create({
      data: {
        id: MEMBER_ID,
        email: `${EMAIL_PREFIX}member@example.test`,
        name: "Clinic Member",
      },
    });
  });

  afterAll(async () => {
    if (previousFrom === undefined) {
      delete process.env.AUTH_EMAIL_FROM;
    } else {
      process.env.AUTH_EMAIL_FROM = previousFrom;
    }
    if (previousReply === undefined) {
      delete process.env.AUTH_EMAIL_REPLY_TO;
    } else {
      process.env.AUTH_EMAIL_REPLY_TO = previousReply;
    }
    if (previousRoot === undefined) {
      delete process.env.CARE_GUIDE_ROOT_DOMAIN;
    } else {
      process.env.CARE_GUIDE_ROOT_DOMAIN = previousRoot;
    }
    if (!prisma) {
      return;
    }
    await cleanup();
    await prisma.$disconnect();
  });

  it("discards a pristine assisted clinic and frees the tenant address", async () => {
    const created = await fresh(`${PREFIX}pristine`, "Dscd70 Pristine");
    const graph = await db().clinic.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        profile: true,
        sites: { include: { serviceCategories: true, locations: true } },
      },
    });
    expect(graph.profile).not.toBeNull();
    expect(graph.sites).toHaveLength(1);
    expect(graph.sites[0]?.serviceCategories.length).toBeGreaterThan(0);
    expect(graph.sites[0]?.locations).toHaveLength(1);
    expect(await canDiscardAssistedClinic(created.id)).toBe(true);

    expect(await discardAssistedClinic(created.id)).toEqual({ ok: true });

    expect(
      await db().clinic.findUnique({ where: { id: created.id } })
    ).toBeNull();
    expect(
      await db().clinicProfile.findUnique({ where: { clinicId: created.id } })
    ).toBeNull();
    expect(
      await db().clinicSite.findUnique({ where: { slug: `${PREFIX}pristine` } })
    ).toBeNull();
    expect(
      await db().clinicLocation.count({ where: { clinicId: created.id } })
    ).toBe(0);
    expect(
      await db().clinicSiteServiceCategory.count({
        where: { clinicId: created.id },
      })
    ).toBe(0);

    const reused = await fresh(`${PREFIX}pristine`, "Dscd70 Pristine Again");
    expect(reused.id).not.toBe(created.id);
    expect(await canDiscardAssistedClinic(reused.id)).toBe(true);
  });

  it("refuses a historical clinic and a missing clinic", async () => {
    const historical = await fresh(`${PREFIX}historical`);
    await db().clinic.update({
      where: { id: historical.id },
      data: { assistedOnboarding: false },
    });
    expect(await canDiscardAssistedClinic(historical.id)).toBe(false);
    expect(await discardAssistedClinic(historical.id)).toEqual({
      ok: false,
      error: DISCARD_NOT_ASSISTED_MESSAGE,
    });
    expect(
      await db().clinic.findUnique({ where: { id: historical.id } })
    ).not.toBeNull();
    expect(await discardAssistedClinic("dscd70-missing")).toEqual({
      ok: false,
      error: DISCARD_NOT_FOUND_MESSAGE,
    });
  });

  it("refuses any membership, including an inactive one", async () => {
    await refuse(`${PREFIX}member`, async (clinicId) => {
      await db().clinicMembership.create({
        data: {
          clinicId,
          userId: MEMBER_ID,
          role: ClinicMembershipRole.ADMIN,
          active: true,
        },
      });
    });
    await db().clinicMembership.deleteMany({ where: { userId: MEMBER_ID } });
    await refuse(`${PREFIX}inactive`, async (clinicId) => {
      await db().clinicMembership.create({
        data: {
          clinicId,
          userId: MEMBER_ID,
          role: ClinicMembershipRole.STAFF,
          active: false,
        },
      });
    });
  });

  it("refuses an invitation token of every status", async () => {
    const cases = [
      {
        slug: `${PREFIX}tok-pending`,
        data: { expiresAt: new Date("2026-12-01T00:00:00.000Z") },
      },
      {
        slug: `${PREFIX}tok-expired`,
        data: { expiresAt: new Date("2020-01-01T00:00:00.000Z") },
      },
      {
        slug: `${PREFIX}tok-revoked`,
        data: {
          expiresAt: new Date("2026-12-01T00:00:00.000Z"),
          revokedAt: new Date("2026-10-01T00:00:00.000Z"),
        },
      },
      {
        slug: `${PREFIX}tok-consumed`,
        data: {
          expiresAt: new Date("2026-12-01T00:00:00.000Z"),
          consumedAt: new Date("2026-10-02T00:00:00.000Z"),
        },
      },
    ];
    for (const entry of cases) {
      await refuse(entry.slug, async (clinicId) => {
        await db().accountToken.create({
          data: {
            type: AccountTokenType.INVITATION,
            tokenHash: entry.slug,
            userId: MEMBER_ID,
            clinicId,
            role: ClinicMembershipRole.ADMIN,
            email: `${EMAIL_PREFIX}member@example.test`,
            ...entry.data,
          },
        });
      });
    }
  });

  it("refuses after a failed invitation email still leaves the token", async () => {
    const clinic = await fresh(`${PREFIX}tok-failed`);
    const granted = await grantComplimentaryAccess({
      ...operatorInput(clinic.id),
      commercialPlan: "ESSENTIAL",
      duration: "SIX_MONTHS",
    });
    expect(granted.ok).toBe(true);
    const previousFromValue = process.env.AUTH_EMAIL_FROM;
    delete process.env.AUTH_EMAIL_FROM;
    try {
      const invited = await inviteFirstClinicAdministrator({
        clinicId: clinic.id,
        invitedByUserId: OPERATOR_ID,
        name: "Failed Delivery",
        email: `${EMAIL_PREFIX}failed@example.test`,
      });
      expect(invited).toMatchObject({
        ok: true,
        outcome: "INVITATION_SENT",
        delivered: false,
      });
    } finally {
      process.env.AUTH_EMAIL_FROM = previousFromValue;
    }
    expect(
      await db().accountToken.count({ where: { clinicId: clinic.id } })
    ).toBe(1);
    await db().clinicEntitlement.delete({ where: { clinicId: clinic.id } });
    await db().clinicComplimentaryAccessEvent.deleteMany({
      where: { clinicId: clinic.id },
    });
    expect(await canDiscardAssistedClinic(clinic.id)).toBe(false);
    expect(await discardAssistedClinic(clinic.id)).toEqual({
      ok: false,
      error: DISCARD_NOT_PRISTINE_MESSAGE,
    });
    expect(
      await db().accountToken.count({ where: { clinicId: clinic.id } })
    ).toBe(1);
  });

  it("refuses an entitlement, complimentary history, and a standard offer", async () => {
    await refuse(`${PREFIX}entitle`, async (clinicId) => {
      await db().clinicEntitlement.create({
        data: {
          clinicId,
          commercialPlan: "ESSENTIAL",
          billingStatus: "NOT_BILLED",
          entitlementStatus: "ACTIVE",
          commercialArrangement: "COMPLIMENTARY",
        },
      });
    });
    const history = await refuse(`${PREFIX}history`, async (clinicId) => {
      await db().clinicComplimentaryAccessEvent.create({
        data: {
          clinicId,
          actorUserId: OPERATOR_ID,
          kind: "GRANT",
          commercialPlan: "ESSENTIAL",
          indefinite: true,
          reason: "Kept for the record.",
        },
      });
    });
    expect(
      await db().clinicComplimentaryAccessEvent.count({
        where: { clinicId: history.id },
      })
    ).toBe(1);

    const grantedClinic = await fresh(`${PREFIX}grant`);
    expect(
      (
        await grantComplimentaryAccess({
          ...operatorInput(grantedClinic.id),
          commercialPlan: "PRACTICE",
          duration: "INDEFINITE",
        })
      ).ok
    ).toBe(true);
    expect(await discardAssistedClinic(grantedClinic.id)).toEqual({
      ok: false,
      error: DISCARD_NOT_PRISTINE_MESSAGE,
    });
    expect(
      await db().clinicEntitlement.findUnique({
        where: { clinicId: grantedClinic.id },
      })
    ).not.toBeNull();
    expect(
      await db().clinicComplimentaryAccessEvent.count({
        where: { clinicId: grantedClinic.id },
      })
    ).toBe(1);

    const offered = await fresh(`${PREFIX}offer`);
    expect(
      await prepareClinicCommercialOffer({
        clinicId: offered.id,
        commercialPlan: "PRACTICE",
        billingInterval: "MONTHLY",
      })
    ).toMatchObject({ ok: true });
    expect(await discardAssistedClinic(offered.id)).toEqual({
      ok: false,
      error: DISCARD_NOT_PRISTINE_MESSAGE,
    });
    expect(
      await db().clinicEntitlement.findUnique({
        where: { clinicId: offered.id },
      })
    ).toMatchObject({ billingStatus: "OFFER_PREPARED" });
  });

  it("refuses negotiated offers, billing, receipts, legal, downgrade, and notices", async () => {
    await refuse(`${PREFIX}negotiated`, async (clinicId) => {
      await db().clinicNegotiatedOffer.create({
        data: {
          clinicId,
          preparedByUserId: OPERATOR_ID,
          commercialPlan: "ESSENTIAL",
          billingInterval: "MONTHLY",
          amountCents: 4900,
          startMode: "CUSTOMER_INITIATED",
          commercialTerms: "A$49 per month until a later written change.",
          status: "WITHDRAWN",
          withdrawnAt: new Date("2026-10-05T00:00:00.000Z"),
        },
      });
    });
    await refuse(`${PREFIX}billing`, async (clinicId) => {
      await db().clinicBillingProfile.create({ data: { clinicId } });
    });
    await refuse(`${PREFIX}stripe`, async (clinicId) => {
      await db().stripeEventReceipt.create({
        data: {
          stripeEventId: `${PREFIX}evt-stripe`,
          eventType: "invoice.paid",
          clinicId,
        },
      });
    });
    await refuse(`${PREFIX}legal`, async (clinicId) => {
      await db().legalAcceptance.create({
        data: {
          clinicId,
          userId: MEMBER_ID,
          termsVersion: "2026-01",
          privacyVersionAcknowledged: "2026-01",
          source: "BILLING_CHECKOUT",
        },
      });
    });
    await refuse(`${PREFIX}downgrade`, async (clinicId) => {
      await db().clinicDowngradePreparation.create({
        data: {
          clinicId,
          targetPlan: "ESSENTIAL",
          status: "AWAITING_SELECTION",
        },
      });
    });
    await refuse(`${PREFIX}price`, async (clinicId) => {
      await db().billingPriceChange.create({
        data: {
          clinicId,
          stripeSubscriptionId: `${PREFIX}sub-price`,
          stripeSubscriptionItemId: `${PREFIX}si-price`,
          affectedLabel: "Practice",
          billingInterval: "MONTHLY",
          currentAmountCents: 14900,
          newAmountCents: 15900,
          effectiveAt: new Date("2026-12-01T00:00:00.000Z"),
          status: "SCHEDULED",
        },
      });
    });
    await refuse(`${PREFIX}notice`, async (clinicId) => {
      await db().billingNoticeDelivery.create({
        data: {
          clinicId,
          stripeSubscriptionId: `${PREFIX}sub-notice`,
          kind: "ANNUAL_RENEWAL_REMINDER",
          eventKey: `${PREFIX}notice`,
        },
      });
    });
  });

  it("refuses draft and published guide content", async () => {
    await refuse(`${PREFIX}draft`, async (clinicId) => {
      await db().practiceGuide.create({
        data: {
          clinicId,
          title: "Draft guide",
          publicSlug: "draft-guide",
          status: PracticeGuideStatus.DRAFT,
          serviceCategory: "DENTAL",
          contentRevisions: {
            create: {
              version: 0,
              status: GuideRevisionStatus.DRAFT,
              title: "Draft guide",
            },
          },
        },
      });
    });
    await refuse(`${PREFIX}published`, async (clinicId) => {
      const location = await db().clinicLocation.findFirstOrThrow({
        where: { clinicId },
      });
      const guide = await db().practiceGuide.create({
        data: {
          clinicId,
          title: "Published guide",
          publicSlug: "published-guide",
          status: PracticeGuideStatus.PUBLISHED,
          isEnabled: true,
          publishedAt: new Date("2026-10-05T00:00:00.000Z"),
          serviceCategory: "DENTAL",
          contentRevisions: {
            create: {
              version: 1,
              status: GuideRevisionStatus.PUBLISHED,
              title: "Published guide",
              publishedAt: new Date("2026-10-05T00:00:00.000Z"),
            },
          },
        },
        include: { contentRevisions: true },
      });
      await db().practiceGuidePlacement.create({
        data: {
          clinicId,
          locationId: location.id,
          practiceGuideId: guide.id,
          publishedPracticeGuideRevisionId: guide.contentRevisions[0]?.id,
          publicSlug: "published-guide",
          isEnabled: true,
        },
      });
    });
  });

  it("refuses edited branding, contact, emergency data, assets, and extra structure", async () => {
    await refuse(`${PREFIX}phone`, async (clinicId) => {
      await db().clinicProfile.update({
        where: { clinicId },
        data: { phone: "0400000000" },
      });
    });
    await refuse(`${PREFIX}emergency`, async (clinicId) => {
      await db().clinicProfile.update({
        where: { clinicId },
        data: { emergencyInstructions: "Call the practice." },
      });
    });
    await refuse(`${PREFIX}colour`, async (clinicId) => {
      await db().clinicProfile.update({
        where: { clinicId },
        data: { primaryColor: "#112233" },
      });
    });
    await refuse(`${PREFIX}logo`, async (clinicId) => {
      await db().clinicProfile.update({
        where: { clinicId },
        data: { logoUrl: `clinics/${clinicId}/branding/logo.png` },
      });
    });
    await refuse(`${PREFIX}favicon`, async (clinicId) => {
      await db().clinicSite.updateMany({
        where: { clinicId },
        data: { faviconUrl: `clinics/${clinicId}/branding/favicon.png` },
      });
    });
    await refuse(`${PREFIX}accent`, async (clinicId) => {
      await db().clinicSite.updateMany({
        where: { clinicId },
        data: { accentColor: "#445566" },
      });
    });
    await refuse(`${PREFIX}loc-mail`, async (clinicId) => {
      await db().clinicLocation.updateMany({
        where: { clinicId },
        data: { contactEmail: "care@example.test" },
      });
    });
    await refuse(`${PREFIX}loc-emerg`, async (clinicId) => {
      await db().clinicLocation.updateMany({
        where: { clinicId },
        data: { emergencyInstructions: "Attend emergency." },
      });
    });
    await refuse(`${PREFIX}extra-site`, async (clinicId) => {
      await db().clinicSite.create({
        data: {
          clinicId,
          name: "Dscd70 Clinic",
          slug: `${PREFIX}west-site`,
          displayName: "Dscd70 Clinic",
        },
      });
    });
    await refuse(`${PREFIX}extra-loc`, async (clinicId) => {
      const site = await db().clinicSite.findFirstOrThrow({
        where: { clinicId },
      });
      await db().clinicLocation.create({
        data: {
          clinicId,
          clinicSiteId: site.id,
          name: "West",
          slug: "west",
          displayName: "West",
        },
      });
    });
    await refuse(`${PREFIX}no-category`, async (clinicId) => {
      await db().clinicSiteServiceCategory.deleteMany({ where: { clinicId } });
    });
  });

  it("refuses a location redirect on either side of the site", async () => {
    const source = await fresh(`${PREFIX}redir-from`);
    const sourcePeer = await fresh(`${PREFIX}redir-from-p`);
    const sourceSite = await db().clinicSite.findFirstOrThrow({
      where: { clinicId: source.id },
    });
    const sourcePeerSite = await db().clinicSite.findFirstOrThrow({
      where: { clinicId: sourcePeer.id },
    });
    await db().clinicLocationRedirect.create({
      data: {
        sourceClinicSiteId: sourceSite.id,
        destinationClinicSiteId: sourcePeerSite.id,
        fromSlug: "west-end",
      },
    });
    expect(await discardAssistedClinic(source.id)).toEqual({
      ok: false,
      error: DISCARD_NOT_PRISTINE_MESSAGE,
    });
    expect(await discardAssistedClinic(sourcePeer.id)).toEqual({
      ok: false,
      error: DISCARD_NOT_PRISTINE_MESSAGE,
    });

    const destination = await fresh(`${PREFIX}redir-to`);
    const destinationPeer = await fresh(`${PREFIX}redir-to-p`);
    const destinationSite = await db().clinicSite.findFirstOrThrow({
      where: { clinicId: destination.id },
    });
    const destinationPeerSite = await db().clinicSite.findFirstOrThrow({
      where: { clinicId: destinationPeer.id },
    });
    await db().clinicLocationRedirect.create({
      data: {
        sourceClinicSiteId: destinationPeerSite.id,
        destinationClinicSiteId: destinationSite.id,
        fromSlug: "west-end",
      },
    });
    expect(await discardAssistedClinic(destination.id)).toEqual({
      ok: false,
      error: DISCARD_NOT_PRISTINE_MESSAGE,
    });
    expect(
      await db().clinicLocationRedirect.count({
        where: { destinationClinicSiteId: destinationSite.id },
      })
    ).toBe(1);
  });

  it("refuses a source or destination split and does not detach the pointer", async () => {
    const source = await fresh(`${PREFIX}split-src`);
    const sourceSite = await db().clinicSite.findFirstOrThrow({
      where: { clinicId: source.id },
    });
    const preparation = await db().clinicAccountSplitPreparation.create({
      data: {
        sourceClinicId: source.id,
        keptClinicSiteId: sourceSite.id,
        destinationPlan: "ESSENTIAL",
        destinationBillingInterval: "MONTHLY",
        preparedByUserId: OPERATOR_ID,
      },
    });
    expect(await discardAssistedClinic(source.id)).toEqual({
      ok: false,
      error: DISCARD_NOT_PRISTINE_MESSAGE,
    });
    expect(
      await db().clinicAccountSplitPreparation.findUnique({
        where: { id: preparation.id },
      })
    ).not.toBeNull();

    const destination = await fresh(`${PREFIX}split-dst`);
    const anchor = await fresh(`${PREFIX}split-anchor`);
    const anchorSite = await db().clinicSite.findFirstOrThrow({
      where: { clinicId: anchor.id },
    });
    const pointed = await db().clinicAccountSplitPreparation.create({
      data: {
        sourceClinicId: anchor.id,
        keptClinicSiteId: anchorSite.id,
        destinationClinicId: destination.id,
        destinationPlan: "GROUP",
        destinationBillingInterval: "YEARLY",
        operationKind: "SITE_TO_EXISTING_GROUP",
        preparedByUserId: OPERATOR_ID,
      },
    });
    expect(await discardAssistedClinic(destination.id)).toEqual({
      ok: false,
      error: DISCARD_NOT_PRISTINE_MESSAGE,
    });
    expect(
      await db().clinicAccountSplitPreparation.findUnique({
        where: { id: pointed.id },
      })
    ).toMatchObject({ destinationClinicId: destination.id });
  });

  it("cannot start a split from or onto a pristine clinic", async () => {
    const clinic = await fresh(`${PREFIX}split-none`);
    const site = await db().clinicSite.findFirstOrThrow({
      where: { clinicId: clinic.id },
      include: { locations: true },
    });
    const location = site.locations[0];
    expect(
      supportedAccountSplitAction({
        commercialPlan: null,
        activeClinicSiteCount: 1,
      }).available
    ).toBe(false);
    expect(
      locationMoveEligibility({
        commercialPlan: null,
        sourceSite: { id: site.id, clinicId: clinic.id, active: site.active },
        location: location
          ? {
              id: location.id,
              clinicId: clinic.id,
              clinicSiteId: site.id,
              active: location.active,
              servesSiteRoot: location.servesSiteRoot,
              slug: location.slug,
            }
          : null,
        rootLocation: location
          ? {
              id: location.id,
              active: location.active,
              servesSiteRoot: location.servesSiteRoot,
            }
          : null,
      })?.code
    ).toBe("source_plan_mismatch");
    await expect(
      createAccountSplitPreparation({
        sourceClinicId: clinic.id,
        keptClinicSiteId: site.id,
        destinationPlan: "ESSENTIAL",
        destinationBillingInterval: "MONTHLY",
        operatorUserId: OPERATOR_ID,
      })
    ).rejects.toThrow(/no split/i);
    expect(
      await db().clinicAccountSplitPreparation.count({
        where: { sourceClinicId: clinic.id },
      })
    ).toBe(0);

    const anchor = await fresh(`${PREFIX}split-pick`);
    const anchorSite = await db().clinicSite.findFirstOrThrow({
      where: { clinicId: anchor.id },
    });
    const open = await db().clinicAccountSplitPreparation.create({
      data: {
        sourceClinicId: anchor.id,
        keptClinicSiteId: anchorSite.id,
        destinationPlan: "GROUP",
        destinationBillingInterval: "MONTHLY",
        operationKind: "SITE_TO_EXISTING_GROUP",
        preparedByUserId: OPERATOR_ID,
      },
    });
    await expect(
      selectExistingGroupDestination({
        preparationId: open.id,
        destinationClinicId: clinic.id,
      })
    ).rejects.toThrow(/Group/);
    expect(
      await db().clinicAccountSplitPreparation.findUnique({
        where: { id: open.id },
      })
    ).toMatchObject({ destinationClinicId: null });
    expect(await canDiscardAssistedClinic(clinic.id)).toBe(true);
  });

  it("serializes an invitation against discard and creates no token", async () => {
    const early = await fresh(`${PREFIX}invite-early`);
    const denied = await inviteFirstClinicAdministrator({
      clinicId: early.id,
      invitedByUserId: OPERATOR_ID,
      name: "Too Early",
      email: `${EMAIL_PREFIX}early@example.test`,
    });
    expect(denied).toEqual({
      ok: false,
      code: "commercial_setup_required",
      error: COMMERCIAL_SETUP_REQUIRED_MESSAGE,
    });
    expect(
      await db().accountToken.count({ where: { clinicId: early.id } })
    ).toBe(0);
    expect(await discardAssistedClinic(early.id)).toEqual({ ok: true });

    const clinic = await fresh(`${PREFIX}invite-race`);
    const release = deferred();
    const holding = deferred();
    const discarded = discardAssistedClinic(clinic.id, {
      timeoutMs: 20_000,
      afterLocks: async () => {
        holding.resolve();
        await release.promise;
      },
    });
    await holding.promise;
    const invited = inviteFirstClinicAdministrator({
      clinicId: clinic.id,
      invitedByUserId: OPERATOR_ID,
      name: "Racing Admin",
      email: `${EMAIL_PREFIX}racing@example.test`,
    });
    await waitForLock(clinicAccountStructureLockKey(clinic.id));
    release.resolve();
    expect(await discarded).toEqual({ ok: true });
    expect(await invited).toMatchObject({
      ok: false,
      code: "clinic_not_found",
    });
    expect(
      await db().user.findUnique({
        where: { email: `${EMAIL_PREFIX}racing@example.test` },
      })
    ).toBeNull();
    expect(
      await db().accountToken.count({ where: { clinicId: clinic.id } })
    ).toBe(0);
  });

  it("lets a grant or a discard win, and never both", async () => {
    const raced = await fresh(`${PREFIX}grant-race`);
    const [discarded, granted] = await Promise.all([
      discardAssistedClinic(raced.id),
      grantComplimentaryAccess({
        ...operatorInput(raced.id),
        commercialPlan: "ESSENTIAL",
        duration: "TWELVE_MONTHS",
      }),
    ]);
    expect(discarded.ok && granted.ok).toBe(false);
    if (discarded.ok) {
      expect(
        await db().clinic.findUnique({ where: { id: raced.id } })
      ).toBeNull();
      expect(granted.ok).toBe(false);
    } else {
      expect(granted.ok).toBe(true);
      expect(
        await db().clinicComplimentaryAccessEvent.count({
          where: { clinicId: raced.id },
        })
      ).toBe(1);
    }

    const held = await fresh(`${PREFIX}grant-hold`);
    const release = deferred();
    const holding = deferred();
    const discardHeld = discardAssistedClinic(held.id, {
      timeoutMs: 20_000,
      afterLocks: async () => {
        holding.resolve();
        await release.promise;
      },
    });
    await holding.promise;
    const grantHeld = grantComplimentaryAccess({
      ...operatorInput(held.id),
      commercialPlan: "ESSENTIAL",
      duration: "SIX_MONTHS",
    });
    await waitForLock(clinicAccountStructureLockKey(held.id));
    expect(
      await db().clinicEntitlement.findUnique({ where: { clinicId: held.id } })
    ).toBeNull();
    release.resolve();
    expect(await discardHeld).toEqual({ ok: true });
    expect((await grantHeld).ok).toBe(false);
    expect(
      await db().clinicComplimentaryAccessEvent.count({
        where: { clinicId: held.id },
      })
    ).toBe(0);

    const offered = await fresh(`${PREFIX}offer-hold`);
    const offerRelease = deferred();
    const offerHolding = deferred();
    const offerDiscard = discardAssistedClinic(offered.id, {
      timeoutMs: 20_000,
      afterLocks: async () => {
        offerHolding.resolve();
        await offerRelease.promise;
      },
    });
    await offerHolding.promise;
    const offer = prepareClinicCommercialOffer({
      clinicId: offered.id,
      commercialPlan: "ESSENTIAL",
      billingInterval: "YEARLY",
    }).catch((error: unknown) => error);
    await waitForLock(clinicAccountStructureLockKey(offered.id));
    offerRelease.resolve();
    expect(await offerDiscard).toEqual({ ok: true });
    const offerResult = await offer;
    expect(offerResult).not.toMatchObject({ ok: true });
    expect(
      await db().clinic.findUnique({ where: { id: offered.id } })
    ).toBeNull();
  });

  it("serializes split preparation so discard cannot remove a committed row", async () => {
    const blocked = await fresh(`${PREFIX}split-wait`);
    const blockedSite = await db().clinicSite.findFirstOrThrow({
      where: { clinicId: blocked.id },
    });
    const release = deferred();
    const holding = deferred();
    const holder = db().$transaction(
      async (tx) => {
        await lockAccountSplit(tx, blocked.id);
        const created = await tx.clinicAccountSplitPreparation.create({
          data: {
            sourceClinicId: blocked.id,
            keptClinicSiteId: blockedSite.id,
            destinationPlan: "ESSENTIAL",
            destinationBillingInterval: "MONTHLY",
            preparedByUserId: OPERATOR_ID,
          },
          select: { id: true },
        });
        holding.resolve();
        await release.promise;
        return created;
      },
      { maxWait: 10_000, timeout: 20_000 }
    );
    await holding.promise;
    const discarded = discardAssistedClinic(blocked.id, {
      timeoutMs: 20_000,
      maxWaitMs: 10_000,
    });
    await waitForLock(accountSplitLockKey(blocked.id));
    release.resolve();
    const created = await holder;
    expect(await discarded).toEqual({
      ok: false,
      error: DISCARD_NOT_PRISTINE_MESSAGE,
    });
    expect(
      await db().clinicAccountSplitPreparation.findUnique({
        where: { id: created.id },
      })
    ).not.toBeNull();
    expect(
      await db().clinic.findUnique({ where: { id: blocked.id } })
    ).not.toBeNull();

    const winner = await fresh(`${PREFIX}split-lose`);
    const winnerSite = await db().clinicSite.findFirstOrThrow({
      where: { clinicId: winner.id },
    });
    const discardRelease = deferred();
    const discardHolding = deferred();
    const discardWinner = discardAssistedClinic(winner.id, {
      timeoutMs: 20_000,
      afterLocks: async () => {
        discardHolding.resolve();
        await discardRelease.promise;
      },
    });
    await discardHolding.promise;
    const inserter = db().$transaction(
      async (tx) => {
        await lockAccountSplit(tx, winner.id);
        await tx.clinicAccountSplitPreparation.create({
          data: {
            sourceClinicId: winner.id,
            keptClinicSiteId: winnerSite.id,
            destinationPlan: "ESSENTIAL",
            destinationBillingInterval: "MONTHLY",
            preparedByUserId: OPERATOR_ID,
          },
        });
      },
      { maxWait: 10_000, timeout: 20_000 }
    );
    await waitForLock(accountSplitLockKey(winner.id));
    discardRelease.resolve();
    expect(await discardWinner).toEqual({ ok: true });
    await expect(inserter).rejects.toThrow();
    expect(
      await db().clinic.findUnique({ where: { id: winner.id } })
    ).toBeNull();
    expect(
      await db().clinicAccountSplitPreparation.count({
        where: { sourceClinicId: winner.id },
      })
    ).toBe(0);
  });

  it("rolls back the whole delete when a foreign key still points at the site", async () => {
    const clinic = await fresh(`${PREFIX}fk`);
    const peer = await fresh(`${PREFIX}fk-peer`);
    const site = await db().clinicSite.findFirstOrThrow({
      where: { clinicId: clinic.id },
    });
    const peerSite = await db().clinicSite.findFirstOrThrow({
      where: { clinicId: peer.id },
    });
    const profileId = clinic.id;
    expect(
      await discardAssistedClinic(clinic.id, {
        beforeDelete: async (tx) => {
          await tx.clinicLocationRedirect.create({
            data: {
              sourceClinicSiteId: peerSite.id,
              destinationClinicSiteId: site.id,
              fromSlug: "west-end",
            },
          });
        },
      })
    ).toEqual({ ok: false, error: DISCARD_NOT_PRISTINE_MESSAGE });
    expect(
      await db().clinic.findUnique({ where: { id: clinic.id } })
    ).not.toBeNull();
    expect(
      await db().clinicProfile.findUnique({ where: { clinicId: profileId } })
    ).not.toBeNull();
    expect(
      await db().clinicSite.findUnique({ where: { id: site.id } })
    ).not.toBeNull();
    expect(
      await db().clinicLocation.count({ where: { clinicId: clinic.id } })
    ).toBe(1);
    expect(
      await db().clinicSiteServiceCategory.count({
        where: { clinicId: clinic.id },
      })
    ).toBeGreaterThan(0);
    expect(
      await db().clinicLocationRedirect.count({
        where: {
          OR: [
            { sourceClinicSiteId: { in: [site.id, peerSite.id] } },
            { destinationClinicSiteId: { in: [site.id, peerSite.id] } },
          ],
        },
      })
    ).toBe(0);
  });
});
