import "dotenv/config";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { hashAccountToken } from "@/lib/auth/account-token";
import { readAccountTokenFromHash } from "@/lib/auth/account-token-format";
import { hashPassword } from "@/lib/auth/password";
import { REGISTRATION_INTENT_GENERIC_MESSAGE } from "@/lib/auth/registration-copy";
import {
  requestRegistrationReplacement,
  requestRegistrationVerification,
} from "@/lib/auth/request-registration";
import { validateRegistrationIntent } from "@/lib/auth/registration-intent-service";
import {
  clearTransactionalEmailMemoryInbox,
  getTransactionalEmailMemoryInbox,
} from "@/lib/email/transactional-mailer";
import { getPrisma } from "@/lib/prisma";

const prisma = getPrisma();
const PASSWORD = "registration-secret-1";
const EMAIL = "regreq-owner@example.test";

function input(overrides: Record<string, unknown> = {}) {
  return {
    email: EMAIL,
    password: PASSWORD,
    ownerName: "River Owner",
    practiceName: "River Practice",
    slug: "regreq-owner",
    serviceCategories: ["DENTAL"],
    commercialPlan: "ESSENTIAL",
    billingInterval: "MONTHLY",
    now: new Date("2026-11-19T00:00:00.000Z"),
    ...overrides,
  };
}

function tokenFromInbox(): string {
  const message = getTransactionalEmailMemoryInbox().at(-1);
  expect(message?.text).toBeTruthy();
  const line = message?.text
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item.includes("#token="));
  const token = readAccountTokenFromHash(line?.slice(line.indexOf("#")) ?? "");
  expect(token).toBeTruthy();
  return token ?? "";
}

async function cleanup() {
  await prisma.clinicRegistrationIntent.deleteMany({
    where: { email: { startsWith: "regreq-" } },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: "regreq-" } },
  });
}

describe("registration verification mail", () => {
  beforeEach(async () => {
    await cleanup();
    clearTransactionalEmailMemoryInbox();
    process.env.AUTH_EMAIL_FROM ??= "River Aftercare <accounts@example.test>";
  });

  afterAll(async () => {
    await cleanup();
    clearTransactionalEmailMemoryInbox();
    await prisma.$disconnect();
  });

  it("emails a link, hides the token from the result, and does not consume the intent", async () => {
    const result = await requestRegistrationVerification(input());
    expect(result).toEqual({
      status: "accepted",
      message: REGISTRATION_INTENT_GENERIC_MESSAGE,
    });
    expect(result).not.toHaveProperty("rawToken");

    const token = tokenFromInbox();
    const message = getTransactionalEmailMemoryInbox().at(-1);
    expect(message?.to).toBe(EMAIL);
    expect(message?.text).toContain("River Practice");
    expect(message?.text).not.toContain(PASSWORD);
    expect(message?.html).not.toContain(PASSWORD);

    const row = await prisma.clinicRegistrationIntent.findFirstOrThrow({
      where: { email: EMAIL, revokedAt: null },
    });
    expect(row.tokenHash).toBe(hashAccountToken(token));
    expect(row.passwordHash).not.toContain(PASSWORD);
    expect(row.consumedAt).toBeNull();

    const valid = await validateRegistrationIntent({
      rawToken: token,
      now: new Date("2026-11-19T01:00:00.000Z"),
    });
    expect(valid.ok).toBe(true);
    const stillThere = await prisma.clinicRegistrationIntent.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(stillThere.consumedAt).toBeNull();
  });

  it("uses the same public result when the email already belongs to an account", async () => {
    await prisma.user.create({
      data: {
        id: "regreq_member",
        email: "regreq-member@example.test",
        passwordHash: hashPassword(PASSWORD),
      },
    });
    const result = await requestRegistrationVerification(
      input({
        email: "regreq-member@example.test",
        slug: "regreq-member",
      })
    );
    expect(result).toEqual({
      status: "accepted",
      message: REGISTRATION_INTENT_GENERIC_MESSAGE,
    });
    expect(
      getTransactionalEmailMemoryInbox().some(
        (message) => message.to === "regreq-member@example.test"
      )
    ).toBe(false);
    expect(
      await prisma.clinicRegistrationIntent.count({
        where: { email: "regreq-member@example.test" },
      })
    ).toBe(0);
  });

  it("keeps an expired intent unconsumed and replaces the link after the cooldown", async () => {
    const createdAt = new Date("2026-11-19T00:00:00.000Z");
    await requestRegistrationVerification(input({ now: createdAt }));
    const first = tokenFromInbox();

    const cooled = await requestRegistrationReplacement({
      email: EMAIL,
      now: new Date("2026-11-19T00:05:00.000Z"),
    });
    expect(cooled).toEqual({
      status: "accepted",
      message: REGISTRATION_INTENT_GENERIC_MESSAGE,
    });
    expect(getTransactionalEmailMemoryInbox()).toHaveLength(1);

    await prisma.clinicRegistrationIntent.updateMany({
      where: { email: EMAIL },
      data: { expiresAt: createdAt },
    });
    const expired = await validateRegistrationIntent({
      rawToken: first,
      now: new Date("2026-11-19T12:00:00.000Z"),
    });
    expect(expired).toEqual({ ok: false, reason: "expired" });

    clearTransactionalEmailMemoryInbox();
    const replaced = await requestRegistrationReplacement({
      email: `  ${EMAIL.toUpperCase()}  `,
      now: new Date("2026-11-19T12:00:00.000Z"),
    });
    expect(replaced.status).toBe("accepted");
    const second = tokenFromInbox();
    expect(second).not.toBe(first);
    expect(
      await validateRegistrationIntent({
        rawToken: first,
        now: new Date("2026-11-20T00:00:00.000Z"),
      })
    ).toEqual({ ok: false, reason: "missing" });
    expect(
      (
        await validateRegistrationIntent({
          rawToken: second,
          now: new Date("2026-11-20T00:00:00.000Z"),
        })
      ).ok
    ).toBe(true);
    const row = await prisma.clinicRegistrationIntent.findFirstOrThrow({
      where: { email: EMAIL, revokedAt: null, consumedAt: null },
    });
    expect(row.consumedAt).toBeNull();
    expect(row.passwordHash.startsWith("scrypt:")).toBe(true);
  });
});
