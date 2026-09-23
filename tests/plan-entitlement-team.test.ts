import "dotenv/config";

import {
  AccountTokenType,
  BillingStatus,
  ClinicMembershipRole,
  EntitlementStatus,
  PlatformRole,
} from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { completeInvitation } from "@/lib/auth/account-token-service";
import { hashPassword } from "@/lib/auth/password";
import { ENTITLEMENT_CODES } from "@/lib/entitlements/messages";
import { PLAN_ENTITLEMENT_POLICIES } from "@/lib/entitlements/plan-policy";
import { countTeamUsage } from "@/lib/entitlements/team-usage";
import { updateClinicMembershipStatus } from "@/lib/clinic-portal/update-clinic-membership-status";
import { changeClinicMembershipRole } from "@/lib/operator/change-clinic-membership-role";
import { inviteClinicUser } from "@/lib/operator/invite-clinic-user";
import { resendClinicInvitation } from "@/lib/operator/resend-clinic-invitation";
import { createInvitationToken } from "@/lib/auth/account-token-service";
import { getPrisma } from "@/lib/prisma";

const prisma = getPrisma();
const PREFIX = "test_ent_team_";
const CLINIC_ID = `${PREFIX}clinic`;
const essentialLimit = PLAN_ENTITLEMENT_POLICIES.ESSENTIAL.base.teamMembers;
const practiceLimit = PLAN_ENTITLEMENT_POLICIES.PRACTICE.base.teamMembers;

function email(label: string) {
  return `${PREFIX}${label}@example.test`;
}

function tokenHash(label: string) {
  return createHash("sha256").update(`${PREFIX}${label}`).digest("hex");
}

async function cleanup() {
  await prisma.clinicEntitlement.deleteMany({ where: { clinicId: CLINIC_ID } });
  await prisma.accountToken.deleteMany({
    where: {
      OR: [{ clinicId: CLINIC_ID }, { email: { startsWith: PREFIX } }],
    },
  });
  await prisma.clinicMembership.deleteMany({ where: { clinicId: CLINIC_ID } });
  await prisma.clinic.deleteMany({ where: { id: CLINIC_ID } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

async function createClinic() {
  await prisma.clinic.create({
    data: {
      id: CLINIC_ID,
      name: "Entitlement Team Clinic",
      slug: "ent-team-clinic",
    },
  });
}

async function setPlan(plan: "ESSENTIAL" | "PRACTICE" | "GROUP" | null) {
  await prisma.clinicEntitlement.upsert({
    where: { clinicId: CLINIC_ID },
    create: {
      clinicId: CLINIC_ID,
      commercialPlan: plan,
      billingStatus: BillingStatus.ACTIVE,
      entitlementStatus: EntitlementStatus.ACTIVE,
      extraTeamMemberAllowance: 0,
      extraCustomGuideAllowance: 0,
      extraTemplateAdaptationAllowance: 0,
    },
    update: {
      commercialPlan: plan,
      extraTeamMemberAllowance: 0,
      extraCustomGuideAllowance: 0,
      extraTemplateAdaptationAllowance: 0,
    },
  });
}

async function addMember(input: {
  label: string;
  role?: ClinicMembershipRole;
  active?: boolean;
  platformRole?: PlatformRole;
  password?: boolean;
}) {
  const user = await prisma.user.create({
    data: {
      email: email(input.label),
      name: input.label,
      platformRole: input.platformRole ?? PlatformRole.NONE,
      passwordHash: input.password ? hashPassword("LocalOnly123!") : null,
    },
  });
  const membership = await prisma.clinicMembership.create({
    data: {
      clinicId: CLINIC_ID,
      userId: user.id,
      role: input.role ?? ClinicMembershipRole.STAFF,
      active: input.active ?? true,
    },
  });
  return { user, membership };
}

describe("clinic team allowance", () => {
  beforeAll(async () => {
    await cleanup();
    await createClinic();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("counts active admin and staff, and ignores inactive members and operators", async () => {
    await prisma.clinicMembership.deleteMany({
      where: { clinicId: CLINIC_ID },
    });
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await addMember({ label: "admin", role: ClinicMembershipRole.ADMIN });
    await addMember({ label: "staff", role: ClinicMembershipRole.STAFF });
    await addMember({
      label: "inactive",
      role: ClinicMembershipRole.STAFF,
      active: false,
    });
    await addMember({
      label: "operator",
      role: ClinicMembershipRole.STAFF,
      platformRole: PlatformRole.OPERATOR,
    });

    const usage = await countTeamUsage(prisma, CLINIC_ID);
    expect(usage).toEqual({
      activeMemberCount: 2,
      pendingInvitationCount: 0,
      occupiedPlaces: 2,
    });
  });

  it("reserves one place for a valid pending invitation and ignores other tokens", async () => {
    await prisma.accountToken.deleteMany({ where: { clinicId: CLINIC_ID } });
    const invited = await prisma.user.create({
      data: {
        email: email("pending"),
        name: "Pending",
        passwordHash: null,
      },
    });
    const now = new Date("2026-09-23T00:00:00.000Z");
    const base = {
      type: AccountTokenType.INVITATION,
      userId: invited.id,
      clinicId: CLINIC_ID,
      role: ClinicMembershipRole.STAFF,
      email: invited.email,
    };
    const expiredUser = await prisma.user.create({
      data: {
        email: email("expired"),
        name: "Expired",
        passwordHash: null,
      },
    });
    await prisma.accountToken.createMany({
      data: [
        {
          ...base,
          tokenHash: tokenHash("revoked"),
          expiresAt: new Date("2026-10-01T00:00:00.000Z"),
          revokedAt: now,
        },
        {
          ...base,
          tokenHash: tokenHash("consumed"),
          expiresAt: new Date("2026-10-01T00:00:00.000Z"),
          consumedAt: now,
        },
        {
          ...base,
          userId: expiredUser.id,
          email: expiredUser.email,
          tokenHash: tokenHash("expired"),
          expiresAt: new Date("2026-09-01T00:00:00.000Z"),
        },
        {
          ...base,
          tokenHash: tokenHash("valid"),
          expiresAt: new Date("2026-10-01T00:00:00.000Z"),
        },
      ],
    });

    const usage = await countTeamUsage(prisma, CLINIC_ID, now);
    expect(usage.pendingInvitationCount).toBe(1);
    expect(usage.occupiedPlaces).toBe(3);
  });

  it("keeps usage unchanged when a pending invitation is accepted", async () => {
    await prisma.accountToken.deleteMany({ where: { clinicId: CLINIC_ID } });
    const before = await countTeamUsage(prisma, CLINIC_ID);
    const invitee = await prisma.user.create({
      data: {
        email: email("accept"),
        name: "Accept",
        passwordHash: null,
      },
    });
    const created = await createInvitationToken({
      userId: invitee.id,
      clinicId: CLINIC_ID,
      role: ClinicMembershipRole.STAFF,
      email: invitee.email,
      invitedByUserId: (
        await prisma.user.findFirstOrThrow({
          where: { email: email("admin") },
        })
      ).id,
    });
    const reserved = await countTeamUsage(prisma, CLINIC_ID);
    expect(reserved.occupiedPlaces).toBe(before.occupiedPlaces + 1);

    const accepted = await completeInvitation({
      rawToken: created.rawToken,
      passwordHash: hashPassword("LocalOnly123!"),
    });
    expect(accepted.ok).toBe(true);
    const after = await countTeamUsage(prisma, CLINIC_ID);
    expect(after.occupiedPlaces).toBe(reserved.occupiedPlaces);
    expect(after.pendingInvitationCount).toBe(0);
    const membership = await prisma.clinicMembership.findUnique({
      where: {
        clinicId_userId: { clinicId: CLINIC_ID, userId: invitee.id },
      },
    });
    expect(membership?.active).toBe(true);
  });

  it("does not reserve a second place when an invitation is resent", async () => {
    await prisma.accountToken.deleteMany({
      where: { user: { email: email("resend") } },
    });
    await prisma.user.deleteMany({ where: { email: email("resend") } });
    const before = await countTeamUsage(prisma, CLINIC_ID);
    const invited = await inviteClinicUser({
      clinicId: CLINIC_ID,
      invitedByUserId: (
        await prisma.user.findFirstOrThrow({
          where: { email: email("admin") },
        })
      ).id,
      name: "Resend Person",
      email: email("resend"),
      role: "STAFF",
    });
    expect(invited.ok).toBe(true);
    if (!invited.ok) {
      return;
    }
    const reserved = await countTeamUsage(prisma, CLINIC_ID);
    expect(reserved.occupiedPlaces).toBe(before.occupiedPlaces + 1);
    const resent = await resendClinicInvitation({
      clinicId: CLINIC_ID,
      userId: invited.userId,
      invitedByUserId: (
        await prisma.user.findFirstOrThrow({
          where: { email: email("admin") },
        })
      ).id,
    });
    expect(resent.ok).toBe(true);
    const after = await countTeamUsage(prisma, CLINIC_ID);
    expect(after.pendingInvitationCount).toBe(1);
    expect(after.occupiedPlaces).toBe(reserved.occupiedPlaces);
    const tokens = await prisma.accountToken.count({
      where: {
        userId: invited.userId,
        type: AccountTokenType.INVITATION,
        revokedAt: { not: null },
      },
    });
    expect(tokens).toBeGreaterThanOrEqual(1);
  });

  it("enforces Essential and Practice member caps and frees a place on deactivation", async () => {
    await prisma.accountToken.deleteMany({ where: { clinicId: CLINIC_ID } });
    await prisma.clinicMembership.deleteMany({
      where: { clinicId: CLINIC_ID },
    });
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    const admin = await addMember({
      label: "cap-admin",
      role: ClinicMembershipRole.ADMIN,
    });
    await setPlan("ESSENTIAL");

    const staff = await addMember({ label: "cap-staff" });
    expect((await countTeamUsage(prisma, CLINIC_ID)).occupiedPlaces).toBe(
      essentialLimit
    );

    const third = await inviteClinicUser({
      clinicId: CLINIC_ID,
      invitedByUserId: admin.user.id,
      name: "Third",
      email: email("third"),
      role: "STAFF",
    });
    expect(third).toMatchObject({
      ok: false,
      code: ENTITLEMENT_CODES.TEAM_MEMBER_LIMIT_REACHED,
    });

    const deactivated = await updateClinicMembershipStatus({
      actor: admin.user,
      clinicId: CLINIC_ID,
      membershipId: staff.membership.id,
      active: false,
    });
    expect(deactivated.ok).toBe(true);
    const reopened = await inviteClinicUser({
      clinicId: CLINIC_ID,
      invitedByUserId: admin.user.id,
      name: "Replacement",
      email: email("replacement"),
      role: "STAFF",
    });
    expect(reopened.ok).toBe(true);

    const blockedReactivate = await updateClinicMembershipStatus({
      actor: { id: admin.user.id, platformRole: PlatformRole.NONE },
      clinicId: CLINIC_ID,
      membershipId: staff.membership.id,
      active: true,
    });
    expect(blockedReactivate).toMatchObject({
      ok: false,
      code: ENTITLEMENT_CODES.TEAM_MEMBER_LIMIT_REACHED,
    });

    const roleChanged = await changeClinicMembershipRole({
      clinicId: CLINIC_ID,
      membershipId: admin.membership.id,
      role: "STAFF",
    });
    expect(roleChanged.ok).toBe(true);
    await changeClinicMembershipRole({
      clinicId: CLINIC_ID,
      membershipId: admin.membership.id,
      role: "ADMIN",
    });
    expect((await countTeamUsage(prisma, CLINIC_ID)).occupiedPlaces).toBe(
      essentialLimit
    );

    await setPlan("PRACTICE");
    await prisma.accountToken.deleteMany({ where: { clinicId: CLINIC_ID } });
    await prisma.clinicMembership.deleteMany({
      where: { clinicId: CLINIC_ID, userId: { not: admin.user.id } },
    });
    for (let index = 1; index < practiceLimit; index += 1) {
      await addMember({ label: `practice-${index}` });
    }
    expect((await countTeamUsage(prisma, CLINIC_ID)).occupiedPlaces).toBe(
      practiceLimit
    );
    const sixth = await inviteClinicUser({
      clinicId: CLINIC_ID,
      invitedByUserId: admin.user.id,
      name: "Sixth",
      email: email("sixth"),
      role: "STAFF",
    });
    expect(sixth).toMatchObject({
      ok: false,
      code: ENTITLEMENT_CODES.TEAM_MEMBER_LIMIT_REACHED,
    });
  });

  it("uses a persistent team extra and still blocks an operator at the effective limit", async () => {
    await prisma.accountToken.deleteMany({ where: { clinicId: CLINIC_ID } });
    await prisma.clinicMembership.deleteMany({
      where: { clinicId: CLINIC_ID },
    });
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await setPlan("ESSENTIAL");
    await prisma.clinicEntitlement.update({
      where: { clinicId: CLINIC_ID },
      data: { extraTeamMemberAllowance: 1 },
    });
    const beforePlan = await prisma.clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: CLINIC_ID },
    });
    const admin = await addMember({
      label: "extra-admin",
      role: ClinicMembershipRole.ADMIN,
    });
    await addMember({ label: "extra-staff" });
    const operator = await prisma.user.create({
      data: {
        email: email("platform-operator"),
        name: "Platform Operator",
        platformRole: PlatformRole.OPERATOR,
      },
    });

    const third = await inviteClinicUser({
      clinicId: CLINIC_ID,
      invitedByUserId: admin.user.id,
      name: "Third place",
      email: email("extra-place"),
      role: "STAFF",
    });
    expect(third.ok).toBe(true);
    expect((await countTeamUsage(prisma, CLINIC_ID)).occupiedPlaces).toBe(
      essentialLimit + 1
    );

    const blocked = await inviteClinicUser({
      clinicId: CLINIC_ID,
      invitedByUserId: operator.id,
      name: "Fourth",
      email: email("operator-fourth"),
      role: "STAFF",
    });
    expect(blocked).toMatchObject({
      ok: false,
      code: ENTITLEMENT_CODES.TEAM_MEMBER_LIMIT_REACHED,
    });
    const afterPlan = await prisma.clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: CLINIC_ID },
    });
    expect(afterPlan.commercialPlan).toBe("ESSENTIAL");
    expect(afterPlan.stripePriceId).toBe(beforePlan.stripePriceId);
    expect(afterPlan.extraTeamMemberAllowance).toBe(1);
    expect(
      await prisma.clinicMembership.findUnique({
        where: {
          clinicId_userId: { clinicId: CLINIC_ID, userId: operator.id },
        },
      })
    ).toBeNull();
  });

  it("does not let two concurrent invitations take the last place", async () => {
    await prisma.accountToken.deleteMany({ where: { clinicId: CLINIC_ID } });
    await prisma.clinicMembership.deleteMany({
      where: { clinicId: CLINIC_ID },
    });
    await prisma.user.deleteMany({
      where: {
        email: { startsWith: PREFIX },
        platformRole: PlatformRole.NONE,
      },
    });
    await setPlan("ESSENTIAL");
    const admin = await addMember({
      label: "race-admin",
      role: ClinicMembershipRole.ADMIN,
    });
    const results = await Promise.all([
      inviteClinicUser({
        clinicId: CLINIC_ID,
        invitedByUserId: admin.user.id,
        name: "Race A",
        email: email("race-a"),
        role: "STAFF",
      }),
      inviteClinicUser({
        clinicId: CLINIC_ID,
        invitedByUserId: admin.user.id,
        name: "Race B",
        email: email("race-b"),
        role: "STAFF",
      }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect((await countTeamUsage(prisma, CLINIC_ID)).occupiedPlaces).toBe(
      essentialLimit
    );
  });

  it("leaves a clinic that is already over the allowance in place", async () => {
    await prisma.accountToken.deleteMany({ where: { clinicId: CLINIC_ID } });
    await prisma.clinicMembership.deleteMany({
      where: { clinicId: CLINIC_ID },
    });
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await setPlan("ESSENTIAL");
    const admin = await addMember({
      label: "over-admin",
      role: ClinicMembershipRole.ADMIN,
    });
    await addMember({ label: "over-staff" });
    await addMember({ label: "over-extra" });
    expect((await countTeamUsage(prisma, CLINIC_ID)).occupiedPlaces).toBe(
      essentialLimit + 1
    );
    const blocked = await inviteClinicUser({
      clinicId: CLINIC_ID,
      invitedByUserId: admin.user.id,
      name: "Another",
      email: email("over-another"),
      role: "STAFF",
    });
    expect(blocked.ok).toBe(false);
    expect(
      await prisma.clinicMembership.count({ where: { clinicId: CLINIC_ID } })
    ).toBe(essentialLimit + 1);
  });
});
