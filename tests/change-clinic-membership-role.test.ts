import "dotenv/config";

import {
  AccountTokenType,
  ClinicMembershipRole,
  PlatformRole,
} from "@prisma/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

import { hashPassword } from "@/lib/auth/password";
import {
  CANNOT_CHANGE_OPERATOR_ROLE_MESSAGE,
  changeClinicMembershipRole,
} from "@/lib/operator/change-clinic-membership-role";
import { INVITED_ROLE_INVALID_MESSAGE } from "@/lib/operator/clinic-invitation-input";
import {
  clearTransactionalEmailMemoryInbox,
  getTransactionalEmailMemoryInbox,
} from "@/lib/email/transactional-mailer";
import { listClinicTeam } from "@/lib/operator/list-clinic-team";
import { MEMBERSHIP_NOT_FOUND_MESSAGE } from "@/lib/operator/remove-clinic-access";
import { getPrisma } from "@/lib/prisma";

const prisma = getPrisma();
const PREFIX = "test_role_";
const CLINIC_A = `${PREFIX}clinic_a`;
const CLINIC_B = `${PREFIX}clinic_b`;

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

async function cleanup() {
  await prisma.session.deleteMany({
    where: {
      user: { email: { startsWith: `${PREFIX}` } },
    },
  });
  await prisma.accountToken.deleteMany({
    where: {
      OR: [
        { clinicId: { in: [CLINIC_A, CLINIC_B] } },
        { user: { email: { startsWith: `${PREFIX}` } } },
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
    where: { email: { startsWith: `${PREFIX}` } },
  });
}

describe("change clinic membership role", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  beforeAll(async () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "example.com";
    await cleanup();
    await prisma.clinic.createMany({
      data: [
        { id: CLINIC_A, name: "Role Clinic A", slug: "testrole-a" },
        { id: CLINIC_B, name: "Role Clinic B", slug: "testrole-b" },
      ],
    });
  });

  afterEach(async () => {
    clearTransactionalEmailMemoryInbox();
    await prisma.session.deleteMany({
      where: { user: { email: { startsWith: `${PREFIX}` } } },
    });
    await prisma.accountToken.deleteMany({
      where: {
        OR: [
          { clinicId: { in: [CLINIC_A, CLINIC_B] } },
          { user: { email: { startsWith: `${PREFIX}` } } },
        ],
      },
    });
    await prisma.clinicMembership.deleteMany({
      where: { clinicId: { in: [CLINIC_A, CLINIC_B] } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: `${PREFIX}` } },
    });
  });

  afterAll(async () => {
    restore("CARE_GUIDE_ROOT_DOMAIN", previousRoot);
    await cleanup();
    await prisma.$disconnect();
  });

  async function createMember(input: {
    email: string;
    role: ClinicMembershipRole;
    clinicId?: string;
    platformRole?: PlatformRole;
    password?: string;
  }) {
    const passwordHash = hashPassword(input.password ?? "member-pass-12");
    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: "Role Person",
        passwordHash,
        platformRole: input.platformRole ?? PlatformRole.NONE,
      },
    });
    const membership = await prisma.clinicMembership.create({
      data: {
        clinicId: input.clinicId ?? CLINIC_A,
        userId: user.id,
        role: input.role,
      },
    });
    return { user, membership, passwordHash };
  }

  it("changes ADMIN to STAFF without touching the user, sessions, or tokens", async () => {
    const { user, membership, passwordHash } = await createMember({
      email: `${PREFIX}admin@example.test`,
      role: ClinicMembershipRole.ADMIN,
    });
    const other = await createMember({
      email: `${PREFIX}other@example.test`,
      role: ClinicMembershipRole.STAFF,
      clinicId: CLINIC_B,
    });
    await prisma.session.create({
      data: {
        sessionToken: `${PREFIX}admin_session`,
        userId: user.id,
        expires: new Date("2026-10-19T12:00:00.000Z"),
      },
    });
    await prisma.accountToken.create({
      data: {
        tokenHash: `${PREFIX}existing_token`.padEnd(64, "a"),
        type: AccountTokenType.INVITATION,
        userId: user.id,
        email: user.email,
        clinicId: CLINIC_A,
        role: ClinicMembershipRole.ADMIN,
        expiresAt: new Date("2026-09-26T00:00:00.000Z"),
      },
    });
    const tokenCountBefore = await prisma.accountToken.count({
      where: { userId: user.id },
    });
    const membershipCountBefore = await prisma.clinicMembership.count({
      where: { userId: user.id },
    });

    const result = await changeClinicMembershipRole({
      clinicId: CLINIC_A,
      membershipId: membership.id,
      role: "STAFF",
      platformRole: "OPERATOR",
    } as { clinicId: string; membershipId: string; role: string });

    expect(result).toMatchObject({
      ok: true,
      userId: user.id,
      role: ClinicMembershipRole.STAFF,
      unchanged: false,
    });
    const updated = await prisma.clinicMembership.findUnique({
      where: { id: membership.id },
    });
    expect(updated?.role).toBe(ClinicMembershipRole.STAFF);
    const keptUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(keptUser?.passwordHash).toBe(passwordHash);
    expect(keptUser?.platformRole).toBe(PlatformRole.NONE);
    expect(keptUser?.email).toBe(user.email);
    expect(keptUser?.name).toBe("Role Person");
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
    expect(
      await prisma.accountToken.count({ where: { userId: user.id } })
    ).toBe(tokenCountBefore);
    expect(
      await prisma.clinicMembership.count({ where: { userId: user.id } })
    ).toBe(membershipCountBefore);
    expect(
      await prisma.clinicMembership.findUnique({
        where: { id: other.membership.id },
      })
    ).toMatchObject({ role: ClinicMembershipRole.STAFF, clinicId: CLINIC_B });
    expect(getTransactionalEmailMemoryInbox()).toHaveLength(0);

    const team = await listClinicTeam(CLINIC_A);
    expect(team?.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          membershipId: membership.id,
          role: ClinicMembershipRole.STAFF,
          status: "active",
        }),
      ])
    );
  });

  it("changes STAFF to ADMIN, including the only remaining administrator", async () => {
    const { membership } = await createMember({
      email: `${PREFIX}only-admin@example.test`,
      role: ClinicMembershipRole.ADMIN,
    });
    const staff = await createMember({
      email: `${PREFIX}staff@example.test`,
      role: ClinicMembershipRole.STAFF,
    });

    const demoted = await changeClinicMembershipRole({
      clinicId: CLINIC_A,
      membershipId: membership.id,
      role: "STAFF",
    });
    expect(demoted).toMatchObject({ ok: true, unchanged: false });
    expect(
      (
        await prisma.clinicMembership.findUnique({
          where: { id: membership.id },
        })
      )?.role
    ).toBe(ClinicMembershipRole.STAFF);

    const promoted = await changeClinicMembershipRole({
      clinicId: CLINIC_A,
      membershipId: staff.membership.id,
      role: "ADMIN",
    });
    expect(promoted).toMatchObject({
      ok: true,
      role: ClinicMembershipRole.ADMIN,
      unchanged: false,
    });
    expect(
      (
        await prisma.clinicMembership.findUnique({
          where: { id: staff.membership.id },
        })
      )?.role
    ).toBe(ClinicMembershipRole.ADMIN);
  });

  it("treats a same-role submission as a safe no-op", async () => {
    const { user, membership, passwordHash } = await createMember({
      email: `${PREFIX}same@example.test`,
      role: ClinicMembershipRole.STAFF,
    });
    await prisma.session.create({
      data: {
        sessionToken: `${PREFIX}same_session`,
        userId: user.id,
        expires: new Date("2026-10-19T12:00:00.000Z"),
      },
    });

    const result = await changeClinicMembershipRole({
      clinicId: CLINIC_A,
      membershipId: membership.id,
      role: "STAFF",
    });
    expect(result).toMatchObject({
      ok: true,
      userId: user.id,
      role: ClinicMembershipRole.STAFF,
      unchanged: true,
    });
    expect(
      (
        await prisma.clinicMembership.findUnique({
          where: { id: membership.id },
        })
      )?.role
    ).toBe(ClinicMembershipRole.STAFF);
    const keptUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(keptUser?.passwordHash).toBe(passwordHash);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
    expect(
      await prisma.clinicMembership.count({ where: { userId: user.id } })
    ).toBe(1);
  });

  it("rejects arbitrary roles, other-clinic memberships, and platform operators", async () => {
    const { membership } = await createMember({
      email: `${PREFIX}valid@example.test`,
      role: ClinicMembershipRole.STAFF,
    });
    const other = await createMember({
      email: `${PREFIX}elsewhere@example.test`,
      role: ClinicMembershipRole.ADMIN,
      clinicId: CLINIC_B,
    });
    const operator = await prisma.user.create({
      data: {
        email: `${PREFIX}operator@example.test`,
        name: "Operator",
        passwordHash: hashPassword("operator-pass-1"),
        platformRole: PlatformRole.OPERATOR,
      },
    });
    const operatorMembership = await prisma.clinicMembership.create({
      data: {
        clinicId: CLINIC_A,
        userId: operator.id,
        role: ClinicMembershipRole.ADMIN,
      },
    });

    await expect(
      changeClinicMembershipRole({
        clinicId: CLINIC_A,
        membershipId: membership.id,
        role: "OPERATOR",
      })
    ).resolves.toEqual({ ok: false, error: INVITED_ROLE_INVALID_MESSAGE });
    await expect(
      changeClinicMembershipRole({
        clinicId: CLINIC_A,
        membershipId: membership.id,
        role: "GOD",
      })
    ).resolves.toEqual({ ok: false, error: INVITED_ROLE_INVALID_MESSAGE });
    await expect(
      changeClinicMembershipRole({
        clinicId: CLINIC_A,
        membershipId: other.membership.id,
        role: "STAFF",
      })
    ).resolves.toEqual({ ok: false, error: MEMBERSHIP_NOT_FOUND_MESSAGE });
    await expect(
      changeClinicMembershipRole({
        clinicId: CLINIC_A,
        membershipId: operatorMembership.id,
        role: "STAFF",
      })
    ).resolves.toEqual({
      ok: false,
      error: CANNOT_CHANGE_OPERATOR_ROLE_MESSAGE,
    });

    expect(
      (
        await prisma.clinicMembership.findUnique({
          where: { id: membership.id },
        })
      )?.role
    ).toBe(ClinicMembershipRole.STAFF);
    expect(
      (
        await prisma.clinicMembership.findUnique({
          where: { id: other.membership.id },
        })
      )?.role
    ).toBe(ClinicMembershipRole.ADMIN);
    expect(
      (await prisma.user.findUnique({ where: { id: operator.id } }))
        ?.platformRole
    ).toBe(PlatformRole.OPERATOR);
  });
});
