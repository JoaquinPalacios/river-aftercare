import "dotenv/config";

import { ClinicMembershipRole, PlatformRole } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { updateOwnProfile } from "@/lib/auth/update-own-profile";
import { changeAuthenticatedUserPassword } from "@/lib/auth/change-password";
import { getPrisma } from "@/lib/prisma";
import {
  CANNOT_CHANGE_OPERATOR_MEMBERSHIP_MESSAGE,
  FORBIDDEN_MEMBERSHIP_STATUS_MESSAGE,
  ONLY_STAFF_STATUS_MESSAGE,
  updateClinicMembershipStatus,
} from "@/lib/clinic-portal/update-clinic-membership-status";
import {
  actorCanAccessClinic,
  actorCanManageClinic,
} from "@/lib/auth/clinic-authorization";
import { PROFILE_EMAIL_TAKEN_MESSAGE } from "@/lib/auth/account-profile-schema";

const prisma = getPrisma();
const PREFIX = "test_acct_rbac_";
const CLINIC_A = `${PREFIX}clinic_a`;
const CLINIC_B = `${PREFIX}clinic_b`;
const ADMIN_A = `${PREFIX}admin_a`;
const STAFF_A = `${PREFIX}staff_a`;
const STAFF_AB = `${PREFIX}staff_ab`;
const ADMIN_B = `${PREFIX}admin_b`;
const STAFF_B = `${PREFIX}staff_b`;
const OPERATOR = `${PREFIX}operator`;

async function cleanup() {
  await prisma.session.deleteMany({
    where: { user: { email: { startsWith: PREFIX } } },
  });
  await prisma.accountToken.deleteMany({
    where: { user: { email: { startsWith: PREFIX } } },
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

async function seed() {
  await prisma.clinic.createMany({
    data: [
      { id: CLINIC_A, name: "Clinic A", slug: "testrbac-a" },
      { id: CLINIC_B, name: "Clinic B", slug: "testrbac-b" },
    ],
  });
  await prisma.user.createMany({
    data: [
      {
        id: ADMIN_A,
        email: `${PREFIX}admin-a@example.test`,
        name: "Admin A",
        passwordHash: hashPassword("admin-a-password"),
        platformRole: PlatformRole.NONE,
      },
      {
        id: STAFF_A,
        email: `${PREFIX}staff-a@example.test`,
        name: "Staff A",
        passwordHash: hashPassword("staff-a-password"),
        platformRole: PlatformRole.NONE,
      },
      {
        id: STAFF_AB,
        email: `${PREFIX}staff-ab@example.test`,
        name: "Staff AB",
        passwordHash: hashPassword("staff-ab-password"),
        platformRole: PlatformRole.NONE,
      },
      {
        id: ADMIN_B,
        email: `${PREFIX}admin-b@example.test`,
        name: "Admin B",
        passwordHash: hashPassword("admin-b-password"),
        platformRole: PlatformRole.NONE,
      },
      {
        id: STAFF_B,
        email: `${PREFIX}staff-b@example.test`,
        name: "Staff B",
        passwordHash: hashPassword("staff-b-password"),
        platformRole: PlatformRole.NONE,
      },
      {
        id: OPERATOR,
        email: `${PREFIX}operator@example.test`,
        name: "Operator",
        passwordHash: hashPassword("operator-password"),
        platformRole: PlatformRole.OPERATOR,
      },
    ],
  });
  await prisma.clinicMembership.createMany({
    data: [
      {
        id: `${PREFIX}m_admin_a`,
        clinicId: CLINIC_A,
        userId: ADMIN_A,
        role: ClinicMembershipRole.ADMIN,
      },
      {
        id: `${PREFIX}m_staff_a`,
        clinicId: CLINIC_A,
        userId: STAFF_A,
        role: ClinicMembershipRole.STAFF,
      },
      {
        id: `${PREFIX}m_staff_ab_a`,
        clinicId: CLINIC_A,
        userId: STAFF_AB,
        role: ClinicMembershipRole.STAFF,
      },
      {
        id: `${PREFIX}m_staff_ab_b`,
        clinicId: CLINIC_B,
        userId: STAFF_AB,
        role: ClinicMembershipRole.STAFF,
      },
      {
        id: `${PREFIX}m_admin_b`,
        clinicId: CLINIC_B,
        userId: ADMIN_B,
        role: ClinicMembershipRole.ADMIN,
      },
      {
        id: `${PREFIX}m_staff_b`,
        clinicId: CLINIC_B,
        userId: STAFF_B,
        role: ClinicMembershipRole.STAFF,
      },
    ],
  });
}

describe("account and clinic membership RBAC", () => {
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("lets a user change their own name and email, and rejects another user's email", async () => {
    await cleanup();
    await seed();

    const nameResult = await updateOwnProfile({
      userId: STAFF_A,
      name: "Staff A Updated",
      email: `${PREFIX}staff-a@example.test`,
      currentPassword: "",
    });
    expect(nameResult.ok).toBe(true);

    const duplicate = await updateOwnProfile({
      userId: STAFF_A,
      name: "Staff A Updated",
      email: `${PREFIX}admin-a@example.test`,
      currentPassword: "staff-a-password",
    });
    expect(duplicate).toMatchObject({
      ok: false,
      error: PROFILE_EMAIL_TAKEN_MESSAGE,
    });

    const emailResult = await updateOwnProfile({
      userId: STAFF_A,
      name: "Staff A Updated",
      email: `${PREFIX}staff-a-next@example.test`,
      currentPassword: "staff-a-password",
    });
    expect(emailResult.ok).toBe(true);
    if (emailResult.ok) {
      expect(emailResult.pendingEmail).toBe(
        `${PREFIX}staff-a-next@example.test`
      );
    }

    const user = await prisma.user.findUnique({ where: { id: STAFF_A } });
    expect(user?.name).toBe("Staff A Updated");
    expect(user?.email).toBe(`${PREFIX}staff-a@example.test`);
    expect(user?.emailVerified).toBeNull();
  });

  it("changes the login credential and does not return the hash", async () => {
    await cleanup();
    await seed();
    const result = await changeAuthenticatedUserPassword({
      userId: STAFF_A,
      currentPassword: "staff-a-password",
      newPassword: "abcdefghijkl",
      confirmPassword: "abcdefghijkl",
    });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/staff-a-password|abcdefghijkl/);
    const user = await prisma.user.findUnique({ where: { id: STAFF_A } });
    expect(verifyPassword("staff-a-password", user?.passwordHash)).toBe(false);
    expect(verifyPassword("abcdefghijkl", user?.passwordHash)).toBe(true);
  });

  it("lets clinic ADMIN deactivate and reactivate STAFF in the same clinic only", async () => {
    await cleanup();
    await seed();
    await prisma.session.create({
      data: {
        sessionToken: `${PREFIX}staff_a_session`,
        userId: STAFF_A,
        expires: new Date("2026-12-01T00:00:00.000Z"),
      },
    });
    const membershipId = `${PREFIX}m_staff_a`;
    const deactivated = await updateClinicMembershipStatus({
      actor: { id: ADMIN_A, platformRole: PlatformRole.NONE },
      clinicId: CLINIC_A,
      membershipId,
      active: false,
    });
    expect(deactivated).toMatchObject({ ok: true, active: false });

    const row = await prisma.clinicMembership.findUnique({
      where: { id: membershipId },
    });
    expect(row?.active).toBe(false);
    expect(
      await prisma.session.findUnique({
        where: { sessionToken: `${PREFIX}staff_a_session` },
      })
    ).toBeTruthy();
    expect(
      await actorCanAccessClinic({
        actorUserId: STAFF_A,
        clinicId: CLINIC_A,
      })
    ).toBe(false);
    expect(
      await actorCanManageClinic({
        actorUserId: STAFF_A,
        clinicId: CLINIC_A,
      })
    ).toBe(false);

    const otherClinic = await updateClinicMembershipStatus({
      actor: { id: ADMIN_A, platformRole: PlatformRole.NONE },
      clinicId: CLINIC_B,
      membershipId: `${PREFIX}m_staff_b`,
      active: false,
    });
    expect(otherClinic).toMatchObject({
      ok: false,
      error: FORBIDDEN_MEMBERSHIP_STATUS_MESSAGE,
    });

    const reactivated = await updateClinicMembershipStatus({
      actor: { id: ADMIN_A, platformRole: PlatformRole.NONE },
      clinicId: CLINIC_A,
      membershipId,
      active: true,
    });
    expect(reactivated).toMatchObject({ ok: true, active: true });
    expect(
      (
        await prisma.clinicMembership.findUnique({
          where: { id: membershipId },
        })
      )?.active
    ).toBe(true);
    expect(
      await actorCanAccessClinic({
        actorUserId: STAFF_A,
        clinicId: CLINIC_A,
      })
    ).toBe(true);
    expect(
      await prisma.clinicMembership.count({
        where: { clinicId: CLINIC_A, userId: STAFF_A },
      })
    ).toBe(1);
  });

  it("does not let STAFF deactivate another STAFF or themselves", async () => {
    await cleanup();
    await seed();
    const forged = await updateClinicMembershipStatus({
      actor: { id: STAFF_A, platformRole: PlatformRole.NONE },
      clinicId: CLINIC_A,
      membershipId: `${PREFIX}m_staff_a`,
      active: false,
    });
    expect(forged).toMatchObject({
      ok: false,
      error: FORBIDDEN_MEMBERSHIP_STATUS_MESSAGE,
    });
    expect(
      (
        await prisma.clinicMembership.findUnique({
          where: { id: `${PREFIX}m_staff_a` },
        })
      )?.active
    ).toBe(true);
  });

  it("does not let ADMIN deactivate another ADMIN", async () => {
    await cleanup();
    await seed();
    const result = await updateClinicMembershipStatus({
      actor: { id: ADMIN_A, platformRole: PlatformRole.NONE },
      clinicId: CLINIC_A,
      membershipId: `${PREFIX}m_admin_a`,
      active: false,
    });
    expect(result).toMatchObject({
      ok: false,
      error: ONLY_STAFF_STATUS_MESSAGE,
    });
  });

  it("keeps the other clinic active when one membership is deactivated", async () => {
    await cleanup();
    await seed();
    const result = await updateClinicMembershipStatus({
      actor: { id: ADMIN_A, platformRole: PlatformRole.NONE },
      clinicId: CLINIC_A,
      membershipId: `${PREFIX}m_staff_ab_a`,
      active: false,
    });
    expect(result.ok).toBe(true);

    const memberships = await prisma.clinicMembership.findMany({
      where: { userId: STAFF_AB },
      orderBy: { clinicId: "asc" },
    });
    expect(memberships).toHaveLength(2);
    expect(memberships.find((row) => row.clinicId === CLINIC_A)?.active).toBe(
      false
    );
    expect(memberships.find((row) => row.clinicId === CLINIC_B)?.active).toBe(
      true
    );

    expect(
      await actorCanAccessClinic({
        actorUserId: STAFF_AB,
        clinicId: CLINIC_A,
      })
    ).toBe(false);
    expect(
      await actorCanAccessClinic({
        actorUserId: STAFF_AB,
        clinicId: CLINIC_B,
      })
    ).toBe(true);
    expect(
      await actorCanManageClinic({
        actorUserId: ADMIN_B,
        clinicId: CLINIC_B,
      })
    ).toBe(true);

    const user = await prisma.user.findUnique({ where: { id: STAFF_AB } });
    expect(user?.passwordHash).toBeTruthy();
    expect(verifyPassword("staff-ab-password", user?.passwordHash)).toBe(true);
  });

  it("lets an operator manage staff status for the requested clinic only", async () => {
    await cleanup();
    await seed();
    const result = await updateClinicMembershipStatus({
      actor: { id: OPERATOR, platformRole: PlatformRole.OPERATOR },
      clinicId: CLINIC_A,
      membershipId: `${PREFIX}m_staff_a`,
      active: false,
    });
    expect(result.ok).toBe(true);
    expect(
      await actorCanManageClinic({
        actorUserId: OPERATOR,
        clinicId: CLINIC_A,
      })
    ).toBe(true);
    expect(
      await actorCanManageClinic({
        actorUserId: OPERATOR,
        clinicId: CLINIC_B,
      })
    ).toBe(true);

    const operatorPassword = await changeAuthenticatedUserPassword({
      userId: STAFF_A,
      currentPassword: "not-the-staff-password",
      newPassword: "abcdefghijkl",
      confirmPassword: "abcdefghijkl",
    });
    expect(operatorPassword.ok).toBe(false);
    expect(CANNOT_CHANGE_OPERATOR_MEMBERSHIP_MESSAGE).toContain(
      "Platform operator"
    );
    const staff = await prisma.user.findUnique({ where: { id: STAFF_A } });
    expect(verifyPassword("staff-a-password", staff?.passwordHash)).toBe(true);
  });
});
