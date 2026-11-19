import "dotenv/config";

import { AccountTokenType, ClinicMembershipRole } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  generateAccountToken,
  hashAccountToken,
} from "@/lib/auth/account-token";
import { DUMMY_PASSWORD_HASH, hashPassword } from "@/lib/auth/password";
import {
  PRIVACY_ACKNOWLEDGEMENT_VERSION,
  TERMS_ACCEPTANCE_VERSION,
} from "@/lib/legal/status";
import {
  REGISTRATION_INTENT_GENERIC_MESSAGE,
  REGISTRATION_SLUG_TAKEN_MESSAGE,
} from "@/lib/auth/registration-intent";
import {
  consumeRegistrationIntent,
  createOrReplaceRegistrationIntent,
  expireRegistrationIntents,
  recoverRegistrationIntentSlug,
  validateRegistrationIntent,
} from "@/lib/auth/registration-intent-service";
import {
  lockTenantSlugs,
  RETIRED_TENANT_SLUG_MESSAGE,
} from "@/lib/clinics/retired-tenant-slug";
import { getPrisma } from "@/lib/prisma";

const prisma = getPrisma();
const PASSWORD = "registration-secret-1";

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    email: "regint-owner@example.test",
    password: PASSWORD,
    ownerName: "  River   Owner  ",
    practiceName: " River Practice ",
    slug: "regint-owner",
    serviceCategories: ["PHYSIOTHERAPY", "DENTAL", "DENTAL"],
    commercialPlan: "PRACTICE",
    billingInterval: "YEARLY",
    now: new Date("2026-11-19T00:00:00.000Z"),
    ...overrides,
  };
}

async function cleanup() {
  await prisma.clinicRegistrationIntent.deleteMany({
    where: {
      OR: [
        { email: { startsWith: "regint-" } },
        { email: { endsWith: "@mailinator.com" } },
      ],
    },
  });
  await prisma.accountToken.deleteMany({
    where: { email: { startsWith: "regint-" } },
  });
  await prisma.clinicMembership.deleteMany({
    where: { user: { email: { startsWith: "regint-" } } },
  });
  await prisma.retiredTenantSlug.deleteMany({
    where: { slug: { startsWith: "regint-" } },
  });
  await prisma.clinic.deleteMany({
    where: { slug: { startsWith: "regint-" } },
  });
  await prisma.user.deleteMany({
    where: {
      OR: [
        { email: { startsWith: "regint-" } },
        { id: { startsWith: "regint_" } },
      ],
    },
  });
}

async function localGraphCounts() {
  const whereEmail = { email: { startsWith: "regint-" } };
  const whereSlug = { slug: { startsWith: "regint-" } };
  const [users, clinics, memberships, entitlements, billingProfiles, intents] =
    await Promise.all([
      prisma.user.count({ where: whereEmail }),
      prisma.clinic.count({ where: whereSlug }),
      prisma.clinicMembership.count({ where: { user: whereEmail } }),
      prisma.clinicEntitlement.count({ where: { clinic: whereSlug } }),
      prisma.clinicBillingProfile.count({ where: { clinic: whereSlug } }),
      prisma.clinicRegistrationIntent.count({ where: whereEmail }),
    ]);
  return {
    users,
    clinics,
    memberships,
    entitlements,
    billingProfiles,
    intents,
  };
}

describe("registration intent service", () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("stores a hashed password and token, and creates no clinic graph", async () => {
    const before = await localGraphCounts();
    const created = await createOrReplaceRegistrationIntent(input());
    expect(created).toMatchObject({
      status: "accepted",
      delivery: "send",
      message: REGISTRATION_INTENT_GENERIC_MESSAGE,
    });
    if (created.status !== "accepted" || created.delivery !== "send") {
      throw new Error("expected a verification token");
    }

    const row = await prisma.clinicRegistrationIntent.findUniqueOrThrow({
      where: { id: created.intentId },
    });
    const stored = JSON.stringify(row);
    expect(stored).not.toContain(PASSWORD);
    expect(stored).not.toContain(created.rawToken);
    expect(row.passwordHash.startsWith("scrypt:")).toBe(true);
    expect(row.passwordHash).not.toBe(PASSWORD);
    expect(row.passwordHash).not.toBe(DUMMY_PASSWORD_HASH);
    expect(row.tokenHash).toBe(hashAccountToken(created.rawToken));
    expect(row.tokenHash).not.toBe(created.rawToken);
    expect(row.email).toBe("regint-owner@example.test");
    expect(row.ownerName).toBe("River Owner");
    expect(row.practiceName).toBe("River Practice");
    expect(row.serviceCategories).toEqual(["DENTAL", "PHYSIOTHERAPY"]);
    expect(row.commercialPlan).toBe("PRACTICE");
    expect(row.billingInterval).toBe("YEARLY");
    expect(row.termsVersion).toBe(TERMS_ACCEPTANCE_VERSION);
    expect(row.privacyVersionAcknowledged).toBe(
      PRIVACY_ACKNOWLEDGEMENT_VERSION
    );
    expect(row.expiresAt.toISOString()).toBe("2026-11-20T00:00:00.000Z");
    expect(row.consumedAt).toBeNull();
    expect(row.revokedAt).toBeNull();
    expect(await localGraphCounts()).toEqual({
      ...before,
      intents: before.intents + 1,
    });
  });

  it("does not hash or replace a registration repeated inside one minute", async () => {
    const first = await createOrReplaceRegistrationIntent(
      input({ email: "regint-cooldown@example.test", slug: "regint-cooldown" })
    );
    if (first.status !== "accepted" || first.delivery !== "send") {
      throw new Error("expected the first registration to send");
    }
    const stored = await prisma.clinicRegistrationIntent.findUniqueOrThrow({
      where: { id: first.intentId },
    });
    const second = await createOrReplaceRegistrationIntent(
      input({
        email: "regint-cooldown@example.test",
        slug: "regint-other",
        password: "registration-secret-2",
        now: new Date("2026-11-19T00:00:30.000Z"),
      })
    );
    expect(second).toEqual({
      status: "accepted",
      delivery: "suppress",
      message: REGISTRATION_INTENT_GENERIC_MESSAGE,
    });
    const still = await prisma.clinicRegistrationIntent.findUniqueOrThrow({
      where: { id: first.intentId },
    });
    expect(still.passwordHash).toBe(stored.passwordHash);
    expect(still.slug).toBe("regint-cooldown");
    expect(still.tokenHash).toBe(stored.tokenHash);
  });

  it("refuses a temporary inbox without creating an intent", async () => {
    const result = await createOrReplaceRegistrationIntent(
      input({
        email: "regint-temp@mailinator.com",
        slug: "regint-temp",
      })
    );
    expect(result).toMatchObject({
      status: "invalid",
      field: "email",
    });
    expect(JSON.stringify(result)).not.toMatch(/already|registered|exists/i);
    expect(
      await prisma.clinicRegistrationIntent.count({
        where: { email: "regint-temp@mailinator.com" },
      })
    ).toBe(0);
  });

  it("replaces a live token and redacts the previous password hash", async () => {
    const first = await createOrReplaceRegistrationIntent(input());
    const second = await createOrReplaceRegistrationIntent(
      input({
        slug: "regint-owner-b",
        password: "registration-secret-2",
        now: new Date("2026-11-19T01:00:00.000Z"),
      })
    );
    if (first.status !== "accepted" || first.delivery !== "send") {
      throw new Error("expected the first token");
    }
    if (second.status !== "accepted" || second.delivery !== "send") {
      throw new Error("expected the replacement token");
    }

    expect(first.message).toBe(second.message);
    expect(first.rawToken).not.toBe(second.rawToken);
    const previous = await validateRegistrationIntent({
      rawToken: first.rawToken,
      now: new Date("2026-11-19T01:00:00.000Z"),
    });
    const current = await validateRegistrationIntent({
      rawToken: second.rawToken,
      now: new Date("2026-11-19T01:00:00.000Z"),
    });
    expect(previous).toEqual({ ok: false, reason: "revoked" });
    expect(current.ok).toBe(true);

    const rows = await prisma.clinicRegistrationIntent.findMany({
      where: { email: "regint-owner@example.test" },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(
      rows.filter((row) => !row.revokedAt && !row.consumedAt)
    ).toHaveLength(1);
    expect(rows[0]?.passwordHash).toBe(DUMMY_PASSWORD_HASH);
    expect(rows[0]?.revokedAt).not.toBeNull();
    expect(JSON.stringify(rows[0])).not.toContain("registration-secret-1");
    expect(rows[1]?.passwordHash).not.toBe(DUMMY_PASSWORD_HASH);
  });

  it("returns one generic result for existing accounts, invitations, operators, and email changes", async () => {
    await prisma.user.create({
      data: {
        id: "regint_member",
        email: "regint-member@example.test",
        passwordHash: hashPassword(PASSWORD),
      },
    });
    await prisma.user.create({
      data: {
        id: "regint_operator",
        email: "regint-operator@example.test",
        platformRole: "OPERATOR",
        passwordHash: hashPassword(PASSWORD),
      },
    });
    await prisma.user.create({
      data: {
        id: "regint_invited",
        email: "regint-invited@example.test",
        passwordHash: null,
      },
    });
    await prisma.clinic.create({
      data: {
        id: "regint_invite_clinic",
        name: "Invite clinic",
        slug: "regint-invite",
      },
    });
    await prisma.accountToken.create({
      data: {
        type: AccountTokenType.INVITATION,
        tokenHash: hashAccountToken(generateAccountToken()),
        userId: "regint_invited",
        clinicId: "regint_invite_clinic",
        role: ClinicMembershipRole.ADMIN,
        email: "regint-invited@example.test",
        expiresAt: new Date("2026-11-26T00:00:00.000Z"),
      },
    });
    await prisma.user.create({
      data: {
        id: "regint_change_user",
        email: "regint-current@example.test",
        passwordHash: hashPassword(PASSWORD),
      },
    });
    await prisma.accountToken.create({
      data: {
        type: AccountTokenType.EMAIL_CHANGE,
        tokenHash: hashAccountToken(generateAccountToken()),
        userId: "regint_change_user",
        email: "regint-pending-email@example.test",
        expiresAt: new Date("2026-11-19T00:30:00.000Z"),
      },
    });

    const results = await Promise.all(
      [
        "regint-member@example.test",
        "regint-operator@example.test",
        "regint-invited@example.test",
        "regint-pending-email@example.test",
      ].map((email, index) =>
        createOrReplaceRegistrationIntent(
          input({
            email,
            slug: `regint-hidden-${index}`,
          })
        )
      )
    );

    for (const result of results) {
      expect(result).toEqual({
        status: "accepted",
        delivery: "suppress",
        message: REGISTRATION_INTENT_GENERIC_MESSAGE,
      });
      expect(result).not.toHaveProperty("rawToken");
    }
    expect(
      await prisma.clinicRegistrationIntent.count({
        where: { email: { startsWith: "regint-" } },
      })
    ).toBe(0);
  });

  it("revokes an outstanding intent when the email becomes claimed", async () => {
    const created = await createOrReplaceRegistrationIntent(input());
    if (created.status !== "accepted" || created.delivery !== "send") {
      throw new Error("expected a token");
    }
    await prisma.user.create({
      data: {
        id: "regint_late_member",
        email: "regint-owner@example.test",
        passwordHash: hashPassword(PASSWORD),
      },
    });
    const again = await createOrReplaceRegistrationIntent(
      input({ slug: "regint-owner-c" })
    );
    expect(again).toEqual({
      status: "accepted",
      delivery: "suppress",
      message: REGISTRATION_INTENT_GENERIC_MESSAGE,
    });
    const check = await validateRegistrationIntent({
      rawToken: created.rawToken,
      now: new Date("2026-11-19T00:00:00.000Z"),
    });
    expect(check).toEqual({ ok: false, reason: "revoked" });
  });

  it("rejects a retired slug and a slug already issued to a clinic", async () => {
    await prisma.retiredTenantSlug.create({
      data: { slug: "regint-retired" },
    });
    await prisma.clinic.create({
      data: {
        id: "regint_taken_clinic",
        name: "Taken",
        slug: "regint-taken",
      },
    });

    const retired = await createOrReplaceRegistrationIntent(
      input({ slug: "regint-retired", email: "regint-retired@example.test" })
    );
    const taken = await createOrReplaceRegistrationIntent(
      input({ slug: "regint-taken", email: "regint-taken@example.test" })
    );
    expect(retired).toEqual({
      status: "slug_unavailable",
      message: RETIRED_TENANT_SLUG_MESSAGE,
    });
    expect(taken).toEqual({
      status: "slug_unavailable",
      message: REGISTRATION_SLUG_TAKEN_MESSAGE,
    });
    expect(
      await prisma.clinicRegistrationIntent.count({
        where: { email: { startsWith: "regint-" } },
      })
    ).toBe(0);
  });

  it("keeps an expired unrevoked row in the live email index until it is revoked", async () => {
    const created = await createOrReplaceRegistrationIntent(input());
    if (created.status !== "accepted" || created.delivery !== "send") {
      throw new Error("expected a token");
    }
    await expect(
      prisma.clinicRegistrationIntent.create({
        data: {
          email: "regint-owner@example.test",
          ownerName: "Other Owner",
          passwordHash: hashPassword(PASSWORD),
          practiceName: "Other Practice",
          slug: "regint-other",
          serviceCategories: ["DENTAL"],
          commercialPlan: "ESSENTIAL",
          billingInterval: "MONTHLY",
          termsVersion: TERMS_ACCEPTANCE_VERSION,
          privacyVersionAcknowledged: PRIVACY_ACKNOWLEDGEMENT_VERSION,
          tokenHash: hashAccountToken(generateAccountToken()),
          expiresAt: new Date("2026-11-21T00:00:00.000Z"),
        },
      })
    ).rejects.toMatchObject({ code: "P2002" });

    const atExpiry = await validateRegistrationIntent({
      rawToken: created.rawToken,
      now: new Date("2026-11-20T00:00:00.000Z"),
    });
    expect(atExpiry).toEqual({ ok: false, reason: "expired" });

    const swept = await expireRegistrationIntents({
      now: new Date("2026-11-20T00:00:00.000Z"),
      email: "regint-owner@example.test",
    });
    expect(swept.revoked).toBe(1);
    const row = await prisma.clinicRegistrationIntent.findUniqueOrThrow({
      where: { id: created.intentId },
    });
    expect(row.revokedAt).not.toBeNull();
    expect(row.consumedAt).toBeNull();
    expect(row.passwordHash).toBe(DUMMY_PASSWORD_HASH);

    const replaced = await createOrReplaceRegistrationIntent(
      input({
        now: new Date("2026-11-20T01:00:00.000Z"),
        slug: "regint-after-expiry",
      })
    );
    expect(replaced.status).toBe("accepted");
    if (replaced.status === "accepted" && replaced.delivery === "send") {
      expect(
        await validateRegistrationIntent({
          rawToken: created.rawToken,
          now: new Date("2026-11-20T01:00:00.000Z"),
        })
      ).toEqual({ ok: false, reason: "revoked" });
      expect(
        (
          await validateRegistrationIntent({
            rawToken: replaced.rawToken,
            now: new Date("2026-11-20T01:00:00.000Z"),
          })
        ).ok
      ).toBe(true);
    }
  });

  it("consumes once, rejects a reused or malformed token, and redacts the hash", async () => {
    const created = await createOrReplaceRegistrationIntent(input());
    if (created.status !== "accepted" || created.delivery !== "send") {
      throw new Error("expected a token");
    }
    let seenHash = "";
    const consumed = await consumeRegistrationIntent({
      rawToken: created.rawToken,
      now: new Date("2026-11-19T02:00:00.000Z"),
      provision: async (_tx, intent) => {
        seenHash = intent.passwordHash;
        return "ready";
      },
    });
    expect(consumed).toEqual({
      ok: true,
      value: "ready",
      intentId: created.intentId,
    });
    expect(seenHash.startsWith("scrypt:")).toBe(true);
    expect(seenHash).not.toBe(DUMMY_PASSWORD_HASH);
    expect(seenHash).not.toBe(PASSWORD);

    const row = await prisma.clinicRegistrationIntent.findUniqueOrThrow({
      where: { id: created.intentId },
    });
    expect(row.consumedAt?.toISOString()).toBe("2026-11-19T02:00:00.000Z");
    expect(row.passwordHash).toBe(DUMMY_PASSWORD_HASH);
    expect(JSON.stringify(row)).not.toContain(PASSWORD);
    expect(JSON.stringify(row)).not.toContain(created.rawToken);

    expect(
      await consumeRegistrationIntent({
        rawToken: created.rawToken,
        now: new Date("2026-11-19T02:00:00.000Z"),
        provision: async () => "again",
      })
    ).toEqual({ ok: false, reason: "consumed" });
    expect(
      await consumeRegistrationIntent({
        rawToken: "not a token",
        provision: async () => "no",
      })
    ).toEqual({ ok: false, reason: "missing" });
    expect(
      await validateRegistrationIntent({
        rawToken: generateAccountToken(),
        now: new Date("2026-11-19T02:00:00.000Z"),
      })
    ).toEqual({ ok: false, reason: "missing" });
    expect(await localGraphCounts()).toMatchObject({
      users: 0,
      clinics: 0,
      memberships: 0,
      entitlements: 0,
      billingProfiles: 0,
    });
  });

  it("lets only one concurrent consume succeed", async () => {
    const created = await createOrReplaceRegistrationIntent(input());
    if (created.status !== "accepted" || created.delivery !== "send") {
      throw new Error("expected a token");
    }
    let provisions = 0;
    const [first, second] = await Promise.all([
      consumeRegistrationIntent({
        rawToken: created.rawToken,
        now: new Date("2026-11-19T03:00:00.000Z"),
        provision: async () => {
          provisions += 1;
          return "one";
        },
      }),
      consumeRegistrationIntent({
        rawToken: created.rawToken,
        now: new Date("2026-11-19T03:00:00.000Z"),
        provision: async () => {
          provisions += 1;
          return "two";
        },
      }),
    ]);
    const outcomes = [first, second];
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
    expect(outcomes.filter((outcome) => !outcome.ok)).toEqual([
      { ok: false, reason: "consumed" },
    ]);
    expect(provisions).toBe(1);
  });

  it("rolls back a failed provision and allows the same token to be retried", async () => {
    const created = await createOrReplaceRegistrationIntent(input());
    if (created.status !== "accepted" || created.delivery !== "send") {
      throw new Error("expected a token");
    }
    await expect(
      consumeRegistrationIntent({
        rawToken: created.rawToken,
        now: new Date("2026-11-19T04:00:00.000Z"),
        provision: async (tx) => {
          await tx.user.create({
            data: {
              id: "regint_rollback_user",
              email: "regint-rollback@example.test",
              passwordHash: hashPassword(PASSWORD),
            },
          });
          throw new Error("provision failed");
        },
      })
    ).rejects.toThrow("provision failed");

    expect(
      await prisma.user.findUnique({ where: { id: "regint_rollback_user" } })
    ).toBeNull();
    const unconsumed = await prisma.clinicRegistrationIntent.findUniqueOrThrow({
      where: { id: created.intentId },
    });
    expect(unconsumed.consumedAt).toBeNull();
    expect(unconsumed.revokedAt).toBeNull();
    expect(unconsumed.passwordHash).not.toBe(DUMMY_PASSWORD_HASH);

    const retried = await consumeRegistrationIntent({
      rawToken: created.rawToken,
      now: new Date("2026-11-19T04:05:00.000Z"),
      provision: async () => "retried",
    });
    expect(retried).toMatchObject({ ok: true, value: "retried" });
  });

  it("leaves the intent unconsumed when the slug is taken during verification, then accepts a replacement slug", async () => {
    const created = await createOrReplaceRegistrationIntent(input());
    if (created.status !== "accepted" || created.delivery !== "send") {
      throw new Error("expected a token");
    }
    await prisma.clinic.create({
      data: {
        id: "regint_race_clinic",
        name: "Race",
        slug: "regint-owner",
      },
    });
    let provisions = 0;
    const blocked = await consumeRegistrationIntent({
      rawToken: created.rawToken,
      now: new Date("2026-11-19T05:00:00.000Z"),
      provision: async () => {
        provisions += 1;
        return "should-not-run";
      },
    });
    expect(blocked).toEqual({
      ok: false,
      reason: "slug_unavailable",
      message: REGISTRATION_SLUG_TAKEN_MESSAGE,
    });
    expect(provisions).toBe(0);
    const stillLive = await prisma.clinicRegistrationIntent.findUniqueOrThrow({
      where: { id: created.intentId },
    });
    expect(stillLive.consumedAt).toBeNull();
    expect(stillLive.slug).toBe("regint-owner");

    const recovered = await recoverRegistrationIntentSlug({
      rawToken: created.rawToken,
      slug: "regint-recovered",
      now: new Date("2026-11-19T05:01:00.000Z"),
    });
    expect(recovered.ok).toBe(true);
    const consumed = await consumeRegistrationIntent({
      rawToken: created.rawToken,
      now: new Date("2026-11-19T05:02:00.000Z"),
      provision: async (_tx, intent) => intent.slug,
    });
    expect(consumed).toMatchObject({ ok: true, value: "regint-recovered" });
  });

  it("holds the tenant-slug lock through provisioning", async () => {
    const created = await createOrReplaceRegistrationIntent(
      input({ slug: "regint-locked", email: "regint-locked@example.test" })
    );
    if (created.status !== "accepted" || created.delivery !== "send") {
      throw new Error("expected a token");
    }
    const inside = deferred();
    const release = deferred();
    const consuming = consumeRegistrationIntent({
      rawToken: created.rawToken,
      now: new Date("2026-11-19T06:00:00.000Z"),
      provision: async () => {
        inside.resolve();
        await release.promise;
        return "held";
      },
    });
    await inside.promise;

    let acquired = false;
    const waiting = prisma.$transaction(async (tx) => {
      await lockTenantSlugs(tx, ["regint-locked"]);
      acquired = true;
      return "acquired" as const;
    });
    const raced = await Promise.race([
      waiting,
      new Promise<"blocked">((resolve) => {
        setTimeout(() => resolve("blocked"), 500);
      }),
    ]);
    expect(raced).toBe("blocked");
    expect(acquired).toBe(false);
    release.resolve();
    await expect(consuming).resolves.toMatchObject({ ok: true, value: "held" });
    await waiting;
    expect(acquired).toBe(true);
  });

  it("serializes replacement so only the last token stays live", async () => {
    const [first, second] = await Promise.all([
      createOrReplaceRegistrationIntent(
        input({
          slug: "regint-parallel-a",
          now: new Date("2026-11-19T07:00:00.000Z"),
        })
      ),
      createOrReplaceRegistrationIntent(
        input({
          slug: "regint-parallel-b",
          now: new Date("2026-11-19T07:00:00.000Z"),
        })
      ),
    ]);
    expect(first.status).toBe("accepted");
    expect(second.status).toBe("accepted");
    if (first.status !== "accepted" || second.status !== "accepted") {
      throw new Error("expected accepted results");
    }
    expect(first.delivery).toBe("send");
    expect(second.delivery).toBe("send");
    if (first.delivery !== "send" || second.delivery !== "send") {
      throw new Error("expected tokens");
    }

    const live = await prisma.clinicRegistrationIntent.count({
      where: {
        email: "regint-owner@example.test",
        consumedAt: null,
        revokedAt: null,
      },
    });
    expect(live).toBe(1);
    const checks = await Promise.all(
      [first.rawToken, second.rawToken].map((rawToken) =>
        validateRegistrationIntent({
          rawToken,
          now: new Date("2026-11-19T07:00:00.000Z"),
        })
      )
    );
    expect(checks.filter((check) => check.ok)).toHaveLength(1);
    expect(checks.filter((check) => !check.ok)).toEqual([
      { ok: false, reason: "revoked" },
    ]);
  });
});
