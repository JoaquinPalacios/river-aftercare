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
}));

import { POST as loginPost } from "@/app/api/auth/login/route";
import { hashAccountToken } from "@/lib/auth/account-token";
import { lookupAccountToken } from "@/lib/auth/account-token-service";
import { acceptInvitationWithToken } from "@/lib/auth/accept-invitation";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  NEW_PASSWORD_MAX_MESSAGE,
  NEW_PASSWORD_MIN_MESSAGE,
} from "@/lib/auth/password-policy";
import { clearTransactionalEmailMemoryInbox } from "@/lib/email/transactional-mailer";
import { cancelClinicInvitation } from "@/lib/operator/cancel-clinic-invitation";
import {
  ALREADY_MEMBER_MESSAGE,
  EXISTING_ACCOUNT_MESSAGE,
  OTHER_CLINIC_MEMBER_MESSAGE,
  PENDING_SAME_CLINIC_MESSAGE,
  PLATFORM_OPERATOR_INVITE_MESSAGE,
  inviteClinicUser,
} from "@/lib/operator/invite-clinic-user";
import { listClinicTeam } from "@/lib/operator/list-clinic-team";
import { removeClinicAccess } from "@/lib/operator/remove-clinic-access";
import { resendClinicInvitation } from "@/lib/operator/resend-clinic-invitation";
import { getPrisma } from "@/lib/prisma";

const prisma = getPrisma();
const PREFIX = "test_invite_";
const OPERATOR_ID = `${PREFIX}operator`;
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
    where: {
      OR: [{ id: OPERATOR_ID }, { email: { startsWith: `${PREFIX}` } }],
    },
  });
}

describe("clinic invitation lifecycle", () => {
  const previousFrom = process.env.AUTH_EMAIL_FROM;
  const previousReply = process.env.AUTH_EMAIL_REPLY_TO;
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  beforeAll(async () => {
    process.env.AUTH_EMAIL_FROM = "River Aftercare <accounts@example.test>";
    process.env.AUTH_EMAIL_REPLY_TO = "hello@example.test";
    process.env.CARE_GUIDE_ROOT_DOMAIN = "example.com";
    await cleanup();
    await prisma.user.create({
      data: {
        id: OPERATOR_ID,
        email: `${PREFIX}operator@example.test`,
        name: "Test Operator",
        passwordHash: hashPassword("operator-pass-1"),
        platformRole: PlatformRole.OPERATOR,
      },
    });
    await prisma.clinic.createMany({
      data: [
        { id: CLINIC_A, name: "Invite Clinic A", slug: "testinvite-a" },
        { id: CLINIC_B, name: "Invite Clinic B", slug: "testinvite-b" },
      ],
    });
  });

  afterEach(() => {
    clearTransactionalEmailMemoryInbox();
  });

  afterAll(async () => {
    restore("AUTH_EMAIL_FROM", previousFrom);
    restore("AUTH_EMAIL_REPLY_TO", previousReply);
    restore("CARE_GUIDE_ROOT_DOMAIN", previousRoot);
    await cleanup();
    await prisma.$disconnect();
  });

  it("invites a brand-new email without creating membership", async () => {
    const result = await inviteClinicUser({
      clinicId: CLINIC_A,
      invitedByUserId: OPERATOR_ID,
      name: "  Jane Example  ",
      email: "  Jane.New@Example.TEST  ",
      role: "STAFF",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.email).toBe("jane.new@example.test");
    expect(result.delivered).toBe(true);

    const user = await prisma.user.findUnique({
      where: { email: "jane.new@example.test" },
    });
    expect(user?.name).toBe("Jane Example");
    expect(user?.passwordHash).toBeNull();
    expect(user?.platformRole).toBe(PlatformRole.NONE);
    const memberships = await prisma.clinicMembership.count({
      where: { userId: user?.id },
    });
    expect(memberships).toBe(0);

    const token = await prisma.accountToken.findFirst({
      where: { userId: user?.id, type: AccountTokenType.INVITATION },
    });
    expect(token?.clinicId).toBe(CLINIC_A);
    expect(token?.role).toBe(ClinicMembershipRole.STAFF);
    expect(token?.tokenHash).toHaveLength(64);
    expect(JSON.stringify(token)).not.toContain(result.ok ? "rawToken" : "");

    const team = await listClinicTeam(CLINIC_A);
    expect(JSON.stringify(team)).not.toContain("scrypt:");
    expect(JSON.stringify(team)).not.toContain("tokenHash");
    expect(team?.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "jane.new@example.test",
          status: "pending",
          role: ClinicMembershipRole.STAFF,
        }),
      ])
    );
  });

  it("blocks same-clinic members, other-clinic members, and operators", async () => {
    const member = await prisma.user.create({
      data: {
        email: `${PREFIX}member@example.test`,
        name: "Member",
        passwordHash: hashPassword("member-pass-12"),
        platformRole: PlatformRole.NONE,
        memberships: {
          create: { clinicId: CLINIC_A, role: ClinicMembershipRole.ADMIN },
        },
      },
    });
    const other = await prisma.user.create({
      data: {
        email: `${PREFIX}other@example.test`,
        name: "Other",
        passwordHash: hashPassword("other-pass-12"),
        platformRole: PlatformRole.NONE,
        memberships: {
          create: { clinicId: CLINIC_B, role: ClinicMembershipRole.STAFF },
        },
      },
    });

    await expect(
      inviteClinicUser({
        clinicId: CLINIC_A,
        invitedByUserId: OPERATOR_ID,
        name: "Member",
        email: member.email,
        role: "STAFF",
      })
    ).resolves.toMatchObject({
      ok: false,
      error: ALREADY_MEMBER_MESSAGE,
    });
    await expect(
      inviteClinicUser({
        clinicId: CLINIC_A,
        invitedByUserId: OPERATOR_ID,
        name: "Other",
        email: other.email,
        role: "STAFF",
      })
    ).resolves.toMatchObject({
      ok: false,
      error: OTHER_CLINIC_MEMBER_MESSAGE,
    });
    await expect(
      inviteClinicUser({
        clinicId: CLINIC_A,
        invitedByUserId: OPERATOR_ID,
        name: "Operator",
        email: `${PREFIX}operator@example.test`,
        role: "ADMIN",
      })
    ).resolves.toMatchObject({
      ok: false,
      error: PLATFORM_OPERATOR_INVITE_MESSAGE,
    });
  });

  it("directs a same-clinic pending user to resend instead of duplicating", async () => {
    const first = await inviteClinicUser({
      clinicId: CLINIC_A,
      invitedByUserId: OPERATOR_ID,
      name: "Pending Person",
      email: `${PREFIX}pending@example.test`,
      role: "ADMIN",
    });
    expect(first.ok).toBe(true);
    const second = await inviteClinicUser({
      clinicId: CLINIC_A,
      invitedByUserId: OPERATOR_ID,
      name: "Pending Person",
      email: `${PREFIX}pending@example.test`,
      role: "STAFF",
    });
    expect(second).toMatchObject({
      ok: false,
      error: PENDING_SAME_CLINIC_MESSAGE,
    });
    const users = await prisma.user.findMany({
      where: { email: `${PREFIX}pending@example.test` },
    });
    expect(users).toHaveLength(1);
  });

  it("blocks a pending user from another clinic and allows expired same-clinic reinvite", async () => {
    const invited = await inviteClinicUser({
      clinicId: CLINIC_B,
      invitedByUserId: OPERATOR_ID,
      name: "Cross Clinic",
      email: `${PREFIX}cross@example.test`,
      role: "STAFF",
    });
    expect(invited.ok).toBe(true);
    await expect(
      inviteClinicUser({
        clinicId: CLINIC_A,
        invitedByUserId: OPERATOR_ID,
        name: "Cross Clinic",
        email: `${PREFIX}cross@example.test`,
        role: "ADMIN",
      })
    ).resolves.toMatchObject({
      ok: false,
      error: OTHER_CLINIC_MEMBER_MESSAGE,
    });

    const expiredAt = new Date("2026-09-01T00:00:00.000Z");
    const expiredInvite = await inviteClinicUser({
      clinicId: CLINIC_A,
      invitedByUserId: OPERATOR_ID,
      name: "Expired Person",
      email: `${PREFIX}expired@example.test`,
      role: "STAFF",
      now: expiredAt,
    });
    expect(expiredInvite.ok).toBe(true);
    const later = new Date("2026-09-10T00:00:00.000Z");
    const team = await listClinicTeam(CLINIC_A, later);
    expect(
      team?.rows.find((row) => row.email === `${PREFIX}expired@example.test`)
        ?.status
    ).toBe("expired");
    const reinvite = await inviteClinicUser({
      clinicId: CLINIC_A,
      invitedByUserId: OPERATOR_ID,
      name: "Expired Person",
      email: `${PREFIX}expired@example.test`,
      role: "ADMIN",
      now: later,
    });
    expect(reinvite.ok).toBe(true);
    if (!reinvite.ok) {
      return;
    }
    expect(reinvite.userId).toBe(
      expiredInvite.ok ? expiredInvite.userId : reinvite.userId
    );
  });

  it("resends a pending invitation, revoking the previous token", async () => {
    const invited = await inviteClinicUser({
      clinicId: CLINIC_A,
      invitedByUserId: OPERATOR_ID,
      name: "Resend Person",
      email: `${PREFIX}resend@example.test`,
      role: "STAFF",
    });
    expect(invited.ok).toBe(true);
    if (!invited.ok) {
      return;
    }
    const firstToken = await prisma.accountToken.findFirst({
      where: {
        userId: invited.userId,
        type: AccountTokenType.INVITATION,
        revokedAt: null,
      },
    });
    expect(firstToken).toBeTruthy();

    const resent = await resendClinicInvitation({
      clinicId: CLINIC_A,
      userId: invited.userId,
      invitedByUserId: OPERATOR_ID,
    });
    expect(resent.ok).toBe(true);
    if (!resent.ok) {
      return;
    }

    const oldRow = await prisma.accountToken.findUnique({
      where: { id: firstToken!.id },
    });
    expect(oldRow?.revokedAt).toBeTruthy();
    const outstanding = await prisma.accountToken.findMany({
      where: {
        userId: invited.userId,
        type: AccountTokenType.INVITATION,
        consumedAt: null,
        revokedAt: null,
      },
    });
    expect(outstanding).toHaveLength(1);
    expect(outstanding[0]?.id).not.toBe(firstToken?.id);
    const memberships = await prisma.clinicMembership.count({
      where: { userId: invited.userId },
    });
    expect(memberships).toBe(0);
    const user = await prisma.user.findUnique({
      where: { id: invited.userId },
    });
    expect(user?.passwordHash).toBeNull();
  });

  it("cancels a pending invitation and allows a later reinvite", async () => {
    const invited = await inviteClinicUser({
      clinicId: CLINIC_A,
      invitedByUserId: OPERATOR_ID,
      name: "Cancel Person",
      email: `${PREFIX}cancel@example.test`,
      role: "STAFF",
    });
    expect(invited.ok).toBe(true);
    if (!invited.ok) {
      return;
    }
    const outstanding = await prisma.accountToken.findFirst({
      where: {
        userId: invited.userId,
        consumedAt: null,
        revokedAt: null,
      },
    });
    const cancelled = await cancelClinicInvitation({
      clinicId: CLINIC_A,
      userId: invited.userId,
    });
    expect(cancelled.ok).toBe(true);
    const after = await prisma.accountToken.findUnique({
      where: { id: outstanding!.id },
    });
    expect(after?.revokedAt).toBeTruthy();
    expect(
      await prisma.clinicMembership.count({ where: { userId: invited.userId } })
    ).toBe(0);
    const user = await prisma.user.findUnique({
      where: { id: invited.userId },
    });
    expect(user?.passwordHash).toBeNull();

    const team = await listClinicTeam(CLINIC_A);
    expect(team?.rows.find((row) => row.email === user?.email)).toBeUndefined();

    const reinvited = await inviteClinicUser({
      clinicId: CLINIC_A,
      invitedByUserId: OPERATOR_ID,
      name: "Cancel Person Updated",
      email: `${PREFIX}cancel@example.test`,
      role: "ADMIN",
    });
    expect(reinvited.ok).toBe(true);
    if (!reinvited.ok) {
      return;
    }
    expect(reinvited.userId).toBe(invited.userId);
    const updated = await prisma.user.findUnique({
      where: { id: invited.userId },
    });
    expect(updated?.name).toBe("Cancel Person Updated");
  });

  it("accepts a valid invitation, sets the password, and creates one membership", async () => {
    const invited = await inviteClinicUser({
      clinicId: CLINIC_A,
      invitedByUserId: OPERATOR_ID,
      name: "Accept Person",
      email: `${PREFIX}accept@example.test`,
      role: "ADMIN",
    });
    expect(invited.ok).toBe(true);
    if (!invited.ok) {
      return;
    }
    const tokenRow = await prisma.accountToken.findFirst({
      where: {
        userId: invited.userId,
        consumedAt: null,
        revokedAt: null,
      },
    });
    expect(tokenRow).toBeTruthy();

    const rawToken = await recoverRawTokenForTest(tokenRow!.tokenHash);
    expect(rawToken).toBeTruthy();

    const pendingLogin = await loginPost(
      new Request("http://app.localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: `${PREFIX}accept@example.test`,
          password: "abcdefghijkl",
        }),
      })
    );
    expect(pendingLogin.status).toBe(401);
    expect(await pendingLogin.json()).toEqual({
      error: "Invalid credentials.",
    });

    const tooShort = await acceptInvitationWithToken({
      rawToken: rawToken!,
      newPassword: "abcdefghijk",
      confirmPassword: "abcdefghijk",
    });
    expect(tooShort).toMatchObject({ error: NEW_PASSWORD_MIN_MESSAGE });

    const tooLong = await acceptInvitationWithToken({
      rawToken: rawToken!,
      newPassword: "p".repeat(257),
      confirmPassword: "p".repeat(257),
    });
    expect(tooLong).toMatchObject({ error: NEW_PASSWORD_MAX_MESSAGE });

    const accepted = await acceptInvitationWithToken({
      rawToken: rawToken!,
      newPassword: "abcdefghijkl",
      confirmPassword: "abcdefghijkl",
    });
    expect(accepted).toEqual({ ok: true });

    const user = await prisma.user.findUnique({
      where: { id: invited.userId },
    });
    expect(user?.passwordHash).toBeTruthy();
    expect(verifyPassword("abcdefghijkl", user?.passwordHash)).toBe(true);
    expect(user?.emailVerified).toBeTruthy();
    const memberships = await prisma.clinicMembership.findMany({
      where: { userId: invited.userId },
    });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.clinicId).toBe(CLINIC_A);
    expect(memberships[0]?.role).toBe(ClinicMembershipRole.ADMIN);
    expect(
      await lookupAccountToken(rawToken!, AccountTokenType.INVITATION)
    ).toEqual({ ok: false, reason: "consumed" });
    const sessions = await prisma.session.count({
      where: { userId: invited.userId },
    });
    expect(sessions).toBe(0);

    const replay = await acceptInvitationWithToken({
      rawToken: rawToken!,
      newPassword: "abcdefghijkl",
      confirmPassword: "abcdefghijkl",
    });
    expect(replay.ok).toBe(false);

    const login = await loginPost(
      new Request("http://app.localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: `${PREFIX}accept@example.test`,
          password: "abcdefghijkl",
        }),
      })
    );
    expect(login.status).toBe(200);
    const body = (await login.json()) as { redirectTo?: string };
    expect(body.redirectTo).toBe("/dashboard");
  });

  it("rejects a password-reset token for invitation acceptance", async () => {
    const invited = await inviteClinicUser({
      clinicId: CLINIC_A,
      invitedByUserId: OPERATOR_ID,
      name: "Wrong Type",
      email: `${PREFIX}wrongtype@example.test`,
      role: "STAFF",
    });
    expect(invited.ok).toBe(true);
    if (!invited.ok) {
      return;
    }
    const { createPasswordResetToken } =
      await import("@/lib/auth/account-token-service");
    const reset = await createPasswordResetToken({
      userId: invited.userId,
      email: `${PREFIX}wrongtype@example.test`,
    });
    const result = await acceptInvitationWithToken({
      rawToken: reset.rawToken,
      newPassword: "abcdefghijkl",
      confirmPassword: "abcdefghijkl",
    });
    expect(result.ok).toBe(false);
    const user = await prisma.user.findUnique({
      where: { id: invited.userId },
    });
    expect(user?.passwordHash).toBeNull();
  });

  it("rejects oversized emails, HTML names, and unknown roles", async () => {
    await expect(
      inviteClinicUser({
        clinicId: CLINIC_A,
        invitedByUserId: OPERATOR_ID,
        name: "Jane",
        email: `${"a".repeat(250)}@example.test`,
        role: "STAFF",
      })
    ).resolves.toMatchObject({ ok: false, code: "invalid_email" });
    await expect(
      inviteClinicUser({
        clinicId: CLINIC_A,
        invitedByUserId: OPERATOR_ID,
        name: "Jane <script>",
        email: `${PREFIX}html@example.test`,
        role: "STAFF",
      })
    ).resolves.toMatchObject({ ok: false, code: "invalid_name" });
    await expect(
      inviteClinicUser({
        clinicId: CLINIC_A,
        invitedByUserId: OPERATOR_ID,
        name: "Jane",
        email: `${PREFIX}badrole@example.test`,
        role: "OPERATOR",
      })
    ).resolves.toMatchObject({ ok: false, code: "invalid_role" });
  });

  it("keeps a pending invitation when auth email is not configured", async () => {
    const previous = process.env.AUTH_EMAIL_FROM;
    delete process.env.AUTH_EMAIL_FROM;
    const result = await inviteClinicUser({
      clinicId: CLINIC_A,
      invitedByUserId: OPERATOR_ID,
      name: "No Mail",
      email: `${PREFIX}nomail@example.test`,
      role: "STAFF",
    });
    restore("AUTH_EMAIL_FROM", previous);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.delivered).toBe(false);
    const user = await prisma.user.findUnique({
      where: { email: `${PREFIX}nomail@example.test` },
    });
    expect(user?.passwordHash).toBeNull();
    expect(
      await prisma.accountToken.count({
        where: {
          userId: user?.id,
          type: AccountTokenType.INVITATION,
          consumedAt: null,
          revokedAt: null,
        },
      })
    ).toBe(1);
  });

  it("blocks inviting an active zero-membership account", async () => {
    const orphan = await prisma.user.create({
      data: {
        email: `${PREFIX}orphan@example.test`,
        name: "Orphan",
        passwordHash: hashPassword("orphan-pass-12"),
        platformRole: PlatformRole.NONE,
      },
    });
    await expect(
      inviteClinicUser({
        clinicId: CLINIC_A,
        invitedByUserId: OPERATOR_ID,
        name: "Orphan",
        email: orphan.email,
        role: "STAFF",
      })
    ).resolves.toMatchObject({
      ok: false,
      error: EXISTING_ACCOUNT_MESSAGE,
    });
    const after = await prisma.user.findUnique({ where: { id: orphan.id } });
    expect(after?.passwordHash).toBe(orphan.passwordHash);
  });

  it("removes active access and invalidates only that user's sessions", async () => {
    const user = await prisma.user.create({
      data: {
        email: `${PREFIX}remove@example.test`,
        name: "Remove Me",
        passwordHash: hashPassword("remove-pass-12"),
        platformRole: PlatformRole.NONE,
      },
    });
    const other = await prisma.user.create({
      data: {
        email: `${PREFIX}untouched@example.test`,
        name: "Keep Me",
        passwordHash: hashPassword("keep-pass-123"),
        platformRole: PlatformRole.NONE,
      },
    });
    const membership = await prisma.clinicMembership.create({
      data: {
        clinicId: CLINIC_A,
        userId: user.id,
        role: ClinicMembershipRole.STAFF,
      },
    });
    await prisma.clinicMembership.create({
      data: {
        clinicId: CLINIC_A,
        userId: other.id,
        role: ClinicMembershipRole.ADMIN,
      },
    });
    await prisma.session.createMany({
      data: [
        {
          sessionToken: `${PREFIX}remove_session`,
          userId: user.id,
          expires: new Date("2026-10-19T12:00:00.000Z"),
        },
        {
          sessionToken: `${PREFIX}other_session`,
          userId: other.id,
          expires: new Date("2026-10-19T12:00:00.000Z"),
        },
      ],
    });

    const removed = await removeClinicAccess({
      clinicId: CLINIC_A,
      membershipId: membership.id,
    });
    expect(removed).toEqual({ ok: true, userId: user.id });
    expect(
      await prisma.clinicMembership.findUnique({ where: { id: membership.id } })
    ).toBeNull();
    const keptUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(keptUser?.passwordHash).toBeTruthy();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: other.id } })).toBe(1);

    const login = await loginPost(
      new Request("http://app.localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: `${PREFIX}remove@example.test`,
          password: "remove-pass-12",
        }),
      })
    );
    expect(login.status).toBe(403);
    expect(await login.json()).toEqual({
      error: "Your account does not have staff access yet.",
    });
  });

  it("allows only one concurrent invitation acceptance", async () => {
    const invited = await inviteClinicUser({
      clinicId: CLINIC_A,
      invitedByUserId: OPERATOR_ID,
      name: "Concurrent Person",
      email: `${PREFIX}concurrent@example.test`,
      role: "STAFF",
    });
    expect(invited.ok).toBe(true);
    if (!invited.ok) {
      return;
    }
    const tokenRow = await prisma.accountToken.findFirst({
      where: {
        userId: invited.userId,
        consumedAt: null,
        revokedAt: null,
      },
    });
    const rawToken = await recoverRawTokenForTest(tokenRow!.tokenHash);
    const [first, second] = await Promise.all([
      acceptInvitationWithToken({
        rawToken: rawToken!,
        newPassword: "abcdefghijkl",
        confirmPassword: "abcdefghijkl",
      }),
      acceptInvitationWithToken({
        rawToken: rawToken!,
        newPassword: "mnopqrstuvwx",
        confirmPassword: "mnopqrstuvwx",
      }),
    ]);
    const succeeded = [first, second].filter((result) => result.ok);
    const failed = [first, second].filter((result) => !result.ok);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(
      await prisma.clinicMembership.count({ where: { userId: invited.userId } })
    ).toBe(1);
    const user = await prisma.user.findUnique({
      where: { id: invited.userId },
    });
    expect(user?.passwordHash).toBeTruthy();
    const firstPass = verifyPassword("abcdefghijkl", user?.passwordHash);
    const secondPass = verifyPassword("mnopqrstuvwx", user?.passwordHash);
    expect(firstPass || secondPass).toBe(true);
    expect(firstPass && secondPass).toBe(false);
  });
});

async function recoverRawTokenForTest(
  tokenHash: string
): Promise<string | null> {
  const { getTransactionalEmailMemoryInbox } =
    await import("@/lib/email/transactional-mailer");
  for (const message of getTransactionalEmailMemoryInbox()) {
    const match = message.text.match(/#token=([A-Za-z0-9_-]+)/);
    if (!match?.[1]) {
      continue;
    }
    if (hashAccountToken(match[1]) === tokenHash) {
      return match[1];
    }
  }
  return null;
}
