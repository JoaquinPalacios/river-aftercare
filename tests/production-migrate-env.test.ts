import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  PRODUCTION_ENV_FILE_NAME,
  assertProductionPrismaArgs,
  connectionHostIsLoopback,
  evaluateProductionMigrateEnv,
  isForbiddenProductionPrismaInvocation,
  parseEnvFileContents,
  productionEnvFileNameIsAllowed,
  productionPrismaArgs,
  redactSecrets,
  readPrismaProviderFromLockfile,
} from "@/lib/release/production-migrate.mjs";

const NEON_POOLED =
  "postgresql://app:super-secret-password@ep-example-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require";
const NEON_DIRECT =
  "postgresql://app:super-secret-password@ep-example.ap-southeast-2.aws.neon.tech/neondb?sslmode=require";
const LOCAL =
  "postgresql://postgres:postgres@localhost:5432/care_guide?schema=public";

describe("parseEnvFileContents", () => {
  it("parses quoted values and ignores comments", () => {
    expect(
      parseEnvFileContents(
        [
          "# comment",
          "DATABASE_URL='postgres://example/db'",
          'DIRECT_URL="postgres://example/direct"',
          "export AUTH_SECRET=local",
          "",
        ].join("\n")
      )
    ).toEqual({
      DATABASE_URL: "postgres://example/db",
      DIRECT_URL: "postgres://example/direct",
      AUTH_SECRET: "local",
    });
  });
});

describe("evaluateProductionMigrateEnv", () => {
  it("fails closed when the env file is absent", () => {
    const evaluation = evaluateProductionMigrateEnv({
      envFilePath: PRODUCTION_ENV_FILE_NAME,
      envFileExists: false,
      parsed: {},
      prismaProvider: "postgresql",
    });
    expect(evaluation.ok).toBe(false);
    expect(evaluation.errors.join("\n")).toMatch(/not present/);
    expect(evaluation.errors.join("\n")).not.toContain("postgresql://");
  });

  it("rejects local .env even if it exists", () => {
    const evaluation = evaluateProductionMigrateEnv({
      envFilePath: ".env",
      envFileExists: true,
      parsed: {
        DATABASE_URL: NEON_POOLED,
        DIRECT_URL: NEON_DIRECT,
      },
      prismaProvider: "postgresql",
    });
    expect(evaluation.ok).toBe(false);
    expect(evaluation.errors.join("\n")).toMatch(/\.env\.neon-production/);
    expect(productionEnvFileNameIsAllowed(".env")).toBe(false);
  });

  it("rejects loopback URLs without printing them", () => {
    const evaluation = evaluateProductionMigrateEnv({
      envFilePath: PRODUCTION_ENV_FILE_NAME,
      envFileExists: true,
      parsed: {
        DATABASE_URL: LOCAL,
        DIRECT_URL: LOCAL,
      },
      prismaProvider: "postgresql",
    });
    expect(evaluation.ok).toBe(false);
    expect(evaluation.errors.join("\n")).toMatch(/loopback/);
    expect(JSON.stringify(evaluation)).not.toContain("postgresql://");
    expect(JSON.stringify(evaluation)).not.toContain("postgres:postgres");
    expect(connectionHostIsLoopback(LOCAL)).toBe(true);
    expect(connectionHostIsLoopback(NEON_DIRECT)).toBe(false);
  });

  it("requires DIRECT_URL and DATABASE_URL from the production file", () => {
    const missingDirect = evaluateProductionMigrateEnv({
      envFilePath: PRODUCTION_ENV_FILE_NAME,
      envFileExists: true,
      parsed: { DATABASE_URL: NEON_POOLED },
      prismaProvider: "postgresql",
    });
    expect(missingDirect.ok).toBe(false);
    expect(missingDirect.errors.join("\n")).toMatch(/DIRECT_URL/);

    const ok = evaluateProductionMigrateEnv({
      envFilePath: PRODUCTION_ENV_FILE_NAME,
      envFileExists: true,
      parsed: {
        DATABASE_URL: NEON_POOLED,
        DIRECT_URL: NEON_DIRECT,
      },
      prismaProvider: "postgresql",
    });
    expect(ok.ok).toBe(true);
    expect(ok.hasDirectUrl).toBe(true);
    expect(ok.hasDatabaseUrl).toBe(true);
    expect(JSON.stringify(ok)).not.toContain("super-secret-password");
  });

  it("rejects a non-PostgreSQL provider", () => {
    const evaluation = evaluateProductionMigrateEnv({
      envFilePath: PRODUCTION_ENV_FILE_NAME,
      envFileExists: true,
      parsed: {
        DATABASE_URL: NEON_POOLED,
        DIRECT_URL: NEON_DIRECT,
      },
      prismaProvider: "sqlite",
    });
    expect(evaluation.ok).toBe(false);
    expect(evaluation.errors.join("\n")).toMatch(/postgresql/);
  });
});

describe("production Prisma args", () => {
  it("only constructs migrate status and migrate deploy", () => {
    expect(productionPrismaArgs("status")).toEqual([
      "migrate",
      "status",
      "--config",
      "prisma.config.ts",
    ]);
    expect(productionPrismaArgs("verify")).toEqual(
      productionPrismaArgs("status")
    );
    expect(productionPrismaArgs("deploy")).toEqual([
      "migrate",
      "deploy",
      "--config",
      "prisma.config.ts",
    ]);
    expect(() =>
      assertProductionPrismaArgs(productionPrismaArgs("status"))
    ).not.toThrow();
    expect(() =>
      assertProductionPrismaArgs(productionPrismaArgs("deploy"))
    ).not.toThrow();
  });

  it("never allows seed, db push, reset, or migrate dev", () => {
    expect(isForbiddenProductionPrismaInvocation(["db", "seed"])).toBe(true);
    expect(isForbiddenProductionPrismaInvocation(["db", "push"])).toBe(true);
    expect(isForbiddenProductionPrismaInvocation(["migrate", "reset"])).toBe(
      true
    );
    expect(isForbiddenProductionPrismaInvocation(["migrate", "dev"])).toBe(
      true
    );
    expect(() =>
      assertProductionPrismaArgs([
        "migrate",
        "dev",
        "--config",
        "prisma.config.ts",
      ])
    ).toThrow(/refuses/);
    expect(() => assertProductionPrismaArgs(["db", "push"])).toThrow(/refuses/);
  });
});

describe("redactSecrets", () => {
  it("strips connection strings and assignment values", () => {
    expect(
      redactSecrets(`url ${NEON_DIRECT} DATABASE_URL=${NEON_POOLED}`)
    ).not.toContain("super-secret-password");
    expect(redactSecrets(NEON_DIRECT)).toBe("[redacted-database-url]");
  });
});

describe("readPrismaProviderFromLockfile", () => {
  it("reads the committed PostgreSQL lockfile", () => {
    expect(
      readPrismaProviderFromLockfile(
        readFileSync("prisma/migrations/migration_lock.toml", "utf8")
      )
    ).toBe("postgresql");
  });
});

describe("prod-db CLI", () => {
  it("fails if .env.neon-production is absent and does not leak secrets", () => {
    const cwd = mkdtempSync(join(tmpdir(), "prod-db-missing-"));
    writeFileSync(
      join(cwd, ".env"),
      `DATABASE_URL="${LOCAL}"\nDIRECT_URL="${NEON_DIRECT}"\n`
    );
    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), "scripts/prod-db.mjs"), "status"],
      {
        cwd,
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: LOCAL,
          DIRECT_URL: NEON_DIRECT,
        },
      }
    );
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).toMatch(/not present/);
    expect(output).not.toContain("super-secret-password");
    expect(output).not.toContain("postgresql://");
    expect(output).not.toContain("postgres:postgres");
  });

  it("does not apply migrations without --apply", () => {
    const cwd = mkdtempSync(join(tmpdir(), "prod-db-dry-"));
    writeFileSync(
      join(cwd, PRODUCTION_ENV_FILE_NAME),
      `DATABASE_URL="${NEON_POOLED}"\nDIRECT_URL="${NEON_DIRECT}"\n`
    );
    mkdirSyncPrismaLock(cwd);
    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), "scripts/prod-db.mjs"), "migrate"],
      { cwd, encoding: "utf8", env: { ...process.env } }
    );
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(0);
    expect(output).toContain("Re-run with --apply");
    expect(output).toContain("Would run: pnpm exec prisma migrate deploy");
    expect(output).toContain("does not run seed, db push");
    expect(output).not.toContain("super-secret-password");
    expect(output).not.toContain("postgresql://");
  });

  it("source never invokes seed or db push", () => {
    const source = readFileSync("scripts/prod-db.mjs", "utf8");
    expect(source).toContain('spawnSync("pnpm", ["exec", "prisma", ...args]');
    expect(source).toContain("assertProductionPrismaArgs(args)");
    expect(source).toContain("productionPrismaArgs(prismaAction)");
    expect(source).not.toMatch(/productionPrismaArgs\([^)]*seed/);
    expect(source).not.toMatch(/\["db", "push"\]/);
    expect(source).not.toMatch(/\["db", "seed"\]/);
    expect(source).not.toMatch(/\["migrate", "reset"\]/);
    expect(source).not.toMatch(/\["migrate", "dev"\]/);
  });
});

function mkdirSyncPrismaLock(cwd: string) {
  mkdirSync(join(cwd, "prisma/migrations"), { recursive: true });
  writeFileSync(
    join(cwd, "prisma/migrations/migration_lock.toml"),
    'provider = "postgresql"\n'
  );
}
