import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  DESTRUCTIVE_SQL_REVIEW_COMMENT,
  evaluatePrismaReleaseChange,
  findDestructiveSql,
  formatPrismaReleaseReport,
  hasDestructiveSqlReviewMarker,
  mergeFileChanges,
  parseGitNameStatus,
  prismaReleaseExitCode,
} from "@/lib/release/prisma-migration-gate.mjs";

const ADDITIVE_SQL = `ALTER TABLE "ClinicProfile" ADD COLUMN "typeface" "ClinicTypeface";\n`;
const DESTRUCTIVE_SQL = `ALTER TABLE "ClinicProfile" DROP COLUMN "typeface";\n`;

function files(
  contents: Record<string, string>
): (filePath: string) => string | null {
  return (filePath) => contents[filePath] ?? null;
}

describe("parseGitNameStatus", () => {
  it("parses added, modified, deleted, and renamed paths", () => {
    expect(
      parseGitNameStatus(
        [
          "A\tprisma/schema.prisma",
          "M\tapp/page.tsx",
          "D\told.ts",
          "R100\tprisma/migrations/old/migration.sql\tprisma/migrations/new/migration.sql",
        ].join("\n")
      )
    ).toEqual([
      { path: "prisma/schema.prisma", status: "added" },
      { path: "app/page.tsx", status: "modified" },
      { path: "old.ts", status: "deleted" },
      {
        path: "prisma/migrations/old/migration.sql",
        status: "deleted",
      },
      {
        path: "prisma/migrations/new/migration.sql",
        status: "added",
      },
    ]);
  });
});

describe("evaluatePrismaReleaseChange", () => {
  it("treats unrelated application changes as a normal release", () => {
    const evaluation = evaluatePrismaReleaseChange({
      changes: [
        { path: "app/(marketing)/%5Fmarketing/page.tsx", status: "modified" },
        { path: "README.md", status: "modified" },
      ],
    });
    expect(evaluation.kind).toBe("app-only");
    expect(evaluation.prismaChanged).toBe(false);
    expect(evaluation.releaseWarning).toBe(false);
    expect(prismaReleaseExitCode(evaluation)).toBe(0);
    expect(formatPrismaReleaseReport(evaluation)).toBe(
      "No Prisma schema/migration changes."
    );
  });

  it("treats an empty change list as no Prisma change", () => {
    const evaluation = evaluatePrismaReleaseChange({ changes: [] });
    expect(evaluation.kind).toBe("none");
    expect(evaluation.prismaChanged).toBe(false);
    expect(prismaReleaseExitCode(evaluation)).toBe(0);
  });

  it("warns on schema + new additive migration without failing", () => {
    const evaluation = evaluatePrismaReleaseChange({
      changes: [
        { path: "prisma/schema.prisma", status: "modified" },
        {
          path: "prisma/migrations/20260919140000_add_clinic_typeface/migration.sql",
          status: "added",
        },
      ],
      readFile: files({
        "prisma/migrations/20260919140000_add_clinic_typeface/migration.sql":
          ADDITIVE_SQL,
      }),
    });
    expect(evaluation.kind).toBe("schema-and-migrations");
    expect(evaluation.releaseWarning).toBe(true);
    expect(evaluation.addedMigrationDirectories).toEqual([
      "20260919140000_add_clinic_typeface",
    ]);
    expect(evaluation.errors).toEqual([]);
    expect(prismaReleaseExitCode(evaluation)).toBe(0);
    expect(formatPrismaReleaseReport(evaluation)).toContain(
      "PRISMA RELEASE GATE"
    );
    expect(formatPrismaReleaseReport(evaluation)).toContain(
      "migrate-before-promote"
    );
  });

  it("fails when the schema changes without a new migration", () => {
    const evaluation = evaluatePrismaReleaseChange({
      changes: [{ path: "prisma/schema.prisma", status: "modified" }],
    });
    expect(evaluation.kind).toBe("schema-only");
    expect(evaluation.errors.map((item) => item.code)).toContain(
      "schema-without-migration"
    );
    expect(prismaReleaseExitCode(evaluation)).toBe(1);
  });

  it("accepts a data migration without a schema change", () => {
    const evaluation = evaluatePrismaReleaseChange({
      changes: [
        {
          path: "prisma/migrations/20260920120000_backfill_typeface/migration.sql",
          status: "added",
        },
      ],
      readFile: files({
        "prisma/migrations/20260920120000_backfill_typeface/migration.sql": `UPDATE "ClinicProfile" SET "typeface" = 'INTER' WHERE "typeface" IS NULL;\n`,
      }),
    });
    expect(evaluation.kind).toBe("migrations-only");
    expect(evaluation.errors).toEqual([]);
    expect(evaluation.releaseWarning).toBe(true);
    expect(prismaReleaseExitCode(evaluation)).toBe(0);
  });

  it("fails when a new migration directory has no SQL", () => {
    const evaluation = evaluatePrismaReleaseChange({
      changes: [
        { path: "prisma/schema.prisma", status: "modified" },
        {
          path: "prisma/migrations/20260920120000_empty/migration.sql",
          status: "added",
        },
      ],
      readFile: files({
        "prisma/migrations/20260920120000_empty/migration.sql": "   \n",
      }),
    });
    expect(evaluation.errors.map((item) => item.code)).toContain(
      "missing-migration-sql"
    );
    expect(prismaReleaseExitCode(evaluation)).toBe(1);
  });

  it("fails when an existing migration is rewritten", () => {
    const evaluation = evaluatePrismaReleaseChange({
      changes: [
        {
          path: "prisma/migrations/20260416052639_init_core_schema/migration.sql",
          status: "modified",
        },
      ],
    });
    expect(evaluation.errors.map((item) => item.code)).toContain(
      "existing-migration-rewritten"
    );
    expect(prismaReleaseExitCode(evaluation)).toBe(1);
  });

  it("blocks destructive SQL without an explicit review marker", () => {
    const evaluation = evaluatePrismaReleaseChange({
      changes: [
        { path: "prisma/schema.prisma", status: "modified" },
        {
          path: "prisma/migrations/20260920130000_drop_typeface/migration.sql",
          status: "added",
        },
      ],
      readFile: files({
        "prisma/migrations/20260920130000_drop_typeface/migration.sql":
          DESTRUCTIVE_SQL,
      }),
    });
    expect(evaluation.errors.map((item) => item.code)).toContain(
      "destructive-sql-unreviewed"
    );
    expect(hasDestructiveSqlReviewMarker(DESTRUCTIVE_SQL)).toBe(false);
    expect(prismaReleaseExitCode(evaluation)).toBe(1);
  });

  it("still warns when destructive SQL has a review marker", () => {
    const sql = `${DESTRUCTIVE_SQL_REVIEW_COMMENT}\n${DESTRUCTIVE_SQL}`;
    const evaluation = evaluatePrismaReleaseChange({
      changes: [
        { path: "prisma/schema.prisma", status: "modified" },
        {
          path: "prisma/migrations/20260920130000_drop_typeface/migration.sql",
          status: "added",
        },
      ],
      readFile: files({
        "prisma/migrations/20260920130000_drop_typeface/migration.sql": sql,
      }),
    });
    expect(evaluation.errors).toEqual([]);
    expect(evaluation.warnings.map((item) => item.code)).toContain(
      "destructive-sql-reviewed"
    );
    expect(prismaReleaseExitCode(evaluation)).toBe(0);
    expect(formatPrismaReleaseReport(evaluation)).toContain("expand/contract");
  });
});

describe("findDestructiveSql", () => {
  it("detects DROP TABLE, DROP COLUMN, TRUNCATE, and DELETE FROM", () => {
    expect(
      findDestructiveSql("DROP TABLE leftover;").map((hit) => hit.kind)
    ).toContain("DROP TABLE");
    expect(
      findDestructiveSql('ALTER TABLE "X" DROP COLUMN "y";').map(
        (hit) => hit.kind
      )
    ).toEqual(expect.arrayContaining(["DROP COLUMN", "ALTER DROP"]));
    expect(
      findDestructiveSql('TRUNCATE "Session";').map((hit) => hit.kind)
    ).toContain("TRUNCATE");
    expect(
      findDestructiveSql('DELETE FROM "ClinicProfile" WHERE id = 1;').map(
        (hit) => hit.kind
      )
    ).toContain("DELETE FROM");
  });

  it("does not treat ON DELETE CASCADE as DELETE FROM", () => {
    expect(
      findDestructiveSql(
        'CREATE TABLE "Account" ("id" TEXT PRIMARY KEY, FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE);'
      )
    ).toEqual([]);
  });
});

describe("mergeFileChanges", () => {
  it("unions committed and working-tree paths", () => {
    expect(
      mergeFileChanges([
        [{ path: "app/page.tsx", status: "modified" }],
        [{ path: "prisma/schema.prisma", status: "modified" }],
      ])
    ).toEqual([
      { path: "app/page.tsx", status: "modified" },
      { path: "prisma/schema.prisma", status: "modified" },
    ]);
  });
});

describe("release-check CLI", () => {
  it("exits 0 on this branch when Prisma files are unchanged versus origin/main", () => {
    const result = spawnSync(process.execPath, ["scripts/release-check.mjs"], {
      encoding: "utf8",
      cwd: process.cwd(),
      env: { ...process.env, RELEASE_CHECK_BASE: "origin/main" },
    });
    expect(result.stderr, result.stderr).toBe("");
    expect(result.stdout).toContain("No Prisma schema/migration changes.");
    expect(result.status).toBe(0);
  });

  it("does not connect to a database or load production env files", () => {
    const source = readFileSync("scripts/release-check.mjs", "utf8");
    const cli = spawnSync(
      process.execPath,
      ["scripts/release-check.mjs", "--help"],
      {
        encoding: "utf8",
      }
    );
    expect(cli.stdout).toContain("does not connect to any database");
    expect(source).not.toContain(".env.neon-production");
    expect(source).not.toContain('spawnSync("pnpm"');
    expect(source).not.toContain("prisma migrate");
  });
});

describe("temporary git workspace", () => {
  it("fails schema-without-migration through the CLI", () => {
    const root = mkdtempSync(join(tmpdir(), "prisma-release-gate-"));
    const gitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.test",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.test",
    };
    spawnSync("git", ["init", "-b", "main"], { cwd: root, encoding: "utf8" });
    spawnSync("git", ["config", "user.email", "test@example.test"], {
      cwd: root,
    });
    spawnSync("git", ["config", "user.name", "Test"], { cwd: root });
    mkdirSync(join(root, "prisma", "migrations"), { recursive: true });
    writeFileSync(join(root, "prisma/schema.prisma"), "datasource db {}\n");
    writeFileSync(join(root, "README.md"), "ok\n");
    spawnSync("git", ["add", "."], { cwd: root, env: gitEnv });
    spawnSync("git", ["commit", "-m", "base", "--no-verify"], {
      cwd: root,
      env: gitEnv,
    });

    writeFileSync(
      join(root, "prisma/schema.prisma"),
      "datasource db {}\nmodel X { id String @id }\n"
    );
    spawnSync("git", ["add", "."], { cwd: root, env: gitEnv });
    spawnSync("git", ["commit", "-m", "schema only", "--no-verify"], {
      cwd: root,
      env: gitEnv,
    });

    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), "scripts/release-check.mjs"), "--base", "main~1"],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, RELEASE_CHECK_BASE: "" },
      }
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("schema-without-migration");
    expect(`${result.stdout}\n${result.stderr}`).not.toMatch(
      /postgres(?:ql)?:\/\//i
    );
  });
});
