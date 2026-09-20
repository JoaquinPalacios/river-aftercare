import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  resolveLocalLoginSeed,
  upsertLocalLoginAccounts,
} from "@/lib/dev/local-login-accounts";

const DEV_ENV = {
  NODE_ENV: "development",
  LOCAL_ADMIN_EMAIL: "admin@local.aftercare.test",
  LOCAL_ADMIN_PASSWORD: "LocalOnly123!",
  LOCAL_STAFF_EMAIL: "staff@local.aftercare.test",
  LOCAL_STAFF_PASSWORD: "LocalOnly123!",
  LOCAL_OPERATOR_EMAIL: "operator@local.aftercare.test",
  LOCAL_OPERATOR_PASSWORD: "LocalOnly123!",
};

describe("local login seed plan", () => {
  it("upserts ADMIN and STAFF accounts from env in development", () => {
    const plan = resolveLocalLoginSeed(DEV_ENV, "development");

    expect(plan.status).toBe("seed");
    if (plan.status !== "seed") {
      return;
    }
    expect(plan.accounts.map((account) => account.role)).toEqual([
      "ADMIN",
      "STAFF",
      "OPERATOR",
    ]);
    expect(plan.accounts.map((account) => account.email)).toEqual([
      "admin@local.aftercare.test",
      "staff@local.aftercare.test",
      "operator@local.aftercare.test",
    ]);
  });

  it("skips seeding in production when LOCAL vars are absent", () => {
    expect(
      resolveLocalLoginSeed({ NODE_ENV: "production" }, "production")
    ).toEqual({
      status: "skipped",
      reason: "production",
    });
  });

  it("refuses to seed when LOCAL vars are set in production", () => {
    const plan = resolveLocalLoginSeed(DEV_ENV, "production");

    expect(plan.status).toBe("refused");
    if (plan.status !== "refused") {
      return;
    }
    expect(plan.reason).toContain("must not be set in production");
  });

  it("skips when development env pairs are missing", () => {
    expect(
      resolveLocalLoginSeed({ NODE_ENV: "development" }, "development")
    ).toEqual({
      status: "skipped",
      reason: "missing",
    });
  });
});

describe("local login accounts", () => {
  it("hashes passwords so the normal verifier accepts the right secret only", () => {
    const hash = hashPassword("LocalOnly123!");

    expect(verifyPassword("LocalOnly123!", hash)).toBe(true);
    expect(verifyPassword("wrong-password", hash)).toBe(false);
    expect(hash).not.toContain("LocalOnly123!");
  });

  it("upserts by stable id so repeated seeds do not create duplicates", async () => {
    const userUpsert = vi.fn(async ({ create }) => ({
      id: create.id,
      email: create.email,
    }));
    const membershipUpsert = vi.fn(async () => ({}));
    const plan = resolveLocalLoginSeed(DEV_ENV, "development");
    expect(plan.status).toBe("seed");
    if (plan.status !== "seed") {
      return;
    }

    const first = await upsertLocalLoginAccounts({
      prisma: {
        user: { upsert: userUpsert },
        clinicMembership: { upsert: membershipUpsert },
      },
      clinicId: "clinic_demo_rivers",
      accounts: plan.accounts,
      hashPassword,
    });
    const second = await upsertLocalLoginAccounts({
      prisma: {
        user: { upsert: userUpsert },
        clinicMembership: { upsert: membershipUpsert },
      },
      clinicId: "clinic_demo_rivers",
      accounts: plan.accounts,
      hashPassword,
    });

    expect(first.map((account) => account.id)).toEqual([
      "user_demo_admin",
      "user_demo_staff",
      "user_demo_operator",
    ]);
    expect(second.map((account) => account.id)).toEqual(
      first.map((account) => account.id)
    );
    expect(userUpsert).toHaveBeenCalledTimes(6);
    expect(membershipUpsert).toHaveBeenCalledTimes(4);
    expect(userUpsert.mock.calls[0]?.[0].where).toEqual({
      id: "user_demo_admin",
    });
    expect(membershipUpsert.mock.calls[0]?.[0].update).toEqual({
      role: "ADMIN",
      active: true,
    });
    expect(membershipUpsert.mock.calls[0]?.[0].create).toMatchObject({
      role: "ADMIN",
      active: true,
    });
  });

  it("reactivates demo clinic memberships in prisma/seed.mjs", () => {
    const seed = readFileSync("prisma/seed.mjs", "utf8");
    expect(seed).toMatch(
      /update:\s*\{[\s\S]*role: account\.role,\s*active: true/
    );
  });
});
