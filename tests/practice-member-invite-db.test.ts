import "dotenv/config";

import { ClinicMembershipRole, PlatformRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { hashPassword } from "@/lib/auth/password";
import { authorizeClinicMemberInvite } from "@/lib/clinic-portal/authorize-clinic-member-invite";
import { clearTransactionalEmailMemoryInbox } from "@/lib/email/transactional-mailer";
import {
  PENDING_SAME_CLINIC_MESSAGE,
  inviteClinicUser,
} from "@/lib/operator/invite-clinic-user";
import { getPrisma } from "@/lib/prisma";

const prisma = getPrisma();
const PREFIX = "test_practice_invite_";
const CLINIC_A = `${PREFIX}clinic_a`;
const CLINIC_B = `${PREFIX}clinic_b`;
const OPERATOR_ID = `${PREFIX}operator`;
const ADMIN_A = `${PREFIX}admin_a`;
const STAFF_A = `${PREFIX}staff_a`;
const ADMIN_B = `${PREFIX}admin_b`;

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

async function cleanup() {
  await prisma.stripeEventReceipt.deleteMany({
    where: { clinicId: { in: [CLINIC_A, CLINIC_B] } },
  });
  await prisma.legalAcceptance.deleteMany({
    where: { clinicId: { in: [CLINIC_A, CLINIC_B] } },
  });
  await prisma.clinicEntitlement.deleteMany({
    where: { clinicId: { in: [CLINIC_A, CLINIC_B] } },
  });
  await prisma.clinicBillingProfile.deleteMany({
    where: { clinicId: { in: [CLINIC_A, CLINIC_B] } },
  });
  await prisma.accountToken.deleteMany({
    where: {
      OR: [
        { clinicId: { in: [CLINIC_A, CLINIC_B] } },
        { user: { email: { startsWith: PREFIX } } },
      ],
    },
  });
  await prisma.clinicMembership.deleteMany({
    where: { clinicId: { in: [CLINIC_A, CLINIC_B] } },
  });
  await prisma.clinic.deleteMany({
    where: { id: { in: [CLINIC_A, CLINIC_B] } },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: PREFIX } },
  });
}

describe("practice member invite persistence", () => {
  const previousFrom = process.env.AUTH_EMAIL_FROM;
  const previousReply = process.env.AUTH_EMAIL_REPLY_TO;
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  beforeAll(async () => {
    process.env.AUTH_EMAIL_FROM = "River Aftercare <accounts@example.test>";
    process.env.AUTH_EMAIL_REPLY_TO = "hello@example.test";
    process.env.CARE_GUIDE_ROOT_DOMAIN = "example.com";
    await cleanup();
    await prisma.user.createMany({
      data: [
        {
          id: OPERATOR_ID,
          email: `${PREFIX}operator@example.test`,
          name: "Practice Invite Operator",
          passwordHash: hashPassword("operator-pass-1"),
          platformRole: PlatformRole.OPERATOR,
        },
        {
          id: ADMIN_A,
          email: `${PREFIX}admin-a@example.test`,
          name: "Practice Invite Admin",
          passwordHash: hashPassword("admin-pass-1"),
          platformRole: PlatformRole.NONE,
        },
        {
          id: STAFF_A,
          email: `${PREFIX}staff-a@example.test`,
          name: "Practice Invite Staff",
          passwordHash: hashPassword("staff-pass-1"),
          platformRole: PlatformRole.NONE,
        },
        {
          id: ADMIN_B,
          email: `${PREFIX}admin-b@example.test`,
          name: "Other Clinic Admin",
          passwordHash: hashPassword("admin-pass-2"),
          platformRole: PlatformRole.NONE,
        },
      ],
    });
    await prisma.clinic.createMany({
      data: [
        {
          id: CLINIC_A,
          name: "Practice Invite Clinic",
          slug: "practice-invite-a",
        },
        {
          id: CLINIC_B,
          name: "Other Invite Clinic",
          slug: "practice-invite-b",
        },
      ],
    });
    await prisma.clinicMembership.createMany({
      data: [
        {
          clinicId: CLINIC_A,
          userId: ADMIN_A,
          role: ClinicMembershipRole.ADMIN,
        },
        {
          clinicId: CLINIC_A,
          userId: STAFF_A,
          role: ClinicMembershipRole.STAFF,
        },
        {
          clinicId: CLINIC_B,
          userId: ADMIN_B,
          role: ClinicMembershipRole.ADMIN,
        },
      ],
    });
  });

  afterAll(async () => {
    clearTransactionalEmailMemoryInbox();
    restore("AUTH_EMAIL_FROM", previousFrom);
    restore("AUTH_EMAIL_REPLY_TO", previousReply);
    restore("CARE_GUIDE_ROOT_DOMAIN", previousRoot);
    await cleanup();
    await prisma.$disconnect();
  });

  it("invites past both public allowances without billing writes or an operator membership", async () => {
    const operatorActor = {
      id: OPERATOR_ID,
      platformRole: PlatformRole.OPERATOR,
    };
    const beforeMembers = await prisma.clinicMembership.count({
      where: { clinicId: CLINIC_A },
    });
    expect(beforeMembers).toBe(2);

    const operatorAuthority = await authorizeClinicMemberInvite({
      actor: operatorActor,
      clinicId: CLINIC_A,
    });
    expect(operatorAuthority).toEqual({
      kind: "platform_operator",
      userId: OPERATOR_ID,
      clinicId: CLINIC_A,
    });

    for (let index = 0; index < 6; index += 1) {
      const result = await inviteClinicUser({
        clinicId: CLINIC_A,
        invitedByUserId: OPERATOR_ID,
        name: `Invitee ${index}`,
        email: `${PREFIX}invitee-${index}@example.test`,
        role: index === 0 ? "ADMIN" : "STAFF",
      });
      expect(result.ok).toBe(true);
    }

    expect(
      await prisma.clinicMembership.count({
        where: { userId: OPERATOR_ID },
      })
    ).toBe(0);
    expect(
      await prisma.clinicMembership.count({
        where: { clinicId: CLINIC_A },
      })
    ).toBe(beforeMembers);
    expect(
      await prisma.clinicBillingProfile.count({
        where: { clinicId: CLINIC_A },
      })
    ).toBe(0);
    expect(
      await prisma.clinicEntitlement.count({
        where: { clinicId: CLINIC_A },
      })
    ).toBe(0);
    expect(
      await prisma.legalAcceptance.count({
        where: { clinicId: CLINIC_A },
      })
    ).toBe(0);
    expect(
      await prisma.stripeEventReceipt.count({
        where: { clinicId: CLINIC_A },
      })
    ).toBe(0);

    const duplicate = await inviteClinicUser({
      clinicId: CLINIC_A,
      invitedByUserId: OPERATOR_ID,
      name: "Invitee 0",
      email: `${PREFIX}invitee-0@example.test`,
      role: "ADMIN",
    });
    expect(duplicate).toMatchObject({
      ok: false,
      error: PENDING_SAME_CLINIC_MESSAGE,
    });
  });

  it("keeps staff and cross-clinic admins out of the invite authority", async () => {
    expect(
      await authorizeClinicMemberInvite({
        actor: { id: STAFF_A, platformRole: PlatformRole.NONE },
        clinicId: CLINIC_A,
      })
    ).toBeNull();
    expect(
      await authorizeClinicMemberInvite({
        actor: { id: ADMIN_A, platformRole: PlatformRole.NONE },
        clinicId: CLINIC_B,
      })
    ).toBeNull();
    expect(
      await authorizeClinicMemberInvite({
        actor: { id: ADMIN_A, platformRole: PlatformRole.NONE },
        clinicId: CLINIC_A,
      })
    ).toEqual({
      kind: "clinic_admin",
      userId: ADMIN_A,
      clinicId: CLINIC_A,
    });
  });
});
