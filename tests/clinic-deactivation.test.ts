import "dotenv/config";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AccountTokenType,
  BillingInterval,
  BillingStatus,
  CommercialPlan,
  EntitlementStatus,
  GuideRevisionStatus,
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
import ClinicTeamPage from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/team/page";
import { loadBillingPageContext } from "@/app/(staff)/account/billing/billing-context";
import { getClinicBySlug } from "@/lib/aftercare/get-clinic-by-slug";
import { getPatientLocation } from "@/lib/aftercare/get-patient-location";
import { getPublishedPracticeGuide } from "@/lib/aftercare/get-published-practice-guide";
import { resolveRetiredLocationRedirectForTenant } from "@/lib/aftercare/patient-location-redirect";
import { createAccountSplitPreparation } from "@/lib/account-split/preparation";
import {
  completeInvitation,
  createInvitationToken,
  inspectInvitation,
} from "@/lib/auth/account-token-service";
import { hashPassword } from "@/lib/auth/password";
import { loadClinicAccess } from "@/lib/auth/clinic-authorization";
import { enforcePrePaymentActivationGate } from "@/lib/billing/activation-gate";
import { grantComplimentaryAccess } from "@/lib/billing/complimentary-access";
import { createClinicCheckout } from "@/lib/billing/checkout";
import {
  prepareNegotiatedOffer,
  startNegotiatedCheckout,
} from "@/lib/billing/negotiated-offer";
import { prepareClinicCommercialOffer } from "@/lib/billing/prepare-offer";
import { CLINIC_INACTIVE_MESSAGE } from "@/lib/clinics/clinic-activity";
import {
  CLINIC_DEACTIVATION_SPLIT_MESSAGE,
  deactivateClinic,
  reactivateClinic,
} from "@/lib/clinics/clinic-deactivation";
import { createClinicLocationRedirect } from "@/lib/clinics/location-redirect";
import {
  createClinicLocation,
  createClinicSiteWithRootLocation,
} from "@/lib/clinics/site-location-mutations";
import { isLocalDevelopmentDatabase } from "@/lib/dev/database-target";
import { createOperatorClinic } from "@/lib/operator/create-operator-clinic";
import {
  DISCARD_NOT_PRISTINE_MESSAGE,
  discardAssistedClinic,
} from "@/lib/operator/discard-assisted-clinic";
import { getOperatorClinic } from "@/lib/operator/get-operator-clinic";
import { inviteClinicUser } from "@/lib/operator/invite-clinic-user";
import {
  listOperatorClinics,
  selectOperatorClinicActivity,
} from "@/lib/operator/list-operator-clinics";
import { resendClinicInvitation } from "@/lib/operator/resend-clinic-invitation";
import { summarizeOperatorClinics } from "@/lib/operator/summarize-operator-clinics";
import { getPrisma } from "@/lib/prisma";
import { PUBLIC_PATIENT_PATH_HEADER } from "@/lib/tenancy/public-patient-path";

const PREFIX = "cdea-";
const OPERATOR_ID = "cdea_operator";
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
  membership: null as {
    membershipId: string;
    role: "ADMIN";
    clinic: { id: string; name: string };
    source?: "membership" | "operator_support";
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
      clinicMembership: authState.membership,
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
    expect(digest).not.toContain(";308;");
    return;
  }
  throw new Error("expected not found");
}

async function expectRedirect(
  run: () => Promise<unknown>,
  href: string
): Promise<void> {
  try {
    await run();
  } catch (error) {
    const digest = String((error as { digest?: string }).digest ?? "");
    expect(digest).toContain(";308;");
    expect(digest).toContain(href);
    return;
  }
  throw new Error(`expected permanent redirect to ${href}`);
}

async function cleanup(): Promise<void> {
  const prisma = db();
  await prisma.clinicLocationRedirect.deleteMany({
    where: {
      OR: [
        { sourceClinicSite: { slug: { startsWith: PREFIX } } },
        { destinationClinicSite: { slug: { startsWith: PREFIX } } },
      ],
    },
  });
  await prisma.clinic.deleteMany({
    where: { slug: { startsWith: PREFIX } },
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
      name: "Cdea Operator",
      platformRole: PlatformRole.OPERATOR,
      passwordHash: hashPassword("cdea-operator-password"),
    },
  });
}

async function fresh(slug: string, name = "Cdea Clinic") {
  return createOperatorClinic({
    name,
    slug,
    serviceCategories: ["DENTAL"],
  });
}

describeDb("reversible clinic deactivation", () => {
  beforeAll(async () => {
    await ensureOperator();
  });

  beforeEach(async () => {
    headerState.publicPath = null;
    authState.user = {
      id: OPERATOR_ID,
      email: `${PREFIX}operator@example.com`,
      name: "Cdea Operator",
      platformRole: "OPERATOR",
    };
    authState.membership = null;
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await db().user.deleteMany({ where: { id: OPERATOR_ID } });
    await db().$disconnect();
  });

  it("deactivates and reactivates without changing child, billing, or Stripe state", async () => {
    const created = await fresh(`${PREFIX}main`, "Cdea Harbour Dental");
    const clinicId = created.id;
    const site = await db().clinicSite.findFirstOrThrow({
      where: { clinicId, isPrimary: true },
    });
    const location = await db().clinicLocation.findFirstOrThrow({
      where: { clinicId, servesSiteRoot: true },
    });
    await db().clinicLocation.create({
      data: {
        clinicId,
        clinicSiteId: site.id,
        name: "West room",
        slug: `${PREFIX}west`,
        displayName: "West room",
        active: true,
        servesSiteRoot: false,
        isPrimary: false,
      },
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
    const revision = await db().practiceGuideRevision.create({
      data: {
        practiceGuideId: guide.id,
        version: 1,
        status: GuideRevisionStatus.PUBLISHED,
        title: "Extraction",
        publishedAt: new Date("2026-10-01T00:00:00.000Z"),
      },
    });
    await db().practiceGuidePlacement.create({
      data: {
        practiceGuideId: guide.id,
        locationId: location.id,
        clinicId,
        publishedPracticeGuideRevisionId: revision.id,
        publicSlug: `${PREFIX}guide`,
        isEnabled: true,
      },
    });
    const member = await db().user.create({
      data: {
        email: `${PREFIX}member@example.com`,
        name: "Cdea Member",
        platformRole: PlatformRole.NONE,
        passwordHash: hashPassword("cdea-member-password"),
      },
    });
    const membership = await db().clinicMembership.create({
      data: { clinicId, userId: member.id, role: "ADMIN", active: true },
    });
    await db().clinic.update({
      where: { id: clinicId },
      data: { assistedOnboarding: false },
    });
    const granted = await grantComplimentaryAccess({
      actorUserId: OPERATOR_ID,
      actorPlatformRole: PlatformRole.OPERATOR,
      clinicId,
      commercialPlan: "ESSENTIAL",
      duration: "SIX_MONTHS",
      reason: "Collaboration for the deactivation test.",
      now: new Date("2026-10-01T00:00:00.000Z"),
    });
    expect(granted.ok).toBe(true);
    await db().clinicBillingProfile.create({
      data: {
        clinicId,
        stripeCustomerId: `${PREFIX}cus`,
        stripeSubscriptionId: `${PREFIX}sub`,
        stripeSubscriptionScheduleId: `${PREFIX}sched`,
        stripeCheckoutSessionId: `${PREFIX}cs`,
      },
    });
    const pendingUser = await db().user.create({
      data: {
        email: `${PREFIX}pending@example.com`,
        name: "Pending Person",
        platformRole: PlatformRole.NONE,
      },
    });
    const invited = await createInvitationToken({
      userId: pendingUser.id,
      clinicId,
      role: "STAFF",
      email: pendingUser.email,
      invitedByUserId: OPERATOR_ID,
    });
    const consumedUser = await db().user.create({
      data: {
        email: `${PREFIX}consumed@example.com`,
        name: "Consumed Person",
        platformRole: PlatformRole.NONE,
      },
    });
    const consumedInvite = await createInvitationToken({
      userId: consumedUser.id,
      clinicId,
      role: "STAFF",
      email: consumedUser.email,
      invitedByUserId: OPERATOR_ID,
    });
    const consumed = await completeInvitation({
      rawToken: consumedInvite.rawToken,
      passwordHash: hashPassword("cdea-consumed-password"),
    });
    expect(consumed.ok).toBe(true);
    const reset = await db().accountToken.create({
      data: {
        type: AccountTokenType.PASSWORD_RESET,
        tokenHash: `${PREFIX}reset-hash`,
        userId: member.id,
        email: member.email,
        expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      },
    });
    const before = await snapshot(clinicId);

    const deactivated = await deactivateClinic({
      clinicId,
      operatorUserId: OPERATOR_ID,
      now: new Date("2026-10-05T01:02:00.000Z"),
    });
    expect(deactivated).toEqual({ ok: true });

    const after = await snapshot(clinicId);
    expect(after.clinic.deactivatedAt?.toISOString()).toBe(
      "2026-10-05T01:02:00.000Z"
    );
    expect(after.clinic.deactivatedByUserId).toBe(OPERATOR_ID);
    expect(after.site.active).toBe(before.site.active);
    expect(after.location.active).toBe(before.location.active);
    expect(after.location.deactivatedAt).toEqual(before.location.deactivatedAt);
    expect(after.extraLocation).toMatchObject({
      active: true,
      deactivatedAt: null,
    });
    expect(after.guide).toMatchObject({
      status: PracticeGuideStatus.PUBLISHED,
      isEnabled: true,
    });
    expect(after.membership.active).toBe(true);
    expect(after.entitlement).toMatchObject(before.entitlement ?? {});
    expect(after.profile).toEqual(before.profile);
    const pendingToken = await db().accountToken.findFirstOrThrow({
      where: { userId: pendingUser.id, clinicId, type: "INVITATION" },
    });
    expect(pendingToken.revokedAt?.toISOString()).toBe(
      "2026-10-05T01:02:00.000Z"
    );
    expect(pendingToken.consumedAt).toBeNull();
    const consumedToken = await db().accountToken.findUniqueOrThrow({
      where: { id: consumedInvite.token.id },
    });
    expect(consumedToken.consumedAt).not.toBeNull();
    expect(consumedToken.revokedAt).toBeNull();
    const resetToken = await db().accountToken.findUniqueOrThrow({
      where: { id: reset.id },
    });
    expect(resetToken.revokedAt).toBeNull();
    expect(
      readFileSync("lib/clinics/clinic-deactivation.ts", "utf8")
    ).not.toContain("stripe");

    const access = await loadClinicAccess(
      { id: member.id, platformRole: PlatformRole.NONE },
      clinicId
    );
    expect(access.activeMembership?.id).toBe(membership.id);
    await expectNotFound(() =>
      enforcePrePaymentActivationGate({
        clinic: { id: clinicId, name: "Cdea Harbour Dental" },
        source: "membership",
      })
    );
    authState.user = {
      id: member.id,
      email: member.email,
      name: member.name,
      platformRole: "NONE",
    };
    authState.membership = {
      membershipId: membership.id,
      role: "ADMIN",
      clinic: { id: clinicId, name: "Cdea Harbour Dental" },
      source: "membership",
    };
    await expectNotFound(() => loadBillingPageContext());

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
      startNegotiatedCheckout({
        clinicId,
        userId: member.id,
        acceptNegotiatedTerms: true,
        successUrl: "http://app.localhost:3000/account/billing/complete",
        cancelUrl: "http://app.localhost:3000/account/billing/setup",
        db: db() as never,
        stripe: stripe as never,
      })
    ).resolves.toMatchObject({ ok: false, code: "checkout_unavailable" });

    expect(
      await inviteClinicUser({
        clinicId,
        invitedByUserId: OPERATOR_ID,
        name: "New Person",
        email: `${PREFIX}new@example.com`,
        role: "STAFF",
      })
    ).toMatchObject({ ok: false, code: "clinic_inactive" });
    await expect(
      createInvitationToken({
        userId: pendingUser.id,
        clinicId,
        role: "STAFF",
        email: pendingUser.email,
        invitedByUserId: OPERATOR_ID,
      })
    ).rejects.toThrow(/invalid_invitation/);
    expect(
      await resendClinicInvitation({
        clinicId,
        userId: pendingUser.id,
        invitedByUserId: OPERATOR_ID,
      })
    ).toEqual({ ok: false, error: CLINIC_INACTIVE_MESSAGE });
    expect(await inspectInvitation(invited.rawToken)).toEqual({ valid: false });
    expect(
      await completeInvitation({
        rawToken: invited.rawToken,
        passwordHash: hashPassword("cdea-accept-password"),
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
    ).rejects.toThrow(CLINIC_INACTIVE_MESSAGE);
    await expect(
      createClinicSiteWithRootLocation({
        clinicId,
        values: {
          siteName: "Second site",
          siteSlug: `${PREFIX}second`,
          locationName: "Second root",
          locationDisplayName: "Second root",
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
          serviceCategories: ["DENTAL"],
        },
      })
    ).rejects.toThrow(CLINIC_INACTIVE_MESSAGE);
    await expect(
      createAccountSplitPreparation({
        sourceClinicId: clinicId,
        keptClinicSiteId: site.id,
        destinationPlan: CommercialPlan.ESSENTIAL,
        destinationBillingInterval: BillingInterval.MONTHLY,
        operatorUserId: OPERATOR_ID,
      })
    ).rejects.toThrow(CLINIC_INACTIVE_MESSAGE);
    expect(
      await grantComplimentaryAccess({
        actorUserId: OPERATOR_ID,
        actorPlatformRole: PlatformRole.OPERATOR,
        clinicId,
        commercialPlan: "PRACTICE",
        duration: "SIX_MONTHS",
        reason: "Should not grant while inactive.",
      })
    ).toEqual({ ok: false, error: CLINIC_INACTIVE_MESSAGE });
    expect(
      await prepareClinicCommercialOffer({
        clinicId,
        commercialPlan: "ESSENTIAL",
        billingInterval: "MONTHLY",
      })
    ).toMatchObject({ ok: false, message: CLINIC_INACTIVE_MESSAGE });
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
    ).toEqual({ ok: false, error: CLINIC_INACTIVE_MESSAGE });

    expect(await getClinicBySlug(site.slug)).toBeNull();
    expect(
      await getPatientLocation({
        siteSlug: site.slug,
        locationSlug: `${PREFIX}west`,
      })
    ).toBeNull();
    expect(
      await getPublishedPracticeGuide({
        clinicSlug: site.slug,
        publicSlug: `${PREFIX}guide`,
      })
    ).toBeNull();
    headerState.publicPath = "/";
    await expectNotFound(() =>
      TenantLayout({
        params: Promise.resolve({ tenant: site.slug }),
        children: createElement("p", null, "patient-child"),
      })
    );
    headerState.publicPath = `/${PREFIX}west`;
    await expectNotFound(() =>
      TenantLayout({
        params: Promise.resolve({ tenant: site.slug }),
        children: createElement("p", null, "location-child"),
      })
    );
    headerState.publicPath = `/${PREFIX}guide`;
    await expectNotFound(() =>
      TenantLayout({
        params: Promise.resolve({ tenant: site.slug }),
        children: createElement("p", null, "guide-child"),
      })
    );

    const destination = await fresh(`${PREFIX}dest`, "Cdea Destination");
    const destinationSite = await db().clinicSite.findFirstOrThrow({
      where: { clinicId: destination.id, isPrimary: true },
    });
    const preparation = await db().clinicAccountSplitPreparation.create({
      data: {
        sourceClinicId: clinicId,
        keptClinicSiteId: site.id,
        destinationPlan: CommercialPlan.ESSENTIAL,
        destinationBillingInterval: BillingInterval.MONTHLY,
        preparedByUserId: OPERATOR_ID,
        status: "COMPLETED",
      },
    });
    await db().$transaction((tx) =>
      createClinicLocationRedirect({
        tx,
        preparationId: preparation.id,
        sourceClinicSiteId: site.id,
        destinationClinicSiteId: destinationSite.id,
        fromSlug: `${PREFIX}old`,
      })
    );
    headerState.publicPath = `/${PREFIX}old`;
    expect(
      await resolveRetiredLocationRedirectForTenant({
        tenantSlug: site.slug,
        fromSlug: `${PREFIX}old`,
        path: { kind: "landing" },
      })
    ).toBeNull();
    await expectNotFound(() =>
      TenantLayout({
        params: Promise.resolve({ tenant: site.slug }),
        children: createElement("p", null, "redirect-child"),
      })
    );

    const reactivated = await reactivateClinic({
      clinicId,
      operatorUserId: OPERATOR_ID,
    });
    expect(reactivated).toEqual({ ok: true });
    const restored = await db().clinic.findUniqueOrThrow({
      where: { id: clinicId },
      select: { deactivatedAt: true, deactivatedByUserId: true, slug: true },
    });
    expect(restored).toMatchObject({
      deactivatedAt: null,
      deactivatedByUserId: null,
      slug: `${PREFIX}main`,
    });
    expect(await getClinicBySlug(site.slug)).toMatchObject({ id: clinicId });
    expect(
      await getPatientLocation({
        siteSlug: site.slug,
        locationSlug: `${PREFIX}west`,
      })
    ).toMatchObject({ locationSlug: `${PREFIX}west` });
    expect(
      await getPublishedPracticeGuide({
        clinicSlug: site.slug,
        publicSlug: `${PREFIX}guide`,
      })
    ).toMatchObject({ title: "Extraction" });
    const html = renderToStaticMarkup(
      await TenantLayout({
        params: Promise.resolve({ tenant: site.slug }),
        children: createElement("p", null, "patient-child"),
      })
    );
    expect(html).toContain("patient-child");
    const pendingAfter = await db().accountToken.findUniqueOrThrow({
      where: { id: pendingToken.id },
    });
    expect(pendingAfter.revokedAt).not.toBeNull();
    expect(pendingAfter.consumedAt).toBeNull();
    expect(
      await completeInvitation({
        rawToken: invited.rawToken,
        passwordHash: hashPassword("cdea-accept-password"),
      })
    ).toEqual({ ok: false, reason: "revoked" });
    await expect(
      createOperatorClinic({
        name: "Duplicate slug",
        slug: `${PREFIX}main`,
        serviceCategories: ["DENTAL"],
      })
    ).rejects.toThrow("That tenant slug is already in use.");

    authState.user = {
      id: OPERATOR_ID,
      email: `${PREFIX}operator@example.com`,
      name: "Cdea Operator",
      platformRole: "OPERATOR",
    };
    authState.membership = null;
    await db().clinic.update({
      where: { id: clinicId },
      data: {
        deactivatedAt: new Date("2026-10-05T01:02:00.000Z"),
        deactivatedByUserId: OPERATOR_ID,
      },
    });
    const detail = renderToStaticMarkup(
      await OperatorClinicDetailPage({
        params: Promise.resolve({ clinicId }),
      })
    );
    expect(detail).toContain("Clinic status");
    expect(detail).toContain("Status: Inactive");
    expect(detail).toContain("Reactivate clinic");
    expect(detail).toContain("Deactivate site");
    expect(detail).toContain("Billing setup");
    expect(detail).not.toContain(">Deactivate clinic<");
    const team = renderToStaticMarkup(
      await ClinicTeamPage({
        params: Promise.resolve({ clinicId }),
        searchParams: Promise.resolve({}),
      })
    );
    expect(team).toContain(member.email);

    const listed = await listOperatorClinics();
    const active = selectOperatorClinicActivity(listed, "active");
    const inactive = selectOperatorClinicActivity(listed, "inactive");
    expect(active.some((clinic) => clinic.id === clinicId)).toBe(false);
    expect(inactive.some((clinic) => clinic.id === clinicId)).toBe(true);
    expect(summarizeOperatorClinics(active).totalClinics).toBe(active.length);
    expect(summarizeOperatorClinics(active).totalClinics).toBe(
      listed.length - inactive.length
    );
    const activePage = renderToStaticMarkup(
      await OperatorClinicsPage({
        searchParams: Promise.resolve({}),
      })
    );
    expect(activePage).not.toContain("Cdea Harbour Dental");
    expect(activePage).toContain("Active");
    const inactivePage = renderToStaticMarkup(
      await OperatorClinicsPage({
        searchParams: Promise.resolve({ activity: "inactive" }),
      })
    );
    expect(inactivePage).toContain("Cdea Harbour Dental");
    expect(inactivePage).toContain(`/operator/clinics/${clinicId}`);
    expect(inactivePage).toContain("Inactive");
  });

  it("keeps an inactive site redirect on an active clinic and blocks an open split", async () => {
    const source = await fresh(`${PREFIX}src`, "Cdea Source");
    const destination = await fresh(`${PREFIX}dst`, "Cdea Dest");
    const sourceSite = await db().clinicSite.findFirstOrThrow({
      where: { clinicId: source.id, isPrimary: true },
    });
    const destinationSite = await db().clinicSite.findFirstOrThrow({
      where: { clinicId: destination.id, isPrimary: true },
    });
    const preparation = await db().clinicAccountSplitPreparation.create({
      data: {
        sourceClinicId: source.id,
        keptClinicSiteId: sourceSite.id,
        destinationPlan: CommercialPlan.ESSENTIAL,
        destinationBillingInterval: BillingInterval.MONTHLY,
        preparedByUserId: OPERATOR_ID,
        status: "COMPLETED",
      },
    });
    await db().$transaction((tx) =>
      createClinicLocationRedirect({
        tx,
        preparationId: preparation.id,
        sourceClinicSiteId: sourceSite.id,
        destinationClinicSiteId: destinationSite.id,
        fromSlug: `${PREFIX}retired`,
      })
    );
    await db().clinicSite.update({
      where: { id: sourceSite.id },
      data: { active: false },
    });
    headerState.publicPath = `/${PREFIX}retired`;
    await expectRedirect(
      () =>
        TenantLayout({
          params: Promise.resolve({ tenant: sourceSite.slug }),
          children: createElement("p", null, "hidden"),
        }),
      `http://${PREFIX}dst.localhost:3000/`
    );

    const blocked = await fresh(`${PREFIX}split`, "Cdea Split");
    const blockedSite = await db().clinicSite.findFirstOrThrow({
      where: { clinicId: blocked.id, isPrimary: true },
    });
    await db().clinicAccountSplitPreparation.create({
      data: {
        sourceClinicId: blocked.id,
        keptClinicSiteId: blockedSite.id,
        destinationPlan: CommercialPlan.ESSENTIAL,
        destinationBillingInterval: BillingInterval.MONTHLY,
        preparedByUserId: OPERATOR_ID,
        status: "DRAFT",
      },
    });
    expect(
      await deactivateClinic({
        clinicId: blocked.id,
        operatorUserId: OPERATOR_ID,
      })
    ).toEqual({ ok: false, error: CLINIC_DEACTIVATION_SPLIT_MESSAGE });
    expect(
      await db().clinic.findUnique({
        where: { id: blocked.id },
        select: { deactivatedAt: true },
      })
    ).toEqual({ deactivatedAt: null });
  });

  it("refuses deactivation when an open split names the clinic as destination", async () => {
    const source = await fresh(`${PREFIX}src-open`, "Cdea Open Source");
    const destination = await fresh(`${PREFIX}dst-open`, "Cdea Open Dest");
    const sourceSite = await db().clinicSite.findFirstOrThrow({
      where: { clinicId: source.id, isPrimary: true },
    });
    await db().clinicAccountSplitPreparation.create({
      data: {
        sourceClinicId: source.id,
        destinationClinicId: destination.id,
        keptClinicSiteId: sourceSite.id,
        destinationPlan: CommercialPlan.GROUP,
        destinationBillingInterval: BillingInterval.MONTHLY,
        preparedByUserId: OPERATOR_ID,
        status: "DESTINATION_READY",
        operationKind: "SITE_TO_EXISTING_GROUP",
      },
    });
    expect(
      await deactivateClinic({
        clinicId: destination.id,
        operatorUserId: OPERATOR_ID,
      })
    ).toEqual({ ok: false, error: CLINIC_DEACTIVATION_SPLIT_MESSAGE });
    expect(
      await deactivateClinic({
        clinicId: source.id,
        operatorUserId: OPERATOR_ID,
      })
    ).toEqual({ ok: false, error: CLINIC_DEACTIVATION_SPLIT_MESSAGE });
    expect(
      await db().clinic.findUnique({
        where: { id: destination.id },
        select: { deactivatedAt: true },
      })
    ).toEqual({ deactivatedAt: null });
    expect(
      await db().clinic.findUnique({
        where: { id: source.id },
        select: { deactivatedAt: true },
      })
    ).toEqual({ deactivatedAt: null });
  });

  it("still discards a pristine clinic and refuses a deactivated real clinic", async () => {
    const pristine = await fresh(`${PREFIX}pristine`, "Cdea Pristine");
    expect(await discardAssistedClinic(pristine.id)).toEqual({ ok: true });
    expect(
      await db().clinic.findUnique({ where: { id: pristine.id } })
    ).toBeNull();

    const shell = await fresh(`${PREFIX}shell`, "Cdea Shell");
    expect(
      await deactivateClinic({
        clinicId: shell.id,
        operatorUserId: OPERATOR_ID,
      })
    ).toEqual({ ok: true });
    expect(await discardAssistedClinic(shell.id)).toEqual({ ok: true });

    const real = await fresh(`${PREFIX}real`, "Cdea Real");
    const member = await db().user.create({
      data: {
        email: `${PREFIX}real-member@example.com`,
        platformRole: PlatformRole.NONE,
        passwordHash: hashPassword("cdea-real-password"),
      },
    });
    await db().clinicMembership.create({
      data: { clinicId: real.id, userId: member.id, role: "ADMIN" },
    });
    expect(
      await deactivateClinic({
        clinicId: real.id,
        operatorUserId: OPERATOR_ID,
      })
    ).toEqual({ ok: true });
    expect(await discardAssistedClinic(real.id)).toEqual({
      ok: false,
      error: DISCARD_NOT_PRISTINE_MESSAGE,
    });
    expect(
      await db().clinic.findUnique({
        where: { id: real.id },
        select: { slug: true, deactivatedAt: true },
      })
    ).toMatchObject({ slug: `${PREFIX}real` });
    const detail = await getOperatorClinic(real.id);
    expect(detail?.deactivatedAt).toBeInstanceOf(Date);
  });
});

async function snapshot(clinicId: string) {
  const prisma = db();
  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: clinicId },
    select: { deactivatedAt: true, deactivatedByUserId: true },
  });
  const site = await prisma.clinicSite.findFirstOrThrow({
    where: { clinicId, isPrimary: true },
    select: { active: true },
  });
  const location = await prisma.clinicLocation.findFirstOrThrow({
    where: { clinicId, servesSiteRoot: true },
    select: { active: true, deactivatedAt: true },
  });
  const extraLocation = await prisma.clinicLocation.findFirstOrThrow({
    where: { clinicId, slug: `${PREFIX}west` },
    select: { active: true, deactivatedAt: true },
  });
  const guide = await prisma.practiceGuide.findFirstOrThrow({
    where: { clinicId },
    select: { status: true, isEnabled: true },
  });
  const membership = await prisma.clinicMembership.findFirstOrThrow({
    where: { clinicId, user: { email: `${PREFIX}member@example.com` } },
    select: { active: true },
  });
  const entitlement = await prisma.clinicEntitlement.findUnique({
    where: { clinicId },
    select: {
      entitlementStatus: true,
      billingStatus: true,
      commercialPlan: true,
      commercialArrangement: true,
      complimentaryExpiresAt: true,
      stripePriceId: true,
    },
  });
  const profile = await prisma.clinicBillingProfile.findUnique({
    where: { clinicId },
    select: {
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripeSubscriptionScheduleId: true,
      stripeCheckoutSessionId: true,
    },
  });
  return {
    clinic,
    site,
    location,
    extraLocation,
    guide,
    membership,
    entitlement,
    profile,
  };
}
