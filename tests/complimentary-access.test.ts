import "dotenv/config";

import {
  BillingStatus,
  ClinicMembershipRole,
  EntitlementStatus,
  PlatformRole,
  PracticeGuideStatus,
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  extendComplimentaryAccess,
  grantComplimentaryAccess,
  loadComplimentaryAccessView,
  persistExpiredComplimentaryAccess,
} from "@/lib/billing/complimentary-access";
import { addUtcMonths } from "@/lib/billing/complimentary-term";
import { readClinicBillingAccess } from "@/lib/billing/activation-gate";
import { publishedPatientGuidesRemainPublic } from "@/lib/billing/public-guide-access";
import { reserveTeamPlace } from "@/lib/entitlements/capacity";
import { loadGuideAllowance } from "@/lib/entitlements/guide-usage";
import {
  ESSENTIAL_COMBINED_GUIDE_LIMIT,
  ESSENTIAL_CUSTOM_GUIDE_LIMIT,
  ESSENTIAL_TEAM_MEMBER_LIMIT,
  ESSENTIAL_TEMPLATE_ADAPTATION_LIMIT,
  PRACTICE_TEAM_MEMBER_LIMIT,
} from "@/lib/entitlements/plan-policy";
import { loadTeamAllowance } from "@/lib/entitlements/team-usage";
import { getPrisma } from "@/lib/prisma";

const prisma = getPrisma();
const PREFIX = "test_comp_collab_";
const NOW = new Date("2026-10-04T00:00:00.000Z");

function id(label: string) {
  return `${PREFIX}${label}`;
}

function operatorInput(
  clinicId: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    actorUserId: id("operator"),
    actorPlatformRole: PlatformRole.OPERATOR,
    clinicId,
    duration: "SIX_MONTHS",
    reason: "Teaching collaboration",
    now: NOW,
    ...overrides,
  };
}

async function cleanup() {
  await prisma.clinicAccountSplitPreparation.deleteMany({
    where: {
      OR: [
        { sourceClinicId: { startsWith: PREFIX } },
        { destinationClinicId: { startsWith: PREFIX } },
      ],
    },
  });
  await prisma.clinic.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

async function createClinic(label: string) {
  return prisma.clinic.create({
    data: { id: id(label), name: label, slug: `comp-${label}` },
  });
}

async function createOperator() {
  await prisma.user.create({
    data: {
      id: id("operator"),
      email: `${id("operator")}@example.test`,
      name: "River Operator",
      platformRole: PlatformRole.OPERATOR,
    },
  });
}

describe("complimentary access", () => {
  beforeAll(async () => {
    await cleanup();
    await createOperator();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("refuses a grant from anyone who is not a platform operator", async () => {
    const clinic = await createClinic("auth");
    const staff = await prisma.user.create({
      data: {
        id: id("staff"),
        email: `${id("staff")}@example.test`,
        name: "Staff",
        platformRole: PlatformRole.NONE,
      },
    });
    const denied = await grantComplimentaryAccess({
      ...operatorInput(clinic.id),
      actorUserId: staff.id,
      actorPlatformRole: PlatformRole.NONE,
      commercialPlan: "ESSENTIAL",
    });
    expect(denied).toEqual({
      ok: false,
      error: "Only a platform operator can change complimentary access.",
    });
    expect(
      await prisma.clinicEntitlement.findUnique({
        where: { clinicId: clinic.id },
      })
    ).toBeNull();
  });

  it("grants Essential and Practice for six months, 12 months, custom, and indefinite terms", async () => {
    const essential = await createClinic("essential");
    const six = await grantComplimentaryAccess({
      ...operatorInput(essential.id),
      commercialPlan: "ESSENTIAL",
      duration: "SIX_MONTHS",
      reviewDate: "2027-03-01",
    });
    expect(six).toMatchObject({
      ok: true,
      commercialPlan: "ESSENTIAL",
      indefinite: false,
      expiresAt: addUtcMonths(NOW, 6),
    });

    const practice = await createClinic("practice");
    const twelve = await grantComplimentaryAccess({
      ...operatorInput(practice.id),
      commercialPlan: "PRACTICE",
      duration: "TWELVE_MONTHS",
    });
    expect(twelve).toMatchObject({
      ok: true,
      commercialPlan: "PRACTICE",
      expiresAt: addUtcMonths(NOW, 12),
    });

    const customClinic = await createClinic("custom");
    const custom = await grantComplimentaryAccess({
      ...operatorInput(customClinic.id),
      commercialPlan: "ESSENTIAL",
      duration: "CUSTOM",
      customEndDate: "2027-06-15",
    });
    expect(custom).toMatchObject({
      ok: true,
      expiresAt: new Date("2027-06-15T13:59:59.999Z"),
    });

    const open = await createClinic("indefinite");
    const indefinite = await grantComplimentaryAccess({
      ...operatorInput(open.id),
      commercialPlan: "PRACTICE",
      duration: "INDEFINITE",
    });
    expect(indefinite).toMatchObject({
      ok: true,
      indefinite: true,
      expiresAt: null,
    });

    const row = await prisma.clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: essential.id },
    });
    expect(row).toMatchObject({
      commercialArrangement: "COMPLIMENTARY",
      billingStatus: BillingStatus.NOT_BILLED,
      entitlementStatus: EntitlementStatus.ACTIVE,
      billingInterval: null,
      stripePriceId: null,
      paidThrough: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      subscriptionEndedAt: null,
      publicGuideRetentionUntil: null,
      siteAllowance: 1,
      locationAllowance: 1,
      purchasedAdditionalLocationQuantity: null,
      purchasedAdditionalSiteQuantity: null,
    });
    expect(row.commercialReviewAt?.toISOString()).toBe(
      "2027-03-01T01:00:00.000Z"
    );
    const practiceAllowance = await loadTeamAllowance(practice.id, NOW);
    expect(practiceAllowance.baseLimit).toBe(PRACTICE_TEAM_MEMBER_LIMIT);
    const essentialGuides = await loadGuideAllowance(essential.id);
    expect(essentialGuides).toMatchObject({
      governed: true,
      commercialPlan: "ESSENTIAL",
      customGuides: { baseLimit: ESSENTIAL_CUSTOM_GUIDE_LIMIT },
      adaptedTemplates: { baseLimit: ESSENTIAL_TEMPLATE_ADAPTATION_LIMIT },
      combinedGuides: { baseLimit: ESSENTIAL_COMBINED_GUIDE_LIMIT },
    });
  });

  it("enforces the Essential team limit and leaves a clinic without an entitlement unrestricted", async () => {
    const clinic = await createClinic("limits");
    await grantComplimentaryAccess({
      ...operatorInput(clinic.id),
      commercialPlan: "ESSENTIAL",
    });
    await prisma.user.createMany({
      data: [1, 2].map((number) => ({
        id: id(`member${number}`),
        email: `${id(`member${number}`)}@example.test`,
        name: `Member ${number}`,
      })),
    });
    await prisma.clinicMembership.createMany({
      data: [1, 2].map((number) => ({
        clinicId: clinic.id,
        userId: id(`member${number}`),
        role: ClinicMembershipRole.STAFF,
      })),
    });
    const blocked = await prisma.$transaction((tx) =>
      reserveTeamPlace(tx, { clinicId: clinic.id, now: NOW })
    );
    expect(blocked.ok).toBe(false);
    const allowance = await loadTeamAllowance(clinic.id, NOW);
    expect(allowance).toMatchObject({
      governed: true,
      baseLimit: ESSENTIAL_TEAM_MEMBER_LIMIT,
      atLimit: true,
    });

    const legacy = await createClinic("legacy");
    const open = await prisma.$transaction((tx) =>
      reserveTeamPlace(tx, { clinicId: legacy.id, now: NOW })
    );
    expect(open).toEqual({ ok: true });
    const access = await readClinicBillingAccess({
      clinic: { id: legacy.id, name: "Legacy" },
    });
    expect(access).toMatchObject({ kind: "allow", reason: "legacy" });
    const view = await loadComplimentaryAccessView(legacy.id, NOW);
    expect(view?.mode).toBe("grant");
    expect(
      await prisma.clinicEntitlement.findUnique({
        where: { clinicId: legacy.id },
      })
    ).toBeNull();
  });

  it("extends before and after expiry and keeps the clinic, guide, membership, and branding", async () => {
    const clinic = await createClinic("extend");
    const site = await prisma.clinicSite.create({
      data: {
        clinicId: clinic.id,
        name: "Main",
        slug: "comp-extend-site",
        displayName: "Main",
        primaryColor: "#112233",
        isPrimary: true,
      },
    });
    const member = await prisma.user.create({
      data: {
        id: id("extend-admin"),
        email: `${id("extend-admin")}@example.test`,
        name: "Admin",
      },
    });
    const membership = await prisma.clinicMembership.create({
      data: {
        clinicId: clinic.id,
        userId: member.id,
        role: ClinicMembershipRole.ADMIN,
      },
    });
    const guide = await prisma.practiceGuide.create({
      data: {
        clinicId: clinic.id,
        title: "After extraction",
        publicSlug: "after-extraction",
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
        publishedAt: NOW,
      },
    });
    const granted = await grantComplimentaryAccess({
      ...operatorInput(clinic.id),
      commercialPlan: "ESSENTIAL",
    });
    expect(granted.ok).toBe(true);
    const before = await extendComplimentaryAccess({
      ...operatorInput(clinic.id),
      duration: "SIX_MONTHS",
      reason: "Semester continues",
    });
    expect(before).toMatchObject({
      ok: true,
      commercialPlan: "ESSENTIAL",
      expiresAt: addUtcMonths(addUtcMonths(NOW, 6), 6),
    });

    await prisma.clinicEntitlement.update({
      where: { clinicId: clinic.id },
      data: {
        complimentaryExpiresAt: new Date("2026-01-01T00:00:00.000Z"),
        entitlementStatus: EntitlementStatus.ACTIVE,
      },
    });
    await persistExpiredComplimentaryAccess(clinic.id, NOW);
    const expiredAccess = await readClinicBillingAccess({
      clinic: { id: clinic.id, name: "Extend" },
    });
    expect(expiredAccess).toMatchObject({
      kind: "billing_required",
      reason: "not_active",
      href: "/account/billing",
      billingHref: "/account/billing",
    });
    expect(await publishedPatientGuidesRemainPublic(clinic.id, NOW)).toBe(true);
    const expiredRow = await prisma.clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: clinic.id },
    });
    expect(expiredRow.entitlementStatus).toBe(EntitlementStatus.ENDED);
    expect(expiredRow.billingStatus).toBe(BillingStatus.NOT_BILLED);
    expect(expiredRow.publicGuideRetentionUntil).toBeNull();
    expect(expiredRow.subscriptionEndedAt).toBeNull();

    const after = await extendComplimentaryAccess({
      ...operatorInput(clinic.id),
      duration: "SIX_MONTHS",
      reason: "Collaboration renewed",
      reviewDate: "2027-03-01",
    });
    expect(after).toMatchObject({
      ok: true,
      expiresAt: addUtcMonths(NOW, 6),
    });
    const restored = await prisma.clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: clinic.id },
    });
    expect(restored.entitlementStatus).toBe(EntitlementStatus.ACTIVE);
    expect(restored.commercialPlan).toBe("ESSENTIAL");
    expect(
      await prisma.clinic.findUnique({
        where: { id: clinic.id },
        select: { id: true },
      })
    ).toEqual({ id: clinic.id });
    expect(
      await prisma.clinicSite.findUnique({
        where: { id: site.id },
        select: { primaryColor: true, clinicId: true },
      })
    ).toEqual({ primaryColor: "#112233", clinicId: clinic.id });
    expect(
      await prisma.clinicMembership.findUnique({
        where: { id: membership.id },
        select: { userId: true, role: true, active: true },
      })
    ).toEqual({
      userId: member.id,
      role: ClinicMembershipRole.ADMIN,
      active: true,
    });
    expect(
      await prisma.practiceGuide.findUnique({
        where: { id: guide.id },
        select: { status: true, publicSlug: true, clinicId: true },
      })
    ).toEqual({
      status: PracticeGuideStatus.PUBLISHED,
      publicSlug: "after-extraction",
      clinicId: clinic.id,
    });

    const again = await extendComplimentaryAccess({
      ...operatorInput(clinic.id),
      duration: "TWELVE_MONTHS",
      reason: "Second extension",
    });
    expect(again).toMatchObject({
      ok: true,
      expiresAt: addUtcMonths(addUtcMonths(NOW, 6), 12),
    });
    const view = await loadComplimentaryAccessView(clinic.id, NOW);
    expect(view?.events.map((event) => event.kindLabel)).toEqual([
      "Grant",
      "Extension",
      "Extension",
      "Extension",
    ]);
    expect(view?.events[0]).toMatchObject({
      actorLabel: "River Operator",
      previousExpiryLabel: "None",
      reason: "Teaching collaboration",
    });
    expect(view?.events[3]?.reason).toBe("Second extension");
    expect(
      view?.events.every((event) => event.actorLabel === "River Operator")
    ).toBe(true);

    const indefinite = await extendComplimentaryAccess({
      ...operatorInput(clinic.id),
      duration: "INDEFINITE",
      reason: "Open collaboration",
    });
    expect(indefinite).toMatchObject({ ok: true, indefinite: true });
    const dated = await extendComplimentaryAccess({
      ...operatorInput(clinic.id),
      duration: "SIX_MONTHS",
      reason: "Should stay open",
    });
    expect(dated.ok).toBe(false);
    const noted = await extendComplimentaryAccess({
      ...operatorInput(clinic.id),
      duration: "INDEFINITE",
      reason: "Still open",
    });
    expect(noted.ok).toBe(true);
    const history = await prisma.clinicComplimentaryAccessEvent.findMany({
      where: { clinicId: clinic.id },
      orderBy: { createdAt: "asc" },
    });
    const last = history.at(-1);
    expect(last).toMatchObject({
      actorUserId: id("operator"),
      kind: "EXTENSION",
      previousIndefinite: true,
      indefinite: true,
      reason: "Still open",
    });
  });

  it("serializes concurrent grants and stacks concurrent extensions", async () => {
    const clinic = await createClinic("concurrent");
    const grants = await Promise.all([
      grantComplimentaryAccess({
        ...operatorInput(clinic.id),
        commercialPlan: "ESSENTIAL",
        reason: "First grant",
      }),
      grantComplimentaryAccess({
        ...operatorInput(clinic.id),
        commercialPlan: "PRACTICE",
        reason: "Second grant",
      }),
    ]);
    const succeeded = grants.filter((result) => result.ok);
    const refused = grants.filter((result) => !result.ok);
    expect(succeeded).toHaveLength(1);
    expect(refused).toEqual([
      {
        ok: false,
        error:
          "This clinic already has complimentary access. Extend that agreement.",
      },
    ]);
    const extensions = await Promise.all([
      extendComplimentaryAccess({
        ...operatorInput(clinic.id),
        reason: "Parallel one",
      }),
      extendComplimentaryAccess({
        ...operatorInput(clinic.id),
        reason: "Parallel two",
      }),
    ]);
    expect(extensions.every((result) => result.ok)).toBe(true);
    const row = await prisma.clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: clinic.id },
    });
    expect(row.commercialArrangement).toBe("COMPLIMENTARY");
    expect(row.complimentaryExpiresAt?.toISOString()).toBe(
      addUtcMonths(addUtcMonths(addUtcMonths(NOW, 6), 6), 6).toISOString()
    );
    expect(
      await prisma.clinicComplimentaryAccessEvent.count({
        where: { clinicId: clinic.id, kind: "EXTENSION" },
      })
    ).toBe(2);
  });

  it("leaves a paid subscription unchanged and refuses checkout, splits, and active paid access", async () => {
    const paid = await createClinic("paid");
    await prisma.clinicBillingProfile.create({
      data: {
        clinicId: paid.id,
        stripeCustomerId: id("cus-paid"),
        stripeSubscriptionId: id("sub-paid"),
      },
    });
    await prisma.clinicEntitlement.create({
      data: {
        clinicId: paid.id,
        commercialPlan: "PRACTICE",
        billingInterval: "YEARLY",
        billingStatus: BillingStatus.ACTIVE,
        entitlementStatus: EntitlementStatus.ACTIVE,
        stripePriceId: "price_test_practice_yearly",
        siteAllowance: 1,
        locationAllowance: 4,
        extraTeamMemberAllowance: 1,
      },
    });
    const before = await prisma.clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: paid.id },
    });
    const refused = await grantComplimentaryAccess({
      ...operatorInput(paid.id),
      commercialPlan: "ESSENTIAL",
    });
    expect(refused).toEqual({
      ok: false,
      error: "This clinic has a paid Stripe subscription.",
    });
    const after = await prisma.clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: paid.id },
    });
    expect(after).toEqual(before);
    expect(
      await prisma.clinicBillingProfile.findUnique({
        where: { clinicId: paid.id },
        select: { stripeSubscriptionId: true },
      })
    ).toEqual({ stripeSubscriptionId: id("sub-paid") });

    const checkout = await createClinic("checkout");
    await prisma.clinicBillingProfile.create({
      data: {
        clinicId: checkout.id,
        stripeCheckoutSessionId: id("cs-open"),
      },
    });
    await prisma.clinicEntitlement.create({
      data: {
        clinicId: checkout.id,
        commercialPlan: "ESSENTIAL",
        billingInterval: "MONTHLY",
        billingStatus: BillingStatus.OFFER_PREPARED,
        entitlementStatus: EntitlementStatus.PENDING,
      },
    });
    expect(
      await grantComplimentaryAccess({
        ...operatorInput(checkout.id),
        commercialPlan: "ESSENTIAL",
      })
    ).toEqual({ ok: false, error: "Checkout is in progress for this clinic." });

    const source = await createClinic("split-source");
    const destination = await createClinic("split-destination");
    const site = await prisma.clinicSite.create({
      data: {
        clinicId: source.id,
        name: "Kept",
        slug: "comp-split-site",
        displayName: "Kept",
        isPrimary: true,
      },
    });
    await prisma.clinicAccountSplitPreparation.create({
      data: {
        sourceClinicId: source.id,
        destinationClinicId: destination.id,
        keptClinicSiteId: site.id,
        destinationPlan: "ESSENTIAL",
        destinationBillingInterval: "MONTHLY",
        preparedByUserId: id("operator"),
        status: "DRAFT",
      },
    });
    const splitError = {
      ok: false,
      error:
        "An account split is open for this clinic. Finish or cancel it before changing complimentary access.",
    };
    expect(
      await grantComplimentaryAccess({
        ...operatorInput(source.id),
        commercialPlan: "ESSENTIAL",
      })
    ).toEqual(splitError);
    expect(
      await grantComplimentaryAccess({
        ...operatorInput(destination.id),
        commercialPlan: "PRACTICE",
      })
    ).toEqual(splitError);

    const ended = await createClinic("ended-paid");
    await prisma.clinicBillingProfile.create({
      data: {
        clinicId: ended.id,
        stripeCustomerId: id("cus-ended"),
        stripeSubscriptionId: id("sub-ended"),
      },
    });
    await prisma.clinicEntitlement.create({
      data: {
        clinicId: ended.id,
        commercialPlan: "ESSENTIAL",
        billingStatus: BillingStatus.ENDED,
        entitlementStatus: EntitlementStatus.ENDED,
        extraTeamMemberAllowance: 2,
        offeredAdditionalSiteQuantity: 3,
      },
    });
    const replaced = await grantComplimentaryAccess({
      ...operatorInput(ended.id),
      commercialPlan: "PRACTICE",
      duration: "INDEFINITE",
    });
    expect(replaced.ok).toBe(true);
    const replacedRow = await prisma.clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: ended.id },
    });
    expect(replacedRow).toMatchObject({
      commercialPlan: "PRACTICE",
      commercialArrangement: "COMPLIMENTARY",
      billingStatus: BillingStatus.NOT_BILLED,
      entitlementStatus: EntitlementStatus.ACTIVE,
      extraTeamMemberAllowance: 2,
      offeredAdditionalSiteQuantity: null,
      siteAllowance: 1,
      locationAllowance: 1,
    });
    expect(
      await prisma.clinicBillingProfile.findUnique({
        where: { clinicId: ended.id },
        select: { stripeSubscriptionId: true },
      })
    ).toEqual({ stripeSubscriptionId: id("sub-ended") });
  });
});
