import "dotenv/config";

import { PlatformRole } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import { changeAuthenticatedUserPassword } from "@/lib/auth/change-password";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getPrisma } from "@/lib/prisma";

const prisma = getPrisma();
const PREFIX = "test_chgpass_";
const USER_A = `${PREFIX}user_a`;
const USER_B = `${PREFIX}user_b`;

async function cleanup() {
  await prisma.session.deleteMany({
    where: { userId: { in: [USER_A, USER_B] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [USER_A, USER_B] } },
  });
}

describe("changeAuthenticatedUserPassword database flow", () => {
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("updates the hash, replaces the current session, and leaves other users alone", async () => {
    await cleanup();
    const currentPassword = "current-pass";
    const nextPassword = "abcdefghijkl";
    await prisma.user.createMany({
      data: [
        {
          id: USER_A,
          email: `${PREFIX}a@example.test`,
          passwordHash: hashPassword(currentPassword),
          platformRole: PlatformRole.OPERATOR,
        },
        {
          id: USER_B,
          email: `${PREFIX}b@example.test`,
          passwordHash: hashPassword("other-user-pass"),
        },
      ],
    });
    await prisma.session.createMany({
      data: [
        {
          sessionToken: `${PREFIX}a_one`,
          userId: USER_A,
          expires: new Date("2026-10-19T12:00:00.000Z"),
        },
        {
          sessionToken: `${PREFIX}a_two`,
          userId: USER_A,
          expires: new Date("2026-10-19T12:00:00.000Z"),
        },
        {
          sessionToken: `${PREFIX}b_one`,
          userId: USER_B,
          expires: new Date("2026-10-19T12:00:00.000Z"),
        },
      ],
    });

    const result = await changeAuthenticatedUserPassword({
      userId: USER_A,
      currentPassword,
      newPassword: nextPassword,
      confirmPassword: nextPassword,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const userA = await prisma.user.findUnique({ where: { id: USER_A } });
    expect(userA?.passwordHash).toBeTruthy();
    expect(verifyPassword(currentPassword, userA?.passwordHash)).toBe(false);
    expect(verifyPassword(nextPassword, userA?.passwordHash)).toBe(true);

    const sessionsA = await prisma.session.findMany({
      where: { userId: USER_A },
    });
    expect(sessionsA).toHaveLength(1);
    expect(sessionsA[0]?.sessionToken).toBe(result.session.sessionToken);
    expect(sessionsA[0]?.sessionToken).not.toBe(`${PREFIX}a_one`);
    expect(sessionsA[0]?.sessionToken).not.toBe(`${PREFIX}a_two`);

    expect(
      await prisma.session.findMany({ where: { userId: USER_B } })
    ).toHaveLength(1);
  });
});
