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

  it("skips an incomplete Local pair and still seeds complete Local roles", () => {
    const plan = resolveLocalLoginSeed(
      {
        NODE_ENV: "development",
        LOCAL_ADMIN_EMAIL: "admin@local.aftercare.test",
        LOCAL_STAFF_EMAIL: "staff@local.aftercare.test",
        LOCAL_STAFF_PASSWORD: "LocalOnly123!",
      },
      "development"
    );

    expect(plan.status).toBe("seed");
    if (plan.status !== "seed") {
      return;
    }
    expect(plan.accounts.map((account) => account.role)).toEqual(["STAFF"]);
    expect(plan.accounts[0]?.passwordKey).toBe("LOCAL_STAFF_PASSWORD");
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
    const membershipUpsert = vi.fn(
      async (_args: {
        where: { clinicId_userId: { clinicId: string; userId: string } };
        update: { role: string; active: true };
        create: {
          clinicId: string;
          userId: string;
          role: string;
          active: true;
        };
      }) => ({})
    );
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

  it("reactivates demo clinic memberships through the shared seed upsert", () => {
    const seed = readFileSync("prisma/seed.mjs", "utf8");
    const resolver = readFileSync("lib/dev/local-login-accounts.ts", "utf8");

    expect(seed).toContain("resolveLocalLoginSeed");
    expect(seed).toContain("upsertLocalLoginAccounts");
    expect(seed).toMatch(/login\.status === "invalid"/);
    expect(seed).toMatch(/login\.status === "refused"/);
    expect(resolver).toMatch(
      /update:\s*\{\s*role: account\.role,\s*active: true\s*\}/
    );
  });
});

describe("cloud and local credential selection", () => {
  const cloudPassword = "cloud-only-secret";
  const localPassword = "local-only-secret";

  function cloudEnv(
    overrides: Record<string, string | undefined> = {}
  ): Record<string, string | undefined> {
    return {
      NODE_ENV: "development",
      CLOUD_ADMIN_EMAIL: "cloud-admin@example.test",
      CLOUD_ADMIN_PASSWORD: cloudPassword,
      CLOUD_STAFF_EMAIL: "cloud-staff@example.test",
      CLOUD_STAFF_PASSWORD: cloudPassword,
      CLOUD_OPERATOR_EMAIL: "cloud-operator@example.test",
      CLOUD_OPERATOR_PASSWORD: cloudPassword,
      LOCAL_ADMIN_EMAIL: "admin@local.aftercare.test",
      LOCAL_ADMIN_PASSWORD: localPassword,
      LOCAL_STAFF_EMAIL: "staff@local.aftercare.test",
      LOCAL_STAFF_PASSWORD: localPassword,
      LOCAL_OPERATOR_EMAIL: "operator@local.aftercare.test",
      LOCAL_OPERATOR_PASSWORD: localPassword,
      ...overrides,
    };
  }

  it("uses a complete Cloud pair for every role ahead of Local", () => {
    const plan = resolveLocalLoginSeed(cloudEnv(), "development");

    expect(plan.status).toBe("seed");
    if (plan.status !== "seed") {
      return;
    }
    expect(plan.accounts.map((account) => account.role)).toEqual([
      "ADMIN",
      "STAFF",
      "OPERATOR",
    ]);
    expect(plan.accounts.map((account) => account.emailKey)).toEqual([
      "CLOUD_ADMIN_EMAIL",
      "CLOUD_STAFF_EMAIL",
      "CLOUD_OPERATOR_EMAIL",
    ]);
    expect(
      plan.accounts.every((account) => account.password === cloudPassword)
    ).toBe(true);
    expect(
      plan.accounts.some((account) => account.password === localPassword)
    ).toBe(false);
  });

  it("falls back to Local pairs when Cloud variables are absent", () => {
    const plan = resolveLocalLoginSeed(DEV_ENV, "development");

    expect(plan.status).toBe("seed");
    if (plan.status !== "seed") {
      return;
    }
    expect(plan.accounts.map((account) => account.passwordKey)).toEqual([
      "LOCAL_ADMIN_PASSWORD",
      "LOCAL_STAFF_PASSWORD",
      "LOCAL_OPERATOR_PASSWORD",
    ]);
  });

  it("fails a partial Cloud pair instead of mixing it with Local", () => {
    const plan = resolveLocalLoginSeed(
      cloudEnv({
        CLOUD_ADMIN_PASSWORD: undefined,
        CLOUD_STAFF_EMAIL: "   ",
        CLOUD_OPERATOR_EMAIL: undefined,
        CLOUD_OPERATOR_PASSWORD: undefined,
      }),
      "development"
    );

    expect(plan.status).toBe("invalid");
    if (plan.status !== "invalid") {
      return;
    }
    expect(plan.reason).toContain("CLOUD_ADMIN_EMAIL");
    expect(plan.reason).toContain("CLOUD_ADMIN_PASSWORD");
    expect(plan.reason).toContain("CLOUD_STAFF_EMAIL");
    expect(plan.reason).toContain("Refusing to combine Cloud and Local");
    expect(plan.reason).not.toContain(cloudPassword);
    expect(plan.reason).not.toContain(localPassword);
    expect(plan.reason).not.toContain("admin@local.aftercare.test");
  });

  it("lets each complete role choose Cloud or Local independently", () => {
    const plan = resolveLocalLoginSeed(
      cloudEnv({
        CLOUD_STAFF_EMAIL: undefined,
        CLOUD_STAFF_PASSWORD: undefined,
        CLOUD_OPERATOR_EMAIL: undefined,
        CLOUD_OPERATOR_PASSWORD: undefined,
      }),
      "development"
    );

    expect(plan.status).toBe("seed");
    if (plan.status !== "seed") {
      return;
    }
    expect(
      plan.accounts.map((account) => [account.role, account.passwordKey])
    ).toEqual([
      ["ADMIN", "CLOUD_ADMIN_PASSWORD"],
      ["STAFF", "LOCAL_STAFF_PASSWORD"],
      ["OPERATOR", "LOCAL_OPERATOR_PASSWORD"],
    ]);
  });

  it("refuses Cloud credentials in production", () => {
    const plan = resolveLocalLoginSeed(
      {
        NODE_ENV: "production",
        CLOUD_ADMIN_EMAIL: "cloud-admin@example.test",
        CLOUD_ADMIN_PASSWORD: cloudPassword,
      },
      "production"
    );

    expect(plan.status).toBe("refused");
    if (plan.status !== "refused") {
      return;
    }
    expect(plan.reason).toContain("must not be set in production");
    expect(plan.reason).toContain("CLOUD_*");
    expect(plan.reason).not.toContain(cloudPassword);
  });

  it("refuses a partial Cloud pair in production before any account can be created", () => {
    const plan = resolveLocalLoginSeed(
      {
        NODE_ENV: "production",
        CLOUD_OPERATOR_PASSWORD: cloudPassword,
        LOCAL_OPERATOR_EMAIL: "operator@local.aftercare.test",
      },
      "production"
    );

    expect(plan.status).toBe("refused");
    if (plan.status !== "refused") {
      return;
    }
    expect(plan.reason).not.toContain(cloudPassword);
  });
});
