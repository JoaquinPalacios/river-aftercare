import "dotenv/config";

import { AccountTokenType, PlatformRole } from "@prisma/client";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

import { completeEmailChangeWithToken } from "@/lib/auth/complete-email-change";
import { hashAccountToken } from "@/lib/auth/account-token";
import {
  createPasswordResetToken,
  findOutstandingEmailChange,
  lookupAccountToken,
} from "@/lib/auth/account-token-service";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { requestEmailChange } from "@/lib/auth/request-email-change";
import { requestPasswordReset } from "@/lib/auth/request-password-reset";
import { updateOwnProfile } from "@/lib/auth/update-own-profile";
import { PROFILE_EMAIL_TAKEN_MESSAGE } from "@/lib/auth/account-profile-schema";
import { getPrisma } from "@/lib/prisma";
import {
  clearTransactionalEmailMemoryInbox,
  getTransactionalEmailMemoryInbox,
} from "@/lib/email/transactional-mailer";

const prisma = getPrisma();
const PREFIX = "test_emailchg_";
const USER_A = `${PREFIX}user_a`;
const USER_B = `${PREFIX}user_b`;
const CURRENT_PASSWORD = "email-change-pass";

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

async function cleanup() {
  await prisma.accountToken.deleteMany({
    where: { userId: { in: [USER_A, USER_B] } },
  });
  await prisma.session.deleteMany({
    where: { userId: { in: [USER_A, USER_B] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [USER_A, USER_B] } },
  });
}

async function seed() {
  await cleanup();
  await prisma.user.createMany({
    data: [
      {
        id: USER_A,
        email: `${PREFIX}a@example.test`,
        name: "User A",
        passwordHash: hashPassword(CURRENT_PASSWORD),
        platformRole: PlatformRole.NONE,
        emailVerified: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: USER_B,
        email: `${PREFIX}b@example.test`,
        name: "User B",
        passwordHash: hashPassword("other-user-pass"),
        platformRole: PlatformRole.NONE,
      },
    ],
  });
}

function rawTokenFromInbox(): string {
  const mail = getTransactionalEmailMemoryInbox().at(-1);
  const match = mail?.text.match(/#token=([A-Za-z0-9_-]+)/);
  expect(match?.[1]).toBeTruthy();
  return match![1];
}

describe("verify-first email change", () => {
  const previousFrom = process.env.AUTH_EMAIL_FROM;
  const previousReply = process.env.AUTH_EMAIL_REPLY_TO;
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;
  const previousVercel = process.env.VERCEL_ENV;

  afterEach(() => {
    restore("AUTH_EMAIL_FROM", previousFrom);
    restore("AUTH_EMAIL_REPLY_TO", previousReply);
    restore("CARE_GUIDE_ROOT_DOMAIN", previousRoot);
    restore("VERCEL_ENV", previousVercel);
    clearTransactionalEmailMemoryInbox();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("keeps the current email active until the new address is confirmed", async () => {
    await seed();
    process.env.AUTH_EMAIL_FROM = "River Aftercare <accounts@example.test>";
    process.env.CARE_GUIDE_ROOT_DOMAIN = "example.test";
    delete process.env.VERCEL_ENV;
    clearTransactionalEmailMemoryInbox();

    const requested = await updateOwnProfile({
      userId: USER_A,
      name: "User A",
      email: `${PREFIX}a-next@example.test`,
      currentPassword: CURRENT_PASSWORD,
    });
    expect(requested).toMatchObject({
      ok: true,
      email: `${PREFIX}a@example.test`,
      emailChanged: true,
      pendingEmail: `${PREFIX}a-next@example.test`,
    });

    const userBefore = await prisma.user.findUnique({ where: { id: USER_A } });
    expect(userBefore?.email).toBe(`${PREFIX}a@example.test`);
    expect(userBefore?.emailVerified).toEqual(
      new Date("2026-01-01T00:00:00.000Z")
    );

    expect(
      await prisma.user.findUnique({
        where: { email: `${PREFIX}a-next@example.test` },
      })
    ).toBeNull();
    expect(
      await prisma.user.findUnique({
        where: { email: `${PREFIX}a@example.test` },
      })
    ).toMatchObject({ id: USER_A });

    const pending = await findOutstandingEmailChange({ userId: USER_A });
    expect(pending?.email).toBe(`${PREFIX}a-next@example.test`);
    expect(pending?.type).toBe(AccountTokenType.EMAIL_CHANGE);

    const mail = getTransactionalEmailMemoryInbox().at(-1);
    expect(mail?.to).toBe(`${PREFIX}a-next@example.test`);
    expect(mail?.text).toContain("/confirm-email-change#token=");
    expect(JSON.stringify(mail)).not.toMatch(CURRENT_PASSWORD);

    const reset = await createPasswordResetToken({
      userId: USER_A,
      email: `${PREFIX}a@example.test`,
    });
    expect(reset.token.email).toBe(`${PREFIX}a@example.test`);
    expect(
      await lookupAccountToken(reset.rawToken, AccountTokenType.PASSWORD_RESET)
    ).toMatchObject({ ok: true });
  });

  it("confirms the new email once, then rejects reuse and the old identity", async () => {
    await seed();
    process.env.AUTH_EMAIL_FROM = "River Aftercare <accounts@example.test>";
    process.env.CARE_GUIDE_ROOT_DOMAIN = "example.test";
    delete process.env.VERCEL_ENV;
    clearTransactionalEmailMemoryInbox();

    await prisma.accountToken.create({
      data: {
        type: AccountTokenType.PASSWORD_RESET,
        tokenHash: "a".repeat(64),
        userId: USER_A,
        email: `${PREFIX}a@example.test`,
        expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      },
    });

    const requested = await requestEmailChange({
      userId: USER_A,
      email: `${PREFIX}a-next@example.test`,
    });
    expect(requested.ok).toBe(true);
    const rawToken = rawTokenFromInbox();

    const completed = await completeEmailChangeWithToken({ rawToken });
    expect(completed).toMatchObject({
      ok: true,
      userId: USER_A,
      email: `${PREFIX}a-next@example.test`,
    });
    expect(JSON.stringify(completed)).not.toContain(rawToken);
    expect(JSON.stringify(completed)).not.toContain(CURRENT_PASSWORD);

    const user = await prisma.user.findUnique({ where: { id: USER_A } });
    expect(user?.email).toBe(`${PREFIX}a-next@example.test`);
    expect(user?.emailVerified).toBeTruthy();
    expect(verifyPassword(CURRENT_PASSWORD, user?.passwordHash)).toBe(true);

    expect(
      await prisma.user.findUnique({
        where: { email: `${PREFIX}a@example.test` },
      })
    ).toBeNull();

    const replay = await completeEmailChangeWithToken({ rawToken });
    expect(replay).toMatchObject({ ok: false, code: "invalid_token" });

    const hashed = hashAccountToken(rawToken);
    const stored = await prisma.accountToken.findUnique({
      where: { tokenHash: hashed },
    });
    expect(stored?.consumedAt).toBeTruthy();

    const outstandingReset = await prisma.accountToken.findMany({
      where: {
        userId: USER_A,
        type: AccountTokenType.PASSWORD_RESET,
        consumedAt: null,
        revokedAt: null,
      },
    });
    expect(outstandingReset).toHaveLength(0);
  });

  it("enforces expiry and uniqueness", async () => {
    await seed();
    process.env.AUTH_EMAIL_FROM = "River Aftercare <accounts@example.test>";
    process.env.CARE_GUIDE_ROOT_DOMAIN = "example.test";
    delete process.env.VERCEL_ENV;
    clearTransactionalEmailMemoryInbox();

    const duplicate = await updateOwnProfile({
      userId: USER_A,
      name: "User A",
      email: `${PREFIX}b@example.test`,
      currentPassword: CURRENT_PASSWORD,
    });
    expect(duplicate).toMatchObject({
      ok: false,
      error: PROFILE_EMAIL_TAKEN_MESSAGE,
    });

    const stealCurrent = await updateOwnProfile({
      userId: USER_B,
      name: "User B",
      email: `${PREFIX}a@example.test`,
      currentPassword: "other-user-pass",
    });
    expect(stealCurrent).toMatchObject({
      ok: false,
      error: PROFILE_EMAIL_TAKEN_MESSAGE,
    });

    const now = new Date("2026-09-20T12:00:00.000Z");
    await requestEmailChange({
      userId: USER_A,
      email: `${PREFIX}a-next@example.test`,
      now,
    });
    const rawToken = rawTokenFromInbox();
    const expired = await completeEmailChangeWithToken({
      rawToken,
      now: new Date("2026-09-20T12:31:00.000Z"),
    });
    expect(expired).toMatchObject({ ok: false, code: "invalid_token" });

    const user = await prisma.user.findUnique({ where: { id: USER_A } });
    expect(user?.email).toBe(`${PREFIX}a@example.test`);
  });

  it("does not send a password-reset to the pending address before confirmation", async () => {
    await seed();
    process.env.AUTH_EMAIL_FROM = "River Aftercare <accounts@example.test>";
    process.env.CARE_GUIDE_ROOT_DOMAIN = "example.test";
    delete process.env.VERCEL_ENV;
    clearTransactionalEmailMemoryInbox();

    await requestEmailChange({
      userId: USER_A,
      email: `${PREFIX}a-next@example.test`,
    });
    clearTransactionalEmailMemoryInbox();
    await requestPasswordReset({ email: `${PREFIX}a-next@example.test` });
    expect(getTransactionalEmailMemoryInbox()).toHaveLength(0);
  });
});
