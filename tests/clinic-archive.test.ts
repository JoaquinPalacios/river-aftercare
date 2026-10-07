import "dotenv/config";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { NextRequest } from "next/server";
import {
  AccountTokenType,
  BillingInterval,
  CommercialPlan,
  PlatformRole,
  PracticeGuideStatus,
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
import { RETIRED_TENANT_MESSAGE } from "@/lib/aftercare/retired-tenant-http";
import { getClinicBySlug } from "@/lib/aftercare/get-clinic-by-slug";
import { createAccountSplitPreparation } from "@/lib/account-split/preparation";
import {
  completeInvitation,
  createInvitationToken,
  inspectInvitation,
} from "@/lib/auth/account-token-service";
import { loadClinicAccess } from "@/lib/auth/clinic-authorization";
import { hashPassword } from "@/lib/auth/password";
import { enforcePrePaymentActivationGate } from "@/lib/billing/activation-gate";
import { createClinicCheckout } from "@/lib/billing/checkout";
import { grantComplimentaryAccess } from "@/lib/billing/complimentary-access";
import { openCustomerPortalForClinic } from "@/lib/billing/customer-portal";
import { prepareNegotiatedOffer } from "@/lib/billing/negotiated-offer";
import { prepareClinicCommercialOffer } from "@/lib/billing/prepare-offer";
import {
  CLINIC_ARCHIVED_MESSAGE,
  CLINIC_INACTIVE_MESSAGE,
} from "@/lib/clinics/clinic-activity";
import {
  CLINIC_ALREADY_TERMINAL_MESSAGE,
  CLINIC_ARCHIVE_CONFIRMATION_MESSAGE,
  CLINIC_NOT_ARCHIVED_MESSAGE,
  archiveClinic,
  unarchiveClinic,
} from "@/lib/clinics/clinic-archive";
import {
  CLINIC_ARCHIVED_REACTIVATE_MESSAGE,
  CLINIC_ARCHIVED_STATUS_MESSAGE,
  CLINIC_DEACTIVATION_SPLIT_MESSAGE,
  CLINIC_STATUS_NOT_FOUND_MESSAGE,
  CLINIC_STATUS_OPERATOR_MESSAGE,
  deactivateClinic,
  reactivateClinic,
} from "@/lib/clinics/clinic-deactivation";
import {
  canPermanentlyDeleteClinic,
  CLINIC_PERMANENTLY_DELETED_REACTIVATE_MESSAGE,
  permanentlyDeleteClinic,
  PERMANENT_DELETION_MESSAGES,
  permanentDeletionConfirmationName,
} from "@/lib/clinics/permanent-clinic-deletion";
import { RETIRED_TENANT_SLUG_MESSAGE } from "@/lib/clinics/retired-tenant-slug";
import { createClinicLocation } from "@/lib/clinics/site-location-mutations";
import { isLocalDevelopmentDatabase } from "@/lib/dev/database-target";
import { createOperatorClinic } from "@/lib/operator/create-operator-clinic";
import {
  DISCARD_NOT_PRISTINE_MESSAGE,
  discardAssistedClinic,
} from "@/lib/operator/discard-assisted-clinic";
import { inviteClinicUser } from "@/lib/operator/invite-clinic-user";
import {
  listOperatorClinics,
  selectOperatorClinicActivity,
} from "@/lib/operator/list-operator-clinics";
import { resendClinicInvitation } from "@/lib/operator/resend-clinic-invitation";
import { summarizeOperatorClinics } from "@/lib/operator/summarize-operator-clinics";
import { getPrisma } from "@/lib/prisma";
import { proxy } from "@/proxy";
import { PUBLIC_PATIENT_PATH_HEADER } from "@/lib/tenancy/public-patient-path";

const PREFIX = "carc-";
const OPERATOR_ID = "carc_operator";
const headerState = vi.hoisted(() => ({
  publicPath: null as string | null,
}));
const authState = vi.hoisted(() => ({
  user: null as {
    id: string;
    email: string;
    name: string | null;
    platformRole: "OPERATOR" | "NONE";
  } | null,
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
  headers: async () => {
    const headers = new Headers({
      host: "app.localhost:3000",
      "x-forwarded-proto": "http",
    });
    if (headerState.publicPath) {
      headers.set(PUBLIC_PATIENT_PATH_HEADER, headerState.publicPath);
    }
    return headers;
  },
  cookies: async () => ({
    get: () => undefined,
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
    getCurrentUser: async () => authState.user,
    getAuthContext: async () => ({
      user: authState.user,
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

async function expectNotFound(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    const digest = String((error as { digest?: string }).digest ?? "");
    expect(digest).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(digest).not.toContain(";410;");
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
  }
  await prisma.retiredTenantSlug.deleteMany({
    where: {
      OR: [
        { slug: { startsWith: PREFIX } },
        ...(ids.length > 0 ? [{ formerClinicId: { in: ids } }] : []),
      ],
    },
  });
  await prisma.stripeEventReceipt.deleteMany({
    where: {
      OR: [
        { stripeEventId: { startsWith: PREFIX } },
        ...(ids.length > 0 ? [{ clinicId: { in: ids } }] : []),
      ],
    },
  });
  if (ids.length > 0) {
    await prisma.clinic.deleteMany({ where: { id: { in: ids } } });
  }
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
      name: "Carc Operator",
      platformRole: PlatformRole.OPERATOR,
      passwordHash: hashPassword("carc-operator-password"),
    },
  });
}

async function fresh(slug: string, name = "Carc Clinic") {
  return createOperatorClinic({
    name,
    slug,
    serviceCategories: ["DENTAL"],
  });
}

async function confirmationName(clinicId: string): Promise<string> {
  const clinic = await db().clinic.findUniqueOrThrow({
    where: { id: clinicId },
    select: {
      name: true,
      sites: { select: { displayName: true, isPrimary: true, active: true } },
    },
  });
  return permanentDeletionConfirmationName(clinic);
}

async function archive(clinicId: string, now?: Date) {
  return archiveClinic({
    clinicId,
    operatorUserId: OPERATOR_ID,
    confirmation: await confirmationName(clinicId),
    now,
  });
}

describeDb("reversible clinic archive and terminal delete", () => {
  beforeAll(async () => {
    await ensureOperator();
  });

  beforeEach(async () => {
    headerState.publicPath = null;
    authState.user = {
      id: OPERATOR_ID,
      email: `${PREFIX}operator@example.com`,
      name: "Carc Operator",
      platformRole: "OPERATOR",
    };
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await db().user.deleteMany({ where: { id: OPERATOR_ID } });
    await db().$disconnect();
  });

  it("moves Active to Inactive and back without archiving", async () => {
    const created = await fresh(`${PREFIX}cycle`, "Carc Cycle");
    expect(
      await deactivateClinic({
        clinicId: created.id,
        operatorUserId: OPERATOR_ID,
        now: new Date("2026-10-07T01:00:00.000Z"),
      })
    ).toEqual({ ok: true });
    expect(
      await db().clinic.findUnique({
        where: { id: created.id },
        select: { deactivatedAt: true, archivedAt: true },
      })
    ).toMatchObject({
      deactivatedAt: new Date("2026-10-07T01:00:00.000Z"),
      archivedAt: null,
    });
    expect(
      await reactivateClinic({
        clinicId: created.id,
        operatorUserId: OPERATOR_ID,
      })
    ).toEqual({ ok: true });
    expect(
      await db().clinic.findUnique({
        where: { id: created.id },
        select: { deactivatedAt: true, archivedAt: true },
      })
    ).toEqual({ deactivatedAt: null, archivedAt: null });
  });

  it("archives an active clinic in one step and preserves its data", async () => {
    const name = "Carc Harbour Dental";
    const created = await fresh(`${PREFIX}active`, name);
    const clinicId = created.id;
    const site = await db().clinicSite.findFirstOrThrow({
      where: { clinicId, isPrimary: true },
    });
    await db().clinicSite.update({
      where: { id: site.id },
      data: { primaryColor: "#112233", displayName: name },
    });
    await db().clinicProfile.update({
      where: { clinicId },
      data: { displayName: name, primaryColor: "#112233" },
    });
    const location = await db().clinicLocation.findFirstOrThrow({
      where: { clinicId, servesSiteRoot: true },
    });
    const guide = await db().practiceGuide.create({
      data: {
        clinicId,
        title: "Extraction",
        publicSlug: `${PREFIX}guide`,
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
        publishedAt: new Date("2026-10-01T00:00:00.000Z"),
        serviceCategory: "DENTAL",
      },
    });
    const member = await db().user.create({
      data: {
        email: `${PREFIX}member@example.com`,
        name: "Carc Member",
        platformRole: PlatformRole.NONE,
        passwordHash: hashPassword("carc-member-password"),
      },
    });
    await db().account.create({
      data: {
        userId: member.id,
        type: "credentials",
        provider: "credentials",
        providerAccountId: `${PREFIX}member-account`,
      },
    });
    await db().session.create({
      data: {
        sessionToken: `${PREFIX}member-session`,
        userId: member.id,
        expires: new Date("2026-12-01T00:00:00.000Z"),
      },
    });
    const membership = await db().clinicMembership.create({
      data: { clinicId, userId: member.id, role: "ADMIN", active: true },
    });
    const pending = await db().user.create({
      data: {
        email: `${PREFIX}pending@example.com`,
        name: "Pending Person",
        platformRole: PlatformRole.NONE,
      },
    });
    const invited = await createInvitationToken({
      userId: pending.id,
      clinicId,
      role: "STAFF",
      email: pending.email,
      invitedByUserId: OPERATOR_ID,
    });
    await db().clinic.update({
      where: { id: clinicId },
      data: { assistedOnboarding: false },
    });
    expect(
      await grantComplimentaryAccess({
        actorUserId: OPERATOR_ID,
        actorPlatformRole: PlatformRole.OPERATOR,
        clinicId,
        commercialPlan: "ESSENTIAL",
        duration: "SIX_MONTHS",
        reason: "Collaboration for the archive test.",
        now: new Date("2026-10-01T00:00:00.000Z"),
      })
    ).toMatchObject({ ok: true });
    await db().clinicBillingProfile.create({
      data: {
        clinicId,
        stripeCustomerId: `${PREFIX}cus`,
        stripeSubscriptionId: `${PREFIX}sub`,
      },
    });

    const wrong = await archiveClinic({
      clinicId,
      operatorUserId: OPERATOR_ID,
      confirmation: site.slug,
    });
    expect(wrong).toEqual({
      ok: false,
      error: CLINIC_ARCHIVE_CONFIRMATION_MESSAGE,
    });
    expect(
      await db().clinic.findUnique({
        where: { id: clinicId },
        select: { archivedAt: true, deactivatedAt: true },
      })
    ).toEqual({ archivedAt: null, deactivatedAt: null });

    const staff = await db().user.create({
      data: {
        email: `${PREFIX}staff-op@example.com`,
        platformRole: PlatformRole.NONE,
        passwordHash: hashPassword("carc-staff-password"),
      },
    });
    expect(
      await archiveClinic({
        clinicId,
        operatorUserId: staff.id,
        confirmation: name,
      })
    ).toEqual({ ok: false, error: CLINIC_STATUS_OPERATOR_MESSAGE });

    const archived = await archiveClinic({
      clinicId,
      operatorUserId: OPERATOR_ID,
      confirmation: name,
      now: new Date("2026-10-07T02:00:00.000Z"),
    });
    expect(archived).toEqual({ ok: true });

    const row = await db().clinic.findUniqueOrThrow({
      where: { id: clinicId },
      select: {
        slug: true,
        deactivatedAt: true,
        deactivatedByUserId: true,
        archivedAt: true,
        archivedByUserId: true,
        permanentlyDeletedAt: true,
      },
    });
    expect(row).toMatchObject({
      slug: `${PREFIX}active`,
      deactivatedAt: new Date("2026-10-07T02:00:00.000Z"),
      deactivatedByUserId: OPERATOR_ID,
      archivedAt: new Date("2026-10-07T02:00:00.000Z"),
      archivedByUserId: OPERATOR_ID,
      permanentlyDeletedAt: null,
    });
    expect(
      await db().clinicMembership.findUnique({ where: { id: membership.id } })
    ).toMatchObject({ active: true });
    expect(
      await db().practiceGuide.findUnique({ where: { id: guide.id } })
    ).toMatchObject({
      status: PracticeGuideStatus.PUBLISHED,
      isEnabled: true,
    });
    expect(
      await db().clinicSite.findUnique({ where: { id: site.id } })
    ).toMatchObject({
      slug: site.slug,
      active: true,
      primaryColor: "#112233",
    });
    expect(
      await db().clinicLocation.findUnique({ where: { id: location.id } })
    ).toMatchObject({ active: true, deactivatedAt: null });
    expect(
      await db().clinicProfile.findUnique({ where: { clinicId } })
    ).toMatchObject({ displayName: name, primaryColor: "#112233" });
    expect(
      await db().clinicEntitlement.findUnique({ where: { clinicId } })
    ).not.toBeNull();
    expect(
      await db().clinicBillingProfile.findUnique({ where: { clinicId } })
    ).toMatchObject({ stripeCustomerId: `${PREFIX}cus` });
    expect(
      await db().clinicComplimentaryAccessEvent.count({ where: { clinicId } })
    ).toBeGreaterThan(0);
    expect(
      await db().retiredTenantSlug.count({ where: { slug: site.slug } })
    ).toBe(0);
    const pendingToken = await db().accountToken.findUniqueOrThrow({
      where: { id: invited.token.id },
    });
    expect(pendingToken.revokedAt?.toISOString()).toBe(
      "2026-10-07T02:00:00.000Z"
    );
    expect(readFileSync("lib/clinics/clinic-archive.ts", "utf8")).not.toMatch(
      /from ["']stripe["']/
    );

    const stripe = new Proxy(
      {},
      {
        get() {
          throw new Error("stripe was called");
        },
      }
    );
    await expect(
      createClinicCheckout({
        clinicId,
        userId: member.id,
        successUrl: "http://app.localhost:3000/account/billing/complete",
        cancelUrl: "http://app.localhost:3000/account/billing/setup",
        db: db(),
        stripe: stripe as never,
      })
    ).resolves.toEqual({ ok: false, code: "checkout_unavailable" });
    await expect(
      openCustomerPortalForClinic({
        clinicId,
        returnUrl: "http://app.localhost:3000/account/billing",
        staffOrigin: "http://app.localhost:3000",
        stripe: stripe as never,
      })
    ).resolves.toEqual({ ok: false, code: "portal_unavailable" });
    expect(
      await inviteClinicUser({
        clinicId,
        invitedByUserId: OPERATOR_ID,
        name: "New Person",
        email: `${PREFIX}new@example.com`,
        role: "STAFF",
      })
    ).toMatchObject({ ok: false, code: "clinic_inactive" });
    expect(
      await resendClinicInvitation({
        clinicId,
        userId: pending.id,
        invitedByUserId: OPERATOR_ID,
      })
    ).toEqual({ ok: false, error: CLINIC_ARCHIVED_MESSAGE });
    expect(await inspectInvitation(invited.rawToken)).toEqual({ valid: false });
    expect(
      await completeInvitation({
        rawToken: invited.rawToken,
        passwordHash: hashPassword("carc-accept-password"),
      })
    ).toEqual({ ok: false, reason: "revoked" });
    await expect(
      createClinicLocation({
        clinicId,
        siteId: site.id,
        values: {
          name: "East room",
          slug: `${PREFIX}east`,
          displayName: "East room",
          phone: null,
          addressLine1: null,
          addressLine2: null,
          city: null,
          region: null,
          postalCode: null,
          country: "AU",
          contactUrl: null,
          contactEmail: null,
          bookingUrl: null,
          emergencyInstructions: null,
        },
      })
    ).rejects.toThrow(CLINIC_ARCHIVED_MESSAGE);
    await expect(
      createAccountSplitPreparation({
        sourceClinicId: clinicId,
        keptClinicSiteId: site.id,
        destinationPlan: CommercialPlan.ESSENTIAL,
        destinationBillingInterval: BillingInterval.MONTHLY,
        operatorUserId: OPERATOR_ID,
      })
    ).rejects.toThrow(CLINIC_ARCHIVED_MESSAGE);
    expect(
      await grantComplimentaryAccess({
        actorUserId: OPERATOR_ID,
        actorPlatformRole: PlatformRole.OPERATOR,
        clinicId,
        commercialPlan: "PRACTICE",
        duration: "SIX_MONTHS",
        reason: "Should not grant while archived.",
      })
    ).toEqual({ ok: false, error: CLINIC_ARCHIVED_MESSAGE });
    expect(
      await prepareClinicCommercialOffer({
        clinicId,
        commercialPlan: "ESSENTIAL",
        billingInterval: "MONTHLY",
      })
    ).toMatchObject({ ok: false, message: CLINIC_ARCHIVED_MESSAGE });
    expect(
      await prepareNegotiatedOffer({
        clinicId,
        actorUserId: OPERATOR_ID,
        actorPlatformRole: PlatformRole.OPERATOR,
        billingInterval: "MONTHLY",
        amount: "49.00",
        startMode: "CUSTOMER_INITIATED",
        billingStartDate: "",
        commercialTerms: "A$49 per month. The price does not increase.",
      })
    ).toEqual({ ok: false, error: CLINIC_ARCHIVED_MESSAGE });

    expect(await getClinicBySlug(site.slug)).toBeNull();
    const archivedHost = await proxy(
      new NextRequest(`http://${site.slug}.localhost:3000/`, {
        headers: { host: `${site.slug}.localhost:3000` },
      })
    );
    expect(archivedHost.status).not.toBe(410);
    headerState.publicPath = "/";
    await expectNotFound(() =>
      TenantLayout({
        params: Promise.resolve({ tenant: site.slug }),
        children: createElement("p", null, "patient-child"),
      })
    );

    const access = await loadClinicAccess(
      { id: member.id, platformRole: PlatformRole.NONE },
      clinicId
    );
    expect(access.activeMembership?.id).toBe(membership.id);
    await expectNotFound(() =>
      enforcePrePaymentActivationGate({
        clinic: { id: clinicId, name },
        source: "membership",
      })
    );
    expect(
      await reactivateClinic({
        clinicId,
        operatorUserId: OPERATOR_ID,
      })
    ).toEqual({ ok: false, error: CLINIC_ARCHIVED_REACTIVATE_MESSAGE });
    expect(
      await deactivateClinic({
        clinicId,
        operatorUserId: OPERATOR_ID,
      })
    ).toEqual({ ok: false, error: CLINIC_ARCHIVED_STATUS_MESSAGE });

    const activePage = renderToStaticMarkup(
      await OperatorClinicDetailPage({
        params: Promise.resolve({ clinicId }),
      })
    );
    expect(activePage).toContain("Status: Archived");
    expect(activePage).toContain("Unarchive clinic");
    expect(activePage).toContain("Unarchive this clinic?");
    expect(activePage).toContain("Danger zone");
    expect(activePage).toContain("Delete clinic");
    expect(activePage).toContain(
      "This clinic has billing or legal records that must be retained, so it cannot be permanently deleted."
    );
    expect(activePage).not.toContain(">Delete permanently<");
    expect(activePage).toContain(
      "Former tenant addresses remain reserved so old patient links cannot be reassigned."
    );
    expect(activePage).toContain(name);
    expect(activePage).not.toContain(">Reactivate clinic<");
    expect(activePage).not.toContain("Reactivate clinic to edit.");
    expect(activePage).not.toContain(">Deactivate clinic<");
    expect(activePage).toContain("Unarchive this clinic before editing it.");

    const listed = await listOperatorClinics();
    const active = selectOperatorClinicActivity(listed, "active");
    const inactive = selectOperatorClinicActivity(listed, "inactive");
    const archivedList = selectOperatorClinicActivity(listed, "archived");
    expect(active.some((clinic) => clinic.id === clinicId)).toBe(false);
    expect(inactive.some((clinic) => clinic.id === clinicId)).toBe(false);
    expect(archivedList.some((clinic) => clinic.id === clinicId)).toBe(true);
    expect(summarizeOperatorClinics(active).totalClinics).toBe(active.length);
    const listHtml = renderToStaticMarkup(
      await OperatorClinicsPage({
        searchParams: Promise.resolve({ activity: "archived" }),
      })
    );
    expect(listHtml).toContain(name);
    expect(listHtml).toContain("Archived");
    expect(listHtml).toContain('aria-current="page"');
    expect(listHtml).toContain("/operator/clinics?activity=archived");
    expect(listHtml).not.toContain(">Deleted<");
    const activeList = renderToStaticMarkup(
      await OperatorClinicsPage({ searchParams: Promise.resolve({}) })
    );
    expect(activeList).not.toContain(name);
    expect(activeList).toContain(
      `<dd>${summarizeOperatorClinics(active).totalClinics}</dd>`
    );
    const inactiveList = renderToStaticMarkup(
      await OperatorClinicsPage({
        searchParams: Promise.resolve({ activity: "inactive" }),
      })
    );
    expect(inactiveList).not.toContain(name);
  });

  it("archives an inactive clinic without rewriting deactivation", async () => {
    const created = await fresh(`${PREFIX}inactive`, "Carc Inactive");
    const deactivatedAt = new Date("2026-10-06T03:00:00.000Z");
    expect(
      await deactivateClinic({
        clinicId: created.id,
        operatorUserId: OPERATOR_ID,
        now: deactivatedAt,
      })
    ).toEqual({ ok: true });
    const before = renderToStaticMarkup(
      await OperatorClinicDetailPage({
        params: Promise.resolve({ clinicId: created.id }),
      })
    );
    expect(before).toContain("Status: Inactive");
    expect(before).toContain("Reactivate clinic");
    expect(before).toContain("Archive clinic");
    expect(before).toContain("Archive this clinic?");
    expect(before).toContain(
      "Archiving closes the clinic and removes it from normal operational views. Its data is preserved and it can later be unarchived."
    );
    expect(before).toContain(
      "An unarchived clinic returns as Inactive and must be explicitly reactivated."
    );
    expect(before).toContain("This clinic is already inactive.");
    expect(before).toContain('aria-label="Copy clinic name"');
    expect(before).toContain("Carc Inactive");
    expect(before).not.toContain("Delete permanently");
    expect(before).not.toContain("Danger zone");

    const activeCreated = await fresh(`${PREFIX}confirm`, "Carc Confirm");
    const activeHtml = renderToStaticMarkup(
      await OperatorClinicDetailPage({
        params: Promise.resolve({ clinicId: activeCreated.id }),
      })
    );
    expect(activeHtml).toContain("Status: Active");
    expect(activeHtml).toContain("Deactivate clinic");
    expect(activeHtml).toContain("Archive clinic");
    expect(activeHtml).toContain(
      "Archiving an active clinic also makes it inactive."
    );
    expect(activeHtml).not.toContain("Delete permanently");

    expect(
      await archive(created.id, new Date("2026-10-07T04:00:00.000Z"))
    ).toEqual({
      ok: true,
    });
    expect(
      await db().clinic.findUnique({
        where: { id: created.id },
        select: {
          deactivatedAt: true,
          deactivatedByUserId: true,
          archivedAt: true,
          archivedByUserId: true,
        },
      })
    ).toEqual({
      deactivatedAt,
      deactivatedByUserId: OPERATOR_ID,
      archivedAt: new Date("2026-10-07T04:00:00.000Z"),
      archivedByUserId: OPERATOR_ID,
    });
    const listed = await listOperatorClinics();
    expect(
      selectOperatorClinicActivity(listed, "inactive").some(
        (clinic) => clinic.id === created.id
      )
    ).toBe(false);
    expect(
      selectOperatorClinicActivity(listed, "archived").some(
        (clinic) => clinic.id === created.id
      )
    ).toBe(true);
  });

  it("unarchives to Inactive and keeps the same clinic graph", async () => {
    const name = "Carc Restore";
    const created = await fresh(`${PREFIX}restore`, name);
    const site = await db().clinicSite.findFirstOrThrow({
      where: { clinicId: created.id, isPrimary: true },
    });
    const pending = await db().user.create({
      data: {
        email: `${PREFIX}restore-pending@example.com`,
        platformRole: PlatformRole.NONE,
      },
    });
    const invited = await createInvitationToken({
      userId: pending.id,
      clinicId: created.id,
      role: "STAFF",
      email: pending.email,
      invitedByUserId: OPERATOR_ID,
    });
    expect(
      await archive(created.id, new Date("2026-10-07T05:00:00.000Z"))
    ).toEqual({ ok: true });
    expect(
      await unarchiveClinic({
        clinicId: created.id,
        operatorUserId: OPERATOR_ID,
      })
    ).toEqual({ ok: true });
    const row = await db().clinic.findUniqueOrThrow({
      where: { id: created.id },
      select: {
        deactivatedAt: true,
        archivedAt: true,
        archivedByUserId: true,
        slug: true,
      },
    });
    expect(row.archivedAt).toBeNull();
    expect(row.archivedByUserId).toBeNull();
    expect(row.deactivatedAt).toEqual(new Date("2026-10-07T05:00:00.000Z"));
    expect(row.slug).toBe(`${PREFIX}restore`);
    expect(
      await db().clinicSite.count({ where: { clinicId: created.id } })
    ).toBe(1);
    expect(
      await db().accountToken.findUniqueOrThrow({
        where: { id: invited.token.id },
      })
    ).toMatchObject({ revokedAt: new Date("2026-10-07T05:00:00.000Z") });
    expect(await getClinicBySlug(site.slug)).toBeNull();
    expect(
      await reactivateClinic({
        clinicId: created.id,
        operatorUserId: OPERATOR_ID,
      })
    ).toEqual({ ok: true });
    expect(await getClinicBySlug(site.slug)).toMatchObject({ id: created.id });
    expect(
      await unarchiveClinic({
        clinicId: created.id,
        operatorUserId: OPERATOR_ID,
      })
    ).toEqual({ ok: false, error: CLINIC_NOT_ARCHIVED_MESSAGE });
  });

  it("blocks archive on an open split and delete on historical split history", async () => {
    const source = await fresh(`${PREFIX}split-src`, "Carc Split Source");
    const site = await db().clinicSite.findFirstOrThrow({
      where: { clinicId: source.id, isPrimary: true },
    });
    await db().clinicAccountSplitPreparation.create({
      data: {
        sourceClinicId: source.id,
        keptClinicSiteId: site.id,
        destinationPlan: CommercialPlan.ESSENTIAL,
        destinationBillingInterval: BillingInterval.MONTHLY,
        preparedByUserId: OPERATOR_ID,
        status: "DRAFT",
      },
    });
    expect(await archive(source.id)).toEqual({
      ok: false,
      error: CLINIC_DEACTIVATION_SPLIT_MESSAGE,
    });
    expect(
      await db().clinic.findUnique({
        where: { id: source.id },
        select: { archivedAt: true, deactivatedAt: true },
      })
    ).toEqual({ archivedAt: null, deactivatedAt: null });

    await db().clinicAccountSplitPreparation.updateMany({
      where: { sourceClinicId: source.id },
      data: { status: "COMPLETED" },
    });
    expect(await archive(source.id)).toEqual({ ok: true });
    const eligibility = await canPermanentlyDeleteClinic(source.id, {
      storage: null,
    });
    expect(eligibility.blockers.map((blocker) => blocker.code)).toContain(
      "split_history"
    );
    expect(
      await permanentlyDeleteClinic({
        clinicId: source.id,
        operatorUserId: OPERATOR_ID,
        confirmation: await confirmationName(source.id),
        storage: null,
      })
    ).toMatchObject({
      ok: false,
      error: PERMANENT_DELETION_MESSAGES.split_history,
    });
    expect(
      await db().clinic.findUnique({ where: { id: source.id } })
    ).not.toBeNull();
    expect(
      await db().clinicAccountSplitPreparation.count({
        where: { sourceClinicId: source.id },
      })
    ).toBe(1);
  });

  it("permanently deletes only an archived clinic and keeps retired hostnames", async () => {
    const active = await fresh(`${PREFIX}nodelete`, "Carc No Delete");
    expect(
      (
        await canPermanentlyDeleteClinic(active.id, { storage: null })
      ).blockers.map((blocker) => blocker.code)
    ).toContain("not_archived");
    expect(
      await permanentlyDeleteClinic({
        clinicId: active.id,
        operatorUserId: OPERATOR_ID,
        confirmation: "Carc No Delete",
        storage: null,
      })
    ).toMatchObject({
      ok: false,
      error: PERMANENT_DELETION_MESSAGES.not_archived,
    });

    const inactive = await fresh(`${PREFIX}indelete`, "Carc Inactive Delete");
    expect(
      await deactivateClinic({
        clinicId: inactive.id,
        operatorUserId: OPERATOR_ID,
      })
    ).toEqual({ ok: true });
    expect(
      (
        await canPermanentlyDeleteClinic(inactive.id, { storage: null })
      ).blockers.map((blocker) => blocker.code)
    ).toContain("not_archived");
    const inactivePage = renderToStaticMarkup(
      await OperatorClinicDetailPage({
        params: Promise.resolve({ clinicId: inactive.id }),
      })
    );
    expect(inactivePage).not.toContain("Delete permanently");

    const name = "Carc Gone";
    const created = await fresh(`${PREFIX}gone`, name);
    const site = await db().clinicSite.findFirstOrThrow({
      where: { clinicId: created.id, isPrimary: true },
    });
    const member = await db().user.create({
      data: {
        email: `${PREFIX}gone-member@example.com`,
        platformRole: PlatformRole.NONE,
        passwordHash: hashPassword("carc-gone-password"),
      },
    });
    await db().account.create({
      data: {
        userId: member.id,
        type: "credentials",
        provider: "credentials",
        providerAccountId: `${PREFIX}gone-account`,
      },
    });
    await db().session.create({
      data: {
        sessionToken: `${PREFIX}gone-session`,
        userId: member.id,
        expires: new Date("2026-12-01T00:00:00.000Z"),
      },
    });
    await db().clinicMembership.create({
      data: { clinicId: created.id, userId: member.id, role: "STAFF" },
    });
    const reset = await db().accountToken.create({
      data: {
        type: AccountTokenType.PASSWORD_RESET,
        tokenHash: `${PREFIX}gone-reset`,
        userId: member.id,
        email: member.email,
        expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      },
    });
    expect(await archive(created.id)).toEqual({ ok: true });
    const archivedPage = renderToStaticMarkup(
      await OperatorClinicDetailPage({
        params: Promise.resolve({ clinicId: created.id }),
      })
    );
    expect(archivedPage).toContain("Status: Archived");
    expect(archivedPage).toContain(">Delete permanently<");
    expect(archivedPage).toContain("Delete this archived clinic permanently?");
    expect(archivedPage).toContain("This cannot be undone.");
    expect(archivedPage).toContain(
      "All clinic data will be permanently removed. Former tenant addresses remain reserved so old patient links cannot be reassigned."
    );
    expect(archivedPage).toContain('aria-label="Copy clinic name"');
    expect(archivedPage).toContain(`Type ${name} to confirm`);
    expect(archivedPage).not.toContain(">Reactivate clinic<");
    const deleted = await permanentlyDeleteClinic({
      clinicId: created.id,
      operatorUserId: OPERATOR_ID,
      confirmation: name,
      storage: null,
    });
    expect(deleted.ok).toBe(true);
    expect(
      await db().clinic.findUnique({ where: { id: created.id } })
    ).toBeNull();
    expect(
      await db().clinicSite.count({ where: { clinicId: created.id } })
    ).toBe(0);
    expect(
      await db().user.findUnique({ where: { id: member.id } })
    ).not.toBeNull();
    expect(
      await db().account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: "credentials",
            providerAccountId: `${PREFIX}gone-account`,
          },
        },
      })
    ).not.toBeNull();
    expect(
      await db().session.findUnique({
        where: { sessionToken: `${PREFIX}gone-session` },
      })
    ).not.toBeNull();
    expect(
      await db().accountToken.findUnique({ where: { id: reset.id } })
    ).not.toBeNull();
    const retired = await db().retiredTenantSlug.findUnique({
      where: { slug: site.slug },
    });
    expect(retired?.formerClinicId).toBeNull();
    await expect(
      createOperatorClinic({
        name: "Reuse",
        slug: site.slug,
        serviceCategories: ["DENTAL"],
      })
    ).rejects.toThrow(RETIRED_TENANT_SLUG_MESSAGE);
    const goneHost = await proxy(
      new NextRequest(`http://${site.slug}.localhost:3000/`, {
        headers: { host: `${site.slug}.localhost:3000` },
      })
    );
    expect(goneHost.status).toBe(410);
    expect(await goneHost.text()).toBe(RETIRED_TENANT_MESSAGE);
    expect(
      await reactivateClinic({
        clinicId: created.id,
        operatorUserId: OPERATOR_ID,
      })
    ).toEqual({ ok: false, error: CLINIC_STATUS_NOT_FOUND_MESSAGE });
    expect(
      await unarchiveClinic({
        clinicId: created.id,
        operatorUserId: OPERATOR_ID,
      })
    ).toEqual({ ok: false, error: CLINIC_STATUS_NOT_FOUND_MESSAGE });
    expect(
      await archiveClinic({
        clinicId: created.id,
        operatorUserId: OPERATOR_ID,
        confirmation: name,
      })
    ).toEqual({ ok: false, error: CLINIC_STATUS_NOT_FOUND_MESSAGE });
  });

  it("refuses deletion when billing or legal records must stay", async () => {
    const legal = await fresh(`${PREFIX}legal`, "Carc Legal");
    const user = await db().user.create({
      data: {
        email: `${PREFIX}legal-user@example.com`,
        platformRole: PlatformRole.NONE,
      },
    });
    await db().legalAcceptance.create({
      data: {
        clinicId: legal.id,
        userId: user.id,
        termsVersion: "2026-10-01",
        privacyVersionAcknowledged: "2026-10-01",
        source: "BILLING_CHECKOUT",
      },
    });
    expect(await archive(legal.id)).toEqual({ ok: true });
    const legalDelete = await permanentlyDeleteClinic({
      clinicId: legal.id,
      operatorUserId: OPERATOR_ID,
      confirmation: "Carc Legal",
      storage: null,
    });
    expect(legalDelete).toMatchObject({
      ok: false,
      error: PERMANENT_DELETION_MESSAGES.retained_records,
    });
    expect(
      await db().clinic.findUnique({ where: { id: legal.id } })
    ).toMatchObject({
      archivedAt: expect.any(Date),
    });
    expect(
      await db().legalAcceptance.count({ where: { clinicId: legal.id } })
    ).toBe(1);

    const paid = await fresh(`${PREFIX}paid`, "Carc Paid");
    await db().clinicEntitlement.create({
      data: {
        clinicId: paid.id,
        commercialPlan: "ESSENTIAL",
        billingInterval: "MONTHLY",
        billingStatus: "ACTIVE",
        entitlementStatus: "ACTIVE",
      },
    });
    expect(await archive(paid.id)).toEqual({ ok: true });
    const paidDelete = await permanentlyDeleteClinic({
      clinicId: paid.id,
      operatorUserId: OPERATOR_ID,
      confirmation: "Carc Paid",
      storage: null,
    });
    expect(paidDelete.ok).toBe(false);
    if (!paidDelete.ok) {
      expect(paidDelete.blockers.map((blocker) => blocker.code)).toEqual(
        expect.arrayContaining(["subscription", "retained_records"])
      );
      expect(paidDelete.error).toBe(PERMANENT_DELETION_MESSAGES.subscription);
    }
    expect(
      await db().clinic.findUnique({ where: { id: paid.id } })
    ).not.toBeNull();
  });

  it("keeps a legacy destructive tombstone terminal and hidden", async () => {
    const name = "Carc Legacy";
    const slug = `${PREFIX}legacy`;
    const created = await fresh(slug, name);
    await db().clinicLocation.deleteMany({ where: { clinicId: created.id } });
    await db().clinicSiteServiceCategory.deleteMany({
      where: { clinicId: created.id },
    });
    await db().clinicSite.deleteMany({ where: { clinicId: created.id } });
    await db().clinic.update({
      where: { id: created.id },
      data: {
        deactivatedAt: new Date("2026-09-01T00:00:00.000Z"),
        deactivatedByUserId: OPERATOR_ID,
        permanentlyDeletedAt: new Date("2026-09-02T00:00:00.000Z"),
        permanentlyDeletedByUserId: OPERATOR_ID,
        archivedAt: null,
        archivedByUserId: null,
      },
    });
    await db().retiredTenantSlug.create({
      data: {
        slug,
        formerClinicId: created.id,
        retiredAt: new Date("2026-09-02T00:00:00.000Z"),
      },
    });

    expect(await archive(created.id)).toEqual({
      ok: false,
      error: CLINIC_ALREADY_TERMINAL_MESSAGE,
    });
    expect(
      await unarchiveClinic({
        clinicId: created.id,
        operatorUserId: OPERATOR_ID,
      })
    ).toEqual({
      ok: false,
      error: CLINIC_PERMANENTLY_DELETED_REACTIVATE_MESSAGE,
    });
    expect(
      await reactivateClinic({
        clinicId: created.id,
        operatorUserId: OPERATOR_ID,
      })
    ).toEqual({
      ok: false,
      error: CLINIC_PERMANENTLY_DELETED_REACTIVATE_MESSAGE,
    });
    expect(
      (await canPermanentlyDeleteClinic(created.id, { storage: null }))
        .blockers[0]?.code
    ).toBe("already_deleted");
    expect(
      await db().clinic.findUnique({
        where: { id: created.id },
        select: { archivedAt: true, permanentlyDeletedAt: true },
      })
    ).toMatchObject({
      archivedAt: null,
      permanentlyDeletedAt: new Date("2026-09-02T00:00:00.000Z"),
    });
    expect(
      await db().clinicSite.count({ where: { clinicId: created.id } })
    ).toBe(0);

    const listed = await listOperatorClinics();
    for (const activity of ["active", "inactive", "archived"] as const) {
      expect(
        selectOperatorClinicActivity(listed, activity).some(
          (clinic) => clinic.id === created.id
        )
      ).toBe(false);
    }
    const history = renderToStaticMarkup(
      await OperatorClinicDetailPage({
        params: Promise.resolve({ clinicId: created.id }),
      })
    );
    expect(history).toContain("previous lifecycle");
    expect(history).toContain("cannot be archived");
    expect(history).not.toContain("Unarchive clinic");
    const legacyHost = await proxy(
      new NextRequest(`http://${slug}.localhost:3000/`, {
        headers: { host: `${slug}.localhost:3000` },
      })
    );
    expect(legacyHost.status).toBe(410);
  });

  it("still discards a pristine shell and refuses an archived shell", async () => {
    const pristine = await fresh(`${PREFIX}pristine`, "Carc Pristine");
    expect(await discardAssistedClinic(pristine.id)).toEqual({ ok: true });
    expect(
      await db().clinic.findUnique({ where: { id: pristine.id } })
    ).toBeNull();
    expect(
      await db().retiredTenantSlug.count({
        where: { slug: `${PREFIX}pristine` },
      })
    ).toBe(0);

    const archived = await fresh(`${PREFIX}shell`, "Carc Shell");
    expect(await archive(archived.id)).toEqual({ ok: true });
    expect(await discardAssistedClinic(archived.id)).toEqual({
      ok: false,
      error: DISCARD_NOT_PRISTINE_MESSAGE,
    });
    expect(
      await db().clinic.findUnique({
        where: { id: archived.id },
        select: { slug: true, archivedAt: true },
      })
    ).toMatchObject({ slug: `${PREFIX}shell`, archivedAt: expect.any(Date) });
  });

  it("uses the inactive message after unarchive", async () => {
    const created = await fresh(`${PREFIX}msg`, "Carc Message");
    expect(await archive(created.id)).toEqual({ ok: true });
    expect(
      await unarchiveClinic({
        clinicId: created.id,
        operatorUserId: OPERATOR_ID,
      })
    ).toEqual({ ok: true });
    expect(
      await resendClinicInvitation({
        clinicId: created.id,
        userId: OPERATOR_ID,
        invitedByUserId: OPERATOR_ID,
      })
    ).toEqual({ ok: false, error: CLINIC_INACTIVE_MESSAGE });
  });
});
