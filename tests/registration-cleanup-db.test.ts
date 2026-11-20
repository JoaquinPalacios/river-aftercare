import "dotenv/config";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  generateAccountToken,
  hashAccountToken,
} from "@/lib/auth/account-token";
import { DUMMY_PASSWORD_HASH, hashPassword } from "@/lib/auth/password";
import { runRegistrationIntentCleanup } from "@/lib/auth/registration-cleanup";
import {
  PRIVACY_ACKNOWLEDGEMENT_VERSION,
  TERMS_ACCEPTANCE_VERSION,
} from "@/lib/legal/status";
import { getPrisma } from "@/lib/prisma";

const prisma = getPrisma();
const PREFIX = "schedclean-";
const PASSWORD = "schedclean-secret-1";
const EMPTY_NOW = new Date("1990-01-01T00:00:00.000Z");
const SWEEP_NOW = new Date("2000-01-02T00:00:00.000Z");
const EXPIRED_AT = new Date("2000-01-01T00:00:00.000Z");
const FUTURE_AT = new Date("2099-01-01T00:00:00.000Z");

function assertIsolatedLocalDatabase(): void {
  const raw = process.env.DATABASE_URL ?? "";
  let hostname = "";
  try {
    hostname = new URL(raw).hostname;
  } catch {
    throw new Error("DATABASE_URL must be a local Postgres URL.");
  }
  const local =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (
    !local ||
    raw.toLowerCase().includes("neon.tech") ||
    process.env.VERCEL_ENV === "production"
  ) {
    throw new Error(
      "Refusing registration cleanup database tests on a non-local database."
    );
  }
}

async function removeFixtures(): Promise<void> {
  await prisma.clinicRegistrationIntent.deleteMany({
    where: { email: { startsWith: PREFIX } },
  });
}

async function insertFixture(input: {
  email: string;
  slug: string;
  expiresAt: Date;
  consumedAt?: Date;
}): Promise<{ id: string; passwordHash: string }> {
  const passwordHash = hashPassword(PASSWORD);
  const row = await prisma.clinicRegistrationIntent.create({
    data: {
      email: input.email,
      ownerName: "Schedule Owner",
      passwordHash,
      practiceName: "Schedule Practice",
      slug: input.slug,
      serviceCategories: ["DENTAL"],
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
      termsVersion: TERMS_ACCEPTANCE_VERSION,
      privacyVersionAcknowledged: PRIVACY_ACKNOWLEDGEMENT_VERSION,
      tokenHash: hashAccountToken(generateAccountToken()),
      expiresAt: input.expiresAt,
      consumedAt: input.consumedAt,
    },
    select: { id: true, passwordHash: true },
  });
  return row;
}

describe("registration intent cleanup against isolated rows", () => {
  beforeEach(async () => {
    assertIsolatedLocalDatabase();
    await removeFixtures();
    const foreign = await prisma.clinicRegistrationIntent.count({
      where: {
        consumedAt: null,
        revokedAt: null,
        expiresAt: { lte: SWEEP_NOW },
        email: { not: { startsWith: PREFIX } },
      },
    });
    expect(foreign).toBe(0);
  });

  afterEach(async () => {
    await removeFixtures();
  });

  it("redacts only an expired unused row, leaves the others, and is safe to repeat", async () => {
    const expired = await insertFixture({
      email: `${PREFIX}expired@example.test`,
      slug: `${PREFIX}expired`,
      expiresAt: EXPIRED_AT,
    });
    const future = await insertFixture({
      email: `${PREFIX}future@example.test`,
      slug: `${PREFIX}future`,
      expiresAt: FUTURE_AT,
    });
    const consumed = await insertFixture({
      email: `${PREFIX}consumed@example.test`,
      slug: `${PREFIX}consumed`,
      expiresAt: EXPIRED_AT,
      consumedAt: EXPIRED_AT,
    });

    await expect(runRegistrationIntentCleanup(EMPTY_NOW)).resolves.toEqual({
      revoked: 0,
      backlog: false,
    });
    const before = await prisma.clinicRegistrationIntent.findUniqueOrThrow({
      where: { id: expired.id },
    });
    expect(before.revokedAt).toBeNull();
    expect(before.passwordHash).toBe(expired.passwordHash);

    const findMany = vi
      .spyOn(prisma.clinicRegistrationIntent, "findMany")
      .mockRejectedValueOnce(new Error("db down"));
    await expect(runRegistrationIntentCleanup(SWEEP_NOW)).rejects.toThrow(
      "db down"
    );
    findMany.mockRestore();
    const afterFailure =
      await prisma.clinicRegistrationIntent.findUniqueOrThrow({
        where: { id: expired.id },
      });
    expect(afterFailure.revokedAt).toBeNull();
    expect(afterFailure.passwordHash).toBe(expired.passwordHash);

    await expect(runRegistrationIntentCleanup(SWEEP_NOW)).resolves.toEqual({
      revoked: 1,
      backlog: false,
    });
    const redacted = await prisma.clinicRegistrationIntent.findUniqueOrThrow({
      where: { id: expired.id },
    });
    expect(redacted.revokedAt).not.toBeNull();
    expect(redacted.consumedAt).toBeNull();
    expect(redacted.passwordHash).toBe(DUMMY_PASSWORD_HASH);
    expect(redacted.passwordHash).not.toBe(PASSWORD);

    const untouchedFuture =
      await prisma.clinicRegistrationIntent.findUniqueOrThrow({
        where: { id: future.id },
      });
    const untouchedConsumed =
      await prisma.clinicRegistrationIntent.findUniqueOrThrow({
        where: { id: consumed.id },
      });
    expect(untouchedFuture.revokedAt).toBeNull();
    expect(untouchedFuture.passwordHash).not.toBe(DUMMY_PASSWORD_HASH);
    expect(untouchedConsumed.consumedAt).toEqual(EXPIRED_AT);
    expect(untouchedConsumed.revokedAt).toBeNull();
    expect(untouchedConsumed.passwordHash).not.toBe(DUMMY_PASSWORD_HASH);

    const revokedAt = redacted.revokedAt;
    await expect(runRegistrationIntentCleanup(SWEEP_NOW)).resolves.toEqual({
      revoked: 0,
      backlog: false,
    });
    const repeated = await prisma.clinicRegistrationIntent.findUniqueOrThrow({
      where: { id: expired.id },
    });
    expect(repeated.revokedAt).toEqual(revokedAt);
    expect(repeated.passwordHash).toBe(DUMMY_PASSWORD_HASH);
  });
});
