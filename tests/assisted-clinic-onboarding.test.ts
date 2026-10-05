import "dotenv/config";

import { readFileSync } from "node:fs";

import {
  AccountTokenType,
  ClinicMembershipRole,
  GuideRevisionStatus,
  PlatformRole,
  type PrismaClient,
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { invitationExpiresAt } from "@/lib/auth/account-token";
import { hashPassword } from "@/lib/auth/password";
import { readClinicBillingAccess } from "@/lib/billing/activation-gate";
import { grantComplimentaryAccess } from "@/lib/billing/complimentary-access";
import { prepareClinicCommercialOffer } from "@/lib/billing/prepare-offer";
import { listCanonicalGuideTemplates } from "@/lib/clinic-portal/list-canonical-templates";
import { isLocalDevelopmentDatabase } from "@/lib/dev/database-target";
import {
  clearTransactionalEmailMemoryInbox,
  getTransactionalEmailMemoryInbox,
} from "@/lib/email/transactional-mailer";
import {
  COMMERCIAL_SETUP_REQUIRED_MESSAGE,
  initialCommercialSetupIsValid,
  loadClinicOnboarding,
  onboardingProgress,
  ownerHandoffSteps,
} from "@/lib/operator/clinic-onboarding";
import { createOperatorClinic } from "@/lib/operator/create-operator-clinic";
import {
  OTHER_CLINIC_MEMBER_MESSAGE,
  PLATFORM_OPERATOR_INVITE_MESSAGE,
  inviteClinicUser,
} from "@/lib/operator/invite-clinic-user";
import { inviteFirstClinicAdministrator } from "@/lib/operator/invite-first-clinic-administrator";
import { resendClinicInvitation } from "@/lib/operator/resend-clinic-invitation";
import { getPrisma } from "@/lib/prisma";

const SLUG_PREFIX = "onbcd70-";
const TEMPLATE_PREFIX = "onbcd70_";
const EMAIL_PREFIX = "onbcd70-";
const OPERATOR_ID = `${TEMPLATE_PREFIX}operator`;
const local = isLocalDevelopmentDatabase(process.env.DATABASE_URL);
const describeDb = local ? describe : describe.skip;

describe("assisted clinic onboarding rules", () => {
  it("does not treat a missing entitlement as commercial setup or ready", () => {
    expect(initialCommercialSetupIsValid(null)).toBe(false);
    expect(
      initialCommercialSetupIsValid({
        commercialPlan: null,
        commercialArrangement: "PAID",
      })
    ).toBe(false);
    expect(
      initialCommercialSetupIsValid({
        commercialPlan: "ESSENTIAL",
        commercialArrangement: "COMPLIMENTARY",
      })
    ).toBe(true);
    expect(
      initialCommercialSetupIsValid({
        commercialPlan: "PRACTICE",
        commercialArrangement: "PAID",
      })
    ).toBe(true);
  });

  it("keeps the first administrator role on the server and the commercial gate inside the locked invite", () => {
    const invite = readFileSync("lib/operator/invite-clinic-user.ts", "utf8");
    const firstAdmin = readFileSync(
      "lib/operator/invite-first-clinic-administrator.ts",
      "utf8"
    );
    const actions = readFileSync(
      "app/(staff)/(operator)/operator/clinics/[clinicId]/setup/actions.ts",
      "utf8"
    );
    const page = readFileSync(
      "app/(staff)/(operator)/operator/clinics/[clinicId]/setup/page.tsx",
      "utf8"
    );
    const create = readFileSync(
      "app/(staff)/(operator)/operator/actions.ts",
      "utf8"
    );
    expect(invite.indexOf("lockClinicAccountStructure")).toBeGreaterThan(-1);
    expect(invite.indexOf("initialCommercialSetupIsValid")).toBeGreaterThan(
      invite.indexOf("lockClinicAccountStructure")
    );
    expect(firstAdmin).toContain("ClinicMembershipRole.ADMIN");
    expect(firstAdmin).not.toContain("input.role");
    expect(actions).toContain("requirePlatformOperator");
    expect(actions).toContain("inviteFirstClinicAdministrator");
    expect(actions).toContain("prepareClinicCommercialOffer");
    expect(actions).not.toContain('formData.get("role")');
    expect(actions).not.toContain("createInvitationToken");
    expect(actions).not.toContain("checkout.sessions");
    expect(page).toContain("requirePlatformOperator");
    expect(page).toContain("NegotiatedOfferPanel");
    expect(page).not.toContain("rawToken");
    expect(page).not.toContain("tokenHash");
    expect(create).toContain("/setup");
  });
});

describeDb("assisted clinic onboarding in the database", () => {
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
    await db().clinic.deleteMany({
      where: { slug: { startsWith: SLUG_PREFIX } },
    });
    await db().guideTemplate.deleteMany({
      where: { id: { startsWith: TEMPLATE_PREFIX } },
    });
    await db().user.deleteMany({
      where: {
        OR: [{ id: OPERATOR_ID }, { email: { startsWith: EMAIL_PREFIX } }],
      },
    });
  }

  async function operatorInput(clinicId: string) {
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

  it("marks a new clinic for assisted onboarding and leaves commercial setup incomplete", async () => {
    const created = await createOperatorClinic({
      name: "Onbcd70 Harbour Dental",
      slug: `${SLUG_PREFIX}harbour`,
      serviceCategories: ["DENTAL", "PHYSIOTHERAPY", "DENTAL"],
    });
    const clinic = await db().clinic.findUniqueOrThrow({
      where: { id: created.id },
      include: { entitlement: true, accountTokens: true, practiceGuides: true },
    });
    expect(clinic.assistedOnboarding).toBe(true);
    expect(clinic.entitlement).toBeNull();
    expect(clinic.accountTokens).toEqual([]);
    expect(clinic.practiceGuides).toEqual([]);

    const status = await loadClinicOnboarding(created.id);
    expect(status?.categoryLabels).toEqual(["Dental", "Physiotherapy"]);
    expect(status?.commercial.configured).toBe(false);
    expect(status?.administrator.state).toBe("not_invited");
    expect(status?.readyForClinicSetup).toBe(false);
    expect(onboardingProgress(status!).map((item) => item.label)).toEqual([
      "Clinic created",
      "Practice categories selected",
      "Commercial arrangement",
      "Administrator",
      "Ready for clinic setup",
    ]);
    expect(onboardingProgress(status!).map((item) => item.complete)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);

    const access = await readClinicBillingAccess({
      clinic: { id: created.id, name: clinic.name },
    });
    expect(access.kind).toBe("billing_required");
    expect(access.reason).not.toBe("legacy");

    const blocked = await inviteFirstClinicAdministrator({
      clinicId: created.id,
      invitedByUserId: OPERATOR_ID,
      name: "Harbour Admin",
      email: `${EMAIL_PREFIX}blocked@example.test`,
    });
    expect(blocked).toMatchObject({
      ok: false,
      code: "commercial_setup_required",
      error: COMMERCIAL_SETUP_REQUIRED_MESSAGE,
    });
    expect(
      await db().user.findUnique({
        where: { email: `${EMAIL_PREFIX}blocked@example.test` },
      })
    ).toBeNull();
  });

  it("grants complimentary Essential and Practice, then invites the first administrator", async () => {
    const essential = await createOperatorClinic({
      name: "Onbcd70 Essential",
      slug: `${SLUG_PREFIX}essential`,
      serviceCategories: ["DENTAL"],
    });
    const essentialGrant = await grantComplimentaryAccess({
      ...(await operatorInput(essential.id)),
      commercialPlan: "ESSENTIAL",
      duration: "SIX_MONTHS",
      reviewDate: "2027-04-01",
    });
    expect(essentialGrant).toMatchObject({
      ok: true,
      commercialPlan: "ESSENTIAL",
      indefinite: false,
    });
    const essentialStatus = await loadClinicOnboarding(essential.id);
    expect(essentialStatus?.commercial).toMatchObject({
      configured: true,
      kind: "complimentary",
      plan: "ESSENTIAL",
      arrangementLabel: "Complimentary",
    });
    expect(essentialStatus?.readyForClinicSetup).toBe(false);

    const practice = await createOperatorClinic({
      name: "Onbcd70 Practice",
      slug: `${SLUG_PREFIX}practice`,
      serviceCategories: ["PHYSIOTHERAPY"],
    });
    const practiceGrant = await grantComplimentaryAccess({
      ...(await operatorInput(practice.id)),
      commercialPlan: "PRACTICE",
      duration: "INDEFINITE",
    });
    expect(practiceGrant).toMatchObject({
      ok: true,
      commercialPlan: "PRACTICE",
      indefinite: true,
    });
    const practiceStatus = await loadClinicOnboarding(practice.id);
    expect(practiceStatus?.commercial).toMatchObject({
      configured: true,
      kind: "complimentary",
      plan: "PRACTICE",
    });
    expect(
      practiceStatus?.commercial.configured && practiceStatus.commercial.detail
    ).toContain("Indefinite");

    clearTransactionalEmailMemoryInbox();
    const now = new Date("2026-10-05T02:00:00.000Z");
    const invited = await inviteFirstClinicAdministrator({
      clinicId: essential.id,
      invitedByUserId: OPERATOR_ID,
      name: "Essential Admin",
      email: `${EMAIL_PREFIX}essential-admin@example.test`,
      now,
    });
    expect(invited).toMatchObject({
      ok: true,
      outcome: "INVITATION_SENT",
      delivered: true,
    });
    const token = await db().accountToken.findFirstOrThrow({
      where: {
        clinicId: essential.id,
        type: AccountTokenType.INVITATION,
      },
    });
    expect(token.role).toBe(ClinicMembershipRole.ADMIN);
    expect(token.tokenHash).toEqual(expect.any(String));
    expect(token.tokenHash).not.toContain("http");
    expect(token.expiresAt).toEqual(invitationExpiresAt(now));
    expect(token.consumedAt).toBeNull();
    const resumed = await loadClinicOnboarding(essential.id, now);
    expect(resumed?.administrator).toMatchObject({
      state: "invited",
      invitationStatus: "pending",
      email: `${EMAIL_PREFIX}essential-admin@example.test`,
    });
    expect(resumed?.readyForClinicSetup).toBe(true);
    expect(JSON.stringify(resumed)).not.toContain(token.tokenHash);
    expect(ownerHandoffSteps(resumed!).join(" ")).toContain("Create guide");
    expect(ownerHandoffSteps(resumed!).join(" ")).toContain("Sample and demo");
    expect(getTransactionalEmailMemoryInbox().length).toBeGreaterThan(0);

    const practiceInvite = await inviteClinicUser({
      clinicId: practice.id,
      invitedByUserId: OPERATOR_ID,
      name: "Practice Staff",
      email: `${EMAIL_PREFIX}practice-staff@example.test`,
      role: "STAFF",
    });
    expect(practiceInvite.ok).toBe(true);
    if (practiceInvite.ok && practiceInvite.outcome === "INVITATION_SENT") {
      const staffToken = await db().accountToken.findFirstOrThrow({
        where: { clinicId: practice.id, type: AccountTokenType.INVITATION },
      });
      expect(staffToken.role).toBe(ClinicMembershipRole.STAFF);
    }
    const practiceAdmin = await loadClinicOnboarding(practice.id);
    expect(practiceAdmin?.administrator.state).toBe("not_invited");
    expect(practiceAdmin?.readyForClinicSetup).toBe(false);
  });

  it("prepares standard Essential and Practice offers without Stripe objects", async () => {
    const essential = await createOperatorClinic({
      name: "Onbcd70 Paid Essential",
      slug: `${SLUG_PREFIX}paid-essential`,
      serviceCategories: ["CHIROPRACTIC"],
    });
    const practice = await createOperatorClinic({
      name: "Onbcd70 Paid Practice",
      slug: `${SLUG_PREFIX}paid-practice`,
      serviceCategories: ["COSMETIC_AESTHETIC"],
    });
    const essentialOffer = await prepareClinicCommercialOffer({
      clinicId: essential.id,
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
    });
    const practiceOffer = await prepareClinicCommercialOffer({
      clinicId: practice.id,
      commercialPlan: "PRACTICE",
      billingInterval: "YEARLY",
    });
    expect(essentialOffer).toEqual({ ok: true });
    expect(practiceOffer).toEqual({ ok: true });

    for (const [clinicId, plan, interval] of [
      [essential.id, "ESSENTIAL", "MONTHLY"],
      [practice.id, "PRACTICE", "YEARLY"],
    ] as const) {
      const entitlement = await db().clinicEntitlement.findUniqueOrThrow({
        where: { clinicId },
      });
      expect(entitlement).toMatchObject({
        commercialPlan: plan,
        billingInterval: interval,
        billingStatus: "OFFER_PREPARED",
        entitlementStatus: "PENDING",
        commercialArrangement: "PAID",
        stripePriceId: null,
      });
      expect(
        await db().clinicBillingProfile.findUnique({ where: { clinicId } })
      ).toBeNull();
      expect(
        await db().clinicNegotiatedOffer.count({ where: { clinicId } })
      ).toBe(0);
      const status = await loadClinicOnboarding(clinicId);
      expect(status?.commercial).toMatchObject({
        configured: true,
        kind: "standard_paid",
        plan,
        arrangementLabel: "Standard paid offer",
      });
      expect(status?.readyForClinicSetup).toBe(false);
      expect(ownerHandoffSteps(status!).join(" ")).toContain(
        "does not start Checkout"
      );
    }
  });

  it("keeps a failed commercial change resumable from the saved clinic", async () => {
    const created = await createOperatorClinic({
      name: "Onbcd70 Retry",
      slug: `${SLUG_PREFIX}retry`,
      serviceCategories: ["DENTAL"],
    });
    const denied = await grantComplimentaryAccess({
      ...(await operatorInput(created.id)),
      actorPlatformRole: PlatformRole.NONE,
      commercialPlan: "ESSENTIAL",
      duration: "SIX_MONTHS",
    });
    expect(denied.ok).toBe(false);
    expect(await loadClinicOnboarding(created.id)).toMatchObject({
      commercial: { configured: false },
      readyForClinicSetup: false,
    });

    const granted = await grantComplimentaryAccess({
      ...(await operatorInput(created.id)),
      commercialPlan: "ESSENTIAL",
      duration: "TWELVE_MONTHS",
    });
    expect(granted.ok).toBe(true);
    const blockedOffer = await prepareClinicCommercialOffer({
      clinicId: created.id,
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
    });
    expect(blockedOffer.ok).toBe(false);
    const status = await loadClinicOnboarding(created.id);
    expect(status?.commercial).toMatchObject({
      configured: true,
      kind: "complimentary",
      plan: "ESSENTIAL",
    });
  });

  it("reports failed invitation delivery and resends the same invitation", async () => {
    const created = await createOperatorClinic({
      name: "Onbcd70 Mail",
      slug: `${SLUG_PREFIX}mail`,
      serviceCategories: ["DENTAL"],
    });
    await grantComplimentaryAccess({
      ...(await operatorInput(created.id)),
      commercialPlan: "ESSENTIAL",
      duration: "SIX_MONTHS",
    });
    const savedFrom = process.env.AUTH_EMAIL_FROM;
    delete process.env.AUTH_EMAIL_FROM;
    try {
      const failed = await inviteFirstClinicAdministrator({
        clinicId: created.id,
        invitedByUserId: OPERATOR_ID,
        name: "Mail Admin",
        email: `${EMAIL_PREFIX}mail-admin@example.test`,
      });
      expect(failed).toMatchObject({
        ok: true,
        outcome: "INVITATION_SENT",
        delivered: false,
      });
    } finally {
      process.env.AUTH_EMAIL_FROM = savedFrom;
    }
    const pending = await loadClinicOnboarding(created.id);
    expect(pending?.administrator).toMatchObject({
      state: "invited",
      invitationStatus: "pending",
    });
    expect(pending?.readyForClinicSetup).toBe(true);
    if (pending?.administrator.state !== "invited") {
      throw new Error("Expected a pending administrator invitation.");
    }
    clearTransactionalEmailMemoryInbox();
    const resent = await resendClinicInvitation({
      clinicId: created.id,
      userId: pending.administrator.userId,
      invitedByUserId: OPERATOR_ID,
    });
    expect(resent).toMatchObject({ ok: true, delivered: true });
    expect(getTransactionalEmailMemoryInbox()).toHaveLength(1);

    await db().accountToken.updateMany({
      where: { clinicId: created.id, type: AccountTokenType.INVITATION },
      data: { expiresAt: new Date("2020-01-01T00:00:00.000Z") },
    });
    const expired = await loadClinicOnboarding(created.id);
    expect(expired?.administrator).toMatchObject({
      state: "invited",
      invitationStatus: "expired",
    });
    expect(expired?.readyForClinicSetup).toBe(false);
    expect(
      onboardingProgress(expired!).find((item) => item.id === "administrator")
    ).toMatchObject({
      label: "Administrator",
      complete: false,
    });
    expect(ownerHandoffSteps(expired!).join(" ")).toContain("Resend");
  });

  it("keeps existing-user and multi-clinic invitation guards", async () => {
    const clinic = await createOperatorClinic({
      name: "Onbcd70 Guards",
      slug: `${SLUG_PREFIX}guards`,
      serviceCategories: ["DENTAL"],
    });
    await grantComplimentaryAccess({
      ...(await operatorInput(clinic.id)),
      commercialPlan: "PRACTICE",
      duration: "SIX_MONTHS",
    });
    const other = await db().clinic.create({
      data: {
        name: "Onbcd70 Other",
        slug: `${SLUG_PREFIX}other`,
        assistedOnboarding: false,
      },
    });
    const member = await db().user.create({
      data: {
        email: `${EMAIL_PREFIX}member@example.test`,
        name: "Existing Member",
        passwordHash: hashPassword("correct-horse-battery"),
        platformRole: PlatformRole.NONE,
        memberships: {
          create: { clinicId: other.id, role: ClinicMembershipRole.ADMIN },
        },
      },
    });
    const blockedMember = await inviteFirstClinicAdministrator({
      clinicId: clinic.id,
      invitedByUserId: OPERATOR_ID,
      name: "Existing Member",
      email: member.email,
    });
    expect(blockedMember).toMatchObject({
      ok: false,
      code: "other_clinic_member",
      error: OTHER_CLINIC_MEMBER_MESSAGE,
    });
    expect(
      await db().clinicMembership.count({ where: { clinicId: clinic.id } })
    ).toBe(0);

    const looseUser = await db().user.create({
      data: {
        email: `${EMAIL_PREFIX}loose@example.test`,
        name: "Loose User",
        passwordHash: hashPassword("correct-horse-battery"),
        platformRole: PlatformRole.NONE,
      },
    });
    const restored = await inviteFirstClinicAdministrator({
      clinicId: clinic.id,
      invitedByUserId: OPERATOR_ID,
      name: "Loose User",
      email: looseUser.email,
    });
    expect(restored).toMatchObject({ ok: true, outcome: "ACCESS_RESTORED" });
    const membership = await db().clinicMembership.findUniqueOrThrow({
      where: {
        clinicId_userId: { clinicId: clinic.id, userId: looseUser.id },
      },
    });
    expect(membership.role).toBe(ClinicMembershipRole.ADMIN);
    expect(
      await db().accountToken.count({
        where: { clinicId: clinic.id, userId: looseUser.id },
      })
    ).toBe(0);

    const operatorAccount = await db().user.create({
      data: {
        email: `${EMAIL_PREFIX}platform@example.test`,
        name: "Second Operator",
        platformRole: PlatformRole.OPERATOR,
      },
    });
    const blockedOperator = await inviteFirstClinicAdministrator({
      clinicId: clinic.id,
      invitedByUserId: OPERATOR_ID,
      name: "Second Operator",
      email: operatorAccount.email,
    });
    expect(blockedOperator).toMatchObject({
      ok: false,
      code: "platform_operator",
      error: PLATFORM_OPERATOR_INVITE_MESSAGE,
    });
  });

  it("leaves a historical clinic without an entitlement on the legacy path", async () => {
    const legacy = await db().clinic.create({
      data: {
        name: "Onbcd70 Legacy",
        slug: `${SLUG_PREFIX}legacy`,
        assistedOnboarding: false,
      },
    });
    const access = await readClinicBillingAccess({
      clinic: { id: legacy.id, name: legacy.name },
    });
    expect(access).toMatchObject({ kind: "allow", reason: "legacy" });
    const invited = await inviteClinicUser({
      clinicId: legacy.id,
      invitedByUserId: OPERATOR_ID,
      name: "Legacy Admin",
      email: `${EMAIL_PREFIX}legacy-admin@example.test`,
      role: "ADMIN",
    });
    expect(invited.ok).toBe(true);
    const status = await loadClinicOnboarding(legacy.id);
    expect(status?.assistedOnboarding).toBe(false);
    expect(status?.commercial.configured).toBe(false);
    expect(status?.readyForClinicSetup).toBe(false);
  });

  it("discovers category templates and hides samples for a multidisciplinary clinic", async () => {
    const dental = await db().guideTemplate.create({
      data: {
        id: `${TEMPLATE_PREFIX}dental`,
        slug: `${SLUG_PREFIX}dental`,
        title: "Onbcd70 dental placeholder",
        serviceCategory: "DENTAL",
        isActive: true,
        isSample: false,
        revisions: {
          create: {
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            publishedAt: new Date("2026-10-05T00:00:00.000Z"),
            sections: {
              create: {
                key: "introduction",
                kind: "INTRODUCTION",
                title: "Introduction",
                body: "Placeholder body.",
                sortOrder: 1,
              },
            },
          },
        },
      },
      select: { id: true },
    });
    const physio = await db().guideTemplate.create({
      data: {
        id: `${TEMPLATE_PREFIX}physio`,
        slug: `${SLUG_PREFIX}physio`,
        title: "Onbcd70 physio placeholder",
        serviceCategory: "PHYSIOTHERAPY",
        isActive: true,
        isSample: false,
        revisions: {
          create: {
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            publishedAt: new Date("2026-10-05T00:00:00.000Z"),
            sections: {
              create: {
                key: "introduction",
                kind: "INTRODUCTION",
                title: "Introduction",
                body: "Placeholder body.",
                sortOrder: 1,
              },
            },
          },
        },
      },
      select: { id: true },
    });
    const clinic = await createOperatorClinic({
      name: "Onbcd70 Multi",
      slug: `${SLUG_PREFIX}multi`,
      serviceCategories: ["PHYSIOTHERAPY", "DENTAL"],
    });
    const list = await listCanonicalGuideTemplates(clinic.id);
    const ids = list.templates.map((template) => template.id);
    expect(list.serviceCategories).toEqual(["DENTAL", "PHYSIOTHERAPY"]);
    expect(ids).toContain(dental.id);
    expect(ids).toContain(physio.id);
    expect(
      list.templates.every(
        (template) =>
          template.serviceCategory === "DENTAL" ||
          template.serviceCategory === "PHYSIOTHERAPY"
      )
    ).toBe(true);
    const samples = await db().guideTemplate.findMany({
      where: { isSample: true },
      select: { id: true },
    });
    for (const sample of samples) {
      expect(ids).not.toContain(sample.id);
    }
    expect(
      await db().practiceGuide.count({ where: { clinicId: clinic.id } })
    ).toBe(0);
  });

  it("does not copy one clinic's commercial setup or invitation onto another", async () => {
    const first = await createOperatorClinic({
      name: "Onbcd70 Isolated A",
      slug: `${SLUG_PREFIX}isolated-a`,
      serviceCategories: ["DENTAL"],
    });
    const second = await createOperatorClinic({
      name: "Onbcd70 Isolated B",
      slug: `${SLUG_PREFIX}isolated-b`,
      serviceCategories: ["CHIROPRACTIC"],
    });
    await grantComplimentaryAccess({
      ...(await operatorInput(first.id)),
      commercialPlan: "ESSENTIAL",
      duration: "SIX_MONTHS",
    });
    await inviteFirstClinicAdministrator({
      clinicId: first.id,
      invitedByUserId: OPERATOR_ID,
      name: "Isolated Admin",
      email: `${EMAIL_PREFIX}isolated@example.test`,
    });
    const other = await loadClinicOnboarding(second.id);
    expect(other?.commercial.configured).toBe(false);
    expect(other?.administrator.state).toBe("not_invited");
    expect(other?.categoryLabels).toEqual(["Chiropractic"]);
    expect(
      await db().clinicEntitlement.findUnique({
        where: { clinicId: second.id },
      })
    ).toBeNull();
    expect(
      await db().accountToken.count({ where: { clinicId: second.id } })
    ).toBe(0);
    expect(
      await db().clinicMembership.count({ where: { clinicId: second.id } })
    ).toBe(0);
  });
});
