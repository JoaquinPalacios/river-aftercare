import "dotenv/config";

import { existsSync, readFileSync } from "node:fs";

import { AccountTokenType, ClinicMembershipRole } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import { hashAccountToken } from "@/lib/auth/account-token";
import {
  consumeAccountToken,
  completePasswordReset,
  createInvitationToken,
  createPasswordResetToken,
  createPasswordResetTokenIfAllowed,
  lookupAccountToken,
  revokeAccountToken,
} from "@/lib/auth/account-token-service";
import { getPrisma } from "@/lib/prisma";

const prisma = getPrisma();
const PREFIX = "test_acctok_";
const USER_A = `${PREFIX}user_a`;
const USER_B = `${PREFIX}user_b`;
const INVITER = `${PREFIX}inviter`;
const CLINIC_A = `${PREFIX}clinic_a`;
const CLINIC_B = `${PREFIX}clinic_b`;

async function cleanup() {
  await prisma.accountToken.deleteMany({
    where: {
      OR: [
        { userId: { in: [USER_A, USER_B, INVITER] } },
        { clinicId: { in: [CLINIC_A, CLINIC_B] } },
      ],
    },
  });
  await prisma.clinic.deleteMany({
    where: { id: { in: [CLINIC_A, CLINIC_B] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [USER_A, USER_B, INVITER] } },
  });
}

async function seed() {
  await cleanup();
  await prisma.user.createMany({
    data: [
      { id: USER_A, email: `${PREFIX}a@example.test` },
      { id: USER_B, email: `${PREFIX}b@example.test` },
      { id: INVITER, email: `${PREFIX}inviter@example.test` },
    ],
  });
  await prisma.clinic.createMany({
    data: [
      { id: CLINIC_A, name: "Token Clinic A", slug: "testacctok-a" },
      { id: CLINIC_B, name: "Token Clinic B", slug: "testacctok-b" },
    ],
  });
}

describe("account token service", () => {
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("creates a password-reset token, hashes it, and expires in 30 minutes", async () => {
    await seed();
    const now = new Date("2026-09-19T12:00:00.000Z");
    const created = await createPasswordResetToken({
      userId: USER_A,
      email: "  Alex@Example.TEST  ",
      now,
    });

    expect(created.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.token.type).toBe(AccountTokenType.PASSWORD_RESET);
    expect(created.token.email).toBe("alex@example.test");
    expect(created.token.clinicId).toBeNull();
    expect(created.token.role).toBeNull();
    expect(created.token.invitedByUserId).toBeNull();
    expect(created.token.expiresAt.toISOString()).toBe(
      "2026-09-19T12:30:00.000Z"
    );

    const stored = await prisma.accountToken.findUnique({
      where: { id: created.token.id },
    });
    expect(stored).toBeTruthy();
    expect(stored?.tokenHash).toBe(hashAccountToken(created.rawToken));
    expect(stored?.tokenHash).not.toBe(created.rawToken);
    expect(JSON.stringify(stored)).not.toContain(created.rawToken);
    expect(created.token).not.toHaveProperty("tokenHash");
    expect(created.token).not.toHaveProperty("rawToken");
  });

  it("revokes the previous outstanding password-reset token for the same user", async () => {
    await seed();
    const first = await createPasswordResetToken({
      userId: USER_A,
      email: "a@example.test",
    });
    const second = await createPasswordResetToken({
      userId: USER_A,
      email: "a@example.test",
    });

    const firstRow = await prisma.accountToken.findUnique({
      where: { id: first.token.id },
    });
    const outstanding = await prisma.accountToken.findMany({
      where: {
        userId: USER_A,
        type: AccountTokenType.PASSWORD_RESET,
        consumedAt: null,
        revokedAt: null,
      },
    });

    expect(firstRow?.revokedAt).toBeTruthy();
    expect(outstanding).toHaveLength(1);
    expect(outstanding[0]?.id).toBe(second.token.id);
    expect(
      await lookupAccountToken(first.rawToken, AccountTokenType.PASSWORD_RESET)
    ).toEqual({ ok: false, reason: "revoked" });
    expect(
      await lookupAccountToken(second.rawToken, AccountTokenType.PASSWORD_RESET)
    ).toMatchObject({ ok: true, token: { id: second.token.id } });
  });

  it("allows independent password-reset tokens for different users", async () => {
    await seed();
    const first = await createPasswordResetToken({
      userId: USER_A,
      email: "a@example.test",
    });
    const second = await createPasswordResetToken({
      userId: USER_B,
      email: "b@example.test",
    });

    expect(
      await lookupAccountToken(first.rawToken, AccountTokenType.PASSWORD_RESET)
    ).toMatchObject({ ok: true });
    expect(
      await lookupAccountToken(second.rawToken, AccountTokenType.PASSWORD_RESET)
    ).toMatchObject({ ok: true });
  });

  it("rejects expired, consumed, revoked, and wrong-type password-reset lookups", async () => {
    await seed();
    const now = new Date("2026-09-19T12:00:00.000Z");
    const created = await createPasswordResetToken({
      userId: USER_A,
      email: "a@example.test",
      now,
    });

    expect(
      await lookupAccountToken(created.rawToken, AccountTokenType.INVITATION)
    ).toEqual({ ok: false, reason: "wrong_type" });
    expect(
      await lookupAccountToken(
        created.rawToken,
        AccountTokenType.PASSWORD_RESET,
        { now: new Date("2026-09-19T12:30:00.000Z") }
      )
    ).toEqual({ ok: false, reason: "expired" });
    expect(
      await lookupAccountToken("", AccountTokenType.PASSWORD_RESET)
    ).toEqual({ ok: false, reason: "missing" });
    expect(
      await lookupAccountToken(
        "not-a-real-token",
        AccountTokenType.PASSWORD_RESET
      )
    ).toEqual({ ok: false, reason: "missing" });

    const consumed = await consumeAccountToken(created.token.id, {
      expectedType: AccountTokenType.PASSWORD_RESET,
      now: new Date("2026-09-19T12:10:00.000Z"),
    });
    expect(consumed.ok).toBe(true);
    expect(
      await lookupAccountToken(
        created.rawToken,
        AccountTokenType.PASSWORD_RESET,
        { now: new Date("2026-09-19T12:10:00.000Z") }
      )
    ).toEqual({ ok: false, reason: "consumed" });
    expect(
      await consumeAccountToken(created.token.id, {
        expectedType: AccountTokenType.PASSWORD_RESET,
        now: new Date("2026-09-19T12:10:00.000Z"),
      })
    ).toEqual({ ok: false, reason: "consumed" });

    const replacement = await createPasswordResetToken({
      userId: USER_A,
      email: "a@example.test",
    });
    await revokeAccountToken(replacement.token.id);
    expect(
      await lookupAccountToken(
        replacement.rawToken,
        AccountTokenType.PASSWORD_RESET
      )
    ).toEqual({ ok: false, reason: "revoked" });
  });

  it("creates an invitation token with clinic, role, inviter, and 7-day expiry", async () => {
    await seed();
    const now = new Date("2026-09-19T12:00:00.000Z");
    const created = await createInvitationToken({
      userId: USER_A,
      clinicId: CLINIC_A,
      role: ClinicMembershipRole.STAFF,
      email: "A@Example.TEST",
      invitedByUserId: INVITER,
      now,
    });

    expect(created.token.type).toBe(AccountTokenType.INVITATION);
    expect(created.token.clinicId).toBe(CLINIC_A);
    expect(created.token.role).toBe(ClinicMembershipRole.STAFF);
    expect(created.token.invitedByUserId).toBe(INVITER);
    expect(created.token.email).toBe("a@example.test");
    expect(created.token.expiresAt.toISOString()).toBe(
      "2026-09-26T12:00:00.000Z"
    );
    expect(
      await lookupAccountToken(created.rawToken, AccountTokenType.INVITATION, {
        now,
      })
    ).toMatchObject({ ok: true, token: { id: created.token.id } });
  });

  it("revokes a prior invitation for the same user and clinic only", async () => {
    await seed();
    const first = await createInvitationToken({
      userId: USER_A,
      clinicId: CLINIC_A,
      role: ClinicMembershipRole.STAFF,
      email: "a@example.test",
      invitedByUserId: INVITER,
    });
    const otherClinic = await createInvitationToken({
      userId: USER_A,
      clinicId: CLINIC_B,
      role: ClinicMembershipRole.ADMIN,
      email: "a@example.test",
      invitedByUserId: INVITER,
    });
    const otherUser = await createInvitationToken({
      userId: USER_B,
      clinicId: CLINIC_A,
      role: ClinicMembershipRole.STAFF,
      email: "b@example.test",
      invitedByUserId: INVITER,
    });
    const replacement = await createInvitationToken({
      userId: USER_A,
      clinicId: CLINIC_A,
      role: ClinicMembershipRole.ADMIN,
      email: "a@example.test",
      invitedByUserId: INVITER,
    });

    expect(
      await lookupAccountToken(first.rawToken, AccountTokenType.INVITATION)
    ).toEqual({ ok: false, reason: "revoked" });
    expect(
      await lookupAccountToken(
        otherClinic.rawToken,
        AccountTokenType.INVITATION
      )
    ).toMatchObject({ ok: true });
    expect(
      await lookupAccountToken(otherUser.rawToken, AccountTokenType.INVITATION)
    ).toMatchObject({ ok: true });
    expect(
      await lookupAccountToken(
        replacement.rawToken,
        AccountTokenType.INVITATION
      )
    ).toMatchObject({ ok: true, token: { id: replacement.token.id } });
  });

  it("rejects expired, consumed, revoked, and wrong-type invitation lookups", async () => {
    await seed();
    const now = new Date("2026-09-19T12:00:00.000Z");
    const created = await createInvitationToken({
      userId: USER_A,
      clinicId: CLINIC_A,
      role: ClinicMembershipRole.STAFF,
      email: "a@example.test",
      invitedByUserId: INVITER,
      now,
    });

    expect(
      await lookupAccountToken(
        created.rawToken,
        AccountTokenType.PASSWORD_RESET
      )
    ).toEqual({ ok: false, reason: "wrong_type" });
    expect(
      await lookupAccountToken(created.rawToken, AccountTokenType.INVITATION, {
        now: new Date("2026-09-26T12:00:00.000Z"),
      })
    ).toEqual({ ok: false, reason: "expired" });

    const consumed = await consumeAccountToken(created.token.id, {
      expectedType: AccountTokenType.INVITATION,
      now: new Date("2026-09-20T12:00:00.000Z"),
    });
    expect(consumed.ok).toBe(true);
    expect(
      await lookupAccountToken(created.rawToken, AccountTokenType.INVITATION, {
        now: new Date("2026-09-20T12:00:00.000Z"),
      })
    ).toEqual({ ok: false, reason: "consumed" });

    const replacement = await createInvitationToken({
      userId: USER_A,
      clinicId: CLINIC_A,
      role: ClinicMembershipRole.STAFF,
      email: "a@example.test",
      invitedByUserId: INVITER,
    });
    await revokeAccountToken(replacement.token.id);
    expect(
      await lookupAccountToken(
        replacement.rawToken,
        AccountTokenType.INVITATION
      )
    ).toEqual({ ok: false, reason: "revoked" });
  });

  it("serializes concurrent password-reset creation to one outstanding token", async () => {
    await seed();
    const [first, second] = await Promise.all([
      createPasswordResetToken({
        userId: USER_A,
        email: "a@example.test",
      }),
      createPasswordResetToken({
        userId: USER_A,
        email: "a@example.test",
      }),
    ]);

    const outstanding = await prisma.accountToken.findMany({
      where: {
        userId: USER_A,
        type: AccountTokenType.PASSWORD_RESET,
        consumedAt: null,
        revokedAt: null,
      },
    });
    expect(outstanding).toHaveLength(1);
    expect([first.token.id, second.token.id]).toContain(outstanding[0]?.id);
  });

  it("does not create a second reset token inside the 10-minute cooldown", async () => {
    await seed();
    const now = new Date("2026-09-19T12:00:00.000Z");
    const first = await createPasswordResetTokenIfAllowed({
      userId: USER_A,
      email: "a@example.test",
      now,
    });
    expect(first.created).toBe(true);

    const second = await createPasswordResetTokenIfAllowed({
      userId: USER_A,
      email: "a@example.test",
      now: new Date("2026-09-19T12:09:59.000Z"),
    });
    expect(second).toEqual({ created: false, reason: "cooldown" });

    const outstanding = await prisma.accountToken.findMany({
      where: {
        userId: USER_A,
        type: AccountTokenType.PASSWORD_RESET,
        consumedAt: null,
        revokedAt: null,
      },
    });
    expect(outstanding).toHaveLength(1);
    if (first.created) {
      expect(outstanding[0]?.id).toBe(first.token.id);
    }
  });

  it("supersedes an outstanding reset after the cooldown window", async () => {
    await seed();
    const first = await createPasswordResetTokenIfAllowed({
      userId: USER_A,
      email: "a@example.test",
      now: new Date("2026-09-19T12:00:00.000Z"),
    });
    const second = await createPasswordResetTokenIfAllowed({
      userId: USER_A,
      email: "a@example.test",
      now: new Date("2026-09-19T12:10:00.000Z"),
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    if (first.created && second.created) {
      const firstRow = await prisma.accountToken.findUnique({
        where: { id: first.token.id },
      });
      expect(firstRow?.revokedAt).toBeTruthy();
      expect(second.token.id).not.toBe(first.token.id);
    }
  });

  it("serializes concurrent cooldown-aware reset creation", async () => {
    await seed();
    const now = new Date("2026-09-19T12:00:00.000Z");
    const results = await Promise.all([
      createPasswordResetTokenIfAllowed({
        userId: USER_A,
        email: "a@example.test",
        now,
      }),
      createPasswordResetTokenIfAllowed({
        userId: USER_A,
        email: "a@example.test",
        now,
      }),
    ]);

    const created = results.filter((result) => result.created);
    const cooled = results.filter((result) => !result.created);
    expect(created).toHaveLength(1);
    expect(cooled).toHaveLength(1);
  });

  it("consumes a reset token once, updates the password, and deletes sessions", async () => {
    await seed();
    await prisma.user.update({
      where: { id: USER_A },
      data: { passwordHash: "scrypt:old" },
    });
    await prisma.session.create({
      data: {
        sessionToken: `${PREFIX}session_a`,
        userId: USER_A,
        expires: new Date("2026-10-19T12:00:00.000Z"),
      },
    });
    await prisma.session.create({
      data: {
        sessionToken: `${PREFIX}session_b`,
        userId: USER_B,
        expires: new Date("2026-10-19T12:00:00.000Z"),
      },
    });

    const created = await createPasswordResetToken({
      userId: USER_A,
      email: "a@example.test",
    });
    const first = await completePasswordReset({
      rawToken: created.rawToken,
      passwordHash: "scrypt:new",
    });
    const second = await completePasswordReset({
      rawToken: created.rawToken,
      passwordHash: "scrypt:other",
    });

    expect(first).toEqual({
      ok: true,
      userId: USER_A,
      tokenId: created.token.id,
    });
    expect(second.ok).toBe(false);
    const user = await prisma.user.findUnique({ where: { id: USER_A } });
    expect(user?.passwordHash).toBe("scrypt:new");
    expect(
      await prisma.session.findMany({ where: { userId: USER_A } })
    ).toEqual([]);
    expect(
      await prisma.session.findMany({ where: { userId: USER_B } })
    ).toHaveLength(1);
  });

  it("lets only one concurrent reset consume the token", async () => {
    await seed();
    await prisma.user.update({
      where: { id: USER_A },
      data: { passwordHash: "scrypt:old" },
    });
    const created = await createPasswordResetToken({
      userId: USER_A,
      email: "a@example.test",
    });
    const results = await Promise.all([
      completePasswordReset({
        rawToken: created.rawToken,
        passwordHash: "scrypt:first",
      }),
      completePasswordReset({
        rawToken: created.rawToken,
        passwordHash: "scrypt:second",
      }),
    ]);

    const succeeded = results.filter((result) => result.ok);
    const failed = results.filter((result) => !result.ok);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    const user = await prisma.user.findUnique({ where: { id: USER_A } });
    expect(["scrypt:first", "scrypt:second"]).toContain(user?.passwordHash);
    expect(user?.passwordHash).not.toBe("scrypt:old");
  });

  it("rejects invitation tokens for password reset completion", async () => {
    await seed();
    const created = await createInvitationToken({
      userId: USER_A,
      clinicId: CLINIC_A,
      role: ClinicMembershipRole.STAFF,
      email: "a@example.test",
      invitedByUserId: INVITER,
    });
    const result = await completePasswordReset({
      rawToken: created.rawToken,
      passwordHash: "scrypt:new",
    });
    expect(result).toEqual({ ok: false, reason: "wrong_type" });
  });

  it("does not add invitation UI in this password-management change", () => {
    expect(existsSync("app/(staff)/invite")).toBe(false);
    expect(existsSync("app/(staff)/forgot-password")).toBe(true);
    expect(existsSync("app/(staff)/reset-password")).toBe(true);
    expect(existsSync("app/api/auth/forgot-password")).toBe(true);
    expect(existsSync("app/api/auth/reset-password")).toBe(true);
    expect(
      readFileSync("lib/auth/account-token-service.ts", "utf8")
    ).not.toMatch(/sendAuthTransactionalEmail|AUTH_EMAIL_FROM/);
  });
});
