import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  interpretMigrateStatusOutput,
  shouldRunVercelProductionSchemaGate,
} from "@/lib/release/vercel-schema-gate.mjs";

describe("shouldRunVercelProductionSchemaGate", () => {
  it("does not run on Preview, local, or ordinary PR builds", () => {
    expect(shouldRunVercelProductionSchemaGate({})).toEqual({
      run: false,
      reason: "not-production",
    });
    expect(
      shouldRunVercelProductionSchemaGate({ VERCEL_ENV: "preview" })
    ).toEqual({ run: false, reason: "not-production" });
    expect(
      shouldRunVercelProductionSchemaGate({ VERCEL_ENV: "development" })
    ).toEqual({ run: false, reason: "not-production" });
  });

  it("runs only on Vercel production unless explicitly skipped", () => {
    expect(
      shouldRunVercelProductionSchemaGate({ VERCEL_ENV: "production" })
    ).toEqual({ run: true, reason: "production" });
    expect(
      shouldRunVercelProductionSchemaGate({
        VERCEL_ENV: "production",
        SKIP_PRODUCTION_SCHEMA_GATE: "1",
      })
    ).toEqual({ run: false, reason: "skipped" });
  });
});

describe("interpretMigrateStatusOutput", () => {
  it("detects pending and up-to-date Prisma status text", () => {
    expect(
      interpretMigrateStatusOutput(
        "Following migration have not yet been applied:\n  20260919140000_add_clinic_typeface"
      )
    ).toBe("pending");
    expect(interpretMigrateStatusOutput("Database schema is up to date!")).toBe(
      "up-to-date"
    );
    expect(interpretMigrateStatusOutput("something else")).toBe("unrecognized");
  });
});

describe("vercel production schema gate script", () => {
  it("is a no-op when VERCEL_ENV is not production", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/vercel-production-schema-gate.mjs"],
      {
        encoding: "utf8",
        env: { ...process.env, VERCEL_ENV: "preview" },
      }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it("does not invoke migrate deploy, seed, or db push", () => {
    const source = readFileSync(
      "scripts/vercel-production-schema-gate.mjs",
      "utf8"
    );
    expect(source).toContain(
      'const args = ["migrate", "status", "--config", "prisma.config.ts"]'
    );
    expect(source).toContain('spawnSync("pnpm", ["exec", "prisma", ...args]');
    expect(source).not.toMatch(/\["migrate", "deploy"/);
    expect(source).not.toMatch(/\["db", "push"\]/);
    expect(source).not.toMatch(/\["db", "seed"\]/);
    expect(source).toContain("This build does not run migrate deploy");
  });
});

describe("package release-safety scripts", () => {
  it("wires the production schema gate into build without auto-migrate", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.build).toContain(
      "node scripts/vercel-production-schema-gate.mjs"
    );
    expect(pkg.scripts.build).not.toMatch(/migrate deploy/);
    expect(pkg.scripts.build).not.toMatch(/db push/);
    expect(pkg.scripts.build).not.toMatch(/db seed/);
    expect(pkg.scripts["prod:db:status"]).toBe(
      "node scripts/prod-db.mjs status"
    );
    expect(pkg.scripts["prod:db:migrate"]).toBe(
      "node scripts/prod-db.mjs migrate"
    );
    expect(pkg.scripts["prod:db:verify"]).toBe(
      "node scripts/prod-db.mjs verify"
    );
    expect(pkg.scripts["release:check"]).toBe("node scripts/release-check.mjs");
    expect(pkg.scripts["db:seed"]).toContain("prisma db seed");
    expect(pkg.scripts["prod:db:migrate"]).not.toContain("seed");
  });
});
