import "dotenv/config";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { NextRequest } from "next/server";
import {
  AccountTokenType,
  BillingStatus,
  PlatformRole,
  PracticeGuideStatus,
  GuideRevisionStatus,
  type PrismaClient,
} from "@prisma/client";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import TenantLayout from "@/app/(aftercare)/%5Fsites/[tenant]/layout";
import OperatorClinicDetailPage from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/page";
import OperatorClinicsPage from "@/app/(staff)/(operator)/operator/clinics/page";
import ClinicTeamPage from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/team/page";
import { startOperatorClinicSupportAction } from "@/app/(staff)/(operator)/operator/support-actions";
import { RETIRED_TENANT_MESSAGE } from "@/lib/aftercare/retired-tenant-http";
import { createMemoryClinicAssetStorage } from "@/lib/clinic-assets/memory-clinic-asset-storage";
import type { ClinicAssetStorage } from "@/lib/clinic-assets/clinic-asset-storage";
import { serveClinicLogo } from "@/lib/clinic-assets/read-clinic-logo";
import { hashPassword } from "@/lib/auth/password";
import { createInvitationToken } from "@/lib/auth/account-token-service";
import { readOperatorSupportClinic } from "@/lib/auth/operator-support-clinic";
import { loadClinicAccess } from "@/lib/auth/clinic-authorization";
import { grantComplimentaryAccess } from "@/lib/billing/complimentary-access";
import { CLINIC_PERMANENTLY_DELETED_REACTIVATE_MESSAGE } from "@/lib/clinics/permanent-clinic-deletion";
import {
  canPermanentlyDeleteClinic,
  permanentlyDeleteClinic,
  PERMANENT_DELETION_MESSAGES,
  retryPermanentDeletionBrandingCleanup,
  type PermanentDeletionBlockerCode,
} from "@/lib/clinics/permanent-clinic-deletion";
import { RETIRED_TENANT_SLUG_MESSAGE } from "@/lib/clinics/retired-tenant-slug";
import {
  deactivateClinic,
  reactivateClinic,
} from "@/lib/clinics/clinic-deactivation";
import { createClinicSiteWithRootLocation } from "@/lib/clinics/site-location-mutations";
import type { CreateSiteInput } from "@/lib/clinics/site-location-schemas";
import { isLocalDevelopmentDatabase } from "@/lib/dev/database-target";
import { createOperatorClinic } from "@/lib/operator/create-operator-clinic";
import {
  DISCARD_NOT_PRISTINE_MESSAGE,
  discardAssistedClinic,
} from "@/lib/operator/discard-assisted-clinic";
import {
  listOperatorClinics,
  selectOperatorClinicActivity,
} from "@/lib/operator/list-operator-clinics";
import { getPrisma } from "@/lib/prisma";
import { proxy } from "@/proxy";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";

const PREFIX = "pdel-";
const OPERATOR_ID = "pdel_operator";
const cookieState = vi.hoisted(() => ({
  clinicId: "",
}));

vi.mock("next/navigation", async () => {
  const actual =
    await vi.importActual<typeof import("next/navigation")>("next/navigation");
  return {
    ...actual,
    useRouter: () => ({
      refresh: () => undefined,
      push: () => undefined,
      replace: () => undefined,
      back: () => undefined,
      prefetch: async () => undefined,
    }),
    usePathname: () => "/operator/clinics",
    useSearchParams: () => new URLSearchParams(),
  };
});

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "app.localhost:3000",
      "x-forwarded-proto": "http",
    }),
  cookies: async () => ({
    get: (name: string) =>
      name === "river_operator_support_clinic" && cookieState.clinicId
        ? { name, value: cookieState.clinicId }
        : undefined,
    set: () => undefined,
  }),
}));

vi.mock("@/lib/auth/session", () => {
  class MultipleClinicMembershipsError extends Error {
    constructor(userId: string, clinicIds: string[]) {
      super(
        `Expected exactly one effective clinic membership for user "${userId}" during MVP auth resolution, but found memberships for clinics: ${clinicIds.join(", ")}.`
      );
      this.name = "MultipleClinicMembershipsError";
    }
  }

  return {
    MultipleClinicMembershipsError,
    isPlatformOperator: (user: { platformRole?: string } | null | undefined) =>
      user?.platformRole === "OPERATOR",
    getCurrentUser: async () => ({
      id: OPERATOR_ID,
      email: "pdel-operator@example.com",
      name: "Pdel Operator",
      platformRole: "OPERATOR" as const,
    }),
    getAuthContext: async () => ({
      user: {
        id: OPERATOR_ID,
        email: "pdel-operator@example.com",
        name: "Pdel Operator",
        platformRole: "OPERATOR" as const,
      },
      clinicMembership: null,
    }),
    postLoginPath: () => "/dashboard",
  };
});

const local = isLocalDevelopmentDatabase(process.env.DATABASE_URL);
const describeDb = local ? describe : describe.skip;

function db(): PrismaClient {
  return getPrisma();
}

function memoryStorage(): ClinicAssetStorage {
  return createMemoryClinicAssetStorage();
}

async function expectNotFound(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    const digest = String((error as { digest?: string }).digest ?? "");
    expect(digest).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
    return;
  }
  throw new Error("expected not found");
}

async function cleanup(): Promise<void> {
  const prisma = db();
  const clinics = await prisma.clinic.findMany({
    where: { slug: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = clinics.map((clinic) => clinic.id);
  if (ids.length > 0) {
    await prisma.clinicLocationRedirect.deleteMany({
      where: {
        OR: [
          { sourceClinicSite: { clinicId: { in: ids } } },
          { destinationClinicSite: { clinicId: { in: ids } } },
        ],
      },
    });
    await prisma.clinicAccountSplitPreparation.deleteMany({
      where: {
        OR: [
          { sourceClinicId: { in: ids } },
          { destinationClinicId: { in: ids } },
        ],
      },
    });
    await prisma.retiredTenantSlug.deleteMany({
      where: { formerClinicId: { in: ids } },
    });
    await prisma.clinic.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.stripeEventReceipt.deleteMany({
    where: { stripeEventId: { startsWith: PREFIX } },
  });
  await prisma.user.deleteMany({
    where: {
      email: { startsWith: PREFIX },
      NOT: { id: OPERATOR_ID },
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
      name: "Pdel Operator",
      platformRole: PlatformRole.OPERATOR,
      passwordHash: hashPassword("pdel-operator-password"),
    },
  });
}

async function fresh(slug: string, name = "Pdel Clinic") {
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
}

async function siteId(clinicId: string): Promise<string> {
  const site = await db().clinicSite.findFirstOrThrow({
    where: { clinicId, isPrimary: true },
    select: { id: true },
  });
  return site.id;
}

async function expectStillOperational(clinicId: string): Promise<void> {
  const clinic = await db().clinic.findUniqueOrThrow({
    where: { id: clinicId },
    select: { permanentlyDeletedAt: true },
  });
  expect(clinic.permanentlyDeletedAt).toBeNull();
  expect(await db().clinicSite.count({ where: { clinicId } })).toBeGreaterThan(
    0
  );
  expect(
    await db().retiredTenantSlug.count({ where: { formerClinicId: clinicId } })
  ).toBe(0);
}

async function expectBlocked(
  clinicId: string,
  code: PermanentDeletionBlockerCode
): Promise<void> {
  const clinic = await db().clinic.findUniqueOrThrow({
    where: { id: clinicId },
    select: { name: true },
  });
  const eligibility = await canPermanentlyDeleteClinic(clinicId, {
    storage: memoryStorage(),
  });
  expect(eligibility.eligible).toBe(false);
  expect(eligibility.blockers.map((blocker) => blocker.code)).toContain(code);
  const result = await permanentlyDeleteClinic({
    clinicId,
    operatorUserId: OPERATOR_ID,
    confirmation: clinic.name,
    storage: memoryStorage(),
  });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.blockers.map((blocker) => blocker.code)).toContain(code);
    expect(result.error).toBe(PERMANENT_DELETION_MESSAGES[code]);
  }
  await expectStillOperational(clinicId);
}

describeDb("permanent clinic deletion", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  beforeAll(async () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    await ensureOperator();
  });

  beforeEach(async () => {
    cookieState.clinicId = "";
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await db().user.deleteMany({ where: { id: OPERATOR_ID } });
    await db().$disconnect();
    if (previousRoot === undefined) {
      delete process.env.CARE_GUIDE_ROOT_DOMAIN;
    } else {
      process.env.CARE_GUIDE_ROOT_DOMAIN = previousRoot;
    }
  });

  it("refuses an active clinic", async () => {
    const created = await fresh(`${PREFIX}active`, "Pdel Active");
    await expectBlocked(created.id, "active");
  });

  it("requires the clinic name before it retires anything", async () => {
    const created = await fresh(`${PREFIX}confirm`, "Pdel Confirm");
    await deactivate(created.id);
    const refused = await permanentlyDeleteClinic({
      clinicId: created.id,
      operatorUserId: OPERATOR_ID,
      confirmation: "not the clinic",
      storage: memoryStorage(),
    });
    expect(refused).toMatchObject({
      ok: false,
      error: PERMANENT_DELETION_MESSAGES.confirmation,
    });
    await expectStillOperational(created.id);
  });

  it("accepts the clinic display name and refuses a slug or site slug", async () => {
    const name = "Pdel Name Only";
    const slug = `${PREFIX}nameonly`;
    const siteSlug = `${PREFIX}nameonly-west`;
    const created = await fresh(slug, name);
    await db().clinicSite.create({
      data: {
        clinicId: created.id,
        name: "West",
        slug: siteSlug,
        displayName: "West",
        active: true,
        isPrimary: false,
      },
    });
    await db().clinicSite.updateMany({
      where: { clinicId: created.id, isPrimary: true },
      data: { displayName: "Test Clinic Prod" },
    });
    await deactivate(created.id);
    const eligibility = await canPermanentlyDeleteClinic(created.id, {
      storage: memoryStorage(),
    });
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.blockers).toEqual([]);

    for (const confirmation of [slug, siteSlug, name, "test clinic prod"]) {
      const refused = await permanentlyDeleteClinic({
        clinicId: created.id,
        operatorUserId: OPERATOR_ID,
        confirmation,
        storage: memoryStorage(),
      });
      expect(refused).toMatchObject({
        ok: false,
        error: PERMANENT_DELETION_MESSAGES.confirmation,
      });
      await expectStillOperational(created.id);
    }

    const deleted = await permanentlyDeleteClinic({
      clinicId: created.id,
      operatorUserId: OPERATOR_ID,
      confirmation: "  Test Clinic Prod  ",
      storage: memoryStorage(),
    });
    expect(deleted.ok).toBe(true);
  });

  it("refuses the designated demo clinic", async () => {
    const demo = await db().clinic.findFirst({
      where: {
        OR: [
          { id: "clinic_demo_rivers" },
          { slug: "demodental" },
          { sites: { some: { slug: "demodental" } } },
        ],
      },
      select: { id: true, name: true, permanentlyDeletedAt: true },
    });
    expect(demo).not.toBeNull();
    if (!demo) {
      return;
    }
    const result = await permanentlyDeleteClinic({
      clinicId: demo.id,
      operatorUserId: OPERATOR_ID,
      confirmation: demo.name,
      storage: memoryStorage(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.blockers.map((blocker) => blocker.code)).toContain("demo");
    }
    const after = await db().clinic.findUniqueOrThrow({
      where: { id: demo.id },
      select: { permanentlyDeletedAt: true },
    });
    expect(after.permanentlyDeletedAt).toEqual(demo.permanentlyDeletedAt);
  });

  it("retires an inactive clinic and keeps audit history", async () => {
    const name = "Pdel Harbour Dental";
    const slug = `${PREFIX}main`;
    const created = await fresh(slug, name);
    const clinicId = created.id;
    const templateIds = (
      await db().guideTemplate.findMany({ select: { id: true } })
    ).map((template) => template.id);
    const granted = await grantComplimentaryAccess({
      actorUserId: OPERATOR_ID,
      actorPlatformRole: PlatformRole.OPERATOR,
      clinicId,
      commercialPlan: "ESSENTIAL",
      duration: "SIX_MONTHS",
      reason: "Deletion retention fixture.",
      now: new Date("2026-10-01T00:00:00.000Z"),
    });
    expect(granted.ok).toBe(true);
    await db().clinicEntitlement.update({
      where: { clinicId },
      data: { billingStatus: BillingStatus.ENDED },
    });
    await db().clinicBillingProfile.create({
      data: {
        clinicId,
        stripeCustomerId: `${PREFIX}cus`,
        stripeSubscriptionId: `${PREFIX}sub-ended`,
      },
    });
    await db().clinicNegotiatedOffer.create({
      data: {
        clinicId,
        preparedByUserId: OPERATOR_ID,
        commercialPlan: "ESSENTIAL",
        billingInterval: "MONTHLY",
        amountCents: 4900,
        startMode: "CUSTOMER_INITIATED",
        commercialTerms: "Converted offer retained after deletion.",
        status: "CONVERTED",
        convertedAt: new Date("2026-10-02T00:00:00.000Z"),
      },
    });
    await db().billingPriceChange.create({
      data: {
        clinicId,
        stripeSubscriptionId: `${PREFIX}sub-ended`,
        stripeSubscriptionItemId: `${PREFIX}si`,
        affectedLabel: "Essential",
        billingInterval: "MONTHLY",
        currentAmountCents: 4900,
        newAmountCents: 5900,
        effectiveAt: new Date("2026-11-01T00:00:00.000Z"),
        status: "CANCELLED",
      },
    });
    await db().billingNoticeDelivery.create({
      data: {
        clinicId,
        stripeSubscriptionId: `${PREFIX}sub-ended`,
        kind: "ANNUAL_RENEWAL_REMINDER",
        eventKey: `${PREFIX}sent`,
        status: "SENT",
        sentAt: new Date("2026-10-02T00:00:00.000Z"),
      },
    });
    await db().stripeEventReceipt.create({
      data: {
        stripeEventId: `${PREFIX}evt-main`,
        eventType: "invoice.paid",
        clinicId,
        processingStatus: "PROCESSED",
      },
    });
    const member = await db().user.create({
      data: {
        email: `${PREFIX}member@example.com`,
        name: "Pdel Member",
        platformRole: PlatformRole.NONE,
        passwordHash: hashPassword("pdel-member-password"),
      },
    });
    await db().clinicMembership.create({
      data: { clinicId, userId: member.id, role: "ADMIN", active: true },
    });
    await db().legalAcceptance.create({
      data: {
        clinicId,
        userId: member.id,
        termsVersion: "2026-01",
        privacyVersionAcknowledged: "2026-01",
        source: "BILLING_CHECKOUT",
      },
    });
    const pending = await db().user.create({
      data: {
        email: `${PREFIX}invite@example.com`,
        name: "Pdel Invite",
        platformRole: PlatformRole.NONE,
      },
    });
    await createInvitationToken({
      userId: pending.id,
      clinicId,
      role: "STAFF",
      email: pending.email,
      invitedByUserId: OPERATOR_ID,
    });
    const reset = await db().accountToken.create({
      data: {
        type: AccountTokenType.PASSWORD_RESET,
        tokenHash: `${PREFIX}reset-hash`,
        userId: member.id,
        email: member.email,
        expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      },
    });
    const emailChange = await db().accountToken.create({
      data: {
        type: AccountTokenType.EMAIL_CHANGE,
        tokenHash: `${PREFIX}email-hash`,
        userId: member.id,
        email: `${PREFIX}next@example.com`,
        expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      },
    });
    const guide = await db().practiceGuide.create({
      data: {
        clinicId,
        title: "Extraction",
        publicSlug: `${PREFIX}guide`,
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
        serviceCategory: "DENTAL",
      },
    });
    const revision = await db().practiceGuideRevision.create({
      data: {
        practiceGuideId: guide.id,
        version: 1,
        status: GuideRevisionStatus.PUBLISHED,
        title: "Extraction",
      },
    });
    await db().practiceGuideRevisionSection.create({
      data: {
        revisionId: revision.id,
        key: "care",
        kind: "CUSTOM",
        title: "Care",
        body: "Rest.",
        sortOrder: 0,
        provenance: "PRACTICE_CUSTOM",
      },
    });
    const location = await db().clinicLocation.findFirstOrThrow({
      where: { clinicId, servesSiteRoot: true },
    });
    await db().practiceGuidePlacement.create({
      data: {
        practiceGuideId: guide.id,
        locationId: location.id,
        clinicId,
        publicSlug: `${PREFIX}guide`,
        isEnabled: true,
      },
    });
    const primary = await db().clinicSite.findFirstOrThrow({
      where: { clinicId, isPrimary: true },
    });
    await db().clinicSite.create({
      data: {
        clinicId,
        name: "West",
        slug: `${PREFIX}west`,
        displayName: "West",
        active: true,
        isPrimary: false,
      },
    });
    await db().clinicDowngradePreparation.create({
      data: {
        clinicId,
        targetPlan: "ESSENTIAL",
        status: "AWAITING_SELECTION",
      },
    });
    await db().clinicProfile.update({
      where: { clinicId },
      data: {
        phone: "0400000000",
        contactEmail: "front@pdel.example",
        addressLine1: "1 Harbour Street",
        city: "Sydney",
        bookingUrl: "https://example.com/book",
        contactUrl: "https://example.com/contact",
        emergencyInstructions: "Call the practice.",
        primaryColor: "#112233",
        logoUrl: "/images/demo-logo.svg",
      },
    });
    await deactivate(clinicId);

    const deleted = await permanentlyDeleteClinic({
      clinicId,
      operatorUserId: OPERATOR_ID,
      confirmation: name,
      storage: memoryStorage(),
    });
    expect(deleted.ok).toBe(true);

    const clinic = await db().clinic.findUniqueOrThrow({
      where: { id: clinicId },
    });
    expect(clinic.permanentlyDeletedAt).not.toBeNull();
    expect(clinic.permanentlyDeletedByUserId).toBe(OPERATOR_ID);
    expect(clinic.deactivatedAt).not.toBeNull();
    expect(clinic.name).toBe(name);
    expect(clinic.slug).toBe(slug);
    expect(await db().clinicMembership.count({ where: { clinicId } })).toBe(0);
    expect(
      await db().accountToken.count({
        where: { clinicId, type: AccountTokenType.INVITATION },
      })
    ).toBe(0);
    expect(
      await db().accountToken.findUnique({ where: { id: reset.id } })
    ).not.toBeNull();
    expect(
      await db().accountToken.findUnique({ where: { id: emailChange.id } })
    ).not.toBeNull();
    expect(
      await db().user.findUnique({ where: { id: member.id } })
    ).not.toBeNull();
    expect(
      await db().user.findUnique({ where: { id: pending.id } })
    ).not.toBeNull();
    expect(await db().legalAcceptance.count({ where: { clinicId } })).toBe(1);
    expect(await db().clinicEntitlement.count({ where: { clinicId } })).toBe(1);
    expect(
      await db().clinicComplimentaryAccessEvent.count({ where: { clinicId } })
    ).toBeGreaterThan(0);
    expect(
      await db().clinicNegotiatedOffer.count({ where: { clinicId } })
    ).toBe(1);
    expect(
      await db().clinicBillingProfile.findUnique({ where: { clinicId } })
    ).toMatchObject({ stripeCustomerId: `${PREFIX}cus` });
    expect(
      await db().stripeEventReceipt.findUnique({
        where: { stripeEventId: `${PREFIX}evt-main` },
      })
    ).toMatchObject({ clinicId });
    expect(await db().billingPriceChange.count({ where: { clinicId } })).toBe(
      1
    );
    expect(
      await db().billingNoticeDelivery.count({ where: { clinicId } })
    ).toBe(1);
    expect(await db().practiceGuide.count({ where: { clinicId } })).toBe(0);
    expect(
      await db().practiceGuideRevision.count({
        where: { practiceGuideId: guide.id },
      })
    ).toBe(0);
    expect(await db().clinicSite.count({ where: { clinicId } })).toBe(0);
    expect(await db().clinicLocation.count({ where: { clinicId } })).toBe(0);
    expect(
      await db().clinicSiteServiceCategory.count({ where: { clinicId } })
    ).toBe(0);
    expect(
      await db().clinicDowngradePreparation.count({ where: { clinicId } })
    ).toBe(0);
    expect(
      await db().guideTemplate.count({ where: { id: { in: templateIds } } })
    ).toBe(templateIds.length);
    const profile = await db().clinicProfile.findUniqueOrThrow({
      where: { clinicId },
    });
    expect(profile.displayName).toBe(name);
    expect(profile.phone).toBeNull();
    expect(profile.contactEmail).toBeNull();
    expect(profile.addressLine1).toBeNull();
    expect(profile.city).toBeNull();
    expect(profile.bookingUrl).toBeNull();
    expect(profile.contactUrl).toBeNull();
    expect(profile.emergencyInstructions).toBeNull();
    expect(profile.primaryColor).toBeNull();
    expect(profile.logoUrl).toBeNull();
    const retired = await db().retiredTenantSlug.findMany({
      where: { formerClinicId: clinicId },
      select: { slug: true },
    });
    expect(retired.map((row) => row.slug).sort()).toEqual(
      [slug, `${PREFIX}west`, primary.slug]
        .filter((value, index, all) => all.indexOf(value) === index)
        .sort()
    );
    expect(retired.map((row) => row.slug)).toContain(slug);
    expect(retired.map((row) => row.slug)).toContain(`${PREFIX}west`);

    await expect(
      createOperatorClinic({
        name: "Reuse",
        slug,
        serviceCategories: ["DENTAL"],
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);
    await expect(
      createOperatorClinic({
        name: "Reuse",
        slug,
        serviceCategories: ["DENTAL"],
      })
    ).rejects.toThrow(RETIRED_TENANT_SLUG_MESSAGE);

    const other = await fresh(`${PREFIX}other`, "Pdel Other");
    await expect(
      createClinicSiteWithRootLocation({
        clinicId: other.id,
        values: {
          siteName: "Taken",
          siteSlug: slug,
          locationName: "Taken",
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
        } satisfies CreateSiteInput,
      })
    ).rejects.toThrow(RETIRED_TENANT_SLUG_MESSAGE);

    const access = await loadClinicAccess(
      { id: member.id, platformRole: PlatformRole.NONE },
      clinicId
    );
    expect(access.activeMembership).toBeNull();
    const reactivated = await reactivateClinic({
      clinicId,
      operatorUserId: OPERATOR_ID,
    });
    expect(reactivated).toEqual({
      ok: false,
      error: CLINIC_PERMANENTLY_DELETED_REACTIVATE_MESSAGE,
    });
    const discarded = await discardAssistedClinic(clinicId);
    expect(discarded).toEqual({
      ok: false,
      error: DISCARD_NOT_PRISTINE_MESSAGE,
    });

    const listed = await listOperatorClinics();
    expect(
      selectOperatorClinicActivity(listed, "active").some(
        (clinic) => clinic.id === clinicId
      )
    ).toBe(false);
    expect(
      selectOperatorClinicActivity(listed, "inactive").some(
        (clinic) => clinic.id === clinicId
      )
    ).toBe(false);
    expect(
      selectOperatorClinicActivity(listed, "retired").some(
        (clinic) => clinic.id === clinicId
      )
    ).toBe(true);

    const retiredHost = await proxy(
      new NextRequest(`http://${slug}.localhost:3000/extraction`, {
        headers: { host: `${slug}.localhost:3000` },
      })
    );
    expect(retiredHost.status).toBe(410);
    const retiredBody = await retiredHost.text();
    expect(retiredBody).toBe(RETIRED_TENANT_MESSAGE);
    expect(retiredHost.headers.get("cache-control")).toBe("private, no-store");
    expect(retiredBody).not.toContain(name);

    const unknownHost = await proxy(
      new NextRequest(`http://${PREFIX}missing.localhost:3000/`, {
        headers: { host: `${PREFIX}missing.localhost:3000` },
      })
    );
    expect(unknownHost.status).not.toBe(410);
    await expectNotFound(() =>
      TenantLayout({
        params: Promise.resolve({ tenant: `${PREFIX}missing` }),
        children: null,
      })
    );

    const quiet = await fresh(`${PREFIX}quiet`, "Pdel Quiet");
    await deactivate(quiet.id);
    const quietHost = await proxy(
      new NextRequest(`http://${PREFIX}quiet.localhost:3000/`, {
        headers: { host: `${PREFIX}quiet.localhost:3000` },
      })
    );
    expect(quietHost.status).not.toBe(410);
    await expectNotFound(() =>
      TenantLayout({
        params: Promise.resolve({ tenant: `${PREFIX}quiet` }),
        children: null,
      })
    );

    const retiredPage = renderToStaticMarkup(
      await TenantLayout({
        params: Promise.resolve({ tenant: slug }),
        children: createElement("p", null, name),
      })
    );
    expect(retiredPage).toContain(RETIRED_TENANT_MESSAGE);
    expect(retiredPage).not.toContain(name);

    const logo = await serveClinicLogo({
      request: new Request("http://assets.localhost/logo.png"),
      clinicId,
      filename: "logo.png",
      method: "GET",
      variant: "fallback",
    });
    expect(logo.status).toBe(404);
    expect(logo.headers.get("cache-control")).toBe("private, no-store");
  });

  it("still frees a pristine Discard slug", async () => {
    const slug = `${PREFIX}shell`;
    const created = await fresh(slug, "Pdel Shell");
    const discarded = await discardAssistedClinic(created.id);
    expect(discarded).toEqual({ ok: true });
    expect(
      await db().retiredTenantSlug.findUnique({ where: { slug } })
    ).toBeNull();
    const again = await fresh(slug, "Pdel Shell");
    expect(again.id).not.toBe(created.id);
  });

  it("blocks live commercial state", async () => {
    const cases: Array<{
      slug: string;
      code: PermanentDeletionBlockerCode;
      prepare: (clinicId: string) => Promise<void>;
    }> = [
      {
        slug: `${PREFIX}sub`,
        code: "subscription",
        prepare: async (clinicId) => {
          await db().clinicEntitlement.update({
            where: { clinicId },
            data: { billingStatus: BillingStatus.ACTIVE },
          });
        },
      },
      {
        slug: `${PREFIX}cancel`,
        code: "cancel_at_period_end",
        prepare: async (clinicId) => {
          await db().clinicEntitlement.update({
            where: { clinicId },
            data: {
              billingStatus: BillingStatus.ENDED,
              cancelAtPeriodEnd: true,
            },
          });
        },
      },
      {
        slug: `${PREFIX}checkout`,
        code: "checkout_session",
        prepare: async (clinicId) => {
          await db().clinicBillingProfile.create({
            data: {
              clinicId,
              stripeCustomerId: `${PREFIX}cus-cs`,
              stripeCheckoutSessionId: `${PREFIX}cs`,
            },
          });
        },
      },
      {
        slug: `${PREFIX}sched`,
        code: "subscription_schedule",
        prepare: async (clinicId) => {
          await db().clinicBillingProfile.create({
            data: {
              clinicId,
              stripeCustomerId: `${PREFIX}cus-sched`,
              stripeSubscriptionScheduleId: `${PREFIX}sched`,
            },
          });
        },
      },
      {
        slug: `${PREFIX}transition`,
        code: "commercial_transition",
        prepare: async (clinicId) => {
          await db().clinicBillingProfile.create({
            data: {
              clinicId,
              stripeCustomerId: `${PREFIX}cus-down`,
              stripePlanDowngradeAttemptId: `${PREFIX}attempt`,
            },
          });
        },
      },
      {
        slug: `${PREFIX}offer`,
        code: "negotiated_offer",
        prepare: async (clinicId) => {
          await db().clinicNegotiatedOffer.create({
            data: {
              clinicId,
              preparedByUserId: OPERATOR_ID,
              commercialPlan: "ESSENTIAL",
              billingInterval: "MONTHLY",
              amountCents: 1000,
              startMode: "CUSTOMER_INITIATED",
              commercialTerms: "Open offer blocks deletion.",
              status: "PREPARED",
            },
          });
        },
      },
      {
        slug: `${PREFIX}price`,
        code: "price_change",
        prepare: async (clinicId) => {
          await db().billingPriceChange.create({
            data: {
              clinicId,
              stripeSubscriptionId: `${PREFIX}sub-price`,
              stripeSubscriptionItemId: `${PREFIX}si-price`,
              affectedLabel: "Essential",
              billingInterval: "MONTHLY",
              currentAmountCents: 1000,
              newAmountCents: 2000,
              effectiveAt: new Date("2026-12-01T00:00:00.000Z"),
              status: "SCHEDULED",
            },
          });
        },
      },
      {
        slug: `${PREFIX}notice`,
        code: "billing_notice",
        prepare: async (clinicId) => {
          await db().billingNoticeDelivery.create({
            data: {
              clinicId,
              stripeSubscriptionId: `${PREFIX}sub-notice`,
              kind: "PRICE_INCREASE_INITIAL",
              eventKey: `${PREFIX}pending`,
              status: "PENDING",
            },
          });
        },
      },
    ];

    for (const entry of cases) {
      const created = await fresh(entry.slug, entry.slug);
      const granted = await grantComplimentaryAccess({
        actorUserId: OPERATOR_ID,
        actorPlatformRole: PlatformRole.OPERATOR,
        clinicId: created.id,
        commercialPlan: "ESSENTIAL",
        duration: "SIX_MONTHS",
        reason: "Commercial blocker fixture.",
        now: new Date("2026-10-01T00:00:00.000Z"),
      });
      expect(granted.ok, entry.code).toBe(true);
      await entry.prepare(created.id);
      await deactivate(created.id);
      await expectBlocked(created.id, entry.code);
    }
  });

  it("blocks open splits, redirects, and guide maps", async () => {
    const source = await fresh(`${PREFIX}src`, "Pdel Source");
    const destination = await fresh(`${PREFIX}dst`, "Pdel Destination");
    await deactivate(source.id);
    await deactivate(destination.id);
    const sourceSite = await siteId(source.id);
    await db().clinicAccountSplitPreparation.create({
      data: {
        sourceClinicId: source.id,
        keptClinicSiteId: sourceSite,
        status: "DRAFT",
        destinationPlan: "ESSENTIAL",
        destinationBillingInterval: "MONTHLY",
        preparedByUserId: OPERATOR_ID,
      },
    });
    await expectBlocked(source.id, "split_history");

    const kept = await siteId(destination.id);
    await db().clinicAccountSplitPreparation.create({
      data: {
        sourceClinicId: destination.id,
        destinationClinicId: source.id,
        keptClinicSiteId: kept,
        status: "DESTINATION_READY",
        destinationPlan: "ESSENTIAL",
        destinationBillingInterval: "MONTHLY",
        preparedByUserId: OPERATOR_ID,
      },
    });
    await expectBlocked(source.id, "split_history");
  });

  it("blocks a location redirect and a split guide map without an open split", async () => {
    const source = await fresh(`${PREFIX}mapsrc`, "Pdel Map Source");
    const destination = await fresh(`${PREFIX}mapdst`, "Pdel Map Destination");
    const sourceSite = await siteId(source.id);
    const destinationSite = await siteId(destination.id);
    await db().clinicLocationRedirect.create({
      data: {
        sourceClinicSiteId: sourceSite,
        fromSlug: `${PREFIX}old`,
        destinationClinicSiteId: destinationSite,
      },
    });
    await deactivate(source.id);
    await expectBlocked(source.id, "location_redirect");
    await db().clinicLocationRedirect.deleteMany({
      where: { sourceClinicSiteId: sourceSite },
    });

    const guide = await db().practiceGuide.create({
      data: {
        clinicId: source.id,
        title: "Mapped",
        publicSlug: `${PREFIX}mapped`,
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
        serviceCategory: "DENTAL",
      },
    });
    const preparation = await db().clinicAccountSplitPreparation.create({
      data: {
        sourceClinicId: source.id,
        keptClinicSiteId: sourceSite,
        status: "COMPLETED",
        destinationPlan: "ESSENTIAL",
        destinationBillingInterval: "MONTHLY",
        preparedByUserId: OPERATOR_ID,
        executedAt: new Date("2026-10-03T00:00:00.000Z"),
      },
    });
    await db().clinicAccountSplitGuideMap.create({
      data: {
        preparationId: preparation.id,
        sourcePracticeGuideId: guide.id,
      },
    });
    await expectBlocked(source.id, "split_history");

    const destinationGuide = await db().practiceGuide.create({
      data: {
        clinicId: destination.id,
        title: "Destination mapped",
        publicSlug: `${PREFIX}dmap`,
        status: PracticeGuideStatus.DRAFT,
        serviceCategory: "DENTAL",
      },
    });
    const destinationPreparation =
      await db().clinicAccountSplitPreparation.create({
        data: {
          sourceClinicId: destination.id,
          keptClinicSiteId: destinationSite,
          status: "CANCELLED",
          destinationPlan: "ESSENTIAL",
          destinationBillingInterval: "MONTHLY",
          preparedByUserId: OPERATOR_ID,
          cancelledAt: new Date("2026-10-03T00:00:00.000Z"),
        },
      });
    await db().clinicAccountSplitGuideMap.create({
      data: {
        preparationId: destinationPreparation.id,
        sourcePracticeGuideId: destinationGuide.id,
        destinationPracticeGuideId: guide.id,
      },
    });
    await deactivate(destination.id);
    await expectBlocked(destination.id, "split_history");
  });

  it("keeps completed and cancelled split history for both clinics", async () => {
    async function retiredPair(label: string) {
      const source = await fresh(`${PREFIX}${label}s`, `Pdel ${label} source`);
      const destination = await fresh(
        `${PREFIX}${label}d`,
        `Pdel ${label} destination`
      );
      await deactivate(source.id);
      await deactivate(destination.id);
      return {
        source,
        destination,
        keptClinicSiteId: await siteId(source.id),
      };
    }

    async function preparation(input: {
      sourceClinicId: string;
      destinationClinicId?: string;
      keptClinicSiteId: string;
      status: "COMPLETED" | "CANCELLED";
    }) {
      return db().clinicAccountSplitPreparation.create({
        data: {
          sourceClinicId: input.sourceClinicId,
          destinationClinicId: input.destinationClinicId,
          keptClinicSiteId: input.keptClinicSiteId,
          status: input.status,
          destinationPlan: "ESSENTIAL",
          destinationBillingInterval: "MONTHLY",
          preparedByUserId: OPERATOR_ID,
          executedAt:
            input.status === "COMPLETED"
              ? new Date("2026-10-02T00:00:00.000Z")
              : null,
          cancelledAt:
            input.status === "CANCELLED"
              ? new Date("2026-10-02T00:00:00.000Z")
              : null,
        },
      });
    }

    const completedSource = await retiredPair("csrc");
    const completedSourcePrep = await preparation({
      sourceClinicId: completedSource.source.id,
      destinationClinicId: completedSource.destination.id,
      keptClinicSiteId: completedSource.keptClinicSiteId,
      status: "COMPLETED",
    });
    const completedEvent = await db().clinicAccountSplitEvent.create({
      data: {
        preparationId: completedSourcePrep.id,
        kind: "CUTOVER_COMPLETED",
        sourceClinicId: completedSource.source.id,
        destinationClinicId: completedSource.destination.id,
      },
    });
    await expectBlocked(completedSource.source.id, "split_history");

    const cancelledSource = await retiredPair("xsrc");
    const cancelledSourcePrep = await preparation({
      sourceClinicId: cancelledSource.source.id,
      keptClinicSiteId: cancelledSource.keptClinicSiteId,
      status: "CANCELLED",
    });
    await expectBlocked(cancelledSource.source.id, "split_history");

    const completedDestination = await retiredPair("cdst");
    const completedDestinationPrep = await preparation({
      sourceClinicId: completedDestination.source.id,
      destinationClinicId: completedDestination.destination.id,
      keptClinicSiteId: completedDestination.keptClinicSiteId,
      status: "COMPLETED",
    });
    await expectBlocked(completedDestination.destination.id, "split_history");

    const cancelledDestination = await retiredPair("xdst");
    const cancelledDestinationPrep = await preparation({
      sourceClinicId: cancelledDestination.source.id,
      destinationClinicId: cancelledDestination.destination.id,
      keptClinicSiteId: cancelledDestination.keptClinicSiteId,
      status: "CANCELLED",
    });
    await expectBlocked(cancelledDestination.destination.id, "split_history");

    const blockedHtml = renderToStaticMarkup(
      await OperatorClinicDetailPage({
        params: Promise.resolve({ clinicId: cancelledSource.source.id }),
      })
    );
    expect(blockedHtml).toContain(PERMANENT_DELETION_MESSAGES.split_history);
    expect(blockedHtml).not.toContain('name="confirmation"');

    const historyIds = [
      completedSourcePrep.id,
      cancelledSourcePrep.id,
      completedDestinationPrep.id,
      cancelledDestinationPrep.id,
    ];
    const before = await db().clinicAccountSplitPreparation.count({
      where: { id: { in: historyIds } },
    });
    expect(before).toBe(4);

    const unrelated = await fresh(`${PREFIX}nosplit`, "Pdel No Split");
    await deactivate(unrelated.id);
    const deleted = await permanentlyDeleteClinic({
      clinicId: unrelated.id,
      operatorUserId: OPERATOR_ID,
      confirmation: "Pdel No Split",
      storage: memoryStorage(),
    });
    expect(deleted.ok).toBe(true);
    expect(
      await db().clinicAccountSplitPreparation.count({
        where: { id: { in: historyIds } },
      })
    ).toBe(4);
    expect(
      await db().clinicAccountSplitEvent.findUnique({
        where: { id: completedEvent.id },
      })
    ).not.toBeNull();

    const destinationStill = await db().clinic.findUniqueOrThrow({
      where: { id: completedDestination.destination.id },
      select: {
        permanentlyDeletedAt: true,
        destinationAccountSplits: { select: { id: true, status: true } },
      },
    });
    expect(destinationStill.permanentlyDeletedAt).toBeNull();
    expect(destinationStill.destinationAccountSplits).toEqual([
      { id: completedDestinationPrep.id, status: "COMPLETED" },
    ]);
  });

  it("removes owned branding and refuses when storage cannot", async () => {
    const created = await fresh(`${PREFIX}brand`, "Pdel Brand");
    const other = await fresh(`${PREFIX}brand2`, "Pdel Brand Two");
    const key = `clinics/${created.id}/branding/logo.png`;
    const stale = `clinics/${created.id}/branding/old.png`;
    const otherKey = `clinics/${other.id}/branding/logo.png`;
    const storage = memoryStorage();
    await storage.uploadLogo({
      clinicId: created.id,
      storageKey: key,
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
    });
    await storage.uploadLogo({
      clinicId: created.id,
      storageKey: stale,
      bytes: new Uint8Array([4]),
      mimeType: "image/png",
    });
    await storage.uploadLogo({
      clinicId: other.id,
      storageKey: otherKey,
      bytes: new Uint8Array([5]),
      mimeType: "image/png",
    });
    await db().clinicProfile.update({
      where: { clinicId: created.id },
      data: { logoUrl: key },
    });
    await deactivate(created.id);
    const unavailable = await permanentlyDeleteClinic({
      clinicId: created.id,
      operatorUserId: OPERATOR_ID,
      confirmation: "Pdel Brand",
      storage: null,
    });
    expect(unavailable.ok).toBe(false);
    if (!unavailable.ok) {
      expect(unavailable.blockers.map((blocker) => blocker.code)).toContain(
        "storage"
      );
    }
    await expectStillOperational(created.id);

    const deleted = await permanentlyDeleteClinic({
      clinicId: created.id,
      operatorUserId: OPERATOR_ID,
      confirmation: "Pdel Brand",
      storage,
    });
    expect(deleted.ok).toBe(true);
    if (deleted.ok) {
      expect(deleted.storageCleanup.failedKeys).toEqual([]);
      expect(deleted.storageCleanup.deletedKeys.sort()).toEqual(
        [key, stale].sort()
      );
    }
    expect(
      await storage.readLogo({ clinicId: created.id, storageKey: key })
    ).toBeNull();
    expect(
      await storage.readLogo({ clinicId: created.id, storageKey: stale })
    ).toBeNull();
    expect(
      await storage.readLogo({ clinicId: other.id, storageKey: otherKey })
    ).not.toBeNull();

    const failing = memoryStorage();
    const failingKey = `clinics/${other.id}/branding/logo.png`;
    await failing.uploadLogo({
      clinicId: other.id,
      storageKey: failingKey,
      bytes: new Uint8Array([9]),
      mimeType: "image/png",
    });
    await db().clinicProfile.update({
      where: { clinicId: other.id },
      data: { logoUrl: failingKey },
    });
    await deactivate(other.id);
    const partial = await permanentlyDeleteClinic({
      clinicId: other.id,
      operatorUserId: OPERATOR_ID,
      confirmation: other.id ? "Pdel Brand Two" : "",
      storage: {
        ...failing,
        async deleteLogo() {
          throw new Error("storage failed");
        },
      },
    });
    expect(partial.ok).toBe(true);
    if (partial.ok) {
      expect(partial.storageCleanup.failedKeys).toContain(failingKey);
    }
    expect(
      (
        await db().clinic.findUniqueOrThrow({
          where: { id: other.id },
          select: { permanentlyDeletedAt: true },
        })
      ).permanentlyDeletedAt
    ).not.toBeNull();
    const retried = await retryPermanentDeletionBrandingCleanup({
      clinicId: other.id,
      operatorUserId: OPERATOR_ID,
      storage: failing,
    });
    expect(retried.ok).toBe(true);
    if (retried.ok) {
      expect(retried.storageCleanup.failedKeys).toEqual([]);
    }
    expect(
      await failing.readLogo({ clinicId: other.id, storageKey: failingKey })
    ).toBeNull();
    expect(
      (
        await db().clinic.findUniqueOrThrow({
          where: { id: other.id },
          select: { permanentlyDeletedAt: true },
        })
      ).permanentlyDeletedAt
    ).not.toBeNull();

    const neighbourKey = `clinics/${created.id}/branding/kept.png`;
    await failing.uploadLogo({
      clinicId: created.id,
      storageKey: neighbourKey,
      bytes: new Uint8Array([7]),
      mimeType: "image/png",
    });
    const listedClinicIds: string[] = [];
    const scoped: ClinicAssetStorage = {
      ...failing,
      async listOwnedBrandingKeys(clinicId) {
        listedClinicIds.push(clinicId);
        const keys = await failing.listOwnedBrandingKeys(clinicId);
        return [
          ...keys,
          neighbourKey,
          "clinics/other-clinic/branding/../logo.png",
        ];
      },
    };
    const again = await retryPermanentDeletionBrandingCleanup({
      clinicId: other.id,
      operatorUserId: OPERATOR_ID,
      storage: scoped,
    });
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.storageCleanup.failedKeys).toEqual([]);
      expect(again.storageCleanup.deletedKeys).toEqual([]);
    }
    expect(listedClinicIds).toEqual([other.id]);
    expect(
      await failing.readLogo({ clinicId: created.id, storageKey: neighbourKey })
    ).not.toBeNull();
    const closed = await serveClinicLogo({
      request: new Request("http://assets.localhost/logo.png"),
      clinicId: other.id,
      filename: "logo.png",
      method: "GET",
      variant: "fallback",
    });
    expect(closed.status).toBe(404);
    expect(closed.headers.get("cache-control")).toBe("private, no-store");
    expect(await closed.text()).toBe("");
  });

  it("drops the tombstone write when a later blocker wins the lock", async () => {
    const created = await fresh(`${PREFIX}race`, "Pdel Race");
    const granted = await grantComplimentaryAccess({
      actorUserId: OPERATOR_ID,
      actorPlatformRole: PlatformRole.OPERATOR,
      clinicId: created.id,
      commercialPlan: "ESSENTIAL",
      duration: "SIX_MONTHS",
      reason: "Race fixture.",
      now: new Date("2026-10-01T00:00:00.000Z"),
    });
    expect(granted.ok).toBe(true);
    await deactivate(created.id);
    const site = await siteId(created.id);

    const reactivated = await permanentlyDeleteClinic({
      clinicId: created.id,
      operatorUserId: OPERATOR_ID,
      confirmation: "Pdel Race",
      storage: memoryStorage(),
      afterLocks: async () => {
        await db().clinic.update({
          where: { id: created.id },
          data: { deactivatedAt: null, deactivatedByUserId: null },
        });
      },
    });
    expect(reactivated.ok).toBe(false);
    await expectStillOperational(created.id);

    await deactivate(created.id);
    const split = await permanentlyDeleteClinic({
      clinicId: created.id,
      operatorUserId: OPERATOR_ID,
      confirmation: "Pdel Race",
      storage: memoryStorage(),
      afterLocks: async () => {
        await db().clinicAccountSplitPreparation.create({
          data: {
            sourceClinicId: created.id,
            keptClinicSiteId: site,
            status: "DRAFT",
            destinationPlan: "ESSENTIAL",
            destinationBillingInterval: "MONTHLY",
            preparedByUserId: OPERATOR_ID,
          },
        });
      },
    });
    expect(split.ok).toBe(false);
    if (!split.ok) {
      expect(split.blockers.map((blocker) => blocker.code)).toContain(
        "split_history"
      );
    }
    await expectStillOperational(created.id);

    await db().clinicAccountSplitPreparation.deleteMany({
      where: { sourceClinicId: created.id },
    });
    const commercial = await permanentlyDeleteClinic({
      clinicId: created.id,
      operatorUserId: OPERATOR_ID,
      confirmation: "Pdel Race",
      storage: memoryStorage(),
      afterLocks: async () => {
        await db().clinicEntitlement.update({
          where: { clinicId: created.id },
          data: { billingStatus: BillingStatus.ACTIVE },
        });
      },
    });
    expect(commercial.ok).toBe(false);
    if (!commercial.ok) {
      expect(commercial.blockers.map((blocker) => blocker.code)).toContain(
        "subscription"
      );
    }
    await expectStillOperational(created.id);
  });

  it("allows only an operator and leaves the other clinic untouched", async () => {
    const created = await fresh(`${PREFIX}auth`, "Pdel Auth");
    const neighbour = await fresh(`${PREFIX}near`, "Pdel Neighbour");
    const staff = await db().user.create({
      data: {
        email: `${PREFIX}staff@example.com`,
        name: "Pdel Staff",
        platformRole: PlatformRole.NONE,
        passwordHash: hashPassword("pdel-staff-password"),
      },
    });
    await db().clinicMembership.create({
      data: {
        clinicId: neighbour.id,
        userId: staff.id,
        role: "ADMIN",
        active: true,
      },
    });
    await deactivate(created.id);
    const refused = await permanentlyDeleteClinic({
      clinicId: created.id,
      operatorUserId: staff.id,
      confirmation: "Pdel Auth",
      storage: memoryStorage(),
    });
    expect(refused).toMatchObject({
      ok: false,
      error: PERMANENT_DELETION_MESSAGES.operator,
    });
    await expectStillOperational(created.id);

    const deleted = await permanentlyDeleteClinic({
      clinicId: created.id,
      operatorUserId: OPERATOR_ID,
      confirmation: "Pdel Auth",
      storage: memoryStorage(),
    });
    expect(deleted.ok).toBe(true);
    expect(
      await db().clinicSite.count({ where: { clinicId: neighbour.id } })
    ).toBe(1);
    expect(
      await db().clinicMembership.count({ where: { clinicId: neighbour.id } })
    ).toBe(1);
    expect(
      await db().retiredTenantSlug.findUnique({
        where: { slug: `${PREFIX}near` },
      })
    ).toBeNull();
  });

  it("hides inactive setup forms and keeps negotiated withdrawal", async () => {
    const created = await fresh(`${PREFIX}offboard`, "Pdel Offboard Dental");
    await grantComplimentaryAccess({
      actorUserId: OPERATOR_ID,
      actorPlatformRole: PlatformRole.OPERATOR,
      clinicId: created.id,
      commercialPlan: "ESSENTIAL",
      duration: "SIX_MONTHS",
      reason: "Offboarding UI fixture.",
      now: new Date("2026-10-01T00:00:00.000Z"),
    });
    await db().clinicNegotiatedOffer.create({
      data: {
        clinicId: created.id,
        preparedByUserId: OPERATOR_ID,
        commercialPlan: "ESSENTIAL",
        billingInterval: "MONTHLY",
        amountCents: 4900,
        startMode: "CUSTOMER_INITIATED",
        commercialTerms: "Open offer stays withdrawable while inactive.",
        status: "PREPARED",
      },
    });
    await deactivate(created.id);
    const inactiveHtml = renderToStaticMarkup(
      await OperatorClinicDetailPage({
        params: Promise.resolve({ clinicId: created.id }),
      })
    );
    expect(inactiveHtml).toContain("Withdraw negotiated price");
    expect(inactiveHtml).not.toContain('id="negotiatedAmount"');
    expect(inactiveHtml).not.toContain("Prepare billing");
    expect(inactiveHtml).toContain("Reactivate clinic to edit.");
    const eligibility = await canPermanentlyDeleteClinic(created.id, {
      storage: memoryStorage(),
    });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.blockers.map((blocker) => blocker.code)).toContain(
      "negotiated_offer"
    );
  });

  it("does not offer split creation for an inactive clinic", async () => {
    const created = await fresh(`${PREFIX}splitui`, "Pdel Split Ui");
    await db().clinicEntitlement.create({
      data: {
        clinicId: created.id,
        commercialPlan: "GROUP",
        billingInterval: "MONTHLY",
        entitlementStatus: "ACTIVE",
        billingStatus: "NOT_BILLED",
        commercialArrangement: "COMPLIMENTARY",
      },
    });
    await db().clinicSite.create({
      data: {
        clinicId: created.id,
        name: "Second",
        slug: `${PREFIX}splitui2`,
        displayName: "Second",
        active: true,
        isPrimary: false,
      },
    });
    await deactivate(created.id);
    const inactiveHtml = renderToStaticMarkup(
      await OperatorClinicDetailPage({
        params: Promise.resolve({ clinicId: created.id }),
      })
    );
    expect(inactiveHtml).not.toContain("Prepare Clinic Site split");
    expect(inactiveHtml).toContain("Reactivate clinic to edit.");

    expect(
      await reactivateClinic({
        clinicId: created.id,
        operatorUserId: OPERATOR_ID,
      })
    ).toEqual({ ok: true });
    const activeHtml = renderToStaticMarkup(
      await OperatorClinicDetailPage({
        params: Promise.resolve({ clinicId: created.id }),
      })
    );
    expect(activeHtml).toContain("Prepare Clinic Site split");
    expect(activeHtml).not.toContain("<details");
    expect(activeHtml).not.toContain("Reactivate clinic to edit.");
  });

  it("shows deletion only for an eligible inactive clinic and a retired history view", async () => {
    const name = "Pdel Visible Dental";
    const created = await fresh(`${PREFIX}visible`, name);
    const activeHtml = renderToStaticMarkup(
      await OperatorClinicDetailPage({
        params: Promise.resolve({ clinicId: created.id }),
      })
    );
    expect(activeHtml).not.toContain("Danger zone");
    expect(activeHtml).not.toContain("<details");
    expect(activeHtml).not.toContain("Reactivate clinic to edit.");
    expect(activeHtml).toContain("Clinic setup");
    expect(activeHtml).toContain("Prepare billing");
    expect(activeHtml).toContain('name="duration"');
    expect(activeHtml).toContain("Manage clinic workspace");
    expect(activeHtml).toContain(">Branding</h2>");

    await deactivate(created.id);
    const inactiveHtml = renderToStaticMarkup(
      await OperatorClinicDetailPage({
        params: Promise.resolve({ clinicId: created.id }),
      })
    );
    expect(inactiveHtml).toContain("Danger zone");
    expect(inactiveHtml).toContain("This is irreversible.");
    expect(inactiveHtml).toContain("Customer and staff access is removed.");
    expect(inactiveHtml).toContain("Operational clinic content is removed.");
    expect(inactiveHtml).toContain(
      "Billing and legal audit records are retained."
    );
    expect(inactiveHtml).toContain(
      "The tenant address is permanently retired and cannot be reused."
    );
    expect(inactiveHtml).toContain('name="confirmation"');
    expect(inactiveHtml).toContain(`Type ${name} to confirm`);
    expect(inactiveHtml).toContain('aria-label="Copy clinic name"');
    expect(inactiveHtml).toContain(`>${name}<`);
    expect(inactiveHtml).not.toContain(`Type ${name} or`);
    expect(inactiveHtml).toContain("<details");
    expect(inactiveHtml).not.toMatch(/<details[^>]*\sopen[\s>]/);
    expect(inactiveHtml.indexOf("Clinic status")).toBeLessThan(
      inactiveHtml.indexOf("Danger zone")
    );
    expect(inactiveHtml.indexOf("Danger zone")).toBeLessThan(
      inactiveHtml.indexOf("<details")
    );
    expect(inactiveHtml).toContain("Reactivate clinic to edit.");
    expect(inactiveHtml).not.toContain("Prepare billing");
    expect(inactiveHtml).not.toContain('name="duration"');
    expect(inactiveHtml).not.toContain('id="negotiatedAmount"');
    expect(inactiveHtml).not.toContain("Manage clinic workspace");
    expect(inactiveHtml).not.toContain("Clinic setup");
    expect(inactiveHtml).toContain("Deactivate site");
    expect(inactiveHtml).toContain("Open team");

    await db().clinicEntitlement.create({
      data: {
        clinicId: created.id,
        commercialPlan: "ESSENTIAL",
        billingInterval: "MONTHLY",
        entitlementStatus: "ACTIVE",
        billingStatus: BillingStatus.PAST_DUE,
        commercialArrangement: "COMPLIMENTARY",
      },
    });
    const blockedHtml = renderToStaticMarkup(
      await OperatorClinicDetailPage({
        params: Promise.resolve({ clinicId: created.id }),
      })
    );
    expect(blockedHtml).toContain("Danger zone");
    expect(blockedHtml).toContain(PERMANENT_DELETION_MESSAGES.subscription);
    expect(blockedHtml).not.toContain('name="confirmation"');
    await db().clinicEntitlement.deleteMany({
      where: { clinicId: created.id },
    });

    const deleted = await permanentlyDeleteClinic({
      clinicId: created.id,
      operatorUserId: OPERATOR_ID,
      confirmation: name,
      storage: memoryStorage(),
    });
    expect(deleted.ok).toBe(true);
    const tombstone = renderToStaticMarkup(
      await OperatorClinicDetailPage({
        params: Promise.resolve({ clinicId: created.id }),
      })
    );
    expect(tombstone).toContain("Permanently deleted");
    expect(tombstone).toContain("Retry branding cleanup");
    expect(tombstone).not.toContain("Reactivate clinic");
    expect(tombstone).not.toContain("Open team");
    expect(tombstone).not.toContain("Clinic setup");
    expect(tombstone).not.toContain("Danger zone");

    const retiredList = renderToStaticMarkup(
      await OperatorClinicsPage({
        searchParams: Promise.resolve({ activity: "retired" }),
      })
    );
    expect(retiredList).toContain(name);
    const activeList = renderToStaticMarkup(
      await OperatorClinicsPage({
        searchParams: Promise.resolve({}),
      })
    );
    expect(activeList).not.toContain(name);
    const inactiveList = renderToStaticMarkup(
      await OperatorClinicsPage({
        searchParams: Promise.resolve({ activity: "inactive" }),
      })
    );
    expect(inactiveList).not.toContain(name);

    await expectNotFound(() =>
      startOperatorClinicSupportAction(
        (() => {
          const form = new FormData();
          form.set("clinicId", created.id);
          return form;
        })()
      )
    );
    cookieState.clinicId = created.id;
    await expect(readOperatorSupportClinic()).resolves.toBeNull();
    await expect(
      ClinicTeamPage({
        params: Promise.resolve({ clinicId: created.id }),
      })
    ).rejects.toMatchObject({
      digest: expect.stringContaining(`/operator/clinics/${created.id}`),
    });
  });
});
